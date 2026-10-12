import { handleSend, memoryLimiter, type MailEnv } from "./codes.ts";
import { openSql } from "./node-db.ts";
import { handleApp } from "./platform.ts";

const sql = openSql(":memory:");
const limiter = memoryLimiter();
const env: MailEnv = { RESEND_API_KEY: "test-key", CODE_SECRET: "test-secret" };
const codes = new Map<string, string>();

async function ticket(email: string) {
  const response = await handleSend(
    new Request("http://127.0.0.1/api/send-code", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": email },
      body: JSON.stringify({ email }),
    }),
    env,
    limiter,
    {
      deliver: async (_apiKey, to, code) => {
        codes.set(to, code);
        return { ok: true };
      },
    },
  );
  const data = (await response.json()) as { token: string; expiresAt: number };
  if (!response.ok) throw new Error(`send failed ${response.status}`);
  return { code: codes.get(email) ?? "", token: data.token, expiresAt: data.expiresAt };
}

function client() {
  let cookie = "";
  return {
    async send(path: string, body?: unknown, method = "POST") {
      const response = await handleApp(
        new Request(`http://127.0.0.1${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            cookie,
            "cf-connecting-ip": "198.51.100.10",
          },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        }),
        sql,
        env,
        limiter,
      );
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0] ?? "";
      const raw = await response.text();
      const data = raw.startsWith("{") || raw.startsWith("[") ? JSON.parse(raw) : raw;
      return { status: response.status, data, raw };
    },
  };
}

const creator = client();
const creatorCode = await ticket("creator@example.com");
const registered = await creator.send("/api/register", {
  name: "阿实",
  email: "creator@example.com",
  password: "secret12",
  handle: "ashi",
  isCreator: true,
  ...creatorCode,
});
if (registered.status !== 200 || registered.data.user?.handle !== "ashi") {
  throw new Error(`register failed ${registered.status} ${registered.raw}`);
}
if (!registered.data.creators?.some((item: { handle: string }) => item.handle === "ashi")) {
  throw new Error("creator page missing");
}

const post = await creator.send("/api/posts", {
  title: "第一页",
  excerpt: "公开的门口",
  body: "这是创作者自己写下的正文。",
  minRank: 1,
});
if (post.status !== 200) throw new Error(`post failed ${post.raw}`);
const postId = post.data.posts[0].id as string;
if (!post.data.posts[0].body.includes("创作者自己写下")) throw new Error("author cannot read own post");

const product = await creator.send("/api/products", {
  title: "小册",
  description: "一本可以下载的册子",
  price: 12,
  kind: "文本",
  includes: ["小册.txt"],
  fileBody: "册子里的原句，买下之后可以读到。",
});
if (product.status !== 200) throw new Error(`product failed ${product.raw}`);
const productId = product.data.products[0].id as string;

const fan = client();
const fanCode = await ticket("fan@example.com");
const fanUser = await fan.send("/api/register", {
  name: "读者",
  email: "fan@example.com",
  password: "secret12",
  handle: "reader",
  isCreator: false,
  ...fanCode,
});
if (fanUser.status !== 200) throw new Error(`fan register failed ${fanUser.raw}`);
const locked = fanUser.data.posts.find((item: { id: string }) => item.id === postId);
if (locked.body) throw new Error("member post leaked before purchase");

const added = await fan.send("/api/cart", { productId, op: "add" });
if (added.status !== 200 || !added.data.user.cart.includes(productId)) throw new Error("cart failed");
const bought = await fan.send("/api/checkout", {});
if (bought.status !== 200 || !bought.data.user.library.some((item: { productId: string }) => item.productId === productId)) {
  throw new Error(`checkout failed ${bought.raw}`);
}
const file = await fan.send(`/api/download?productId=${productId}`, undefined, "GET");
if (!String(file.raw).includes("册子里的原句")) throw new Error(`download failed ${file.status} ${file.raw}`);

const plainPlay = await fan.send(`/api/play?productId=${productId}`, undefined, "GET");
if (plainPlay.status !== 404) throw new Error(`download-only work should not open in play ${plainPlay.status}`);

const comic = await creator.send("/api/products", {
  title: "连载",
  description: "可以翻页的漫画",
  price: 6,
  kind: "漫画",
  includes: ["第一话"],
  fileBody: "下载到的是同一段文字。",
  playFormat: "comic",
  playBody: "第一页的对白，买下就能翻。\n---\n第二页的对白，翻到这里。",
});
if (comic.status !== 200) throw new Error(`comic failed ${comic.raw}`);
const comicId = comic.data.products.find((item: { title: string }) => item.title === "连载").id as string;
if (comic.data.products.find((item: { id: string }) => item.id === comicId).playFormat !== "comic") {
  throw new Error("play format missing from catalog");
}
const preview = await creator.send(`/api/play?productId=${comicId}`, undefined, "GET");
if (preview.status !== 200 || preview.data.pages?.length !== 2) throw new Error(`creator preview ${preview.status}`);
const lockedPlay = await fan.send(`/api/play?productId=${comicId}`, undefined, "GET");
if (lockedPlay.status !== 403) throw new Error(`play should stay locked ${lockedPlay.status} ${lockedPlay.raw}`);
const carted = await fan.send("/api/cart", { productId: comicId, op: "add" });
if (carted.status !== 200) throw new Error(`second cart ${carted.raw}`);
const boughtPlay = await fan.send("/api/checkout", {});
if (boughtPlay.status !== 200) throw new Error(`play checkout ${boughtPlay.raw}`);
const openedPlay = await fan.send(`/api/play?productId=${comicId}`, undefined, "GET");
if (openedPlay.status !== 200 || openedPlay.data.pages?.[1]?.text !== "第二页的对白，翻到这里。") {
  throw new Error(`play read ${openedPlay.status} ${JSON.stringify(openedPlay.data)}`);
}
const marked = await fan.send("/api/play", { productId: comicId, op: "progress", cursor: "1" });
if (!marked.data.user.playProgress.some((item: { productId: string; cursor: string }) => item.productId === comicId && item.cursor === "1")) {
  throw new Error("progress was not saved");
}
const listed = await fan.send("/api/play", { productId: comicId, op: "list" });
if (!listed.data.user.playList.includes(comicId)) throw new Error("my list was not saved");
const badVideo = await creator.send("/api/products", {
  title: "坏视频",
  description: "地址不对",
  price: 3,
  kind: "视频",
  fileBody: "这段是下载用的说明文字。",
  playFormat: "video",
  playBody: "http://example.com/nope.mp4",
});
if (badVideo.status !== 400) throw new Error(`bad video should fail ${badVideo.status}`);

const tierId = bought.data.tiers.find((item: { creatorId: string }) => item.creatorId === "ashi").id as string;
const member = await fan.send("/api/checkout", { tierId });
if (member.status !== 200) throw new Error(`membership failed ${member.raw}`);
const opened = member.data.posts.find((item: { id: string }) => item.id === postId);
if (!opened.body.includes("创作者自己写下")) throw new Error("membership did not unlock the post");

const bad = await client().send("/api/login", { email: "fan@example.com", password: "nope" });
if (bad.status !== 401) throw new Error("bad password should fail");

console.log("platform checks passed");
