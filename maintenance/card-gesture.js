function cardGestureStart(state,event){
 if(event.isPrimary===false){if(state.current)state.current.cancelled=true;return;}
 if(event.button!=null&&event.button!==0){state.current=null;return;}
 state.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,cancelled:false};
}
function cardGestureMove(state,event){
 const gesture=state.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
 if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>10)gesture.moved=true;
}
function useCardGesture(){
 const state=v.useRef(null);
 return{state,handlers:{onPointerDown:event=>cardGestureStart(state,event),onPointerMove:event=>cardGestureMove(state,event),onPointerUp:event=>cardGestureMove(state,event),onPointerCancel:()=>{if(state.current)state.current.cancelled=true;},onContextMenu:()=>{if(state.current)state.current.cancelled=true;}}};
}
function experienceCardOpen(event,to,navigate,state){
 const gesture=state?.current;if(state)state.current=null;
 if(event.defaultPrevented||(event.button!=null&&event.button!==0)||event.target?.closest?.('a,button,input,select,textarea,dialog,[role="button"],[contenteditable="true"]'))return;
 // A new tap always starts a new gesture. Old text selections elsewhere never block it.
 if(gesture&&(gesture.moved||gesture.cancelled))return;
 if(event.metaKey||event.ctrlKey){window.open(_n(to),'_blank','noopener,noreferrer');return;}
 navigate(to);
}
async function experienceFavoriteAction(context,productId){
 // A temporary failure while loading counts must not leave favorites permanently disabled.
 const data=context.ready?context.data:await context.refresh();
 return context.act(productId,'favorite',!(data.favoriteIds||[]).includes(productId));
}
