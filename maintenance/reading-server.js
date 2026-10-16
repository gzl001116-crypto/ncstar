const READING_PREVIEW_BYTES=500000000;
function readingLimit(value,integer=true){if(value===undefined||value===null||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||integer&&!Number.isSafeInteger(number))throw Error('预览字数、图片数须为非负整数，秒数须为非负数字。');return number;}
function readingLimits(input){return{characters:readingLimit(input?.characters),images:readingLimit(input?.images),seconds:readingLimit(input?.seconds,false)};}
function readingPreparePreview(sql,request,input,productId=''){
  const plan=baseRichPreparePreview(sql,request,input,productId);if(!plan||plan instanceof Response)return plan;
  let draft;try{const raw=fieldOf(input,'previewDraft');draft=typeof raw==='string'?JSON.parse(raw):raw;plan.limits=readingLimits(draft?.limits);}catch(error){return communityJson({error:error.message||'预览数量无效。'},400);}
  let bytes=0;for(const asset of plan.media){bytes+=asset.size;if(bytes>READING_PREVIEW_BYTES)return communityJson({error:'每部作品的预览文件合计最多 500 MB。'},400);}
  const textBytes=Number(draft?.textBytes)||new TextEncoder().encode(plan.text||'').length;if(textBytes<0||!Number.isFinite(textBytes)||bytes+(plan.media.some(item=>item.kind==='text')?0:textBytes)>READING_PREVIEW_BYTES)return communityJson({error:'预览内容合计最多 500 MB，请减少预览内容。'},400);
  plan.textBytes=textBytes;plan.version=3;delete plan.description;return plan;
}
function readingStreamManifest(productId,source,staged,play){
  if(staged&&play.format==='novel')return{format:'novel',body:JSON.stringify({novel:'',textSource:'/api/media?productId='+encodeURIComponent(productId)})};
  if(staged&&play.format==='game')return{format:'game',body:JSON.stringify({html:'',htmlSource:'/api/media?productId='+encodeURIComponent(productId)})};
  return play;
}
function readingPreviewCount(spec,key,total){const value=spec?.limits?.[key];return value!==undefined&&value!==null?Math.max(0,Math.min(Number(value)||0,total)):Math.ceil(total*Number(spec?.percent||0)/100);}
function readingTextTransform(encoding,characters,bytes){
  const decoder=new TextDecoder(encoding);let remaining=characters,budget=bytes;
  const emit=(text,controller)=>{let points=Array.from(text);if(points.length>remaining)points=points.slice(0,remaining);let value=points.join(''),encoded=new TextEncoder().encode(value);if(encoded.length>budget){let low=0,high=points.length;while(low<high){const mid=Math.ceil((low+high)/2);if(new TextEncoder().encode(points.slice(0,mid).join('')).length<=budget)low=mid;else high=mid-1;}points=points.slice(0,low);encoded=new TextEncoder().encode(points.join(''));}remaining-=points.length;budget-=encoded.length;if(encoded.length)controller.enqueue(encoded);if(remaining<=0||budget<=0||!points.length&&text.length)controller.terminate();};
  return new TransformStream({transform(chunk,controller){emit(decoder.decode(chunk,{stream:true}),controller);},flush(controller){const text=decoder.decode();if(text&&remaining>0&&budget>0)emit(text,controller);}});
}
async function readingTextPreview(sql,request,env){
  const viewer=userId(sql,request);if(!viewer)return fail('err.loginRequired',401);const product=sql.get('SELECT * FROM products WHERE id=?',new URL(request.url).searchParams.get('productId')||'');
  if(!product||String(product.play_format)!=='novel'||Number(product.listed)!==1||Number(product.removed)===1||Number(product.allow_preview)!==1)return fail('err.play.forbidden',403);
  const spec=richPreviewSpec(sql,String(product.id));if(spec?.mode!=='progress'&&String(product.preview_mode)!=='progress')return fail('err.play.forbidden',403);
  const stored=playBody(product),total=Number(spec?.stats?.characters)||Array.from(String(stored.novel||'')).length,characters=spec?readingPreviewCount(spec,'characters',total):Number(product.preview_limit)||0,mediaBytes=(spec?.media||[]).reduce((sum,item)=>sum+Number(item.size||0),0),budget=Math.max(0,READING_PREVIEW_BYTES-mediaBytes),headers={'content-type':'text/plain; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
  if(!characters||!budget)return new Response('',{headers});
  if(String(product.file_body).startsWith('r2:')){if(!env.WORK_FILES)return fail('err.file.missing',404);const key=String(product.file_body).slice(3),head=await env.WORK_FILES.get(key,{range:{offset:0,length:Math.min(Number(product.file_size)||65536,65536)}});if(!head)return fail('err.file.missing',404);const bytes=new Uint8Array(await head.arrayBuffer());let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';else try{new TextDecoder('utf-8',{fatal:true}).decode(bytes,{stream:true});}catch{encoding='gb18030';}const object=await env.WORK_FILES.get(key);if(!object)return fail('err.file.missing',404);return new Response(object.body.pipeThrough(readingTextTransform(encoding,characters,budget)),{headers});}
  const text=cutText(String(stored.novel||''),characters),stream=new Blob([text]).stream().pipeThrough(readingTextTransform('utf-8',characters,budget));return new Response(stream,{headers});
}
async function readingPlayRead(sql,request){
  const url=new URL(request.url),product=sql.get('SELECT * FROM products WHERE id=?',url.searchParams.get('productId')||'');if(!product)return legacyPlayRead(sql,request);
  const viewer=userId(sql,request);if(!viewer)return fail('err.loginRequired',401);const previewOnly=url.searchParams.get('preview')==='1',level=previewOnly?(Number(product.listed)===1&&Number(product.removed)!==1&&Number(product.allow_preview)===1?'preview':'none'):accessLevel(sql,viewer,product);
  if(level==='none')return fail('err.play.forbidden',403);const spec=richPreviewSpec(sql,String(product.id)),format=String(product.play_format),stored=playBody(product),remote=String(product.file_body).startsWith('r2:');
  if(level==='full'||!spec){const response=legacyPlayRead(sql,request);if(!response.ok)return response;const data=await response.json();if(remote&&format==='novel'){data.novel='';data.textSource=level==='full'?'/api/media?productId='+encodeURIComponent(product.id):'/api/text-preview?productId='+encodeURIComponent(product.id);if(level==='preview')data.previewVersion=2;}if(remote&&format==='game'&&level==='full'){data.html='';data.htmlSource='/api/media?productId='+encodeURIComponent(product.id);}return communityJson(data);}
  const media=spec.media.filter(item=>item.kind!=='text').map(item=>({...item,url:'/api/preview-asset?id='+encodeURIComponent(item.id)})),textAsset=spec.media.find(item=>item.kind==='text');let text=spec.text||'',body={},limit=0,textSource=textAsset?'/api/preview-asset?id='+encodeURIComponent(textAsset.id):'';
  if(spec.mode==='progress'){
    if(format==='novel'){const characters=readingPreviewCount(spec,'characters',remote?Number(spec.stats.characters)||0:Array.from(String(stored.novel||'')).length);if(remote){text='';textSource=characters?'/api/text-preview?productId='+encodeURIComponent(product.id):'';}else text=cutText(String(stored.novel||''),characters);}
    else if(format==='comic'){const count=readingPreviewCount(spec,'images',(stored.pages||[]).length);body.pages=(stored.pages||[]).slice(0,count).map(page=>({...page,image:typeof page.image==='string'&&page.image.startsWith('/api/media?')?page.image+'&preview=1':page.image}));}
    else if(format==='voice'||format==='video'){const duration=Number(spec.stats.duration)||0;limit=spec.limits?.seconds!==undefined&&spec.limits.seconds!==null?Math.min(Number(spec.limits.seconds),duration):duration*Number(spec.percent)/100;if(limit>0)body=format==='video'?{video:String(stored.video||'')+'&preview=1'}:{tracks:(stored.tracks||[]).slice(0,1).map(track=>({...track,src:track.src?track.src+'&preview=1':''}))};}
  }
  return communityJson({id:String(product.id),title:String(product.title),creatorId:String(product.creator_id),format,preview:true,previewVersion:2,previewPercent:spec.percent||0,previewLimit:limit,text,textSource,media,stats:spec.stats,limits:spec.limits||{},...body});
}
