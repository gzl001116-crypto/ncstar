import { matchCode, type Limiter, type MailEnv } from "./codes.ts";
import { sessionCookieHeaders } from "./hosts.ts";
import { isPlayFormat, parsePlay } from "./play.ts";
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
  `CREATE TABLE IF NOT EXISTS play_saved (
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS play_progress (
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    cursor TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  )`,
];

function ensureSchema(sql: Sql) {
  for (const statement of STATEMENTS) sql.exec(statement);
  for (const statement of [
    "ALTER TABLE products ADD COLUMN play_format TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN play_body TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN file_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN file_type TEXT NOT NULL DEFAULT ''",
  ]) {
    try {
      sql.exec(statement);
    } catch {
      /* The column is already there after the first request. */
    }
  }
}

function json(body: unknown, status = 200, cookies?: string | string[]) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
  const list = !cookies ? [] : Array.isArray(cookies) ? cookies : [cookies];
  for (const cookie of list) response.headers.append("set-cookie", cookie);
  return response;
}

function disposition(filename: string, inline: boolean) {
  const ascii = filename.replace(/[^\u0020-\u007E]+/g, "_") || "file";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function text(body: string, status: number, filename: string) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": disposition(filename, false),
    },
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const MAX_UPLOAD = 8 * 1024 * 1024;

function inferPlay(productId: string, filename: string, mime: string, bytes: Uint8Array) {
  const name = filename.toLowerCase();
  const type = mime.toLowerCase();
  const media = `/api/media?productId=${encodeURIComponent(productId)}`;
  const decode = () => new TextDecoder().decode(bytes).slice(0, 100_000);
  if (type.startsWith("text/html") || name.endsWith(".html") || name.endsWith(".htm")) {
    return { format: "game", body: JSON.stringify({ html: decode() }) };
  }
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return { format: "novel", body: JSON.stringify({ novel: decode() }) };
  }
  if (type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|flac)$/.test(name)) {
    const title = filename.replace(/\.[^.]+$/, "").slice(0, 80) || filename;
    return { format: "voice", body: JSON.stringify({ tracks: [{ title, src: media, text: "" }] }) };
  }
  if (type.startsWith("video/") || /\.(mp4|webm)$/.test(name)) {
    return { format: "video", body: JSON.stringify({ video: media }) };
  }
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) {
    return { format: "comic", body: JSON.stringify({ pages: [{ text: "", image: media }] }) };
  }
  return { format: "", body: "" };
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
  return sessionCookieHeaders(new URL(request.url), token, maxAge);
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
    playFormat: String(row.play_format ?? ""),
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
        playList: sql.all("SELECT product_id FROM play_saved WHERE user_id = ? ORDER BY created_at DESC", viewer).map((row) => String(row.product_id)),
        playProgress: sql.all("SELECT * FROM play_progress WHERE user_id = ? ORDER BY updated_at DESC", viewer).map((row) => ({
          productId: String(row.product_id),
          cursor: String(row.cursor),
          updatedAt: String(row.updated_at),
        })),
      }
    : null;
  return { creators, posts, products, tiers, comments, user };
}

function withState(sql: Sql, viewer: string, code: string, cookie?: string | string[], name?: string) {
  return json({ ...snapshot(sql, viewer), code, ...(name ? { name } : {}) }, 200, cookie);
}

function fail(code: string, status = 400) {
  return json({ code }, status);
}

function requireUser(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  if (!viewer) return { viewer: "", response: fail("err.loginRequired", 401) };
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
  if (!name) return fail("err.name");
  if (!email) return fail("err.email");
  if (password.length < 6) return fail("err.password");
  if (!handle) return fail("err.handle");
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`verify:ip:${ip}`, 20, 600)) || !(await limiter.allowed(`verify:${ticket}`, 5, 600))) {
    return fail("err.code.limit", 429);
  }
  await limiter.record(`verify:ip:${ip}`, 600);
  await limiter.record(`verify:${ticket}`, 600);
  const codeError = await matchCode(env, email, code, ticket, expiresAt);
  if (codeError) return fail(codeError, codeError === "err.mail.unconfigured" ? 503 : 400);
  if (sql.get("SELECT id FROM users WHERE email = ?", email)) return fail("err.email.taken");
  if (sql.get("SELECT id FROM users WHERE handle = ?", handle) || sql.get("SELECT id FROM creators WHERE handle = ?", handle)) {
    return fail("err.handle.taken");
  }
  const user = id();
  const passwordSalt = salt();
  const passwordHash = await hashPassword(password, passwordSalt);
  const bio = "刚来到 fanstar。";
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
  return withState(sql, user, body.isCreator === true ? "toast.creatorReady" : "toast.accountReady", sessionCookie(request, session, SESSION_MS / 1000));
}

async function login(sql: Sql, request: Request, body: Record<string, unknown>, limiter: Limiter) {
  const email = emailOf(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`login:ip:${ip}`, 20, 600))) return fail("err.login.limit", 429);
  await limiter.record(`login:ip:${ip}`, 600);
  const row = email ? sql.get("SELECT * FROM users WHERE email = ?", email) : undefined;
  if (!row) return fail("err.login", 401);
  const hashed = await hashPassword(password, String(row.password_salt));
  if (hashed !== String(row.password_hash)) return fail("err.login", 401);
  const session = token();
  sql.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", session, String(row.id), Date.now() + SESSION_MS);
  return withState(sql, String(row.id), "toast.welcome", sessionCookie(request, session, SESSION_MS / 1000), String(row.name));
}

function logout(sql: Sql, request: Request) {
  const current = cookieToken(request);
  if (current) sql.run("DELETE FROM sessions WHERE token = ?", current);
  return withState(sql, "", "toast.logout", sessionCookie(request, "", 0));
}

function follow(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const creatorId = textOf(body.creatorId, 40);
  if (!sql.get("SELECT id FROM creators WHERE id = ?", creatorId)) return fail("err.creator.missing");
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (mine && String(mine.handle) === creatorId) return fail("err.follow.self");
  const existing = sql.get("SELECT user_id FROM follows WHERE user_id = ? AND creator_id = ?", viewer, creatorId);
  if (existing) sql.run("DELETE FROM follows WHERE user_id = ? AND creator_id = ?", viewer, creatorId);
  else sql.run("INSERT INTO follows (user_id, creator_id) VALUES (?, ?)", viewer, creatorId);
  return withState(sql, viewer, existing ? "toast.unfollow" : "toast.follow");
}

function like(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const postId = textOf(body.postId, 80);
  if (!sql.get("SELECT id FROM posts WHERE id = ?", postId)) return fail("err.post.missing");
  const existing = sql.get("SELECT user_id FROM likes WHERE user_id = ? AND post_id = ?", viewer, postId);
  if (existing) sql.run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", viewer, postId);
  else sql.run("INSERT INTO likes (user_id, post_id) VALUES (?, ?)", viewer, postId);
  return withState(sql, viewer, existing ? "toast.unlike" : "toast.like");
}

function comment(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const postId = textOf(body.postId, 80);
  const message = textOf(body.text, 500);
  if (!sql.get("SELECT id FROM posts WHERE id = ?", postId)) return fail("err.post.missing");
  if (!message) return fail("err.comment.empty");
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
  return withState(sql, viewer, "toast.comment");
}

function cart(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const productId = textOf(body.productId, 80);
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product) return fail("err.product.missing");
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (body.op === "remove") {
    sql.run("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, productId);
    return withState(sql, viewer, "toast.cart.remove");
  }
  if (mine && String(mine.handle) === String(product.creator_id)) return fail("err.product.self");
  if (sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, productId)) return fail("err.product.owned");
  if (sql.get("SELECT product_id FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, productId)) return fail("err.cart.exists");
  sql.run("INSERT INTO cart_items (user_id, product_id) VALUES (?, ?)", viewer, productId);
  return withState(sql, viewer, "toast.cart.add");
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
  if (!mine) return fail("err.loginRequired", 401);
  const tierId = textOf(body.tierId, 80);
  if (tierId) {
    const tier = sql.get("SELECT * FROM tiers WHERE id = ?", tierId);
    if (!tier) return fail("err.tier.missing");
    if (String(tier.creator_id) === String(mine.handle)) return fail("err.tier.self");
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
    return withState(sql, viewer, "toast.member");
  }
  const items = sql.all(
    `SELECT products.* FROM cart_items JOIN products ON products.id = cart_items.product_id
     WHERE cart_items.user_id = ?`,
    viewer,
  );
  const payable = items.filter((item) => String(item.creator_id) !== String(mine.handle));
  if (payable.length === 0) return fail("err.cart.empty");
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
  return withState(sql, viewer, "toast.library");
}

function publishPost(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  const title = textOf(body.title, 80);
  const content = textOf(body.body, 8000);
  const excerpt = textOf(body.excerpt, 140) || content.slice(0, 42);
  const minRank = Number(body.minRank ?? 0);
  if (title.length < 2) return fail("err.title");
  if (content.length < 8) return fail("err.body");
  if (![0, 1, 2].includes(minRank)) return fail("err.rank");
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
  return withState(sql, viewer, "toast.post");
}

function publishProduct(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  const title = textOf(body.title, 80);
  const description = textOf(body.description, 2000) || "创作者刚刚上架的数字作品。";
  const fileBody = textOf(body.fileBody, 20000);
  const price = Number(body.price);
  const kind = textOf(body.kind, 40) || "数字作品";
  const playFormat = textOf(body.playFormat, 20);
  const playSource = typeof body.playBody === "string" ? body.playBody.trim().slice(0, 100_000) : "";
  const includes = Array.isArray(body.includes)
    ? body.includes.map((item) => textOf(item, 40)).filter(Boolean).slice(0, 8)
    : [];
  if (title.length < 2) return fail("err.product.title");
  if (fileBody.length < 8) return fail("err.file");
  if (!Number.isFinite(price) || price <= 0 || price > 9999) return fail("err.price");
  if (playFormat && !isPlayFormat(playFormat)) return fail("err.play.format");
  const parsed = parsePlay(playFormat, playSource);
  if (!parsed.ok) return fail(parsed.code);
  sql.run(
    "INSERT INTO products (id, creator_id, title, description, price, kind, includes, cover_key, file_body, play_format, play_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id(),
    String(mine.handle),
    title,
    description,
    Math.round(price * 100) / 100,
    kind,
    JSON.stringify(includes.length ? includes : [fileName(title)]),
    id(),
    fileBody,
    playFormat,
    playFormat ? JSON.stringify(parsed.body) : "",
  );
  return withState(sql, viewer, "toast.product");
}

async function publishUpload(sql: Sql, request: Request) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("err.file");
  }
  const title = textOf(form.get("title"), 80);
  const description = textOf(form.get("description"), 2000) || "创作者刚刚上架的数字作品。";
  const price = Number(form.get("price"));
  const kind = textOf(form.get("kind"), 40) || "数字作品";
  const includes = textOf(form.get("includes"), 400)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  const uploaded = form.get("file");
  if (!(uploaded instanceof File)) return fail("err.file");
  if (uploaded.size < 1) return fail("err.file");
  if (uploaded.size > MAX_UPLOAD) return fail("err.file.size");
  if (title.length < 2) return fail("err.product.title");
  if (!Number.isFinite(price) || price <= 0 || price > 9999) return fail("err.price");
  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const productId = id();
  const filename = uploaded.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
  const mime = (uploaded.type || "application/octet-stream").slice(0, 120);
  const play = inferPlay(productId, filename, mime, bytes);
  sql.run(
    "INSERT INTO products (id, creator_id, title, description, price, kind, includes, cover_key, file_body, file_name, file_type, play_format, play_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    productId,
    String(mine.handle),
    title,
    description,
    Math.round(price * 100) / 100,
    kind,
    JSON.stringify(includes.length ? includes : [filename]),
    id(),
    bytesToBase64(bytes),
    filename,
    mime,
    play.format,
    play.body,
  );
  return withState(sql, viewer, "toast.product");
}

function profile(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
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
  return withState(sql, viewer, "toast.profile");
}

function studio(sql: Sql, request: Request) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
  if (Number(mine.is_creator) === 1 && sql.get("SELECT id FROM creators WHERE id = ?", String(mine.handle))) {
    return withState(sql, viewer, "toast.studio.exists");
  }
  openCreator(sql, mine);
  return withState(sql, viewer, "toast.creatorReady");
}

function download(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  const postId = url.searchParams.get("postId") ?? "";
  if (productId) {
    const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return fail("err.product.missing", 404);
    const mine = viewer ? sql.get("SELECT handle FROM users WHERE id = ?", viewer) : undefined;
    const owns = sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, productId);
    if (!owns && !(mine && String(mine.handle) === String(product.creator_id))) return fail("err.download.product", 403);
    return fileResponse(product, false);
  }
  if (postId) {
    const post = sql.get("SELECT * FROM posts WHERE id = ?", postId);
    if (!post) return fail("err.post.missing", 404);
    const mine = viewer ? sql.get("SELECT handle FROM users WHERE id = ?", viewer) : undefined;
    const open = canRead(sql, viewer, String(post.creator_id), Number(post.min_rank), mine ? String(mine.handle) : "");
    if (!open) return fail("err.download.post", 403);
    return text(String(post.body), 200, fileName(String(post.title)));
  }
  return fail("err.file.missing", 404);
}

function fileResponse(product: Row, inline: boolean) {
  const storedName = String(product.file_name ?? "");
  if (!storedName) return text(String(product.file_body), 200, fileName(String(product.title)));
  const bytes = base64ToBytes(String(product.file_body));
  const type = String(product.file_type || "application/octet-stream");
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "private, no-store",
      "content-disposition": disposition(storedName, inline),
    },
  });
}

function media(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.file_name ?? "")) return fail("err.file.missing", 404);
  if (!canPlay(sql, viewer, product)) return fail("err.play.forbidden", 403);
  return fileResponse(product, true);
}

function canPlay(sql: Sql, viewer: string, product: Row) {
  if (!viewer) return false;
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (mine && String(mine.handle) === String(product.creator_id)) return true;
  return Boolean(sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, String(product.id)));
}

function playRead(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  if (!viewer) return fail("err.loginRequired", 401);
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.play_format)) return fail("err.play.missing", 404);
  if (!canPlay(sql, viewer, product)) return fail("err.play.forbidden", 403);
  let body: unknown = {};
  try {
    body = JSON.parse(String(product.play_body || "{}"));
  } catch {
    body = {};
  }
  return json({
    id: String(product.id),
    format: String(product.play_format),
    title: String(product.title),
    creatorId: String(product.creator_id),
    ...(body as object),
  });
}

function playWrite(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const productId = textOf(body.productId, 80);
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.play_format)) return fail("err.play.missing", 404);
  if (!canPlay(sql, viewer, product)) return fail("err.play.forbidden", 403);
  if (body.op === "progress") {
    const cursor = textOf(body.cursor, 40);
    const now = new Date().toISOString();
    sql.run("DELETE FROM play_progress WHERE user_id = ? AND product_id = ?", viewer, productId);
    sql.run(
      "INSERT INTO play_progress (user_id, product_id, cursor, updated_at) VALUES (?, ?, ?, ?)",
      viewer,
      productId,
      cursor,
      now,
    );
    return json(snapshot(sql, viewer));
  }
  const existing = sql.get("SELECT product_id FROM play_saved WHERE user_id = ? AND product_id = ?", viewer, productId);
  if (existing) sql.run("DELETE FROM play_saved WHERE user_id = ? AND product_id = ?", viewer, productId);
  else sql.run("INSERT INTO play_saved (user_id, product_id, created_at) VALUES (?, ?, ?)", viewer, productId, new Date().toISOString());
  return withState(sql, viewer, existing ? "toast.play.unsave" : "toast.play.save");
}

export async function handleApp(request: Request, sql: Sql, env: MailEnv, limiter: Limiter): Promise<Response> {
  ensureSchema(sql);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/state") return json(snapshot(sql, userId(sql, request)));
  if (request.method === "GET" && url.pathname === "/api/download") return download(sql, request);
  if (request.method === "GET" && url.pathname === "/api/media") return media(sql, request);
  if (request.method === "GET" && url.pathname === "/api/play") return playRead(sql, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return fail("err.method", 405);
  if (url.pathname === "/api/products" && (request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return publishUpload(sql, request);
  }
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
  if (url.pathname === "/api/play") return playWrite(sql, request, body);
  if (url.pathname === "/api/profile") return profile(sql, request, body);
  if (url.pathname === "/api/studio") return studio(sql, request);
  return fail("err.route", 404);
}
