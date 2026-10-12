export type MailEnv = {
  RESEND_API_KEY?: string;
  CODE_SECRET?: string;
};

export type Limiter = {
  allowed(key: string, limit: number, windowSec: number): Promise<boolean>;
  record(key: string, windowSec: number): Promise<void>;
};

const FROM = "fanstar <noreply@fanstar.dev>";
const TTL_MS = 10 * 60 * 1000;

type MailLang = "zh" | "zh-Hant" | "ja" | "en";

type Deliver = (
  apiKey: string,
  email: string,
  code: string,
  lang: MailLang,
) => Promise<{ ok: true } | { ok: false; error: string }>;

function mailLang(value: unknown): MailLang {
  if (value === "ja" || value === "en" || value === "zh-Hant" || value === "zh") return value;
  return "zh";
}

function mailHtml(lead: string, code: string, note: string) {
  return `<div style="font-family:sans-serif;line-height:1.6;color:#111318"><p>${lead}</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p>${note}</p></div>`;
}

const MAIL: Record<MailLang, { subject: string; text: (code: string) => string; html: (code: string) => string }> = {
  zh: {
    subject: "fanstar 注册验证码",
    text: (code) => `你的 fanstar 注册验证码是 ${code}，10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。`,
    html: (code) => mailHtml("你好，正在注册 fanstar。", code, "验证码 10 分钟内有效。如果不是你本人操作，忽略这封邮件即可。"),
  },
  "zh-Hant": {
    subject: "fanstar 註冊驗證碼",
    text: (code) => `你的 fanstar 註冊驗證碼是 ${code}，10 分鐘內有效。如果不是你本人操作，忽略這封郵件即可。`,
    html: (code) => mailHtml("你好，正在註冊 fanstar。", code, "驗證碼 10 分鐘內有效。如果不是你本人操作，忽略這封郵件即可。"),
  },
  ja: {
    subject: "fanstarの登録確認コード",
    text: (code) => `fanstarの登録確認コードは ${code} です。10分以内に入力してください。身に覚えがない場合は、このメールを無視してください。`,
    html: (code) => mailHtml("fanstarの登録を進めています。", code, "コードは10分間有効です。身に覚えがない場合は、このメールを無視してください。"),
  },
  en: {
    subject: "Your fanstar verification code",
    text: (code) => `Your fanstar verification code is ${code}. It expires in 10 minutes. If you didn't try to register, you can ignore this email.`,
    html: (code) => mailHtml("You're signing up for fanstar.", code, "The code expires in 10 minutes. If you didn't try to register, you can ignore this email."),
  },
};

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

const deliverMail: Deliver = async (apiKey, email, code, lang) => {
  const copy = MAIL[lang];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: copy.subject,
      text: copy.text(code),
      html: copy.html(code),
    }),
  });
  if (res.ok) return { ok: true };
  console.error("resend send failed", res.status);
  return { ok: false, error: "err.mail.send" };
};

export async function handleSend(
  request: Request,
  env: MailEnv,
  limiter: Limiter,
  deps: { deliver?: Deliver } = {},
): Promise<Response> {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!email) return json({ code: "err.email" }, 400);

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`send:ip:${ip}`, 8, 600))) {
    return json({ code: "err.send.limit" }, 429);
  }
  if (!(await limiter.allowed(`send:email:${email}`, 1, 60))) {
    return json({ code: "err.send.cooldown" }, 429);
  }

  const secret = await signingKey(env);
  if (!secret || !env.RESEND_API_KEY) return json({ code: "err.mail.unconfigured" }, 503);

  const code = sixDigits();
  const expiresAt = Date.now() + TTL_MS;
  const sent = await (deps.deliver ?? deliverMail)(env.RESEND_API_KEY, email, code, mailLang(body.lang));
  if (!sent.ok) return json({ code: sent.error }, 502);

  await limiter.record(`send:ip:${ip}`, 600);
  await limiter.record(`send:email:${email}`, 60);
  const token = await sign(secret, payload(email, expiresAt, code));
  return json({ ok: true, expiresAt, token });
}

export async function matchCode(env: MailEnv, email: string, code: string, token: string, expiresAt: number) {
  if (!email || !/^\d{6}$/.test(code) || !/^[0-9a-f]{64}$/.test(token) || !Number.isFinite(expiresAt)) {
    return "err.code.digits";
  }
  if (Date.now() > expiresAt) return "err.code.expired";
  const secret = await signingKey(env);
  if (!secret) return "err.mail.unconfigured";
  const expected = await sign(secret, payload(email, expiresAt, code));
  if (!safeEqual(expected, token)) return "err.code.wrong";
  return null;
}

export async function handleVerify(request: Request, env: MailEnv, limiter: Limiter): Promise<Response> {
  const body = await readJson(request);
  const email = normalizeEmail(body.email) ?? "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const token = typeof body.token === "string" ? body.token : "";
  const expiresAt = typeof body.expiresAt === "number" ? body.expiresAt : Number(body.expiresAt);
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await limiter.allowed(`verify:ip:${ip}`, 20, 600)) || !(await limiter.allowed(`verify:${token}`, 5, 600))) {
    return json({ code: "err.code.limit" }, 429);
  }
  await limiter.record(`verify:ip:${ip}`, 600);
  await limiter.record(`verify:${token}`, 600);
  const error = await matchCode(env, email, code, token, expiresAt);
  if (error) return json({ code: error }, error === "err.mail.unconfigured" ? 503 : 400);
  return json({ ok: true });
}
