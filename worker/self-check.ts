import { handleSend, handleVerify, memoryLimiter, type MailEnv } from "./codes.ts";

const env: MailEnv = { RESEND_API_KEY: "test-key", CODE_SECRET: "test-secret" };
const limiter = memoryLimiter();
let sent = "";

const send = await handleSend(
  new Request("http://local/api/send-code", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" },
    body: JSON.stringify({ email: "Fan@Example.com " }),
  }),
  env,
  limiter,
  {
    deliver: async (_apiKey, email, code) => {
      if (email !== "fan@example.com") throw new Error(`unexpected email ${email}`);
      sent = code;
      return { ok: true };
    },
  },
);
const ticket = (await send.json()) as { token: string; expiresAt: number };
if (!send.ok || !/^\d{6}$/.test(sent) || ticket.token.length !== 64) {
  throw new Error(`send failed ${send.status} ${sent}`);
}

const wrong = await handleVerify(
  new Request("http://local/api/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" },
    body: JSON.stringify({ email: "fan@example.com", code: "000000", token: ticket.token, expiresAt: ticket.expiresAt }),
  }),
  env,
  limiter,
);
if (wrong.status !== 400) throw new Error(`wrong code should be 400, got ${wrong.status}`);

const ok = await handleVerify(
  new Request("http://local/api/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify({ email: "fan@example.com", code: sent, token: ticket.token, expiresAt: ticket.expiresAt }),
  }),
  env,
  limiter,
);
if (!ok.ok) throw new Error(`correct code rejected ${ok.status}`);

const again = await handleSend(
  new Request("http://local/api/send-code", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" },
    body: JSON.stringify({ email: "fan@example.com" }),
  }),
  env,
  limiter,
  { deliver: async () => ({ ok: true }) },
);
if (again.status !== 429) throw new Error(`cooldown should be 429, got ${again.status}`);

const missing = await handleSend(
  new Request("http://local/api/send-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "other@example.com" }),
  }),
  {},
  memoryLimiter(),
);
if (missing.status !== 503) throw new Error(`missing key should be 503, got ${missing.status}`);

const dashboardName = await handleSend(
  new Request("http://local/api/send-code", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.11" },
    body: JSON.stringify({ email: "dash@example.com" }),
  }),
  { resend: "dashboard-key" },
  memoryLimiter(),
  {
    deliver: async (apiKey) => {
      if (apiKey !== "dashboard-key") throw new Error("dashboard binding was not used");
      return { ok: true };
    },
  },
);
if (!dashboardName.ok) throw new Error(`resend binding should send, got ${dashboardName.status}`);

console.log("verification checks passed");
