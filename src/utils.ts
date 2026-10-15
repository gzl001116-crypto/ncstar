export const PLATFORM_FEE = 0.08;

export function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function yuan(amount: number) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `¥${amount.toFixed(digits)}`;
}

export function fiat(amount: number, currency = "cny", locale?: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export function coinText(amount?: number) {
  return typeof amount === "number" && Number.isFinite(amount) ? `🪙 ${amount.toFixed(2)}` : "🪙 —";
}

export function creatorShare(amount: number) {
  return Math.round(amount * (1 - PLATFORM_FEE) * 100) / 100;
}

export function utcStamp(date: Date) {
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${part(date.getUTCMonth() + 1)}-${part(date.getUTCDate())} ${part(date.getUTCHours())}:${part(date.getUTCMinutes())}:${part(date.getUTCSeconds())}`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

export function fromNow(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return formatDate(iso);
}

export function addDays(days: number, from = new Date()) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function includesQuery(haystack: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function visibilityLabel(rank: number) {
  if (rank <= 0) return "公开";
  if (rank === 1) return "会员";
  return "更高档位";
}

export async function saveDownload(response: Response, fallback: string) {
  const blob = await response.blob();
  const header = response.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  const plain = /filename="([^"]+)"/i.exec(header);
  const name = star ? decodeURIComponent(star[1]) : plain?.[1] || fallback;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content.endsWith("\n") ? content : `${content}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const base = filename.replace(/[\\/:*?"<>|]+/g, "_");
  link.download = base.endsWith(".txt") ? base : `${base}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
