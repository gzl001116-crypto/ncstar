function inboxTables(sql){
 sql.exec('CREATE TABLE IF NOT EXISTS inbox_notice_hides(user_id TEXT NOT NULL,notice_id TEXT NOT NULL,batch_id TEXT NOT NULL,PRIMARY KEY(user_id,notice_id))');
 sql.exec('CREATE TABLE IF NOT EXISTS inbox_message_hides(user_id TEXT NOT NULL,message_id TEXT NOT NULL,batch_id TEXT NOT NULL,PRIMARY KEY(user_id,message_id))');
}
function inboxNotificationUnread(sql,viewer){return Number(sql.get("SELECT COUNT(*) AS n FROM notifications n WHERE n.user_id=? AND n.read_at='' AND NOT EXISTS(SELECT 1 FROM inbox_notice_hides h WHERE h.user_id=n.user_id AND h.notice_id=n.id)",viewer)?.n||0);}
function inboxMessageUnread(sql,viewer){return Number(sql.get("SELECT COUNT(*) AS n FROM direct_messages d WHERE d.recipient_id=? AND d.read_at='' AND NOT EXISTS(SELECT 1 FROM inbox_message_hides h WHERE h.user_id=d.recipient_id AND h.message_id=d.id)",viewer)?.n||0);}
function inboxNoticeAction(sql,viewer,body){
 if(body.op==='restore'){if(typeof body.batchId!=='string'||body.batchId.length>100)return fail('err.route',400);sql.run('DELETE FROM inbox_notice_hides WHERE user_id=? AND batch_id=?',viewer,body.batchId);return communityJson({ok:true});}
 if(body.all!==true&&(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>100||body.ids.some(id=>typeof id!=='string'||!id||id.length>300)))return communityJson({error:'请选择需要删除的通知。'},400);
 const batchId=crypto.randomUUID();if(body.all===true)sql.run('INSERT OR IGNORE INTO inbox_notice_hides(user_id,notice_id,batch_id) SELECT user_id,id,? FROM notifications WHERE user_id=?',batchId,viewer);else for(const id of new Set(body.ids))sql.run('INSERT OR IGNORE INTO inbox_notice_hides(user_id,notice_id,batch_id) SELECT user_id,id,? FROM notifications WHERE user_id=? AND id=?',batchId,viewer,id);return communityJson({ok:true,batchId});
}
function inboxThreadAction(sql,viewer,peer,body){
 const pair='((d.sender_id=? AND d.recipient_id=?) OR (d.sender_id=? AND d.recipient_id=?))';
 if(body.op==='restore'){if(typeof body.batchId!=='string'||body.batchId.length>100)return fail('err.route',400);sql.run('DELETE FROM inbox_message_hides WHERE user_id=? AND batch_id=? AND message_id IN(SELECT d.id FROM direct_messages d WHERE '+pair+')',viewer,body.batchId,viewer,peer.id,peer.id,viewer);return communityJson({ok:true});}
 const batchId=crypto.randomUUID();sql.run('INSERT OR IGNORE INTO inbox_message_hides(user_id,message_id,batch_id) SELECT ?,d.id,? FROM direct_messages d WHERE '+pair,viewer,batchId,viewer,peer.id,peer.id,viewer);return communityJson({ok:true,batchId});
}
function inboxThreads(sql,viewer){
 const rows=sql.all(`SELECT u.handle,u.name,u.avatar_at,d.body,d.created_at,
 (SELECT COUNT(*) FROM direct_messages x WHERE x.sender_id=u.id AND x.recipient_id=? AND x.read_at='' AND NOT EXISTS(SELECT 1 FROM inbox_message_hides h WHERE h.user_id=x.recipient_id AND h.message_id=x.id)) AS unread
 FROM direct_messages d JOIN users u ON u.id=CASE WHEN d.sender_id=? THEN d.recipient_id ELSE d.sender_id END
 WHERE (d.sender_id=? OR d.recipient_id=?) AND NOT EXISTS(SELECT 1 FROM inbox_message_hides h WHERE h.user_id=? AND h.message_id=d.id)
 AND NOT EXISTS(SELECT 1 FROM direct_messages z WHERE ((z.sender_id=d.sender_id AND z.recipient_id=d.recipient_id) OR (z.sender_id=d.recipient_id AND z.recipient_id=d.sender_id)) AND (z.created_at>d.created_at OR (z.created_at=d.created_at AND z.id>d.id)) AND NOT EXISTS(SELECT 1 FROM inbox_message_hides h WHERE h.user_id=? AND h.message_id=z.id)) ORDER BY d.created_at DESC,d.id DESC LIMIT 100`,viewer,viewer,viewer,viewer,viewer,viewer);
 return communityJson({threads:rows.map(r=>({handle:r.handle,name:r.name,avatarAt:r.avatar_at,text:r.body||'[附件]',createdAt:r.created_at,unread:Number(r.unread)}))});
}
function previewSession(request){const match=(request.headers.get('cookie')||'').match(/(?:^|;\s*)fanstar_preview=([a-f0-9]{48})(?:;|$)/);return match?.[1]||'';}
const previewSigningKeys=new WeakMap();
async function previewMac(env,value){
 if(!env.COIN_SSO_SECRET)throw Error('Preview signing is unavailable');
 let key=previewSigningKeys.get(env);if(!key){key=await crypto.subtle.importKey('raw',new TextEncoder().encode('fanstar-preview-v1:'+env.COIN_SSO_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);previewSigningKeys.set(env,key);}
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
}
function previewSignatureText(url,session,expiry){const id=url.pathname==='/api/preview-asset'?url.searchParams.get('id'):url.searchParams.get('productId');return ['preview-v1',session,url.pathname,id||'',expiry].join('\n');}
async function previewSignedResponse(sql,request,env,response){
 if(!response.ok)return publicPreviewResponse(response);const data=await response.json();if(!data.preview)return publicPreviewResponse(communityJson(data));
 let session=previewSession(request),fresh=!session;if(!session)session=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
 const expires=String(Math.floor(Date.now()/1000)+7200),origin=new URL(request.url).origin;
 async function sign(value){if(typeof value!=='string')return value;let url;try{url=new URL(value,origin);}catch{return value;}if(url.origin!==origin||!['/api/preview-asset','/api/text-preview'].includes(url.pathname))return value;url.searchParams.set('pe',expires);url.searchParams.set('pv',await previewMac(env,previewSignatureText(url,session,expires)));return url.pathname+url.search;}
 async function visit(value){if(typeof value==='string')return sign(value);if(Array.isArray(value))return Promise.all(value.map(visit));if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value))out[k]=await visit(v);return out;}return value;}
 try{const out=await visit(data);out.previewTrace=(await previewMac(env,'trace:'+session)).slice(0,10);const result=publicPreviewResponse(communityJson(out)),headers=new Headers(result.headers);if(fresh){const host=new URL(request.url).hostname,domain=host==='fanstar.dev'||host.endsWith('.fanstar.dev')?'; Domain=fanstar.dev':'';headers.append('set-cookie','fanstar_preview='+session+'; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict'+domain);}headers.set('vary','Cookie');return new Response(result.body,{status:result.status,headers});}catch{return communityJson({error:'预览保护暂时不可用，请稍后重试。'},503);}
}
async function previewAccess(sql,request,env){
 const url=new URL(request.url),viewer=userId(sql,request);let owner='';
 if(url.pathname==='/api/preview-asset'){const asset=sql.get('SELECT user_id FROM work_preview_assets WHERE token=?',url.searchParams.get('id')||'');owner=asset?.user_id||'';}
 else{const row=sql.get('SELECT u.id FROM products p JOIN users u ON u.handle=p.creator_id WHERE p.id=?',url.searchParams.get('productId')||'');owner=row?.id||'';}
 if(request.headers.get('sec-fetch-site')==='cross-site')return communityJson({error:'预览文件不支持站外引用。'},403);
 if(viewer&&viewer===owner)return null;
 const expiry=url.searchParams.get('pe')||'',signature=url.searchParams.get('pv')||'',session=previewSession(request),now=Math.floor(Date.now()/1000);
 if(!session||!/^\d{10}$/.test(expiry)||Number(expiry)<now||Number(expiry)>now+7260||!/^[a-f0-9]{64}$/.test(signature))return communityJson({error:'预览链接无效或已过期，请返回作品页重新打开。'},403);
 try{const expected=await previewMac(env,previewSignatureText(url,session,expiry));let different=0;for(let i=0;i<64;i++)different|=expected.charCodeAt(i)^signature.charCodeAt(i);if(different)return communityJson({error:'预览链接无效，请返回作品页重新打开。'},403);}catch{return communityJson({error:'预览保护暂时不可用。'},503);}return null;
}
