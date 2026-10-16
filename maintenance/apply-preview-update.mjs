export function applyPreviewUpdate(index,uiModule,source) {
  const once=(value,before,after)=>{if(value.split(before).length!==2)throw Error('Production source changed: '+before.slice(0,100));return value.replace(before,after);};
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
  if(index.includes('function richPreviewTables('))throw Error('Preview update already applied');
  index=once(index,'var SUPPORTED_FIAT',source.currencies+'\nvar SUPPORTED_FIAT');
  index=once(index,'new Set(["usd", "cny", "gbp", "eur", "jpy", "hkd", "sgd", "cad", "aud"])','new Set(Object.values(RICH_REGION_CURRENCY).map(code=>code.toLowerCase()))');
  index=once(index,'      if (!Number.isFinite(rate) || rate <= 0) return void 0;','      if (!Number.isFinite(rate) || rate <= 0) continue;');
  index=once(index,'function chosenAccess(source) {','function legacyChosenAccess(source) {');
  index=once(index,'function playRead(sql, request) {','function legacyPlayRead(sql, request) {');
  index=once(index,'  workSeriesTables(sql);\n  const url = new URL(request.url);','  workSeriesTables(sql);richPreviewTables(sql);\n  const url = new URL(request.url);\n  if(url.pathname==="/api/preview-register")return richRegisterPreview(sql,request,env);\n  if(request.method==="GET"&&url.pathname==="/api/preview-asset")return richPreviewAsset(sql,request,env);\n  if(request.method==="GET"&&url.pathname==="/api/preview-editor")return richPreviewEditor(sql,request);');
  index=once(index,'    if (url.pathname.startsWith("/api/ui/")) return uiAssetResponse(request);','    if(url.pathname==="/api/locale")return richLocaleResponse(request);\n    if (url.pathname.startsWith("/api/ui/")) return uiAssetResponse(request);');
  index=once(index,'  const seriesByProduct=workSeriesMap(sql);','  richPreviewTables(sql);\n  const seriesByProduct=workSeriesMap(sql);');
  index=once(index,'    fileSize: Number(row.file_size ?? 0),','    fileSize: Number(row.file_size ?? 0),\n    ...(viewerHandle===String(row.creator_id)?{previewSpec:richPreviewOwnSpec(sql,String(row.id))}:{}),');
  for(const [start,finish,input,productId]of [['function publishProduct(','__name(publishProduct,','body','productId'],['async function publishUpload(','__name(publishUpload,','form','productId'],['async function updateProduct(','__name(updateProduct,','form','String(product.id)']]) {
    const begin=index.indexOf(start),end=index.indexOf(finish,begin);if(begin<0||end<0)throw Error('Missing publication boundary');let fn=index.slice(begin,end);
    const price='  const price = Number('+input+(input==='body'?'.price':'.get("price")')+');';
    fn=once(fn,price,'  const priceQuote=richWorkPrice('+input+');if(priceQuote instanceof Response)return priceQuote;\n  const price=priceQuote.coins;');
    fn=fn.replace(/  const priceCurrency = currencyOf\([^\n]+\);/,'  const priceCurrency="usd";');
    const plan='  if(seriesPlan instanceof Response)return seriesPlan;';
    fn=once(fn,plan,plan+'\n  const previewPlan=richPreparePreview(sql,request,'+input+(start.includes('updateProduct')?',String(product.id)':'')+');if(previewPlan instanceof Response)return previewPlan;');
    const toast=start.includes('updateProduct')?'toast.work':'toast.product';
    fn=once(fn,'  },"'+toast+'");','  richCommitPreview(sql,'+productId+',previewPlan,'+input+');\n  },"'+toast+'");');
    index=index.slice(0,begin)+fn+index.slice(end);
  }
  index=once(index,'async function cleanupExpiredUploads(sql,env,limit=25){','async function cleanupExpiredUploads(sql,env,limit=25){await richCleanupPreviews(sql,env);');
  index=once(index,'async function scheduleUploadCleanup(storage,sql){uploadTables(sql);const next=sql.get("SELECT MIN(expires) AS time FROM large_uploads WHERE status IN (\'uploading\',\'ready\',\'invalid\')");','async function scheduleUploadCleanup(storage,sql){uploadTables(sql);richPreviewTables(sql);const next=sql.get("SELECT MIN(time) AS time FROM (SELECT expires AS time FROM large_uploads WHERE status IN (\'uploading\',\'ready\',\'invalid\') UNION ALL SELECT expires AS time FROM work_preview_assets WHERE product_id=\'\')");');
  index=once(index,'if(new URL(request.url).pathname === "/api/uploads" && response.ok)','if(["/api/uploads","/api/preview-register","/api/products","/api/product"].includes(new URL(request.url).pathname) && response.ok)');
  index+='\n'+source.server+'\nfunction chosenAccess(input){return richChosenAccess(input);}\nfunction playRead(sql,request){return richPlayRead(sql,request);}\n';

  const appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1;
  if(!appMatch||!cssMatch||begin<marker.length||end<begin)throw Error('Embedded UI module changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),appPath=JSON.parse(appMatch[1]),cssPath=JSON.parse(cssMatch[1]);let app=assets[appPath].body;
  const documentPath='/api/ui/doc-ee8943ba7032.mjs';if(!assets[documentPath])throw Error('Current document parser missing');const doc=assets[documentPath].body+'\n'+source.document,nextDoc='/api/ui/doc-preview-'+hash(doc)+'.mjs';assets[nextDoc]={...assets[documentPath],body:doc};
  app=once(app,"const FANSTAR_DISPLAY_CURRENCIES = ['USD','CNY','GBP','EUR','JPY','HKD','SGD','CAD','AUD'];",source.currencies+"\nconst FANSTAR_DISPLAY_CURRENCIES=[...new Set(Object.values(RICH_REGION_CURRENCY))];");
  const providerStart=app.indexOf('function fanstarPreferredCurrency()'),providerEnd=app.indexOf('function FanstarFiat(',providerStart);if(providerStart<0||providerEnd<0)throw Error('Quote provider changed');app=app.slice(0,providerStart)+'function lg(props){return n.jsx(richQuoteProvider,props);}\n'+app.slice(providerEnd);
  let editorStart=app.indexOf('function xg(){'),editorEnd=app.indexOf('function ',editorStart+15);if(editorStart<0||editorEnd<0)throw Error('Editor missing');let editor=app.slice(editorStart,editorEnd);
  editor=once(editor,'price:"",priceCurrency:"usd",','price:"",priceCurrency:"usd",inputPrice:"",inputCurrency:"",previewVersion:2,previewPercent:"30",previewDescription:"",');
  editor=once(editor,'previewBody:y.previewBody,listed:y.listed,','previewBody:y.previewBody,previewPercent:String(y.previewSpec?.percent||30),previewDescription:y.previewSpec?.description||"",listed:y.listed,');
  editor=once(editor,'oe.ok&&oe.format==="document"&&j(ne=>({...ne,previewMode:"content"}))','false');
  const priceLabels='n.jsxs("label",{children:["\\u6807\\u4EF7",n.jsx("input",{type:"number",min:.01,max:9999,step:.01,value:m.price,onChange:z=>g("price",z.target.value)})]}),n.jsxs("label",{children:["定价单位",n.jsx("select",{value:m.priceCurrency,onChange:z=>g("priceCurrency",z.target.value),children:[["usd","硬币（USD 记账）"]].map(([z,Y])=>n.jsx("option",{value:z,children:Y},z))})]})';
  editor=once(editor,priceLabels,'n.jsx(FanstarPriceInput,{value:m,onChange:g,disabled:P})');
  const syStart=editor.indexOf('n.jsx(Sy,{'),syEnd=editor.indexOf('}),n.jsx("div",{className:"tw-play-check',syStart);if(syStart<0||syEnd<0)throw Error('Access editor changed');editor=editor.slice(0,syStart)+'n.jsx(FanstarPreviewEditor,{value:m,onChange:g,file:x,product:y,busy:P'+editor.slice(syEnd);
  editor=once(editor,'m.previewMode==="content"&&!m.previewBody.trim()','m.previewMode==="content"&&!m.previewBody.trim()&&!m.previewMediaCount');
  const validationStart=editor.indexOf('if(m.preview&&m.previewMode==="progress"'),validationEnd=editor.indexOf('W(!0);try{',validationStart);if(validationStart<0||validationEnd<0)throw Error('Preview validation changed');editor=editor.slice(0,validationStart)+'if(m.preview&&m.previewMode==="progress"&&(!Number.isFinite(Number(m.previewPercent))||Number(m.previewPercent)<1||Number(m.previewPercent)>100)){f("file"),V("预览比例须为 1% 到 100%。");return}'+editor.slice(validationEnd);
  editor=once(editor,'const Y={...m,productId:y?.id','const previewDraft=await m.previewBuild?.();const Y={...m,...previewDraft,productId:y?.id');
  editor=once(editor,'catch{V("\\u4FDD\\u5B58\\u672A\\u5B8C\\u6210\\uFF0C\\u8BF7\\u7A0D\\u540E\\u91CD\\u8BD5\\u3002")}','catch(error){V(error?.message||"保存未完成，请稍后重试。")}');
  app=app.slice(0,editorStart)+editor+app.slice(editorEnd);
  const seriesForm='fanstarSeriesForm(g,w),';if(app.split(seriesForm).length!==3)throw Error('Work save actions changed');app=app.split(seriesForm).join(seriesForm+'richAppendForm(g,w),');
  app=once(app,'s?n.jsx(zy,{data:s})','s?n.jsx(FanstarRichPreview,{data:s})');
  const playAt=app.indexOf('k.format==="comic"&&n.jsx(ry'),playStart=app.lastIndexOf('function ',playAt),playEnd=app.indexOf('function ',playAt);if(playAt<0||playStart<0||playEnd<0)throw Error('Play page changed');let play=app.slice(playStart,playEnd);if(play.split('k.format===').length!==7)throw Error('Play renderer changed');play=play.replaceAll('k.format===','k.previewVersion!==2&&k.format===');play=once(play,'k.previewVersion!==2&&k.format==="comic"','k.previewVersion===2&&n.jsx(FanstarRichPreview,{data:k}),k.previewVersion!==2&&k.format==="comic"');app=app.slice(0,playStart)+play+app.slice(playEnd);
  app+='\nconst RICH_DOCUMENT_PATH='+JSON.stringify(nextDoc)+';\n'+source.ui;
  const css=assets[cssPath].body+'\n'+source.css,nextApp='/api/ui/app-'+hash(app)+'.mjs',nextCss='/api/ui/style-'+hash(css)+'.css';
  for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==appPath)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==cssPath)delete assets[path];}
  assets[nextApp]={...assets[appPath],body:app};assets[nextCss]={...assets[cssPath],body:css};
  uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],'export const UI_APP_PATH='+JSON.stringify(nextApp)+';').replace(cssMatch[0],'export const UI_CSS_PATH='+JSON.stringify(nextCss)+';');
  return{index,uiModule,app,appPath:nextApp,cssPath:nextCss,document:doc,documentPath:nextDoc};
}

// Guarded UI-only follow-ups keep the exact deployed backend and CSS intact.
export function applyPreviewUiRevision(index,uiModule,source) {
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
  const match=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),css=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1;
  if(!match||!css||begin<marker.length||end<begin)throw Error('Embedded UI module changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),oldPath=JSON.parse(match[1]),body=assets[oldPath].body,start=body.indexOf("function richBrowserCurrency(country='') {");
  if(start<0||body.indexOf("function richBrowserCurrency(country='') {",start+1)>=0)throw Error('Rich preview boundary changed');
  const app=body.slice(0,start)+source.ui,appPath='/api/ui/app-'+hash(app)+'.mjs';
  for(const path of Object.keys(assets))if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==oldPath)delete assets[path];
  assets[appPath]={...assets[oldPath],body:app};
  uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(match[0],'export const UI_APP_PATH='+JSON.stringify(appPath)+';');
  return{index,uiModule,app,appPath,cssPath:JSON.parse(css[1])};
}
