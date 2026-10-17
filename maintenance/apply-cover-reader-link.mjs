import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';import{protectClient}from'./protect-client.mjs';import{localeHash}from'./apply-locale.mjs';
function once(text,before,after){if(text.split(before).length!==2)throw Error('Source changed: '+before.slice(0,100));return text.replace(before,()=>after);}
function editFunction(text,name,edit){const a=text.indexOf('function '+name+'('),tail=text.slice(a+name.length+10),next=tail.search(/\n(?:async )?function /),b=next<0?text.length:a+name.length+10+next;if(a<0||b<0)throw Error('Missing '+name);return text.slice(0,a)+edit(text.slice(a,b))+text.slice(b);}
export function applyWorkTitleLimit(index){for(const name of ['publishProduct','publishUpload','updateProduct'])index=editFunction(index,name,text=>once(text,name==='publishProduct'?'const title = textOf(body.title, 80);':'const title = textOf(form.get("title"), 80);',name==='publishProduct'?'const title = textOf(body.title, 100);':'const title = textOf(form.get("title"), 100);'));return index;}
export function applyCoverReaderLink(app,css){
 if(app.includes('function WorkCover('))throw Error('Already applied');
 const logo=readFileSync(new URL('brand-image.base64.txt',import.meta.url),'utf8').trim();if(!/^[A-Za-z0-9+/=]+$/.test(logo))throw Error('Bad logo');
 app=editFunction(app,'Fd',()=>`function Fd(){return n.jsx('img',{className:'mark brand-image',src:'data:image/jpeg;base64,${logo}',alt:'',draggable:false});}`);
 app=once(app,'n.jsx("span", {\n            className: "play-mark",\n            children: "\\u25B6"\n          })','n.jsx(Fd,{})');
 let covers=0;app=app.replace(/n\.jsx\(Et, \{\s*id: ([^,\n]+)\.coverKey,\s*src: On\(\1\),/g,(_,product)=>{covers++;return'n.jsx(WorkCover, {product: '+product+',';});if(covers!==7)throw Error('Unexpected work cover count: '+covers);
 app=once(app,"name: 'title',\n              required: true,\n              minLength: 2,\n              maxLength: 80,","name: 'title',\n              required: true,\n              minLength: 2,\n              maxLength: 100,");
 app=once(app,"dateTime: item.createdAt,\n          children: new Date(item.createdAt).toLocaleString('zh-CN')","dateTime: item.createdAt, title:new Date(item.createdAt).toLocaleString(),\n          children: new Date(item.createdAt).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})");
 for(const name of ['Lo','op'])app=editFunction(app,name,text=>{text=once(text,'  const cardGesture=useCardGesture();\n  const navigateExperience = $e();\n','');const a=text.indexOf('    ...cardGesture.handlers,'),b=text.indexOf('    children:',a);if(a<0||b<0)throw Error('Missing card handlers');text=text.slice(0,a)+text.slice(b);return once(text,'className: "'+(name==='Lo'?'tw-work-card-cover':'tw-creator-card-head')+'",','className: "'+(name==='Lo'?'tw-work-card-cover':'tw-creator-card-head')+' card-primary-link",');});
 for(const name of ['cardGestureStart','cardGestureMove','useCardGesture','experienceCardOpen'])app=editFunction(app,name,()=>'');
 app=editFunction(app,'Iy',text=>once(once(text,'pathname: a','pathname: a, search: search'),'  }, [a]), null;','  }, [a,search]), null;'));
 app=editFunction(app,'ShopProductShare',text=>{
  text=once(text,"    [busy, setBusy] = v.useState(false),\n",'');
  const a=text.indexOf('    {\n      url,');const b=text.indexOf('\n  v.useEffect',a);if(a<0||b<0)throw Error('Missing share data');text=text.slice(0,a)+"    {url}=shopSocialLinks(product);"+text.slice(b);
  const start=text.indexOf('    },\n    share = async () => {'),end=text.indexOf("\n  return n.jsxs('span'",start);if(start<0||end<0)throw Error('Missing native share');text=text.slice(0,start)+'    };'+text.slice(end);
  const copyStart=text.indexOf('  const copy = async () => {'),copyEnd=text.indexOf("\n  return n.jsxs('span'",copyStart);if(copyStart<0||copyEnd<0)throw Error('Missing copy action');text=text.slice(0,copyStart)+`  const copy=async()=>{setStatus(fanstarTranslate('正在复制链接…'));try{await copyWorkShareLink(url,input.current);setStatus(fanstarTranslate('链接已复制'));}catch{setStatus(fanstarTranslate('请长按上方链接，选择复制。'));}};`+text.slice(copyEnd);
  text=once(text,'        if (mobileShareData(url, title)) void share();\n','');
  text=once(text,'children: fanstarTranslate("\\u5206\\u4EAB\\u5230")','children: fanstarTranslate("分享链接")');
  const extra=text.indexOf("}), n.jsx('p', {\n          className: 'shop-share-title',"),copy=text.indexOf("}), n.jsxs('div', {\n          className: 'shop-share-copy',",extra);if(extra<0||copy<0)throw Error('Missing social choices');text=text.slice(0,extra)+text.slice(copy);return text;
 });
 for(const name of ['ReadingImages','ReaderDocument','FanstarRichPreview'])app=editFunction(app,name,text=>{
  const anchor=name==='ReadingImages'?"  const picture = previewPicturePosition(pages, index);":"  return n.jsxs('section', {";
  text=once(text,anchor,"  const progressToggle=useReadingProgressToggle();\n"+anchor);
  const original=name==='ReadingImages'?"className: 'reading-images reading-mode-' + mode,":name==='ReaderDocument'?"className: 'tw-document-viewer reading-document reading-mode-' + mode,":"className: 'experience-preview',";
  return once(text,original,original.slice(0,-1)+"+(progressToggle.hidden?' reader-progress-hidden':''),\n    ...progressToggle.handlers,");
 });
 app=editFunction(app,'LegacyComicPager',text=>once(once(text,'  const picture = previewPicturePosition(a, d);','  const progressToggle=useReadingProgressToggle(!minimal);\n  const picture = previewPicturePosition(a, d);'),'    className: "reader",','    className: "reader"+(progressToggle.hidden?" reader-progress-hidden":""),\n    ...progressToggle.handlers,'));
 app+='\n'+readFileSync(new URL('cover-reader-link-ui.js',import.meta.url),'utf8');css+='\n'+readFileSync(new URL('cover-reader-link.css',import.meta.url),'utf8');
 return{app,css,servedApp:protectClient(app,'fanstar-cover-reader-link.mjs')};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const[input,inputCss,indexPath,out]=process.argv.slice(2),result=applyCoverReaderLink(readFileSync(input,'utf8'),readFileSync(inputCss,'utf8'));result.index=applyWorkTitleLimit(readFileSync(indexPath,'utf8'));for(const[key,value]of Object.entries(result))writeFileSync(out+'/'+key+(key==='css'?'.css':'.mjs'),value);console.log(Object.fromEntries(Object.entries(result).map(([key,value])=>[key,localeHash(value)])));}
