import { matchCode, type Limiter, type MailEnv } from "./codes.ts";
import { sessionCookieHeaders } from "./hosts.ts";
import { isPlayFormat, parsePlay } from "./play.ts";
import type { Row, Sql, SqlValue } from "./sql.ts";
import { CRYPTO_MAX_MINOR, CRYPTO_MIN_MINOR, quoteCnyPerUsd, sessionFields, signatureMatches, splitUsdMinors, stripeForm, stripeGet, stripeKey, stripeRequest, stripeSend, usdMinorUnits, webhookSecret, type PayEnv, type StripeSession } from "./stripe.ts";

const COOKIE = "fanstar_session";
const SUPPORTED_FIAT = new Set(["usd", "cny", "gbp", "eur", "jpy", "hkd", "sgd", "cad", "aud"]);
let fxRatesCache: { at: number; rates: Record<string, number> } | undefined;

async function loadFxRates(fetchImpl: typeof fetch): Promise<Record<string, number> | undefined> {
  if (fxRatesCache && Date.now() - fxRatesCache.at < 5 * 60 * 1000) return fxRatesCache.rates;
  try {
    const response = await fetchImpl("https://open.er-api.com/v6/latest/USD", { headers: { accept: "application/json" } });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates || !SUPPORTED_FIAT.has("usd")) return undefined;
    const rates: Record<string, number> = { USD: 1 };
    for (const currency of SUPPORTED_FIAT) {
      const rate = currency === "usd" ? 1 : Number(data.rates[currency.toUpperCase()]);
      if (!Number.isFinite(rate) || rate <= 0) return undefined;
      rates[currency.toUpperCase()] = rate;
    }
    fxRatesCache = { at: Date.now(), rates };
    return rates;
  } catch {
    return undefined;
  }
}

function currencyOf(value: unknown, fallback = "cny") {
  const currency = String(value ?? fallback).trim().toLowerCase();
  return SUPPORTED_FIAT.has(currency) ? currency : "";
}

function coinValue(amount: number, currency: string, rates: Record<string, number>) {
  const rate = rates[currency.toUpperCase()];
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round((amount / rate) * 100) / 100;
}
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
    created_at TEXT NOT NULL,
    coins REAL NOT NULL DEFAULT 0
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
    price_currency TEXT NOT NULL DEFAULT 'cny',
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
    price_currency TEXT NOT NULL DEFAULT 'cny',
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
  `CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    track_index INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, product_id, track_index)
  )`,
  `CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    coins REAL NOT NULL,
    fiat_amount REAL NOT NULL,
    fiat_currency TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coin_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    balance_after REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS creator_supports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    coins REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coin_topups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    coins REAL NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    session_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS coin_api_nonces (
    nonce TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    session_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

function ensureSchema(sql: Sql) {
  for (const statement of STATEMENTS) sql.exec(statement);
  for (const statement of [
    "ALTER TABLE products ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'cny'",
    "ALTER TABLE tiers ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'cny'",
    "ALTER TABLE users ADD COLUMN coins REAL NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN play_format TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN play_body TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN file_name TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN file_type TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE products ADD COLUMN allow_play INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE products ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE products ADD COLUMN allow_preview INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN preview_mode TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN preview_limit INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN preview_body TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN listed INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE products ADD COLUMN cover_body TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN cover_type TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN cover_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN removed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN avatar_type TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN avatar_at TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN stripe_account_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN payout_ready INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN payout_method TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE orders ADD COLUMN creator_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE orders ADD COLUMN fiat_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN fiat_currency TEXT NOT NULL DEFAULT 'cny'",
    "ALTER TABLE orders ADD COLUMN coin_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'cny'",
    "ALTER TABLE orders ADD COLUMN transfer_id TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE payments ADD COLUMN charged_currency TEXT NOT NULL DEFAULT 'cny'",
    "ALTER TABLE payments ADD COLUMN charged_amount INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      sql.exec(statement);
    } catch {
      /* The column is already there after the first request. */
    }
  }
  sql.run("UPDATE products SET description = '' WHERE description = ?", "创作者刚刚上架的数字作品。");
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
const MAX_AVATAR = 1024 * 1024;
const CREATOR_CATEGORIES = ["插画", "音乐", "设计", "摄影", "写作", "图案"];

function imageType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "";
}

function tagsOf(value: unknown) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [] as string[];
  }
}

function parseWorkTags(value: unknown): { ok: true; tags: string[] } | { ok: false; code: string } {
  const raw = typeof value === "string" ? value.split(/[,，]/) : Array.isArray(value) ? value : [];
  const tags: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (!tag) continue;
    if (Array.from(tag).length > 5) return { ok: false, code: "err.tag.length" };
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > 10) return { ok: false, code: "err.tag.count" };
  return { ok: true, tags };
}

function inferPlay(productId: string, filename: string, mime: string, bytes: Uint8Array) {
  const name = filename.toLowerCase();
  const type = mime.toLowerCase();
  const media = `/api/media?productId=${encodeURIComponent(productId)}`;
  const decode = () => new TextDecoder().decode(bytes).slice(0, 100_000);
  if (type.startsWith("text/html") || name.endsWith(".html") || name.endsWith(".htm")) {
    return { format: "game", body: JSON.stringify({ html: decode() }) };
  }
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".text")) {
    return { format: "novel", body: JSON.stringify({ novel: decode() }) };
  }
  if (type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|flac)$/.test(name)) {
    const title = filename.replace(/\.[^.]+$/, "").slice(0, 80) || filename;
    return { format: "voice", body: JSON.stringify({ tracks: [{ title, src: media, text: "" }] }) };
  }
  if (type.startsWith("video/") || /\.(mp4|webm)$/.test(name)) {
    return { format: "video", body: JSON.stringify({ video: media }) };
  }
  if (type.startsWith("image/svg") || name.endsWith(".svg")) return { format: "", body: "" };
  if ((type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/.test(name)) && !name.endsWith(".svg")) {
    return { format: "comic", body: JSON.stringify({ pages: [{ text: "", image: media }] }) };
  }
  return { format: "", body: "" };
}

type ChosenAccess = {
  allowPlay: number;
  allowDownload: number;
  allowPreview: number;
  previewMode: string;
  previewLimit: number;
  previewBody: string;
};

function fieldOf(source: FormData | Record<string, unknown>, key: string) {
  if (source instanceof FormData) {
    const value = source.get(key);
    return value === null ? undefined : value;
  }
  return key in source ? source[key] : undefined;
}

function flagOn(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "on" || value === "true";
}

function chosenAccess(source: FormData | Record<string, unknown>): ChosenAccess | { code: string } | undefined {
  const playField = fieldOf(source, "play");
  const downloadField = fieldOf(source, "download");
  if (playField === undefined && downloadField === undefined) return undefined;
  const allowPlay = flagOn(playField);
  const allowDownload = flagOn(downloadField);
  if (!allowPlay && !allowDownload) return { code: "err.open" };
  const allowPreview = flagOn(fieldOf(source, "preview"));
  if (allowPreview && !allowPlay) return { code: "err.preview.play" };
  if (!allowPreview) {
    return {
      allowPlay: allowPlay ? 1 : 0,
      allowDownload: allowDownload ? 1 : 0,
      allowPreview: 0,
      previewMode: "",
      previewLimit: 0,
      previewBody: "",
    };
  }
  const mode = textOf(fieldOf(source, "previewMode"), 20);
  if (mode !== "content" && mode !== "progress") return { code: "err.preview" };
  if (mode === "content") {
    const previewBody = textOf(fieldOf(source, "previewBody"), 4000);
    if (Array.from(previewBody).length < 1) return { code: "err.preview.body" };
    return { allowPlay: 1, allowDownload: allowDownload ? 1 : 0, allowPreview: 1, previewMode: "content", previewLimit: 0, previewBody };
  }
  const limit = Number(fieldOf(source, "previewLimit"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 20000) return { code: "err.preview.limit" };
  return { allowPlay: 1, allowDownload: allowDownload ? 1 : 0, allowPreview: 1, previewMode: "progress", previewLimit: limit, previewBody: "" };
}

function legacyAccess(play: boolean): ChosenAccess {
  return { allowPlay: play ? 1 : 0, allowDownload: 1, allowPreview: 0, previewMode: "", previewLimit: 0, previewBody: "" };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

function cutText(value: string, limit: number) {
  return Array.from(value).slice(0, Math.max(0, limit)).join("");
}

function safeNote(value: string) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;user-select:none;-webkit-user-select:none}</style><body><pre style="white-space:pre-wrap;font:16px/1.7 sans-serif;padding:28px">${escapeHtml(value)}</pre></body>`;
}

function clipPlay(format: string, body: Record<string, unknown>, mode: string, limit: number, custom: string) {
  if (mode === "content") {
    if (format === "novel") return { novel: custom };
    if (format === "comic") return { pages: [{ text: custom, image: "" }] };
    if (format === "voice") return { tracks: [{ title: "", src: "", text: custom }] };
    if (format === "video") return { note: custom };
    return { html: safeNote(custom) };
  }
  if (format === "novel") return { novel: cutText(String(body.novel ?? ""), limit) };
  if (format === "comic") return { pages: Array.isArray(body.pages) ? body.pages.slice(0, limit) : [] };
  if (format === "voice") return { tracks: Array.isArray(body.tracks) ? body.tracks.slice(0, 1) : [] };
  if (format === "video") return { video: String(body.video ?? "") };
  return { html: safeNote(cutText(String(body.html ?? ""), limit)) };
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

function handleTaken(sql: Sql, handle: string, exceptUserId = "") {
  const user = sql.get("SELECT id FROM users WHERE handle = ?", handle);
  if (user && String(user.id) !== exceptUserId) return true;
  const creator = sql.get("SELECT id FROM creators WHERE id = ?", handle);
  if (!creator) return false;
  const owner = exceptUserId ? sql.get("SELECT handle FROM users WHERE id = ?", exceptUserId) : undefined;
  return !owner || String(owner.handle) !== handle;
}

function privateHandle(sql: Sql) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const handle = `u${token().slice(0, 12)}`;
    if (!handleTaken(sql, handle)) return handle;
  }
  return "";
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

function snapshot(sql: Sql, viewer: string, rates: Record<string, number> | undefined = fxRatesCache?.rates) {
  const viewerRow = viewer ? sql.get("SELECT * FROM users WHERE id = ?", viewer) : undefined;
  const viewerHandle = viewerRow ? String(viewerRow.handle) : "";
  const avatarByHandle = new Map(
    sql.all("SELECT handle, avatar_at FROM users").map((row) => [String(row.handle), String(row.avatar_at ?? "")]),
  );
  const creators = sql.all("SELECT * FROM creators ORDER BY since DESC, name").map((row) => ({
    id: String(row.id),
    handle: String(row.handle),
    name: String(row.name),
    category: String(row.category),
    location: String(row.location),
    bio: String(row.bio),
    tags: JSON.parse(String(row.tags)) as string[],
    avatarAt: avatarByHandle.get(String(row.handle)) ?? "",
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
  const ownedIds = new Set(
    viewer ? sql.all("SELECT product_id FROM purchases WHERE user_id = ?", viewer).map((row) => String(row.product_id)) : [],
  );
  const products = sql
    .all("SELECT * FROM products ORDER BY rowid DESC")
    .filter((row) => {
      const removed = Number(row.removed ?? 0) === 1;
      const listed = Number(row.listed ?? 1) === 1;
      const mine = String(row.creator_id) === viewerHandle;
      const owned = ownedIds.has(String(row.id));
      if (removed) return owned;
      return listed || mine || owned;
    })
    .map((row) => ({
    id: String(row.id),
    creatorId: String(row.creator_id),
    title: String(row.title),
    description: String(row.description),
    price: Number(row.price),
    priceCurrency: String(row.price_currency ?? "cny").toLowerCase(),
    coinPrice: rates ? coinValue(Number(row.price), String(row.price_currency ?? "cny").toLowerCase(), rates) : undefined,
    kind: String(row.kind),
    includes: JSON.parse(String(row.includes)) as string[],
    coverKey: String(row.cover_key),
    playFormat: String(row.play_format ?? ""),
    tags: tagsOf(row.tags),
    allowPlay: Number(row.allow_play ?? 1) === 1,
    allowDownload: Number(row.allow_download ?? 1) === 1,
    allowPreview: Number(row.allow_preview ?? 0) === 1,
    previewMode: String(row.preview_mode ?? ""),
    previewLimit: Number(row.preview_limit ?? 0),
    previewBody: viewerHandle === String(row.creator_id) ? String(row.preview_body ?? "") : "",
    listed: Number(row.listed ?? 1) === 1,
    coverAt: String(row.cover_at ?? ""),
  }));
  const tiers = sql.all("SELECT * FROM tiers ORDER BY rank").map((row) => ({
    id: String(row.id),
    creatorId: String(row.creator_id),
    name: String(row.name),
    price: Number(row.price),
    priceCurrency: String(row.price_currency ?? "cny").toLowerCase(),
    coinPrice: rates ? coinValue(Number(row.price), String(row.price_currency ?? "cny").toLowerCase(), rates) : undefined,
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
        avatarAt: String(viewerRow.avatar_at ?? ""),
        isCreator: Number(viewerRow.is_creator) === 1,
        coins: Number(viewerRow.coins ?? 0),
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
        playlists: playlistsOf(sql, viewer),
      }
    : null;
  return { creators, posts, products, tiers, comments, user };
}

function playlistsOf(sql: Sql, viewer: string) {
  return sql.all("SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC", viewer).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    items: sql
      .all("SELECT product_id, track_index FROM playlist_items WHERE playlist_id = ? ORDER BY position", String(row.id))
      .map((item) => ({ productId: String(item.product_id), trackIndex: Number(item.track_index) })),
  }));
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

function openCreator(sql: Sql, user: Row, extra?: { category: string; location: string; bio: string }) {
  const handle = String(user.handle);
  const category = extra?.category || "写作";
  const location = extra?.location || "未填写";
  const bio = extra?.bio || String(user.bio);
  if (!sql.get("SELECT id FROM creators WHERE id = ?", handle)) {
    sql.run(
      "INSERT INTO creators (id, handle, name, category, location, bio, tags, since) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      handle,
      handle,
      String(user.name),
      category,
      location,
      bio,
      JSON.stringify([category]),
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
  const wantsCreator = body.isCreator === true;
  const handle = wantsCreator ? handleOf(body.handle) : privateHandle(sql);
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
  if (handleTaken(sql, handle)) return fail("err.handle.taken");
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
  if (wantsCreator) openCreator(sql, { id: user, handle, name, bio } as Row);
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

async function changePassword(sql: Sql, request: Request, body: Record<string, unknown>, env: MailEnv, limiter: Limiter) {
  const viewer = userId(sql, request);
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const ticket = typeof body.token === "string" ? body.token : "";
  const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : Number(body.expiresAt);
  if (password.length < 6) return fail("err.password");
  const mine = viewer ? sql.get("SELECT * FROM users WHERE id = ?", viewer) : undefined;
  if (viewer && !mine) return fail("err.loginRequired", 401);
  const email = mine ? String(mine.email) : emailOf(body.email);
  if (!email) return fail("err.email");
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`verify:ip:${ip}`, 20, 600)) || !(await limiter.allowed(`verify:${ticket}`, 5, 600))) {
    return fail("err.code.limit", 429);
  }
  await limiter.record(`verify:ip:${ip}`, 600);
  await limiter.record(`verify:${ticket}`, 600);
  const codeError = await matchCode(env, email, code, ticket, expiresAt);
  if (codeError) return fail(codeError, codeError === "err.mail.unconfigured" ? 503 : 400);
  const row = sql.get("SELECT * FROM users WHERE email = ?", email);
  if (!row) return fail("err.login", 401);
  const user = String(row.id);
  const passwordSalt = salt();
  const passwordHash = await hashPassword(password, passwordSalt);
  sql.run("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", passwordHash, passwordSalt, user);
  sql.run("DELETE FROM sessions WHERE user_id = ?", user);
  const session = token();
  sql.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", session, user, Date.now() + SESSION_MS);
  return withState(sql, user, "toast.password", sessionCookie(request, session, SESSION_MS / 1000));
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
  if (!product || Number(product.listed ?? 1) !== 1) return fail("err.product.missing", 404);
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

function placeOrder(sql: Sql, viewer: string, kind: string, targetId: string, amount: number, creatorId: string, currency = "cny", rates?: Record<string, number>, coinAmount = 0) {
  const fiatCurrency = currency.toLowerCase();
  const cnyRate = rates?.CNY;
  const fiatRate = rates?.[fiatCurrency.toUpperCase()];
  const payoutAmount = rates && Number.isFinite(cnyRate) && Number.isFinite(fiatRate) && fiatRate > 0
    ? Math.round((amount / fiatRate) * cnyRate * 100) / 100
    : amount;
  sql.run(
    "INSERT INTO orders (id, user_id, kind, target_id, amount, fee, created_at, creator_id, currency, transfer_id, fiat_amount, fiat_currency, coin_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cny', '', ?, ?, ?)",
    id(),
    viewer,
    kind,
    targetId,
    payoutAmount,
    feeOf(payoutAmount),
    new Date().toISOString(),
    creatorId,
    amount,
    fiatCurrency,
    coinAmount,
  );
}

type PayItem = { id: string; price: number; priceCurrency: string; title: string; creatorId: string };
type PayPayload =
  | { kind: "membership"; tierId: string; creatorId: string; price: number; priceCurrency: string; title: string }
  | { kind: "product"; items: PayItem[] };

function minorUnits(amount: number) {
  return Math.round(amount * 100);
}

function stripeLocale(value: unknown) {
  if (value === "ja" || value === "en") return value;
  if (value === "zh-Hant") return "zh-TW";
  return "zh";
}

function payAmount(payload: PayPayload) {
  return payload.kind === "membership" ? minorUnits(payload.price) : payload.items.reduce((sum, item) => sum + minorUnits(item.price), 0);
}

function coinCheckout(sql: Sql, viewer: string, payload: PayPayload, key: string, rates: Record<string, number>) {
  if (key.length < 8 || key.length > 120) return fail("err.pay.idempotency");
  const kind = payload.kind;
  const title = payload.kind === "membership" ? payload.title : undefined;
  const expectedTarget = payload.kind === "membership" ? payload.tierId : payload.items.map((item) => item.id).join(",");
  try {
    const result = sql.transaction(() => {
      const prior = sql.get("SELECT id, user_id, kind, target_id FROM coin_transactions WHERE idempotency_key = ?", key);
      if (prior) {
        if (String(prior.user_id) !== viewer || String(prior.kind) !== kind || String(prior.target_id) !== expectedTarget) {
          throw new Error("err.pay.idempotency");
        }
        return { duplicate: true, code: kind === "membership" ? "toast.member" : "toast.library" };
      }
      const allItems = payload.kind === "product" ? payload.items : [];
      const items = allItems.filter((item) => !sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, item.id));
      if (payload.kind === "product" && items.length === 0) return { duplicate: true, code: "toast.library" };
      const price = payload.kind === "membership" ? payload.price : items.reduce((sum, item) => sum + item.price, 0);
      const coinParts = payload.kind === "membership"
        ? [coinValue(payload.price, payload.priceCurrency, rates)]
        : items.map((item) => coinValue(item.price, item.priceCurrency, rates));
      const coins = Math.round(coinParts.reduce((sum, value) => sum + value, 0) * 100) / 100;
      if (!Number.isFinite(coins) || coins <= 0) throw new Error("err.pay.fx");
      const user = sql.get("SELECT coins FROM users WHERE id = ?", viewer);
      const balance = Number(user?.coins ?? 0);
      if (balance + 1e-9 < coins) throw new Error("err.coin.insufficient");
      sql.run("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?", coins, viewer, coins);
      const after = sql.get("SELECT coins FROM users WHERE id = ?", viewer);
      const transactionId = id();
      const now = new Date().toISOString();
      const currency = payload.kind === "membership" ? payload.priceCurrency : items[0]?.priceCurrency ?? "usd";
      const targetId = payload.kind === "membership" ? payload.tierId : items.map((item) => item.id).join(",");
      sql.run(
        "INSERT INTO coin_transactions (id, idempotency_key, user_id, kind, target_id, coins, fiat_amount, fiat_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        transactionId, key, viewer, kind, targetId, coins, price, currency, now,
      );
      sql.run(
        "INSERT INTO coin_ledger (id, user_id, transaction_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id(), viewer, transactionId, -coins, Number(after?.coins ?? 0), now,
      );
      if (payload.kind === "membership") {
        const current = sql.get("SELECT expires_at FROM memberships WHERE user_id = ? AND creator_id = ?", viewer, payload.creatorId);
        const currentExpiry = current ? Date.parse(String(current.expires_at)) : 0;
        const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now();
        const expiresAt = new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString();
        sql.run("DELETE FROM memberships WHERE user_id = ? AND creator_id = ?", viewer, payload.creatorId);
        sql.run(
          "INSERT INTO memberships (user_id, creator_id, tier_id, expires_at, price) VALUES (?, ?, ?, ?, ?)",
          viewer, payload.creatorId, payload.tierId, expiresAt, payload.price,
        );
        placeOrder(sql, viewer, "membership", payload.tierId, payload.price, payload.creatorId, payload.priceCurrency, rates, coins);
      } else {
        for (const item of items) {
          sql.run(
            "INSERT INTO purchases (user_id, product_id, purchased_at, price) VALUES (?, ?, ?, ?)",
            viewer, item.id, now, item.price,
          );
          sql.run("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, item.id);
          placeOrder(sql, viewer, "product", item.id, item.price, item.creatorId, item.priceCurrency, rates, coinParts[items.indexOf(item)] ?? 0);
        }
      }
      return { duplicate: false, code: kind === "membership" ? "toast.member" : "toast.library" };
    });
    return withState(sql, viewer, result.code, undefined, title);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("err.")) return fail(message);
    const prior = sql.get("SELECT id FROM coin_transactions WHERE idempotency_key = ?", key);
    if (prior) return withState(sql, viewer, kind === "membership" ? "toast.member" : "toast.library", undefined, title);
    return fail("err.coin.transaction", 500);
  }
}

function creatorSupport(sql: Sql, request: Request, body: Record<string, unknown>, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const creatorId = textOf(body.creatorId, 80);
  const creator = sql.get("SELECT handle FROM creators WHERE handle = ?", creatorId);
  if (!creator) return fail("err.creator.missing", 404);
  if (String(creator.handle) === String(sql.get("SELECT handle FROM users WHERE id = ?", viewer)?.handle)) return fail("err.product.self");
  const amount = Number(body.amount);
  const currency = currencyOf(body.currency);
  const key = textOf(body.idempotencyKey, 120);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9999 || !currency || key.length < 8) return fail("err.pay.amount");
  return loadFxRates(fetchImpl).then((rates) => {
    if (!rates) return fail("err.pay.fx");
    const coins = coinValue(amount, currency, rates);
    if (coins <= 0) return fail("err.pay.small");
    try {
      sql.transaction(() => {
        const prior = sql.get("SELECT id, user_id, kind, target_id FROM coin_transactions WHERE idempotency_key = ?", key);
        if (prior) {
          if (String(prior.user_id) !== viewer || String(prior.kind) !== "support" || String(prior.target_id) !== creatorId) throw new Error("err.pay.idempotency");
          return;
        }
        const user = sql.get("SELECT coins FROM users WHERE id = ?", viewer);
        if (Number(user?.coins ?? 0) + 1e-9 < coins) throw new Error("err.coin.insufficient");
        sql.run("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?", coins, viewer, coins);
        const after = sql.get("SELECT coins FROM users WHERE id = ?", viewer);
        const transactionId = id();
        const now = new Date().toISOString();
        sql.run(
          "INSERT INTO coin_transactions (id, idempotency_key, user_id, kind, target_id, coins, fiat_amount, fiat_currency, created_at) VALUES (?, ?, ?, 'support', ?, ?, ?, ?, ?)",
          transactionId, key, viewer, creatorId, coins, amount, currency, now,
        );
        sql.run(
          "INSERT INTO coin_ledger (id, user_id, transaction_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          id(), viewer, transactionId, -coins, Number(after?.coins ?? 0), now,
        );
        sql.run(
          "INSERT INTO creator_supports (id, user_id, creator_id, amount, currency, coins, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          id(), viewer, creatorId, amount, currency, coins, now,
        );
        placeOrder(sql, viewer, "support", creatorId, amount, creatorId, currency, rates, coins);
      });
      return withState(sql, viewer, "toast.support");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("err.")) return fail(message);
      if (sql.get("SELECT id FROM coin_transactions WHERE idempotency_key = ?", key)) return withState(sql, viewer, "toast.support");
      return fail("err.coin.transaction", 500);
    }
  });
}

function fulfillPayment(sql: Sql, viewer: string, payment: Row) {
  const payload = JSON.parse(String(payment.payload)) as PayPayload;
  const code = payload.kind === "membership" ? "toast.member" : "toast.library";
  const name = payload.kind === "membership" ? payload.title : undefined;
  if (String(payment.status) === "paid") return withState(sql, viewer, code, undefined, name);
  if (payload.kind === "membership") {
    const expiresAt = addDays(30);
    sql.run("DELETE FROM memberships WHERE user_id = ? AND creator_id = ?", viewer, payload.creatorId);
    sql.run(
      "INSERT INTO memberships (user_id, creator_id, tier_id, expires_at, price) VALUES (?, ?, ?, ?, ?)",
      viewer,
      payload.creatorId,
      payload.tierId,
      expiresAt,
      payload.price,
    );
    placeOrder(sql, viewer, "membership", payload.tierId, payload.price, payload.creatorId);
  } else {
    const now = new Date().toISOString();
    for (const item of payload.items) {
      if (!sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, item.id)) {
        sql.run(
          "INSERT OR REPLACE INTO purchases (user_id, product_id, purchased_at, price) VALUES (?, ?, ?, ?)",
          viewer,
          item.id,
          now,
          item.price,
        );
        placeOrder(sql, viewer, "product", item.id, item.price, item.creatorId);
      }
      sql.run("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, item.id);
    }
  }
  sql.run("UPDATE payments SET status = 'paid' WHERE id = ?", String(payment.id));
  return withState(sql, viewer, code, undefined, name);
}

function expectedCharge(payment: Row, payload: PayPayload) {
  const currency = String(payment.charged_currency ?? "cny").toLowerCase();
  if (currency === "usd") return { currency, amount: Number(payment.charged_amount) };
  return { currency: "cny", amount: payAmount(payload) };
}

function sessionMatches(session: StripeSession, payment: Row, viewer: string) {
  const payload = JSON.parse(String(payment.payload)) as PayPayload;
  const expected = expectedCharge(payment, payload);
  return (
    session.amount_total === expected.amount &&
    (session.currency ?? "").toLowerCase() === expected.currency &&
    session.metadata.paymentId === String(payment.id) &&
    session.metadata.userId === viewer
  );
}

async function checkout(sql: Sql, request: Request, body: Record<string, unknown>, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
  const tierId = textOf(body.tierId, 80);
  const directId = textOf(body.productId, 80);
  let payload: PayPayload;
  let cancelPath = "/checkout?pay=cancel";
  if (directId) {
    const product = sql.get("SELECT * FROM products WHERE id = ?", directId);
    if (!product || Number(product.removed ?? 0) === 1 || Number(product.listed ?? 1) !== 1) return fail("err.product.missing", 404);
    if (String(product.creator_id) === String(mine.handle)) return fail("err.product.self");
    payload = {
      kind: "product",
      items: [{ id: String(product.id), price: Number(product.price), priceCurrency: String(product.price_currency ?? "cny").toLowerCase(), title: String(product.title), creatorId: String(product.creator_id) }],
    };
    cancelPath = `/c/${encodeURIComponent(String(product.creator_id))}/shop/${encodeURIComponent(String(product.id))}?pay=cancel`;
  } else if (tierId) {
    const tier = sql.get("SELECT * FROM tiers WHERE id = ?", tierId);
    if (!tier) return fail("err.tier.missing");
    if (String(tier.creator_id) === String(mine.handle)) return fail("err.tier.self");
    payload = {
      kind: "membership",
      tierId: String(tier.id),
      creatorId: String(tier.creator_id),
      price: Number(tier.price),
      priceCurrency: String(tier.price_currency ?? "cny").toLowerCase(),
      title: String(tier.name),
    };
    cancelPath = `/checkout?tier=${encodeURIComponent(String(tier.id))}&pay=cancel`;
  } else {
    const items = sql.all(
      `SELECT products.* FROM cart_items JOIN products ON products.id = cart_items.product_id
       WHERE cart_items.user_id = ?`,
      viewer,
    );
    for (const item of items) {
      if (Number(item.listed ?? 1) !== 1) sql.run("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?", viewer, String(item.id));
    }
    const payable = items.filter((item) => String(item.creator_id) !== String(mine.handle) && Number(item.listed ?? 1) === 1);
    if (payable.length === 0) return fail("err.cart.empty");
    payload = {
      kind: "product",
      items: payable.map((item) => ({ id: String(item.id), price: Number(item.price), priceCurrency: String(item.price_currency ?? "cny").toLowerCase(), title: String(item.title), creatorId: String(item.creator_id) })),
    };
  }
  if (body.pay !== "coins") return fail("err.pay.coinsOnly");
  const idempotencyKey = textOf(body.idempotencyKey, 120);
  const rates = await loadFxRates(fetchImpl);
  if (!rates) return fail("err.pay.fx");
  return coinCheckout(sql, viewer, payload, idempotencyKey, rates);

  const serialized = JSON.stringify(payload);
  const amount = payload.kind === "membership" ? payload.price : payload.items.reduce((sum, item) => sum + item.price, 0);
  const crypto = body.pay === "crypto";
  const chargedCurrency = crypto ? "usd" : "cny";
  const existing = sql.get(
    "SELECT * FROM payments WHERE user_id = ? AND status = 'pending' AND payload = ? AND charged_currency = ? AND session_id != '' ORDER BY created_at DESC LIMIT 1",
    viewer,
    serialized,
    chargedCurrency,
  );
  if (existing) {
    const loaded = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(String(existing.session_id))}`, "GET", undefined, fetchImpl);
    if (loaded.ok && loaded.session.payment_status === "paid" && sessionMatches(loaded.session, existing, viewer)) {
      return fulfillPayment(sql, viewer, existing);
    }
    if (loaded.ok && loaded.session.status === "open" && loaded.session.url) {
      return json({ url: loaded.session.url, sessionId: loaded.session.id });
    }
  }
  const items = payload.kind === "membership" ? [{ name: payload.title, amount: payload.price }] : payload.items.map((item) => ({ name: item.title, amount: item.price }));
  let minors: number[] | undefined;
  let chargedAmount = 0;
  if (crypto) {
    const quote = await quoteCnyPerUsd(fetchImpl);
    if (!quote.ok) return fail("err.pay.crypto");
    const minor = usdMinorUnits(amount, quote.cnyPerUsd);
    if (minor < CRYPTO_MIN_MINOR) return fail("err.pay.small");
    if (minor > CRYPTO_MAX_MINOR) return fail("err.pay.crypto");
    const split = splitUsdMinors(items.map((item) => item.amount), minor);
    if (!split) return fail("err.pay.crypto");
    minors = split;
    chargedAmount = minor;
  }
  const paymentId = id();
  sql.run(
    "INSERT INTO payments (id, user_id, kind, payload, amount, currency, charged_currency, charged_amount, session_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'cny', ?, ?, '', 'pending', ?)",
    paymentId,
    viewer,
    payload.kind,
    serialized,
    amount,
    chargedCurrency,
    chargedAmount,
    new Date().toISOString(),
  );
  const created = await stripeRequest(
    env,
    "/v1/checkout/sessions",
    "POST",
    sessionFields({
      origin: new URL(request.url).origin,
      paymentId,
      userId: viewer,
      email: String(mine.email),
      locale: stripeLocale(body.locale),
      cancelPath,
      items,
      currency: chargedCurrency,
      minors,
    }),
    fetchImpl,
  );
  if (!created.ok || !created.session.url) {
    sql.run("DELETE FROM payments WHERE id = ?", paymentId);
    if (!created.ok && (created.code === "err.pay.small" || created.code === "err.pay.unconfigured")) return fail(created.code);
    return fail(crypto ? "err.pay.crypto" : created.ok ? "err.pay.stripe" : created.code);
  }
  sql.run("UPDATE payments SET session_id = ? WHERE id = ?", created.session.id, paymentId);
  return json({ url: created.session.url, sessionId: created.session.id });
}

async function completeCheckout(sql: Sql, request: Request, body: Record<string, unknown>, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const sessionId = textOf(body.sessionId, 120);
  const payment = sessionId ? sql.get("SELECT * FROM payments WHERE session_id = ? AND user_id = ?", sessionId, viewer) : undefined;
  if (!payment) return fail("err.pay.missing", 404);
  if (String(payment.status) === "paid") return fulfillPayment(sql, viewer, payment);
  const loaded = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, "GET", undefined, fetchImpl);
  if (!loaded.ok) return fail(loaded.code);
  if (loaded.session.payment_status !== "paid") return fail("err.pay.pending");
  if (!sessionMatches(loaded.session, payment, viewer)) return fail("err.pay.amount");
  return fulfillPayment(sql, viewer, payment);
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
  const description = textOf(body.description, 2000);
  const fileBody = textOf(body.fileBody, 20000);
  const price = Number(body.price);
  const priceCurrency = currencyOf(body.priceCurrency, "cny");
  const kind = textOf(body.kind, 40) || "数字作品";
  const playFormat = textOf(body.playFormat, 20);
  const playSource = typeof body.playBody === "string" ? body.playBody.trim().slice(0, 100_000) : "";
  const includes = Array.isArray(body.includes)
    ? body.includes.map((item) => textOf(item, 40)).filter(Boolean).slice(0, 8)
    : [];
  if (Array.from(title).length < 2) return fail("err.product.title");
  if (fileBody.length < 8) return fail("err.file");
  if (!Number.isFinite(price) || price < 1 || price > 9999) return fail("err.price");
  if (!priceCurrency) return fail("err.price.currency");
  if (playFormat && !isPlayFormat(playFormat)) return fail("err.play.format");
  const parsed = parsePlay(playFormat, playSource);
  if (!parsed.ok) return fail(parsed.code);
  const workTags = parseWorkTags(body.tags);
  if (!workTags.ok) return fail(workTags.code);
  const chosen = chosenAccess(body);
  if (chosen && "code" in chosen) return fail(chosen.code);
  let format = playFormat;
  let storedBody = playFormat ? JSON.stringify(parsed.body) : "";
  const access = chosen ?? legacyAccess(Boolean(format));
  if (chosen) {
    if (access.allowPlay === 1 && !format) return fail("err.play.file");
    if (access.allowPlay !== 1) {
      format = "";
      storedBody = "";
    }
  }
  sql.run(
    "INSERT INTO products (id, creator_id, title, description, price, price_currency, kind, includes, cover_key, file_body, play_format, play_body, tags, allow_play, allow_download, allow_preview, preview_mode, preview_limit, preview_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id(),
    String(mine.handle),
    title,
    description,
    Math.round(price * 100) / 100,
    priceCurrency,
    kind,
    JSON.stringify(includes.length ? includes : [fileName(title)]),
    id(),
    fileBody,
    format,
    storedBody,
    JSON.stringify(workTags.tags),
    access.allowPlay,
    access.allowDownload,
    access.allowPreview,
    access.previewMode,
    access.previewLimit,
    access.previewBody,
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
  const description = textOf(form.get("description"), 2000);
  const price = Number(form.get("price"));
  const priceCurrency = currencyOf(form.get("priceCurrency"), "cny");
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
  if (Array.from(title).length < 2) return fail("err.product.title");
  if (!Number.isFinite(price) || price < 1 || price > 9999) return fail("err.price");
  if (!priceCurrency) return fail("err.price.currency");
  const workTags = parseWorkTags(form.get("tags"));
  if (!workTags.ok) return fail(workTags.code);
  const chosen = chosenAccess(form);
  if (chosen && "code" in chosen) return fail(chosen.code);
  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const productId = id();
  const filename = uploaded.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
  const mime = (uploaded.type || "application/octet-stream").slice(0, 120);
  let play = inferPlay(productId, filename, mime, bytes);
  const access = chosen ?? legacyAccess(Boolean(play.format));
  if (chosen) {
    if (access.allowPlay === 1 && !play.format) return fail("err.play.file");
    if (access.allowPlay !== 1) play = { format: "", body: "" };
  }
  const coverFile = form.get("cover");
  let coverBytes: Uint8Array | null = null;
  let coverType = "";
  if (coverFile instanceof File && coverFile.size > 0) {
    if (coverFile.size > MAX_AVATAR) return fail("err.cover.size");
    coverBytes = new Uint8Array(await coverFile.arrayBuffer());
    coverType = imageType(coverBytes) ?? "";
    if (!coverType) return fail("err.cover.type");
  }
  sql.run(
    "INSERT INTO products (id, creator_id, title, description, price, price_currency, kind, includes, cover_key, file_body, file_name, file_type, play_format, play_body, tags, allow_play, allow_download, allow_preview, preview_mode, preview_limit, preview_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    productId,
    String(mine.handle),
    title,
    description,
    Math.round(price * 100) / 100,
    priceCurrency,
    kind,
    JSON.stringify(includes.length ? includes : [filename]),
    id(),
    bytesToBase64(bytes),
    filename,
    mime,
    play.format,
    play.body,
    JSON.stringify(workTags.tags),
    access.allowPlay,
    access.allowDownload,
    access.allowPreview,
    access.previewMode,
    access.previewLimit,
    access.previewBody,
  );
  if (coverBytes) {
    sql.run(
      "UPDATE products SET cover_body = ?, cover_type = ?, cover_at = ? WHERE id = ?",
      bytesToBase64(coverBytes),
      coverType,
      new Date().toISOString(),
      productId,
    );
  }
  return withState(sql, viewer, "toast.product");
}

async function updateProduct(sql: Sql, request: Request) {
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
  const product = sql.get("SELECT * FROM products WHERE id = ?", textOf(form.get("productId"), 80));
  if (!product || String(product.creator_id) !== String(mine.handle) || Number(product.removed ?? 0) === 1) return fail("err.product.missing", 404);
  const title = textOf(form.get("title"), 80);
  const description = textOf(form.get("description"), 2000);
  const price = Number(form.get("price"));
  const priceCurrency = currencyOf(form.get("priceCurrency"), String(product.price_currency ?? "cny"));
  const kind = textOf(form.get("kind"), 40) || String(product.kind);
  const includes = textOf(form.get("includes"), 400)
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (Array.from(title).length < 2) return fail("err.product.title");
  if (!Number.isFinite(price) || price < 1 || price > 9999) return fail("err.price");
  if (!priceCurrency) return fail("err.price.currency");
  const workTags = parseWorkTags(form.get("tags"));
  if (!workTags.ok) return fail(workTags.code);
  const chosen = chosenAccess(form);
  if (!chosen || "code" in chosen) return fail(chosen && "code" in chosen ? chosen.code : "err.open");
  const uploaded = form.get("file");
  let format = String(product.play_format ?? "");
  let storedBody = String(product.play_body ?? "");
  let fileNameStored = String(product.file_name ?? "");
  let fileType = String(product.file_type ?? "");
  let fileBody = String(product.file_body ?? "");
  if (uploaded instanceof File && uploaded.size > 0) {
    if (uploaded.size > MAX_UPLOAD) return fail("err.file.size");
    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    const filename = uploaded.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";
    const mime = (uploaded.type || "application/octet-stream").slice(0, 120);
    const play = inferPlay(String(product.id), filename, mime, bytes);
    fileBody = bytesToBase64(bytes);
    fileNameStored = filename;
    fileType = mime;
    if (chosen.allowPlay === 1) {
      if (!play.format) return fail("err.play.file");
      format = play.format;
      storedBody = play.body;
    } else {
      format = "";
      storedBody = "";
    }
  } else if (chosen.allowPlay === 1) {
    if (!format) {
      let stored = new Uint8Array();
      if (fileBody && fileNameStored) {
        try {
          stored = base64ToBytes(fileBody);
        } catch {
          return fail("err.play.file");
        }
      }
      const play = inferPlay(String(product.id), fileNameStored || "file", fileType, stored);
      if (!play.format) return fail("err.play.file");
      format = play.format;
      storedBody = play.body;
    }
  } else {
    format = "";
    storedBody = "";
  }
  let coverBody = String(product.cover_body ?? "");
  let coverTypeStored = String(product.cover_type ?? "");
  let coverAt = String(product.cover_at ?? "");
  const coverUpload = form.get("cover");
  if (coverUpload instanceof File && coverUpload.size > 0) {
    if (coverUpload.size > MAX_AVATAR) return fail("err.cover.size");
    const nextBytes = new Uint8Array(await coverUpload.arrayBuffer());
    const nextType = imageType(nextBytes);
    if (!nextType) return fail("err.cover.type");
    coverBody = bytesToBase64(nextBytes);
    coverTypeStored = nextType;
    coverAt = new Date().toISOString();
  }
  sql.run(
    `UPDATE products SET title = ?, description = ?, price = ?, price_currency = ?, kind = ?, includes = ?, tags = ?, file_body = ?, file_name = ?, file_type = ?, play_format = ?, play_body = ?, allow_play = ?, allow_download = ?, allow_preview = ?, preview_mode = ?, preview_limit = ?, preview_body = ?, listed = ?, cover_body = ?, cover_type = ?, cover_at = ? WHERE id = ?`,
    title,
    description,
    Math.round(price * 100) / 100,
    priceCurrency,
    kind,
    JSON.stringify(includes.length ? includes : [fileNameStored || fileName(title)]),
    JSON.stringify(workTags.tags),
    fileBody,
    fileNameStored,
    fileType,
    format,
    storedBody,
    chosen.allowPlay,
    chosen.allowDownload,
    chosen.allowPreview,
    chosen.previewMode,
    chosen.previewLimit,
    chosen.previewBody,
    flagOn(form.get("listed")) ? 1 : 0,
    coverBody,
    coverTypeStored,
    coverAt,
    String(product.id),
  );
  return withState(sql, viewer, "toast.work");
}

function deleteProduct(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  const product = sql.get("SELECT * FROM products WHERE id = ?", textOf(body.productId, 80));
  if (!product || String(product.creator_id) !== String(mine.handle) || Number(product.removed ?? 0) === 1) return fail("err.product.missing", 404);
  const productId = String(product.id);
  sql.run("DELETE FROM cart_items WHERE product_id = ?", productId);
  const sold = sql.get("SELECT product_id FROM purchases WHERE product_id = ? LIMIT 1", productId);
  if (sold) {
    sql.run("UPDATE products SET removed = 1, listed = 0 WHERE id = ?", productId);
    return withState(sql, viewer, "toast.workDeleted");
  }
  sql.run("DELETE FROM play_saved WHERE product_id = ?", productId);
  sql.run("DELETE FROM play_progress WHERE product_id = ?", productId);
  sql.run("DELETE FROM playlist_items WHERE product_id = ?", productId);
  sql.run("DELETE FROM products WHERE id = ?", productId);
  return withState(sql, viewer, "toast.workDeleted");
}

type StripeEvent = { id?: string; type?: string; data?: { object?: { id?: string } } };

async function confirmedEvent(env: PayEnv, payload: string, header: string, fetchImpl: typeof fetch) {
  if (!stripeKey(env)) return { ok: false as const, code: "err.pay.unconfigured" };
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return { ok: false as const, code: "err.pay.stripe" };
  }
  const secret = webhookSecret(env);
  if (secret) {
    if (!(await signatureMatches(secret, payload, header))) return { ok: false as const, code: "err.pay.stripe" };
    return { ok: true as const, event };
  }
  const eventId = textOf(event.id, 120);
  if (!eventId.startsWith("evt_")) return { ok: false as const, code: "err.pay.stripe" };
  const loaded = await stripeGet(env, `/v1/events/${encodeURIComponent(eventId)}`, fetchImpl);
  if (!loaded.ok) return loaded;
  const confirmed = loaded.data as StripeEvent;
  if (confirmed.id !== eventId || confirmed.type !== event.type) return { ok: false as const, code: "err.pay.stripe" };
  return { ok: true as const, event: confirmed };
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function coinToken(payload: { sub: string; exp: number; nonce: string }, secret: string) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64Url(signature)}`;
}

async function verifyCoinSignature(raw: string, signature: string, secret: string) {
  try {
    if (!signature || !secret) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), new TextEncoder().encode(raw));
  } catch {
    return false;
  }
}

async function coinSso(sql: Sql, request: Request, env: PayEnv) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  if (!env.COIN_SSO_SECRET) return fail("err.coin.unconfigured", 503);
  const token = await coinToken({ sub: viewer, exp: Date.now() + 60_000, nonce: crypto.randomUUID() }, env.COIN_SSO_SECRET);
  return Response.redirect(`https://coin.starchose.org/sso?token=${encodeURIComponent(token)}`, 302);
}

async function coinApi(sql: Sql, request: Request, env: PayEnv, fetchImpl: typeof fetch) {
  if (!env.COIN_SSO_SECRET) return fail("err.coin.unconfigured", 503);
  const raw = await request.text();
  if (!(await verifyCoinSignature(raw, request.headers.get("x-coin-signature") ?? "", env.COIN_SSO_SECRET))) {
    return fail("err.coin.signature", 401);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fail("err.request", 400);
  }
  const userId = textOf(body.user_id, 120);
  const timestamp = Number(body.ts);
  const nonce = textOf(body.nonce, 120);
  if (!userId || !nonce || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 60_000) return fail("err.coin.expired", 401);
  try {
    sql.transaction(() => {
      if (sql.get("SELECT nonce FROM coin_api_nonces WHERE nonce = ?", nonce)) throw new Error("err.coin.replay");
      sql.run("INSERT INTO coin_api_nonces (nonce, expires_at) VALUES (?, ?)", nonce, Date.now() + 120_000);
      sql.run("DELETE FROM coin_api_nonces WHERE expires_at < ?", Date.now());
    });
  } catch {
    return fail("err.coin.replay", 409);
  }
  const user = sql.get("SELECT id, email, coins FROM users WHERE id = ?", userId);
  if (!user) return fail("err.loginRequired", 401);
  if (body.action === "balance") return json({ ok: true, balance: Number(user.coins ?? 0) });
  if (body.action !== "checkout") return fail("err.coin.action");
  const coins = Number(body.coins);
  if (![5, 10, 20, 50, 100, 200].includes(coins)) return fail("err.coin.amount");
  if (!stripeKey(env)) return fail("err.pay.unconfigured", 503);
  const topupId = id();
  const now = new Date().toISOString();
  sql.run(
    "INSERT INTO coin_topups (id, user_id, coins, amount, currency, session_id, status, created_at) VALUES (?, ?, ?, ?, 'usd', '', 'pending', ?)",
    topupId, userId, coins, coins * 100, now,
  );
  const fields: Record<string, string> = {
    mode: "payment",
    success_url: "https://fanstar.dev/api/coin/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://coin.starchose.org/?pay=cancel",
    customer_email: String(user.email),
    locale: "auto",
    client_reference_id: topupId,
    "metadata[kind]": "coin_topup",
    "metadata[topupId]": topupId,
    "metadata[userId]": userId,
    "metadata[coins]": String(coins),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(coins * 100),
    "line_items[0][price_data][product_data][name]": `Fanstar Coins · ${coins}`,
  };
  const created = await stripeRequest(env, "/v1/checkout/sessions", "POST", fields, fetchImpl);
  if (!created.ok || !created.session.url) {
    sql.run("DELETE FROM coin_topups WHERE id = ?", topupId);
    return fail(created.ok ? "err.pay.stripe" : created.code);
  }
  sql.run("UPDATE coin_topups SET session_id = ? WHERE id = ?", created.session.id, topupId);
  return json({ ok: true, url: created.session.url, sessionId: created.session.id });
}

function creditCoinTopup(sql: Sql, session: StripeSession) {
  const topupId = String(session.metadata?.topupId ?? "");
  const topup = topupId ? sql.get("SELECT * FROM coin_topups WHERE id = ?", topupId) : undefined;
  if (!topup || String(topup.session_id) !== session.id || String(topup.user_id) !== String(session.metadata?.userId ?? "")) return false;
  const coins = Number(topup.coins);
  if (
    session.metadata?.kind !== "coin_topup" ||
    Number(session.metadata?.coins) !== coins ||
    session.payment_status !== "paid" ||
    session.amount_total !== Number(topup.amount) ||
    String(session.currency ?? "").toLowerCase() !== "usd"
  ) return false;
  try {
    sql.transaction(() => {
      const fresh = sql.get("SELECT * FROM coin_topups WHERE id = ?", topupId);
      if (!fresh || String(fresh.status) === "paid") return;
      const key = `stripe:${session.id}`;
      if (sql.get("SELECT id FROM coin_transactions WHERE idempotency_key = ?", key)) {
        sql.run("UPDATE coin_topups SET status = 'paid' WHERE id = ?", topupId);
        return;
      }
      const user = sql.get("SELECT coins FROM users WHERE id = ?", String(fresh.user_id));
      if (!user) throw new Error("err.loginRequired");
      sql.run("UPDATE users SET coins = coins + ? WHERE id = ?", Number(fresh.coins), String(fresh.user_id));
      const after = sql.get("SELECT coins FROM users WHERE id = ?", String(fresh.user_id));
      const transactionId = id();
      const now = new Date().toISOString();
      sql.run(
        "INSERT INTO coin_transactions (id, idempotency_key, user_id, kind, target_id, coins, fiat_amount, fiat_currency, created_at) VALUES (?, ?, ?, 'topup', ?, ?, ?, 'usd', ?)",
        transactionId, key, String(fresh.user_id), topupId, Number(fresh.coins), Number(fresh.amount) / 100, now,
      );
      sql.run(
        "INSERT INTO coin_ledger (id, user_id, transaction_id, amount, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        id(), String(fresh.user_id), transactionId, Number(fresh.coins), Number(after?.coins ?? 0), now,
      );
      sql.run("UPDATE coin_topups SET status = 'paid' WHERE id = ?", topupId);
    });
    return true;
  } catch {
    return false;
  }
}

async function coinReturn(sql: Sql, request: Request, env: PayEnv, fetchImpl: typeof fetch) {
  const sessionId = textOf(new URL(request.url).searchParams.get("session_id"), 120);
  const topup = sessionId ? sql.get("SELECT * FROM coin_topups WHERE session_id = ?", sessionId) : undefined;
  if (!topup) return new Response("Top-up not found", { status: 404 });
  const loaded = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, "GET", undefined, fetchImpl);
  if (loaded.ok) creditCoinTopup(sql, loaded.session);
  const success = sql.get("SELECT status FROM coin_topups WHERE id = ?", String(topup.id));
  return Response.redirect(`https://coin.starchose.org/?pay=${String(success?.status) === "paid" ? "success" : "cancel"}`, 302);
}

async function stripeWebhook(sql: Sql, request: Request, env: PayEnv, fetchImpl: typeof fetch) {
  const payload = await request.text();
  const confirmed = await confirmedEvent(env, payload, request.headers.get("stripe-signature") ?? "", fetchImpl);
  if (!confirmed.ok) return fail(confirmed.code);
  const sessionId = textOf(confirmed.event.data?.object?.id, 120);
  if (!sessionId.startsWith("cs_")) return json({ received: true });
  const topup = sql.get("SELECT * FROM coin_topups WHERE session_id = ?", sessionId);
  if (topup) {
    if (type === "checkout.session.async_payment_failed") {
      if (String(topup.status) !== "paid") sql.run("UPDATE coin_topups SET status = 'failed' WHERE id = ?", String(topup.id));
      return json({ received: true });
    }
    if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return json({ received: true });
    const loadedTopup = await stripeRequest(env, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, "GET", undefined, fetchImpl);
    if (loadedTopup.ok && creditCoinTopup(sql, loadedTopup.session)) return json({ received: true });
    return json({ received: true });
  }
  const payment = sql.get("SELECT * FROM payments WHERE session_id = ?", sessionId);
  if (!payment || String(payment.status) === "paid") return json({ received: true });
  // Stripe is reserved for coin top-ups. Legacy content checkout sessions never unlock content.
  sql.run("UPDATE payments SET status = 'cancelled' WHERE id = ?", String(payment.id));
  return json({ received: true });
}

function readCover(sql: Sql, request: Request) {
  const productId = textOf(new URL(request.url).searchParams.get("id") ?? "", 80);
  const row = productId ? sql.get("SELECT cover_body, cover_type FROM products WHERE id = ?", productId) : undefined;
  const type = row ? String(row.cover_type ?? "") : "";
  if (!row || !String(row.cover_body ?? "") || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) {
    return fail("err.cover", 404);
  }
  return new Response(base64ToBytes(String(row.cover_body)), {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
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
  const allowed = CREATOR_CATEGORIES;
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
    if ("tags" in body) {
      const raw = typeof body.tags === "string" ? body.tags.split(/[,，]/) : Array.isArray(body.tags) ? body.tags : [];
      const tags = raw.map((item) => textOf(item, 20)).filter(Boolean).slice(0, 6);
      sets.push("tags = ?");
      params.push(JSON.stringify(tags));
    }
    params.push(String(mine.handle));
    sql.run(`UPDATE creators SET ${sets.join(", ")} WHERE id = ?`, ...params);
  }
  return withState(sql, viewer, "toast.profile");
}

function updateTier(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  const tier = sql.get("SELECT * FROM tiers WHERE id = ?", textOf(body.id, 80));
  if (!tier || String(tier.creator_id) !== String(mine.handle)) return fail("err.tier.missing", 404);
  const name = textOf(body.name, 40);
  const blurb = textOf(body.blurb, 400);
  const price = Number(body.price);
  const priceCurrency = currencyOf(body.priceCurrency, String(tier.price_currency ?? "cny"));
  const perks = (Array.isArray(body.perks) ? body.perks : [])
    .map((item) => textOf(item, 40))
    .filter(Boolean)
    .slice(0, 8);
  if (name.length < 2) return fail("err.title");
  if (!Number.isFinite(price) || price <= 0 || price > 9999) return fail("err.price");
  if (!priceCurrency) return fail("err.price.currency");
  sql.run(
    "UPDATE tiers SET name = ?, price = ?, price_currency = ?, blurb = ?, perks = ? WHERE id = ?",
    name,
    Math.round(price * 100) / 100,
    priceCurrency,
    blurb,
    JSON.stringify(perks),
    String(tier.id),
  );
  return withState(sql, viewer, "toast.tier");
}

const PAYOUT_COUNTRIES = new Set([
  "AT", "AU", "BE", "CA", "CH", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "IE", "IT", "JP", "LU", "NL", "NO", "NZ", "PL", "PT", "SE", "SG", "US",
]);

function nextFridayUtc(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = next.getUTCDay();
  let add = (5 - day + 7) % 7;
  const pastMidnight = now.getUTCHours() + now.getUTCMinutes() + now.getUTCSeconds() + now.getUTCMilliseconds() > 0;
  if (add === 0 && pastMidnight) add = 7;
  next.setUTCDate(next.getUTCDate() + add);
  return next;
}

function payoutStatus(data: Record<string, unknown>) {
  const configuration = data.configuration as { recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } } } | undefined;
  return configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? "";
}

function payoutMethodLabel(row: Record<string, unknown>) {
  const last4 = String(row.last4 ?? "");
  if (row.object === "bank_account") {
    const name = String(row.bank_name ?? "").trim();
    return last4 ? `${name || "Bank"} ····${last4}` : name;
  }
  if (row.object === "card") {
    const brand = String(row.brand ?? "").trim();
    return last4 ? `${brand || "Card"} ····${last4}` : brand;
  }
  return "";
}

async function loadPayoutMethod(env: PayEnv, accountId: string, fetchImpl: typeof fetch) {
  const listed = await stripeGet(env, `/v1/accounts/${encodeURIComponent(accountId)}/external_accounts?limit=10`, fetchImpl);
  if (!listed.ok) return null;
  const rows = Array.isArray(listed.data.data) ? (listed.data.data as Record<string, unknown>[]) : [];
  const chosen =
    rows.find((row) => row.object === "bank_account" && row.default_for_currency === true) ??
    rows.find((row) => row.object === "bank_account") ??
    rows.find((row) => row.object === "card");
  return chosen ? payoutMethodLabel(chosen) : "";
}

async function refreshPayout(sql: Sql, mine: Row, env: PayEnv, fetchImpl: typeof fetch) {
  const accountId = String(mine.stripe_account_id ?? "");
  const storedReady = Number(mine.payout_ready) === 1;
  const storedMethod = String(mine.payout_method ?? "");
  if (!accountId || !stripeKey(env)) return { ready: storedReady, method: storedMethod };
  const loaded = await stripeSend(env, `/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.recipient`, "GET", undefined, fetchImpl);
  const ready = loaded.ok ? payoutStatus(loaded.data) === "active" : storedReady;
  const method = await loadPayoutMethod(env, accountId, fetchImpl);
  const nextMethod = method === null ? storedMethod : method;
  sql.run("UPDATE users SET payout_ready = ?, payout_method = ? WHERE id = ?", ready ? 1 : 0, nextMethod, String(mine.id));
  return { ready, method: nextMethod };
}

const BANK_CURRENCY: Record<string, string> = {
  AT: "eur", AU: "aud", BE: "eur", CA: "cad", CH: "chf", DE: "eur", DK: "dkk", ES: "eur", FI: "eur", FR: "eur", GB: "gbp",
  HK: "hkd", IE: "eur", IT: "eur", JP: "jpy", LU: "eur", NL: "eur", NO: "nok", NZ: "nzd", PL: "pln", PT: "eur", SE: "sek", SG: "sgd", US: "usd",
};
const IBAN_COUNTRIES = new Set(["AT", "BE", "CH", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "LU", "NL", "NO", "PL", "PT", "SE"]);

function digitsOf(value: unknown, max: number) {
  return textOf(value, max).replace(/[\s-]/g, "");
}

function bankFields(body: Record<string, unknown>) {
  const country = textOf(body.country, 2).toUpperCase();
  const currency = BANK_CURRENCY[country];
  if (!currency || !PAYOUT_COUNTRIES.has(country)) return { error: "err.payout.country" };
  const holder = textOf(body.holder, 80);
  const account = textOf(body.accountNumber, 42).replace(/\s+/g, "").toUpperCase();
  if (holder.length < 2) return { error: "err.payout.bank" };
  const fields: Record<string, string> = {
    "external_account[object]": "bank_account",
    "external_account[country]": country,
    "external_account[currency]": currency,
    "external_account[account_holder_name]": holder,
    "external_account[account_holder_type]": "individual",
    default_for_currency: "true",
  };
  if (IBAN_COUNTRIES.has(country)) {
    if (!account.startsWith(country) || !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(account)) return { error: "err.payout.bank" };
    fields["external_account[account_number]"] = account;
    return { fields, country };
  }
  const number = account.replace(/-/g, "");
  if (!/^\d{4,34}$/.test(number)) return { error: "err.payout.bank" };
  fields["external_account[account_number]"] = number;
  if (country === "NZ") return /^\d{15,16}$/.test(number) ? { fields, country } : { error: "err.payout.bank" };
  const routing = digitsOf(body.routing, 12);
  const bank = digitsOf(body.bankCode, 8);
  const branch = digitsOf(body.branchCode, 8);
  const transit = digitsOf(body.transit, 8);
  const institution = digitsOf(body.institution, 8);
  const route =
    country === "GB" || country === "AU" ? (routing.length === 6 ? routing : "") :
    country === "US" ? (routing.length === 9 ? routing : "") :
    country === "CA" ? (transit.length === 5 && institution.length === 3 ? `${transit}${institution}` : "") :
    country === "HK" ? (bank.length === 3 && branch.length === 3 ? `${bank}-${branch}` : "") :
    country === "JP" ? (bank.length === 4 && branch.length === 3 ? `${bank}${branch}` : "") :
    country === "SG" ? (bank.length === 4 && branch.length === 3 ? `${bank}-${branch}` : "") :
    "";
  if (!route) return { error: "err.payout.bank" };
  fields["external_account[routing_number]"] = route;
  return { fields, country };
}

function payoutAccountBody(mine: Row, country: string, withMerchant: boolean) {
  const configuration: Record<string, unknown> = {
    recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
  };
  if (withMerchant) configuration.merchant = { capabilities: { card_payments: { requested: true } } };
  return {
    contact_email: String(mine.email),
    display_name: String(mine.name).slice(0, 100) || "fanstar",
    dashboard: "none",
    identity: { country: country.toLowerCase(), entity_type: "individual" },
    defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
    configuration,
    include: ["configuration.recipient", "identity", "defaults"],
  };
}

async function openPayoutAccount(sql: Sql, mine: Row, country: string, env: PayEnv, fetchImpl: typeof fetch) {
  const wanted = country.toUpperCase();
  let accountId = String(mine.stripe_account_id ?? "");
  let reusable = false;
  if (accountId) {
    const loaded = await stripeSend(env, `/v2/core/accounts/${encodeURIComponent(accountId)}?include=identity`, "GET", undefined, fetchImpl);
    const identity = loaded.ok ? (loaded.data.identity as { country?: string } | undefined) : undefined;
    reusable = loaded.ok && loaded.data.dashboard === "none" && String(identity?.country ?? "").toUpperCase() === wanted;
  }
  if (reusable) return { accountId };
  let created = await stripeSend(env, "/v2/core/accounts", "POST", payoutAccountBody(mine, wanted, false), fetchImpl);
  if (!created.ok && created.code === "err.payout.capability") {
    created = await stripeSend(env, "/v2/core/accounts", "POST", payoutAccountBody(mine, wanted, true), fetchImpl);
  }
  if (!created.ok || typeof created.data.id !== "string") {
    return { error: created.ok ? "err.payout" : created.code === "err.payout.capability" ? "err.payout.country" : created.code };
  }
  accountId = created.data.id;
  sql.run("UPDATE users SET stripe_account_id = ?, payout_ready = 0, payout_method = '' WHERE id = ?", accountId, String(mine.id));
  mine.stripe_account_id = accountId;
  mine.payout_ready = 0;
  mine.payout_method = "";
  return { accountId };
}

async function savePayout(sql: Sql, request: Request, body: Record<string, unknown>, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  if (!stripeKey(env)) return fail("err.pay.unconfigured");
  const bank = bankFields(body);
  if ("error" in bank) return fail(bank.error);
  const opened = await openPayoutAccount(sql, mine, bank.country, env, fetchImpl);
  if ("error" in opened || !opened.accountId) return fail("error" in opened ? opened.error : "err.payout");
  const added = await stripeForm(env, `/v1/accounts/${encodeURIComponent(opened.accountId)}/external_accounts`, bank.fields, fetchImpl);
  if (!added.ok) return fail(added.code === "err.payout.capability" ? "err.payout.country" : added.code);
  const label = payoutMethodLabel(added.data);
  if (label) {
    mine.payout_method = label;
    sql.run("UPDATE users SET payout_method = ? WHERE id = ?", label, String(mine.id));
  }
  const payout = await refreshPayout(sql, mine, env, fetchImpl);
  return json({ method: payout.method });
}

async function payoutLink(sql: Sql, request: Request, body: Record<string, unknown>, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  if (!stripeKey(env)) return fail("err.pay.unconfigured");
  const origin = new URL(request.url).origin;
  let accountId = String(mine.stripe_account_id ?? "");
  if (!accountId) {
    const country = textOf(body.country, 2).toUpperCase();
    if (!PAYOUT_COUNTRIES.has(country)) return fail("err.payout.country");
    const created = await stripeSend(env, "/v2/core/accounts", "POST", {
      contact_email: String(mine.email),
      display_name: String(mine.name).slice(0, 100) || "fanstar",
      dashboard: "express",
      identity: { country: country.toLowerCase() },
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      include: ["configuration.recipient", "identity", "requirements"],
    }, fetchImpl);
    if (!created.ok || typeof created.data.id !== "string") return fail(created.ok ? "err.payout" : created.code);
    accountId = created.data.id;
    sql.run("UPDATE users SET stripe_account_id = ?, payout_ready = 0 WHERE id = ?", accountId, viewer);
  }
  const linked = await stripeSend(env, "/v2/core/account_links", "POST", {
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${origin}/api/payout/refresh`,
        return_url: `${origin}/studio/payout?payout=return`,
      },
    },
  }, fetchImpl);
  const url = linked.ok ? linked.data.url : "";
  if (!linked.ok || typeof url !== "string" || !url) return fail(linked.ok ? "err.payout" : linked.code);
  return json({ url });
}

async function payoutRefresh(sql: Sql, request: Request, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || !String(mine.stripe_account_id ?? "")) return Response.redirect(`${new URL(request.url).origin}/studio/payout`, 302);
  const origin = new URL(request.url).origin;
  const linked = await stripeSend(env, "/v2/core/account_links", "POST", {
    account: String(mine.stripe_account_id),
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${origin}/api/payout/refresh`,
        return_url: `${origin}/studio/payout?payout=return`,
      },
    },
  }, fetchImpl);
  const url = linked.ok ? linked.data.url : "";
  if (!linked.ok || typeof url !== "string" || !url) return Response.redirect(`${origin}/studio/payout?payout=error`, 302);
  return Response.redirect(url, 302);
}

export async function runPayouts(sql: Sql, env: PayEnv, fetchImpl: typeof fetch, now = new Date()) {
  if (now.getUTCDay() !== 5 || now.getUTCHours() !== 0) return { transferred: 0 };
  const rows = sql.all("SELECT id, creator_id, currency, amount, fee FROM orders WHERE transfer_id = '' AND creator_id != ''");
  const groups = new Map<string, { creatorId: string; currency: string; ids: string[]; net: number }>();
  for (const row of rows) {
    const creatorId = String(row.creator_id);
    const currency = String(row.currency || "cny").toLowerCase();
    const key = `${creatorId}:${currency}`;
    const group = groups.get(key) ?? { creatorId, currency, ids: [], net: 0 };
    group.ids.push(String(row.id));
    group.net += Math.round((Number(row.amount) - Number(row.fee)) * 100);
    groups.set(key, group);
  }
  let transferred = 0;
  const week = now.toISOString().slice(0, 10);
  for (const group of groups.values()) {
    if (group.net < 1) continue;
    const creator = sql.get("SELECT id, stripe_account_id, payout_ready FROM users WHERE handle = ? AND is_creator = 1", group.creatorId);
    if (!creator || Number(creator.payout_ready) !== 1 || !String(creator.stripe_account_id ?? "")) continue;
    const sent = await stripeSend(
      env,
      "/v1/transfers",
      "POST",
      {
        amount: group.net,
        currency: group.currency,
        destination: String(creator.stripe_account_id),
        metadata: { creatorId: group.creatorId, week },
      },
      fetchImpl,
      { "Idempotency-Key": `payout-${group.creatorId}-${group.currency}-${week}` },
    );
    if (!sent.ok || typeof sent.data.id !== "string") continue;
    for (const orderId of group.ids) sql.run("UPDATE orders SET transfer_id = ? WHERE id = ? AND transfer_id = ''", sent.data.id, orderId);
    transferred += 1;
  }
  return { transferred };
}

function desk(sql: Sql, request: Request, env: PayEnv, fetchImpl: typeof fetch) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio", 403);
  return deskBody(sql, mine, env, fetchImpl);
}

async function deskBody(sql: Sql, mine: Row, env: PayEnv, fetchImpl: typeof fetch) {
  const handle = String(mine.handle);
  const orders = sql.all(
    `SELECT orders.id, orders.kind, orders.target_id, orders.amount, orders.fee, orders.created_at, orders.fiat_amount, orders.fiat_currency, orders.coin_amount, users.name AS buyer,
            CASE WHEN orders.kind = 'product' THEN products.title WHEN orders.kind = 'membership' THEN tiers.name ELSE '创作者支持' END AS title
     FROM orders
     JOIN users ON users.id = orders.user_id
     LEFT JOIN products ON orders.kind = 'product' AND products.id = orders.target_id
     LEFT JOIN tiers ON orders.kind = 'membership' AND tiers.id = orders.target_id
     WHERE products.creator_id = ? OR tiers.creator_id = ? OR orders.creator_id = ?
     ORDER BY orders.created_at DESC
     LIMIT 40`,
    handle,
    handle,
    handle,
  );
  const members = sql.all(
    `SELECT users.name, users.handle, tiers.name AS tier, memberships.price, memberships.expires_at
     FROM memberships
     JOIN users ON users.id = memberships.user_id
     JOIN tiers ON tiers.id = memberships.tier_id
     WHERE memberships.creator_id = ?
     ORDER BY memberships.expires_at DESC`,
    handle,
  );
  const gross = orders.reduce((sum, row) => sum + Number(row.amount), 0);
  const fee = orders.reduce((sum, row) => sum + Number(row.fee), 0);
  const payout = await refreshPayout(sql, mine, env, fetchImpl);
  const pendingRows = sql.all("SELECT amount, fee FROM orders WHERE creator_id = ? AND transfer_id = ''", handle);
  const pending = pendingRows.reduce((sum, row) => sum + Number(row.amount) - Number(row.fee), 0);
  return json({
    orders: orders.map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      targetId: String(row.target_id),
      title: String(row.title ?? ""),
      buyer: String(row.buyer),
      amount: Number(row.fiat_amount ?? 0) > 0 ? Number(row.fiat_amount) : Number(row.amount),
      currency: String(row.fiat_currency ?? "cny"),
      coinAmount: Number(row.coin_amount ?? 0),
      fee: Number(row.fee),
      createdAt: String(row.created_at),
    })),
    members: members.map((row) => ({
      name: String(row.name),
      handle: String(row.handle),
      tier: String(row.tier),
      price: Number(row.price),
      expiresAt: String(row.expires_at),
    })),
    gross: Math.round(gross * 100) / 100,
    fee: Math.round(fee * 100) / 100,
    net: Math.round((gross - fee) * 100) / 100,
    payoutReady: payout.ready,
    payoutStarted: Boolean(String(mine.stripe_account_id ?? "")),
    payoutMethod: payout.method,
    pending: Math.round(pending * 100) / 100,
    nextPayout: nextFridayUtc().toISOString(),
  });
}

function studio(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
  if (Number(mine.is_creator) === 1 && sql.get("SELECT id FROM creators WHERE id = ?", String(mine.handle))) {
    return withState(sql, viewer, "toast.studio.exists");
  }
  const bio = textOf(body.bio, 400);
  const location = textOf(body.location, 40) || "未填写";
  const category = textOf(body.category, 20);
  if (Array.from(bio).length < 8) return fail("err.apply");
  if (!CREATOR_CATEGORIES.includes(category)) return fail("err.category");
  const handle = handleOf(body.handle);
  if (!handle) return fail("err.handle");
  if (handleTaken(sql, handle, viewer)) return fail("err.handle.taken");
  sql.run("UPDATE users SET handle = ?, bio = ? WHERE id = ?", handle, bio, viewer);
  const updated = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!updated) return fail("err.loginRequired", 401);
  openCreator(sql, updated, { category, location, bio });
  return withState(sql, viewer, "toast.apply");
}

function productTags(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine || Number(mine.is_creator) !== 1) return fail("err.studio");
  const product = sql.get("SELECT * FROM products WHERE id = ?", textOf(body.productId, 80));
  if (!product || String(product.creator_id) !== String(mine.handle) || Number(product.removed ?? 0) === 1) return fail("err.product.missing", 404);
  const workTags = parseWorkTags(body.tags);
  if (!workTags.ok) return fail(workTags.code);
  sql.run("UPDATE products SET tags = ? WHERE id = ?", JSON.stringify(workTags.tags), String(product.id));
  return withState(sql, viewer, "toast.workTags");
}

async function uploadAvatar(sql: Sql, request: Request) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT id FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("err.avatar");
  }
  const uploaded = form.get("file");
  if (!(uploaded instanceof File) || uploaded.size < 1) return fail("err.avatar");
  if (uploaded.size > MAX_AVATAR) return fail("err.avatar.size");
  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const type = imageType(bytes);
  if (!type) return fail("err.avatar.type");
  sql.run(
    "UPDATE users SET avatar = ?, avatar_type = ?, avatar_at = ? WHERE id = ?",
    bytesToBase64(bytes),
    type,
    new Date().toISOString(),
    viewer,
  );
  return withState(sql, viewer, "toast.avatar");
}

function readAvatar(sql: Sql, request: Request) {
  const handle = handleOf(new URL(request.url).searchParams.get("id") ?? "");
  if (!handle) return fail("err.avatar", 404);
  const row = sql.get("SELECT avatar, avatar_type FROM users WHERE handle = ?", handle);
  const type = row ? String(row.avatar_type ?? "") : "";
  if (!row || !String(row.avatar ?? "") || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) {
    return fail("err.avatar", 404);
  }
  return new Response(base64ToBytes(String(row.avatar)), {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

async function deleteAccount(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const mine = sql.get("SELECT * FROM users WHERE id = ?", viewer);
  if (!mine) return fail("err.loginRequired", 401);
  const password = typeof body.password === "string" ? body.password : "";
  const hashed = await hashPassword(password, String(mine.password_salt));
  if (hashed !== String(mine.password_hash)) return fail("err.login", 401);
  const handle = String(mine.handle);
  const productIds = sql.all("SELECT id FROM products WHERE creator_id = ?", handle).map((row) => String(row.id));
  const postIds = sql.all("SELECT id FROM posts WHERE creator_id = ?", handle).map((row) => String(row.id));
  const tierIds = sql.all("SELECT id FROM tiers WHERE creator_id = ?", handle).map((row) => String(row.id));
  for (const productId of productIds) {
    sql.run("DELETE FROM play_saved WHERE product_id = ?", productId);
    sql.run("DELETE FROM play_progress WHERE product_id = ?", productId);
    sql.run("DELETE FROM playlist_items WHERE product_id = ?", productId);
    sql.run("DELETE FROM purchases WHERE product_id = ?", productId);
    sql.run("DELETE FROM cart_items WHERE product_id = ?", productId);
    sql.run("DELETE FROM orders WHERE kind = 'product' AND target_id = ?", productId);
  }
  for (const postId of postIds) {
    sql.run("DELETE FROM comments WHERE post_id = ?", postId);
    sql.run("DELETE FROM likes WHERE post_id = ?", postId);
  }
  for (const tierId of tierIds) {
    sql.run("DELETE FROM orders WHERE kind = 'membership' AND target_id = ?", tierId);
    sql.run("DELETE FROM memberships WHERE tier_id = ?", tierId);
  }
  sql.run("DELETE FROM play_saved WHERE user_id = ?", viewer);
  sql.run("DELETE FROM play_progress WHERE user_id = ?", viewer);
  for (const row of sql.all("SELECT id FROM playlists WHERE user_id = ?", viewer)) {
    sql.run("DELETE FROM playlist_items WHERE playlist_id = ?", String(row.id));
  }
  sql.run("DELETE FROM playlists WHERE user_id = ?", viewer);
  sql.run("DELETE FROM purchases WHERE user_id = ?", viewer);
  sql.run("DELETE FROM cart_items WHERE user_id = ?", viewer);
  sql.run("DELETE FROM orders WHERE user_id = ?", viewer);
  sql.run("DELETE FROM payments WHERE user_id = ?", viewer);
  sql.run("DELETE FROM comments WHERE user_id = ?", viewer);
  sql.run("DELETE FROM likes WHERE user_id = ?", viewer);
  sql.run("DELETE FROM follows WHERE user_id = ? OR creator_id = ?", viewer, handle);
  sql.run("DELETE FROM memberships WHERE user_id = ? OR creator_id = ?", viewer, handle);
  sql.run("DELETE FROM posts WHERE creator_id = ?", handle);
  sql.run("DELETE FROM products WHERE creator_id = ?", handle);
  sql.run("DELETE FROM tiers WHERE creator_id = ?", handle);
  sql.run("DELETE FROM creators WHERE id = ?", handle);
  sql.run("DELETE FROM sessions WHERE user_id = ?", viewer);
  sql.run("DELETE FROM users WHERE id = ?", viewer);
  return withState(sql, "", "toast.deleted", sessionCookie(request, "", 0));
}

function download(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") ?? "";
  const postId = url.searchParams.get("postId") ?? "";
  if (productId) {
    const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return fail("err.product.missing", 404);
    if (Number(product.allow_download ?? 1) !== 1) return fail("err.download.closed", 403);
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
  const level = accessLevel(sql, viewer, product);
  if (level === "none") return fail("err.play.forbidden", 403);
  if (level === "preview") {
    const format = String(product.play_format);
    const progressMedia = String(product.preview_mode) === "progress" && (format === "voice" || format === "video" || format === "comic");
    if (!progressMedia) return fail("err.play.forbidden", 403);
  }
  return fileResponse(product, true);
}

function accessLevel(sql: Sql, viewer: string, product: Row) {
  if (!viewer || !String(product.play_format ?? "")) return "none";
  const mine = sql.get("SELECT handle FROM users WHERE id = ?", viewer);
  if (mine && String(mine.handle) === String(product.creator_id)) return "full";
  if (sql.get("SELECT product_id FROM purchases WHERE user_id = ? AND product_id = ?", viewer, String(product.id))) return "full";
  if (Number(product.listed ?? 1) !== 1) return "none";
  if (Number(product.allow_preview ?? 0) === 1) return "preview";
  return "none";
}

function playBody(product: Row) {
  try {
    const parsed = JSON.parse(String(product.play_body || "{}"));
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* The stored player document is not JSON. */
  }
  return {};
}

function playRead(sql: Sql, request: Request) {
  const viewer = userId(sql, request);
  if (!viewer) return fail("err.loginRequired", 401);
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.play_format)) return fail("err.play.missing", 404);
  const level = accessLevel(sql, viewer, product);
  if (level === "none") return fail("err.play.forbidden", 403);
  const format = String(product.play_format);
  const stored = playBody(product);
  const body = level === "preview"
    ? clipPlay(format, stored, String(product.preview_mode ?? ""), Number(product.preview_limit ?? 0), String(product.preview_body ?? ""))
    : stored;
  return json({
    id: String(product.id),
    format,
    title: String(product.title),
    creatorId: String(product.creator_id),
    preview: level === "preview",
    previewLimit: level === "preview" && String(product.preview_mode) === "progress" ? Number(product.preview_limit ?? 0) : 0,
    ...body,
  });
}

function playlistWrite(sql: Sql, viewer: string, body: Record<string, unknown>, op: string) {
  if (op === "playlist") {
    const name = textOf(body.name, 40);
    if (Array.from(name).length < 1) return fail("err.playlist.name");
    if (sql.all("SELECT id FROM playlists WHERE user_id = ?", viewer).length >= 30) return fail("err.playlist.count");
    const playlistId = id();
    sql.run(
      "INSERT INTO playlists (id, user_id, name, created_at) VALUES (?, ?, ?, ?)",
      playlistId,
      viewer,
      name,
      new Date().toISOString(),
    );
    return json({ ...snapshot(sql, viewer), code: "toast.playlist", playlistId });
  }
  const playlistId = textOf(body.playlistId, 80);
  const list = sql.get("SELECT id FROM playlists WHERE id = ? AND user_id = ?", playlistId, viewer);
  if (!list) return fail("err.playlist.missing", 404);
  if (op === "playlist-delete") {
    sql.run("DELETE FROM playlist_items WHERE playlist_id = ?", playlistId);
    sql.run("DELETE FROM playlists WHERE id = ?", playlistId);
    return withState(sql, viewer, "toast.playlist.delete");
  }
  const productId = textOf(body.productId, 80);
  const trackIndex = Number(body.trackIndex);
  if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 199) return fail("err.playlist.track");
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.play_format)) return fail("err.play.missing", 404);
  if (accessLevel(sql, viewer, product) !== "full") return fail("err.play.forbidden", 403);
  if (op === "playlist-remove") {
    sql.run(
      "DELETE FROM playlist_items WHERE playlist_id = ? AND product_id = ? AND track_index = ?",
      playlistId,
      productId,
      trackIndex,
    );
    return withState(sql, viewer, "toast.playlist.remove");
  }
  const existing = sql.get(
    "SELECT playlist_id FROM playlist_items WHERE playlist_id = ? AND product_id = ? AND track_index = ?",
    playlistId,
    productId,
    trackIndex,
  );
  if (!existing) {
    const last = sql.get("SELECT MAX(position) AS pos FROM playlist_items WHERE playlist_id = ?", playlistId);
    const position = Number(last?.pos ?? -1) + 1;
    sql.run(
      "INSERT INTO playlist_items (playlist_id, product_id, track_index, position) VALUES (?, ?, ?, ?)",
      playlistId,
      productId,
      trackIndex,
      position,
    );
  }
  return withState(sql, viewer, "toast.playlist.add");
}

function playWrite(sql: Sql, request: Request, body: Record<string, unknown>) {
  const { viewer, response } = requireUser(sql, request);
  if (response) return response;
  const op = typeof body.op === "string" ? body.op : "";
  if (op === "playlist" || op === "playlist-delete" || op === "playlist-add" || op === "playlist-remove") {
    return playlistWrite(sql, viewer, body, op);
  }
  const productId = textOf(body.productId, 80);
  const product = sql.get("SELECT * FROM products WHERE id = ?", productId);
  if (!product || !String(product.play_format)) return fail("err.play.missing", 404);
  const level = accessLevel(sql, viewer, product);
  if (level === "none") return fail("err.play.forbidden", 403);
  if (body.op !== "progress" && level !== "full") return fail("err.play.forbidden", 403);
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

export async function handleApp(request: Request, sql: Sql, env: PayEnv, limiter: Limiter, stripeFetch: typeof fetch = fetch): Promise<Response> {
  ensureSchema(sql);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/coin/sso") return coinSso(sql, request, env);
  if (request.method === "GET" && url.pathname === "/api/coin/return") return coinReturn(sql, request, env, stripeFetch);
  if (request.method === "GET" && url.pathname === "/api/state") return json(snapshot(sql, userId(sql, request), await loadFxRates(stripeFetch)));
  if (request.method === "GET" && url.pathname === "/api/download") return download(sql, request);
  if (request.method === "GET" && url.pathname === "/api/media") return media(sql, request);
  if (request.method === "GET" && url.pathname === "/api/play") return playRead(sql, request);
  if (request.method === "GET" && url.pathname === "/api/desk") return desk(sql, request, env, stripeFetch);
  if (request.method === "GET" && url.pathname === "/api/payout/refresh") return payoutRefresh(sql, request, env, stripeFetch);
  if (request.method === "GET" && url.pathname === "/api/avatar") return readAvatar(sql, request);
  if (request.method === "GET" && url.pathname === "/api/cover") return readCover(sql, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return fail("err.method", 405);
  const multipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
  if (url.pathname === "/api/products" && multipart) return publishUpload(sql, request);
  if (url.pathname === "/api/product" && multipart) return updateProduct(sql, request);
  if (url.pathname === "/api/avatar" && multipart) return uploadAvatar(sql, request);
  if (url.pathname === "/api/stripe/webhook") return stripeWebhook(sql, request, env, stripeFetch);
  if (url.pathname === "/api/coin/checkout") return coinApi(sql, request, env, stripeFetch);
  const body = await readJson(request);
  if (url.pathname === "/api/payout/run") {
    if (!env.CODE_SECRET || request.headers.get("x-fanstar-task") !== env.CODE_SECRET) return fail("err.route", 404);
    const when = textOf(body.now, 40);
    const now = when ? new Date(when) : new Date();
    if (Number.isNaN(now.getTime())) return fail("err.payout");
    const result = await runPayouts(sql, env, stripeFetch, now);
    return json(result);
  }
  if (url.pathname === "/api/register") return register(sql, request, body, env, limiter);
  if (url.pathname === "/api/login") return login(sql, request, body, limiter);
  if (url.pathname === "/api/password") return changePassword(sql, request, body, env, limiter);
  if (url.pathname === "/api/logout") return logout(sql, request);
  if (url.pathname === "/api/follow") return follow(sql, request, body);
  if (url.pathname === "/api/like") return like(sql, request, body);
  if (url.pathname === "/api/comments") return comment(sql, request, body);
  if (url.pathname === "/api/cart") return cart(sql, request, body);
  if (url.pathname === "/api/support") return creatorSupport(sql, request, body, stripeFetch);
  if (url.pathname === "/api/checkout") return checkout(sql, request, body, env, stripeFetch);
  if (url.pathname === "/api/checkout/complete") return fail("err.pay.coinsOnly");
  if (url.pathname === "/api/product/delete") return deleteProduct(sql, request, body);
  if (url.pathname === "/api/posts") return publishPost(sql, request, body);
  if (url.pathname === "/api/products") return publishProduct(sql, request, body);
  if (url.pathname === "/api/product-tags") return productTags(sql, request, body);
  if (url.pathname === "/api/play") return playWrite(sql, request, body);
  if (url.pathname === "/api/profile") return profile(sql, request, body);
  if (url.pathname === "/api/tiers") return updateTier(sql, request, body);
  if (url.pathname === "/api/studio") return studio(sql, request, body);
  if (url.pathname === "/api/payout/method") return savePayout(sql, request, body, env, stripeFetch);
  if (url.pathname === "/api/payout/link") return payoutLink(sql, request, body, env, stripeFetch);
  if (url.pathname === "/api/account") return deleteAccount(sql, request, body);
  return fail("err.route", 404);
}
