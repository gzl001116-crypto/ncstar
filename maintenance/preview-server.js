function richPreviewTables(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS work_preview_specs(product_id TEXT PRIMARY KEY,spec TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_preview_assets(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,product_id TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL,mime TEXT NOT NULL,name TEXT NOT NULL,size INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS work_preview_assets_product ON work_preview_assets(product_id);`);
}
function richPreviewSpec(sql,productId) {
  try{return JSON.parse(sql.get('SELECT spec FROM work_preview_specs WHERE product_id=?',productId)?.spec||'null');}catch{return null;}
}
function richPreviewOwnSpec(sql,productId) {
  const spec=richPreviewSpec(sql,productId);if(!spec)return null;
  return {...spec,media:(spec.media||[]).map(item=>({...item,url:'/api/preview-asset?id='+encodeURIComponent(item.id)}))};
}
function richLocaleResponse(request) {
  const languages=(new URL(request.url).searchParams.get('languages')||request.headers.get('accept-language')||'').split(',').map(value=>value.split(';')[0].trim()).slice(0,12),region=richLanguageRegion(languages),country=String(request.cf?.country||'').toUpperCase();
  return communityJson({country:country||null,currency:RICH_REGION_CURRENCY[region||country]||'USD',source:region?'browser':'ip'});
}
function richWorkPrice(input) {
  const entered=fieldOf(input,'inputPrice'),code=String((entered!==undefined&&entered!==''?fieldOf(input,'inputCurrency'):null)||fieldOf(input,'priceCurrency')||'usd').toLowerCase();
  const amount=entered!==undefined&&entered!==''?Number(entered):Number(fieldOf(input,'price'));
  if(!SUPPORTED_FIAT.has(code))return communityJson({error:'不支持该标价币种。'},400);
  const rate=code==='usd'?1:fxRatesCache?.rates?.[code.toUpperCase()];
  if(!Number.isFinite(rate)||rate<=0)return communityJson({error:'所选币种汇率暂不可用，请稍后重试。'},503);
  const coins=usdRound(amount/rate);
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(coins)||coins<.01||coins>9999)return communityJson({error:'换算后的硬币价格须为 0.01 到 9999。'},400);
  if(entered!==undefined&&entered!==''&&Math.abs(Number(fieldOf(input,'price'))-coins)>.001)return communityJson({error:'参考汇率已更新，请核对最新硬币价格后重新保存。'},409);
  return {coins};
}
function richChosenAccess(input) {
  if(String(fieldOf(input,'previewVersion'))!=='2')return legacyChosenAccess(input);
  const play=flagOn(fieldOf(input,'play')),download=flagOn(fieldOf(input,'download')),preview=flagOn(fieldOf(input,'preview'));
  if(!play&&!download)return {code:'err.open'};
  if(preview&&!play)return {code:'err.preview.play'};
  if(!preview)return {allowPlay:play?1:0,allowDownload:download?1:0,allowPreview:0,previewMode:'',previewLimit:0,previewBody:''};
  const mode=String(fieldOf(input,'previewMode')||''),percent=Number(fieldOf(input,'previewPercent'));
  if(!['content','progress'].includes(mode))return {code:'err.preview'};
  if(mode==='progress'&&(!Number.isFinite(percent)||percent<1||percent>100))return {code:'err.preview.limit'};
  return {allowPlay:1,allowDownload:download?1:0,allowPreview:1,previewMode:mode,previewLimit:mode==='progress'?percent:0,previewBody:textOf(fieldOf(input,'previewBody'),100000)};
}
function richPreparePreview(sql,request,input,productId='') {
  if(String(fieldOf(input,'previewVersion'))!=='2')return undefined;
  if(!flagOn(fieldOf(input,'preview')))return null;
  const viewer=userId(sql,request),mode=String(fieldOf(input,'previewMode')),percent=mode==='progress'?Number(fieldOf(input,'previewPercent')):0;
  if(!['content','progress'].includes(mode)||mode==='progress'&&(!Number.isFinite(percent)||percent<1||percent>100))return communityJson({error:'预览比例须为 1% 到 100%。'},400);
  let draft;try{const raw=fieldOf(input,'previewDraft');if(typeof raw==='string'&&raw.length>350000)throw Error();draft=typeof raw==='string'?JSON.parse(raw):raw;}catch{return communityJson({error:'预览内容格式无效。'},400);}
  if(!draft||typeof draft!=='object')return communityJson({error:'请等待预览内容生成完成。'},400);
  const text=mode==='content'?textOf(fieldOf(input,'previewBody'),100000):textOf(draft.text,100000),description=textOf(draft.description,2000);
  const ids=Array.isArray(draft.media)?draft.media:[];if(ids.length>100||ids.some(value=>typeof value!=='string'))return communityJson({error:'预览文件数量无效。'},400);
  const media=[];for(const token of [...new Set(ids)]) {
    const asset=sql.get('SELECT * FROM work_preview_assets WHERE token=? AND user_id=?',token,viewer);
    if(!asset||asset.product_id&&asset.product_id!==productId||!asset.product_id&&Number(asset.expires)<=Date.now())return communityJson({error:'预览文件已失效或无权使用，请重新选择。'},400);
    media.push({id:token,kind:String(asset.kind),name:String(asset.name),size:Number(asset.size)});
  }
  if(mode==='content'&&!text&&!media.length)return communityJson({error:'请填写预览文字或上传预览图片、视频、音频。'},400);
  const bounded=(value,max)=>Number.isFinite(Number(value))?Math.max(0,Math.min(max,Number(value))):0;
  const stats={characters:Math.floor(bounded(draft.stats?.characters,100000000)),images:Math.floor(bounded(draft.stats?.images,100000)),pages:Math.floor(bounded(draft.stats?.pages,100000)),duration:bounded(draft.stats?.duration,864000)};
  return {version:2,mode,percent:Math.round(percent*10)/10,text,description,media,stats,sourceKind:textOf(draft.sourceKind,20)};
}
function richCommitPreview(sql,productId,plan,input) {
  if(plan===undefined) {
    // Legacy clients explicitly changing preview settings downgrade to legacy behavior.
    if(fieldOf(input,'preview')===undefined)return;
    plan=null;
  }
  const ids=new Set(plan?.media.map(item=>item.id)||[]),current=sql.all('SELECT token FROM work_preview_assets WHERE product_id=?',productId);
  for(const item of current)if(!ids.has(item.token))sql.run("UPDATE work_preview_assets SET product_id='',expires=? WHERE token=?",Date.now()+86400000,item.token);
  if(!plan){sql.run('DELETE FROM work_preview_specs WHERE product_id=?',productId);return;}
  for(const token of ids) {
    const asset=sql.get('SELECT product_id,expires FROM work_preview_assets WHERE token=?',token);
    if(!asset||asset.product_id&&asset.product_id!==productId||!asset.product_id&&asset.expires<=Date.now())throw {seriesError:'预览文件已失效，请重新上传。',status:409};
    sql.run('UPDATE work_preview_assets SET product_id=?,expires=0 WHERE token=?',productId,token);
  }
  sql.run('INSERT INTO work_preview_specs(product_id,spec)VALUES(?,?) ON CONFLICT(product_id)DO UPDATE SET spec=excluded.spec',productId,JSON.stringify(plan));
}
async function richRegisterPreview(sql,request,env) {
  const {viewer,response}=requireUser(sql,request);if(response)return response;
  const mine=sql.get('SELECT is_creator FROM users WHERE id=?',viewer);if(Number(mine?.is_creator)!==1)return fail('err.studio',403);
  if(request.method!=='POST')return fail('err.method',405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return fail('err.route',403);
  let body;try{body=JSON.parse(new TextDecoder().decode(await communityBody(request)));}catch{return fail('err.file');}
  uploadTables(sql);const token=textOf(body.assetToken,80),existing=sql.get('SELECT * FROM work_preview_assets WHERE token=? AND user_id=?',token,viewer);
  if(existing)return communityJson({id:token,kind:existing.kind,name:existing.name,size:Number(existing.size),url:'/api/preview-asset?id='+encodeURIComponent(token)});
  const row=sql.get("SELECT * FROM large_uploads WHERE id=? AND user_id=? AND status='ready' AND expires>?",token,viewer,Date.now());
  if(!row||!env.WORK_FILES)return fail('err.file',400);
  if(Number(row.size)>20000000)return communityJson({error:'单个预览文件最大 20 MB。'},400);
  const pending=Number(sql.get("SELECT COUNT(*) AS n FROM work_preview_assets WHERE user_id=? AND product_id='' AND expires>?",viewer,Date.now()).n);if(pending>=100)return communityJson({error:'待发布的预览文件过多，请先保存现有作品。'},429);
  const read=async(offset,length)=>{const result=await env.WORK_FILES.get(row.object_key,{range:{offset,length}});if(!result)throw Error('missing');return new Uint8Array(await result.arrayBuffer());};
  const mime=String(row.type).split(';')[0].toLowerCase();if(!/^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|quicktime|ogg)|audio\/(mpeg|mp3|mp4|wav|x-wav|ogg|flac|aac|webm))$/.test(mime))return communityJson({error:'预览仅支持图片、视频和音频文件。'},400);
  let check;try{check=await validatePlayFile(row.name,mime,Number(row.size),read);}catch{return fail('err.file');}
  const kind={comic:'image',video:'video',voice:'audio'}[check.format];if(!check.ok||!kind||kind!==mime.split('/')[0])return communityJson({error:check.reason||'预览文件格式与内容不匹配。'},400);
  sql.transaction(()=>{const fresh=sql.get('SELECT status FROM large_uploads WHERE id=?',token);if(fresh?.status!=='ready')throw Error('Upload already used');sql.run('INSERT INTO work_preview_assets(token,user_id,kind,mime,name,size,expires)VALUES(?,?,?,?,?,?,?)',token,viewer,kind,mime,String(row.name),Number(row.size),Date.now()+86400000);sql.run("UPDATE large_uploads SET status='attached' WHERE id=?",token);});
  return communityJson({id:token,kind,name:String(row.name),size:Number(row.size),url:'/api/preview-asset?id='+encodeURIComponent(token)});
}
async function richPreviewAsset(sql,request,env) {
  const viewer=userId(sql,request);if(!viewer)return fail('err.loginRequired',401);
  uploadTables(sql);const token=new URL(request.url).searchParams.get('id')||'',asset=sql.get('SELECT a.*,u.object_key FROM work_preview_assets a JOIN large_uploads u ON u.id=a.token WHERE a.token=?',token);
  if(!asset)return fail('err.file.missing',404);
  const owner=viewer===asset.user_id;
  if(!asset.product_id&&(!owner||Number(asset.expires)<=Date.now()))return fail('err.play.forbidden',403);
  if(asset.product_id&&!owner) {
    const product=sql.get('SELECT * FROM products WHERE id=?',asset.product_id);
    if(!product||Number(product.listed)!==1||Number(product.removed)===1||Number(product.allow_preview)!==1||!(richPreviewSpec(sql,asset.product_id)?.media||[]).some(item=>item.id===token))return fail('err.play.forbidden',403);
  }
  return objectFileResponse({file_body:'r2:'+asset.object_key,file_type:asset.mime,file_name:asset.name},request,env,true);
}
function richPreviewEditor(sql,request) {
  const {viewer,response}=requireUser(sql,request);if(response)return response;
  const product=sql.get('SELECT * FROM products WHERE id=?',new URL(request.url).searchParams.get('productId')||''),mine=sql.get('SELECT handle FROM users WHERE id=?',viewer);
  if(!product||product.creator_id!==mine?.handle||Number(product.removed)===1)return fail('err.product.missing',404);
  return communityJson({format:String(product.play_format),body:playBody(product),name:String(product.file_name||''),size:Number(product.file_size||0),type:String(product.file_type||''),spec:richPreviewOwnSpec(sql,product.id)});
}
function richPlayRead(sql,request) {
  const url=new URL(request.url),product=sql.get('SELECT * FROM products WHERE id=?',url.searchParams.get('productId')||''),spec=product&&richPreviewSpec(sql,product.id);
  if(!product||!spec)return legacyPlayRead(sql,request);
  const viewer=userId(sql,request);if(!viewer)return fail('err.loginRequired',401);
  const previewOnly=url.searchParams.get('preview')==='1',level=previewOnly?(Number(product.listed)===1&&Number(product.removed)!==1&&Number(product.allow_preview)===1?'preview':'none'):accessLevel(sql,viewer,product);
  if(level==='none')return fail('err.play.forbidden',403);if(level==='full')return legacyPlayRead(sql,request);
  const stored=playBody(product),format=String(product.play_format),media=spec.media.map(item=>({...item,url:'/api/preview-asset?id='+encodeURIComponent(item.id)})),percent=spec.percent||0;
  let text=spec.text,body={},limit=0;
  if(spec.mode==='progress') {
    if(format==='novel')text=cutText(String(stored.novel||''),Math.ceil(Array.from(String(stored.novel||'')).length*percent/100));
    else if(format==='comic')body={pages:(stored.pages||[]).slice(0,Math.max(1,Math.ceil((stored.pages||[]).length*percent/100))).map(page=>({...page,image:typeof page.image==='string'&&page.image.startsWith('/api/media?')?page.image+'&preview=1':page.image}))};
    else if(format==='voice'||format==='video') {limit=Number(spec.stats.duration)*percent/100;if(limit>0)body=format==='video'?{video:String(stored.video||'')+'&preview=1'}:{tracks:(stored.tracks||[]).slice(0,1).map(track=>({...track,src:track.src?track.src+'&preview=1':''}))};}
  }
  return communityJson({id:String(product.id),title:String(product.title),creatorId:String(product.creator_id),format,preview:true,previewVersion:2,previewPercent:percent,previewLimit:limit,text,description:spec.description,media,stats:spec.stats,...body});
}
async function richCleanupPreviews(sql,env) {
  richPreviewTables(sql);uploadTables(sql);if(!env.WORK_FILES)return;
  const expired=sql.all("SELECT a.token,u.object_key FROM work_preview_assets a JOIN large_uploads u ON u.id=a.token WHERE a.product_id='' AND a.expires<? LIMIT 100",Date.now());
  for(const row of expired){await env.WORK_FILES.delete(row.object_key);sql.run('DELETE FROM work_preview_assets WHERE token=?',row.token);sql.run('DELETE FROM large_upload_parts WHERE upload_id=?',row.token);sql.run('DELETE FROM large_uploads WHERE id=?',row.token);}
}
