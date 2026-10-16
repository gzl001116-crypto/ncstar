import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import React from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const worker = readFileSync(new URL("../index.mjs", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.mjs", import.meta.url), "utf8");
const context = { Request, Response, Headers, URL, TextEncoder, TextDecoder, crypto, console, fetch, atob, btoa, File, Blob, Uint8Array, ArrayBuffer, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(worker.replace(/^import[^\n]+\n/, "const UI_ASSETS={},UI_APP_PATH='',UI_CSS_PATH='',PRIVATE_PLAYBACK={};\n").replace(/export \{\s*FanstarStore,\s*index_default as default\s*\};/, "" ) + "\nglobalThis.testApi={ensureSchema,handleApp};", context);
const db = new DatabaseSync(":memory:");
const sql = {
  exec: query => db.exec(query),
  run: (query,...args) => db.prepare(query).run(...args),
  get: (query,...args) => db.prepare(query).get(...args),
  all: (query,...args) => db.prepare(query).all(...args),
  transaction(fn) { db.exec("BEGIN"); try { const result=fn(); db.exec("COMMIT"); return result; } catch(error) { db.exec("ROLLBACK"); throw error; } },
};
context.testApi.ensureSchema(sql);
for (const [id,handle,name] of [["owner","creator","同名作者"],["reader","reader","同名作者"],["other","other","另一位读者"],["spammer","spammer","频率测试"]]) {
  sql.run("INSERT INTO users(id,name,email,password_hash,password_salt,handle,bio,is_creator,created_at) VALUES(?,?,?,'x','x',?,'',?,?)",id,name,id+"@example.test",handle,id==="owner"?1:0,new Date().toISOString());
  sql.run("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)",id+"-session",id,Date.now()+3600000);
}
for (const id of ["w1","w2"]) sql.run("INSERT INTO products(id,creator_id,title,description,price,kind,includes,cover_key,file_body) VALUES(?,'creator','Work','',1,'file','[]','','')",id);
for (const id of ["p1","p2"]) sql.run("INSERT INTO posts(id,creator_id,title,excerpt,body,created_at,min_rank,cover_key) VALUES(?,'creator','Post','','body',?,0,'')",id,new Date().toISOString());
sql.run("INSERT INTO comments(id,post_id,author,user_id,text,created_at) VALUES('legacy','p1','旧作者名','owner','原有评论',?)",new Date(Date.now()-86400000).toISOString());
async function call(kind,targetId,user,payload,origin) {
  const headers = new Headers();
  if(user) headers.set("cookie","fanstar_session="+user+"-session");
  if(origin) headers.set("origin",origin);
  if(payload) headers.set("content-type","application/json");
  const request = new Request("https://fanstar.dev/api/threads?kind="+kind+"&targetId="+targetId,{method:payload?"POST":"GET",headers,body:payload?JSON.stringify({kind,targetId,...payload}):undefined});
  const response = await context.testApi.handleApp(request,sql,{},{});
  return {status:response.status,body:await response.json()};
}
const legacy=await call("post","p1");
assert.equal(legacy.status,200);assert.equal(legacy.body.comments[0].text,"原有评论");assert.equal(legacy.body.comments[0].isAuthor,true);
assert.equal((await call("work","w1",null,{op:"comment",text:"anonymous"})).status,401);
assert.equal((await call("post","missing")).status,404);
assert.equal((await call("invalid","p1")).status,404);
assert.equal((await call("work","w1","reader",{op:"comment",text:"x"},"https://evil.test")).status,403);
for(const [kind,target,otherTarget] of [["work","w1","w2"],["post","p1","p2"]]) {
  let result=await call(kind,target,"reader",{op:"comment",text:"读者评论"});
  assert.equal(result.status,200);
  const root=result.body.comments.find(item=>item.text==="读者评论");
  assert.equal(root.isAuthor,false,"same display name cannot impersonate author");
  result=await call(kind,target,"owner",{op:"comment",text:"作者回复",parentId:root.id});
  assert.equal(result.status,200);
  const reply=result.body.comments.find(item=>item.text==="作者回复");
  assert.equal(reply.parentId,root.id);assert.equal(reply.isAuthor,true);
  result=await call(kind,target,"other",{op:"comment",text:"继续回复",parentId:reply.id});
  assert.equal(result.status,200);assert.equal(result.body.comments.find(item=>item.text==="继续回复").parentId,reply.id);
  assert.equal((await call(kind,otherTarget,"owner",{op:"comment",text:"cross-target",parentId:root.id})).status,400);
  assert.equal((await call(kind,target,"other",{op:"delete",commentId:root.id})).status,403);
  assert.equal((await call(kind,target,"owner",{op:"comment",text:" ",parentId:root.id})).status,400);
  assert.equal((await call(kind,target,"owner",{op:"comment",text:"a".repeat(1001)})).status,400);
  const reloaded=await call(kind,target,"owner");
  assert.equal(reloaded.body.comments.find(item=>item.id===reply.id).parentId,root.id,"reply survives reload");
  const deleted=await call(kind,target,"owner",{op:"delete",commentId:root.id});
  assert.equal(deleted.status,200);assert.equal(deleted.body.comments.some(item=>item.id===reply.id),false);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM comment_replies WHERE kind=?",kind).n,0);
  assert.equal((await call(kind,target,"reader",{op:"comment",text:"stale parent",parentId:root.id})).status,400);
}
for(let index=0;index<10;index++) assert.equal((await call("work","w2","spammer",{op:"comment",text:String(index)})).status,200);
assert.equal((await call("work","w2","spammer",{op:"comment",text:"too many"})).status,429);
sql.run("UPDATE products SET listed=0 WHERE id='w2'");
assert.equal((await call("work","w2")).status,404);
assert.equal((await call("work","w2","owner")).status,200);
const parent=sql.get("SELECT id FROM work_comments WHERE product_id='w2' LIMIT 1");
const countBefore=sql.get("SELECT COUNT(*) AS n FROM work_comments").n;
const run=sql.run;sql.run=(query,...args)=>{if(query.startsWith("INSERT INTO comment_replies"))throw Error("simulated storage failure");return run(query,...args);};
await assert.rejects(()=>call("work","w2","owner",{op:"comment",text:"rollback",parentId:parent.id}),/simulated storage failure/);
sql.run=run;
assert.equal(sql.get("SELECT COUNT(*) AS n FROM work_comments").n,countBefore,"failed reply writes roll back");

const sample={total:2,comments:[{id:"1",name:"作者甲",handle:"creator",text:"<script>alert(1)</script>",createdAt:new Date().toISOString(),parentId:"",isAuthor:true,canDelete:true},{id:"2",name:"读者乙",handle:"reader",text:"已保存的回复",createdAt:new Date().toISOString(),parentId:"1",isAuthor:false,canDelete:false}]};
function renderThread(user,reply=null) {
  const states=[sample,"",reply,false,"",""];let cursor=0;
  const ctx={n:{jsx,jsxs},v:{useState:()=>[states[cursor++],()=>{}],useEffect:()=>{},useRef:()=>({current:null})},he:()=>({user}),Ve:()=>({pathname:"/c/creator/posts/p1",search:""}),q:({children,...props})=>jsx("a",{...props,href:props.to,children}),ht:()=>jsx("span",{"data-avatar":true}),Fe:()=>{throw Error("unexpected network call")},Map,console};
  vm.createContext(ctx);vm.runInContext(readFileSync(new URL("thread-view.js",import.meta.url),"utf8")+"\nglobalThis.View=FanstarThread;",ctx);
  return renderToStaticMarkup(jsx(ctx.View,{kind:"post",targetId:"p1"}));
}
const html=renderThread({id:"reader"},sample.comments[0]);
assert.match(html,/取消回复/);assert.match(html,/发表回复/);assert.match(html,/tw-comment-reply/);assert.match(html,/回复 @作者甲/);assert.equal((html.match(/tw-author-badge/g)||[]).length,1);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
const guest=renderThread(null);assert.match(guest,/登录/);assert.doesNotMatch(guest,/<textarea/);
assert.ok(app.includes('n.jsx(FanstarThread,{kind:"post",targetId:P.id}'));
assert.ok(app.includes('kind: "work", targetId: product.id'));
assert.ok(!app.slice(app.indexOf("function ly("),app.indexOf("function Jd(")).includes("__DELTA__"));
const metadata=app.slice(app.indexOf("function cg("),app.indexOf("function dp("));
assert.ok(metadata.includes("以上为参考换算，实际到账金额、汇率及银行或支付服务商费用以结算时确认为准。"));
assert.ok(!metadata.includes("sourceAt")&&!metadata.includes("checkedAt")&&!metadata.includes("ExchangeRate-API"));
const finance=app.slice(app.indexOf("function yg("),app.indexOf("function ",app.indexOf("function yg(")+9));
assert.ok(!finance.includes("sourceAt")&&!finance.includes("ExchangeRate-API"));
console.log("PASS: saved post/work replies, owner identity, old comments, permissions, cross-content validation, rate limits, rollback, deletion, UI, and FX copy.");
