import { handleSend, memoryLimiter, type MailEnv } from "./codes.ts";
import { openSql } from "./node-db.ts";
import { handleApp } from "./platform.ts";

const sql = openSql(":memory:");
const limiter = memoryLimiter();
const env: MailEnv & { STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string } = {
  RESEND_API_KEY: "test-key",
  CODE_SECRET: "test-secret",
  STRIPE_SECRET_KEY: "sk_test_platform_check",
  STRIPE_WEBHOOK_SECRET: "whsec_platform_check",
};
const stripeSessions = new Map<string, { amount: number; paymentId: string; userId: string; currency: string }>();
let rateDown = false;
const stripeEvents = new Map<string, { id: string; type: string; data: { object: { id: string } } }>();
const transfers: { id: string; amount: number; currency: string; destination: string; key: string }[] = [];
let stripePaid = true;
let stripeAmount: number | null = null;
let connectReady = false;
let savedBank: { bank_name: string; last4: string } | null = null;

function headerValue(headers: HeadersInit | undefined, name: string) {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) ?? "";
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found ? String(found[1]) : "";
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? String(record[key]) : "";
}

async function stripeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  if (url.includes("open.er-api.com")) {
    if (rateDown) return new Response("down", { status: 503 });
    return Response.json({ result: "success", rates: { USD: 1, CNY: 7.2, GBP: 0.8, EUR: 0.9, JPY: 150, HKD: 7.8, SGD: 1.35, CAD: 1.36, AUD: 1.5 } });
  }
  if (url.includes("/v2/") && headerValue(init?.headers, "Stripe-Version") !== "2026-09-30.preview") {
    throw new Error("stripe version missing");
  }
  if (method === "POST" && url.includes("/v2/core/accounts") && !url.includes("/v2/core/account_links")) {
    return Response.json({ id: "acct_creator_test" });
  }
  if (method === "POST" && url.includes("/v2/core/account_links")) {
    return Response.json({ url: "https://connect.stripe.test/onboard" });
  }
  if (method === "POST" && url.includes("/external_accounts")) {
    const params = new URLSearchParams(String(init?.body ?? ""));
    const number = params.get("external_account[account_number]") ?? "";
    const holder = params.get("external_account[account_holder_name]") ?? "";
    if (!holder || number.length < 4) return Response.json({ error: { code: "account_number_invalid" } }, { status: 400 });
    savedBank = { bank_name: "TEST BANK", last4: number.slice(-4) };
    return Response.json({ id: "ba_test", object: "bank_account", bank_name: "TEST BANK", last4: savedBank.last4, default_for_currency: true });
  }
  if (method === "GET" && url.includes("/external_accounts")) {
    return Response.json({
      data: savedBank ? [{ object: "bank_account", bank_name: savedBank.bank_name, last4: savedBank.last4, currency: "gbp", default_for_currency: true }] : [],
    });
  }
  if (method === "GET" && url.includes("/v2/core/accounts/")) {
    return Response.json({
      id: "acct_creator_test",
      dashboard: "none",
      identity: { country: "gb" },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: connectReady ? "active" : "pending" } } } },
      },
    });
  }
  if (method === "POST" && url.includes("/v1/transfers")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { amount?: number; currency?: string; destination?: string };
    const id = `tr_${transfers.length + 1}`;
    transfers.push({
      id,
      amount: Number(body.amount),
      currency: String(body.currency),
      destination: String(body.destination),
      key: headerValue(init?.headers, "Idempotency-Key"),
    });
    return Response.json({ id });
  }
  if (init?.method === "POST") {
    const params = new URLSearchParams(String(init.body ?? ""));
    if (url.includes("/v1/checkout/sessions")) {
      if (params.has("payment_method_types[0]")) throw new Error("payment_method_types set");
      const currency = params.get("line_items[0][price_data][currency]") ?? "";
      if (currency !== "cny" && currency !== "usd") throw new Error(`currency ${currency}`);
      const pay = params.get("metadata[pay]");
      if (currency === "cny" && (pay !== "card" || params.get("payment_method_options[wechat_pay][client]") !== "web")) {
        throw new Error("card session shape");
      }
      if (currency === "usd" && (pay !== "crypto" || params.has("payment_method_options[wechat_pay][client]"))) {
        throw new Error("crypto session shape");
      }
      for (const [key, value] of params) {
        if (key.includes("[price_data][currency]") && value !== currency) throw new Error("mixed currency");
      }
    }
    let amount = 0;
    for (const [key, value] of params) {
      if (key.endsWith("[price_data][unit_amount]")) amount += Number(value);
    }
    const currency = params.get("line_items[0][price_data][currency]") ?? "cny";
    const id = `cs_test_${stripeSessions.size + 1}`;
    stripeSessions.set(id, {
      amount,
      currency,
      paymentId: params.get("metadata[paymentId]") ?? "",
      userId: params.get("metadata[userId]") ?? "",
    });
    return Response.json({ id, url: `https://checkout.stripe.test/${id}`, payment_status: "unpaid", status: "open", amount_total: amount, currency, metadata: {} });
  }
  if (url.includes("/v1/events/")) {
    const eventId = decodeURIComponent(url.split("/").pop() ?? "");
    const event = stripeEvents.get(eventId);
    if (!event) return Response.json({ error: { code: "resource_missing" } }, { status: 404 });
    return Response.json(event);
  }
  const id = url.split("/").pop() ?? "";
  const saved = stripeSessions.get(decodeURIComponent(id));
  if (!saved) return Response.json({ error: { code: "resource_missing" } }, { status: 404 });
  return Response.json({
    id: decodeURIComponent(id),
    url: `https://checkout.stripe.test/${id}`,
    payment_status: stripePaid ? "paid" : "unpaid",
    status: stripePaid ? "complete" : "open",
    amount_total: stripeAmount ?? saved.amount,
    currency: saved.currency,
    metadata: { paymentId: saved.paymentId, userId: saved.userId },
  });
}
const codes = new Map<string, string>();

async function ticket(email: string, fresh = false) {
  const response = await handleSend(
    new Request("http://127.0.0.1/api/send-code", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": email },
      body: JSON.stringify({ email }),
    }),
    env,
    fresh ? memoryLimiter() : limiter,
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
    async send(path: string, body?: unknown, method = "POST", extra: Record<string, string> = {}) {
      const response = await handleApp(
        new Request(`http://127.0.0.1${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            cookie,
            "cf-connecting-ip": "198.51.100.10",
            ...extra,
          },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        }),
        sql,
        env,
        limiter,
        stripeFetch,
      );
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0] ?? "";
      const raw = await response.text();
      const data = raw.startsWith("{") || raw.startsWith("[") ? JSON.parse(raw) : raw;
      return { status: response.status, data, raw, type: response.headers.get("content-type") ?? "" };
    },
    async sendForm(path: string, form: FormData) {
      const response = await handleApp(
        new Request(`http://127.0.0.1${path}`, {
          method: "POST",
          headers: { cookie, "cf-connecting-ip": "198.51.100.10" },
          body: form,
        }),
        sql,
        env,
        limiter,
        stripeFetch,
      );
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0] ?? "";
      const raw = await response.text();
      const data = raw.startsWith("{") || raw.startsWith("[") ? JSON.parse(raw) : raw;
      return { status: response.status, data, raw, type: response.headers.get("content-type") ?? "" };
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
const fanHandle = String(fanUser.data.user?.handle ?? "");
if (fanUser.status !== 200 || fanHandle === "reader" || !/^u[a-f0-9]{12}$/.test(fanHandle)) {
  throw new Error(`fan register failed ${fanUser.raw}`);
}
if (fanUser.data.creators?.some((item: { handle: string }) => item.handle === "reader")) {
  throw new Error("reader handle became a creator page");
}
sql.run("UPDATE users SET coins = 10000 WHERE email = ?", "fan@example.com");
const locked = fanUser.data.posts.find((item: { id: string }) => item.id === postId);
if (locked.body) throw new Error("member post leaked before purchase");

const added = await fan.send("/api/cart", { productId, op: "add" });
if (added.status !== 200 || !added.data.user.cart.includes(productId)) throw new Error("cart failed");
async function settle(sender: { send: (path: string, body?: unknown) => Promise<{ status: number; data: any; raw: string }> }, body?: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return sender.send("/api/checkout", { ...input, pay: "coins", idempotencyKey: String(input.idempotencyKey ?? crypto.randomUUID()) });
}
const bought = await settle(fan);
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
const boughtPlay = await settle(fan);
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
const member = await settle(fan, { tierId });
if (member.status !== 200) throw new Error(`membership failed ${member.raw}`);
const opened = member.data.posts.find((item: { id: string }) => item.id === postId);
if (!opened.body.includes("创作者自己写下")) throw new Error("membership did not unlock the post");

const bad = await client().send("/api/login", { email: "fan@example.com", password: "nope" });
if (bad.status !== 401) throw new Error("bad password should fail");

const upload = new FormData();
upload.set("title", "上传的短文");
upload.set("description", "文件就是正文");
upload.set("price", "4");
upload.set("kind", "小说");
upload.set("includes", "原文");
upload.set("file", new File(["文件里的第一句。"], "note.txt", { type: "text/plain" }));
const uploaded = await creator.sendForm("/api/products", upload);
if (uploaded.status !== 200) throw new Error(`upload failed ${uploaded.status} ${uploaded.raw}`);
const uploadedId = uploaded.data.products.find((item: { title: string }) => item.title === "上传的短文").id as string;
if (uploaded.data.products.find((item: { id: string }) => item.id === uploadedId).playFormat !== "novel") {
  throw new Error("text upload should open as a novel on play");
}
const uploadedFile = await creator.send(`/api/download?productId=${uploadedId}`, undefined, "GET");
if (!String(uploadedFile.raw).includes("文件里的第一句")) throw new Error("uploaded file did not download");

const denied = await fan.send("/api/desk", undefined, "GET");
if (denied.status !== 403) throw new Error(`reader desk should be 403, got ${denied.status}`);
const desk = await creator.send("/api/desk", undefined, "GET");
if (desk.status !== 200 || !desk.data.orders.some((item: { kind: string }) => item.kind === "membership")) {
  throw new Error(`desk missing membership ${desk.status} ${desk.raw}`);
}
if (desk.data.members.length < 1 || !(desk.data.net < desk.data.gross)) throw new Error(`desk totals ${desk.raw}`);
const renamed = await creator.send("/api/tiers", {
  id: tierId,
  name: "读者席",
  price: 21,
  blurb: "解锁会员动态，并下载附件。",
  perks: ["会员动态", "附件下载"],
});
if (renamed.status !== 200 || !renamed.data.tiers.some((item: { id: string; price: number }) => item.id === tierId && item.price === 21)) {
  throw new Error(`tier update failed ${renamed.status} ${renamed.raw}`);
}
const tagged = await creator.send("/api/profile", { name: "阿实", bio: "刚来到 fanstar。", tags: "写作, 夜间" });
if (tagged.status !== 200 || !tagged.data.creators.find((item: { handle: string }) => item.handle === "ashi").tags.includes("夜间")) {
  throw new Error(`tags were not saved ${tagged.raw}`);
}

const longTag = await creator.send("/api/products", {
  title: "标签过长",
  description: "这个标签超过五个字",
  price: 3,
  kind: "文本",
  includes: ["标签.txt"],
  fileBody: "标签作品的正文内容。",
  tags: ["一二三四五六"],
});
if (longTag.status !== 400 || longTag.data.code !== "err.tag.length") throw new Error(`long tag ${longTag.status} ${longTag.raw}`);
const manyTags = await creator.send("/api/products", {
  title: "标签过多",
  description: "这个标签数量超过十个",
  price: 3,
  kind: "文本",
  includes: ["标签.txt"],
  fileBody: "标签作品的正文内容。",
  tags: ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "多"],
});
if (manyTags.status !== 400 || manyTags.data.code !== "err.tag.count") throw new Error(`tag count ${manyTags.status} ${manyTags.raw}`);
const withTags = await creator.send("/api/products", {
  title: "带标签",
  description: "有两个短标签",
  price: 3,
  kind: "文本",
  includes: ["标签.txt"],
  fileBody: "标签作品的正文内容。",
  tags: ["短篇", "夜", "短篇"],
});
if (withTags.status !== 200) throw new Error(`tagged work ${withTags.status} ${withTags.raw}`);
const taggedWork = withTags.data.products.find((item: { title: string }) => item.title === "带标签");
if (!taggedWork?.tags.includes("短篇") || !taggedWork.tags.includes("夜") || taggedWork.tags.length !== 2) {
  throw new Error(`work tags ${JSON.stringify(taggedWork?.tags)}`);
}
const retag = await creator.send("/api/product-tags", { productId: taggedWork.id, tags: "夜，窗" });
const retagged = retag.data.products?.find((item: { id: string }) => item.id === taggedWork.id);
if (retag.status !== 200 || retagged?.tags.join(",") !== "夜,窗") throw new Error(`retag ${retag.status} ${retag.raw}`);
const stolen = await fan.send("/api/product-tags", { productId: taggedWork.id, tags: "别人" });
if (stolen.status === 200) throw new Error("reader should not edit work tags");

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const avatar = new FormData();
avatar.set("file", new File([png], "face.png", { type: "image/png" }));
const savedAvatar = await creator.sendForm("/api/avatar", avatar);
if (savedAvatar.status !== 200 || !savedAvatar.data.user?.avatarAt) throw new Error(`avatar upload ${savedAvatar.status} ${savedAvatar.raw}`);
if (!savedAvatar.data.creators.find((item: { handle: string }) => item.handle === "ashi").avatarAt) throw new Error("creator stamp missing");
const fetched = await creator.send("/api/avatar?id=ashi", undefined, "GET");
if (fetched.status !== 200 || !fetched.type.includes("image/png")) throw new Error(`avatar read ${fetched.status} ${fetched.type}`);
const svg = new FormData();
svg.set("file", new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "face.svg", { type: "image/svg+xml" }));
const rejectedAvatar = await creator.sendForm("/api/avatar", svg);
if (rejectedAvatar.status !== 400 || rejectedAvatar.data.code !== "err.avatar.type") throw new Error(`svg avatar ${rejectedAvatar.status} ${rejectedAvatar.raw}`);
const huge = new FormData();
huge.set("file", new File([new Uint8Array(1024 * 1024 + 1)], "big.png", { type: "image/png" }));
const hugeAvatar = await creator.sendForm("/api/avatar", huge);
if (hugeAvatar.status !== 400 || hugeAvatar.data.code !== "err.avatar.size") throw new Error(`huge avatar ${hugeAvatar.status} ${hugeAvatar.raw}`);

const gone = client();
const goneCode = await ticket("gone@example.com");
const made = await gone.send("/api/register", {
  name: "离开",
  email: "gone@example.com",
  password: "secret12",
  handle: "goneuser",
  isCreator: false,
  ...goneCode,
});
if (made.status !== 200) throw new Error(`gone register ${made.status} ${made.raw}`);
const shortApply = await gone.send("/api/studio", { category: "写作", location: "京都", bio: "太短" });
if (shortApply.status !== 400 || shortApply.data.code !== "err.apply") throw new Error(`short apply ${shortApply.status} ${shortApply.raw}`);
const badCategory = await gone.send("/api/studio", { category: "其他", location: "京都", bio: "我想发布摄影作品和短文。" });
if (badCategory.status !== 400 || badCategory.data.code !== "err.category") throw new Error(`bad category ${badCategory.status} ${badCategory.raw}`);
const missingHandle = await gone.send("/api/studio", { category: "摄影", location: "京都", bio: "我想发布摄影作品和短文。" });
if (missingHandle.status !== 400 || missingHandle.data.code !== "err.handle") throw new Error(`missing handle ${missingHandle.status} ${missingHandle.raw}`);
const applied = await gone.send("/api/studio", { handle: "goneuser", category: "摄影", location: "京都", bio: "我想发布摄影作品和短文。" });
const appliedPage = applied.data.creators?.find((item: { handle: string }) => item.handle === "goneuser");
if (applied.status !== 200 || !applied.data.user?.isCreator || appliedPage?.category !== "摄影" || appliedPage?.location !== "京都") {
  throw new Error(`apply ${applied.status} ${applied.raw}`);
}
const wrongPassword = await gone.send("/api/account", { password: "nope" });
if (wrongPassword.status !== 401) throw new Error(`wrong delete password ${wrongPassword.status}`);
const removed = await gone.send("/api/account", { password: "secret12" });
if (removed.status !== 200 || removed.data.user || removed.data.creators?.some((item: { handle: string }) => item.handle === "goneuser")) {
  throw new Error(`delete account ${removed.status} ${removed.raw}`);
}
const again = await gone.send("/api/login", { email: "gone@example.com", password: "secret12" });
if (again.status !== 401) throw new Error("deleted account should not log in");

const closedForm = new FormData();
closedForm.set("title", "只能播放");
closedForm.set("description", "不提供下载");
closedForm.set("price", "4");
closedForm.set("kind", "小说");
closedForm.set("play", "1");
closedForm.set("download", "0");
closedForm.set("file", new File(["完整正文比预览更长。"], "story.txt", { type: "text/plain" }));
const closed = await creator.sendForm("/api/products", closedForm);
if (closed.status !== 200) throw new Error(`play only upload ${closed.status} ${closed.raw}`);
const closedWork = closed.data.products.find((item: { title: string }) => item.title === "只能播放");
if (closedWork?.playFormat !== "novel" || closedWork.allowDownload) throw new Error(`play only flags ${JSON.stringify(closedWork)}`);
const closedFile = await creator.send(`/api/download?productId=${closedWork.id}`, undefined, "GET");
if (closedFile.status !== 403 || closedFile.data.code !== "err.download.closed") throw new Error(`closed download ${closedFile.status} ${closedFile.raw}`);

const downloadOnly = new FormData();
downloadOnly.set("title", "只能下载");
downloadOnly.set("description", "不进入 play");
downloadOnly.set("price", "4");
downloadOnly.set("kind", "小说");
downloadOnly.set("play", "0");
downloadOnly.set("download", "1");
downloadOnly.set("file", new File(["这是只能下载的正文。"], "file.txt", { type: "text/plain" }));
const downloadedOnly = await creator.sendForm("/api/products", downloadOnly);
const downloadWork = downloadedOnly.data.products?.find((item: { title: string }) => item.title === "只能下载");
if (downloadedOnly.status !== 200 || downloadWork?.playFormat) throw new Error(`download only ${downloadedOnly.status} ${downloadedOnly.raw}`);

const neither = new FormData();
neither.set("title", "不能打开");
neither.set("description", "没有打开方式");
neither.set("price", "4");
neither.set("kind", "小说");
neither.set("play", "0");
neither.set("download", "0");
neither.set("file", new File(["这段不会保存。"], "nope.txt", { type: "text/plain" }));
const refused = await creator.sendForm("/api/products", neither);
if (refused.status !== 400 || refused.data.code !== "err.open") throw new Error(`neither ${refused.status} ${refused.raw}`);

const opaque = new FormData();
opaque.set("title", "无法解析");
opaque.set("description", "二进制不能播放");
opaque.set("price", "4");
opaque.set("kind", "数字作品");
opaque.set("play", "1");
opaque.set("download", "1");
opaque.set("file", new File([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])], "blob.bin", { type: "application/octet-stream" }));
const unparsed = await creator.sendForm("/api/products", opaque);
if (unparsed.status !== 400 || unparsed.data.code !== "err.play.file") throw new Error(`unparsed ${unparsed.status} ${unparsed.raw}`);

const previewForm = new FormData();
previewForm.set("title", "可预览");
previewForm.set("description", "只公开开头");
previewForm.set("price", "4");
previewForm.set("kind", "小说");
previewForm.set("play", "1");
previewForm.set("download", "1");
previewForm.set("preview", "1");
previewForm.set("previewMode", "progress");
previewForm.set("previewLimit", "4");
previewForm.set("file", new File(["预览作品的完整正文在这里。"], "preview.txt", { type: "text/plain" }));
const previewed = await creator.sendForm("/api/products", previewForm);
const previewWork = previewed.data.products?.find((item: { title: string }) => item.title === "可预览");
if (previewed.status !== 200 || !previewWork?.allowPreview) throw new Error(`preview upload ${previewed.status} ${previewed.raw}`);
const guestPreview = await fan.send(`/api/play?productId=${previewWork.id}`, undefined, "GET");
if (guestPreview.status !== 200 || guestPreview.data.preview !== true || guestPreview.data.novel !== "预览作品") {
  throw new Error(`guest preview ${guestPreview.status} ${guestPreview.raw}`);
}
const ownerPreview = await creator.send(`/api/play?productId=${previewWork.id}`, undefined, "GET");
if (ownerPreview.data.preview !== false || !String(ownerPreview.data.novel).includes("完整正文")) {
  throw new Error(`owner should see the full text ${ownerPreview.raw}`);
}
const customForm = new FormData();
customForm.set("title", "自定义预览");
customForm.set("description", "另写一段");
customForm.set("price", "4");
customForm.set("kind", "小说");
customForm.set("play", "1");
customForm.set("download", "0");
customForm.set("preview", "1");
customForm.set("previewMode", "content");
customForm.set("previewBody", "这里是单独写的预览。");
customForm.set("file", new File(["正式正文不应该出现在预览里。"], "custom.txt", { type: "text/plain" }));
const custom = await creator.sendForm("/api/products", customForm);
const customWork = custom.data.products?.find((item: { title: string }) => item.title === "自定义预览");
if (custom.status !== 200 || !customWork) throw new Error(`custom preview ${custom.status} ${custom.raw}`);
const customRead = await fan.send(`/api/play?productId=${customWork.id}`, undefined, "GET");
if (customRead.data.novel !== "这里是单独写的预览。" || String(customRead.data.novel).includes("正式正文")) {
  throw new Error(`custom preview text ${customRead.raw}`);
}
const customFile = await fan.send(`/api/download?productId=${customWork.id}`, undefined, "GET");
if (customFile.status !== 403) throw new Error(`preview must not download ${customFile.status}`);

const voice = await creator.send("/api/products", {
  title: "两轨音声",
  description: "播放列表用",
  price: 6,
  kind: "音乐",
  fileBody: "这是音声作品的说明文件。",
  playFormat: "voice",
  playBody: "第一轨\n夜里的第一段。\n---\n第二轨\n夜里的第二段。",
  includes: ["音声"],
});
const voiceWork = voice.data.products?.find((item: { title: string }) => item.title === "两轨音声");
if (voice.status !== 200 || voiceWork?.playFormat !== "voice") throw new Error(`voice upload ${voice.status} ${voice.raw}`);
const blankList = await creator.send("/api/play", { op: "playlist", name: "   " });
if (blankList.status !== 400 || blankList.data.code !== "err.playlist.name") throw new Error(`blank playlist ${blankList.status} ${blankList.raw}`);
const playlistMade = await creator.send("/api/play", { op: "playlist", name: "夜里" });
const playlistId = playlistMade.data.playlistId as string;
if (playlistMade.status !== 200 || !playlistId || playlistMade.data.user.playlists[0]?.name !== "夜里") {
  throw new Error(`create playlist ${playlistMade.status} ${playlistMade.raw}`);
}
const addedTrack = await creator.send("/api/play", { op: "playlist-add", playlistId, productId: voiceWork.id, trackIndex: 0 });
const addedNext = await creator.send("/api/play", { op: "playlist-add", playlistId, productId: voiceWork.id, trackIndex: 1 });
const againTrack = await creator.send("/api/play", { op: "playlist-add", playlistId, productId: voiceWork.id, trackIndex: 0 });
const tracks = againTrack.data.user?.playlists?.find((item: { id: string }) => item.id === playlistId)?.items ?? [];
if (addedTrack.status !== 200 || addedNext.status !== 200 || tracks.length !== 2 || tracks[1]?.trackIndex !== 1) {
  throw new Error(`playlist tracks ${addedTrack.status} ${againTrack.raw}`);
}
const fanList = await fan.send("/api/play", { op: "playlist", name: "读者列表" });
const fanDenied = await fan.send("/api/play", {
  op: "playlist-add",
  playlistId: fanList.data.playlistId,
  productId: voiceWork.id,
  trackIndex: 0,
});
if (fanDenied.status !== 403) throw new Error(`fan cannot add an unowned track ${fanDenied.status} ${fanDenied.raw}`);
const guest = client();
const noSession = await guest.send("/api/play", { op: "playlist", name: "无" });
if (noSession.status !== 401) throw new Error(`guest playlist ${noSession.status}`);
const removedTrack = await creator.send("/api/play", { op: "playlist-remove", playlistId, productId: voiceWork.id, trackIndex: 1 });
const left = removedTrack.data.user?.playlists?.find((item: { id: string }) => item.id === playlistId)?.items ?? [];
if (removedTrack.status !== 200 || left.length !== 1) throw new Error(`remove track ${removedTrack.status} ${removedTrack.raw}`);
const deletedList = await creator.send("/api/play", { op: "playlist-delete", playlistId });
if (deletedList.status !== 200 || deletedList.data.user?.playlists?.some((item: { id: string }) => item.id === playlistId)) {
  throw new Error(`delete playlist ${deletedList.status} ${deletedList.raw}`);
}

const shortPassword = await creator.send("/api/password", { code: "000000", token: "a".repeat(64), expiresAt: Date.now() + 1000, password: "short" });
if (shortPassword.status !== 400 || shortPassword.data.code !== "err.password") throw new Error(`short password ${shortPassword.status} ${shortPassword.raw}`);
const passTicket = await ticket("creator@example.com", true);
const wrongCode = await creator.send("/api/password", {
  code: passTicket.code === "000000" ? "111111" : "000000",
  token: passTicket.token,
  expiresAt: passTicket.expiresAt,
  password: "secret99",
});
if (wrongCode.status !== 400 || wrongCode.data.code !== "err.code.wrong") throw new Error(`wrong password code ${wrongCode.status} ${wrongCode.raw}`);
const changed = await creator.send("/api/password", {
  email: "other@example.com",
  code: passTicket.code,
  token: passTicket.token,
  expiresAt: passTicket.expiresAt,
  password: "secret99",
});
if (changed.status !== 200 || changed.data.code !== "toast.password" || changed.data.user?.email !== "creator@example.com") {
  throw new Error(`change password ${changed.status} ${changed.raw}`);
}
const oldLogin = await client().send("/api/login", { email: "creator@example.com", password: "secret12" });
if (oldLogin.status !== 401) throw new Error("old password should fail");
const newLogin = await client().send("/api/login", { email: "creator@example.com", password: "secret99" });
if (newLogin.status !== 200) throw new Error(`new password login ${newLogin.status} ${newLogin.raw}`);
const missingTicket = await ticket("nobody@example.com");
const missing = await client().send("/api/password", { email: "nobody@example.com", ...missingTicket, password: "secret99" });
if (missing.status !== 401 || missing.data.code !== "err.login") throw new Error(`unknown email reset ${missing.status} ${missing.raw}`);
const fanTicket = await ticket("fan@example.com", true);
const reset = await client().send("/api/password", { email: "fan@example.com", ...fanTicket, password: "secret34" });
if (reset.status !== 200 || reset.data.user?.handle !== fanHandle) throw new Error(`reset password ${reset.status} ${reset.raw}`);
const fanOld = await fan.send("/api/state", undefined, "GET");
if (fanOld.status !== 200 || fanOld.data.user) throw new Error("old fan session should be gone");
const fanNew = await client().send("/api/login", { email: "fan@example.com", password: "secret34" });
if (fanNew.status !== 200) throw new Error(`reset login ${fanNew.status} ${fanNew.raw}`);

const readerNow = client();
const readerLogin = await readerNow.send("/api/login", { email: "fan@example.com", password: "secret34" });
if (readerLogin.status !== 200) throw new Error(`reader login ${readerLogin.status} ${readerLogin.raw}`);
const tinyName = await creator.send("/api/products", {
  title: "短",
  description: "",
  price: 3,
  kind: "文本",
  includes: ["短.txt"],
  fileBody: "一二三四五六七八",
});
if (tinyName.status !== 400 || tinyName.data.code !== "err.product.title") throw new Error(`short title ${tinyName.status} ${tinyName.raw}`);
const cheapForm = new FormData();
cheapForm.set("title", "太便宜");
cheapForm.set("description", "");
cheapForm.set("price", "0.5");
cheapForm.set("kind", "数字作品");
cheapForm.set("play", "0");
cheapForm.set("download", "1");
cheapForm.set("file", new File([Uint8Array.from([1, 2, 3, 4])], "pack.zip", { type: "application/zip" }));
const cheap = await creator.sendForm("/api/products", cheapForm);
if (cheap.status !== 400 || cheap.data.code !== "err.price") throw new Error(`cheap price ${cheap.status} ${cheap.raw}`);
const archive = new FormData();
archive.set("title", "压缩包");
archive.set("description", "");
archive.set("price", "4");
archive.set("kind", "数字作品");
archive.set("play", "0");
archive.set("download", "1");
archive.set("file", new File([Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])], "pack.zip", { type: "application/zip" }));
const archived = await creator.sendForm("/api/products", archive);
const archiveWork = archived.data.products?.find((item: { title: string }) => item.title === "压缩包");
if (archived.status !== 200 || archiveWork?.playFormat || archiveWork?.description !== "") {
  throw new Error(`download-only archive ${archived.status} ${archived.raw}`);
}
const zipPlay = new FormData();
zipPlay.set("productId", archiveWork.id);
zipPlay.set("title", "压缩包");
zipPlay.set("description", "");
zipPlay.set("price", "4");
zipPlay.set("kind", "数字作品");
zipPlay.set("play", "1");
zipPlay.set("download", "1");
zipPlay.set("listed", "1");
const zipRejected = await creator.sendForm("/api/product", zipPlay);
if (zipRejected.status !== 400 || zipRejected.data.code !== "err.play.file") {
  throw new Error(`zip cannot switch to play ${zipRejected.status} ${zipRejected.raw}`);
}
const openDownload = new FormData();
openDownload.set("productId", downloadWork.id);
openDownload.set("title", "只能下载");
openDownload.set("description", "不进入 play");
openDownload.set("price", "4");
openDownload.set("kind", "小说");
openDownload.set("play", "1");
openDownload.set("download", "1");
openDownload.set("listed", "1");
const switchedPlay = await creator.sendForm("/api/product", openDownload);
const switchedWork = switchedPlay.data.products?.find((item: { id: string }) => item.id === downloadWork.id);
if (switchedPlay.status !== 200 || switchedWork?.playFormat !== "novel") {
  throw new Error(`switch download to play ${switchedPlay.status} ${switchedPlay.raw}`);
}
const blankForm = new FormData();
blankForm.set("title", "空白介绍");
blankForm.set("description", "");
blankForm.set("price", "12.5");
blankForm.set("kind", "小说");
blankForm.set("play", "1");
blankForm.set("download", "1");
blankForm.set("file", new File(["空白介绍的完整正文在这里。"], "blank.txt", { type: "text/plain" }));
const blanked = await creator.sendForm("/api/products", blankForm);
const blankWork = blanked.data.products?.find((item: { title: string }) => item.title === "空白介绍");
if (blanked.status !== 200 || !blankWork || blankWork.description !== "" || blankWork.price !== 12.5) {
  throw new Error(`blank description ${blanked.status} ${blanked.raw}`);
}
const queued = await readerNow.send("/api/cart", { productId: blankWork.id, op: "add" });
if (queued.status !== 200) throw new Error(`queue work ${queued.status} ${queued.raw}`);
const editForm = new FormData();
editForm.set("productId", blankWork.id);
editForm.set("title", "改过的名字");
editForm.set("description", "");
editForm.set("price", "18.5");
editForm.set("kind", "小说");
editForm.set("tags", "短篇");
editForm.set("play", "1");
editForm.set("download", "1");
editForm.set("preview", "0");
editForm.set("listed", "0");
editForm.set("cover", new File([png], "cover.png", { type: "image/png" }));
const edited = await creator.sendForm("/api/product", editForm);
const editedWork = edited.data.products?.find((item: { id: string }) => item.id === blankWork.id);
if (
  edited.status !== 200 ||
  edited.data.code !== "toast.work" ||
  editedWork?.title !== "改过的名字" ||
  editedWork?.price !== 18.5 ||
  editedWork?.listed !== false ||
  editedWork?.description !== "" ||
  !editedWork?.coverAt ||
  !editedWork?.tags?.includes("短篇")
) {
  throw new Error(`edit work ${edited.status} ${edited.raw}`);
}
const hiddenShelf = await readerNow.send("/api/state", undefined, "GET");
if (hiddenShelf.data.products?.some((item: { id: string }) => item.id === blankWork.id)) {
  throw new Error("unlisted work is still in the reader catalog");
}
const hiddenCart = await readerNow.send("/api/cart", { productId: blankWork.id, op: "add" });
if (hiddenCart.status !== 404 || hiddenCart.data.code !== "err.product.missing") {
  throw new Error(`unlisted cart ${hiddenCart.status} ${hiddenCart.raw}`);
}
const hiddenPlay = await readerNow.send(`/api/play?productId=${blankWork.id}`, undefined, "GET");
if (hiddenPlay.status !== 403) throw new Error(`unlisted preview ${hiddenPlay.status} ${hiddenPlay.raw}`);
const droppedCart = await readerNow.send("/api/checkout", {});
if (droppedCart.status !== 400 || droppedCart.data.code !== "err.cart.empty") {
  throw new Error(`dropped cart ${droppedCart.status} ${droppedCart.raw}`);
}
const afterDrop = await readerNow.send("/api/state", undefined, "GET");
if (afterDrop.data.user?.cart?.includes(blankWork.id)) throw new Error("unlisted item stayed in the cart");
const coverRead = await client().send(`/api/cover?id=${blankWork.id}`, undefined, "GET");
if (coverRead.status !== 200 || !coverRead.type.includes("image/png")) throw new Error(`cover read ${coverRead.status} ${coverRead.type}`);
const svgCover = new FormData();
svgCover.set("productId", blankWork.id);
svgCover.set("title", "改过的名字");
svgCover.set("description", "");
svgCover.set("price", "18.5");
svgCover.set("kind", "小说");
svgCover.set("play", "1");
svgCover.set("download", "1");
svgCover.set("listed", "0");
svgCover.set("cover", new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "cover.svg", { type: "image/svg+xml" }));
const rejectedCover = await creator.sendForm("/api/product", svgCover);
if (rejectedCover.status !== 400 || rejectedCover.data.code !== "err.cover.type") {
  throw new Error(`svg cover ${rejectedCover.status} ${rejectedCover.raw}`);
}
const relistForm = new FormData();
relistForm.set("productId", blankWork.id);
relistForm.set("title", "改过的名字");
relistForm.set("description", "");
relistForm.set("price", "18.5");
relistForm.set("kind", "小说");
relistForm.set("tags", "短篇");
relistForm.set("play", "1");
relistForm.set("download", "1");
relistForm.set("listed", "1");
const relisted = await creator.sendForm("/api/product", relistForm);
const shown = relisted.data.products?.find((item: { id: string }) => item.id === blankWork.id);
if (relisted.status !== 200 || shown?.listed !== true) throw new Error(`relist ${relisted.status} ${relisted.raw}`);
const visible = await readerNow.send("/api/state", undefined, "GET");
if (!visible.data.products?.some((item: { id: string }) => item.id === blankWork.id)) throw new Error("relisted work is missing");
const buying = await readerNow.send("/api/cart", { productId: blankWork.id, op: "add" });
const paidWork = await settle(readerNow);
const ownsEdited = paidWork.data.user?.library?.some((item: { productId: string }) => item.productId === blankWork.id);
if (buying.status !== 200 || paidWork.status !== 200 || !ownsEdited) throw new Error(`buy edited work ${buying.status} ${paidWork.status} ${paidWork.raw}`);
const hideOwned = new FormData();
hideOwned.set("productId", blankWork.id);
hideOwned.set("title", "改过的名字");
hideOwned.set("description", "");
hideOwned.set("price", "18.5");
hideOwned.set("kind", "小说");
hideOwned.set("play", "1");
hideOwned.set("download", "1");
hideOwned.set("listed", "0");
const hiddenAgain = await creator.sendForm("/api/product", hideOwned);
if (hiddenAgain.status !== 200) throw new Error(`unlist owned ${hiddenAgain.status} ${hiddenAgain.raw}`);
const ownerStill = await readerNow.send("/api/state", undefined, "GET");
const kept = ownerStill.data.products?.find((item: { id: string }) => item.id === blankWork.id);
if (!kept || kept.listed !== false) throw new Error(`buyer lost an unlisted work ${ownerStill.raw}`);
const ownerPlay = await readerNow.send(`/api/play?productId=${blankWork.id}`, undefined, "GET");
if (ownerPlay.status !== 200 || ownerPlay.data.preview !== false || !String(ownerPlay.data.novel).includes("完整正文")) {
  throw new Error(`buyer play after unlist ${ownerPlay.status} ${ownerPlay.raw}`);
}
const outsider = await client().send("/api/state", undefined, "GET");
if (outsider.data.products?.some((item: { id: string }) => item.id === blankWork.id)) {
  throw new Error("guest can see an unlisted work");
}

const cardWork = await creator.send("/api/products", {
  title: "银行卡",
  description: "支付测试",
  price: 4,
  kind: "文本",
  includes: ["短文"],
  fileBody: "支付之后才能看到的正文。",
});
const cardId = cardWork.data.products?.find((item: { title: string }) => item.title === "银行卡")?.id as string;
if (cardWork.status !== 200 || !cardId) throw new Error(`card work ${cardWork.status} ${cardWork.raw}`);
const queuedCard = await readerNow.send("/api/cart", { productId: cardId, op: "add" });
const beforeCoinPay = await readerNow.send("/api/state", undefined, "GET");
const balanceBefore = Number(beforeCoinPay.data.user?.coins ?? 0);
const startedPay = await readerNow.send("/api/checkout", { pay: "coins", idempotencyKey: `card-pay-${cardId}` });
const afterCoinPay = await readerNow.send("/api/state", undefined, "GET");
const balanceAfter = Number(afterCoinPay.data.user?.coins ?? 0);
if (
  queuedCard.status !== 200 ||
  startedPay.status !== 200 ||
  !afterCoinPay.data.user?.library?.some((item: { productId: string }) => item.productId === cardId) ||
  !(balanceAfter < balanceBefore) ||
  !sql.get("SELECT id FROM coin_transactions WHERE idempotency_key = ?", `card-pay-${cardId}`)
) throw new Error(`coin purchase ${startedPay.status} ${startedPay.raw}`);
const repeatPay = await readerNow.send("/api/checkout", { productId: cardId, pay: "coins", idempotencyKey: `card-pay-${cardId}` });
const afterRepeat = await readerNow.send("/api/state", undefined, "GET");
if (repeatPay.status !== 200 || Number(afterRepeat.data.user?.coins ?? 0) !== balanceAfter) {
  throw new Error(`duplicate coin charge ${repeatPay.status} ${repeatPay.raw}`);
}
const cashBlocked = await readerNow.send("/api/checkout", { productId: cardId });
if (cashBlocked.status !== 400 || cashBlocked.data.code !== "err.pay.coinsOnly") {
  throw new Error(`cash checkout not blocked ${cashBlocked.status} ${cashBlocked.raw}`);
}
const bareWork = await creator.send("/api/products", {
  title: "未配置",
  description: "没有支付",
  price: 4,
  kind: "文本",
  includes: ["短文"],
  fileBody: "没有配置支付时不会入库。",
});
const bareId = bareWork.data.products?.find((item: { title: string }) => item.title === "未配置")?.id as string;
const bareCart = await readerNow.send("/api/cart", { productId: bareId, op: "add" });
const savedKey = env.STRIPE_SECRET_KEY;
delete env.STRIPE_SECRET_KEY;
const blockedPay = await readerNow.send("/api/checkout", { pay: "coins", productId: bareId, idempotencyKey: `no-stripe-${bareId}` });
env.STRIPE_SECRET_KEY = savedKey;
if (bareCart.status !== 200 || blockedPay.status !== 200 || !blockedPay.data.user?.library?.some((item: { productId: string }) => item.productId === bareId)) {
  throw new Error(`coin checkout incorrectly depends on Stripe ${blockedPay.status} ${blockedPay.raw}`);
}
const coinWork = await creator.send("/api/products", {
  title: "虚拟币",
  description: "硬币支付",
  price: 4,
  priceCurrency: "usd",
  kind: "文本",
  includes: ["短文"],
  fileBody: "硬币确认后才能看到的正文。",
});
const coinId = coinWork.data.products?.find((item: { title: string }) => item.title === "虚拟币")?.id as string;
const coinBalanceBefore = Number((await readerNow.send("/api/state", undefined, "GET")).data.user?.coins ?? 0);
const coinPaid = await readerNow.send("/api/checkout", { pay: "coins", productId: coinId, idempotencyKey: `usd-work-${coinId}` });
const coinOrder = sql.get("SELECT amount, fee, currency, fiat_amount, fiat_currency, coin_amount FROM orders WHERE target_id = ? AND user_id = (SELECT id FROM users WHERE email = 'fan@example.com')", coinId);
const coinBalanceAfter = Number((await readerNow.send("/api/state", undefined, "GET")).data.user?.coins ?? 0);
if (
  coinWork.status !== 200 ||
  !coinId ||
  coinPaid.status !== 200 ||
  !coinPaid.data.user?.library?.some((item: { productId: string }) => item.productId === coinId) ||
  Number(coinOrder?.fiat_amount) !== 4 ||
  coinOrder?.fiat_currency !== "usd" ||
  Number(coinOrder?.coin_amount) !== 4 ||
  coinOrder?.currency !== "cny" ||
  !(coinBalanceAfter < coinBalanceBefore)
) throw new Error(`USD coin purchase ${coinPaid.status} ${coinPaid.raw} ${JSON.stringify(coinOrder)}`);
const supportBalanceBefore = Number((await readerNow.send("/api/state", undefined, "GET")).data.user?.coins ?? 0);
const support = await readerNow.send("/api/support", { creatorId: "ashi", amount: 2, currency: "usd", idempotencyKey: "support-ashi-2-usd" });
const supportBalanceAfter = Number((await readerNow.send("/api/state", undefined, "GET")).data.user?.coins ?? 0);
if (support.status !== 200 || !(supportBalanceAfter < supportBalanceBefore) || !sql.get("SELECT id FROM coin_transactions WHERE idempotency_key = ?", "support-ashi-2-usd")) {
  throw new Error(`creator support ${support.status} ${support.raw}`);
}

const scratch = await creator.send("/api/products", {
  title: "可删除",
  description: "还没有人买",
  price: 4,
  kind: "文本",
  includes: ["短文"],
  fileBody: "删除前就能读到的正文。",
});
const scratchId = scratch.data.products?.find((item: { title: string }) => item.title === "可删除")?.id as string;
const deniedDelete = await readerNow.send("/api/product/delete", { productId: scratchId });
const erased = await creator.send("/api/product/delete", { productId: scratchId });
const afterErase = await creator.send("/api/state", undefined, "GET");
if (
  scratch.status !== 200 ||
  !scratchId ||
  deniedDelete.status !== 400 ||
  deniedDelete.data.code !== "err.studio" ||
  erased.status !== 200 ||
  erased.data.code !== "toast.workDeleted" ||
  afterErase.data.products?.some((item: { id: string }) => item.id === scratchId)
) {
  throw new Error(`delete unsold ${deniedDelete.status} ${erased.status} ${erased.raw}`);
}
const droppedSale = await creator.send("/api/product/delete", { productId: cardId });
const buyerKeeps = await readerNow.send("/api/state", undefined, "GET");
const keptWork = buyerKeeps.data.products?.find((item: { id: string }) => item.id === cardId);
const creatorLost = await creator.send("/api/state", undefined, "GET");
const guestLost = await client().send("/api/state", undefined, "GET");
const editRemoved = new FormData();
editRemoved.set("productId", cardId);
editRemoved.set("title", "不能再改");
editRemoved.set("description", "");
editRemoved.set("price", "4");
editRemoved.set("kind", "文本");
editRemoved.set("play", "0");
editRemoved.set("download", "1");
editRemoved.set("listed", "1");
const refusedEdit = await creator.sendForm("/api/product", editRemoved);
if (
  droppedSale.status !== 200 ||
  !buyerKeeps.data.user?.library?.some((item: { productId: string }) => item.productId === cardId) ||
  !keptWork ||
  creatorLost.data.products?.some((item: { id: string }) => item.id === cardId) ||
  guestLost.data.products?.some((item: { id: string }) => item.id === cardId) ||
  refusedEdit.status !== 404
) {
  throw new Error(`delete sold ${droppedSale.status} ${refusedEdit.status} ${refusedEdit.raw}`);
}
const buyerFile = await readerNow.send(`/api/download?productId=${cardId}`, undefined, "GET");
if (buyerFile.status !== 200 || !buyerFile.raw.includes("支付之后")) throw new Error(`buyer lost a deleted work ${buyerFile.status} ${buyerFile.raw}`);

const hookWork = await creator.send("/api/products", {
  title: "拒绝现金",
  description: "只能硬币支付",
  price: 4,
  kind: "文本",
  includes: ["短文"],
  fileBody: "现金流程不应解锁这份内容。",
});
const hookId = hookWork.data.products?.find((item: { title: string }) => item.title === "拒绝现金")?.id as string;
const hookCart = await readerNow.send("/api/cart", { productId: hookId, op: "add" });
const legacyCash = await readerNow.send("/api/checkout", { productId: hookId });
const legacyComplete = await readerNow.send("/api/checkout/complete", { sessionId: "cs_legacy_cash" });
if (hookWork.status !== 200 || hookCart.status !== 200 || legacyCash.data.code !== "err.pay.coinsOnly" || legacyComplete.data.code !== "err.pay.coinsOnly") {
  throw new Error(`legacy cash bypass ${legacyCash.status} ${legacyCash.raw} ${legacyComplete.raw}`);
}
const directWork = await creator.send("/api/products", {
  title: "卡片直购",
  description: "不经过购物袋",
  price: 9,
  kind: "文本",
  includes: ["直购.txt"],
  fileBody: "卡片上买下的句子。",
});
const directId = directWork.data.products?.find((item: { title: string }) => item.title === "卡片直购")?.id as string;
const selfBuy = await creator.send("/api/checkout", { productId: directId });
const directPaid = await settle(readerNow, { productId: directId });
const directLibrary = directPaid.data.user?.library?.some((item: { productId: string }) => item.productId === directId);
if (directWork.status !== 200 || !directId || selfBuy.status !== 400 || selfBuy.data.code !== "err.product.self" || directPaid.status !== 200 || !directLibrary) {
  throw new Error(`direct buy ${directWork.status} ${selfBuy.status} ${selfBuy.raw} ${directPaid.status} ${directPaid.raw}`);
}

const bare = client();
const bareCode = await ticket("bare@example.com");
const noHandle = await bare.send("/api/register", {
  name: "无名",
  email: "bare@example.com",
  password: "secret12",
  isCreator: true,
  ...bareCode,
});
if (noHandle.status !== 400 || noHandle.data.code !== "err.handle") throw new Error(`creator without handle ${noHandle.status} ${noHandle.raw}`);
const sneak = client();
const sneakCode = await ticket("sneak@example.com");
const sneaky = await sneak.send("/api/register", {
  name: "偷偷",
  email: "sneak@example.com",
  password: "secret12",
  handle: "sneaky",
  isCreator: false,
  ...sneakCode,
});
const sneakHandle = String(sneaky.data.user?.handle ?? "");
if (sneaky.status !== 200 || sneakHandle === "sneaky" || !/^u[a-f0-9]{12}$/.test(sneakHandle) || sneaky.data.creators?.some((item: { handle: string }) => item.handle === "sneaky")) {
  throw new Error(`ignored handle ${sneaky.status} ${sneaky.raw}`);
}

const readerPayout = await readerNow.send("/api/payout/method", { country: "JP", holder: "ヤマダ", accountNumber: "0001234", bankCode: "1100", branchCode: "000" });
const badCountry = await creator.send("/api/payout/method", { country: "CN", holder: "无名", accountNumber: "00012345" });
const badBank = await creator.send("/api/payout/method", { country: "GB", holder: "A", accountNumber: "12", routing: "108800" });
const saved = await creator.send("/api/payout/method", { country: "GB", holder: "Ada Lovelace", accountNumber: "00012345", routing: "10-88-00" });
const deskPending = await creator.send("/api/desk", undefined, "GET");
const changedBank = await creator.send("/api/payout/method", { country: "GB", holder: "Ada Lovelace", accountNumber: "00099999", routing: "108800" });
const wednesday = await creator.send("/api/payout/run", { now: "2026-10-14T00:00:00.000Z" }, "POST", { "x-fanstar-task": "test-secret" });
const fridayEarly = await creator.send("/api/payout/run", { now: "2026-10-16T00:00:00.000Z" }, "POST", { "x-fanstar-task": "test-secret" });
const beforeReady = transfers.length;
connectReady = true;
const deskReady = await creator.send("/api/desk", undefined, "GET");
const fridayHour = await creator.send("/api/payout/run", { now: "2026-10-16T01:00:00.000Z" }, "POST", { "x-fanstar-task": "test-secret" });
const openRun = await creator.send("/api/payout/run", { now: "2026-10-16T00:00:00.000Z" });
const friday = await creator.send("/api/payout/run", { now: "2026-10-16T00:00:00.000Z" }, "POST", { "x-fanstar-task": "test-secret" });
const fridayAgain = await creator.send("/api/payout/run", { now: "2026-10-16T00:00:00.000Z" }, "POST", { "x-fanstar-task": "test-secret" });
const deskAfter = await creator.send("/api/desk", undefined, "GET");
const nextPayout = new Date(String(deskReady.data.nextPayout ?? ""));
if (
  readerPayout.status !== 400 ||
  readerPayout.data.code !== "err.studio" ||
  badCountry.status !== 400 ||
  badCountry.data.code !== "err.payout.country" ||
  badBank.status !== 400 ||
  badBank.data.code !== "err.payout.bank" ||
  saved.status !== 200 ||
  saved.data.method !== "TEST BANK ····2345" ||
  saved.raw.includes("00012345") ||
  deskPending.data.payoutReady !== false ||
  deskPending.data.payoutMethod !== "TEST BANK ····2345" ||
  deskPending.data.payoutStarted !== true ||
  changedBank.status !== 200 ||
  changedBank.data.method !== "TEST BANK ····9999" ||
  !(deskPending.data.pending > 0) ||
  wednesday.data.transferred !== 0 ||
  fridayEarly.data.transferred !== 0 ||
  beforeReady !== 0 ||
  deskReady.data.payoutReady !== true ||
  deskReady.data.payoutMethod !== "TEST BANK ····9999" ||
  fridayHour.data.transferred !== 0 ||
  openRun.status !== 404 ||
  friday.status !== 200 ||
  friday.data.transferred !== 1 ||
  transfers.length !== 1 ||
  transfers[0]?.destination !== "acct_creator_test" ||
  transfers[0]?.currency !== "cny" ||
  transfers[0]?.key !== "payout-ashi-cny-2026-10-16" ||
  !(transfers[0]?.amount > 0) ||
  fridayAgain.data.transferred !== 0 ||
  transfers.length !== 1 ||
  deskAfter.data.pending !== 0 ||
  nextPayout.getUTCDay() !== 5 ||
  nextPayout.getUTCHours() !== 0
) {
  throw new Error(`payout ${readerPayout.raw} ${badCountry.raw} ${badBank.raw} ${saved.raw} ${changedBank.raw} ${JSON.stringify(deskPending.data)} ${JSON.stringify(friday.data)} ${JSON.stringify(transfers)} ${deskAfter.raw}`);
}

console.log("platform checks passed");
