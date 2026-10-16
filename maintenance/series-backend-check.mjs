import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {handleApp,ensureSchema,workSeriesTables,snapshot,setTestRates}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new DatabaseSync(':memory:');
const sql={exec:s=>db.exec(s),run:(s,...p)=>db.prepare(s).run(...p),get:(s,...p)=>db.prepare(s).get(...p),all:(s,...p)=>db.prepare(s).all(...p),transaction:fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}};
ensureSchema(sql);workSeriesTables(sql);workSeriesTables(sql);setTestRates({USD:1,CNY:7});
const now=new Date().toISOString();
for(const [id,creator]of [['artist',1],['second',1],['reader',0]]) {
  sql.run('INSERT INTO users(id,name,email,password_hash,password_salt,handle,bio,is_creator,created_at)VALUES(?,?,?,?,?,?,?,?,?)',id,id,id+'@test.invalid','hash','salt',id,'',creator,now);
  sql.run('INSERT INTO sessions(token,user_id,expires_at)VALUES(?,?,?)',id,id,Date.now()+3600000);
  if(creator)sql.run('INSERT INTO creators VALUES(?,?,?,?,?,?,?,?)',id,id,id,'写作','未填写','','[]','2026.10');
}
let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const base={title:'作品标题',description:'作品介绍',price:.75,priceCurrency:'usd',kind:'数字作品',fileBody:'12345678',tags:'',play:false,download:true,preview:false,previewMode:'content',previewLimit:30,previewBody:'',listed:true};
async function api(path,body,user='artist',origin='https://fanstar.dev') {
  const form=body instanceof FormData,method=body?'POST':'GET';
  const request=new Request('https://fanstar.dev'+path,{method,headers:{...(user?{cookie:'fanstar_session='+user}:{}),...(body?{origin,...(!form?{'content-type':'application/json'}:{})}:{})},...(body?{body:form?body:JSON.stringify(body)}:{})});
  const response=await handleApp(request,sql,{}, {},async()=>Response.json({result:'success',rates:{USD:1,CNY:7}}));
  return{status:response.status,data:await response.json()};
}
function form(values,file=false) {
  const result=new FormData();for(const [key,value]of Object.entries(values))result.set(key,typeof value==='boolean'?(value?'1':'0'):String(value));
  if(file)result.set('file',new File(['test archive contents'],'sample.zip',{type:'application/zip'}));return result;
}
const count=table=>Number(sql.get('SELECT COUNT(*) AS n FROM '+table).n);
check((await api('/api/work-series',null,null)).status,401);check((await api('/api/work-series',null,'reader')).status,403);
let result=await api('/api/products',{...base,seriesTitle:'旅途手记',seriesDescription:'按顺序探索城市',seriesOrder:''});check(result.status,200);check(count('work_series'),1);check(count('products'),1);
const first=result.data.products[0],seriesId=first.seriesId;check(first.seriesTitle,'旅途手记');check(first.seriesOrder,1);check(first.price,.75);check(first.priceCurrency,'usd');check(first.seriesDescription,'按顺序探索城市');
result=await api('/api/products',form({...base,title:'第二部作品',seriesId,seriesOrder:''},true));check(result.status,200);const second=result.data.products.find(item=>item.title==='第二部作品');check(second.seriesId,seriesId);check(second.seriesOrder,2);check(sql.get('SELECT file_name FROM products WHERE id=?',second.id).file_name,'sample.zip');
result=await api('/api/products',{...base,title:'第三部作品',seriesTitle:'旅途手记'});check(result.status,200);check(count('work_series'),1);check(result.data.products[0].seriesOrder,3);
result=await api('/api/work-series');check(result.data.series[0].works,3);check(result.data.series[0].nextOrder,4);check((await api('/api/work-series',null,'second')).data.series,[]);
const productsBefore=count('products');
check((await api('/api/products',{...base,seriesId},'second')).status,404);check(count('products'),productsBefore);
check((await api('/api/products',{...base,seriesId:'missing'})).status,404);
for(const position of [0,-1,1.5,1000001,'nan'])check((await api('/api/products',{...base,seriesId,seriesOrder:position})).status,400);
check((await api('/api/products',{...base,seriesTitle:'单'})).status,400);check((await api('/api/products',{...base,seriesTitle:'a'.repeat(81)})).status,400);
check((await api('/api/products',{...base,seriesId,seriesTitle:'冲突名称'})).status,400);
check((await api('/api/products',{...base,seriesId,seriesOrder:1})).status,409);check(count('products'),productsBefore);
check((await api('/api/products',{...base,seriesTitle:'全新系列'},'artist','https://elsewhere.invalid')).status,403);check(count('work_series'),1);
// An author can change the position and remove/reassign a work without replacing its file.
result=await api('/api/product',form({...base,productId:second.id,title:'调整后的第二部',seriesId,seriesOrder:8}));check(result.status,200);check(sql.get('SELECT position FROM work_series_entries WHERE product_id=?',second.id).position,8);
const fileBefore=sql.get('SELECT file_body FROM products WHERE id=?',second.id).file_body;
result=await api('/api/product',form({...base,productId:second.id,title:'兼容旧客户端'}));check(result.status,200);check(sql.get('SELECT position FROM work_series_entries WHERE product_id=?',second.id).position,8);check(sql.get('SELECT file_body FROM products WHERE id=?',second.id).file_body,fileBefore);
result=await api('/api/product',form({...base,productId:second.id,seriesId:'',seriesTitle:'',seriesOrder:''}));check(result.status,200);check(sql.get('SELECT * FROM work_series_entries WHERE product_id=?',second.id),undefined);
result=await api('/api/product',form({...base,productId:second.id,seriesTitle:'另一系列',seriesOrder:4}));check(result.status,200);check(count('work_series'),2);const secondSeries=result.data.products.find(item=>item.id===second.id).seriesId;check(secondSeries!==seriesId,true);
check((await api('/api/product',form({...base,productId:second.id,seriesId}),'second')).status,404);
// Invalid work details never leave an empty new collection behind.
check((await api('/api/products',{...base,title:'短',seriesTitle:'不应创建'})).status,400);check(count('work_series'),2);
// Collection insertion and file/product writes roll back together on failure.
sql.exec("CREATE TRIGGER fail_series_entry BEFORE INSERT ON work_series_entries BEGIN SELECT RAISE(ABORT,'forced series failure'); END");
result=await api('/api/products',{...base,title:'应当回滚',seriesTitle:'回滚系列'});check(result.status,500);check(count('products'),productsBefore);check(count('work_series'),2);
result=await api('/api/product',form({...base,productId:second.id,title:'应当回滚修改',seriesId,seriesOrder:9}));check(result.status,500);check(sql.get('SELECT title FROM products WHERE id=?',second.id).title,'作品标题');check(sql.get('SELECT series_id FROM work_series_entries WHERE product_id=?',second.id).series_id,secondSeries);sql.exec('DROP TRIGGER fail_series_entry');
// Public series use the catalog's existing visibility and ownership rules.
sql.run('UPDATE products SET listed=0 WHERE id=?',first.id);
const anonymous=snapshot(sql,'',{USD:1,CNY:7}),owner=snapshot(sql,'artist',{USD:1,CNY:7});check(anonymous.products.some(item=>item.id===first.id),false);check(owner.products.find(item=>item.id===first.id).seriesTitle,'旅途手记');
sql.run('UPDATE products SET removed=1,listed=0 WHERE id=?',second.id);check(snapshot(sql,'',{USD:1}).products.some(item=>item.id===second.id),false);
check((await api('/api/work-series')).data.series.find(item=>item.id===secondSeries).works,0);
check((await api('/api/work-series')).data.series.find(item=>item.id===secondSeries).nextOrder,5);
// Failed multipart uploads never create collections; independent work remains supported.
check((await api('/api/products',form({...base,seriesTitle:'缺失文件系列'}))).status,400);check(count('work_series'),2);
result=await api('/api/products',{...base,title:'独立作品'});check(result.status,200);check(result.data.products[0].seriesId,'');check(result.data.products[0].coinPrice,.75);
console.log(checks+' collection publication, upload, ownership, ordering, visibility and rollback checks passed');
