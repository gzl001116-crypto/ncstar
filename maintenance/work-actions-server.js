function workListVisibility(sql,request,body){
  const{viewer,response}=requireUser(sql,request);if(response)return response;
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')return fail('err.route',403);
  const mine=sql.get('SELECT handle,is_creator FROM users WHERE id=?',viewer);if(!mine||Number(mine.is_creator)!==1)return fail('err.studio',403);
  if(typeof body?.productId!=='string'||body.productId.length>80||typeof body.listed!=='boolean')return communityJson({error:'作品状态参数无效。'},400);
  const product=sql.get('SELECT id,creator_id,removed FROM products WHERE id=?',body.productId);if(!product||String(product.creator_id)!==String(mine.handle)||Number(product.removed)===1)return fail('err.product.missing',404);
  sql.run('UPDATE products SET listed=? WHERE id=? AND creator_id=? AND removed=0',body.listed?1:0,String(product.id),String(mine.handle));
  return json2({...snapshot(sql,viewer),toast:body.listed?'作品已重新上架。':'作品已下架，已购用户仍可访问。'});
}
