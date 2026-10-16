// Shared by the Worker, upload checker and document reader. No whole-file size cutoff.
function readerU64(view,offset){const value=view.getUint32(offset,true)+view.getUint32(offset+4,true)*4294967296;if(!Number.isSafeInteger(value))throw Error('文件使用了无法寻址的偏移。');return value;}
function readerDecode(bytes){if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('gb18030').decode(bytes);}}
function readerParagraphs(text){return String(text||'').replace(/\r\n?/g,'\n').split(/\n/).filter(line=>line.trim().length>0);}
function readerCachedSource(source){let start=-1,buffer=new Uint8Array();return{size:source.size,async read(offset,length){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>source.size)throw Error('文件目录或范围无效。');if(!length)return new Uint8Array();if(offset>=start&&offset+length<=start+buffer.length)return buffer.subarray(offset-start,offset-start+length);start=offset;buffer=await source.read(offset,Math.min(source.size-offset,Math.max(length,262144)));if(buffer.length<length)throw Error('文件读取不完整。');return buffer.subarray(0,length);}};}
async function readerZipDirectory(source,{collect=true,onEntry}={}){
  const input=readerCachedSource(source),tailStart=Math.max(0,source.size-65557),tail=await input.read(tailStart,source.size-tailStart),dv=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);let at=-1;
  for(let i=tail.length-22;i>=0;i--)if(dv.getUint32(i,true)===0x06054b50&&i+22+dv.getUint16(i+20,true)<=tail.length){at=i;break;}
  if(at<0)throw Error('压缩包目录损坏或文件尚未上传完整。');
  if(dv.getUint16(at+4,true)||dv.getUint16(at+6,true))throw Error('请使用完整的非分卷压缩包。');
  let count=dv.getUint16(at+10,true),length=dv.getUint32(at+12,true),offset=dv.getUint32(at+16,true);
  if(count===65535||length===0xffffffff||offset===0xffffffff){const locator=await input.read(tailStart+at-20,20),lv=new DataView(locator.buffer,locator.byteOffset,locator.byteLength);if(lv.getUint32(0,true)!==0x07064b50)throw Error('ZIP64 目录不完整。');const record=await input.read(readerU64(lv,8),56),rv=new DataView(record.buffer,record.byteOffset,record.byteLength);if(rv.getUint32(0,true)!==0x06064b50)throw Error('ZIP64 目录损坏。');count=readerU64(rv,32);length=readerU64(rv,40);offset=readerU64(rv,48);}
  if(offset+length>source.size||count>Math.floor(length/46))throw Error('压缩包目录无效。');
  const entries=[];let cursor=offset;
  for(let i=0;i<count;i++){
    const header=await input.read(cursor,46),view=new DataView(header.buffer,header.byteOffset,header.byteLength);if(view.getUint32(0,true)!==0x02014b50)throw Error('压缩包条目目录损坏。');
    const flags=view.getUint16(8,true),method=view.getUint16(10,true),nameLength=view.getUint16(28,true),extraLength=view.getUint16(30,true),comment=view.getUint16(32,true),fields=await input.read(cursor+46,nameLength+extraLength),name=readerDecode(fields.subarray(0,nameLength));let expanded=view.getUint32(24,true),compressed=view.getUint32(20,true),localOffset=view.getUint32(42,true);
    if(flags&1)throw Error('加密文档或压缩包需要先解密才能阅读。');
    for(let j=nameLength;j+4<=fields.length;){const extra=new DataView(fields.buffer,fields.byteOffset+j,fields.length-j),id=extra.getUint16(0,true),size=extra.getUint16(2,true);if(j+4+size>fields.length)throw Error('压缩包扩展目录损坏。');if(id===1){let p=4;if(expanded===0xffffffff){expanded=readerU64(extra,p);p+=8;}if(compressed===0xffffffff){compressed=readerU64(extra,p);p+=8;}if(localOffset===0xffffffff)localOffset=readerU64(extra,p);}j+=4+size;}
    if(localOffset+30>source.size||compressed>source.size)throw Error('压缩包条目范围无效。');
    const entry={name,method,flags,expanded,compressed,offset:localOffset};if(collect)entries.push(entry);if(onEntry)onEntry(entry);cursor+=46+nameLength+extraLength+comment;if(cursor>offset+length)throw Error('压缩包目录越界。');
  }
  return entries;
}
async function readerZipStream(source,entry){
  if(![0,8].includes(entry.method))throw Error('此条目压缩方式暂不受支持。');
  const header=await source.read(entry.offset,30),view=new DataView(header.buffer,header.byteOffset,header.byteLength);if(view.getUint32(0,true)!==0x04034b50)throw Error('条目文件头损坏。');
  const start=entry.offset+30+view.getUint16(26,true)+view.getUint16(28,true);if(start+entry.compressed>source.size)throw Error('条目文件不完整。');let position=0;
  const compressed=new ReadableStream({async pull(controller){try{if(position>=entry.compressed){controller.close();return;}const length=Math.min(262144,entry.compressed-position),bytes=await source.read(start+position,length);position+=bytes.length;if(!bytes.length)throw Error('条目读取失败。');controller.enqueue(bytes);}catch(error){controller.error(error);}}});
  return entry.method===8?compressed.pipeThrough(new DecompressionStream('deflate-raw')):compressed;
}
async function readerEntryBytes(source,entry){return new Uint8Array(await new Response(await readerZipStream(source,entry)).arrayBuffer());}
function readerFileSource(file){return{size:file.size,name:file.name,type:file.type,read:async(offset,length)=>new Uint8Array(await file.slice(offset,offset+length).arrayBuffer())};}
async function* readerTextChunks(input,signal){
  let stream;if(typeof input==='string'){const response=await fetch(input,{credentials:'same-origin',signal});if(!response.ok)throw Error('无法读取文本文件。');stream=response.body;}else stream=input.stream();
  const reader=stream.getReader();let decoder,first=true;try{while(true){if(signal?.aborted)throw Object.assign(Error('读取已取消。'),{name:'AbortError'});const{value,done}=await reader.read();if(done)break;if(!value?.length)continue;if(first){first=false;let encoding='utf-8';if(value[0]===255&&value[1]===254)encoding='utf-16le';else if(value[0]===254&&value[1]===255)encoding='utf-16be';else try{new TextDecoder('utf-8',{fatal:true}).decode(value,{stream:true});}catch{encoding='gb18030';}decoder=new TextDecoder(encoding);}yield decoder.decode(value,{stream:true});}if(decoder){const end=decoder.decode();if(end)yield end;}}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
async function readerTextMetrics(input,signal){let characters=0,bytes=0,prefix='';for await(const text of readerTextChunks(input,signal)){const count=Array.from(text).length;characters+=count;bytes+=new TextEncoder().encode(text).length;if(Array.from(prefix).length<100000)prefix+=Array.from(text).slice(0,100000-Array.from(prefix).length).join('');}return{characters,bytes,text:prefix};}
async function readerSelectedTextBytes(input,characters,signal){let remaining=characters,bytes=0;for await(const text of readerTextChunks(input,signal)){const points=Array.from(text),part=points.length>remaining?points.slice(0,remaining).join(''):text;bytes+=new TextEncoder().encode(part).length;remaining-=Math.min(remaining,points.length);if(bytes>500000000)throw Error('所选预览超过 500 MB，请减少预览内容。');if(remaining<=0)break;}return bytes;}
async function createReadingTextPager(input,limit=Infinity,signal){
  const iterator=readerTextChunks(input,signal)[Symbol.asyncIterator]();let carry='',done=false,remaining=limit;
  return{async next(){while(!done&&carry.length<16000&&remaining>0){const item=await iterator.next();if(item.done){done=true;break;}const points=Array.from(item.value),part=points.length>remaining?points.slice(0,remaining).join(''):item.value;remaining-=Math.min(points.length,remaining);carry+=part;if(remaining<=0)done=true;}if(!carry)return null;let boundary=carry.length>16000?carry.lastIndexOf('\n',16000):carry.length;if(boundary<1)boundary=Math.min(16000,carry.length);const page=carry.slice(0,boundary);carry=carry.slice(boundary);return readerParagraphs(page);},async close(){done=true;carry='';await iterator.return?.();}};
}
async function readerRemoteSource(url,signal){
  // A one-byte range discovers the complete size without downloading the full object.
  const first=await fetch(url,{credentials:'same-origin',headers:{Range:'bytes=0-0'},signal});if(!first.ok)throw Error('无法读取文件或没有访问权限。');
  const range=first.headers.get('content-range'),match=range&&/\/(\d+)$/.exec(range);let bytes;
  if(!match){bytes=new Uint8Array(await first.arrayBuffer());return{size:bytes.length,read:async(offset,length)=>bytes.subarray(offset,offset+length)};}
  await first.body?.cancel();const size=Number(match[1]);
  return{size,url,async read(offset,length){if(!length)return new Uint8Array();const result=await fetch(url,{credentials:'same-origin',headers:{Range:'bytes='+offset+'-'+(offset+length-1)},signal});if(!result.ok)throw Error('文件分段读取失败。');const data=new Uint8Array(await result.arrayBuffer());if(result.status!==206){if(data.length===size)return data.subarray(offset,offset+length);throw Error('文件服务未返回所需范围。');}return data;}};
}
async function validateOpenReaderFile(name,mime,size,read){
  const ext=String(name).toLowerCase().split('.').pop(),type=String(mime||'').toLowerCase(),source=readerCachedSource({size,read}),head=await source.read(0,Math.min(size,65536)),ascii=(bytes,start=0,end=bytes.length)=>String.fromCharCode(...bytes.subarray(start,Math.min(end,start+65536))),starts=(...values)=>values.every((value,i)=>head[i]===value),ok=format=>({ok:true,format}),fail=reason=>({ok:false,reason});
  if(!size)return fail('文件为空，无法打开。');
  if(ext==='pdf'||type==='application/pdf')return ascii(head,0,8).startsWith('%PDF-')?ok('document'):fail('文件不是可识别的 PDF 文档。');
  if(/^(docx|pptx|xlsx|xlsm|xlsb|ods|epub|cbz|zip|odt|odp)$/.test(ext)){
    if(!starts(80,75))return fail('文档容器无法识别。');let expected={docx:'word/document.xml',pptx:'ppt/presentation.xml',xlsx:'xl/workbook.xml',xlsm:'xl/workbook.xml',xlsb:'xl/workbook.bin',ods:'content.xml',odt:'content.xml',odp:'content.xml',epub:'META-INF/container.xml'}[ext],found=!expected,readable=false;
    try{await readerZipDirectory(source,{collect:false,onEntry:entry=>{if(entry.name===expected)found=true;if(/\.(png|jpe?g|gif|webp|avif|bmp|txt|md|json|csv|log|srt)$/i.test(entry.name))readable=true;}});}catch(error){return fail(error.message);}
    if(!found)return fail('文件内容与文档格式不匹配。');if(/^(cbz|zip)$/.test(ext)&&!readable)return fail('压缩包中没有可阅读的图片或文本。');return ok('document');
  }
  if(ext==='xls')return starts(208,207,17,224,161,177,26,225)?ok('document'):fail('无法识别此 XLS 表格。');
  if(/^(csv|tsv|rtf)$/.test(ext))return ok('document');
  if(/^(txt|md|markdown|text|log|json|jsonl|xml|yaml|yml|toml|ini|cfg|srt|vtt|ass|js|ts|jsx|tsx|css|py|java|c|cpp|h|sql|sh|rb|go|rs|html?|xhtml)$/.test(ext)||type.startsWith('text/')||/application\/(json|xml|javascript)/.test(type)){
    if(!starts(255,254)&&!starts(254,255)&&head.subarray(0,4096).some(value=>value===0))return fail('此文件包含无法作为文本读取的二进制内容。');return ok(/^(html?|xhtml)$/.test(ext)||type.startsWith('text/html')?'game':'novel');
  }
  const video=/^(mp4|m4v|mov|webm|ogv)$/.test(ext)||type.startsWith('video/'),audio=/^(mp3|m4a|wav|ogg|flac|aac|opus|aiff?)$/.test(ext)||type.startsWith('audio/');
  if(video||audio){
    if(ascii(head,4,8)==='ftyp'){
      const codecs=[];let moov=false;const u32=(bytes,offset)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset,false);
      async function boxes(start,end,depth=0){if(depth>16)throw Error('媒体索引结构无法识别。');let offset=start;while(offset+8<=end){const header=await source.read(offset,Math.min(16,end-offset));let length=u32(header,0),headerSize=8;const kind=ascii(header,4,8);if(length===1){length=u32(header,8)*4294967296+u32(header,12);headerSize=16;}if(!length)length=end-offset;if(!Number.isSafeInteger(length)||length<headerSize||offset+length>end)throw Error('媒体索引损坏。');if(kind==='moov'){moov=true;await boxes(offset+headerSize,offset+length,depth+1);}else if(['trak','mdia','minf','stbl'].includes(kind))await boxes(offset+headerSize,offset+length,depth+1);else if(kind==='stsd'&&length>=headerSize+8){let cursor=offset+headerSize+8;const countBytes=await source.read(offset+headerSize+4,4),count=u32(countBytes,0);for(let i=0;i<count&&cursor+8<=offset+length;i++){const entry=await source.read(cursor,8),entrySize=u32(entry,0);if(entrySize<8||cursor+entrySize>offset+length)throw Error('媒体轨道损坏。');codecs.push(ascii(entry,4,8));cursor+=entrySize;}}offset+=length;}}
      try{await boxes(0,size);}catch(error){return fail(error.message);}if(!moov)return fail('媒体文件缺少可读索引。');if(codecs.some(codec=>['hvc1','hev1'].includes(codec)))return fail('此视频为 HEVC/H.265 编码，请转为 H.264 MP4 后使用 play。');return(video?codecs.some(codec=>['avc1','avc3','vp09','av01'].includes(codec)):codecs.some(codec=>['mp4a','Opus','.mp3'].includes(codec)))?ok(video?'video':'voice'):fail('媒体编码暂不受浏览器支持。');
    }
    if(video&&starts(26,69,223,163))return /V_VP8|V_VP9|V_AV1/.test(ascii(head))?ok('video'):fail('WebM 视频编码无法识别。');
    if(starts(79,103,103,83))return /vorbis|OpusHead|theora/.test(ascii(head))?ok(video?'video':'voice'):fail('OGG 编码无法识别。');
    if(!video&&(ascii(head,0,3)==='ID3'||head[0]===255&&(head[1]&224)===224||ascii(head,0,4)==='fLaC'||ascii(head,0,4)==='RIFF'&&ascii(head,8,12)==='WAVE'))return ok('voice');
    return fail('此媒体容器暂不受支持。');
  }
  if(type.startsWith('image/')||/^(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/.test(ext)){const text=ascii(head,0,1024);return starts(137,80,78,71,13,10,26,10)||starts(255,216,255)||text.startsWith('GIF8')||text.startsWith('RIFF')&&ascii(head,8,12)==='WEBP'||text.startsWith('BM')||starts(0,0,1,0)||/<svg[\s>]/i.test(text)&&ext==='svg'||ascii(head,4,8)==='ftyp'&&/avif|avis/.test(text.slice(8,40))?ok('comic'):fail('图片格式无法识别。');}
  return fail('此文件格式暂不能在 play 中打开。');
}
