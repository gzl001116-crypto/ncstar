// Apply to the current production modules, never to the older main-branch build.
// Sources are plain code strings; private playback data stays in Cloudflare.
export function applyOct16Update(index, uiModule, source) {
  const once = (value, before, after) => {
    if (!value.includes(before) || value.indexOf(before) !== value.lastIndexOf(before)) throw Error('Production source changed: ' + before.slice(0, 90));
    return value.replace(before, after);
  };
  const between = (value, start, finish, replacement) => {
    const a = value.indexOf(start), b = value.indexOf(finish, a + start.length);
    if (a < 0 || b < 0) throw Error('Missing production boundary: ' + start);
    return value.slice(0, a) + replacement + value.slice(b);
  };
  const hash = value => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(16); };
  if (index.includes('function creatorDashboardApi(')) throw Error('Update already applied');
  index = once(index, 'if(url.pathname==="/api/threads")return threadsApi(sql,request);', 'if(url.pathname==="/api/creator-dashboard")return creatorDashboardApi(sql,request);\n  if(url.pathname==="/api/threads")return threadsApi(sql,request);');
  index = once(index, 'return { comments, total: Number(sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${targetColumn}=?`, target.id)?.n || 0) };', 'return { ...commentPolicy(sql,request,kind,target), comments, total: Number(sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${targetColumn}=?`, target.id)?.n || 0) };');
  index = once(index, '  const { table, targetColumn, textColumn, target } = info;\n  if (body.op === "comment") {', '  const { table, targetColumn, textColumn, target } = info;\n  if (body.op === "setComments") return updateCommentPolicy(sql,request,kind,info,body);\n  if (body.op === "comment") {\n    if (!commentsAreOpen(sql,kind,target.id)) return communityJson({error:"作者已关闭评论，暂时无法发表评论或回复。"},403);');
  index = once(index, '  const message = textOf(body.text, 500);', '  const message = textOf(body.text, 500);\n  if (!commentsAreOpen(sql,"post",postId)) return communityJson({error:"作者已关闭评论，暂时无法发表评论或回复。"},403);');
  index = once(index, "else if(b.op==='comment'){const text=", "else if(b.op==='comment'){if(!commentsAreOpen(sql,'work',p.id))return communityJson({error:'作者已关闭评论，暂时无法发表评论或回复。'},403);const text=");
  index += '\n' + source.server;
  const appMatch = uiModule.match(/export const UI_APP_PATH=("[^"\n]+");/), cssMatch = uiModule.match(/export const UI_CSS_PATH=("[^"\n]+");/);
  const marker = 'export const UI_ASSETS=', begin = uiModule.indexOf(marker) + marker.length, end = uiModule.lastIndexOf('};') + 1;
  if (!appMatch || !cssMatch || begin < marker.length || end < begin) throw Error('Embedded UI module changed');
  const assets = JSON.parse(uiModule.slice(begin, end)), appPath = JSON.parse(appMatch[1]), cssPath = JSON.parse(cssMatch[1]);
  let app = assets[appPath].body;
  app = between(app, 'function FanstarThread({ kind, targetId })', 'function rg(', source.thread + '\n');
  app = between(app, 'function gy(){', 'function vy(){', 'function gy(){return n.jsx(FanstarDashboard,{})}');
  const labels = ['Dashboard', 'ダッシュボード', '仪表盘', '儀表板']; let labelIndex = 0;
  app = app.replace(/"studio.navHome":"[^"\\]*(?:\\.[^"\\]*)*"/g, () => '"studio.navHome":' + JSON.stringify(labels[labelIndex++]));
  if (labelIndex !== 4) throw Error('Dashboard navigation translations changed');
  app += '\n' + source.dashboard;
  const css = assets[cssPath].body + '\n' + source.css;
  const nextApp = '/api/ui/app-' + hash(app) + '.mjs', nextCss = '/api/ui/style-' + hash(css) + '.css';
  // Keep the current app for already-open pages; retire older app generations.
  for (const path of Object.keys(assets)) {
    if (/^\/api\/ui\/app-[a-f0-9]+\.mjs$/.test(path) && path !== appPath) delete assets[path];
    if (/^\/api\/ui\/style-[a-f0-9]+\.css$/.test(path) && path !== cssPath) delete assets[path];
  }
  assets[nextApp] = { ...assets[appPath], body: app };
  assets[nextCss] = { ...assets[cssPath], body: css };
  uiModule = uiModule.slice(0, begin) + JSON.stringify(assets) + uiModule.slice(end);
  uiModule = uiModule.replace(appMatch[0], 'export const UI_APP_PATH=' + JSON.stringify(nextApp) + ';');
  uiModule = uiModule.replace(cssMatch[0], 'export const UI_CSS_PATH=' + JSON.stringify(nextCss) + ';');
  return { index, uiModule, app, appPath: nextApp, cssPath: nextCss };
}
