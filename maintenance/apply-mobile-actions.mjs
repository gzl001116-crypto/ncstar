export function applyMobileActions(index,uiModule,source){
 const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)},once=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Mobile actions source changed: '+before.slice(0,90));return text.replace(before,()=>after);},scope=(text,name,change)=>{const a=text.indexOf('function '+name+'(');let b=text.indexOf('function ',a+name.length+10);if(b<0)b=text.length;if(text.slice(b-6,b)==='async ')b-=6;if(a<0)throw Error('Missing '+name);return text.slice(0,a)+change(text.slice(a,b))+text.slice(b);};
 if(index.includes('isOwnTarget'))throw Error('Already applied');
 index=scope(index,'threadsApi',body=>{
 body=once(body,'notifyCreator(sql, target.creator_id, viewer, kind === "work" ? "work-comment" : "post-comment", target.id);','notifyCreator(sql, target.creator_id, viewer, kind + (parent ? (parent.user_id === sql.get("SELECT id FROM users WHERE handle=?", target.creator_id)?.id ? "-reply" : "-thread-reply") : "-comment"), target.id);');
 return once(body,'kind === "work" ? "work-comment" : "post-comment", target.id, at, ""','kind + "-reply", target.id, at, ""');
 });
 index=scope(index,'notificationsApi',body=>{
 body=once(body,"title='';if(row.kind==='work-comment'||row.kind==='work-like')","title='',isOwnTarget=null;if(['work-comment','work-like','work-reply','work-thread-reply'].includes(row.kind))");
 body=once(body,"row.kind==='post-comment'||row.kind==='post-like'","['post-comment','post-like','post-reply','post-thread-reply'].includes(row.kind)");
 if(body.split('title=p.title;').length!==3)throw Error('Notification targets changed');body=body.replaceAll('title=p.title;','title=p.title;isOwnTarget=p.creator_id===mine?.handle;');
 return once(body,'title,href,createdAt:row.created_at','title,isOwnTarget,href,createdAt:row.created_at');
 });
 const marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1,appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/);if(!appMatch||!cssMatch)throw Error('UI changed');const assets=JSON.parse(uiModule.slice(begin,end)),oldApp=JSON.parse(appMatch[1]),oldCss=JSON.parse(cssMatch[1]);let app=assets[oldApp].body;
 app=scope(app,'Qf',body=>{
 const button='n.jsxs("button",{className:"menu-btn",type:"button","aria-label":a(d?"menu.close":"menu.open"),"aria-expanded":d,onClick:()=>h(N=>!N),children:[n.jsx("span",{}),n.jsx("span",{})]})';body=once(body,','+button,'');
 const start=body.indexOf(',d&&n.jsxs("div",{className:"mobile-panel"'),end=body.indexOf(']}),n.jsx("main"',start);if(start<0||end<0)throw Error('Mobile menu changed');body=body.slice(0,start)+body.slice(end);
 body=once(body,'[d,h]=v.useState(!1),','');body=once(body,'h(!1),b(!1)','b(!1)');body=once(body,'if(!y&&!d)return;','if(!y)return;');body=once(body,"if(!event.target.closest?.('.topbar'))h(false);",'');body=once(body,'b(false);h(false);','b(false);');body=once(body,'},[y,d]);','},[y]);');
 body=once(body,'className:"cart-link","aria-label":a("cart"),children:[a("cart"),','className:"cart-link mobile-header-bag","aria-label":"购物袋",title:"购物袋",children:[n.jsx("svg",{width:21,height:21,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.65,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true,children:n.jsx("path",{d:"M5 7h14l1 14H4L5 7ZM9 7V6a3 3 0 0 1 6 0v1"})}),n.jsx("span",{className:"header-bag-label",children:"购物袋"}),');return body;
 });
 app=scope(app,'ExperienceMobileDock',body=>once(body,"['/notifications','通知','bell'],",''));
 app=scope(app,'ExperienceNotifications',body=>{
 const a=body.indexOf('const labels='),b=body.indexOf(';return n.jsxs',a);if(a<0||b<0)throw Error('Notification labels changed');body=body.slice(0,a)+body.slice(b+1);
 body=once(body,"' '+(labels[item.kind]||'与你互动了'),item.title?'「'+item.title+'」':''","' '+mobileNotificationText(item)");return once(body,'打开通知后自动标为已读','进入通知页后自动标为已读');
 });
 app=scope(app,'ShopProductShare',()=>source.share);app+='\n'+source.ui;
 const css=assets[oldCss].body+'\n'+source.css,appPath='/api/ui/app-'+hash(app)+'.mjs',cssPath='/api/ui/style-'+hash(css)+'.css';
 for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==oldApp)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==oldCss)delete assets[path];}assets[appPath]={...assets[oldApp],body:app};assets[cssPath]={...assets[oldCss],body:css};uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],()=> 'export const UI_APP_PATH='+JSON.stringify(appPath)+';').replace(cssMatch[0],()=> 'export const UI_CSS_PATH='+JSON.stringify(cssPath)+';');return{index,uiModule,app,css,appPath,cssPath};
}
