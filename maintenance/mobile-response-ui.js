// One pending destination, no timer lock on new taps. Repeated taps do not write history.
function createMobileNavigation({navigate,current,readLocation,hardNavigate,onPending=()=>{},raf=requestAnimationFrame,caf=cancelAnimationFrame,setTimer=setTimeout,clearTimer=clearTimeout}){
 let target='',frame=null,timer=null,disposed=false;
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const finish=()=>{clear();target='';onPending('');};
 const flush=()=>{
  frame=null;if(disposed||!target)return;const to=target;
  if(current()===to&&readLocation()===to){finish();return;}
  try{navigate(to);}catch{if(target===to){finish();hardNavigate(to);}return;}
  if(target!==to)return;
  clear();timer=setTimer(()=>{timer=null;if(disposed||target!==to)return;if(current()===to){finish();return;}finish();hardNavigate(to);},1200);
 };
 return{
  request(to){if(disposed||to===target)return;if(!target&&current()===to&&readLocation()===to)return;target=to;clear();onPending(to);if(frame===null)frame=raf(flush);},
  commit(path){if(target===path)finish();},
  cancel(){if(frame!==null)caf(frame);frame=null;finish();},
  dispose(){disposed=true;clear();if(frame!==null)caf(frame);frame=null;target='';}
 };
}
function ExperienceMobileDock(){
 v.useEffect(()=>mobileLayoutViewport(),[]);
 const{user}=he(),location=Ve(),navigate=$e(),community=v.useContext(qt),[pending,setPending]=v.useState(''),route=v.useRef(location.pathname),navigateRef=v.useRef(navigate),controller=v.useRef(null);
 route.current=location.pathname;navigateRef.current=navigate;
 if(!controller.current)controller.current=createMobileNavigation({navigate:to=>navigateRef.current(to),current:()=>route.current,readLocation:()=>window.location.pathname,hardNavigate:to=>window.location.assign(to),onPending:setPending});
 v.useLayoutEffect(()=>controller.current.commit(location.pathname),[location.pathname]);
 v.useEffect(()=>{const cancel=()=>controller.current.cancel();window.addEventListener('popstate',cancel);window.addEventListener('pagehide',cancel);return()=>{window.removeEventListener('popstate',cancel);window.removeEventListener('pagehide',cancel);controller.current?.dispose();};},[]);
 return n.jsx('nav',{className:'experience-mobile-dock','aria-label':fanstarTranslate('底部导航'),'aria-busy':!!pending,children:[['/explore','商品','shop'],['/following','关注','follow'],['/messages','私信','message'],[user?'/page':'/login','我的','user']].map(([to,label,icon])=>n.jsxs(q,{
  to,className:(pending?pending===to:location.pathname===to||location.pathname.startsWith(to+'/'))?'is-active':'','aria-current':location.pathname===to?'page':undefined,
  onClick:event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();controller.current.request(to);},
  children:[n.jsx(ExperienceIcon,{name:icon}),n.jsx('span',{children:fanstarTranslate(label)}),to==='/messages'&&Number(community?.data.unread)>0&&n.jsx('i',{'aria-label':fanstarTranslate('有未读私信')})]
 },to))});
}
