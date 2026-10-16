const STUDIO_WORK_KINDS=['漫画','视频','小说','插图','游戏'];
function studioWorkKind(product){
  const kind=String(product?.kind||''),format=String(product?.play_format||product?.playFormat||''),name=String(product?.file_name||'');
  if(STUDIO_WORK_KINDS.includes(kind))return kind;
  if(format==='game')return'游戏';if(format==='video')return'视频';if(format==='comic'||['插画','设计','摄影','图案'].includes(kind))return'插图';if(/\.(cbz|zip)$/i.test(name))return'漫画';return'小说';
}
function studioPlayCheck(result){return result?.ok&&['voice','game'].includes(result.format)?{ok:false,format:result.format,reason:'play 仅支持漫画、视频、小说和插图。此文件可仅提供下载，并单独设置预览。'}:result;}
async function studioPlayRead(sql,request){const response=await richPlayRead(sql,request);if(!response.ok)return response;const data=await response.json(),product=sql.get('SELECT kind,play_format,file_name FROM products WHERE id=?',data.id);return communityJson({...data,category:studioWorkKind(product)});}
