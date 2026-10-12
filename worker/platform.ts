import { matchCode, type Limiter, type MailEnv } from "./codes.ts";
import type { Row, Sql, SqlValue } from "./sql.ts";

const COOKIE = "fanstar_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    handle TEXT NOT NULL UNIQUE,
    bio TEXT NOT NULL,
    is_creator INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS creators (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    bio TEXT NOT NULL,
    tags TEXT NOT NULL,
    since TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tiers (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    rank INTEGER NOT NULL,
    blurb TEXT NOT NULL,
    perks TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    min_rank INTEGER NOT NULL,
    cover_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    kind TEXT NOT NULL,
    includes TEXT NOT NULL,
    cover_key TEXT NOT NULL,
    file_body TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    author TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS follows (
    user_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    PRIMARY KEY (user_id, creator_id)
  )`,
  `CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id)
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    user_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (user_id, creator_id)
  )`,
  `CREATE TABLE IF NOT EXISTS purchases (
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    purchased_at TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (user_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    amount REAL NOT NULL,
    fee REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

function ensureSchema(sql: Sql) {
  for (const statement of STATEMENTS) sql.exec(statement);
}

function json(body: unknown, status = 200, cookie?: string) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
  if (cookie) response.headers.set("set-cookie", cookie);
  return response;
}

function text(body: string, status: number, filename: string) {
  const ascii = filename.replace(/[^\u0020-\u007E]+/g, "_");
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    if (data && typeof data === "object") return data as Record<string, unknown>;
  } catch {
    /* empty */
  }
  return {};
}

function cookieToken(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function id() {
  return crypto.randomUUID();
}

function token() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emailOf(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function handleOf(value: unknown) {
  if (typeof value !== "string") return "";
  const handle = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,16}$/.test(handle) ? handle : "";
}

function textOf(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sinceNow() {
  const now = new Date();
  return `${now.getFullYear()}.${`${now.getMonth() + 1}`.padStart(2, "0")}`;
}

function addDays(days: number) {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function feeOf(amount: number) {
  return Math.round(amount * 0.08 * 100) / 100;
}

function bytesLabel(value: string) {
  const bytes = new TextEncoder().encode(value).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function fileName(title: string) {
  const clean = title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40) || "作品";
  return clean.endsWith(".txt") ? clean : `${clean}.txt`;
}

async function hashPassword(password: string, saltHex: string) {
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function salt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function userId(sql: Sql, request: Request) {
  const current = cookieToken(request);
  if (!current) return "";
  const row = sql.get(
    "SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?",
    current,
    Date.now(),
  );
  return row ? String(row.user_id) : "";
}

function canRead(sql: Sql, viewer: string, creatorId: string, minRank: number, viewerHandle: string) {
  if (minRank <= 0) return true;
  if (viewer && viewerHandle === creatorId) return true;
  if (!viewer) return false;
  const row = sql.get(
    `SELECT tiers.rank AS rank, memberships.expires_at AS expires_at
     FROM memberships JOIN tiers ON tiers.id = memberships.tier_id
     WHERE memberships.user_id = ? AND memberships.creator_id = ?`,
    viewer,
    creatorId,
  );
  if (!row) return false;
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return false;
  return Number(row.rank) >= minRank;
}

function snapshot(sql: Sql, viewer: string) {
  const viewerRow = viewer ? sql.get("SELECT * FROM users WHERE id = ?", viewer) : undefined;
  const viewerHandle = viewerRow ? String(viewerRow.handle) : "";
  const creators = sql.all("SELECT * FROM creators ORDER BY since DESC, name").map((row) => ({
    id: String(row.id),
    handle: String(row.handle),
    name: String(row.name),
    category: String(row.category),
    location: String(row.location),
    bio: String(row.bio),
    tags: JSON.parse(String(row.tags)) as string[],
    followers: sql.all("SELECT user_id FROM follows WHERE creator_id = ?", String(row.id)).length,
    supporters: sql.all(
      "SELECT user_id FROM memberships WHERE creator_id = ? AND expires_at > ?",
      String(row.id),
      new Date().toISOString(),
    ).length,
    since: String(row.since),
  }));
  const posts = sql
    .all("SELECT * FROM posts ORDER BY created_at DESC")
    .map((row) => {
      const minRank = Number(row.min_rank);
      const body = String(row.body);
      const open = canRead(sql, viewer, String(row.creator_id), minRank, viewerHandle);
      return {
        id: String(row.id),
        creatorId: String(row.creator_id),
        title: String(row.title),
        excerpt: String(row.excerpt),
        body: open ? body : "",
        createdAt: String(row.created_at),
        likes: sql.all("SELECT user_id FROM likes WHERE post_id = ?", String(row.id)).length,
        minRank,
        attachments:
          minRank > 0
            ? [{ name: fileName(String(row.title)), size: bytesLabel(body), minRank }]
            : [],
        coverKey: String(row.cover_key),
      };
    });
  const products = sql.all("SELECT * FROM products ORDER BY rowid DESC").map((row) => ({
    id: String(row.id),
    creatorId: String(row.creator_id),
    title: String(row.title),
    description: String(row.description),
    price: Number(row.price),
    kind: String(row.kind),
    includes: JSON.parse(String(row.includes)) as string[],
    coverKey: String(row.cover_key),
  }));
  const tiers = sql.all("SELECT * FROM tiers ORDER BY rank").map((row) => ({
    id: String(row.id),
    creatorId: String(row.creator_id),
    name: String(row.name),
    price: Number(row.price),
    rank: Number(row.rank),
    blurb: String(row.blurb),
    perks: JSON.parse(String(row.perks)) as string[],
  }));
  const comments = sql.all("SELECT * FROM comments ORDER BY created_at").map((row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    author: String(row.author),
    text: String(row.text),
    createdAt: String(row.created_at),
  }));
  const user = viewerRow
    ? {
        id: String(viewerRow.id),
        name: String(viewerRow.name),
        email: String(viewerRow.email),
        handle: String(viewerRow.handle),
        bio: String(viewerRow.bio),
        isCreator: Number(viewerRow.is_creator) === 1,
        follows: sql.all("SELECT creator_id FROM follows WHERE user_id = ?", viewer).map((row) => String(row.creator_id)),
        likes: sql.all("SELECT post_id FROM likes WHERE user_id = ?", viewer).map((row) => String(row.post_id)),
        memberships: sql.all("SELECT * FROM memberships WHERE user_id = ?", viewer).map((row) => ({
          creatorId: String(row.creator_id),
          tierId: String(row.tier_id),
          expiresAt: String(row.expires_at),
        })),
        library: sql.all("SELECT * FROM purchases WHERE user_id = ?", viewer).map((row) => ({
          productId: String(row.product_id),
          purchasedAt: String(row.purchased_at),
        })),
        cart: sql.all("SELECT product_id FROM cart_items WHERE user_id = ?", viewer).map((row) => String(row.product_id)),
      }
    : null;
  return { creators, posts, products, tiers, comments, user };
}

function withState(sql: Sql, viewer: string, toast: string, cookie?: string) {
  return json({ ...snapshot(sql, viewer), toast }, 200, cookie);
}

function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

function requireUser(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  if (!viewer) return { viewer: "", response: fail("请先登录", 401) };
  return { viewer, response: null as Response | null };
}

function openCreator(sql: Sql, user: Row) {
  const handle = String(user.handle);
  if (!sql.get("SELECT id FROM creators WHERE id = ?", handle)) {
    sql.run(
      "INSERT INTO creators (id, handle, name, category, location, bio, tags, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      handle,
      handle,
      String(user.name),
      "写作",
      "未填写",
      String(user.bio),
      JSON.stringify(["写作"]),
      sinceNow(),
    );
  }
  if (!sql.get("SELECT id FROM tiers WHERE creator_id = ?", handle)) {
    const tiers = [
      ["读者席", 18, 1, "解锁会员动态，并下载附件。", ["会员动态", "附件下载", "30 天，不自动续费"]],
      ["内页", 42, 2, "更早看到新作，并包含读者席的全部内容。", ["包含读者席", "更高档位的动态", "30 天，不自动续费"]],
    ] as const;
    for (const [name, price, rank, blurb, perks] of tiers) {
      sql.run(
        "INSERT INTO tiers (id, creator_id, name, price, rank, blurb, perks) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id(),
        handle,
        name,
        price,
        rank,
        blurb,
        JSON.stringify(perks),
      );
    }
  }
  sql.run("UPDATE users SET is_creator = 1 WHERE id = ?", String(user.id));
}

async function register(sql: Sql, request: Request, body: Record<string, unknown>, env: MailEnv, limiter: Limiter) {
  const name = textOf(body.name, 40);
  const email = emailOf(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const handle = handleOf(body.handle);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const ticket = typeof body.token === "string" ? body.token : "";
  const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : Number(body.expiresAt);
  if (!name) return fail("请填写名字");
  if (!email) return fail("请填写有效邮箱");
  if (password.length < 6) return fail("密码至少 6 位");
  if (!handle) return fail("主页地址用 3-16 位小写字母、数字或下划线");
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`verify:ip:${ip}`, 20, 600)) || !(await limiter.allowed(`verify:${ticket}`, 5, 600))) {
    return fail("验证次数过多，请重新获取验证码", 429);
  }
  await limiter.record(`verify:ip:${ip}`, 600);
  await limiter.record(`verify:${ticket}`, 600);
  const codeError = await matchCode(env, email, code, ticket, expiresAt);
  if (codeError) return fail(codeError, codeError === "邮件服务还没有配置" ? 503 : 400);
  if (sql.get("SELECT id FROM users WHERE email = ?", email)) return fail("这个邮箱已经注册");
  if (sql.get("SELECT id FROM users WHERE handle = ?", handle) || sql.get("SELECT id FROM creators WHERE handle = ?", handle)) {
    return fail("这个主页地址已经被使用");
  }
  const user = id();
  const passwordSalt = salt();
  const passwordHash = await hashPassword(password, passwordSalt);
  const bio = "刚来到星页。";
  sql.run(
    "INSERT INTO users (id, name, email, password_hash, password_salt, handle, bio, is_creator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
    user,
    name,
    email,
    passwordHash,
    passwordSalt,
    handle,
    bio,
    new Date().toISOString(),
  );
  if (body.isCreator === true) openCreator(sql, { id: user, handle, name, bio } as Row);
  const session = token();
  sql.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", session, user, Date.now() + SESSION_MS);
  return withState(sql, user, body.isCreator === true ? "创作页已开通" : "账号已就绪", sessionCookie(request, session, SESSION_MS / 1000));
}

async function login(sql: Sql, request: Request, body: Record<string, unknown>, limiter: Limiter) {
  const email = emailOf(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`login:ip:${ip}`, 20, 600))) return fail("登录太频繁，请稍后再试", 429);
  await limiter.record(`login:ip:${ip}`, 600);
  const row = email ? sql.get("SELECT * FROM users WHERE email = ?", email) : undefined;
  if (!row) return fail("邮箱或密码不正确", 401);
  const hashed = await hashPassword(password, String(row.password_salt));
  if (hashed !== String(row.password_hash)) return fail("邮箱或密码不正确", 401);
  const session = token();
  sql.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", session, String(row.id), Date.now() + SESSION_MS);
  return withState(sql, String(row.id), `欢迎回来，${row.name}`, sessionCookie(request, session, SESSION_MS / 1000));
}

function logout(sql: Sql, request: Request) {
  const current = cookieToken(request);
  if (current) sql.run("DELETE FROM sessions WHERE token = ?", current);
  return withState(sql, "", "已退出", sessionCookie(request, "", 0));
}

function follow(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const creatorId = textOf(body.creatorId, 40);
  if (!sql.get("SELECT id FROM creators WHERE id = ?", creatorId)) return fail("找不到这个创作者");
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (mine && String(mine.handle) === creatorId) return fail("不用关注自己");
  const existing = sql.get("SELECT user_id FROM follows WHERE user_id = ? AND creator_id = ?", viewer, creatorId);
  if (existing) sql.run("DELETE FROM follows WHERE user_id = ? AND creator_id = ?", viewer, creatorId);
  else sql.run("INSERT INTO follows (user_id, creator_id) VALUES (?, ?)", viewer, creatorId);
  return withState(sql, viewer, existing ? "已取消关注" : "已关注");
}

function like(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const postId = textOf(body.postId, 80);
  if (!sql.get("SELECT id FROM posts WHERE id = ?", postId)) return fail("找不到这条动态");
  const existing = sql.get("SELECT user_id FROM likes WHERE user_id = ? AND post_id = ?", viewer, postId);
  if (existing) sql.run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", viewer, postId);
  else sql.run("INSERT INTO likes (user_id, post_id) VALUES (?, ?)", viewer, postId);
  return withState(sql, viewer, existing ? "已取消喜欢" : "已喜欢");
}

function comment(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const postId = textOf(body.postId, 80);
  const message = textOf(body.text, 500);
  if (!sql.get("SELECT id FROM posts WHERE id = ?", postId)) return fail("找不到这条动态");
  if (!message) return fail("评论不能为空");
  const author = sql.get("SELECT name FROM users WHERE id = ?", viewer);
  sql.run(
    "INSERT INTO comments (id, post_id, author, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id(),
    postId,
    author ? String(author.name) : "读者",
    viewer,
    message,
    new Date().toISOString(),
  );
  return withState(sql, viewer, "评论已发布");
}

function cart(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const productId = textOf(body.productId, 80);
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product) return fail("找不到这件作品");
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (body.op === "remove") {
    sql.run("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, productId);
    return withState(sql, viewer, "已从购物袋移除");
  }
  if (mine && String(mine.handle) === String(product.creator_id)) return fail("这是你自己的作品");
  if (sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, productId)) return fail("这件作品已经在库里");
  if (sql.get("SELECT product_id FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, productId)) return fail("已经在购物袋里");
  sql.run("INSERT INTO cart_items (user_id, product_id) VALUES (?, ?)", viewer, productId);
  return withState(sql, viewer, "已放入购物袋");
}

function placeOrder(sql: Sql, viewer: string, kind: string, targetId: string, amount: number) {
  sql.run(
    "INSERT INTO orders (id, user_id, kind, target_id, amount, fee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id(),
    viewer,
    kind,
    targetId,
    amount,
    feeOf(amount),
    new Date().toISOString(),
  );
}

function checkout(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("请先登录", 401);
  const tierId = textOf(body.tierId, 80);
  if (tierId) {
    const tier = sql.get("SELECT * FROM tiers WHERE id = ?", tierId);
    if (!tier) return fail("找不到这个会员档");
    if (String(tier.creator_id) === String(mine.handle)) return fail("不能开通自己的会员");
    const expiresAt = addDays(30);
    sql.run("DELETE FROM memberships WHERE user_id = ? AND creator_id = ?", viewer, String(tier.creator_id));
    sql.run(
      "INSERT INTO memberships (user_id, creator_id, tier_id, expires_at, price) VALUES (?, ?, ?, ?, ?)",
      viewer,
      String(tier.creator_id),
      String(tier.id),
      expiresAt,
      Number(tier.price),
    );
    placeOrder(sql, viewer, "membership", String(tier.id), Number(tier.price));
    return withState(sql, viewer, "会员已生效");
  }
  const items = sql.all(
    `SELECT products.* FROM cart_items JOIN products ON products.id = cart_items.product_id
     WHERE cart_items.user_id = ?`,
    viewer,
  );
  const payable = items.filter((item) => String(item.creator_id) !== String(mine.handle));
  if (payable.length === 0) return fail("购物袋里没有可结算的作品");
  const now = new Date().toISOString();
  for (const item of payable) {
    sql.run(
      "INSERT OR REPLACE INTO purchases (user_id, product_id, purchased_at, price) VALUES (?, ?, ?, ?)",
      viewer,
      String(item.id),
      now,
      Number(item.price),
    );
    placeOrder(sql, viewer, "product", String(item.id), Number(item.price));
  }
  sql.run("DELETE FROM cart_items WHERE user_id = ?", viewer);
  return withState(sql, viewer, "已入库");
}

function publishPost(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("先开通创作页");
  const title = textOf(body.title, 80);
  const content = textOf(body.body, 8000);
  const excerpt = textOf(body.excerpt, 140) || content.slice(0, 42);
  const minRank = Number(body.minRank ?? 0);
  if (title.length < 2) return fail("标题再写具体一点");
  if (content.length < 8) return fail("正文再多写一点");
  if (![0, 1, 2].includes(minRank)) return fail("可见范围不正确");
  sql.run(
    "INSERT INTO posts (id, creator_id, title, excerpt, body, created_at, min_rank, cover_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id(),
    String(mine.handle),
    title,
    excerpt,
    content,
    new Date().toISOString(),
    minRank,
    id(),
  );
  return withState(sql, viewer, "动态已发布");
}

function publishProduct(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("先开通创作页");
  const title = textOf(body.title, 80);
  const description = textOf(body.description, 2000) || "创作者刚刚上架的数字作品。";
  const fileBody = textOf(body.fileBody, 20000);
  const price = Number(body.price);
  const kind = textOf(body.kind, 40) || "数字作品";
  const includes = Array.isArray(body.includes)
    ? body.includes.map((item) => textOf(item, 40)).filter(Boolean).slice(0, 8)
    : [];
  if (title.length < 2) return fail("给作品起个名字");
  if (fileBody.length < 8) return fail("写下购买后可以下载的正文");
  if (!Number.isFinite(price) || price <= 0 || price > 9999) return fail("价格需要在 1 到 9999 之间");
  sql.run(
    "INSERT INTO products (id, creator_id, title, description, price, kind, includes, cover_key, file_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id(),
    String(mine.handle),
    title,
    description,
    Math.round(price * 100) / 100,
    kind,
    JSON.stringify(includes.length ? includes : [fileName(title)]),
    id(),
    fileBody,
  );
  return withState(sql, viewer, "作品已上架");
}

function profile(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("请先登录", 401);
  const name = textOf(body.name, 40) || String(mine.name);
  const bio = textOf(body.bio, 400) || String(mine.bio);
  const location = textOf(body.location, 40);
  const category = textOf(body.category, 20);
  const allowed = ["插画", "音乐", "设计", "摄影", "写作", "图案"];
  sql.run("UPDATE users SET name = ?, bio = ? WHERE id = ?", name, bio, viewer);
  if (Number(mine.is_creator) === 1) {
    const sets: string[] = ["name = ?", "bio = ?"];
    const params: SqlValue[] = [name, bio];
    if (location) {
      sets.push("location = ?");
      params.push(location);
    }
    if (allowed.includes(category)) {
      sets.push("category = ?");
      params.push(category);
    }
    params.push(String(mine.handle));
    sql.run(`UPDATE creators SET ${sets.join(", ")} WHERE id = ?`, ...params);
  }
  return withState(sql, viewer, "主页已更新");
}

function studio(sql: Sql, request: Request) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("请先登录", 401);
  if (Number(mine.is_creator) === 1 && sql.get("SELECT id FROM creators WHERE id = ?", String(mine.handle))) {
    return withState(sql, viewer, "创作页已在");
  }
  openCreator(sql, mine);
  return withState(sql, viewer, "创作页已开通");
}

function download(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  const postId = url.searchParams.get("postId") ?? "";
  if (productId) {
    const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return fail("找不到这件作品", 404);
    const mine = viewer ? sql.get("SELECT handle FROM users WHERE id = ?", viewer) : undefined;
    const owns = sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, productId);
    if (!owns && !(mine && String(mine.handle) === String(product.creator_id))) return fail("购买后才能下载", 403);
    return text(String(product.file_body), 200, fileName(String(product.title)));
  }
  if (postId) {
    const post = sql.get("SELECT * FROM posts WHERE id = ?", postId);
    if (!post) return fail("找不到这条动态", 404);
    const mine = viewer ? sql.get("SELECT handle FROM users WHERE id = ?", viewer) : undefined;
    const open = canRead(sql, viewer, String(post.creator_id), Number(post.min_rank), mine ? String(mine.handle) : "");
    if (!open) return fail("开通会员后才能下载", 403);
    return text(String(post.body), 200, fileName(String(post.title)));
  }
  return fail("找不到这个文件", 404);
}

export async function handleApp(request: Request, sql: Sql, env: MailEnv, limiter: Limiter): Promise<Response> {
  ensureSchema(sql);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/state") return json(snapshot(sql, userId(sql, request)));
  if (request.method === "GET" && url.pathname === "/api/download") return download(sql, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return fail("请使用 POST", 405);
  const body = await readJson(request);
  if (url.pathname === "/api/register") return register(sql, request, body, env, limiter);
  if (url.pathname === "/api/login") return login(sql, request, body, limiter);
  if (url.pathname === "/api/logout") return logout(sql, request);
  if (url.pathname === "/api/follow") return follow(sql, request, body);
  if (url.pathname === "/api/like") return like(sql, request, body);
  if (url.pathname === "/api/comments") return comment(sql, request, body);
  if (url.pathname === "/api/cart") return cart(sql, request, body);
  if (url.pathname === "/api/checkout") return checkout(sql, request, body);
  if (url.pathname === "/api/posts") return publishPost(sql, request, body);
  if (url.pathname === "/api/products") return publishProduct(sql, request, body);
  if (url.pathname === "/api/profile") return profile(sql, request, body);
  if (url.pathname === "/api/studio") return studio(sql, request);
  return fail("没有这个接口", 404);
}
