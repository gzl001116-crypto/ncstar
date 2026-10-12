import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { isMessage, useI18n } from "../i18n";
import { isAbsolute, loginHref, playPath, playSection, shopHref } from "../site";
import { useStore } from "../store";
import type { Product } from "../types";
import { formatDate } from "../utils";

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

function PlayLogin() {
  const { t } = useI18n();
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

function PlayTabs() {
  const { t } = useI18n();
  const className = ({ isActive }: { isActive: boolean }) => (isActive ? "chip on" : "chip");
  return (
    <nav className="play-tabs">
      <NavLink to={playSection()} end className={className}>
        {t("play.works")}
      </NavLink>
      <NavLink to={playSection("lists")} className={className}>
        {t("play.lists")}
      </NavLink>
      <NavLink to={playSection("history")} className={className}>
        {t("play.history")}
      </NavLink>
    </nav>
  );
}

function ownedWorks(products: Product[], user: { handle: string; library: { productId: string }[] }) {
  const ids = new Set(user.library.map((item) => item.productId));
  return products.filter((product) => product.playFormat && (ids.has(product.id) || product.creatorId === user.handle));
}

export function PlayHome() {
  const { t } = useI18n();
  useTitle("play.fanstar");
  const { ready, user, products, creatorById } = useStore();
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<"played" | "bought" | "name">("played");
  const [savedOnly, setSavedOnly] = useState(false);
  const navigate = useNavigate();

  const owned = useMemo(() => (user ? ownedWorks(products, user) : []), [products, user]);

  const visible = useMemo(() => {
    const playedAt = new Map((user?.playProgress ?? []).map((item) => [item.productId, item.updatedAt]));
    const boughtAt = new Map((user?.library ?? []).map((item) => [item.productId, item.purchasedAt]));
    const saved = new Set(user?.playList ?? []);
    const next = owned.filter((product) => {
      if (savedOnly && !saved.has(product.id)) return false;
      if (format !== "all" && product.playFormat !== format) return false;
      const creator = creatorById(product.creatorId);
      const haystack = `${product.title} ${product.description} ${product.tags.join(" ")} ${creator?.name ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
    next.sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      const left = sort === "played" ? playedAt.get(a.id) ?? "" : boughtAt.get(a.id) ?? "";
      const right = sort === "played" ? playedAt.get(b.id) ?? "" : boughtAt.get(b.id) ?? "";
      if (left && right && left !== right) return right.localeCompare(left);
      if (left) return -1;
      if (right) return 1;
      return a.title.localeCompare(b.title);
    });
    return next;
  }, [creatorById, format, owned, query, savedOnly, sort, user]);

  if (!ready) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) return <PlayLogin />;

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("play.kicker")}</p>
        <h1>play.fanstar</h1>
        <p className="lead">{t("play.lead")}</p>
        <PlayTabs />
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
        <button type="button" className={format === "all" && !savedOnly ? "chip on" : "chip"} onClick={() => { setFormat("all"); setSavedOnly(false); }}>
          {t("play.all")}
        </button>
        {FORMATS.map((item) => (
          <button
            key={item}
            type="button"
            className={format === item && !savedOnly ? "chip on" : "chip"}
            onClick={() => {
              setFormat(item);
              setSavedOnly(false);
            }}
          >
            {t(formatKey(item))}
          </button>
        ))}
        <button type="button" className={savedOnly ? "chip on" : "chip"} onClick={() => setSavedOnly(true)}>
          {t("play.saved")}
        </button>
      </div>
      <div className="chips">
        {(["played", "bought", "name"] as const).map((item) => (
          <button key={item} type="button" className={sort === item ? "chip on" : "chip"} onClick={() => setSort(item)}>
            {t(`play.sort.${item}`)}
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
        <PlayRow title={t("play.works")} items={visible} />
      )}
    </div>
  );
}

export function PlayLists() {
  const { t } = useI18n();
  useTitle(`${t("play.lists")} · play.fanstar`);
  const { ready, user, products, createPlaylist, deletePlaylist, removePlaylistItem } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  if (!ready) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (!user) return <PlayLogin />;
  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">play.fanstar</p>
        <h1>{t("play.lists")}</h1>
        <PlayTabs />
      </header>
      <form
        className="panel playlist-create"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await createPlaylist(name.trim());
          setError(result.error ?? "");
          if (!result.error) setName("");
        }}
      >
        <label>
          {t("play.listName")}
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("play.listName")} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark" type="submit">
          {t("play.listCreate")}
        </button>
      </form>
      {user.playlists.length === 0 ? (
        <div className="empty">{t("play.listEmpty")}</div>
      ) : (
        <div className="stack">
          {user.playlists.map((list) => {
            const first = list.items[0];
            return (
              <section key={list.id} className="panel">
                <div className="section-head">
                  <h2>{list.name}</h2>
                  <div className="hero-actions">
                    {first && (
                      <button
                        type="button"
                        className="btn btn-dark btn-small"
                        onClick={() => navigate(`${playPath(first.productId)}?list=${encodeURIComponent(list.id)}&track=${first.trackIndex}`)}
                      >
                        {t("play.listPlay")}
                      </button>
                    )}
                    <button type="button" className="btn btn-line btn-small" onClick={() => deletePlaylist(list.id)}>
                      {t("play.listDelete")}
                    </button>
                  </div>
                </div>
                {list.items.length === 0 ? (
                  <p className="muted">{t("play.listNoTracks")}</p>
                ) : (
                  <ol className="playlist-items">
                    {list.items.map((item) => {
                      const product = products.find((entry) => entry.id === item.productId);
                      const label = product
                        ? `${product.title} · ${t("play.track", { n: item.trackIndex + 1 })}`
                        : t("err.play.missing");
                      return (
                        <li key={`${item.productId}-${item.trackIndex}`}>
                          <Link to={`${playPath(item.productId)}?list=${encodeURIComponent(list.id)}&track=${item.trackIndex}`}>{label}</Link>
                          <button type="button" className="btn btn-line btn-small" onClick={() => removePlaylistItem(list.id, item.productId, item.trackIndex)}>
                            {t("play.unsave")}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PlayHistory() {
  const { t } = useI18n();
  useTitle(`${t("play.history")} · play.fanstar`);
  const { ready, user, products } = useStore();
  if (!ready) {
    return (
      <div className="page">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (!user) return <PlayLogin />;
  const owned = new Set(ownedWorks(products, user).map((product) => product.id));
  const items = user.playProgress.filter((item) => owned.has(item.productId));
  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">play.fanstar</p>
        <h1>{t("play.history")}</h1>
        <PlayTabs />
      </header>
      {items.length === 0 ? (
        <div className="empty">{t("play.historyEmpty")}</div>
      ) : (
        <div className="history-list">
          {items.map((item) => {
            const product = products.find((entry) => entry.id === item.productId);
            if (!product) return null;
            return (
              <article key={item.productId} className="history-row">
                <div>
                  <p className="kicker">{t(formatKey(product.playFormat))}</p>
                  <h2>{product.title}</h2>
                  <p className="muted">{formatDate(item.updatedAt)}</p>
                </div>
                <Link to={playPath(product.id)} className="btn btn-dark btn-small">
                  {t("play.continue")}
                </Link>
              </article>
            );
          })}
        </div>
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
  const [params] = useSearchParams();
  const { t } = useI18n();
  const { ready, user, creatorById, togglePlayList, savePlayProgress } = useStore();
  const navigate = useNavigate();
  const [file, setFile] = useState<PlayFile | null>(null);
  const [error, setError] = useState("");
  useTitle(file ? `${file.title} · play.fanstar` : "play.fanstar");
  const userRef = useRef(user);
  userRef.current = user;
  const listId = params.get("list") ?? "";
  const playlist = user?.playlists.find((item) => item.id === listId);

  useEffect(() => {
    if (!ready) return;
    if (!userRef.current) {
      const href = loginHref();
      if (isAbsolute(href)) window.location.replace(href);
      else navigate(href, { replace: true });
      return;
    }
    let live = true;
    setFile(null);
    setError("");
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
          <Link to={playSection()} className="btn btn-dark">
            {t("play.works")}
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
  const trackQuery = params.get("track");
  const start = trackQuery != null && trackQuery !== "" ? Number(trackQuery) : Number(cursor);
  const advance = (index: number) => {
    if (!playlist) return;
    const at = playlist.items.findIndex((item) => item.productId === file.id && item.trackIndex === index);
    const next = playlist.items[at + 1];
    if (!next) return;
    navigate(`${playPath(next.productId)}?list=${encodeURIComponent(playlist.id)}&track=${next.trackIndex}`);
  };

  return (
    <div className="page play-view play-lock" onContextMenu={block} onCopy={block} onCut={block} onDragStart={block}>
      <div className="play-bar">
        <Link to={playSection()} className="back">
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
      {playlist && (
        <p className="banner-note">
          {t("play.playlistNow")} · {playlist.name}
        </p>
      )}
      {file.format === "comic" && <ComicReader pages={file.pages ?? []} cursor={cursor} onCursor={remember} />}
      {file.format === "voice" && (
        <VoiceReader
          key={`${file.id}-${listId}-${trackQuery ?? ""}`}
          tracks={file.tracks ?? []}
          start={start}
          onCursor={remember}
          limit={limit}
          productId={file.id}
          playlistMode={Boolean(playlist)}
          onFinished={advance}
        />
      )}
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
  const [rtl, setRtl] = useState(true);
  const [full, setFull] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const step = spread ? 2 : 1;
  const saveRef = useRef(onCursor);
  saveRef.current = onCursor;
  const goNext = () => setIndex((current) => Math.min(pages.length - 1, current + step));
  const goPrev = () => setIndex((current) => Math.max(0, current - step));

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
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
      const nextKey = rtl ? "ArrowLeft" : "ArrowRight";
      const prevKey = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === nextKey) goNext();
      if (event.key === prevKey) goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length, rtl, step]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const shown = pages.slice(index, index + (spread ? 2 : 1));
  const done = index >= pages.length - step;
  const lastShown = index + shown.length;
  const place = lastShown > index + 1 ? `${index + 1}–${lastShown}` : `${index + 1}`;
  const toggleFull = async () => {
    const node = stageRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      /* The browser can refuse fullscreen. */
    }
  };
  const prevButton = (
    <button type="button" className="btn btn-line" onClick={goPrev} disabled={index === 0}>
      {t("play.prev")}
    </button>
  );
  const nextButton = (
    <button type="button" className="btn btn-line" onClick={goNext} disabled={done}>
      {t("play.next")}
    </button>
  );

  return (
    <div className="reader" ref={stageRef}>
      <div className="reader-stage">
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
        <button type="button" className="reader-hit left" aria-label={rtl ? t("play.next") : t("play.prev")} onClick={() => (rtl ? goNext() : goPrev())} />
        <button type="button" className="reader-hit right" aria-label={rtl ? t("play.prev") : t("play.next")} onClick={() => (rtl ? goPrev() : goNext())} />
      </div>
      {done && <p className="banner-note">{t("play.end")}</p>}
      <div className="reader-tools">
        {rtl ? nextButton : prevButton}
        <span className="muted">
          {place} / {pages.length}
        </span>
        {rtl ? prevButton : nextButton}
        <label className="reader-speed">
          {t("play.page")}
          <input
            type="range"
            min={0}
            max={Math.max(pages.length - 1, 0)}
            value={index}
            onChange={(event) => setIndex(clamp(Number(event.target.value), 0, Math.max(pages.length - 1, 0)))}
          />
        </label>
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
        <button type="button" className="btn btn-line" onClick={() => setRtl((value) => !value)}>
          {rtl ? t("play.rtl") : t("play.ltr")}
        </button>
        <button type="button" className="btn btn-line" onClick={toggleFull}>
          {full ? t("play.exitFullscreen") : t("play.fullscreen")}
        </button>
      </div>
    </div>
  );
}

function VoiceReader({
  tracks,
  start,
  onCursor,
  limit,
  productId,
  playlistMode,
  onFinished,
}: {
  tracks: PlayTrack[];
  start: number;
  onCursor: (value: string) => void;
  limit: number;
  productId: string;
  playlistMode: boolean;
  onFinished: (index: number) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(() => clamp(start, 0, Math.max(tracks.length - 1, 0)));
  const [playing, setPlaying] = useState(false);
  const [capped, setCapped] = useState(false);
  const [loop, setLoop] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const track = tracks[index];
  const saveRef = useRef(onCursor);
  saveRef.current = onCursor;
  const finishRef = useRef(onFinished);
  finishRef.current = onFinished;

  useEffect(() => {
    saveRef.current(String(index));
  }, [index]);

  useEffect(() => {
    window.speechSynthesis?.cancel();
    setPlaying(false);
    setCapped(false);
    return () => window.speechSynthesis?.cancel();
  }, [index]);

  const ended = () => {
    if (loop) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    if (playlistMode) {
      finishRef.current(index);
      return;
    }
    setIndex((current) => Math.min(tracks.length - 1, current + 1));
  };

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
    utterance.onend = () => {
      setPlaying(false);
      if (loop) {
        window.speechSynthesis.speak(utterance);
        setPlaying(true);
        return;
      }
      ended();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  if (!track) return null;
  return (
    <div className="reader voice-reader">
      <div className="voice-stage">
        <p className="kicker">
          {t("play.track", { n: index + 1 })} / {tracks.length}
        </p>
        <h2>{track.title}</h2>
        {track.src ? (
          <audio
            ref={audioRef}
            src={track.src}
            controls
            controlsList="nodownload"
            loop={loop}
            onContextMenu={(event) => event.preventDefault()}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={ended}
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
        <div className="reader-tools">
          <button type="button" className="btn btn-line" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0}>
            {t("play.prevTrack")}
          </button>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => setIndex((current) => Math.min(tracks.length - 1, current + 1))}
            disabled={index >= tracks.length - 1}
          >
            {t("play.nextTrack")}
          </button>
          <button type="button" className={loop ? "btn btn-soft" : "btn btn-line"} onClick={() => setLoop((value) => !value)}>
            {t("play.loop")}
          </button>
        </div>
        {capped && <p className="banner-note">{t("play.previewEnd")}</p>}
        <AddTrack productId={productId} trackIndex={index} />
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

function AddTrack({ productId, trackIndex }: { productId: string; trackIndex: number }) {
  const { t } = useI18n();
  const { user, createPlaylist, addPlaylistItem } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const lists = user?.playlists ?? [];
  return (
    <div className="track-add">
      <p className="muted">{t("play.addTrack")}</p>
      <div className="chips">
        {lists.map((list) => (
          <button
            key={list.id}
            type="button"
            className="chip"
            onClick={async () => {
              const result = await addPlaylistItem(list.id, productId, trackIndex);
              setError(result ?? "");
            }}
          >
            {list.name}
          </button>
        ))}
      </div>
      <form
        className="code-row"
        onSubmit={async (event) => {
          event.preventDefault();
          const created = await createPlaylist(name.trim());
          if (created.error || !created.id) {
            setError(created.error ?? t("err.generic"));
            return;
          }
          const added = await addPlaylistItem(created.id, productId, trackIndex);
          setError(added ?? "");
          if (!added) setName("");
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("play.listName")} aria-label={t("play.listName")} />
        <button className="btn btn-line" type="submit">
          {t("play.listCreate")}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
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
  const [night, setNight] = useState(false);
  const saveRef = useRef(onCursor);
  saveRef.current = onCursor;
  useEffect(() => {
    const node = ref.current;
    if (node) {
      const next = Number(cursor);
      if (next > 0) node.scrollTop = next;
    }
    saveRef.current(cursor || "0");
    // Restore the saved place once, and record that the novel was opened.
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
        <button type="button" className={night ? "btn btn-soft" : "btn btn-line"} onClick={() => setNight((value) => !value)}>
          {night ? t("play.night") : t("play.paper")}
        </button>
      </div>
      <div
        className={night ? "novel-scroll night" : "novel-scroll"}
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
