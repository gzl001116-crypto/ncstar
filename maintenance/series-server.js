// Additive collections. Work files, prices, purchases and access rules stay on products.
function workSeriesTables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS work_series(id TEXT PRIMARY KEY,creator_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS work_series_creator ON work_series(creator_id,updated_at);
    CREATE TABLE IF NOT EXISTS work_series_entries(product_id TEXT PRIMARY KEY,series_id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 1000000));
    CREATE UNIQUE INDEX IF NOT EXISTS work_series_position ON work_series_entries(series_id,position);`);
}
function workSeriesMap(sql) {
  workSeriesTables(sql);
  return new Map(sql.all(`SELECT e.product_id,e.series_id,e.position,s.title,s.description FROM work_series_entries e JOIN work_series s ON s.id=e.series_id JOIN products p ON p.id=e.product_id AND p.creator_id=s.creator_id`).map(row=>[String(row.product_id),{seriesId:String(row.series_id),seriesOrder:Number(row.position),seriesTitle:String(row.title),seriesDescription:String(row.description)}]));
}
function workSeriesPlan(sql,request,owner,input,productId='') {
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return communityJson({error:'请求来源无效。'},403);
  const get=key=>input instanceof FormData?input.get(key):input[key];
  const has=key=>input instanceof FormData?input.has(key):Object.hasOwn(input,key);
  // An older client omitting these fields must preserve the current association.
  if(!['seriesId','seriesTitle','seriesOrder','seriesCreate'].some(has))return null;
  const seriesId=String(get('seriesId')||'').trim(),title=String(get('seriesTitle')||'').trim(),description=String(get('seriesDescription')||'').trim();
  const rawOrder=String(get('seriesOrder')??'').trim(),position=rawOrder?Number(rawOrder):null;
  if(seriesId.length>80||title.length>80||description.length>2000)return communityJson({error:'系列名称最多 80 字，介绍最多 2000 字。'},400);
  if(position!==null&&(!Number.isSafeInteger(position)||position<1||position>1000000))return communityJson({error:'系列顺序须为 1 到 1000000 的整数。'},400);
  if((title||['1','true'].includes(String(get('seriesCreate'))))&&Array.from(title).length<2)return communityJson({error:'系列名称至少填写 2 个字。'},400);
  if(seriesId&&title)return communityJson({error:'请选择已有系列或新建系列。'},400);
  if(seriesId&&!sql.get('SELECT id FROM work_series WHERE id=? AND creator_id=?',seriesId,owner))return communityJson({error:'系列不存在或无权使用。'},404);
  return {owner,seriesId,title,description,position,productId};
}
function workSeriesWrite(sql,viewer,plan,productId,write,toast) {
  try {
    sql.transaction(()=>{
      let seriesId=plan?.seriesId||'',position=plan?.position;
      if(plan) {
        if(seriesId&&!sql.get('SELECT id FROM work_series WHERE id=? AND creator_id=?',seriesId,plan.owner))throw {seriesError:'系列不存在或无权使用。',status:404};
        if(plan.title) {
          // A retried publication with the same name reuses the author's collection.
          const existing=sql.get('SELECT id FROM work_series WHERE creator_id=? AND title=?',plan.owner,plan.title);
          seriesId=existing?String(existing.id):id();
          if(!existing) {const now=new Date().toISOString();sql.run('INSERT INTO work_series(id,creator_id,title,description,created_at,updated_at)VALUES(?,?,?,?,?,?)',seriesId,plan.owner,plan.title,plan.description,now,now);}
        }
        if(seriesId) {
          const previous=sql.get('SELECT * FROM work_series_entries WHERE product_id=?',productId);
          if(position===null)position=previous?.series_id===seriesId?Number(previous.position):Number(sql.get('SELECT COALESCE(MAX(position),0) AS n FROM work_series_entries WHERE series_id=?',seriesId).n)+1;
          if(position>1000000)throw {seriesError:'系列顺序已超出范围。',status:400};
          const collision=sql.get('SELECT product_id FROM work_series_entries WHERE series_id=? AND position=? AND product_id<>?',seriesId,position,productId);
          if(collision)throw {seriesError:'该系列顺序已被其他作品使用，请选择其他编号。',status:409};
        }
      }
      const result=write();
      if(result instanceof Response)throw {response:result};
      if(plan) {
        sql.run('DELETE FROM work_series_entries WHERE product_id=?',productId);
        if(seriesId) {
          sql.run('INSERT INTO work_series_entries(product_id,series_id,position)VALUES(?,?,?)',productId,seriesId,position);
          sql.run('UPDATE work_series SET updated_at=? WHERE id=?',new Date().toISOString(),seriesId);
        }
      }
    });
  } catch(error) {
    if(error.response)return error.response;
    return communityJson({error:error.seriesError||'作品保存未完成，请稍后重试。'},error.status||500);
  }
  return withState(sql,viewer,toast);
}
function workSeriesApi(sql,request) {
  workSeriesTables(sql);
  if(request.method!=='GET')return fail('err.method',405);
  const {viewer,response}=requireUser(sql,request);if(response)return response;
  const mine=sql.get('SELECT handle,is_creator FROM users WHERE id=?',viewer);
  if(Number(mine?.is_creator)!==1)return communityJson({error:'请先开通创作者工作台。'},403);
  const series=sql.all(`SELECT s.*,COUNT(p.id) AS works,COALESCE(MAX(e.position),0)+1 AS next_order FROM work_series s LEFT JOIN work_series_entries e ON e.series_id=s.id LEFT JOIN products p ON p.id=e.product_id AND p.creator_id=s.creator_id AND COALESCE(p.removed,0)=0 WHERE s.creator_id=? GROUP BY s.id ORDER BY s.updated_at DESC,s.id`,String(mine.handle));
  return communityJson({series:series.map(row=>({id:String(row.id),title:String(row.title),description:String(row.description),works:Number(row.works),nextOrder:Number(row.next_order)}))});
}
