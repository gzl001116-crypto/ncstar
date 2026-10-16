import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] || "../../");
const output = resolve(here, "..");
const original = {
  worker: readFileSync(resolve(input, "live-worker.mjs"), "utf8"),
  app: readFileSync(resolve(input, "live-app.mjs"), "utf8"),
  css: readFileSync(resolve(input, "live-style.css"), "utf8"),
};
const replacements = [];
let app = original.app;
function replace(old, value) {
  if (!old || app.split(old).length !== 2) throw Error("Expected one exact replacement: " + old.slice(0,90));
  replacements.push({ old, value });
  app = app.replace(old, () => value);
}
function component(name) {
  const start = app.indexOf("function " + name + "(");
  if (start < 0) throw Error("Missing component " + name);
  return app.slice(start, app.indexOf("function ", start + 9));
}
const notice = "以上为参考换算，实际到账金额、汇率及银行或支付服务商费用以结算时确认为准。";
replace(component("cg"), 'function cg(){return n.jsx("p",{className:"fineprint",children:' + JSON.stringify(notice) + '})}');
const finance = component("yg");
const metadataStart = finance.indexOf('n.jsxs("p",{className:"tw-quote-meta"');
if (metadataStart < 0 || !finance.endsWith("})}")) throw Error("Settlement component changed");
// The final metadata paragraph follows the existing settlement disclaimer.
replace(finance, finance.slice(0, metadataStart - 1) + "]})}");
replace(component("rg"), readFileSync(resolve(here,"thread-view.js"), "utf8"));
const post = component("ly");
const section = post.indexOf('n.jsxs("section",{className:"comments"');
if (section < 0 || !post.endsWith("]})}")) throw Error("Post component changed");
let newPost = post.slice(0,section) + 'n.jsx(FanstarThread,{kind:"post",targetId:P.id},P.id)]})}';
// Repair an existing malformed member-tier guard encountered on the post page.
newPost = newPost.replace('__DELTA__&n.jsx(q', () => '$&&n.jsx(q');
newPost = newPost.replace('[W.name,n.jsxs("small"', '[W.name,n.jsx("span",{className:"tw-author-badge",children:"作者"}),n.jsxs("small"');
replace(post, newPost);
const card = component("Sg");
const newCard = card.replace('posts/${a.id}`', 'posts/${a.id}#comments`').replace('n.jsx("span",{children:m.name})', 'n.jsx("span",{children:m.name}),n.jsx("small",{className:"muted",children:"评论 / 回复 →"})');
replace(card,newCard);
const route = '  if(url.pathname==="/api/community")return communityApi(sql,request);';
if (original.worker.split(route).length !== 2) throw Error("Worker route changed");
const backend = readFileSync(resolve(here,"threads-api.js"),"utf8");
const worker = original.worker.replace(route, '  if(url.pathname==="/api/threads")return threadsApi(sql,request);\n' + route) + "\n" + backend;
const css = original.css + "\n" + readFileSync(resolve(here,"thread-style.css"),"utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
const manifest = { baseline: Object.fromEntries(Object.entries(original).map(([key,value]) => [key,hash(value)])), expected: { worker:hash(worker), app:hash(app), css:hash(css) }, route, backend, replacements, style:css.slice(original.css.length) };
writeFileSync(resolve(output,"index.mjs"),worker);
writeFileSync(resolve(output,"app.mjs"),app);
writeFileSync(resolve(output,"styles.css"),css);
writeFileSync(resolve(output,"deployment-patch.json"),JSON.stringify(manifest));
console.log(JSON.stringify({baseline:manifest.baseline,expected:manifest.expected,replacements:replacements.length}));
