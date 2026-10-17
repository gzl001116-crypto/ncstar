import{readFileSync,writeFileSync}from'node:fs';import{localeReleaseCode}from'./locale-release-code.mjs';
export function publishShopFixRelease(config){const code=localeReleaseCode(config),anchor='const decoded=';if(code.split(anchor).length!==2)throw Error('Release generator changed');return code.replace(anchor,"if(!assets['/api/ui/reader-24649748.mjs']?.body?.includes('inspectReaderDocument'))throw Error('Document inspection module missing');"+anchor);}
if(process.argv[2])writeFileSync(process.argv[3],publishShopFixRelease(JSON.parse(readFileSync(process.argv[2],'utf8'))));
