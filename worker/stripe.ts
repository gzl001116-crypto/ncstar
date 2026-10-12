import type { MailEnv } from "./codes.ts";

export type PayEnv = MailEnv & {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
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

function encodeSuccess(origin: string) {
  return encodeURIComponent(`${origin}/checkout?session_id=`) + "{CHECKOUT_SESSION_ID}";
}

export function sessionFields(input: {
  origin: string;
  paymentId: string;
  userId: string;
  email: string;
  locale: string;
  cancelPath: string;
  items: { name: string; amount: number }[];
}) {
  const fields: Record<string, string> = {
    mode: "payment",
    success_url: encodeSuccess(input.origin),
    cancel_url: `${input.origin}${input.cancelPath}`,
    customer_email: input.email,
    locale: input.locale,
    client_reference_id: input.paymentId,
    "metadata[paymentId]": input.paymentId,
    "metadata[userId]": input.userId,
    "payment_method_options[wechat_pay][client]": "web",
  };
  input.items.forEach((item, index) => {
    fields[`line_items[${index}][quantity]`] = "1";
    fields[`line_items[${index}][price_data][currency]`] = "cny";
    fields[`line_items[${index}][price_data][unit_amount]`] = String(Math.round(item.amount * 100));
    fields[`line_items[${index}][price_data][product_data][name]`] = item.name.slice(0, 120) || "fanstar";
  });
  return fields;
}

function bodyOf(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${key === "success_url" ? value : encodeURIComponent(value)}`)
    .join("&");
}

export async function stripeRequest(
  env: PayEnv,
  path: string,
  method: "GET" | "POST",
  fields: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; session: StripeSession } | { ok: false; code: string }> {
  if (!stripeKey(env)) return { ok: false, code: "err.pay.unconfigured" };
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripeKey(env)}`,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
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
