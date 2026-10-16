// Keep source parsing metadata separate from permission to open the full work.
function independentPreviewProduct(product){
  if(!product||String(product.play_format||'')||!product.file_name)return product;
  let bytes=new Uint8Array();const remote=String(product.file_body).startsWith('r2:');if(!remote)try{bytes=base64ToBytes(String(product.file_body));}catch{}
  const inferred=readingStreamManifest(String(product.id),null,remote?{}:null,inferPlay(String(product.id),String(product.file_name),String(product.file_type||''),bytes));
  return{...product,play_format:inferred.format,play_body:inferred.body};
}
