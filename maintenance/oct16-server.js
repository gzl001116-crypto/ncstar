// Added to the current production Worker; authentication and SQL helpers are retained.
function commentPolicySchema(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS comment_settings(kind TEXT NOT NULL,target_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(kind,target_id))");
}

function commentPolicy(sql, request, kind, target) {
  commentPolicySchema(sql);
  const setting = sql.get('SELECT enabled FROM comment_settings WHERE kind=? AND target_id=?', kind, target.id);
  const viewer = userId(sql, request);
  const mine = viewer && sql.get('SELECT handle,is_creator FROM users WHERE id=?', viewer);
  return { enabled: setting ? Number(setting.enabled) === 1 : true, canManage: !!mine && Number(mine.is_creator) === 1 && mine.handle === target.creator_id };
}

function commentsAreOpen(sql, kind, targetId) {
  commentPolicySchema(sql);
  const setting = sql.get('SELECT enabled FROM comment_settings WHERE kind=? AND target_id=?', kind, targetId);
  return !setting || Number(setting.enabled) === 1;
}

function updateCommentPolicy(sql, request, kind, info, body) {
  if (!commentPolicy(sql, request, kind, info.target).canManage) return fail('err.route', 403);
  if (typeof body.enabled !== 'boolean') return communityJson({ error: '评论设置无效。' }, 400);
  sql.run('INSERT INTO comment_settings(kind,target_id,enabled)VALUES(?,?,?) ON CONFLICT(kind,target_id)DO UPDATE SET enabled=excluded.enabled', kind, info.target.id, body.enabled ? 1 : 0);
  return communityJson(threadData(sql, request, kind, info));
}

function dashboardDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function creatorDashboardApi(sql, request) {
  if (request.method !== 'GET') return fail('err.method', 405);
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get('SELECT handle,is_creator FROM users WHERE id=?', viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail('err.studio', 403);
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(today + 'T00:00:00Z'); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const from = url.searchParams.get('from') || defaultFrom.toISOString().slice(0, 10);
  const to = url.searchParams.get('to') || today;
  const start = dashboardDate(from), last = dashboardDate(to);
  const currency = (url.searchParams.get('currency') || 'cny').toLowerCase();
  if (!start || !last || last < start || last.getTime() - start.getTime() > 3660 * 86400000) return communityJson({ error: '请选择有效日期范围，最长支持 10 年。' }, 400);
  if (!SUPPORTED_FIAT.has(currency)) return communityJson({ error: '不支持该统计币种。' }, 400);
  const end = new Date(last); end.setUTCDate(end.getUTCDate() + 1);
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000);
  const bucket = dayCount > 180 ? 'month' : 'day';
  const selector = `COALESCE(NULLIF(o.creator_id,''),p.creator_id,t.creator_id)=?`;
  const joins = `FROM orders o LEFT JOIN products p ON o.kind='product' AND p.id=o.target_id LEFT JOIN tiers t ON o.kind='membership' AND t.id=o.target_id`;
  const range = `julianday(o.created_at)>=julianday(?) AND julianday(o.created_at)<julianday(?)`;
  const allCurrencies = sql.all(`SELECT DISTINCT lower(COALESCE(NULLIF(o.currency,''),'cny')) AS currency ${joins} WHERE ${selector} ORDER BY currency`, mine.handle).map(row => String(row.currency));
  const params = [mine.handle, start.toISOString(), end.toISOString(), currency];
  const where = `WHERE ${selector} AND ${range} AND lower(COALESCE(NULLIF(o.currency,''),'cny'))=?`;
  const totals = sql.get(`SELECT COUNT(*) AS orders,COALESCE(SUM(o.amount),0) AS gross,COALESCE(SUM(o.fee),0) AS fee ${joins} ${where}`, ...params);
  const dateFormat = bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const rows = sql.all(`SELECT strftime('${dateFormat}',o.created_at) AS date,COUNT(*) AS orders,SUM(o.amount) AS gross,SUM(o.fee) AS fee ${joins} ${where} GROUP BY date ORDER BY date`, ...params);
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const normalize = row => ({ orders: Number(row?.orders || 0), gross: round(row?.gross || 0), fee: round(row?.fee || 0), net: round(Number(row?.gross || 0) - Number(row?.fee || 0)) });
  const byDate = new Map(rows.map(row => [row.date, normalize(row)]));
  const series = [];
  const cursor = new Date(start);
  if (bucket === 'month') cursor.setUTCDate(1);
  while (cursor < end) {
    const date = cursor.toISOString().slice(0, bucket === 'month' ? 7 : 10);
    series.push({ date, ...(byDate.get(date) || normalize(null)) });
    if (bucket === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const typeRows = sql.all(`SELECT CASE WHEN o.kind IN ('product','membership','support') THEN o.kind ELSE 'other' END AS kind,COUNT(*) AS orders,SUM(o.amount) AS gross,SUM(o.fee) AS fee ${joins} ${where} GROUP BY 1`, ...params);
  const types = ['product', 'membership', 'support', 'other'].map(kind => ({ kind, ...normalize(typeRows.find(row => row.kind === kind)) }));
  const summary = normalize(totals);
  return communityJson({ timezone: 'UTC', from, to, bucket, currency: currency.toUpperCase(), currencies: [...new Set(['cny', ...allCurrencies])].filter(code => SUPPORTED_FIAT.has(code)).map(code => code.toUpperCase()),
    summary: { ...summary, average: summary.orders ? round(summary.net / summary.orders) : 0 }, series, types,
    updatedAt: new Date().toISOString(), basis: 'recorded',
  });
}
