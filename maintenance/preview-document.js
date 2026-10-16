// Appended to the existing document module: reuse its bounded archive parser and renderers.
export async function inspectPreviewDocument(bytes,kind) {
  const resources=[],release=()=>{for(const url of resources)URL.revokeObjectURL(url);};
  if(kind==='pdf') {
    const pdf=await import('/api/ui/pdf-legacy-6.4.299.mjs');pdf.GlobalWorkerOptions.workerSrc='/api/ui/pdf-worker-legacy-6.4.299.mjs';
    const task=pdf.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true,enableXfa:false,cMapUrl:'/api/ui/pdf-cmaps/',cMapPacked:true,standardFontDataUrl:'/api/ui/pdf-fonts/',wasmUrl:'/api/ui/pdf-wasm/'}),document=await task.promise,cache=new Map();
    let text='';for(let i=1;i<=document.numPages;i++){const page=await document.getPage(i),content=await page.getTextContent();text+=content.items.map(item=>item.str||'').join(' ')+'\n\n';}
    return {text,images:[],imageCount:document.numPages,pages:document.numPages,release:()=>{release();void task.destroy();},getImages:async count=>{
      if(count>100)throw Error('文档进度预览最多生成 100 页，请降低比例或改用自定义内容。');
      const images=[];for(let i=1;i<=count;i++){if(!cache.has(i)){const page=await document.getPage(i),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.5,1000/base.width)}),canvas=globalThis.document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob)throw Error('无法生成文档预览图片。');const file=new File([blob],'preview-page-'+i+'.jpg',{type:'image/jpeg'}),url=URL.createObjectURL(file);resources.push(url);cache.set(i,{file,url,name:'第 '+i+' 页'});}images.push(cache.get(i));}return images;
    }};
  }
  if(kind==='archive') {
    const archive=Pv(bytes),names=Object.keys(archive).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),images=[];let text='';
    for(const name of names)if(/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(name)){const file=new File([archive[name]],name.split('/').pop(),{type:qs(name)}),url=URL.createObjectURL(file);resources.push(url);images.push({file,url,name});}else if(/\.(txt|md|csv|log|srt)$/i.test(name))text+=r0(archive[name])+'\n\n';
    return{text,images,imageCount:images.length,release};
  }
  if(kind==='sheet'){if(bytes[0]===80&&bytes[1]===75)Zs(bytes);const binary=bytes[0]===80&&bytes[1]===75||bytes[0]===208&&bytes[1]===207,book=Wa(binary?bytes:r0(bytes),{type:binary?'array':'string',cellHTML:false,cellFormula:false,sheetRows:5001}),text=book.SheetNames.map(name=>name+'\n'+Gs(book.Sheets[name])).join('\n\n');return{text,images:[],imageCount:0,release};}
  // Office, EPUB, RTF and sheets use the same safe reading view as play.
  const root=document.createElement('div'),cleanup=await Xv(root,bytes,kind),page=root.querySelector('.tw-doc-page'),text=page?.textContent||'',images=[];
  for(const image of Array.from(page?.querySelectorAll('img')||[])){const blob=await fetch(image.src).then(result=>result.blob());if(!/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(blob.type))continue;const extension=blob.type==='image/jpeg'?'jpg':blob.type.split('/')[1],file=new File([blob],'preview-image-'+(images.length+1)+'.'+extension,{type:blob.type});images.push({file,url:image.src,name:file.name});}
  return{text,images,imageCount:images.length,release:()=>{release();cleanup();}};
}
