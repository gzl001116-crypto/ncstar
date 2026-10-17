import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync}from'node:fs';import{protectClient}from'./protect-client.mjs';
const runtime=readFileSync(new URL('cover-reader-link-ui.js',import.meta.url),'utf8');let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
for(const compiled of [false,true]){
 let hidden=false,selection=null,state=[],effects=[],context={On:p=>p.coverAt?'uploaded':'',window:{getSelection:()=>selection},n:{jsx:(type,props)=>({type,props})},v:{useState(initial){const i=state.length;state.push(initial);return[initial,update=>{state[i]=typeof update==='function'?update(state[i]):update;hidden=state[i]}]},useEffect:fn=>effects.push(fn),useRef:value=>({current:value})}};
 vm.createContext(context);let source=runtime+'\nthis.api={title:workCoverTitle,cover:WorkCover,toggle:useReadingProgressToggle};';if(compiled)source=protectClient(source,'cover-reader-test.mjs');vm.runInContext(source,context);const api=context.api;
 eq(api.title('长'.repeat(120)).length,100);eq(Array.from(api.title('🌟'.repeat(101))).length,100);eq(api.title('<svg onload=bad>'),'<svg onload=bad>');eq(api.title(' 标题 '),'标题');
 state=[];let tree=api.cover({product:{title:'作品名称'}});eq(tree.props.children.type,'span');eq(tree.props.children.props.children,'作品名称');eq(tree.props.className.includes('work-cover-title'),true);eq(tree.props.style.aspectRatio,'4 / 3');
 state=[];tree=api.cover({product:{title:'上传封面',coverAt:1}});eq(tree.props.children.type,'img');eq(tree.props.children.props.src,'uploaded');eq(tree.props.children.props.draggable,false);tree.props.children.props.onError();eq(hidden,true);
 state=[];hidden=false;const control=api.toggle(),h=control.handlers,event=(fields={})=>({button:0,pointerId:1,clientX:10,clientY:10,target:{closest:()=>null},currentTarget:{contains:node=>node==='inside'},...fields});
 const tap=()=>{h.onPointerDownCapture(event());h.onClick(event());};tap();eq(hidden,true);tap();eq(hidden,false);
 h.onPointerDownCapture(event());h.onPointerMoveCapture(event({clientY:80}));h.onClick(event());eq(hidden,false);tap();eq(hidden,true);
 h.onPointerDownCapture(event());h.onPointerCancelCapture();h.onClick(event());eq(hidden,true);
 for(const control of ['button','input','a','video','toolbar']){h.onPointerDownCapture(event());h.onClick(event({target:{closest:()=>control}}));eq(hidden,true);}
 selection={isCollapsed:false,anchorNode:'inside'};tap();eq(hidden,true);selection={isCollapsed:false,anchorNode:'outside'};tap();eq(hidden,false);selection=null;
 state=[];const disabled=api.toggle(false);disabled.handlers.onClick(event());eq(state[0],false);
}
if(process.argv[2]){
 const app=readFileSync(process.argv[2],'utf8'),index=readFileSync(process.argv[3],'utf8');
 function scope(name){const a=app.indexOf('function '+name+'('),tail=app.slice(a+name.length+10),b=tail.search(/\n(?:async )?function /);return app.slice(a,b<0?app.length:a+name.length+10+b);}
 for(const name of ['Lo','op']){const card=scope(name);eq(card.includes('card-primary-link'),true);eq(card.includes('experienceCardOpen'),false);eq(card.includes('cardGesture'),false);eq(card.includes('role: "link"'),false);}
 const share=scope('ShopProductShare');eq(share.includes('navigator.share'),false);eq(share.includes('shop-social-links'),false);eq(share.includes('shop-native-share'),false);eq(share.includes("className: 'shop-share-url'"),true);eq(share.includes('clipboard.writeText(url)'),true);eq(share.includes('createPortal'),true);
 eq((app.match(/n\.jsx\(WorkCover, /g)||[]).length,7);for(const name of ['ReadingImages','ReaderDocument','FanstarRichPreview','LegacyComicPager'])eq(scope(name).includes('progressToggle.handlers'),true);
 eq(scope('StudioWorkEditor').includes('maxLength: 100'),true);eq(scope('Iy').includes('[a,search]'),true);eq(app.includes("month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'"),true);
 for(const name of ['publishProduct','publishUpload','updateProduct']){const a=index.indexOf('function '+name+'('),s=index.slice(a,a+2500);eq(/const title = textOf\([^\n]+, 100\);/.test(s),true);}
 eq(index.includes('const title = textOf(body.title, 80);'),true);
}
console.log('Cover, reader, native card and link share checks passed:',checks);
