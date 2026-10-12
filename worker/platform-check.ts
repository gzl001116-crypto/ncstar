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
const stripeSessions = new Map<string, { amount: number; paymentId: string; userId: string }>();
let stripePaid = true;
let stripeAmount: number | null = null;

async function stripeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (init?.method === "POST") {
    const params = new URLSearchParams(String(init.body ?? ""));
    if (url.includes("/v1/checkout/sessions") && params.get("payment_method_options[wechat_pay][client]") !== "web") {
      throw new Error("wechat client missing");
    }
    let amount = 0;
    for (const [key, value] of params) {
      if (key.endsWith("[price_data][unit_amount]")) amount += Number(value);
    }
    const id = `cs_test_${stripeSessions.size + 1}`;
    stripeSessions.set(id, {
      amount,
      paymentId: params.get("metadata[paymentId]") ?? "",
      userId: params.get("metadata[userId]") ?? "",
    });
    return Response.json({ id, url: `https://checkout.stripe.test/${id}`, payment_status: "unpaid", status: "open", amount_total: amount, currency: "cny", metadata: {} });
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
    currency: "cny",
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
if (fanUser.status !== 200) throw new Error(`fan register failed ${fanUser.raw}`);
const locked = fanUser.data.posts.find((item: { id: string }) => item.id === postId);
if (locked.body) throw new Error("member post leaked before purchase");

const added = await fan.send("/api/cart", { productId, op: "add" });
if (added.status !== 200 || !added.data.user.cart.includes(productId)) throw new Error("cart failed");
async function settle(sender: { send: (path: string, body?: unknown) => Promise<{ status: number; data: any; raw: string }> }, body?: unknown) {
  const started = await sender.send("/api/checkout", body ?? {});
  if (started.status !== 200 || started.data.user) return started;
  return sender.send("/api/checkout/complete", { sessionId: started.data.sessionId });
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
const applied = await gone.send("/api/studio", { category: "摄影", location: "京都", bio: "我想发布摄影作品和短文。" });
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
if (reset.status !== 200 || reset.data.user?.handle !== "reader") throw new Error(`reset password ${reset.status} ${reset.raw}`);
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
stripePaid = false;
const startedPay = await readerNow.send("/api/checkout", {});
if (queuedCard.status !== 200 || startedPay.status !== 200 || !startedPay.data.url || startedPay.data.user) {
  throw new Error(`stripe start ${startedPay.status} ${startedPay.raw}`);
}
const beforePay = await readerNow.send("/api/state", undefined, "GET");
if (beforePay.data.user?.library?.some((item: { productId: string }) => item.productId === cardId)) {
  throw new Error("library opened before payment");
}
const reusedPay = await readerNow.send("/api/checkout", {});
if (reusedPay.data.sessionId !== startedPay.data.sessionId) throw new Error(`session was not reused ${reusedPay.raw}`);
const pendingPay = await readerNow.send("/api/checkout/complete", { sessionId: startedPay.data.sessionId });
if (pendingPay.status !== 400 || pendingPay.data.code !== "err.pay.pending") throw new Error(`unpaid ${pendingPay.status} ${pendingPay.raw}`);
stripePaid = true;
stripeAmount = 1;
const wrongAmount = await readerNow.send("/api/checkout/complete", { sessionId: startedPay.data.sessionId });
if (wrongAmount.status !== 400 || wrongAmount.data.code !== "err.pay.amount") throw new Error(`amount ${wrongAmount.status} ${wrongAmount.raw}`);
stripeAmount = null;
const finishedPay = await readerNow.send("/api/checkout/complete", { sessionId: startedPay.data.sessionId });
if (finishedPay.status !== 200 || !finishedPay.data.user?.library?.some((item: { productId: string }) => item.productId === cardId)) {
  throw new Error(`paid ${finishedPay.status} ${finishedPay.raw}`);
}
const againPay = await readerNow.send("/api/checkout/complete", { sessionId: startedPay.data.sessionId });
if (againPay.status !== 200 || againPay.data.code !== "toast.library") throw new Error(`repeat pay ${againPay.status} ${againPay.raw}`);
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
const blockedPay = await readerNow.send("/api/checkout", {});
env.STRIPE_SECRET_KEY = savedKey;
if (bareCart.status !== 200 || blockedPay.status !== 400 || blockedPay.data.code !== "err.pay.unconfigured") {
  throw new Error(`unconfigured pay ${blockedPay.status} ${blockedPay.raw}`);
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
  title: "回调收款",
  description: "支付回调",
  price: 4,
  kind: "文本",
  includes: ["短文"],
  fileBody: "回调确认后才能看到。",
});
const hookId = hookWork.data.products?.find((item: { title: string }) => item.title === "回调收款")?.id as string;
const hookCart = await readerNow.send("/api/cart", { productId: hookId, op: "add" });
stripePaid = false;
const hookStart = await readerNow.send("/api/checkout", {});
const hookPayload = JSON.stringify({
  type: "checkout.session.completed",
  data: { object: { id: hookStart.data.sessionId } },
});
async function signHook(payload: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("whsec_platform_check"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}
async function postHook(payload: string, signature: string) {
  const response = await handleApp(
    new Request("http://127.0.0.1/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    }),
    sql,
    env,
    limiter,
    stripeFetch,
  );
  const raw = await response.text();
  return { status: response.status, data: JSON.parse(raw) as { code?: string; received?: boolean }, raw };
}
const hookBad = await postHook(hookPayload, "t=1,v1=dead");
const hookEarly = await postHook(hookPayload, await signHook(hookPayload));
const earlyLibrary = await readerNow.send("/api/state", undefined, "GET");
stripePaid = true;
const hookDone = await postHook(hookPayload, await signHook(hookPayload));
const hookLibrary = await readerNow.send("/api/state", undefined, "GET");
const hookDesk = await creator.send("/api/desk", undefined, "GET");
if (
  hookWork.status !== 200 ||
  !hookId ||
  hookCart.status !== 200 ||
  hookStart.status !== 200 ||
  hookBad.status !== 400 ||
  hookEarly.status !== 200 ||
  hookEarly.data.received !== true ||
  earlyLibrary.data.user?.library?.some((item: { productId: string }) => item.productId === hookId) ||
  hookDone.status !== 200 ||
  !hookLibrary.data.user?.library?.some((item: { productId: string }) => item.productId === hookId) ||
  !hookDesk.data.orders?.some((order: { targetId: string; amount: number }) => order.targetId === hookId && order.amount === 4)
) {
  throw new Error(`webhook pay ${hookBad.status} ${hookEarly.status} ${hookDone.status} ${hookDone.raw} ${hookDesk.raw}`);
}

console.log("platform checks passed");
