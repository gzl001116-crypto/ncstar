import {readFileSync,writeFileSync} from 'node:fs';
import {applyPublicPreview,polishPublicPreviewShare} from './apply-public-preview.mjs';
// Generates a Cloudflare execute body containing only public maintenance code.
// The live module, private playback assets, settings and credentials never leave Cloudflare.
export function publicPreviewReleaseCode({indexHash,uiHash,nextIndexHash,appPath,cssPath,dryRun=true,polish=false}) {
  const source={share:readFileSync(new URL('public-preview-share.js',import.meta.url),'utf8'),server:readFileSync(new URL('public-preview-server.js',import.meta.url),'utf8'),css:readFileSync(new URL('public-preview.css',import.meta.url),'utf8')};
  return `async () => {
    const fingerprint=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
    const path='/accounts/'+accountId+'/workers/scripts/ncstar';
    const downloaded=await cloudflare.request({method:'GET',path});if(!downloaded.success)throw Error('Cannot read live Worker');
    const raw=downloaded.result,boundary=raw.slice(0,raw.indexOf('\\r\\n')),modules={};
    for(const part of raw.split(boundary).slice(1,-1)){const at=part.indexOf('\\r\\n\\r\\n'),name=part.slice(0,at).match(/name="([^"]+)"/)?.[1];modules[name]=part.slice(at+4).replace(/\\r\\n$/,'');}
    if(fingerprint(modules['index.js'])!==${JSON.stringify(indexHash)}||fingerprint(modules['ui-assets-v6.js'])!==${JSON.stringify(uiHash)})throw Error('Production changed since validation; refusing overwrite');
    const output=(${(polish?polishPublicPreviewShare:applyPublicPreview).toString()})(modules['index.js'],modules['ui-assets-v6.js'],${JSON.stringify(source)});
    if(fingerprint(output.index)!==${JSON.stringify(nextIndexHash)}||output.appPath!==${JSON.stringify(appPath)}||output.cssPath!==${JSON.stringify(cssPath)})throw Error('Live transform differs from validated output');
    const summary={indexHash:fingerprint(output.index),uiHash:fingerprint(output.uiModule),appPath:output.appPath,cssPath:output.cssPath};
    if(${JSON.stringify(dryRun)})return{dryRun:true,...summary};
    const settings=await cloudflare.request({method:'GET',path:path+'/settings'});if(!settings.success)throw Error('Cannot read current settings');
    const current=settings.result,metadata={main_module:'index.js',compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings.map(binding=>binding.type==='assets'?{name:binding.name,type:'assets'}:{name:binding.name,type:'inherit'}),keep_assets:true,assets:{config:{not_found_handling:'single-page-application',run_worker_first:true}},observability:current.observability,tags:current.tags||[],tail_consumers:current.tail_consumers||[],logpush:current.logpush||false};
    const token='fanstar-public-preview-'+Date.now(),parts=[];
    for(const [name,content,type]of [['metadata',JSON.stringify(metadata),'application/json'],['index.js',output.index,'application/javascript+module'],['ui-assets-v6.js',output.uiModule,'application/javascript+module']])parts.push('--'+token,'Content-Disposition: form-data; name="'+name+'"'+(name==='metadata'?'':'; filename="'+name+'"'),'Content-Type: '+type,'',content);
    parts.push('--'+token+'--','');
    const result=await cloudflare.request({method:'PUT',path,body:parts.join('\\r\\n'),contentType:'multipart/form-data; boundary='+token,rawBody:true});
    return{success:result.success,status:result.status,errors:result.errors,id:result.result?.id,etag:result.result?.etag,hasAssets:!!result.result?.has_assets,...summary};
  }`;
}
if(process.argv[2]) {
  const config=JSON.parse(readFileSync(process.argv[2],'utf8')),code=publicPreviewReleaseCode(config);
  if(process.argv[3])writeFileSync(process.argv[3],code);else process.stdout.write(code);
}
