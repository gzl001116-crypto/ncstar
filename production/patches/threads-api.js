// Unified threads reuse existing comments so past comments stay visible.
function threadSchema(sql) {
  sql.exec("CREATE TABLE IF NOT EXISTS comment_replies(kind TEXT NOT NULL,comment_id TEXT NOT NULL,parent_id TEXT NOT NULL,PRIMARY KEY(kind,comment_id))");
  sql.exec("CREATE INDEX IF NOT EXISTS comment_replies_parent ON comment_replies(kind,parent_id)");
}

function threadInfo(sql, request, kind, targetId) {
  if (kind === "work") {
    const target = communityWork(sql, request, targetId);
    return target && { target, table: "work_comments", targetColumn: "product_id", textColumn: "body" };
  }
  if (kind === "post") {
    const target = sql.get("SELECT id,creator_id FROM posts WHERE id=?", targetId);
    return target && { target, table: "comments", targetColumn: "post_id", textColumn: "text" };
  }
  return null;
}

function threadData(sql, request, kind, info) {
  const viewer = userId(sql, request);
  const mine = viewer && sql.get("SELECT handle FROM users WHERE id=?", viewer);
  const { target, table, targetColumn, textColumn } = info;
  const comments = sql.all(`WITH RECURSIVE base AS (
    SELECT c.id,c.${textColumn} AS text,c.created_at,c.user_id,
      COALESCE(u.name,'用户') AS name,COALESCE(u.handle,'') AS handle,COALESCE(u.avatar_at,'') AS avatar_at,
      CASE WHEN parent.id IS NULL THEN '' ELSE r.parent_id END AS parent_id
    FROM ${table} c LEFT JOIN users u ON u.id=c.user_id
    LEFT JOIN comment_replies r ON r.kind=? AND r.comment_id=c.id
    LEFT JOIN ${table} parent ON parent.id=r.parent_id AND parent.${targetColumn}=c.${targetColumn}
    WHERE c.${targetColumn}=?
  ), roots AS (SELECT * FROM base WHERE parent_id='' ORDER BY created_at DESC,id DESC LIMIT 50),
  thread AS (SELECT * FROM roots UNION ALL SELECT b.* FROM base b JOIN thread t ON b.parent_id=t.id)
  SELECT * FROM thread ORDER BY created_at,id LIMIT 2000`, kind, target.id).map(row => ({
    id: String(row.id), text: String(row.text), createdAt: String(row.created_at),
    name: String(row.name), handle: String(row.handle), avatarAt: String(row.avatar_at),
    parentId: String(row.parent_id), isAuthor: String(row.handle) === String(target.creator_id),
    canDelete: !!viewer && (String(row.user_id) === viewer || mine?.handle === target.creator_id),
  }));
  return { comments, total: Number(sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${targetColumn}=?`, target.id)?.n || 0) };
}

async function threadsApi(sql, request) {
  communityTables(sql);
  threadSchema(sql);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const kind = url.searchParams.get("kind"), targetId = url.searchParams.get("targetId");
    const info = threadInfo(sql, request, kind, targetId || "");
    return info ? communityJson(threadData(sql, request, kind, info)) : communityJson({ error: "找不到这条内容。" }, 404);
  }
  if (request.method !== "POST") return fail("err.method", 405);
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  if (request.headers.get("origin") && request.headers.get("origin") !== url.origin) return fail("err.route", 403);
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(await communityBody(request)));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("Invalid request");
  } catch { return communityJson({ error: "请求无效或内容过长。" }, 400); }
  const { kind } = body;
  const info = threadInfo(sql, request, kind, String(body.targetId || ""));
  if (!info) return communityJson({ error: "找不到这条内容。" }, 404);
  const { table, targetColumn, textColumn, target } = info;
  if (body.op === "comment") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || Array.from(text).length > 1000) return communityJson({ error: "评论须为 1 至 1000 字。" }, 400);
    const parentId = typeof body.parentId === "string" ? body.parentId : "";
    const parent = parentId && sql.get(`SELECT id,user_id FROM ${table} WHERE id=? AND ${targetColumn}=?`, parentId, target.id);
    if (parentId && !parent) return communityJson({ error: "这条评论已不存在，请重新选择回复对象。" }, 400);
    const recent = sql.get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=? AND created_at>?`, viewer, new Date(Date.now() - 60000).toISOString());
    if (Number(recent?.n) >= 10) return communityJson({ error: "评论过于频繁，请稍后再试。" }, 429);
    const commentId = crypto.randomUUID(), at = new Date().toISOString();
    sql.transaction(() => {
      if (kind === "work") sql.run("INSERT INTO work_comments(id,user_id,product_id,body,created_at) VALUES(?,?,?,?,?)", commentId, viewer, target.id, text, at);
      else {
        const author = sql.get("SELECT name FROM users WHERE id=?", viewer);
        sql.run("INSERT INTO comments(id,post_id,author,user_id,text,created_at) VALUES(?,?,?,?,?,?)", commentId, target.id, String(author?.name || "用户"), viewer, text, at);
      }
      if (parentId) sql.run("INSERT INTO comment_replies(kind,comment_id,parent_id) VALUES(?,?,?)", kind, commentId, parentId);
      notifyCreator(sql, target.creator_id, viewer, kind === "work" ? "work-comment" : "post-comment", target.id);
      const owner = sql.get("SELECT id FROM users WHERE handle=?", target.creator_id);
      if (parent && parent.user_id !== viewer && parent.user_id !== owner?.id) {
        sql.run("INSERT INTO notifications(id,user_id,actor_id,kind,target_id,created_at,read_at) VALUES(?,?,?,?,?,?,?)", crypto.randomUUID(), parent.user_id, viewer, kind === "work" ? "work-comment" : "post-comment", target.id, at, "");
      }
    });
  } else if (body.op === "delete") {
    const commentId = String(body.commentId || "");
    const row = sql.get(`SELECT user_id FROM ${table} WHERE id=? AND ${targetColumn}=?`, commentId, target.id);
    const mine = sql.get("SELECT handle FROM users WHERE id=?", viewer);
    if (!row || (row.user_id !== viewer && mine?.handle !== target.creator_id)) return fail("err.route", 403);
    sql.transaction(() => {
      const descendants = sql.all(`WITH RECURSIVE subtree(id) AS (
        SELECT id FROM ${table} WHERE id=? AND ${targetColumn}=?
        UNION SELECT r.comment_id FROM comment_replies r JOIN subtree s ON r.parent_id=s.id
        JOIN ${table} c ON c.id=r.comment_id AND c.${targetColumn}=? WHERE r.kind=?
      ) SELECT id FROM subtree`, commentId, target.id, target.id, kind);
      for (const child of descendants) {
        sql.run(`DELETE FROM ${table} WHERE id=? AND ${targetColumn}=?`, child.id, target.id);
        sql.run("DELETE FROM comment_replies WHERE kind=? AND comment_id=?", kind, child.id);
      }
    });
  } else return fail("err.route");
  return communityJson(threadData(sql, request, kind, info));
}
