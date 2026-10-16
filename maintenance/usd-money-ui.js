const FANSTAR_DISPLAY_CURRENCIES = ['USD','CNY','GBP','EUR','JPY','HKD','SGD','CAD','AUD'];
function fanstarPreferredCurrency() {
  try { const saved=localStorage.getItem('fanstar-display-currency'); return FANSTAR_DISPLAY_CURRENCIES.includes(saved)?saved:'USD'; } catch { return 'USD'; }
}
function lg({children}) {
  const {user,products,applyPriceQuotes}=he();
  const [currency,changeCurrency]=v.useState(fanstarPreferredCurrency);
  const [quote,setQuote]=v.useState({rates:{USD:1},error:'',loading:true,checkedAt:0});
  const signature=products.map(item=>item.id).join('|');
  const setCurrency=value=>{
    if(!FANSTAR_DISPLAY_CURRENCIES.includes(value))return;
    changeCurrency(value);try{localStorage.setItem('fanstar-display-currency',value);}catch{}
  };
  v.useEffect(()=>{
    let active=true,pending=false;
    const refresh=async()=>{if(pending)return;pending=true;try{
      const next=await Fe('/api/prices');
      if(active){applyPriceQuotes(next.prices,next.tiers);setQuote(previous=>({...next,rates:next.fxAvailable?next.rates:previous.rates,error:next.error||'',loading:false}));}
    }catch(error){if(active)setQuote(previous=>({...previous,error:error.message,loading:false}));}finally{pending=false;}};
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
    const focus=()=>{void refresh();};window.addEventListener('focus',focus);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[user?.id,signature]);
  return n.jsx(up.Provider,{value:{...quote,currency,setCurrency},children:n.jsxs(n.Fragment,{children:[
    n.jsxs('div',{className:'fs-currency-toolbar',children:[
      n.jsxs('label',{children:['显示币种',n.jsx('select',{'aria-label':'显示币种',value:currency,onChange:event=>setCurrency(event.target.value),children:FANSTAR_DISPLAY_CURRENCIES.map(code=>n.jsx('option',{value:code,children:code},code))})]}),
      n.jsx('small',{className:'muted',children:'美元记账 · 硬币价格固定'}),
      quote.error&&n.jsx('small',{className:'error',role:'status',children:quote.error}),
    ]}),children,
  ]})});
}
function FanstarFiat({amount,currency='usd',locale}) {
  const quote=v.useContext(up),from=String(currency||'usd').toUpperCase(),to=quote?.currency||'USD';
  const sourceRate=from==='USD'?1:quote?.rates?.[from],targetRate=to==='USD'?1:quote?.rates?.[to];
  if(!Number.isFinite(Number(amount))||!Number.isFinite(sourceRate)||!Number.isFinite(targetRate))return n.jsx('span',{className:'muted',children:'参考金额暂不可用'});
  const value=Number(amount)/sourceRate*targetRate;
  return n.jsx('span',{title:to+' 参考换算',children:new Intl.NumberFormat(locale||'zh-CN',{style:'currency',currency:to,minimumFractionDigits:2,maximumFractionDigits:2}).format(value)});
}
function Zd({product}) {
  const quote=v.useContext(up),coins=product.coinPrice;
  return n.jsxs('div',{className:'tw-price',children:[
    n.jsxs('p',{className:'tw-price-main',children:[n.jsx(mr,{}),n.jsx('strong',{children:Number.isFinite(coins)?coins.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—'}),n.jsx('span',{className:'tw-price-unit',children:'硬币'})]}),
    n.jsxs('p',{className:'tw-price-fiat',children:[n.jsx('span',{className:'tw-currency',children:quote.currency||'USD'}),n.jsx(FanstarFiat,{amount:coins,currency:'usd'})]}),n.jsx(cg,{}),
  ]});
}
function fanstarConvertDashboard(base,currency,rates) {
  const rate=currency==='USD'?1:rates?.[currency];
  if(!base||!Number.isFinite(rate)||rate<=0)return null;
  const convert=row=>({...row,...Object.fromEntries(['gross','fee','net','average'].filter(key=>key in row).map(key=>[key,Math.round((row[key]*rate+Number.EPSILON)*100)/100]))});
  return {...base,currency,currencies:FANSTAR_DISPLAY_CURRENCIES,summary:convert(base.summaryUsd),series:base.seriesUsd.map(convert),types:base.typesUsd.map(convert)};
}
function FanstarSupport({creator}) {
  const {user,supportCreator}=he(),navigate=$e(),quote=v.useContext(up);
  const [amount,setAmount]=v.useState('5'),[busy,setBusy]=v.useState(false),[error,setError]=v.useState(''),[status,setStatus]=v.useState('');
  const pending=v.useRef(false),coins=Number(amount),valid=Number.isFinite(coins)&&coins>=.01&&coins<=9999&&Math.abs(coins*100-Math.round(coins*100))<1e-7;
  const balance=Number(user?.coins||0),short=!!user&&valid&&Math.round(balance*100)<Math.round(coins*100);
  return n.jsxs('form',{className:'fs-support-box',onSubmit:async event=>{
    event.preventDefault();if(pending.current||!valid)return;
    if(!user){navigate('/login?next='+encodeURIComponent('/c/'+creator.handle));return;}
    if(short){setError('硬币余额不足，请先补充余额。');return;}
    pending.current=true;setBusy(true);setError('');setStatus('');
    try{const result=await supportCreator({creatorId:creator.handle,amount:coins,currency:'usd'});if(result)setError(result);else setStatus('已支持 '+coins.toFixed(2)+' 硬币，感谢你的支持。');}
    catch(reason){setError(reason?.message||'支持未完成，请重试。');}
    finally{pending.current=false;setBusy(false);}
  },children:[
    n.jsx('strong',{children:'支持创作者'}),
    n.jsxs('label',{children:['支持硬币数',n.jsx('input',{type:'number','aria-label':'支持硬币数',min:.01,max:9999,step:.01,value:amount,disabled:busy,onChange:event=>{setAmount(event.target.value);setError('');setStatus('');}})]}),
    valid&&n.jsxs('p',{className:'muted',children:['参考金额：',n.jsx(FanstarFiat,{amount:coins,currency:'usd'}),' · '+(quote.currency||'USD')]}),
    user&&n.jsx('small',{className:short?'error':'muted',children:'当前余额：'+balance.toFixed(2)+' 硬币'+(short?'，余额不足':'')}),
    n.jsx('button',{type:'submit',className:'btn btn-dark',disabled:busy||!valid||short,children:busy?'处理中…':!user?'登录后支持':short?'硬币余额不足':'使用 '+(valid?coins.toFixed(2):'—')+' 硬币支持'}),
    error&&n.jsx('p',{className:'error',role:'alert',children:error}),status&&n.jsx('p',{role:'status',children:status}),
  ]});
}
