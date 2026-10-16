import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(!process.argv[2])throw Error('Pass a test-enabled transformed Worker module path.');
const {handleApp,ensureSchema,communityTables,normalizeUsdCatalog,usdMoneySchema,migrateUsdOrders,usdPlaceOrder,setTestRates}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new DatabaseSync(':memory:');
const sql={exec:s=>db.exec(s),run:(s,...p)=>db.prepare(s).run(...p),get:(s,...p)=>db.prepare(s).get(...p),all:(s,...p)=>db.prepare(s).all(...p),transaction:fn=>{db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}};
ensureSchema(sql);communityTables(sql);
const now=new Date().toISOString();
for(const [id,handle,name,creator]of [['owner','artist','作者甲',1],['reader','reader','作者甲',0],['other','other','另一个读者',0]]){
 sql.run('INSERT INTO users(id,name,email,password_hash,password_salt,handle,bio,is_creator,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,name,id+'@test.invalid','hash','salt',handle,'',creator,now);
 sql.run('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)',id,id,Date.now()+3600000);
}
sql.run('INSERT INTO creators VALUES(?,?,?,?,?,?,?,?)','artist','artist','作者甲','写作','未填写','','[]','2026.10');
for(const id of ['post1','post2'])sql.run('INSERT INTO posts(id,creator_id,title,excerpt,body,created_at,min_rank,cover_key)VALUES(?,?,?,?,?,?,?,?)',id,'artist','测试动态','摘要','正文',now,0,'test');
const ids=['213b528c-4173-4205-804c-f1cc9060d750','b137f2d8-f47e-440d-ba71-532e609bbda9'];
for(const [i,id]of ids.entries())sql.run('INSERT INTO products(id,creator_id,title,description,price,price_currency,kind,includes,cover_key,file_body)VALUES(?,?,?,?,?,?,?,?,?,?)',id,'artist','测试作品','',''+[1,5][i],'cny','数字作品','[]','test','12345678');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++};
let rates={USD:1,CNY:6.7,GBP:.8,EUR:.9,JPY:150,HKD:7.8,SGD:1.35,CAD:1.36,AUD:1.5},down=false;
const fx=async()=>down?new Response('unavailable',{status:503}):Response.json({result:'success',rates});
async function api(path,body,user,origin='https://fanstar.dev'){const r=await handleApp(new Request('https://fanstar.dev'+path,{method:body?'POST':'GET',headers:{...(user?{cookie:'fanstar_session='+user}:{}),...(body?{'content-type':'application/json',origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),sql,{}, {},fx);return{status:r.status,data:await r.json()}}
setTestRates(rates);
let r=await api('/api/prices');check(r.status,200);check(r.data.prices[ids[0]],.15);check(r.data.prices[ids[1]],.75);check(sql.get('SELECT price_currency FROM products WHERE id=?',ids[0]).price_currency,'usd');check(sql.get('SELECT original_price FROM usd_catalog_archive WHERE target_id=?',ids[0]).original_price,1);
rates={...rates,CNY:10};setTestRates(rates);r=await api('/api/prices');check(r.data.prices[ids[0]],.15);check(r.data.rates.CNY,10);
sql.run('UPDATE users SET coins=10 WHERE id=?','reader');
r=await api('/api/checkout',{pay:'coins',productId:ids[0],idempotencyKey:'purchase-one-key'},'reader');check(r.status,200);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,9.85);
const order=sql.get('SELECT * FROM orders WHERE kind=?','product');check(order.amount,.15);check(order.currency,'usd');check(order.usd_amount,.15);check(order.usd_fee,.01);
check((await api('/api/checkout',{pay:'coins',productId:ids[0],idempotencyKey:'purchase-one-key'},'reader')).status,200);check(sql.get('SELECT COUNT(*) AS n FROM orders').n,1);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,9.85);
const support={creatorId:'artist',amount:1.25,currency:'usd',idempotencyKey:'support-one-key'};
r=await api('/api/support',support,'reader');check(r.status,200);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,8.6);check(sql.get("SELECT COUNT(*) AS n FROM orders WHERE kind='support'").n,1);check(sql.get("SELECT amount FROM orders WHERE kind='support'").amount,1.25);check(sql.get("SELECT fee FROM orders WHERE kind='support'").fee,.1);
check((await api('/api/support',support,'reader')).status,200);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,8.6);check(sql.get("SELECT COUNT(*) AS n FROM orders WHERE kind='support'").n,1);
check((await api('/api/support',{...support,amount:2},'reader')).data.code,'err.pay.idempotency');check((await api('/api/support',{...support,idempotencyKey:'insufficient',amount:999},'reader')).data.code,'err.coin.insufficient');check((await api('/api/support',support)).status,401);check((await api('/api/support',support,'owner')).data.code,'err.product.self');check((await api('/api/support',support,'reader','https://elsewhere.invalid')).status,403);
check((await api('/api/support',{...support,amount:NaN,idempotencyKey:'invalid-amount'},'reader')).status,400);
// A provider outage must not block fixed-coin checkout or USD support.
down=true;setTestRates(null);r=await api('/api/checkout',{pay:'coins',productId:ids[1],idempotencyKey:'purchase-two-key'},'reader');check(r.status,200);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,7.85);
r=await api('/api/support',{...support,amount:.5,idempotencyKey:'support-offline-key'},'reader');check(r.status,200);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,7.35);
r=await api('/api/prices');check(r.status,200);check(r.data.fxAvailable,false);check(r.data.prices[ids[1]],.75);
// Historical coin-denominated income keeps its actual USD value as FX changes.
const today=new Date().toISOString().slice(0,10);
sql.run("INSERT INTO orders(id,user_id,kind,target_id,amount,fee,created_at,creator_id,currency,transfer_id,fiat_amount,fiat_currency,coin_amount)VALUES('history','reader','product',?,67,5.36,?,'artist','cny','',67,'cny',10)",ids[0],today+'T02:00:00Z');
r=await api('/api/creator-dashboard?from='+today+'&to='+today,null,'owner');check(r.status,200);check(r.data.baseCurrency,'USD');check(r.data.currency,'USD');check(r.data.summaryUsd.gross,12.65);check(r.data.summaryUsd.fee,1.01);check(r.data.summaryUsd.net,11.64);check(sql.get("SELECT usd_basis FROM orders WHERE id='history'").usd_basis,'coin');check(sql.get("SELECT amount FROM orders WHERE id='history'").amount,67);
down=false;setTestRates(rates);r=await api('/api/creator-dashboard?from='+today+'&to='+today+'&currency=CNY',null,'owner');check(r.data.summary.gross,126.5);check(r.data.summaryUsd.gross,12.65);
rates={...rates,CNY:8};setTestRates(rates);r=await api('/api/creator-dashboard?from='+today+'&to='+today+'&currency=CNY',null,'owner');check(r.data.summary.gross,101.2);check(r.data.summaryUsd.gross,12.65);check((await api('/api/prices')).data.prices[ids[1]],.75);
r=await api('/api/creator-finance',null,'owner');check(r.data.usd.gross,12.65);check(r.data.baseCurrency,'USD');
check((await api('/api/creator-dashboard',null,'reader')).status,403);

// Transaction failures roll back the debit and every partial support record.
const balanceBefore=sql.get('SELECT coins FROM users WHERE id=?','reader').coins,countBefore=sql.get('SELECT COUNT(*) AS n FROM orders').n;
sql.exec("CREATE TRIGGER fail_ledger BEFORE INSERT ON coin_ledger BEGIN SELECT RAISE(ABORT,'forced ledger failure'); END");
r=await api('/api/support',{...support,amount:.1,idempotencyKey:'support-forced-failure'},'reader');check(r.status,500);check(sql.get('SELECT coins FROM users WHERE id=?','reader').coins,balanceBefore);check(sql.get('SELECT COUNT(*) AS n FROM orders').n,countBefore);sql.exec('DROP TRIGGER fail_ledger');
// Earlier non-coin orders retain a documented, fixed migration conversion.
sql.run("INSERT INTO orders(id,user_id,kind,target_id,amount,fee,created_at,creator_id,currency,transfer_id,fiat_amount,fiat_currency,coin_amount)VALUES('fiat-history','reader','product',?,80,6.4,?,'artist','cny','',80,'cny',0)",ids[0],today+'T03:00:00Z');
r=await api('/api/creator-dashboard?from='+today+'&to='+today,null,'owner');check(r.data.summaryUsd.gross,22.65);check(r.data.estimatedOrders,1);rates={...rates,CNY:10};setTestRates(rates);r=await api('/api/creator-dashboard?from='+today+'&to='+today,null,'owner');check(r.data.summaryUsd.gross,22.65);
console.log(checks+' fixed-price, FX, USD accounting, support, rollback and history checks passed');
