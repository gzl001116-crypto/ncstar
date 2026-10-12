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

const tierId = bought.data.tiers.find((item: { creatorId: string }) => item.creatorId === "ashi").id as string;
const member = await fan.send("/api/checkout", { tierId });
if (member.status !== 200) throw new Error(`membership failed ${member.raw}`);
const opened = member.data.posts.find((item: { id: string }) => item.id === postId);
if (!opened.body.includes("创作者自己写下")) throw new Error("membership did not unlock the post");

const bad = await client().send("/api/login", { email: "fan@example.com", password: "nope" });
if (bad.status !== 401) throw new Error("bad password should fail");

console.log("platform checks passed");
