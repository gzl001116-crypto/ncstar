export function applyMobileLayoutFix(index,uiModule,source){
  const hash=text=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)},once=(text,before,after)=>{if(text.split(before).length!==2)throw Error('Mobile layout source changed: '+before.slice(0,70));return text.replace(before,()=>after);};
  const marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1,appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/);if(!appMatch||!cssMatch)throw Error('UI module changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),oldApp=JSON.parse(appMatch[1]),oldCss=JSON.parse(cssMatch[1]);let app=assets[oldApp].body;
  if(app.includes('function mobileLayoutViewport('))throw Error('Already applied');
  app=once(app,'className:"account-btn",type:"button",onClick:()=>b(N=>!N),','className:"account-btn",type:"button","aria-label":s.name+"，账号菜单",onClick:()=>b(N=>!N),');
  app=once(app,'n.jsx("span",{children:s.name})]}),y&&','n.jsx("span",{className:"account-name",children:s.name})]}),y&&');
  app=once(app,'function ExperienceMobileDock(){const','function ExperienceMobileDock(){v.useEffect(()=>mobileLayoutViewport(),[]);const');
  app+='\n'+source.ui;
  const css=assets[oldCss].body+'\n'+source.css,appPath='/api/ui/app-'+hash(app)+'.mjs',cssPath='/api/ui/style-'+hash(css)+'.css';
  for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==oldApp)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==oldCss)delete assets[path];}
  assets[appPath]={...assets[oldApp],body:app};assets[cssPath]={...assets[oldCss],body:css};
  uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],()=> 'export const UI_APP_PATH='+JSON.stringify(appPath)+';').replace(cssMatch[0],()=> 'export const UI_CSS_PATH='+JSON.stringify(cssPath)+';');return{index,uiModule,app,css,appPath,cssPath};
}
