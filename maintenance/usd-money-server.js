const USD_MONEY_PATHS = new Set(['/api/state','/api/prices','/api/checkout','/api/support','/api/creator-dashboard','/api/creator-finance','/api/desk','/api/products','/api/product','/api/tiers']);
const USD_PRICE_WRITES = new Set(['/api/products','/api/product','/api/tiers']);
function usdRound(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function usdMoneySchema(sql) {
  sql.exec('CREATE TABLE IF NOT EXISTS usd_catalog_archive(kind TEXT NOT NULL,target_id TEXT NOT NULL,original_price REAL NOT NULL,original_currency TEXT NOT NULL,fixed_coins REAL NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(kind,target_id))');
  const columns = new Set(sql.all('PRAGMA table_info(orders)').map(row => row.name));
  for (const [name, type] of [['usd_amount','REAL'],['usd_fee','REAL'],['usd_basis',"TEXT NOT NULL DEFAULT ''"]]) {
    if (!columns.has(name)) sql.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
  }
}
function normalizeUsdCatalog(sql, rates) {
  usdMoneySchema(sql);
  for (const [kind, table] of [['product','products'],['membership','tiers']]) {
    const rows = sql.all(`SELECT id,price,price_currency FROM ${table} WHERE lower(COALESCE(price_currency,'cny'))!='usd'`);
    sql.transaction(() => {
      for (const row of rows) {
        const currency = String(row.price_currency || 'cny').toLowerCase();
        const original = sql.get('SELECT target_id FROM usd_catalog_archive WHERE kind=? AND target_id=?',kind,row.id);
        const seed = kind === 'product' && !original ? USD_INITIAL_PRICES[row.id] : null;
        const seeded = seed && Number(row.price) === seed.price && currency === seed.currency;
        const rate = rates?.[currency.toUpperCase()];
        if (!seeded && (!Number.isFinite(rate) || rate <= 0)) throw Error('汇率暂不可用，无法确认现有硬币定价。');
        const coins = seeded ? seed.coins : usdRound(Number(row.price) / rate);
        if (!Number.isFinite(coins) || coins <= 0) throw Error('商品硬币定价无效，请联系作者重新设置。');
        sql.run('INSERT OR IGNORE INTO usd_catalog_archive(kind,target_id,original_price,original_currency,fixed_coins,created_at)VALUES(?,?,?,?,?,?)',kind,row.id,Number(row.price),currency,coins,new Date().toISOString());
        sql.run(`UPDATE ${table} SET price=?,price_currency='usd' WHERE id=?`,coins,row.id);
      }
    });
  }
}
function migrateUsdOrders(sql, rates) {
  usdMoneySchema(sql);
  for (const row of sql.all('SELECT id,amount,fee,currency,coin_amount,fiat_amount,fiat_currency FROM orders WHERE usd_amount IS NULL')) {
    const currency = String(row.currency || 'cny').toUpperCase();
    let gross, basis;
    if (Number(row.coin_amount) > 0) { gross = Number(row.coin_amount); basis = 'coin'; }
    else if (currency === 'USD') { gross = Number(row.amount); basis = 'original_usd'; }
    else if (String(row.fiat_currency).toLowerCase() === 'usd' && Number(row.fiat_amount) > 0) { gross = Number(row.fiat_amount); basis = 'original_usd'; }
    else if (Number.isFinite(rates?.[currency]) && rates[currency] > 0) { gross = Number(row.amount) / rates[currency]; basis = 'migration_fx'; }
    else continue;
    const fraction = Number(row.amount) ? Number(row.fee) / Number(row.amount) : 0;
    sql.run('UPDATE orders SET usd_amount=?,usd_fee=?,usd_basis=? WHERE id=? AND usd_amount IS NULL',usdRound(gross),usdRound(gross * fraction),basis,row.id);
  }
}
async function prepareUsdMoney(sql, request, fetchImpl) {
  usdMoneySchema(sql);
  const path = new URL(request.url).pathname;
  const foreign = Number(sql.get("SELECT COUNT(*) AS n FROM products WHERE lower(COALESCE(price_currency,'cny'))!='usd'").n) + Number(sql.get("SELECT COUNT(*) AS n FROM tiers WHERE lower(COALESCE(price_currency,'cny'))!='usd'").n);
  const unknown = sql.get("SELECT id FROM orders WHERE usd_amount IS NULL AND COALESCE(coin_amount,0)<=0 AND lower(COALESCE(currency,'cny'))!='usd' LIMIT 1");
  const rates = foreign || unknown || (request.method === 'POST' && USD_PRICE_WRITES.has(path)) ? await loadFxRates(fetchImpl) : fxRatesCache?.rates;
  try { normalizeUsdCatalog(sql,rates); migrateUsdOrders(sql,rates); }
  catch (error) { return communityJson({error:error.message},503); }
  return null;
}
function usdPlaceOrder(sql, viewer, kind, targetId, amount, creatorId, currency = 'usd', rates, coinAmount = 0) {
  const fiatCurrency = currency.toLowerCase();
  const sourceRate = fiatCurrency === 'usd' ? 1 : rates?.[fiatCurrency.toUpperCase()];
  const dollars = coinAmount > 0 ? usdRound(coinAmount) : Number.isFinite(sourceRate) && sourceRate > 0 ? usdRound(amount / sourceRate) : NaN;
  if (!Number.isFinite(dollars) || dollars <= 0) throw Error('err.pay.fx');
  const fee = feeOf(dollars);
  sql.run("INSERT INTO orders(id,user_id,kind,target_id,amount,fee,created_at,creator_id,currency,transfer_id,fiat_amount,fiat_currency,coin_amount,usd_amount,usd_fee,usd_basis)VALUES(?,?,?,?,?,?,?,?,'usd','',?,?,?,?,?,'coin')",
    id(),viewer,kind,targetId,dollars,fee,new Date().toISOString(),creatorId,amount,fiatCurrency,coinAmount || dollars,dollars,fee);
}
async function usdPricesApi(sql, request, fetchImpl) {
  const rates = await loadFxRates(fetchImpl), viewer = userId(sql,request), mine = viewer ? sql.get('SELECT handle FROM users WHERE id=?',viewer) : null;
  const products = sql.all('SELECT p.id,p.price FROM products p WHERE (p.listed=1 AND p.removed=0) OR p.creator_id=? OR EXISTS(SELECT 1 FROM purchases b WHERE b.product_id=p.id AND b.user_id=?)',mine?.handle || '',viewer || '');
  const tiers = sql.all('SELECT id,price FROM tiers');
  return communityJson({prices:Object.fromEntries(products.map(row=>[row.id,Number(row.price)])),tiers:Object.fromEntries(tiers.map(row=>[row.id,Number(row.price)])),
    rates:rates || {USD:1},baseCurrency:'USD',fxAvailable:!!rates,error:rates?'':'参考汇率暂不可用；硬币价格和美元金额不受影响。',checkedAt:Date.now(),sourceAt:fxRatesCache?.sourceAt || 0,source:'ExchangeRate-API'});
}
async function usdSupport(sql, request, body, fetchImpl) {
  const {viewer,response}=requireUser(sql,request); if(response)return response;
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return fail('err.route',403);
  const creatorId=textOf(body.creatorId,80), creator=sql.get('SELECT handle FROM creators WHERE handle=?',creatorId);
  if(!creator)return fail('err.creator.missing',404);
  if(creatorId===sql.get('SELECT handle FROM users WHERE id=?',viewer)?.handle)return fail('err.product.self');
  const key=textOf(body.idempotencyKey,120);
  if(key.length<8)return fail('err.pay.idempotency');
  let coins=Number(body.coins ?? body.amount), currency=String(body.currency || 'usd').toLowerCase();
  if(body.coins===undefined && currency!=='usd') { const rates=await loadFxRates(fetchImpl); if(!rates?.[currency.toUpperCase()])return fail('err.pay.fx'); coins=coins/rates[currency.toUpperCase()]; }
  coins=usdRound(coins);
  if(!Number.isFinite(coins)||coins<.01||coins>9999)return fail('err.pay.amount');
  try {
    sql.transaction(()=>{
      const prior=sql.get('SELECT user_id,kind,target_id,coins FROM coin_transactions WHERE idempotency_key=?',key);
      if(prior){if(prior.user_id!==viewer||prior.kind!=='support'||prior.target_id!==creatorId||Math.abs(Number(prior.coins)-coins)>1e-9)throw Error('err.pay.idempotency');return;}
      const balance=usdRound(sql.get('SELECT coins FROM users WHERE id=?',viewer)?.coins || 0);
      if(Math.round(balance*100)<Math.round(coins*100))throw Error('err.coin.insufficient');
      const after=usdRound(balance-coins),transactionId=id(),at=new Date().toISOString();
      sql.run('UPDATE users SET coins=? WHERE id=? AND ROUND(coins*100)=?',after,viewer,Math.round(balance*100));
      if(usdRound(sql.get('SELECT coins FROM users WHERE id=?',viewer)?.coins)!==after)throw Error('err.coin.transaction');
      sql.run("INSERT INTO coin_transactions(id,idempotency_key,user_id,kind,target_id,coins,fiat_amount,fiat_currency,created_at)VALUES(?,?,?,'support',?,?,?,'usd',?)",transactionId,key,viewer,creatorId,coins,coins,at);
      sql.run('INSERT INTO coin_ledger(id,user_id,transaction_id,amount,balance_after,created_at)VALUES(?,?,?,?,?,?)',id(),viewer,transactionId,-coins,after,at);
      sql.run("INSERT INTO creator_supports(id,user_id,creator_id,amount,currency,coins,created_at)VALUES(?,?,?,?,'usd',?,?)",id(),viewer,creatorId,coins,coins,at);
      usdPlaceOrder(sql,viewer,'support',creatorId,coins,creatorId,'usd',{USD:1},coins);
    });
    return withState(sql,viewer,'toast.support');
  }catch(error){const code=error.message.startsWith('err.')?error.message:'err.coin.transaction';return fail(code,code==='err.coin.transaction'?500:400);}
}
function usdOwnOrderTotals(sql,handle) {
  return sql.get("SELECT SUM(o.usd_amount) AS gross,SUM(o.usd_fee) AS fee,SUM(CASE WHEN COALESCE(o.transfer_id,'')='' THEN o.usd_amount-o.usd_fee ELSE 0 END) AS pending,COUNT(CASE WHEN o.usd_amount IS NULL THEN 1 END) AS missing FROM orders o LEFT JOIN products p ON o.kind='product' AND p.id=o.target_id LEFT JOIN tiers t ON o.kind='membership' AND t.id=o.target_id WHERE COALESCE(NULLIF(o.creator_id,''),p.creator_id,t.creator_id)=?",handle);
}
async function usdDesk(sql,request,env,fetchImpl) {
  const response=await desk(sql,request,env,fetchImpl);if(!response.ok)return response;
  const viewer=userId(sql,request),mine=sql.get('SELECT handle FROM users WHERE id=?',viewer),totals=usdOwnOrderTotals(sql,mine.handle),data=await response.json();
  if(Number(totals.missing))return communityJson({error:'部分历史订单暂缺美元参考汇率，请稍后刷新。'},503);
  return json2({...data,baseCurrency:'USD',gross:usdRound(totals.gross||0),fee:usdRound(totals.fee||0),net:usdRound(Number(totals.gross||0)-Number(totals.fee||0)),pending:usdRound(totals.pending||0),orders:data.orders.map(order=>{const usd=sql.get('SELECT usd_amount,usd_fee FROM orders WHERE id=?',order.id);return{...order,fee:Number(usd?.usd_fee||0),usdAmount:Number(usd?.usd_amount||0),accountCurrency:'USD'};})});
}
async function usdFinanceApi(sql, request, fetchImpl) {
  const {viewer,response}=requireUser(sql,request);if(response)return response;
  const mine=sql.get('SELECT handle,is_creator FROM users WHERE id=?',viewer);if(!mine||Number(mine.is_creator)!==1)return fail('err.studio',403);
  sql.exec("CREATE TABLE IF NOT EXISTS creator_display_settings(user_id TEXT PRIMARY KEY,currency TEXT NOT NULL DEFAULT 'usd')");
  let currency=String(sql.get('SELECT currency FROM creator_display_settings WHERE user_id=?',viewer)?.currency || 'usd');
  if(request.method==='POST'){
    if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return fail('err.route',403);
    let body;try{body=JSON.parse(new TextDecoder().decode(await communityBody(request)));}catch{return fail('err.route');}
    if(!SUPPORTED_FIAT.has(String(body?.currency).toLowerCase()))return fail('err.price.currency');
    currency=body.currency.toLowerCase();sql.run('INSERT INTO creator_display_settings(user_id,currency)VALUES(?,?) ON CONFLICT(user_id)DO UPDATE SET currency=excluded.currency',viewer,currency);
  }else if(request.method!=='GET')return fail('err.method',405);
  const rates=await loadFxRates(fetchImpl), rate=currency==='usd'?1:rates?.[currency.toUpperCase()];
  if(!Number.isFinite(rate))return communityJson({error:'所选币种参考汇率暂不可用。'},503);
  const row=usdOwnOrderTotals(sql,mine.handle);
  if(Number(row.missing))return communityJson({error:'部分历史订单暂缺美元参考汇率，请稍后刷新。'},503);
  const usd={gross:usdRound(row.gross||0),fee:usdRound(row.fee||0),net:usdRound(Number(row.gross||0)-Number(row.fee||0)),pending:usdRound(row.pending||0)};
  return communityJson({currency:currency.toUpperCase(),baseCurrency:'USD',rate,usd,converted:Object.fromEntries(Object.entries(usd).map(([key,value])=>[key,usdRound(value*rate)])),rates:rates||{USD:1},checkedAt:Date.now()});
}
async function usdDashboardApi(sql,request,fetchImpl) {
  if(request.method!=='GET')return fail('err.method',405);
  const {viewer,response}=requireUser(sql,request);if(response)return response;
  const mine=sql.get('SELECT handle,is_creator FROM users WHERE id=?',viewer);if(!mine||Number(mine.is_creator)!==1)return fail('err.studio',403);
  const url=new URL(request.url),today=new Date().toISOString().slice(0,10),defaultFrom=new Date(today+'T00:00:00Z');defaultFrom.setUTCDate(defaultFrom.getUTCDate()-29);
  const from=url.searchParams.get('from')||defaultFrom.toISOString().slice(0,10),to=url.searchParams.get('to')||today,start=dashboardDate(from),last=dashboardDate(to),currency=(url.searchParams.get('currency')||'usd').toLowerCase();
  if(!start||!last||last<start||last-start>3660*86400000)return communityJson({error:'请选择有效日期范围，最长支持 10 年。'},400);
  if(!SUPPORTED_FIAT.has(currency))return fail('err.price.currency');
  const end=new Date(last);end.setUTCDate(end.getUTCDate()+1);const bucket=(end-start)/86400000>180?'month':'day';
  const joins="FROM orders o LEFT JOIN products p ON o.kind='product' AND p.id=o.target_id LEFT JOIN tiers t ON o.kind='membership' AND t.id=o.target_id";
  const where="WHERE COALESCE(NULLIF(o.creator_id,''),p.creator_id,t.creator_id)=? AND julianday(o.created_at)>=julianday(?) AND julianday(o.created_at)<julianday(?)",params=[mine.handle,start.toISOString(),end.toISOString()];
  const totals=sql.get(`SELECT COUNT(*) AS orders,SUM(o.usd_amount) AS gross,SUM(o.usd_fee) AS fee,COUNT(CASE WHEN o.usd_amount IS NULL THEN 1 END) AS missing,COUNT(CASE WHEN o.usd_basis='migration_fx' THEN 1 END) AS estimated ${joins} ${where}`,...params);
  if(Number(totals.missing))return communityJson({error:'部分历史订单暂缺美元参考汇率，请稍后刷新。'},503);
  const normalize=row=>({orders:Number(row?.orders||0),gross:usdRound(row?.gross||0),fee:usdRound(row?.fee||0),net:usdRound(Number(row?.gross||0)-Number(row?.fee||0))});
  const summaryUsd=normalize(totals);summaryUsd.average=summaryUsd.orders?usdRound(summaryUsd.net/summaryUsd.orders):0;
  const format=bucket==='month'?'%Y-%m':'%Y-%m-%d',rows=sql.all(`SELECT strftime('${format}',o.created_at) AS date,COUNT(*) AS orders,SUM(o.usd_amount) AS gross,SUM(o.usd_fee) AS fee ${joins} ${where} GROUP BY date ORDER BY date`,...params),byDate=new Map(rows.map(row=>[row.date,normalize(row)])),seriesUsd=[],cursor=new Date(start);
  if(bucket==='month')cursor.setUTCDate(1);
  while(cursor<end){const date=cursor.toISOString().slice(0,bucket==='month'?7:10);seriesUsd.push({date,...(byDate.get(date)||normalize(null))});if(bucket==='month')cursor.setUTCMonth(cursor.getUTCMonth()+1);else cursor.setUTCDate(cursor.getUTCDate()+1);}
  const categories=sql.all(`SELECT CASE WHEN o.kind IN ('product','membership','support') THEN o.kind ELSE 'other' END AS kind,COUNT(*) AS orders,SUM(o.usd_amount) AS gross,SUM(o.usd_fee) AS fee ${joins} ${where} GROUP BY 1`,...params),typesUsd=['product','membership','support','other'].map(kind=>({kind,...normalize(categories.find(row=>row.kind===kind))}));
  const rates=await loadFxRates(fetchImpl)||{USD:1},rate=rates[currency.toUpperCase()];if(!Number.isFinite(rate))return communityJson({error:'所选币种参考汇率暂不可用。'},503);
  const convert=row=>({...row,...Object.fromEntries(['gross','fee','net','average'].filter(key=>key in row).map(key=>[key,usdRound(row[key]*rate)]))});
  return communityJson({timezone:'UTC',from,to,bucket,baseCurrency:'USD',currency:currency.toUpperCase(),currencies:[...SUPPORTED_FIAT].map(c=>c.toUpperCase()),rates,summaryUsd,seriesUsd,typesUsd,summary:convert(summaryUsd),series:seriesUsd.map(convert),types:typesUsd.map(convert),estimatedOrders:Number(totals.estimated||0),updatedAt:new Date().toISOString()});
}
