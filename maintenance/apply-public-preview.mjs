export function applyPublicPreview(index,uiModule,source){
 const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)},once=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Public preview source changed: '+before.slice(0,90));return text.replace(before,()=>after);},scope=(text,name,change)=>{const a=text.indexOf('function '+name+'(');let b=text.indexOf('function ',a+name.length+10);if(b<0)b=text.length;if(text.slice(b-6,b)==='async ')b-=6;if(a<0)throw Error('Missing '+name);return text.slice(0,a)+change(text.slice(a,b))+text.slice(b);};
 if(index.includes('function publicPreviewResponse('))throw Error('Already applied');
 index=scope(index,'legacyPlayRead',body=>{body=once(body,"const previewOnly = url.searchParams.get('preview') === '1';","const previewOnly = url.searchParams.get('preview') === '1' || !userId(sql,request);");return once(body,"  if (!viewer) return fail('err.loginRequired',401);\n",'');});
 index=scope(index,'readingPlayRead',body=>{
 body=once(body,"if(url.searchParams.get('preview')!=='1'&&Number(product.allow_play)!==1)return fail('err.play.forbidden',403);",'');
 body=once(body,"if(!viewer)return fail('err.loginRequired',401);const previewOnly=url.searchParams.get('preview')==='1',level=","const previewOnly=url.searchParams.get('preview')==='1'||!viewer; if(!previewOnly&&Number(product.allow_play)!==1)return fail('err.play.forbidden',403);const level=");return body;
 });
 index=scope(index,'readingTextPreview',body=>once(body,"if(!viewer)return fail('err.loginRequired',401);",''));
 index=scope(index,'richPreviewAsset',body=>once(body,"if(!viewer)return fail('err.loginRequired',401);",''));
 index=scope(index,'playWrite',body=>{
 body=once(body,'  const op = typeof body.op === "string" ? body.op : "";','  if(body.preview===true||new URL(request.url).searchParams.get("preview")==="1")return fail("err.play.forbidden",403);\n  const op = typeof body.op === "string" ? body.op : "";');return once(body,'if (body.op !== "progress" && level !== "full")','if (level !== "full")');
 });
 for(const [name,args]of [['readingTextPreview','sql,request,env'],['richPreviewAsset','sql,request,env'],['playRead','sql, request']])index=once(index,'return '+name+'('+args+');','return publicPreviewResponse(await '+name+'('+args+'));');
 index=scope(index,'snapshot',body=>once(body,'SELECT * FROM play_progress WHERE user_id = ? ORDER BY updated_at DESC',"SELECT pp.* FROM play_progress pp JOIN products p ON p.id=pp.product_id WHERE pp.user_id = ? AND p.allow_play=1 AND p.play_format<>'' AND (p.creator_id=(SELECT handle FROM users WHERE id=pp.user_id) OR EXISTS(SELECT 1 FROM purchases b WHERE b.user_id=pp.user_id AND b.product_id=pp.product_id)) ORDER BY pp.updated_at DESC"));
 index+='\n'+source.server;
 const marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1,appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/);if(!appMatch||!cssMatch)throw Error('UI changed');const assets=JSON.parse(uiModule.slice(begin,end)),oldApp=JSON.parse(appMatch[1]),oldCss=JSON.parse(cssMatch[1]);let app=assets[oldApp].body;
 app=scope(app,'Wd',body=>{
 body=once(body,'if(!N.current){const O=Co();hr(O)?window.location.replace(O):j(O,{replace:!0});return}','');
 body=once(body,'{credentials:"same-origin"}).then(async O=>','{credentials:"same-origin",cache:"no-store"}).then(async O=>');
 body=once(body,'!d||h&&!k&&!x','!d||!k&&!x');
 body=once(body,'C=h?.playlists.find(te=>te.id===M)','C=!k?.preview&&h?.playlists.find(te=>te.id===M)');
 body=once(body,'G=((a=h?.playProgress.find(te=>te.productId===k.id))==null?void 0:a.cursor)??"0",P=te=>m(k.id,te)','G=k.preview?"0":((a=h?.playProgress.find(te=>te.productId===k.id))==null?void 0:a.cursor)??"0",P=te=>{if(h&&!k.preview)void m(k.id,te);}');
 return body;
 });
 app=scope(app,'By',body=>once(body,"credentials:'same-origin',signal:abort.signal","credentials:'same-origin',cache:'no-store',signal:abort.signal"));
 app=scope(app,'ShopProductShare',()=>source.share);
 app=scope(app,'ap',body=>once(body,'n.jsx("span",{"aria-hidden":!0,children:b?"\\u2605":"\\u2606"})','n.jsx("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:b?"currentColor":"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true,children:n.jsx("path",{d:"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"})})'));
 const css=assets[oldCss].body+'\n'+source.css,appPath='/api/ui/app-'+hash(app)+'.mjs',cssPath='/api/ui/style-'+hash(css)+'.css';for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==oldApp)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==oldCss)delete assets[path];}assets[appPath]={...assets[oldApp],body:app};assets[cssPath]={...assets[oldCss],body:css};uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],()=> 'export const UI_APP_PATH='+JSON.stringify(appPath)+';').replace(cssMatch[0],()=> 'export const UI_CSS_PATH='+JSON.stringify(cssPath)+';');return{index,uiModule,app,css,appPath,cssPath};
}

export function polishPublicPreviewShare(index,uiModule,source){
 const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)},marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1,match=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),css=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),assets=JSON.parse(uiModule.slice(begin,end)),old=JSON.parse(match[1]);let app=assets[old].body;
 const a=app.indexOf('function ShopProductShare('),b=app.indexOf('function ',a+30);if(a<0||b<0||!app.slice(a,b).includes("const copy=async()=>{try{")||app.slice(a,b).includes('clipboard timeout'))throw Error('Unexpected share source');app=app.slice(0,a)+source.share+app.slice(b);
 const appPath='/api/ui/app-'+hash(app)+'.mjs';for(const path of Object.keys(assets))if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==old)delete assets[path];assets[appPath]={...assets[old],body:app};uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(match[0],()=> 'export const UI_APP_PATH='+JSON.stringify(appPath)+';');return{index,uiModule,app,appPath,cssPath:JSON.parse(css[1])};
}
