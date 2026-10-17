import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';import{protectClient}from'./protect-client.mjs';import{localeHash}from'./apply-locale.mjs';
function once(text,before,after){if(text.split(before).length!==2)throw Error('Source changed: '+before.slice(0,100));return text.replace(before,()=>after);}
function editFunction(text,name,edit){const a=text.indexOf('function '+name+'('),tail=text.slice(a+name.length+10),next=tail.search(/\n(?:async )?function /),b=next<0?text.length:a+name.length+10+next;if(a<0)throw Error('Missing '+name);return text.slice(0,a)+edit(text.slice(a,b))+text.slice(b);}
export function applyPublishShopFix(app,css){
 if(app.includes('function fanstarSeriesForm(')||app.includes('function CreatorShopControls('))throw Error('Already applied or source changed');
 if(app.split('fanstarSeriesForm(g, w)').length!==3)throw Error('Publish/edit series call sites changed');
 app=once(app,"toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})","toLocaleString(undefined,{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})");
 app=editFunction(app,'ShopSearchControls',text=>once(once(text,'  onSet\n','  onSet,\n  showSort = true\n'),"}), n.jsxs('div', {\n      className: 'catalog-sort-controls',","}), showSort && n.jsxs('div', {\n      className: 'catalog-sort-controls',"));
 app=editFunction(app,'CreatorShopShelf',text=>{
  const a=text.indexOf("children: [n.jsxs('form', {\n      className: 'creator-shop-search',"),b=text.indexOf("}), n.jsxs('div', {\n      className: 'creator-shop-result-summary',",a);if(a<0||b<0)throw Error('Shop controls changed');
  return text.slice(0,a)+"children: [n.jsx(CreatorShopControls,{settings,draft,onDraft:setDraft,onSet:set"+text.slice(b);
 });
 app+='\n'+readFileSync(new URL('publish-shop-fix-ui.js',import.meta.url),'utf8');css+='\n'+readFileSync(new URL('publish-shop-fix.css',import.meta.url),'utf8');
 return{app,css,servedApp:protectClient(app,'fanstar-publish-shop-fix.mjs')};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const[input,inputCss,out]=process.argv.slice(2),result=applyPublishShopFix(readFileSync(input,'utf8'),readFileSync(inputCss,'utf8'));for(const[key,value]of Object.entries(result))writeFileSync(out+'/'+key+(key==='css'?'.css':'.mjs'),value);console.log(Object.fromEntries(Object.entries(result).map(([key,value])=>[key,localeHash(value)])));}
