function workCoverTitle(value){return Array.from(String(value||'').trim()).slice(0,100).join('');}
function WorkCover({product,ratio='4 / 3',className=''}){
 const source=On(product),[failed,setFailed]=v.useState(false),title=workCoverTitle(product.title);
 v.useEffect(()=>setFailed(false),[source]);
 return n.jsx('div',{className:'cover work-cover '+(!source||failed?'work-cover-title ':'')+className,
  style:!source||failed?{aspectRatio:'4 / 3','--cover-title-size':title.length>60?'5.4cqi':title.length>30?'6.5cqi':'10cqi'}:undefined,
  children:source&&!failed?n.jsx('img',{src:source,alt:title,loading:'lazy',decoding:'async',draggable:false,onError:()=>setFailed(true)}):n.jsx('span',{className:'work-cover-name',children:title})});
}
function useReadingProgressToggle(enabled=true){
 const[hidden,setHidden]=v.useState(false),gesture=v.useRef(null);
 return{hidden,handlers:{
  onPointerDownCapture:event=>{gesture.current={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false,cancelled:event.isPrimary===false};},
  onPointerMoveCapture:event=>{const g=gesture.current;if(g&&g.id===event.pointerId&&Math.hypot(event.clientX-g.x,event.clientY-g.y)>12)g.moved=true;},
  onPointerCancelCapture:()=>{if(gesture.current)gesture.current.cancelled=true;},
  onClick:event=>{
   const g=gesture.current;gesture.current=null;
   if(!enabled||event.defaultPrevented||event.button>0||g&&(g.moved||g.cancelled))return;
   if(event.target?.closest?.('a,button,input,select,textarea,video,audio,[role="button"],.reading-mode-toolbar,.reading-progress-line,.reader-tools'))return;
   const selection=window.getSelection?.();if(selection&&!selection.isCollapsed&&event.currentTarget.contains(selection.anchorNode))return;
   setHidden(value=>!value);
  }
 }};
}
