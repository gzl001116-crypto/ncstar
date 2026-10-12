import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleSend, handleVerify, memoryLimiter, type MailEnv } from "./worker/codes";

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

function verifyApi() {
  const env = loadDevVars();
  const limiter = memoryLimiter();
  return {
    name: "verify-api",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const url = req.url?.split("?")[0];
          if (url !== "/api/send-code" && url !== "/api/verify-code") {
            next();
            return;
          }
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "请使用 POST" }));
            return;
          }
          const raw = await readBody(req);
          const request = new Request(`http://127.0.0.1${url}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "cf-connecting-ip": req.socket.remoteAddress ?? "local",
            },
            body: raw,
          });
          const response =
            url === "/api/send-code"
              ? await handleSend(request, env, limiter)
              : await handleVerify(request, env, limiter);
          res.statusCode = response.status;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(await response.text());
        })().catch(next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), verifyApi()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
