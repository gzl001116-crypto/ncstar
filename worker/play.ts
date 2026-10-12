export const PLAY_FORMATS = ["comic", "voice", "video", "novel", "game"] as const;
export type PlayFormat = (typeof PLAY_FORMATS)[number];

export type PlayPage = { text: string; image: string };
export type PlayTrack = { title: string; src: string; text: string };

export type PlayBody = {
  pages?: PlayPage[];
  tracks?: PlayTrack[];
  video?: string;
  novel?: string;
  html?: string;
};

export function isPlayFormat(value: string): value is PlayFormat {
  return (PLAY_FORMATS as readonly string[]).includes(value);
}

export function httpsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function blocks(raw: string) {
  return raw
    .split(/\n---\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 200);
}

export function parsePlay(format: string, raw: string): { ok: true; body: PlayBody } | { ok: false; code: string } {
  if (!format) return { ok: true, body: {} };
  if (!isPlayFormat(format)) return { ok: false, code: "err.play.format" };
  const source = raw.trim();
  if (source.length < 8) return { ok: false, code: "err.play.body" };

  if (format === "comic") {
    const pages = blocks(source).map((block) => {
      const lines = block.split("\n");
      const imageLine = lines[0]?.startsWith("image:") ? lines[0].slice("image:".length).trim() : "";
      const image = imageLine ? httpsUrl(imageLine) : "";
      if (imageLine && !image) return null;
      const text = (imageLine ? lines.slice(1).join("\n") : block).trim();
      return { text, image };
    });
    if (pages.some((page) => page === null) || pages.length === 0) return { ok: false, code: "err.play.url" };
    return { ok: true, body: { pages: pages as PlayPage[] } };
  }

  if (format === "voice") {
    const tracks = blocks(source).map((block) => {
      const lines = block.split("\n");
      const title = (lines[0] ?? "").trim().slice(0, 80);
      const rest = lines.slice(1);
      const audioLine = rest[0]?.startsWith("audio:") ? rest[0].slice("audio:".length).trim() : "";
      const src = audioLine ? httpsUrl(audioLine) : "";
      if (audioLine && !src) return null;
      const text = (audioLine ? rest.slice(1).join("\n") : rest.join("\n")).trim();
      if (!title && !text && !src) return null;
      return { title: title || text.slice(0, 40), src, text };
    });
    if (tracks.some((track) => track === null) || tracks.length === 0) return { ok: false, code: "err.play.url" };
    return { ok: true, body: { tracks: tracks as PlayTrack[] } };
  }

  if (format === "video") {
    const video = httpsUrl(source);
    if (!video) return { ok: false, code: "err.play.url" };
    return { ok: true, body: { video } };
  }

  if (format === "novel") return { ok: true, body: { novel: source.slice(0, 100_000) } };
  return { ok: true, body: { html: source.slice(0, 100_000) } };
}
