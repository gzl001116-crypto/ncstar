// Public previews are served without persistent browser caching or search indexing.
function publicPreviewResponse(response){
 const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('pragma','no-cache');headers.set('expires','0');headers.set('x-robots-tag','noindex, nofollow, noarchive');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
