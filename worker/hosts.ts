const PLAY_HOST = "play.fanstar.dev";
const COOKIE = "fanstar_session";

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
  "c",
]);

export function fanstarCookieDomain(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "fanstar.dev" || host.endsWith(".fanstar.dev")) return ".fanstar.dev";
  return "";
}

/** Set-Cookie lines for a login, or for clearing both the shared and host-only session. */
export function sessionCookieHeaders(url: URL, token: string, maxAge: number) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const domain = fanstarCookieDomain(url.hostname);
  const shared = `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${
    domain ? `; Domain=${domain}` : ""
  }${secure}`;
  if (!domain) return [shared];
  const hostOnly = `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  return [shared, hostOnly];
}

function playTarget(pathname: string) {
  if (pathname === "/play" || pathname === "/play/") return "/";
  return pathname.slice("/play".length);
}

/** Absolute URL to send the browser to, or null when this request should be served here. */
export function playRedirect(url: URL) {
  const host = url.hostname.toLowerCase();
  const shop = host === "fanstar.dev" || host === "www.fanstar.dev";
  const play = host === PLAY_HOST;
  if (!shop && !play) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  const legacy = url.pathname === "/play" || url.pathname === "/play/" || url.pathname.startsWith("/play/");
  if (legacy) return `https://play.fanstar.dev${playTarget(url.pathname)}${url.search}`;
  if (!play) return null;
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (SHOP_ROOTS.has(first)) return `https://fanstar.dev${url.pathname}${url.search}`;
  return null;
}
