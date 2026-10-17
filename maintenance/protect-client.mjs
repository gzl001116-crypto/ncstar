import{createRequire}from'node:module';import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';
export function protectClient(source,filename='client.mjs'){
 const require=createRequire(import.meta.url),plugin=fileURLToPath(new URL('protect-client-plugin.cjs',import.meta.url));let result;
 try{const babel=require('@babel/core');result=babel.transformSync(source,{filename,babelrc:false,configFile:false,sourceType:'module',plugins:[plugin]});}
 catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw error;const bundled=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/lib/transform/babelBundle.js');result=bundled.babelTransform(source,filename,true,[[plugin,{}]],[]);}
 if(!result?.code||/sourceMappingURL\s*=/.test(result.code))throw Error('Protected client output invalid');return result.code+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){writeFileSync(process.argv[3],protectClient(readFileSync(process.argv[2],'utf8'),process.argv[2]));}
