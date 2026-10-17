function fanstarBrowserLanguage(){
 const languages=typeof navigator==='undefined'?[]:navigator.languages?.length?navigator.languages:[navigator.language||''];
 return fanstarDetectLanguage(languages);
}
function fanstarClearLanguagePreference(){
 // Retire only the removed display-language preference; other settings stay intact.
 try{localStorage.removeItem('fanstar.language');}catch{}
 try{const secure=location.protocol==='https:'?'; Secure':'',expired='fanstar_language=; Path=/; Max-Age=0; SameSite=Lax'+secure;document.cookie=expired;if(location.hostname==='fanstar.dev'||location.hostname.endsWith('.fanstar.dev'))document.cookie=expired+'; Domain=fanstar.dev';}catch{}
}
function FanstarLanguageProvider({children}){
 const[lang,setLang]=v.useState(fanstarBrowserLanguage);
 fanstarActiveLanguage=lang;
 const value=v.useMemo(()=>Bf(lang),[lang]);
 v.useEffect(()=>{
  fanstarClearLanguagePreference();
  const sync=()=>setLang(fanstarBrowserLanguage()),visible=()=>{if(document.visibilityState==='visible')sync();};
  sync();window.addEventListener('languagechange',sync);window.addEventListener('focus',sync);window.addEventListener('pageshow',sync);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('languagechange',sync);window.removeEventListener('focus',sync);window.removeEventListener('pageshow',sync);document.removeEventListener('visibilitychange',visible);};
 },[]);
 v.useEffect(()=>{document.documentElement.lang=Of[lang];document.documentElement.dir='ltr';const meta=document.querySelector('meta[name="description"]');if(meta)meta.setAttribute('content',value.t('meta.description'));},[lang,value]);
 return n.jsx(Rd.Provider,{value,children});
}
