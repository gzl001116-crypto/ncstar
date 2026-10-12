import { cacheLimiter, handleSend, handleVerify, json, type MailEnv } from "./codes.ts";

export { FanstarStore } from "./do.ts";

export interface Env extends MailEnv {
  ASSETS: Fetcher;
  FANSTAR: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
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
    if (url.pathname.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      return env.FANSTAR.get(env.FANSTAR.idFromName("fanstar")).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
