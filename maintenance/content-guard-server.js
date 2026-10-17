function guardCommentValue(input){const value=fieldOf(input,'commentsEnabled');if(value===undefined)return undefined;if([true,1,'1','true','on'].includes(value))return true;if([false,0,'0','false','off'].includes(value))return false;throw Error('评论设置无效，请选择开启或关闭。');}
function guardCommitComments(sql,productId,input){const value=guardCommentValue(input);if(value===undefined)return;commentPolicySchema(sql);sql.run('INSERT INTO comment_settings(kind,target_id,enabled)VALUES(?,?,?) ON CONFLICT(kind,target_id)DO UPDATE SET enabled=excluded.enabled','work',productId,value?1:0);}
function guardPrivateSource(value){if(typeof value!=='string'||!value)return false;try{const url=new URL(value,'https://fanstar.dev');return ['/api/media','/api/download','/api/preview-editor'].includes(url.pathname);}catch{return true;}}
function guardSafePreview(data,policy){
  if(!data?.preview)return data;const result={...data};let blocked=false;
  // Browser time limits cannot secure an original video/audio file, including data URLs.
  if(result.video){delete result.video;blocked=true;}
  if(result.tracks?.length&&(result.tracks.some(track=>track.src)||policy?.preview_mode==='progress')){result.tracks=[];blocked=true;}
  if(result.document?.src){result.document=null;blocked=true;}
  if(guardPrivateSource(result.textSource)){result.textSource='';blocked=true;}
  if(result.pages)result.pages=result.pages.map(page=>{if(!guardPrivateSource(page.image))return page;blocked=true;return{...page,image:''};}).filter(page=>page.image||String(page.text||'').trim());
  // Registered preview assets are independently uploaded files; they remain usable.
  if(blocked){result.previewVersion=2;result.previewNotice='此作品尚未提供可安全展示的独立预览文件。';result.previewLimit=0;}
  return result;
}
async function guardedPlayRead(sql,request){
  const response=await studioPlayRead(sql,request);if(!response.ok)return response;const data=await response.json();
  if(data.preview){const product=sql.get('SELECT listed,removed,allow_preview,preview_mode FROM products WHERE id=?',data.id);if(!product||Number(product.listed)!==1||Number(product.removed)===1||Number(product.allow_preview)!==1)return fail('err.play.forbidden',403);return communityJson(guardSafePreview(data,product));}
  return communityJson(data);
}
function guardedMedia(sql,request,env){
  const viewer=userId(sql,request),url=new URL(request.url),product=sql.get('SELECT * FROM products WHERE id = ?',url.searchParams.get('productId')||'');
  if(!product||!String(product.file_name||''))return fail('err.file.missing',404);
  if(!viewer)return fail('err.play.forbidden',403);
  const mine=sql.get('SELECT handle FROM users WHERE id=?',viewer),owner=mine?.handle===product.creator_id;
  // An original file is never a preview. Check this before all Range/If-Range handling.
  if(url.searchParams.get('preview')==='1'||!owner&&accessLevel(sql,viewer,product)!=='full')return fail('err.play.forbidden',403);
  return String(product.file_body).startsWith('r2:')?objectFileResponse(product,request,env,true):playbackFileResponse(product,request);
}
