import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleSend, handleVerify, memoryLimiter, type MailEnv } from "./worker/codes";
import { openSql } from "./worker/node-db";
import { handleApp } from "./worker/platform";

function loadDevVars(): MailEnv {
  if (!existsSync(".dev.vars")) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function api() {
  const env = loadDevVars();
  const limiter = memoryLimiter();
  const sql = openSql();
  return {
    name: "fanstar-api",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const path = req.url?.split("?")[0] ?? "";
          if (!path.startsWith("/api/")) {
            next();
            return;
          }
          const raw = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);
          const headers = new Headers();
          if (req.headers.cookie) headers.set("cookie", req.headers.cookie);
          if (req.headers["content-type"]) headers.set("content-type", String(req.headers["content-type"]));
          headers.set("cf-connecting-ip", req.socket.remoteAddress ?? "local");
          const authority = String(req.headers[":authority"] || req.headers.host || "127.0.0.1");
          const encrypted = Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted);
          const request = new Request(`${encrypted ? "https" : "http"}://${authority}${req.url}`, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
          });
          const response =
            path === "/api/send-code"
              ? await handleSend(request, env, limiter)
              : path === "/api/verify-code"
                ? await handleVerify(request, env, limiter)
                : await handleApp(request, sql, env, limiter);
          res.statusCode = response.status;
          const type = response.headers.get("content-type");
          if (type) res.setHeader("content-type", type);
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length > 0) res.setHeader("set-cookie", cookies);
          else {
            const cookie = response.headers.get("set-cookie");
            if (cookie) res.setHeader("set-cookie", cookie);
          }
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), api()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: [".fanstar.dev", "localhost"],
  },
});
