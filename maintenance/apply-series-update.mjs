export function applySeriesUpdate(index,uiModule,source) {
  const once=(value,before,after)=>{if(!value.includes(before)||value.indexOf(before)!==value.lastIndexOf(before))throw Error('Production source changed: '+before.slice(0,100));return value.replace(before,after);};
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
  if(index.includes('function workSeriesTables('))throw Error('Series update already applied');
  index=once(index,'  const url = new URL(request.url);\n  if(USD_MONEY_PATHS','  workSeriesTables(sql);\n  const url = new URL(request.url);\n  if(url.pathname==="/api/work-series")return workSeriesApi(sql,request);\n  if(USD_MONEY_PATHS');
  index=once(index,'  const products = sql.all("SELECT * FROM products ORDER BY rowid DESC")','  const seriesByProduct=workSeriesMap(sql);\n  const products = sql.all("SELECT * FROM products ORDER BY rowid DESC")');
  index=once(index,'    fileSize: Number(row.file_size ?? 0)\n  }));','    fileSize: Number(row.file_size ?? 0),\n    ...(seriesByProduct.get(String(row.id))||{seriesId:"",seriesOrder:0,seriesTitle:"",seriesDescription:""})\n  }));');
  // Validate before any upload mutation; commit collection and work together after async checks.
  for(const [start,finish,body,product,toast]of [
    ['function publishProduct(','__name(publishProduct,','body','productId','toast.product'],
    ['async function publishUpload(','__name(publishUpload,','form','productId','toast.product'],
    ['async function updateProduct(','__name(updateProduct,','form','String(product.id)','toast.work'],
  ]) {
    const begin=index.indexOf(start),end=index.indexOf(finish,begin);if(begin<0||end<0)throw Error('Missing work publication boundary');let fn=index.slice(begin,end);
    const point='  const title = textOf('+body+(body==='form'?'.get("title")':'.title')+', 80);';
    fn=once(fn,point,'  const seriesPlan=workSeriesPlan(sql,request,String(mine.handle),'+body+(start.includes('updateProduct')?',String(product.id)':'')+');\n  if(seriesPlan instanceof Response)return seriesPlan;\n'+point);
    if(body==='body') {
      fn=once(fn,'  sql.run(\n    "INSERT INTO products','  const productId=id();\n  return workSeriesWrite(sql,viewer,seriesPlan,productId,()=>{\n  sql.run(\n    "INSERT INTO products');
      fn=once(fn,'    id(),\n    String(mine.handle),','    productId,\n    String(mine.handle),');
    } else fn=once(fn,'  if(staged && !attachStagedFile(sql,staged))return fail("err.file");','  return workSeriesWrite(sql,viewer,seriesPlan,'+product+',()=>{\n  if(staged && !attachStagedFile(sql,staged))return fail("err.file");');
    fn=once(fn,'  return withState(sql, viewer, "'+toast+'");','  },"'+toast+'");');
    index=index.slice(0,begin)+fn+index.slice(end);
  }
  index+='\n'+source.server;

  const appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1;
  if(!appMatch||!cssMatch||begin<marker.length||end<begin)throw Error('Embedded UI module changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),appPath=JSON.parse(appMatch[1]),cssPath=JSON.parse(cssMatch[1]);let app=assets[appPath].body;
  app=once(app,'previewBody:"",listed:!0},[m,j]','previewBody:"",listed:!0,seriesId:"",seriesTitle:"",seriesDescription:"",seriesOrder:""},[m,j]');
  app=once(app,'previewBody:y.previewBody,listed:y.listed}:b','previewBody:y.previewBody,listed:y.listed,seriesId:y.seriesId||"",seriesOrder:y.seriesOrder||""}:b');
  app=once(app,'if(my(m.tags)){f("basic")','if(m.seriesId==="__new"&&m.seriesTitle.trim().length<2){f("basic"),V("系列名称至少填写 2 个字。");return}if(m.seriesId&&m.seriesOrder!==""&&(!Number.isInteger(Number(m.seriesOrder))||Number(m.seriesOrder)<1||Number(m.seriesOrder)>1000000)){f("basic"),V("系列顺序须为 1 到 1000000 的整数。");return}if(my(m.tags)){f("basic")');
  app=once(app,'hidden:k!=="basic",className:"tw-editor-panel",children:[','hidden:k!=="basic",className:"tw-editor-panel",children:[n.jsx(FanstarSeriesField,{value:m,onChange:g,disabled:P}),');
  // Both small and staged upload paths carry the same collection fields.
  const field='g.set("priceCurrency",w.priceCurrency),';if(app.split(field).length!==3)throw Error('Work form price fields changed');
  app=app.split(field).join(field+'fanstarSeriesForm(g,w),');
  app=once(app,'if(!w.file)return N("/api/products",w);','if(!w.file)return N("/api/products",{...w,seriesCreate:w.seriesId==="__new",seriesId:w.seriesId==="__new"?"":w.seriesId,seriesTitle:w.seriesId==="__new"?w.seriesTitle:""});');
  app=once(app,'u=s.get("tab")==="posts"?"posts":"shop"','u=s.get("tab")==="series"?"series":s.get("tab")==="posts"?"posts":"shop"');
  app=once(app,'["shop",d("creator.tab.shop")],null','["shop",d("creator.tab.shop")],["series","系列作品"]');
  app=once(app,'u==="shop"&&n.jsxs("div",{className:"cards"','u==="series"&&n.jsx(FanstarSeriesShelf,{creator:B}),u==="shop"&&n.jsxs("div",{className:"cards"');
  app=once(app,'children:d?.name||a.creatorId}),n.jsxs("div",{className:"tw-work-card-bottom"','children:d?.name||a.creatorId}),n.jsx(FanstarSeriesBadge,{product:a}),n.jsxs("div",{className:"tw-work-card-bottom"');
  app=once(app,'n.jsx("h1",{children:f.title}),n.jsx(Zd,{product:f})','n.jsx("h1",{children:f.title}),n.jsx(FanstarSeriesBadge,{product:f}),n.jsx(Zd,{product:f})');
  app=once(app,'n.jsx(By,{product:f}),n.jsx(rg,{product:f})','n.jsx(By,{product:f}),n.jsx(FanstarSeriesContents,{product:f}),n.jsx(rg,{product:f})');
  app+='\n'+source.ui;
  const css=assets[cssPath].body+'\n'+source.css,nextApp='/api/ui/app-'+hash(app)+'.mjs',nextCss='/api/ui/style-'+hash(css)+'.css';
  for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==appPath)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==cssPath)delete assets[path];}
  assets[nextApp]={...assets[appPath],body:app};assets[nextCss]={...assets[cssPath],body:css};
  uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],'export const UI_APP_PATH='+JSON.stringify(nextApp)+';').replace(cssMatch[0],'export const UI_CSS_PATH='+JSON.stringify(nextCss)+';');
  return{index,uiModule,app,appPath:nextApp,cssPath:nextCss};
}
