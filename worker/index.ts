import { cacheLimiter, handleSend, handleVerify, json, type MailEnv } from "./codes";

export interface Env extends MailEnv {
  ASSETS: Fetcher;
}

const limiter = cacheLimiter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/send-code" || url.pathname === "/api/verify-code") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method !== "POST") return json({ error: "请使用 POST" }, 405);
      return url.pathname === "/api/send-code"
        ? handleSend(request, env, limiter)
        : handleVerify(request, env, limiter);
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "没有这个接口" }, 404);
    return env.ASSETS.fetch(request);
  },
};
