// Bounded parallel multipart transfer; all transport state belongs to this upload.
async function fastMultipartUpload(form,file,force=false){
  if(!file||!force&&file.size<=8*1024*1024)return;if(file.size>=ep)throw Error('文件必须小于 5 GB。');if(qe&&!qe.done)throw Error('请先完成已有上传。');
  const identity=JSON.stringify([file.name,file.size,file.lastModified]),storageKey='fanstar-file-upload';let upload;
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved?.identity===identity){const current=await ia('/api/uploads?id='+encodeURIComponent(saved.id));if(current.size===file.size&&['uploading','ready'].includes(current.status))upload=current;}}catch{}
  if(!upload){upload=await ia('/api/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,type:file.type})});try{sessionStorage.setItem(storageKey,JSON.stringify({id:upload.id,identity}));}catch{}}
  const count=Math.ceil(file.size/upload.partSize),completed=new Set((upload.parts||[]).map(item=>Number(item.part))),inflight=new Map(),transports=new Set(),pending=[];let committed=0,next=0,failure=null;
  const partBytes=part=>Math.min(upload.partSize,file.size-(part-1)*upload.partSize);for(let part=1;part<=count;part++)if(completed.has(part))committed+=partBytes(part);else pending.push(part);
  const started=Date.now(),initial=committed,state={id:upload.id,name:file.name,size:file.size,loaded:committed,percent:Math.min(99,Math.floor(committed/file.size*100)),paused:false,cancelled:false,done:false};qe=state;
  state.xhr={abort(){for(const xhr of transports)xhr.abort();}};
  const progress=()=>{if(qe!==state)return;const loaded=committed+Array.from(inflight.values()).reduce((sum,bytes)=>sum+bytes,0),elapsed=(Date.now()-started)/1000,speed=elapsed>0?(loaded-initial)/elapsed:0;Jt({loaded,percent:Math.min(99,Math.floor(loaded/file.size*100)),speed});};progress();
  const wait=async()=>{while(state.paused&&!state.cancelled&&!failure)await new Promise(resolve=>setTimeout(resolve,150));if(state.cancelled)throw Error('已取消上传。');if(failure)throw failure;};
  async function send(part){
    const begin=(part-1)*upload.partSize,size=partBytes(part);for(let attempt=0;attempt<3;attempt++){
      await wait();inflight.set(part,0);progress();try{
        await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();transports.add(xhr);let settled=false;const finish=error=>{if(settled)return;settled=true;transports.delete(xhr);error?reject(error):resolve();};xhr.open('PUT','/api/uploads?id='+encodeURIComponent(upload.id)+'&part='+part);xhr.withCredentials=true;xhr.timeout=180000;
          xhr.upload.onprogress=event=>{inflight.set(part,Math.min(size,event.loaded));progress();};xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)return finish();let message;try{message=JSON.parse(xhr.responseText).error;}catch{}const error=Error(message||'分片上传失败，请重试。');error.status=xhr.status;finish(error);};xhr.onerror=()=>finish(Error('网络连接中断，请重试。'));xhr.ontimeout=()=>finish(Error('分片上传超时，请重试。'));xhr.onabort=()=>finish(Error(state.cancelled?'已取消上传。':'分片上传已停止。'));try{xhr.send(file.slice(begin,begin+size));}catch(error){finish(error);}});
        inflight.delete(part);committed+=size;progress();return;
      }catch(error){inflight.delete(part);progress();if(state.cancelled||failure||attempt===2||[400,401,403,404,409,413].includes(error.status))throw error;await new Promise(resolve=>setTimeout(resolve,300*2**attempt));}
    }
  }
  async function worker(){try{while(next<pending.length){await wait();if(next>=pending.length)return;const part=pending[next++];await send(part);}}catch(error){if(!failure)failure=error;state.xhr.abort();throw error;}}
  try{const results=await Promise.allSettled(Array.from({length:Math.min(3,pending.length)},worker));if(failure)throw failure;for(const result of results)if(result.status==='rejected')throw result.reason;await wait();const ready=await ia('/api/uploads?id='+encodeURIComponent(upload.id)+'&complete=1',{method:'POST'});form.delete('file');form.set('assetToken',ready.assetToken);Jt({percent:100,loaded:file.size,done:true,speed:0,message:'上传完成，正在保存内容…'});}catch(error){Jt({done:true,error:error.message,speed:0});throw error;}
}
