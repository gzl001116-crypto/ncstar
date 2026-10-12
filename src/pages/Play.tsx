import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { isMessage, useI18n } from "../i18n";
import { isAbsolute, loginHref, playPath, shopHref } from "../site";
import { useStore } from "../store";
import type { Product } from "../types";

const FORMATS = ["comic", "voice", "video", "novel", "game"] as const;

type PlayPage = { text: string; image: string };
type PlayTrack = { title: string; src: string; text: string };
type PlayFile = {
  id: string;
  format: string;
  title: string;
  creatorId: string;
  preview?: boolean;
  previewLimit?: number;
  note?: string;
  pages?: PlayPage[];
  tracks?: PlayTrack[];
  video?: string;
  novel?: string;
  html?: string;
};

function formatKey(format: string) {
  return `play.format.${format}`;
}

export function PlayHome() {
  const { t } = useI18n();
  useTitle("play.fanstar");
  const { ready, user, products, creatorById } = useStore();
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const navigate = useNavigate();

  const owned = useMemo(() => {
    if (!user) return [];
    const ids = new Set(user.library.map((item) => item.productId));
    return products.filter((product) => product.playFormat && (ids.has(product.id) || product.creatorId === user.handle));
  }, [products, user]);

  const visible = owned.filter((product) => {
    if (format !== "all" && product.playFormat !== format) return false;
    const creator = creatorById(product.creatorId);
    const haystack = `${product.title} ${product.description} ${product.tags.join(" ")} ${creator?.name ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const byId = new Map(visible.map((product) => [product.id, product]));
  const recent = (user?.playProgress ?? [])
    .map((item) => byId.get(item.productId))
    .filter((item): item is Product => Boolean(item));
  const saved = (user?.playList ?? []).map((id) => byId.get(id)).filter((item): item is Product => Boolean(item));

  if (!ready) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <p className="kicker">play.fanstar</p>
          <h1>{t("play.loginH")}</h1>
          <p>{t("play.loginP")}</p>
          {isAbsolute(loginHref()) ? (
            <a href={loginHref()} className="btn btn-dark">
              {t("login")}
            </a>
          ) : (
            <Link to={loginHref()} className="btn btn-dark">
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("play.kicker")}</p>
        <h1>play.fanstar</h1>
        <p className="lead">{t("play.lead")}</p>
        <form
          className="search search-large"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("play.search")}
            aria-label={t("play.search")}
          />
        </form>
      </header>
      <div className="chips">
        <button type="button" className={format === "all" ? "chip on" : "chip"} onClick={() => setFormat("all")}>
          {t("play.all")}
        </button>
        {FORMATS.map((item) => (
          <button key={item} type="button" className={format === item ? "chip on" : "chip"} onClick={() => setFormat(item)}>
            {t(formatKey(item))}
          </button>
        ))}
      </div>
      {owned.length === 0 ? (
        <div className="empty">
          <p>{t("play.empty")}</p>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              const href = shopHref("/explore?kind=products");
              if (isAbsolute(href)) window.location.assign(href);
              else navigate(href);
            }}
          >
            {t("play.shopLink")}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">{t("play.noneMatch")}</div>
      ) : (
        <>
          {recent.length > 0 && <PlayRow title={t("play.recent")} items={recent} />}
          {saved.length > 0 && <PlayRow title={t("play.saved")} items={saved} />}
          <PlayRow title={t("play.library")} items={visible} />
        </>
      )}
    </div>
  );
}

function PlayRow({ title, items }: { title: string; items: Product[] }) {
  const { t } = useI18n();
  const { creatorById } = useStore();
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      <div className="cards">
        {items.map((product) => (
          <Link key={`${title}-${product.id}`} to={playPath(product.id)} className="card">
            <Cover id={product.coverKey} ratio="16 / 10" />
            <div className="card-body">
              <div className="meta">
                <span className="pill">{t(formatKey(product.playFormat))}</span>
              </div>
              <h3>{product.title}</h3>
              <p className="muted">{creatorById(product.creatorId)?.name}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function PlayViewer() {
  const { productId = "" } = useParams();
  const { t } = useI18n();
  const { ready, user, creatorById, togglePlayList, savePlayProgress } = useStore();
  const navigate = useNavigate();
  const [file, setFile] = useState<PlayFile | null>(null);
  const [error, setError] = useState("");
  useTitle(file ? `${file.title} · play.fanstar` : "play.fanstar");
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!ready) return;
    if (!userRef.current) {
      const href = loginHref();
      if (isAbsolute(href)) window.location.replace(href);
      else navigate(href, { replace: true });
      return;
    }
    let live = true;
    fetch(`/api/play?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as PlayFile & { code?: string };
        if (!live) return;
        if (!response.ok) {
          setError(data.code && isMessage(data.code) ? t(data.code) : t("err.play.missing"));
          return;
        }
        setFile(data);
      })
      .catch(() => {
        if (live) setError(t("err.network"));
      });
    return () => {
      live = false;
    };
  }, [ready, productId, navigate, t]);

  if (!ready || (user && !file && !error)) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (error || !file) {
    return (
      <div className="page narrow">
        <div className="empty">
          <p>{error || t("err.play.missing")}</p>
          <Link to={playPath()} className="btn btn-dark">
            {t("play.library")}
          </Link>
        </div>
      </div>
    );
  }

  const creator = creatorById(file.creatorId);
  const saved = Boolean(user?.playList.includes(file.id));
  const cursor = user?.playProgress.find((item) => item.productId === file.id)?.cursor ?? "0";
  const remember = (value: string) => savePlayProgress(file.id, value);
  const limit = file.preview ? file.previewLimit ?? 0 : 0;
  const block = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div className="page play-view play-lock" onContextMenu={block} onCopy={block} onCut={block} onDragStart={block}>
      <div className="play-bar">
        <Link to={playPath()} className="back">
          ← play.fanstar
        </Link>
        <div>
          <p className="kicker">{t(formatKey(file.format))}</p>
          <h1>{file.title}</h1>
          {creator && <p className="muted">{creator.name}</p>}
        </div>
        {!file.preview && (
          <div className="hero-actions">
            <button type="button" className={saved ? "btn btn-soft" : "btn btn-line"} onClick={() => togglePlayList(file.id)}>
              {saved ? t("play.unsave") : t("play.save")}
            </button>
          </div>
        )}
      </div>
      {file.preview && <p className="banner-note">{t("play.previewNote")}</p>}
      {file.format === "comic" && <ComicReader pages={file.pages ?? []} cursor={cursor} onCursor={remember} />}
      {file.format === "voice" && <VoiceReader tracks={file.tracks ?? []} cursor={cursor} onCursor={remember} limit={limit} />}
      {file.format === "video" && <VideoReader src={file.video ?? ""} note={file.note} cursor={cursor} onCursor={remember} limit={limit} />}
      {file.format === "novel" && <NovelReader text={file.novel ?? file.note ?? ""} cursor={cursor} onCursor={remember} />}
      {file.format === "game" && <GameReader html={file.html ?? ""} title={file.title} />}
    </div>
  );
}

function ComicReader({ pages, cursor, onCursor }: { pages: PlayPage[]; cursor: string; onCursor: (value: string) => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(() => clamp(Number(cursor) || 0, 0, Math.max(pages.length - 1, 0)));
  const [spread, setSpread] = useState(false);
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(8);
  const step = spread ? 2 : 1;
  const saveRef = useRef(onCursor);
  saveRef.current = onCursor;

  useEffect(() => {
    saveRef.current(String(index));
  }, [index]);

  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + step >= pages.length ? current : current + step));
    }, speed * 1000);
    return () => window.clearInterval(timer);
  }, [auto, speed, step, pages.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setIndex((current) => Math.min(pages.length - 1, current + step));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - step));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length, step]);

  const shown = pages.slice(index, index + (spread ? 2 : 1));
  const done = index >= pages.length - step;
  const lastShown = index + shown.length;
  const place = lastShown > index + 1 ? `${index + 1}–${lastShown}` : `${index + 1}`;

  return (
    <div className="reader">
      <div className={`reader-pages ${spread ? "spread" : ""}`}>
        {shown.map((page, offset) => (
          <article key={`${index}-${offset}`} className="reader-page">
            {page.image && <img src={page.image} alt="" draggable={false} />}
            {page.text.split("\n").map((line, lineIndex) => (
              <p key={lineIndex}>{line}</p>
            ))}
          </article>
        ))}
      </div>
      {done && <p className="banner-note">{t("play.end")}</p>}
      <div className="reader-tools">
        <button type="button" className="btn btn-line" onClick={() => setIndex((current) => Math.max(0, current - step))} disabled={index === 0}>
          {t("play.prev")}
        </button>
        <span className="muted">
          {place} / {pages.length}
        </span>
        <button
          type="button"
          className="btn btn-line"
          onClick={() => setIndex((current) => Math.min(pages.length - 1, current + step))}
          disabled={done}
        >
          {t("play.next")}
        </button>
        <button type="button" className="btn btn-line" onClick={() => setSpread((value) => !value)}>
          {spread ? t("play.single") : t("play.spread")}
        </button>
        <button type="button" className={auto ? "btn btn-soft" : "btn btn-line"} onClick={() => setAuto((value) => !value)}>
          {auto ? t("play.autoOff") : t("play.auto")}
        </button>
        <label className="reader-speed">
          {t("play.speed")}
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={5}>5s</option>
            <option value={8}>8s</option>
            <option value={12}>12s</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function VoiceReader({ tracks, cursor, onCursor, limit }: { tracks: PlayTrack[]; cursor: string; onCursor: (value: string) => void; limit: number }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(() => clamp(Number(cursor) || 0, 0, Math.max(tracks.length - 1, 0)));
  const [playing, setPlaying] = useState(false);
  const [capped, setCapped] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = tracks[index];
  const saveRef = useRef(onCursor);
  saveRef.current = onCursor;

  useEffect(() => {
    saveRef.current(String(index));
  }, [index]);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  const toggle = async () => {
    if (!track) return;
    if (track.src && audioRef.current) {
      if (audioRef.current.paused) {
        await audioRef.current.play();
        setPlaying(true);
      } else {
        audioRef.current.pause();
        setPlaying(false);
      }
      return;
    }
    if (!window.speechSynthesis) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(track.text || track.title);
    utterance.lang = document.documentElement.lang;
    utterance.onend = () => setPlaying(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  if (!track) return null;
  return (
    <div className="reader voice-reader">
      <div className="voice-stage">
        <h2>{track.title}</h2>
        {track.src ? (
          <audio
            ref={audioRef}
            src={track.src}
            controls
            controlsList="nodownload"
            onContextMenu={(event) => event.preventDefault()}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setIndex((current) => Math.min(tracks.length - 1, current + 1))}
            onTimeUpdate={(event) => {
              if (limit > 0 && event.currentTarget.currentTime >= limit) {
                event.currentTarget.pause();
                event.currentTarget.currentTime = Math.max(0, limit - 0.05);
                setCapped(true);
              }
            }}
            onSeeking={(event) => {
              if (limit > 0 && event.currentTarget.currentTime > limit) {
                event.currentTarget.currentTime = Math.max(0, limit - 0.05);
                setCapped(true);
              }
            }}
          />
        ) : (
          <>
            <p className="muted">{t("play.noAudio")}</p>
            <button type="button" className="btn btn-dark" onClick={toggle}>
              {playing ? t("play.voicePause") : t("play.voicePlay")}
            </button>
            {track.text && <p className="voice-script">{track.text}</p>}
          </>
        )}
        {capped && <p className="banner-note">{t("play.previewEnd")}</p>}
      </div>
      <ol className="voice-list">
        {tracks.map((item, itemIndex) => (
          <li key={`${item.title}-${itemIndex}`}>
            <button type="button" className={itemIndex === index ? "on" : ""} onClick={() => setIndex(itemIndex)}>
              {item.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function VideoReader({ src, note, cursor, onCursor, limit }: { src: string; note?: string; cursor: string; onCursor: (value: string) => void; limit: number }) {
  const { t } = useI18n();
  const [capped, setCapped] = useState(false);
  if (!src) {
    if (note) return <div className="novel-scroll"><p>{note}</p></div>;
    return <p className="empty">{t("play.videoMissing")}</p>;
  }
  return (
    <>
      <video
        className="play-video"
        src={src}
        controls
        controlsList="nodownload"
        playsInline
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onLoadedMetadata={(event) => {
          const next = Number(cursor);
          if (next > 0 && (limit <= 0 || next < limit)) event.currentTarget.currentTime = next;
        }}
        onTimeUpdate={(event) => {
          if (limit > 0 && event.currentTarget.currentTime >= limit) {
            event.currentTarget.pause();
            event.currentTarget.currentTime = Math.max(0, limit - 0.05);
            setCapped(true);
            return;
          }
          const now = Math.floor(event.currentTarget.currentTime);
          if (now > 0 && now % 5 === 0) onCursor(String(now));
        }}
        onSeeking={(event) => {
          if (limit > 0 && event.currentTarget.currentTime > limit) {
            event.currentTarget.currentTime = Math.max(0, limit - 0.05);
            setCapped(true);
          }
        }}
      />
      {capped && <p className="banner-note">{t("play.previewEnd")}</p>}
    </>
  );
}

function NovelReader({ text, cursor, onCursor }: { text: string; cursor: string; onCursor: (value: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef(0);
  const [size, setSize] = useState(18);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const next = Number(cursor);
    if (next > 0) node.scrollTop = next;
    // Restore the saved place once. Later progress updates should not jump the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="novel-wrap">
      <div className="reader-tools">
        <button type="button" className="btn btn-line" onClick={() => setSize((value) => Math.max(15, value - 1))}>
          {t("play.fontSmall")}
        </button>
        <button type="button" className="btn btn-line" onClick={() => setSize((value) => Math.min(28, value + 1))}>
          {t("play.fontLarge")}
        </button>
      </div>
      <div
        className="novel-scroll"
        ref={ref}
        onScroll={(event) => {
          const top = Math.floor(event.currentTarget.scrollTop);
          window.clearTimeout(scrollTimer.current);
          scrollTimer.current = window.setTimeout(() => onCursor(String(top)), 400);
        }}
        style={{ fontSize: size }}
      >
        {text.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

function GameReader({ html, title }: { html: string; title: string }) {
  const guard = `<script>document.addEventListener("contextmenu",function(e){e.preventDefault()});document.addEventListener("copy",function(e){e.preventDefault()});document.addEventListener("cut",function(e){e.preventDefault()});</script><style>html,body{-webkit-user-select:none;user-select:none}</style>`;
  return <iframe className="play-frame" sandbox="allow-scripts" srcDoc={`${guard}${html}`} title={title} />;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
