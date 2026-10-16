// Patches the retained production Worker and its embedded UI. The live Worker
// includes functionality newer than main; deploying main would discard it.
export function applyCommunityUpdate(index, uiModule, source) {
  const replaceOnce = (value, before, after) => {
    if (!value.includes(before) || value.indexOf(before) !== value.lastIndexOf(before)) throw Error('Production source changed: ' + before.slice(0, 90));
    return value.replace(before, after);
  };
  const replaceBetween = (value, start, finish, replacement) => {
    const a = value.indexOf(start), b = value.indexOf(finish, a + start.length);
    if (a < 0 || b < 0) throw Error('Missing production boundary: ' + start);
    return value.slice(0, a) + replacement + value.slice(b);
  };
  const expressionEnd = (value, start) => {
    let depth = 0, quote = '', escaped = false;
    for (let i = value.indexOf('(', start); i < value.length; i++) {
      const char = value[i];
      if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue; }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if (char === '(') depth++;
      if (char === ')' && --depth === 0) return i + 1;
    }
    throw Error('Unclosed expression');
  };
  if (index.includes('function fanstarReplySchema(')) throw Error('Update already applied');
  const appMatch = uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/);
  const cssMatch = uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/);
  const marker = 'export const UI_ASSETS=';
  const begin = uiModule.indexOf(marker) + marker.length;
  const end = uiModule.lastIndexOf('};') + 1;
  if (!appMatch || !cssMatch || begin < marker.length || end < begin) throw Error('Embedded UI module changed');
  const assets = JSON.parse(uiModule.slice(begin, end));
  const appPath = JSON.parse(appMatch[1]), cssPath = JSON.parse(cssMatch[1]);
  let app = assets[appPath].body;
  app = replaceOnce(app, 'addComment:(w,g)=>N("/api/comments",{postId:w,text:g})', 'addComment:(w,g,parentId="")=>N("/api/comments",{postId:w,text:g,parentId})');
  app = replaceBetween(app, 'function cg(){', 'function dp(', 'function cg(){return n.jsx("p",{className:"fineprint",children:"以上为参考换算，实际到账金额、汇率及银行或支付服务商费用以结算时确认为准。"})}');
  const fxMeta = app.indexOf('n.jsxs("p",{className:"tw-quote-meta"');
  if (fxMeta < 0 || app[fxMeta - 1] !== ',') throw Error('Settlement metadata changed');
  app = app.slice(0, fxMeta - 1) + app.slice(expressionEnd(app, fxMeta));
  const section = app.indexOf('n.jsxs("section",{className:"comments"');
  if (section < 0) throw Error('Post comments section changed');
  app = app.slice(0, section) + 'n.jsx(FanstarComments,{kind:"post",id:P.id},P.id)' + app.slice(expressionEnd(app, section));
  app = replaceBetween(app, 'function rg({product:a})', 'function sp(', `function rg({product:a}){
    const {user}=he(), community=v.useContext(qt), [busy,setBusy]=v.useState(false),[error,setError]=v.useState("");
    return n.jsxs("section",{className:"tw-work-community",children:[
      n.jsxs("div",{className:"tw-work-social-actions",children:[n.jsx(ap,{productId:a.id}),n.jsx("button",{type:"button",className:"tw-favorite","aria-pressed":community.data.likedIds.includes(a.id),disabled:busy||!community.ready,onClick:async()=>{setBusy(true);setError("");try{await community.act(a.id,"like",!community.data.likedIds.includes(a.id))}catch(e){setError(e.message)}finally{setBusy(false)}},children:(community.data.likedIds.includes(a.id)?"♡ 已点赞":"♡ 点赞")+" · "+(community.data.counts[a.id]?.likes||0)}),n.jsx("span",{className:"muted",children:(community.data.counts[a.id]?.favorites||0)+" 人收藏"})]}),
      error&&n.jsx("p",{className:"error",role:"alert",children:error}),n.jsx(FanstarComments,{kind:"work",id:a.id},a.id)
    ]})}
  `);
  app = replaceBetween(app, 'function Sg(', 'function Yf(', 'function Sg(props){return n.jsx(FanstarPostCard,props)}');
  const rowStart = app.indexOf('z.map(_=>n.jsxs(q,{to:`/c/${B.handle}/posts/${_.id}`');
  if (rowStart < 0) throw Error('Creator post list changed');
  const rowExpr = app.indexOf('n.jsxs(', rowStart);
  app = app.slice(0, rowExpr) + 'n.jsx(FanstarPostRow,{post:_,creator:B},_.id)' + app.slice(expressionEnd(app, rowExpr));
  app += '\n' + source.ui;

  index = replaceOnce(index, 'for (const statement of STATEMENTS) sql.exec(statement);', 'for (const statement of STATEMENTS) sql.exec(statement);\n  fanstarReplySchema(sql);');
  index = replaceOnce(index, 'if(request.method==="GET"&&url.pathname==="/api/post-file")', 'if(url.pathname==="/api/comments")return fanstarPostCommentsApi(sql,request);\n  if(request.method==="GET"&&url.pathname==="/api/post-file")');
  index = replaceOnce(index, '])sql.exec(s);}', '])sql.exec(s);fanstarReplySchema(sql);}');
  const dataStart = index.indexOf('function communityWorkData('), dataEnd = index.indexOf('\nasync function communityApi(', dataStart);
  let workData = index.slice(dataStart, dataEnd);
  const queryStart = workData.indexOf('comments:sql.all(');
  if (queryStart < 0 || !workData.endsWith('};}')) throw Error('Work comments data changed');
  workData = workData.slice(0, queryStart) + 'comments:fanstarWorkComments(sql,request,p)};}';
  index = index.slice(0, dataStart) + workData + index.slice(dataEnd);
  index = replaceBetween(index, " else if(b.op==='comment'){", "\n else if(b.op==='deleteComment')", " else if(b.op==='comment'){const error=fanstarWorkCommentWrite(sql,viewer,p,b);if(error)return error;}");
  index = replaceOnce(index, "sql.run('DELETE FROM work_comments WHERE id=?',String(b.commentId));", "sql.run('UPDATE work_comments SET body = ?, deleted = 1 WHERE id = ?', '', String(b.commentId));");
  index += '\n' + source.server;

  const nextApp = '/api/ui/app-comments-20261016-v1.mjs';
  const nextCss = '/api/ui/style-comments-20261016-v1.css';
  assets[nextApp] = { ...assets[appPath], body: app };
  assets[nextCss] = { ...assets[cssPath], body: assets[cssPath].body + '\n' + source.css };
  // Retain previous content-addressed assets for clients with older HTML.
  uiModule = uiModule.slice(0, begin) + JSON.stringify(assets) + uiModule.slice(end);
  uiModule = uiModule.replace(appMatch[0], 'export const UI_APP_PATH=' + JSON.stringify(nextApp) + ';');
  uiModule = uiModule.replace(cssMatch[0], 'export const UI_CSS_PATH=' + JSON.stringify(nextCss) + ';');
  return { index, uiModule, app, appPath: nextApp, cssPath: nextCss };
}
