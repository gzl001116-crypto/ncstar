export function applyUsdMoneyUpdate(index,uiModule,source,initialPrices) {
  const once=(value,before,after)=>{if(!value.includes(before)||value.indexOf(before)!==value.lastIndexOf(before))throw Error('Production source changed: '+before.slice(0,90));return value.replace(before,after);};
  const between=(value,start,finish,replacement)=>{const a=value.indexOf(start),b=value.indexOf(finish,a+start.length);if(a<0||b<0)throw Error('Missing production boundary: '+start);return value.slice(0,a)+replacement+value.slice(b);};
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return(h>>>0).toString(16);};
  const expressionEnd=(value,start)=>{let depth=0,quote='',escaped=false;for(let i=value.indexOf('(',start);i<value.length;i++){const c=value[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='(')depth++;if(c===')'&&--depth===0)return i+1;}throw Error('Unclosed expression');};
  if(index.includes('function usdDashboardApi('))throw Error('USD update already applied');
  index=once(index,'Date.now() - fxRatesCache.at < 5 * 60 * 1e3','Date.now() - fxRatesCache.at < 30 * 1e3');
  index=once(index,'async function handleApp(request, sql, env, limiter2, stripeFetch = fetch) {\n  ensureSchema(sql);\n  const url = new URL(request.url);','async function handleApp(request, sql, env, limiter2, stripeFetch = fetch) {\n  ensureSchema(sql);\n  const url = new URL(request.url);\n  if(USD_MONEY_PATHS.has(url.pathname)){const moneyError=await prepareUsdMoney(sql,request,stripeFetch);if(moneyError)return moneyError;}');
  index=once(index,'return productPricesApi(sql,request,stripeFetch);','return usdPricesApi(sql,request,stripeFetch);');
  index=once(index,'return creatorFinanceApi(sql,request,stripeFetch);','return usdFinanceApi(sql,request,stripeFetch);');
  index=once(index,'return creatorDashboardApi(sql,request);','return usdDashboardApi(sql,request,stripeFetch);');
  index=once(index,'return creatorSupport(sql, request, body, stripeFetch);','return usdSupport(sql, request, body, stripeFetch);');
  index=once(index,'return desk(sql, request, env, stripeFetch);','return usdDesk(sql, request, env, stripeFetch);');
  index=between(index,'function placeOrder(', '__name(placeOrder,', 'function placeOrder(...args){return usdPlaceOrder(...args);}\n');
  index=once(index,'function snapshot(sql, viewer, rates = fxRatesCache?.rates) {','function snapshot(sql, viewer, rates = fxRatesCache?.rates) {\n  if(rates)normalizeUsdCatalog(sql,rates);');
  // After normalization, one fixed coin equals one USD accounting unit.
  const coinExpression='coinPrice: rates ? coinValue(Number(row.price), String(row.price_currency ?? "cny").toLowerCase(), rates) : void 0,';
  if(index.split(coinExpression).length!==3)throw Error('Catalog price mapping changed');
  index=index.split(coinExpression).join('coinPrice: String(row.price_currency).toLowerCase()==="usd"?Number(row.price):rates?coinValue(Number(row.price),String(row.price_currency||"cny"),rates):void 0,');
  index=once(index,'  const rates = await loadFxRates(fetchImpl);\n  if (!rates) return fail("err.pay.fx");\n  return coinCheckout(sql, viewer, payload2, idempotencyKey, rates);','  const rates = {USD:1};\n  return coinCheckout(sql, viewer, payload2, idempotencyKey, rates);');
  // Existing low-priced products retain their coin amount and remain editable.
  index=index.replaceAll('price < 1 || price > 9999','price < .01 || price > 9999');
  index+='\nconst USD_INITIAL_PRICES='+JSON.stringify(initialPrices)+';\n'+source.server;

  const appMatch=uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/),cssMatch=uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/),marker='export const UI_ASSETS=',begin=uiModule.indexOf(marker)+marker.length,end=uiModule.lastIndexOf('};')+1;
  if(!appMatch||!cssMatch||begin<marker.length||end<begin)throw Error('Embedded UI module changed');
  const assets=JSON.parse(uiModule.slice(begin,end)),appPath=JSON.parse(appMatch[1]),cssPath=JSON.parse(cssMatch[1]);let app=assets[appPath].body;
  app=between(app,'function bn(', 'function Po(', 'function bn(amount,currency="usd",locale){return n.jsx(FanstarFiat,{amount,currency,locale})}');
  app=between(app,'function Zd({product:a})','function $y(','');
  app=between(app,'function lg({children:a})', 'function cg(', '');
  app=once(app,'applyPriceQuotes:w=>u(g=>({...g,products:g.products.map($=>Object.hasOwn(w,$.id)?{...$,coinPrice:w[$.id]}:$)}))','applyPriceQuotes:(w,tiers={})=>u(g=>({...g,products:g.products.map($=>Object.hasOwn(w,$.id)?{...$,coinPrice:w[$.id],price:w[$.id],priceCurrency:"usd"}:$),tiers:g.tiers.map($=>Object.hasOwn(tiers,$.id)?{...$,coinPrice:tiers[$.id],price:tiers[$.id],priceCurrency:"usd"}:$)}))');
  const supportStart=app.indexOf('!fe&&n.jsxs("div",{className:"stack",style:{marginTop:"1rem"}');if(supportStart<0)throw Error('Creator support UI changed');const supportExpr=supportStart+5;
  app=app.slice(0,supportExpr)+'n.jsx(FanstarSupport,{creator:B},B.handle)'+app.slice(expressionEnd(app,supportExpr));
  app=once(app,'const j=(k,f)=>bn(Number(k||0),f.toLowerCase());','const j=(k,f)=>fanstarMoney(Number(k||0),f.toUpperCase());');
  app=once(app,'price:"",priceCurrency:"cny",kind:', 'price:"",priceCurrency:"usd",kind:');
  app=once(app,'defaultValue:a?.priceCurrency||"cny"','defaultValue:a?.priceCurrency||"usd"');
  let optionCount=0;app=app.replace(/children:\[\["cny",.*?\]\]\.map/g,()=>{optionCount++;return 'children:[["usd","硬币（USD 记账）"]].map';});if(optionCount!==2)throw Error('Price unit selectors changed');
  app=app.replace(/"studio.price":"[^"\\]*(?:\\.[^"\\]*)*"/g,'"studio.price":"硬币标价"');
  app=app.replaceAll('min:1,max:9999,step:.01,value:m.price','min:.01,max:9999,step:.01,value:m.price');
  app=once(app,'Number(m.price)<1||Number(m.price)>9999','Number(m.price)<.01||Number(m.price)>9999');
  app=app.replace(/"(?:\\.|[^"\\])*"/g,token=>{let text;try{text=JSON.parse(token);}catch{return token;}if(text==='计价货币')return JSON.stringify('定价单位');if(text==='30 天标价')return JSON.stringify('30 天硬币价');if(text==='原币种标价')return JSON.stringify('参考金额');if(text==='标价需要在 1 到 9999 之间。')return JSON.stringify('硬币标价需要在 0.01 到 9999 之间。');if(text.includes('法币原价固定'))return JSON.stringify('硬币价格固定，法币参考金额按最新可用汇率换算。');return token;});

  let dashboard=source.dashboard;
  dashboard=once(dashboard,"  const [currency, setCurrency] = v.useState('CNY'), [metric, setMetric] = v.useState('net');","  const quote=v.useContext(up),currency=quote.currency||'USD',setCurrency=quote.setCurrency;\n  const [metric,setMetric]=v.useState('net');");
  dashboard=once(dashboard,"const [data, setData] = v.useState(null), [error, setError] = v.useState('')","const [baseData, setData] = v.useState(null), [requestError, setError] = v.useState('')");
  const effectStart=dashboard.indexOf('  v.useEffect(() => {',dashboard.indexOf('function FanstarDashboard()'));
  const effectEnd=dashboard.indexOf('  const creator =',effectStart);
  if(effectStart<0||effectEnd<0)throw Error('Dashboard loading effect changed');
  dashboard=dashboard.slice(0,effectStart)+`  const data=baseData&&baseData.from===range.from&&baseData.to===range.to?fanstarConvertDashboard(baseData,currency,quote.rates||baseData.rates):null;
  const error=requestError||(baseData&&!data&&baseData.from===range.from?'所选币种参考汇率暂不可用，请稍后重试。':'');
  v.useEffect(()=>{
    if(!user?.isCreator)return;let active=true,pending=false;setBusy(true);setError('');
    const refresh=async()=>{if(pending)return;pending=true;try{const result=await Fe('/api/creator-dashboard?'+new URLSearchParams({from:range.from,to:range.to,currency:'USD'}));if(active){setData(result);setError('');}}catch(reason){if(active)setError(reason.message);}finally{pending=false;if(active)setBusy(false);}};
    void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);const focus=()=>{void refresh();};window.addEventListener('focus',focus);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[user?.id,range.from,range.to,revision]);
`+dashboard.slice(effectEnd);
  dashboard=dashboard.replace("children: ['记账币种'","children: ['显示币种'").replace("'aria-label': '收入统计币种'","'aria-label': '收入显示币种'").replace("(data?.currencies || [currency]).map",'FANSTAR_DISPLAY_CURRENCIES.map');
  dashboard=dashboard.replace('按 UTC 时间查看收入、订单与收入来源。','收入统一以美元记账，按 UTC 时间统计；显示币种可随时切换。');
  dashboard=dashboard.replace('统计采用订单记录的金额和币种，不进行实时汇率换算。不同记账币种分别统计；净收入为成交收入扣除平台服务费，尚未扣除银行或支付服务商的结算费用。','收入以美元记账；所选币种为按最新可用汇率换算的参考显示。净收入已扣平台服务费，结算费用以实际确认为准。');
  dashboard=dashboard.replace("data && n.jsxs(n.Fragment, { children: [","data && n.jsxs(n.Fragment, { children: [data.estimatedOrders>0&&n.jsx('p',{className:'fineprint',children:'部分早期非硬币订单按迁移时汇率折算为美元参考金额。'}),");
  app=once(app,source.dashboard,dashboard);
  app+='\n'+source.ui;
  const css=assets[cssPath].body+'\n'+source.css,nextApp='/api/ui/app-'+hash(app)+'.mjs',nextCss='/api/ui/style-'+hash(css)+'.css';
  for(const path of Object.keys(assets)){if(/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path)&&path!==appPath)delete assets[path];if(/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path)&&path!==cssPath)delete assets[path];}
  assets[nextApp]={...assets[appPath],body:app};assets[nextCss]={...assets[cssPath],body:css};
  uiModule=uiModule.slice(0,begin)+JSON.stringify(assets)+uiModule.slice(end);uiModule=uiModule.replace(appMatch[0],'export const UI_APP_PATH='+JSON.stringify(nextApp)+';').replace(cssMatch[0],'export const UI_CSS_PATH='+JSON.stringify(nextCss)+';');
  return{index,uiModule,app,appPath:nextApp,cssPath:nextCss,dashboard};
}
