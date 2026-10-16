export function applyReadingUpdate(index,uiModule,source){
  const once=(value,before,after)=>{if(value.split(before).length!==2)throw Error('Production source changed: '+before.slice(0,100));return value.replace(before,after);};
  const between=(value,start,end,replacement)=>{const a=value.indexOf(start),b=value.indexOf(end,a+start.length);if(a<0||b<0)throw Error('Missing source boundary: '+start);return value.slice(0,a)+replacement+value.slice(b);};
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
  if(index.includes('const READING_PREVIEW_BYTES='))throw Error('Reading update already applied');
  index=between(index,'async function validatePlayFile(','async function checkUploadedPlay(','async function validatePlayFile(...args){return validateOpenReaderFile(...args);}\n');
  index=once(index,'function richPreparePreview(sql,request,input,productId=\'\')','function baseRichPreparePreview(sql,request,input,productId=\'\')');
  index=once(index,'function richPlayRead(sql,request) {','function baseRichPlayRead(sql,request) {');
  index=once(index,'  if(request.method==="GET"&&url.pathname==="/api/preview-asset")','  if(request.method==="GET"&&url.pathname==="/api/text-preview")return readingTextPreview(sql,request,env);\n  if(request.method==="GET"&&url.pathname==="/api/preview-asset")');
  index=once(index,'Math.min(Number(row.size),1024*1024)','Math.min(Number(row.size),65536)');
  index=once(index,'let play = inferPlay(productId, filename, mime, bytes);','let play = readingStreamManifest(productId,uploaded,staged,inferPlay(productId, filename, mime, bytes));');
  index=once(index,'const play = inferPlay(String(product.id), filename, mime, bytes);','const play = readingStreamManifest(String(product.id),uploaded,staged,inferPlay(String(product.id), filename, mime, bytes));');
  index=once(index,"if(Number(row.size)>20000000)return communityJson({error:'单个预览文件最大 20 MB。'},400);","if(Number(row.size)>500000000)return communityJson({error:'单个预览文件最大 500 MB。'},400);");
  index=once(index,'if(pending>=100)','if(pending>=10000)');
  index=once(index,"if(ids.length>100||ids.some(value=>typeof value!=='string'))","if(ids.some(value=>typeof value!=='string'))");
  index=once(index,'bounded(draft.stats?.characters,100000000)','bounded(draft.stats?.characters,Number.MAX_SAFE_INTEGER)');
  index=once(index,'bounded(draft.stats?.images,100000)','bounded(draft.stats?.images,Number.MAX_SAFE_INTEGER)');
  index=once(index,'bounded(draft.stats?.duration,864000)','bounded(draft.stats?.duration,Number.MAX_SAFE_INTEGER)');
  index=once(index,"/^(image\\/(png|jpeg|gif|webp|avif|bmp)|video\\/(mp4|webm|quicktime|ogg)|audio\\/(mpeg|mp3|mp4|wav|x-wav|ogg|flac|aac|webm))$/","/^(image\\/(png|jpeg|gif|webp|avif|bmp)|video\\/(mp4|webm|quicktime|ogg)|audio\\/(mpeg|mp3|mp4|x-m4a|m4a|wav|x-wav|wave|ogg|flac|x-flac|aac|x-aac|webm|opus)|text\\/plain)$/");
  index=once(index,"const kind={comic:'image',video:'video',voice:'audio'}[check.format]","const kind={comic:'image',video:'video',voice:'audio',novel:'text'}[check.format]");
  index+='\n'+source.core+'\n'+source.server+'\nfunction richPreparePreview(...args){return readingPreparePreview(...args);}\nfunction richPlayRead(...args){return readingPlayRead(...args);}\n';

  const appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1;if(!appMatch||!cssMatch||begin<marker.length||end<begin)throw Error('Embedded UI changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),appPath=JSON.parse(appMatch[1]),cssPath=JSON.parse(cssMatch[1]);let app=assets[appPath].body;const baseDocument='/api/ui/doc-ee8943ba7032.mjs';if(!assets[baseDocument])throw Error('Base document module missing');
  const document=assets[baseDocument].body+'\n'+source.core+'\n'+source.document,documentPath='/api/ui/reading-'+hash(document)+'.mjs';assets[documentPath]={...assets[baseDocument],body:document};
  app=between(app,'async function wg(','function fanstarUtcRange(','async function wg(name,type,size,read){return validateOpenReaderFile(name,type,size,read);}\n');
  app=between(app,'function Hy(','function mr(','function Hy(props){return n.jsx(ReaderDocument,props);}\n');
  app=between(app,'function sy(','function Vd(','function sy(props){return n.jsx(ReaderNovel,props);}\n');
  app=between(app,'function sa(','function Eo(','function sa(props){return n.jsx(ReadingUpload,props);}\n');
  app=between(app,'async function richUploadMedia(','function richDecodeText(','');
  app=between(app,'async function richAnalyzeFile(','function FanstarRichPreview(','');
  app=between(app,'function FanstarRichPreview(','function FanstarPreviewEditor(','');
  app=between(app,'function FanstarPreviewEditor(','function richAppendForm(','');
  if(app.split('await Gi(g,w.file);').length!==3)throw Error('Work upload calls changed');app=app.split('await Gi(g,w.file);').join('await Gi(g,w.file,true);');
  app=once(app,'previewVersion:2,previewPercent:"30",previewDescription:"",','previewVersion:2,previewPercent:"30",previewCharacters:"",previewImages:"",previewSeconds:"",');
  app=once(app,'previewDescription:y.previewSpec?.description||"",','previewCharacters:y.previewSpec?.limits?.characters??"",previewImages:y.previewSpec?.limits?.images??"",previewSeconds:y.previewSpec?.limits?.seconds??"",');
  app=once(app,'n.jsx(sy,{text:k.novel??k.note??"",cursor:G,onCursor:P})','n.jsx(ReaderNovel,{text:k.novel??k.note??"",source:k.textSource,cursor:G,onCursor:P})');
  app=once(app,'n.jsx(Vd,{html:k.html??"",title:k.title})','n.jsx(ReaderGame,{html:k.html??"",source:k.htmlSource,title:k.title})');
  app+='\n'+source.core+'\nconst OPEN_READER_PATH='+JSON.stringify(documentPath)+';\n'+source.ui;
  const css=assets[cssPath].body+'\n'+source.css,nextApp='/api/ui/app-'+hash(app)+'.mjs',nextCss='/api/ui/style-'+hash(css)+'.css';for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==appPath)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==cssPath)delete assets[path];}
  assets[nextApp]={...assets[appPath],body:app};assets[nextCss]={...assets[cssPath],body:css};uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],'export const UI_APP_PATH='+JSON.stringify(nextApp)+';').replace(cssMatch[0],'export const UI_CSS_PATH='+JSON.stringify(nextCss)+';');return{index,uiModule,app,appPath:nextApp,cssPath:nextCss,document,documentPath};
}
