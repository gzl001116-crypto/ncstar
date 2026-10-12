const PLAY_HOST = "play.fanstar.dev";
const SHOP_HOSTS = new Set(["fanstar.dev", "www.fanstar.dev"]);

const SHOP_ROOTS = new Set([
  "login",
  "register",
  "explore",
  "terms",
  "privacy",
  "tokushoho",
  "about",
  "page",
  "studio",
  "library",
  "checkout",
  "reset",
  "c",
]);

export function isAbsolute(href: string) {
  return /^https?:\/\//.test(href);
}

export function isPlayHost(hostname = location.hostname) {
  return hostname.toLowerCase() === PLAY_HOST;
}

export function isShopHost(hostname = location.hostname) {
  return SHOP_HOSTS.has(hostname.toLowerCase());
}

function isLocalHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function originFor(url: URL, kind: "shop" | "play") {
  const production = url.protocol === "https:" && (url.port === "" || url.port === "443");
  if (production) return kind === "shop" ? "https://fanstar.dev" : "https://play.fanstar.dev";
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${kind === "shop" ? "fanstar.dev" : PLAY_HOST}${port}`;
}

/** Player path on the current host. Local dev stays under /play. */
export function playPath(id?: string) {
  if (isPlayHost()) return id ? `/${id}` : "/";
  return id ? `/play/${id}` : "/play";
}

/** Library, playlists, or history on the current host. */
export function playSection(section?: "lists" | "history") {
  if (isPlayHost()) return section ? `/${section}` : "/";
  return section ? `/play/${section}` : "/play";
}

/** Where a play link should go from this page. */
export function playHref(id?: string) {
  if (isPlayHost() || !isShopHost()) return playPath(id);
  const origin = originFor(new URL(location.href), "play");
  return id ? `${origin}/${id}` : `${origin}/`;
}

/** Shop path. On the player host this is an absolute fanstar.dev URL. */
export function shopHref(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!isPlayHost()) return normalized;
  return `${originFor(new URL(location.href), "shop")}${normalized}`;
}

/** Login URL that returns to the page the reader is on. */
export function loginHref() {
  if (!isPlayHost()) return `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const next = `${location.origin}${location.pathname}${location.search}`;
  return `${originFor(new URL(location.href), "shop")}/login?next=${encodeURIComponent(next)}`;
}

/** Full URL to leave this host, or null when the current address can stay. */
export function clientRedirect(href: string) {
  const url = new URL(href);
  if (isLocalHost(url.hostname)) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  const legacy = url.pathname === "/play" || url.pathname === "/play/" || url.pathname.startsWith("/play/");
  if ((isShopHost(url.hostname) || isPlayHost(url.hostname)) && legacy) {
    const rest = url.pathname === "/play" || url.pathname === "/play/" ? "/" : url.pathname.slice("/play".length);
    const origin = isPlayHost(url.hostname) ? url.origin : originFor(url, "play");
    return `${origin}${rest}${url.search}${url.hash}`;
  }
  if (isPlayHost(url.hostname)) {
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (SHOP_ROOTS.has(first)) return `${originFor(url, "shop")}${url.pathname}${url.search}${url.hash}`;
  }
  return null;
}

const ALLOWED_NEXT = new Set(["fanstar.dev", "www.fanstar.dev", PLAY_HOST]);

/** In-app path, or an absolute URL on fanstar.dev / play.fanstar.dev. */
export function safeNext(next: string | null) {
  if (!next) return null;
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  try {
    const url = new URL(next);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!ALLOWED_NEXT.has(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}
