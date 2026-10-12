export type MailEnv = {
  RESEND_API_KEY?: string;
  CODE_SECRET?: string;
};

export type Limiter = {
  allowed(key: string, limit: number, windowSec: number): Promise<boolean>;
  record(key: string, windowSec: number): Promise<void>;
};

const FROM = "星页 <noreply@fanstar.dev>";
const TTL_MS = 10 * 60 * 1000;

type Deliver = (
  apiKey: string,
  email: string,
  code: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function memoryLimiter(): Limiter {
  const hits = new Map<string, number[]>();
  const recent = (key: string, windowSec: number) => {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const kept = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    hits.set(key, kept);
    return kept;
  };
  return {
    async allowed(key, limit, windowSec) {
      return recent(key, windowSec).length < limit;
    },
    async record(key, windowSec) {
      const kept = recent(key, windowSec);
      kept.push(Date.now());
      hits.set(key, kept);
    },
  };
}

export function cacheLimiter(): Limiter {
  const requestFor = (key: string) => new Request(`https://fanstar.dev/__rl/${encodeURIComponent(key)}`);
  const read = async (key: string) => {
    const hit = await caches.default.match(requestFor(key));
    if (!hit) return 0;
    const count = Number(await hit.text());
    return Number.isFinite(count) ? count : 0;
  };
  return {
    async allowed(key, limit) {
      try {
        return (await read(key)) < limit;
      } catch {
        return true;
      }
    },
    async record(key, windowSec) {
      try {
        const count = (await read(key)) + 1;
        await caches.default.put(
          requestFor(key),
          new Response(String(count), { headers: { "cache-control": `max-age=${windowSec}` } }),
        );
      } catch {
        /* A cache miss should not block a legitimate code. */
      }
    },
  };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function sixDigits() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

async function signingKey(env: MailEnv): Promise<string | null> {
  if (env.CODE_SECRET) return env.CODE_SECRET;
  if (!env.RESEND_API_KEY) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`xingye-code:${env.RESEND_API_KEY}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function payload(email: string, expiresAt: number, code: string) {
  return `${email}|${expiresAt}|${code}`;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    if (data && typeof data === "object") return data as Record<string, unknown>;
  } catch {
    /* Invalid JSON is treated as an empty body. */
  }
  return {};
}

const deliverMail: Deliver = async (apiKey, email, code) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: "星页注册验证码",
      text: `你的星页注册验证码是 ${code}，10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。`,
      html: `<div style="font-family:sans-serif;line-height:1.6;color:#111318"><p>你好，正在注册星页。</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p>验证码 10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。</p></div>`,
    }),
  });
  if (res.ok) return { ok: true };
  console.error("resend send failed", res.status);
  return { ok: false, error: "验证码邮件没有发出，请稍后再试" };
};

export async function handleSend(
  request: Request,
  env: MailEnv,
  limiter: Limiter,
  deps: { deliver?: Deliver } = {},
): Promise<Response> {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "请填写有效邮箱" }, 400);

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`send:ip:${ip}`, 8, 600))) {
    return json({ error: "获取太频繁，请稍后再试" }, 429);
  }
  if (!(await limiter.allowed(`send:email:${email}`, 1, 60))) {
    return json({ error: "验证码刚刚发过，请 60 秒后再试" }, 429);
  }

  const secret = await signingKey(env);
  if (!secret || !env.RESEND_API_KEY) return json({ error: "邮件服务还没有配置" }, 503);

  const code = sixDigits();
  const expiresAt = Date.now() + TTL_MS;
  const sent = await (deps.deliver ?? deliverMail)(env.RESEND_API_KEY, email, code);
  if (!sent.ok) return json({ error: sent.error }, 502);

  await limiter.record(`send:ip:${ip}`, 600);
  await limiter.record(`send:email:${email}`, 60);
  const token = await sign(secret, payload(email, expiresAt, code));
  return json({ ok: true, expiresAt, token });
}

export async function handleVerify(request: Request, env: MailEnv, limiter: Limiter): Promise<Response> {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const token = typeof body.token === "string" ? body.token : "";
  const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : Number(body.expiresAt);
  if (!email || !/^\d{6}$/.test(code) || !/^[0-9a-f]{64}$/.test(token) || !Number.isFinite(expiresAt)) {
    return json({ error: "请输入 6 位验证码" }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`verify:ip:${ip}`, 20, 600)) || !(await limiter.allowed(`verify:${token}`, 5, 600))) {
    return json({ error: "验证次数过多，请重新获取验证码" }, 429);
  }
  await limiter.record(`verify:ip:${ip}`, 600);
  await limiter.record(`verify:${token}`, 600);

  if (Date.now() > expiresAt) return json({ error: "验证码已过期，请重新获取" }, 400);
  const secret = await signingKey(env);
  if (!secret) return json({ error: "邮件服务还没有配置" }, 503);
  const expected = await sign(secret, payload(email, expiresAt, code));
  if (!safeEqual(expected, token)) return json({ error: "验证码不正确" }, 400);
  return json({ ok: true });
}
