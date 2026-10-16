// The caller injects the reviewed deployment-patch.json as PATCH.
// Set dryRun=false only after checking local checks and the dry-run hashes.
async () => {
  const patch = PATCH;
  const dryRun = DRY_RUN;
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const response = await cloudflare.request({method:"GET",path:`/accounts/${accountId}/workers/scripts/ncstar`});
  if(!response.success || typeof response.result!=="string") throw Error("Cannot read current Worker");
  const raw=response.result,boundary=raw.split("\r\n")[0];
  const parts=raw.split(boundary).slice(1,-1).map(part=>{
    const at=part.indexOf("\r\n\r\n");
    return {name:part.slice(0,at).match(/name="([^"]+)"/)?.[1],body:part.slice(at+4).replace(/\r\n$/,"")};
  });
  const main=parts.find(part=>part.name==="index.js");
  const ui=parts.find(part=>part.name==="ui-assets-v6.js");
  if(!main||!ui) throw Error("Worker module layout changed");
  if(await hash(main.body)!==patch.baseline.worker) throw Error("Worker changed since review; refresh before publishing");
  const appPath=ui.body.match(/export const UI_APP_PATH=("[^"\n]+")/)?.[1];
  const cssPath=ui.body.match(/export const UI_CSS_PATH=("[^"\n]+")/)?.[1];
  if(!appPath||!cssPath) throw Error("UI paths missing");
  const marker="export const UI_ASSETS=",at=ui.body.indexOf(marker);
  if(at<0||ui.body.indexOf(marker,at+marker.length)>=0)throw Error("UI asset layout changed");
  const assets=JSON.parse(ui.body.slice(at+marker.length).trim().replace(/;$/,""));
  const appAsset=assets[JSON.parse(appPath)],cssAsset=assets[JSON.parse(cssPath)];
  if(!appAsset||!cssAsset||await hash(appAsset.body)!==patch.baseline.app||await hash(cssAsset.body)!==patch.baseline.css)throw Error("UI changed since review; refresh before publishing");
  let app=appAsset.body;
  for(const {old,value} of patch.replacements){if(app.split(old).length!==2)throw Error("UI patch is not unique");app=app.replace(old,()=>value);}
  const css=cssAsset.body+patch.style;
  if(main.body.split(patch.route).length!==2)throw Error("Route patch is not unique");
  const worker=main.body.replace(patch.route,()=> '  if(url.pathname==="/api/threads")return threadsApi(sql,request);\n'+patch.route)+"\n"+patch.backend;
  const actual={worker:await hash(worker),app:await hash(app),css:await hash(css)};
  for(const key of Object.keys(actual))if(actual[key]!==patch.expected[key])throw Error("Patched output differs from tested output: "+key);
  const nextAppPath="/api/ui/app-"+actual.app.slice(0,12)+".mjs",nextCssPath="/api/ui/style-"+actual.css.slice(0,12)+".css";
  assets[nextAppPath]={...appAsset,body:app};assets[nextCssPath]={...cssAsset,body:css};
  const prefix=ui.body.slice(0,at).replace("export const UI_APP_PATH="+appPath,()=>"export const UI_APP_PATH="+JSON.stringify(nextAppPath)).replace("export const UI_CSS_PATH="+cssPath,()=>"export const UI_CSS_PATH="+JSON.stringify(nextCssPath));
  main.body=worker;ui.body=prefix+marker+JSON.stringify(assets)+";\n";
  if(dryRun)return {verified:true,hashes:actual,appPath:nextAppPath,cssPath:nextCssPath,moduleCount:parts.length};
  const boundaryOut="FanstarComments"+crypto.randomUUID().replaceAll("-","");
  const fields=[`--${boundaryOut}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({main_module:"index.js"})}\r\n`,...parts.map(part=>`--${boundaryOut}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.name}"\r\nContent-Type: application/javascript+module\r\n\r\n${part.body}\r\n`),`--${boundaryOut}--\r\n`];
  const result=await cloudflare.request({method:"PUT",path:`/accounts/${accountId}/workers/scripts/ncstar/content`,body:fields.join(""),contentType:"multipart/form-data; boundary="+boundaryOut,rawBody:true});
  return {success:result.success,status:result.status,errors:result.errors,version:result.result?.deployment_id,modifiedOn:result.result?.modified_on,hashes:actual,appPath:nextAppPath,cssPath:nextCssPath};
}
