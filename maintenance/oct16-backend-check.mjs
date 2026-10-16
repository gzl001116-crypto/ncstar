import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if (!process.argv[2]) throw Error('Pass the path to the test-enabled production Worker module.');
const {handleApp,ensureSchema,communityTables} = await import(pathToFileURL(resolve(process.argv[2])).href);
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
for(const id of ['work1','work2'])sql.run('INSERT INTO products(id,creator_id,title,description,price,kind,includes,cover_key,file_body)VALUES(?,?,?,?,?,?,?,?,?)',id,'artist','测试作品','',5,'数字作品','[]','test','body');
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++};
async function request(path,body,user,method){const res=await handleApp(new Request('https://fanstar.dev'+path,{method:method|| (body?'POST':'GET'),headers:{...(user?{cookie:'fanstar_session='+user}:{}),...(body?{'content-type':'application/json',origin:'https://fanstar.dev'}:{})},...(body?{body:JSON.stringify(body)}:{})}),sql,{},{});return{status:res.status,data:await res.json()}}
const thread=(kind,id,body,user)=>request('/api/threads?kind='+kind+'&targetId='+id,body?{kind,targetId:id,...body}:null,user);
for(const kind of ['post','work']){
 const target=kind==='post'?'post1':'work1';
 let r=await thread(kind,target,null,'owner');check(r.data.enabled,true);check(r.data.canManage,true);
 check((await thread(kind,target,null,'reader')).data.canManage,false);
 check((await thread(kind,target,{op:'setComments',enabled:false},'reader')).status,403);
 check((await thread(kind,target,{op:'setComments',enabled:false})).status,401);
 check((await thread(kind,target,{op:'setComments',enabled:'false'},'owner')).status,400);
 r=await thread(kind,target,{op:'comment',text:'原评论'},'reader');check(r.status,200);const root=r.data.comments[0];
 r=await thread(kind,target,{op:'comment',text:'原回复',parentId:root.id},'owner');check(r.status,200);
 r=await thread(kind,target,{op:'setComments',enabled:false},'owner');check(r.status,200);check(r.data.enabled,false);check(r.data.comments.length,2);
 check((await thread(kind,target,{op:'comment',text:'关闭后新增'},'reader')).status,403);
 check((await thread(kind,target,{op:'comment',text:'关闭后回复',parentId:root.id},'owner')).status,403);
 check((await thread(kind,target)).data.enabled,false);
 const legacy=kind==='post'?'/api/comments':'/api/community';
 check((await request(legacy,{op:'comment',postId:target,productId:target,text:'旧接口绕过'},'reader')).status,403);
 ensureSchema(sql);communityTables(sql);check((await thread(kind,target)).data.enabled,false);
 check((await thread(kind,target,{op:'setComments',enabled:true},'owner')).data.enabled,true);
 check((await thread(kind,target,{op:'comment',text:'重新回复',parentId:root.id},'owner')).status,200);
 const other=kind==='post'?'post2':'work2';check((await thread(kind,other)).data.enabled,true);
}
// Recorded-currency income, complete order history, and UTC date boundaries.
let serial=0;
function order(amount,fee,at,kind='product',creator='artist',currency='cny'){
 const target=kind==='product'?'work1':kind==='membership'?'tier1':'artist';
 sql.run('INSERT INTO orders(id,user_id,kind,target_id,amount,fee,created_at,creator_id,currency,transfer_id,fiat_amount,fiat_currency,coin_amount)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)','o'+(++serial),'reader',kind,target,amount,fee,at,creator,currency,'',amount,currency,amount);
}
order(900,72,'2026-10-13T23:59:59.999Z');
order(10,1,'2026-10-14T00:00:00.000Z','product');
order(20,2,'2026-10-14T23:59:59.999Z','membership');
order(30,3,'2026-10-15T23:59:59.999Z','support');
order(800,64,'2026-10-16T00:00:00.000Z');
order(40,4,'2026-10-15T01:00:00+08:00','product'); // October 14 UTC.
order(700,56,'2026-10-14T00:30:00+08:00'); // October 13 UTC; excluded.
for(let i=0;i<50;i++)order(2,.16,'2026-10-15T12:00:00Z');
order(999,99,'2026-10-15T12:00:00Z','product','otherartist');
order(11,1,'2026-10-15T12:00:00Z','product','artist','usd');
const base='/api/creator-dashboard?from=2026-10-14&to=2026-10-15';
check((await request(base)).status,401);check((await request(base,null,'reader')).status,403);
let r=await request(base,null,'owner');check(r.status,200);check(r.data.timezone,'UTC');check(r.data.bucket,'day');check(r.data.currency,'CNY');
check(r.data.summary,{orders:54,gross:200,fee:18,net:182,average:3.37});
check(r.data.series.map(x=>[x.date,x.orders,x.gross,x.fee,x.net]),[['2026-10-14',3,70,7,63],['2026-10-15',51,130,11,119]]);
check(r.data.types.find(x=>x.kind==='product').net,137);check(r.data.types.find(x=>x.kind==='membership').net,18);check(r.data.types.find(x=>x.kind==='support').net,27);
check(r.data.currencies,['CNY','USD']);
r=await request(base+'&currency=USD',null,'owner');check(r.data.summary.net,10);check(r.data.summary.orders,1);check(r.data.series[0].net,0);
r=await request('/api/creator-dashboard?from=2026-09-01&to=2026-09-07',null,'owner');check(r.data.summary.net,0);check(r.data.series.length,7);check(r.data.series.every(x=>x.net===0),true);
r=await request('/api/creator-dashboard?from=2026-01-01&to=2026-12-31',null,'owner');check(r.data.bucket,'month');check(r.data.series.length,12);check(r.data.series[0].date,'2026-01');
for(const suffix of ['?from=2026-02-30&to=2026-10-15','?from=2026-10-16&to=2026-10-15','?from=2000-01-01&to=2026-10-15','?currency=BTC'])check((await request('/api/creator-dashboard'+suffix,null,'owner')).status,400);
check((await request('/api/creator-dashboard',{},'owner')).status,405);
console.log(checks+' permissions, comment policy, income aggregation and UTC boundary checks passed');
