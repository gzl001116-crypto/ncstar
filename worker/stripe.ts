import type { MailEnv } from "./codes.ts";

export type PayEnv = MailEnv & {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  stripe?: string;
};

export type StripeSession = {
  id: string;
  url: string | null;
  payment_status: string;
  status: string;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
};

export function stripeKey(env: PayEnv) {
  return env.STRIPE_SECRET_KEY || env.stripe || "";
}

export function webhookSecret(env: PayEnv) {
  return env.STRIPE_WEBHOOK_SECRET || "";
}

export async function stripeSignature(secret: string, payload: string, timestamp: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signatureMatches(secret: string, payload: string, header: string) {
  const parts = new Map(header.split(",").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
  }));
  const timestamp = Number(parts.get("t"));
  const given = parts.get("v1") ?? "";
  if (!secret || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !given) return false;
  const expected = await stripeSignature(secret, payload, timestamp);
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ given.charCodeAt(index);
  return diff === 0;
}

function encodeSuccess(origin: string) {
  return encodeURIComponent(`${origin}/checkout?session_id=`) + "{CHECKOUT_SESSION_ID}";
}

export const USD_QUOTE_URL = "https://open.er-api.com/v6/latest/USD";
export const CRYPTO_MIN_MINOR = 50;
export const CRYPTO_MAX_MINOR = 1_000_000;

export async function quoteCnyPerUsd(fetchImpl: typeof fetch): Promise<{ ok: true; cnyPerUsd: number } | { ok: false }> {
  let response: Response;
  try {
    response = await fetchImpl(USD_QUOTE_URL);
  } catch {
    return { ok: false };
  }
  if (!response.ok) return { ok: false };
  const data = (await response.json().catch(() => null)) as { result?: string; rates?: { CNY?: number } } | null;
  const rate = Number(data?.rates?.CNY);
  if (data?.result !== "success" || !Number.isFinite(rate) || rate < 4 || rate > 12) return { ok: false };
  return { ok: true, cnyPerUsd: rate };
}

export function usdMinorUnits(cnyYuan: number, cnyPerUsd: number) {
  return Math.round((cnyYuan / cnyPerUsd) * 100);
}

export function splitUsdMinors(weights: number[], totalMinor: number) {
  const count = weights.length;
  if (count === 0 || totalMinor < count) return null;
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!(sum > 0)) return null;
  const minors = weights.map((weight) => Math.floor((weight / sum) * totalMinor));
  let left = totalMinor - minors.reduce((total, minor) => total + minor, 0);
  const order = weights.map((_, index) => index).sort((a, b) => weights[b] - weights[a] || a - b);
  for (const index of order) {
    if (left <= 0) break;
    minors[index] += 1;
    left -= 1;
  }
  for (const index of order) {
    if (minors[index] >= 1) continue;
    const donor = order.find((item) => minors[item] > 1);
    if (donor == null) return null;
    minors[donor] -= 1;
    minors[index] += 1;
  }
  if (left !== 0 || minors.some((minor) => minor < 1) || minors.reduce((total, minor) => total + minor, 0) !== totalMinor) return null;
  return minors;
}

export function sessionFields(input: {
  origin: string;
  paymentId: string;
  userId: string;
  email: string;
  locale: string;
  cancelPath: string;
  items: { name: string; amount: number }[];
  currency?: "cny" | "usd";
  minors?: number[];
}) {
  const currency = input.currency ?? "cny";
  const fields: Record<string, string> = {
    mode: "payment",
    success_url: encodeSuccess(input.origin),
    cancel_url: `${input.origin}${input.cancelPath}`,
    customer_email: input.email,
    locale: input.locale,
    client_reference_id: input.paymentId,
    "metadata[paymentId]": input.paymentId,
    "metadata[userId]": input.userId,
    "metadata[pay]": currency === "usd" ? "crypto" : "card",
  };
  if (currency === "cny") fields["payment_method_options[wechat_pay][client]"] = "web";
  input.items.forEach((item, index) => {
    const minor = currency === "usd" ? input.minors?.[index] ?? 0 : Math.round(item.amount * 100);
    fields[`line_items[${index}][quantity]`] = "1";
    fields[`line_items[${index}][price_data][currency]`] = currency;
    fields[`line_items[${index}][price_data][unit_amount]`] = String(minor);
    fields[`line_items[${index}][price_data][product_data][name]`] = item.name.slice(0, 120) || "fanstar";
  });
  return fields;
}

function payoutStripeCode(stripeCode: string) {
  if (stripeCode === "amount_too_small") return "err.pay.small";
  if (stripeCode === "non_connect_platform_accounts_v2_access_blocked" || stripeCode.includes("liability_unacknowledged") || stripeCode.includes("requirement_collection_unacknowledged")) {
    return "err.payout.platform";
  }
  if (stripeCode === "capability_not_available_without_other_capability") return "err.payout.capability";
  if (stripeCode.startsWith("capability_not_available")) return "err.payout.country";
  if (/account_number|routing_number|bank_account|sort_code|iban/i.test(stripeCode)) return "err.payout.bank";
  return "err.pay.stripe";
}

export async function stripeForm(
  env: PayEnv,
  path: string,
  fields: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  if (!stripeKey(env)) return { ok: false, code: "err.pay.unconfigured" };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey(env)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: bodyOf(fields),
    });
  } catch {
    return { ok: false, code: "err.pay.stripe" };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string } };
  if (!response.ok) return { ok: false, code: payoutStripeCode(data.error?.code ?? "") };
  return { ok: true, data };
}

function bodyOf(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${key === "success_url" ? value : encodeURIComponent(value)}`)
    .join("&");
}

export async function stripeSend(
  env: PayEnv,
  path: string,
  method: "GET" | "POST",
  jsonBody: Record<string, unknown> | undefined,
  fetchImpl: typeof fetch,
  headers: Record<string, string> = {},
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  if (!stripeKey(env)) return { ok: false, code: "err.pay.unconfigured" };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripeKey(env)}`,
        ...(jsonBody ? { "content-type": "application/json" } : {}),
        ...(path.startsWith("/v2/") ? { "Stripe-Version": "2026-09-30.preview" } : {}),
        ...headers,
      },
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
    });
  } catch {
    return { ok: false, code: "err.pay.stripe" };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string } };
  if (!response.ok) {
    const stripeCode = data.error?.code ?? "";
    return { ok: false, code: payoutStripeCode(stripeCode) };
  }
  return { ok: true, data };
}

export async function stripeGet(
  env: PayEnv,
  path: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string }> {
  if (!stripeKey(env)) return { ok: false, code: "err.pay.unconfigured" };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${stripeKey(env)}` },
    });
  } catch {
    return { ok: false, code: "err.pay.stripe" };
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string } };
  if (!response.ok) return { ok: false, code: data.error?.code === "amount_too_small" ? "err.pay.small" : "err.pay.stripe" };
  return { ok: true, data };
}

export async function stripeRequest(
  env: PayEnv,
  path: string,
  method: "GET" | "POST",
  fields: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; session: StripeSession } | { ok: false; code: string }> {
  if (method === "GET") {
    const loaded = await stripeGet(env, path, fetchImpl);
    if (!loaded.ok) return loaded;
    const session = loaded.data as StripeSession;
    if (!session.id) return { ok: false, code: "err.pay.stripe" };
    session.metadata = session.metadata ?? {};
    return { ok: true, session };
  }
  if (!stripeKey(env)) return { ok: false, code: "err.pay.unconfigured" };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripeKey(env)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: fields ? bodyOf(fields) : undefined,
    });
  } catch {
    return { ok: false, code: "err.pay.stripe" };
  }
  const data = (await response.json().catch(() => ({}))) as { error?: { code?: string }; id?: string };
  if (!response.ok) return { ok: false, code: data.error?.code === "amount_too_small" ? "err.pay.small" : "err.pay.stripe" };
  const session = data as StripeSession;
  if (!session.id) return { ok: false, code: "err.pay.stripe" };
  session.metadata = session.metadata ?? {};
  return { ok: true, session };
}
