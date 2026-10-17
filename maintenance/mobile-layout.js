// Share the measured dock height with content, floating controls and menus.
function mobileLayoutViewport(){
  const root=document.documentElement,dock=document.querySelector('.experience-mobile-dock'),viewport=window.visualViewport;
  if(!dock)return()=>{};
  let baseline=window.innerHeight,frame=0,closed=false;
  const editing=()=>{const node=document.activeElement;return !!node&&(node.tagName==='TEXTAREA'||node.isContentEditable||node.tagName==='INPUT'&&!['button','submit','reset','checkbox','radio','range','file','color','hidden'].includes(node.type));};
  const update=()=>{
    frame=0;if(closed)return;
    const height=viewport?.height||window.innerHeight,typing=editing();
    if(!typing)baseline=window.innerHeight;
    const keyboard=typing&&Math.max(window.innerHeight,baseline)-height>150;
    root.toggleAttribute('data-mobile-keyboard',keyboard);
    if(keyboard)root.setAttribute('data-mobile-keyboard','yes');
    root.style.setProperty('--mobile-visible-height',Math.round(height)+'px');
    root.style.setProperty('--mobile-dock-height',Math.ceil(dock.getBoundingClientRect().height)+'px');
  };
  const schedule=()=>{if(!closed&&!frame)frame=requestAnimationFrame(update);};
  const focus=()=>{baseline=Math.max(baseline,window.innerHeight);schedule();},rotate=()=>{baseline=window.innerHeight;schedule();};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(dock);
  window.addEventListener('resize',schedule);window.addEventListener('orientationchange',rotate);viewport?.addEventListener('resize',schedule);viewport?.addEventListener('scroll',schedule);document.addEventListener('focusin',focus);document.addEventListener('focusout',schedule);update();
  return()=>{closed=true;if(frame)cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('orientationchange',rotate);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',schedule);root.removeAttribute('data-mobile-keyboard');root.style.removeProperty('--mobile-visible-height');root.style.removeProperty('--mobile-dock-height');};
}
