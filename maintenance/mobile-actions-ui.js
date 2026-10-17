// Keep capability checks synchronous so the click's activation reaches the OS share sheet.
function mobileShareData(url,title,nav=navigator,doc=document,secure=window.isSecureContext){
 if(!secure||typeof nav.share!=='function')return null;
 try{const policy=doc.permissionsPolicy||doc.featurePolicy;if(policy?.features?.().includes('web-share')&&!policy.allowsFeature('web-share'))return null;
 const data={title,url};if(typeof nav.canShare!=='function'||nav.canShare(data))return data;
 return nav.canShare({url})?{url}:null;}catch{return null;}
}
function mobileNotificationText(item){
 const title=item.title?'「'+item.title+'」':'',work=item.kind.startsWith('work-'),noun=work?'作品':'动态';
 if(item.kind==='follow')return'关注了你';
 if(item.kind==='work-reply'||item.kind==='post-reply'||((item.kind==='work-comment'||item.kind==='post-comment')&&item.isOwnTarget===false))return'在'+noun+title+'下回复了你的评论';
 if(item.kind==='work-thread-reply'||item.kind==='post-thread-reply')return'在你的'+noun+title+'下回复了评论';
 if(item.kind==='work-comment'||item.kind==='post-comment')return'评论了'+(item.isOwnTarget===null?'':'你的')+noun+title;
 if(item.kind==='work-like'||item.kind==='post-like')return'赞了'+(item.isOwnTarget===null?'':'你的')+noun+title;
 return'与你互动了';
}
