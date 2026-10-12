import { clientRedirect } from "../src/site.ts";
import { playRedirect, sessionCookieHeaders } from "./hosts.ts";

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const library = playRedirect(new URL("https://fanstar.dev/play"));
expect(library === "https://play.fanstar.dev/", `shop /play → ${library}`);

const work = playRedirect(new URL("https://www.fanstar.dev/play/abc?from=shop"));
expect(work === "https://play.fanstar.dev/abc?from=shop", `shop work → ${work}`);

const slash = playRedirect(new URL("https://play.fanstar.dev/play/"));
expect(slash === "https://play.fanstar.dev/", `play /play/ → ${slash}`);

const shopPage = playRedirect(new URL("https://play.fanstar.dev/explore?kind=products"));
expect(shopPage === "https://fanstar.dev/explore?kind=products", `play explore → ${shopPage}`);

const studio = playRedirect(new URL("https://play.fanstar.dev/studio/works"));
expect(studio === "https://fanstar.dev/studio/works", `play studio → ${studio}`);

expect(playRedirect(new URL("https://play.fanstar.dev/page")) === "https://fanstar.dev/page", "play page returns to the shop");
expect(playRedirect(new URL("https://play.fanstar.dev/reset")) === "https://fanstar.dev/reset", "play reset returns to the shop");
expect(playRedirect(new URL("https://play.fanstar.dev/lists")) === null, "play lists stay");
expect(playRedirect(new URL("https://play.fanstar.dev/history")) === null, "play history stays");

const creator = playRedirect(new URL("https://play.fanstar.dev/c/ashi"));
expect(creator === "https://fanstar.dev/c/ashi", `play creator → ${creator}`);

expect(playRedirect(new URL("https://play.fanstar.dev/")) === null, "play library stays");
expect(playRedirect(new URL("https://play.fanstar.dev/abc")) === null, "play work stays");
expect(playRedirect(new URL("https://fanstar.dev/explore")) === null, "shop explore stays");
expect(playRedirect(new URL("https://fanstar.dev/playground")) === null, "playground stays");
expect(playRedirect(new URL("https://play.fanstar.dev/api/state")) === null, "play api stays");
expect(playRedirect(new URL("https://fanstar.dev/api/play")) === null, "shop api stays");
expect(playRedirect(new URL("http://127.0.0.1:5173/play")) === null, "local /play stays");

expect(clientRedirect("https://fanstar.dev/play") === "https://play.fanstar.dev/", "client shop library");
expect(clientRedirect("https://www.fanstar.dev/play/abc?from=shop") === "https://play.fanstar.dev/abc?from=shop", "client shop work");
expect(clientRedirect("https://play.fanstar.dev/play/abc") === "https://play.fanstar.dev/abc", "client legacy play path");
expect(clientRedirect("https://play.fanstar.dev/terms") === "https://fanstar.dev/terms", "client terms");
expect(clientRedirect("https://play.fanstar.dev/reset") === "https://fanstar.dev/reset", "client reset");
expect(clientRedirect("https://play.fanstar.dev/lists") === null, "client lists stay");
expect(clientRedirect("https://play.fanstar.dev/history") === null, "client history stays");
expect(clientRedirect("https://play.fanstar.dev/c/ashi/shop/1") === "https://fanstar.dev/c/ashi/shop/1", "client creator");
expect(clientRedirect("https://play.fanstar.dev/") === null, "client play root stays");
expect(clientRedirect("http://127.0.0.1:5173/play") === null, "client local stays");
expect(clientRedirect("http://fanstar.dev:5173/play/abc") === "http://play.fanstar.dev:5173/abc", "client keeps a nonstandard port");

const local = sessionCookieHeaders(new URL("http://127.0.0.1/api/login"), "tok", 60);
expect(local.length === 1 && local[0]?.includes("fanstar_session=tok") && !local[0]?.includes("Domain="), "local cookie is host-only");

const shared = sessionCookieHeaders(new URL("https://fanstar.dev/api/login"), "tok", 60);
expect(shared.length === 2, "fanstar login sets two cookies");
expect(shared[0]?.includes("Domain=.fanstar.dev") && shared[0]?.includes("Secure") && shared[0]?.includes("Max-Age=60"), "shared cookie");
expect(shared[1]?.includes("Max-Age=0") && !shared[1]?.includes("Domain="), "login clears the old host-only cookie");

const cleared = sessionCookieHeaders(new URL("https://play.fanstar.dev/api/logout"), "", 0);
expect(cleared.length === 2 && cleared.every((line) => line.includes("Max-Age=0")), "logout clears both cookies");
expect(cleared.some((line) => line.includes("Domain=.fanstar.dev")) && cleared.some((line) => !line.includes("Domain=")), "logout covers both scopes");
