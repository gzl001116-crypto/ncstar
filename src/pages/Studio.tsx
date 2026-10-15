import { FormEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, Cover, coverSrc } from "../components/Cover";
import { useTitle } from "../hooks";
import { PasswordForm } from "./Password";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { CATEGORIES, type Category, type Product } from "../types";
import { coinText, fiat, formatDate, utcStamp, yuan } from "../utils";

const KINDS = ["数字作品", "插画", "音乐", "设计", "摄影", "写作", "图案"] as const;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_COVER = 1024 * 1024;
const PREVIEW_DEFAULTS = new Set(["", "1", "30", "400", "800"]);

function fileCanPlay(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/svg+xml" || name.endsWith(".svg")) return false;
  if (type.startsWith("text/") || type.startsWith("audio/") || type.startsWith("video/") || type.startsWith("image/")) return true;
  return /\.(html|htm|txt|md|markdown|text|mp3|m4a|wav|ogg|flac|mp4|webm|png|jpg|jpeg|gif|webp)$/.test(name);
}

function coverOk(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === "image/svg+xml" || name.endsWith(".svg")) return false;
  if (type === "image/png" || type === "image/jpeg" || type === "image/gif" || type === "image/webp") return true;
  return /\.(png|jpe?g|gif|webp)$/.test(name);
}

function previewDefault(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("text/html") || /\.html?$/.test(name)) return "800";
  if (type.startsWith("text/") || /\.(txt|md|markdown|text)$/.test(name)) return "400";
  if (type.startsWith("audio/") || type.startsWith("video/") || /\.(mp3|m4a|wav|ogg|flac|mp4|webm)$/.test(name)) return "30";
  return "1";
}

function tagProblem(raw: string) {
  const unique: string[] = [];
  for (const item of raw.split(/[,，]/)) {
    const tag = item.trim();
    if (!tag) continue;
    if (Array.from(tag).length > 5) return "err.tag.length";
    if (!unique.includes(tag)) unique.push(tag);
  }
  if (unique.length > 10) return "err.tag.count";
  return "";
}

function pickedFile(value: FormDataEntryValue | null) {
  return value instanceof File && value.size > 0 ? value : undefined;
}

function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [message]);
  if (!message) return null;
  return (
    <p ref={ref} className="error">
      {message}
    </p>
  );
}

function StudioGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  useTitle(t("studio.title"));
  const { ready, user, creatorById, loadDesk } = useStore();
  const location = useLocation();

  useEffect(() => {
    if (user?.isCreator) void loadDesk();
  }, [user?.isCreator, user?.handle]);

  if (!ready) {
    return (
      <div className="page narrow">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>{t("studio.loginH")}</h1>
          <p>{t("studio.loginP")}</p>
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="btn btn-dark">
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }

  const creator = creatorById(user.handle);
  if (!user.isCreator || !creator) return <Navigate to="/page" replace />;

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("nav.studio")}</p>
        <h1>{t("studio.desk", { name: user.name })}</h1>
      </header>
      <nav className="studio-nav">
        <NavLink to="/studio" end>
          {t("studio.navHome")}
        </NavLink>
        <NavLink to="/studio/posts">{t("studio.navPosts")}</NavLink>
        <NavLink to="/studio/works">{t("studio.navWorks")}</NavLink>
        <NavLink to="/studio/tiers">{t("studio.tiers")}</NavLink>
        <NavLink to="/studio/orders">{t("studio.orders")}</NavLink>
        <NavLink to="/studio/payout">{t("studio.navPayout")}</NavLink>
        <NavLink to="/studio/guide">{t("studio.navGuide")}</NavLink>
      </nav>
      {children}
    </div>
  );
}

export function StudioLayout() {
  return (
    <StudioGate>
      <Outlet />
    </StudioGate>
  );
}

export function StudioHome() {
  const { t, phrase, locale } = useI18n();
  const { user, posts, products, creatorById, followerCount, supporterCount, desk } = useStore();
  const creator = creatorById(user?.handle ?? "");
  if (!user || !creator) return null;
  const minePosts = posts.filter((post) => post.creatorId === user.handle);
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const shortcuts = [
    ["/studio/posts", t("studio.openPosts"), t("studio.shortcutPosts")],
    ["/studio/works", t("studio.openWorks"), t("studio.shortcutWorks")],
    ["/studio/tiers", t("studio.openTiers"), t("studio.shortcutTiers")],
    ["/studio/orders", t("studio.openOrders"), t("studio.shortcutOrders")],
    ["/studio/payout", t("studio.openPayout"), t("studio.shortcutPayout")],
    ["/studio/guide", t("studio.openGuide"), t("studio.shortcutGuide")],
  ] as const;
  return (
    <>
      <p className="studio-lead">{t("studio.lead")}</p>
      <div className="studio-stats">
        <div>
          <strong>{followerCount(creator).toLocaleString(locale)}</strong>
          <span>{t("common.followers")}</span>
        </div>
        <div>
          <strong>{supporterCount(creator.id).toLocaleString(locale)}</strong>
          <span>{t("common.supporters")}</span>
        </div>
        <div>
          <strong>{minePosts.length.toLocaleString(locale)}</strong>
          <span>{t("common.posts")}</span>
        </div>
        <div>
          <strong>{mineProducts.length.toLocaleString(locale)}</strong>
          <span>{t("common.products")}</span>
        </div>
        <div>
          <strong>{desk ? yuan(desk.net) : "—"}</strong>
          <span>{t("studio.net")}</span>
        </div>
        <Link to={`/c/${creator.handle}`} className="btn btn-line">
          {t("studio.viewPage")}
        </Link>
      </div>
      <p className="desk-note">{t("studio.feeNote")}</p>
      <div className="studio-shortcuts">
        {shortcuts.map(([to, title, text]) => (
          <Link key={to} to={to}>
            <strong>{title}</strong>
            <span>{text}</span>
          </Link>
        ))}
      </div>
      <section className="section">
        <div className="section-head">
          <h2>{t("studio.recentPosts")}</h2>
          <Link to="/studio/posts">{t("studio.navPosts")}</Link>
        </div>
        <div className="stack">
          {minePosts.length === 0 && <div className="empty">{t("studio.emptyPosts")}</div>}
          {minePosts.slice(0, 3).map((post) => (
            <Link key={post.id} to={`/c/${user.handle}/posts/${post.id}`} className="line">
              <div>
                <strong>{post.title}</strong>
                <p className="muted">{formatDate(post.createdAt)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{t("studio.recentWorks")}</h2>
          <Link to="/studio/works">{t("studio.navWorks")}</Link>
        </div>
        <div className="stack">
          {mineProducts.length === 0 && <div className="empty">{t("studio.emptyWorks")}</div>}
          {mineProducts.slice(0, 3).map((product) => (
            <Link key={product.id} to={`/c/${user.handle}/shop/${product.id}`} className="line">
              <div>
                <strong>{product.title}</strong>
                <p className="muted">
                  {phrase(product.kind)} · {fiat(product.price, product.priceCurrency)} · {coinText(product.coinPrice)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function AccountAvatar() {
  const { t } = useI18n();
  const { user, uploadAvatar } = useStore();
  const [error, setError] = useState("");
  if (!user) return null;
  return (
    <form
      className="panel avatar-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = new FormData(form).get("file");
        if (!(file instanceof File) || file.size < 1) {
          setError(t("err.avatar"));
          return;
        }
        const result = await uploadAvatar(file);
        setError(result ?? "");
        if (!result) form.reset();
      }}
    >
      <Avatar name={user.name} id={user.handle} size={72} stamp={user.avatarAt} />
      <div>
        <h2>{t("page.avatar")}</h2>
        <p className="fineprint">{t("page.avatarHint")}</p>
        <input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark" type="submit">
          {t("page.change")}
        </button>
      </div>
    </form>
  );
}

function ApplyCreator() {
  const { t, phrase } = useI18n();
  const { openStudio } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const onApply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await openStudio({
      handle: String(data.get("handle") ?? ""),
      category: String(data.get("category") ?? ""),
      location: String(data.get("location") ?? ""),
      bio: String(data.get("bio") ?? ""),
    });
    setError(result ?? "");
    if (!result) navigate("/studio");
  };
  return (
    <form className="panel studio-form" onSubmit={onApply}>
      <h2>{t("page.apply")}</h2>
      <p className="muted">{t("page.applyLead")}</p>
      <p className="muted">{t("auth.handleLead")}</p>
      <label>
        {t("studio.handle")}
        <input name="handle" required placeholder={t("auth.handlePh")} autoCapitalize="none" />
      </label>
      <label>
        {t("studio.category")}
        <select name="category" defaultValue="写作">
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {phrase(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("studio.location")}
        <input name="location" />
      </label>
      <label>
        {t("page.note")}
        <textarea name="bio" rows={4} required placeholder={t("page.notePh")} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-dark" type="submit">
        {t("page.apply")}
      </button>
    </form>
  );
}

function DeleteAccount() {
  const { t } = useI18n();
  const { deleteAccount } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  return (
    <form
      className="panel danger-zone"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await deleteAccount(String(new FormData(event.currentTarget).get("password") ?? ""));
        if (result) {
          setError(result);
          return;
        }
        navigate("/");
      }}
    >
      <h2>{t("page.deleteH")}</h2>
      <p className="muted">{t("page.deleteP")}</p>
      <label>
        {t("page.password")}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-danger" type="submit">
        {t("page.deleteH")}
      </button>
    </form>
  );
}

export function MyPage() {
  const { t } = useI18n();
  useTitle(t("my.page"));
  const { ready, user, creatorById } = useStore();

  if (!ready) {
    return (
      <div className="page narrow">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>{t("studio.openH")}</h1>
          <p>{t("studio.openP")}</p>
          <Link to="/login?next=/page" className="btn btn-dark">
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }
  const creator = creatorById(user.handle);
  const opened = Boolean(user.isCreator && creator);
  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("studio.navProfile")}</p>
        <h1>{opened ? t("my.page") : t("page.apply")}</h1>
        {opened && (
          <Link to={`/c/${creator!.handle}`} className="btn btn-line">
            {t("studio.viewPage")}
          </Link>
        )}
      </header>
      <div className="stack">
        <AccountAvatar />
        {opened ? <StudioProfile /> : <ApplyCreator />}
        <PasswordForm lockedEmail={user.email} />
        <DeleteAccount />
      </div>
    </div>
  );
}

export function StudioProfile() {
  const { t, phrase } = useI18n();
  const { user, creatorById, updateProfile } = useStore();
  const creator = creatorById(user?.handle ?? "");
  const [error, setError] = useState("");
  if (!creator) return null;
  const onProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await updateProfile({
      name: String(data.get("name") ?? ""),
      bio: String(data.get("bio") ?? ""),
      location: String(data.get("location") ?? ""),
      category: String(data.get("category") ?? "") as Category,
      tags: String(data.get("tags") ?? ""),
    });
    setError(result ?? "");
  };
  return (
    <form className="panel studio-form" onSubmit={onProfile}>
      <h2>{t("studio.profile")}</h2>
      <p className="muted">{t("studio.since", { date: creator.since })}</p>
      <label>
        {t("studio.handle")}
        <input className="locked" readOnly value={`fanstar.dev/c/${creator.handle}`} />
      </label>
      <label>
        {t("auth.name")}
        <input name="name" defaultValue={creator.name} />
      </label>
      <label>
        {t("studio.location")}
        <input name="location" defaultValue={creator.location} />
      </label>
      <label>
        {t("studio.category")}
        <select name="category" defaultValue={creator.category}>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {phrase(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("studio.bio")}
        <textarea name="bio" defaultValue={creator.bio} rows={4} />
      </label>
      <label>
        {t("studio.tags")}
        <input name="tags" defaultValue={creator.tags.join("，")} placeholder={t("studio.tagsPh")} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-dark" type="submit">
        {t("common.save")}
      </button>
    </form>
  );
}

export function StudioPosts() {
  const { t, phrase, rank } = useI18n();
  const { user, posts, tiers, publishPost } = useStore();
  const [error, setError] = useState("");
  if (!user) return null;
  const minePosts = posts.filter((post) => post.creatorId === user.handle);
  const plans = tiers.filter((tier) => tier.creatorId === user.handle);
  const onPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await publishPost({
      title: String(data.get("title") ?? ""),
      excerpt: String(data.get("excerpt") ?? ""),
      body: String(data.get("body") ?? ""),
      minRank: Number(data.get("minRank") ?? 0),
    });
    if (result) {
      setError(result);
      return;
    }
    form.reset();
    setError("");
  };
  return (
    <>
      <form className="panel studio-form" onSubmit={onPost}>
        <h2>{t("studio.newPost")}</h2>
        <label>
          {t("studio.postTitle")}
          <input name="title" required />
        </label>
        <label>
          {t("studio.excerpt")}
          <input name="excerpt" />
        </label>
        <label>
          {t("studio.body")}
          <textarea name="body" rows={5} required />
        </label>
        <label>
          {t("studio.who")}
          <select name="minRank" defaultValue="0">
            <option value="0">{t("rank.public")}</option>
            {plans.map((tier) => (
              <option key={tier.id} value={tier.rank}>
                {t("studio.andAbove", { name: phrase(tier.name) })}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark" type="submit">
          {t("studio.publish")}
        </button>
      </form>
      <section className="section">
        <h2>{t("studio.listed")}</h2>
        <div className="stack">
          {minePosts.length === 0 && <div className="empty">{t("studio.emptyPosts")}</div>}
          {minePosts.map((post) => (
            <Link key={post.id} to={`/c/${user.handle}/posts/${post.id}`} className="line">
              <div>
                <strong>{post.title}</strong>
                <p className="muted">
                  {t("studio.postMeta", { vis: rank(post.minRank) })} · {formatDate(post.createdAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function AccessFields({
  usePlay,
  setUsePlay,
  allowDownload,
  setAllowDownload,
  allowPreview,
  setAllowPreview,
  previewMode,
  setPreviewMode,
  previewLimit,
  setPreviewLimit,
  previewBody,
  setPreviewBody,
}: {
  usePlay: boolean;
  setUsePlay: (value: boolean) => void;
  allowDownload: boolean;
  setAllowDownload: (value: boolean) => void;
  allowPreview: boolean;
  setAllowPreview: (value: boolean) => void;
  previewMode: "content" | "progress";
  setPreviewMode: (value: "content" | "progress") => void;
  previewLimit: string;
  setPreviewLimit: (value: string) => void;
  previewBody: string;
  setPreviewBody: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="choice-list">
        <label className="check">
          <input
            type="checkbox"
            checked={usePlay}
            onChange={(event) => {
              setUsePlay(event.target.checked);
              if (!event.target.checked) setAllowPreview(false);
            }}
          />
          {t("studio.play")}
        </label>
        <p className="fineprint">{t("studio.playHint")}</p>
        <label className="check">
          <input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} />
          {t("studio.download")}
        </label>
        <p className="fineprint">{t("studio.accessHint")}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={allowPreview}
            disabled={!usePlay}
            onChange={(event) => setAllowPreview(event.target.checked)}
          />
          {t("studio.preview")}
        </label>
        <p className="fineprint">{t("studio.previewHint")}</p>
      </div>
      {usePlay && allowPreview && (
        <>
          <label>
            {t("studio.previewMode")}
            <select
              name="previewMode"
              value={previewMode}
              onChange={(event) => setPreviewMode(event.target.value === "content" ? "content" : "progress")}
            >
              <option value="progress">{t("studio.previewProgress")}</option>
              <option value="content">{t("studio.previewContent")}</option>
            </select>
          </label>
          {previewMode === "progress" ? (
            <label>
              {t("studio.previewLimit")}
              <input
                name="previewLimit"
                type="number"
                min="1"
                max="20000"
                step="1"
                value={previewLimit}
                onChange={(event) => setPreviewLimit(event.target.value)}
              />
              <span className="fineprint">{t("studio.previewLimitPh")}</span>
            </label>
          ) : (
            <label>
              {t("studio.previewBody")}
              <textarea
                name="previewBody"
                rows={4}
                value={previewBody}
                placeholder={t("studio.previewBodyPh")}
                onChange={(event) => setPreviewBody(event.target.value)}
              />
            </label>
          )}
        </>
      )}
    </>
  );
}

function WorkEditor({ product, sold }: { product: Product; sold: number }) {
  const { t, phrase } = useI18n();
  const { user, updateProduct, deleteProduct } = useStore();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filename, setFilename] = useState("");
  const [usePlay, setUsePlay] = useState(product.allowPlay);
  const [allowDownload, setAllowDownload] = useState(product.allowDownload);
  const [allowPreview, setAllowPreview] = useState(product.allowPreview && product.allowPlay);
  const [previewMode, setPreviewMode] = useState<"content" | "progress">(product.previewMode === "content" ? "content" : "progress");
  const [previewLimit, setPreviewLimit] = useState(String(product.previewLimit || 1));
  const [previewBody, setPreviewBody] = useState(product.previewBody);
  const [listed, setListed] = useState(product.listed);
  if (!user) return null;

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "");
    const price = Number(data.get("price") ?? 0);
    const tags = String(data.get("tags") ?? "");
    const file = pickedFile(data.get("file"));
    const cover = pickedFile(data.get("cover"));
    const problem =
      (Array.from(title.trim()).length < 2 ? "err.product.title" : "") ||
      (!Number.isFinite(price) || price < 1 || price > 9999 ? "err.price" : "") ||
      tagProblem(tags) ||
      (!usePlay && !allowDownload ? "err.open" : "") ||
      (allowPreview && !usePlay ? "err.preview.play" : "") ||
      (allowPreview && previewMode === "content" && Array.from(previewBody.trim()).length < 1 ? "err.preview.body" : "") ||
      (allowPreview && previewMode === "progress" && (!Number.isInteger(Number(previewLimit)) || Number(previewLimit) < 1 || Number(previewLimit) > 20000)
        ? "err.preview.limit"
        : "") ||
      (file && file.size > MAX_FILE ? "err.file.size" : "") ||
      (cover && cover.size > MAX_COVER ? "err.cover.size" : "") ||
      (cover && !coverOk(cover) ? "err.cover.type" : "") ||
      (usePlay && file && !fileCanPlay(file) ? "err.play.file" : "");
    if (problem) {
      setError(t(problem));
      return;
    }
    setBusy(true);
    setError("");
    const result = await updateProduct({
      productId: product.id,
      title,
      description: String(data.get("description") ?? ""),
      price,
      priceCurrency: String(data.get("priceCurrency") ?? product.priceCurrency ?? "cny"),
      kind: String(data.get("kind") ?? product.kind),
      includes: String(data.get("includes") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      tags,
      play: usePlay,
      download: allowDownload,
      preview: allowPreview,
      previewMode,
      previewLimit: Number(previewLimit),
      previewBody,
      listed,
      file,
      cover,
    });
    setBusy(false);
    if (result) setError(result);
    else setFilename("");
  };

  const onDelete = async () => {
    if (busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    const result = await deleteProduct(product.id);
    setBusy(false);
    if (result) {
      setConfirmDelete(false);
      setError(result);
    }
  };

  return (
    <div className="panel work-edit" id={`work-${product.id}`}>
      <div className="work-head">
        <Cover id={product.coverKey} src={coverSrc(product)} ratio="1 / 1" className="work-cover" />
        <div>
          {listed ? (
            <Link to={`/c/${user.handle}/shop/${product.id}`}>
              <strong>{product.title}</strong>
            </Link>
          ) : (
            <strong>{product.title}</strong>
          )}
          <p className="muted">
            {phrase(product.kind)} · {fiat(product.price, product.priceCurrency)} · {coinText(product.coinPrice)} · {t("studio.sold", { n: sold })}
            {product.playFormat ? ` · ${t("product.viaPlay")}` : ""}
            {product.allowDownload ? ` · ${t("product.canDownload")}` : product.playFormat ? ` · ${t("product.playOnly")}` : ""}
            {product.allowPreview ? ` · ${t("product.preview")}` : ""}
          </p>
          {!product.listed && <span className="pill">{t("studio.offShelf")}</span>}
        </div>
      </div>
      <form className="studio-form" onSubmit={onSave}>
        <label>
          {t("studio.productName")}
          <input name="title" defaultValue={product.title} required />
        </label>
        <label>
          {t("studio.kind")}
          <select name="kind" defaultValue={product.kind}>
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {phrase(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("studio.price")}
          <input name="price" type="number" min="1" max="9999" step="0.01" defaultValue={product.price} required />
        </label>
        <label>
          价格货币 / Price currency
          <select name="priceCurrency" defaultValue={product.priceCurrency || "cny"}>
            <option value="usd">USD — US Dollar</option>
            <option value="cny">CNY — Chinese Yuan</option>
            <option value="gbp">GBP — Pound Sterling</option>
            <option value="eur">EUR — Euro</option>
            <option value="jpy">JPY — Japanese Yen</option>
            <option value="hkd">HKD — Hong Kong Dollar</option>
            <option value="sgd">SGD — Singapore Dollar</option>
            <option value="cad">CAD — Canadian Dollar</option>
            <option value="aud">AUD — Australian Dollar</option>
          </select>
        </label>
        <p className="fineprint">法币原价固定保存；商城硬币价按最新汇率换算，不会反向修改法币原价。 / Fiat price stays fixed; the marketplace coin price follows the latest FX rate.</p>
        <label>
          {t("studio.includes")}
          <input name="includes" defaultValue={product.includes.join("，")} placeholder={t("studio.includesPh")} />
        </label>
        <label>
          {t("studio.workTags")}
          <input name="tags" defaultValue={product.tags.join("，")} placeholder={t("studio.workTagsPh")} />
        </label>
        <label>
          {t("studio.desc")}
          <textarea name="description" rows={4} defaultValue={product.description} />
        </label>
        <label>
          {t("studio.cover")}
          <input name="cover" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
          <span className="fineprint">{t("studio.coverHint")}</span>
        </label>
        <label>
          {t("studio.replaceFile")}
          <input
            name="file"
            type="file"
            onChange={(event) => {
              const next = event.currentTarget.files?.[0];
              setFilename(next?.name ?? "");
              if (next && PREVIEW_DEFAULTS.has(previewLimit)) setPreviewLimit(previewDefault(next));
            }}
          />
          <span className="fineprint">
            {t("studio.fileHint")}
            {filename ? ` · ${filename}` : ""}
          </span>
        </label>
        <AccessFields
          usePlay={usePlay}
          setUsePlay={setUsePlay}
          allowDownload={allowDownload}
          setAllowDownload={setAllowDownload}
          allowPreview={allowPreview}
          setAllowPreview={setAllowPreview}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          previewLimit={previewLimit}
          setPreviewLimit={setPreviewLimit}
          previewBody={previewBody}
          setPreviewBody={setPreviewBody}
        />
        <label className="check">
          <input type="checkbox" checked={listed} onChange={(event) => setListed(event.target.checked)} />
          {t("studio.onShelf")}
        </label>
        <FormError message={error} />
        {confirmDelete && <p className="banner-note">{t("studio.deleteNote")}</p>}
        <div className="hero-actions">
          <button className="btn btn-dark" type="submit" disabled={busy}>
            {busy ? t("common.wait") : t("studio.saveWork")}
          </button>
          <button className="btn btn-line" type="button" disabled={busy} onClick={onDelete}>
            {confirmDelete ? t("studio.deleteConfirm") : t("studio.delete")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function StudioWorks() {
  const { t, phrase } = useI18n();
  const { user, products, publishProduct, desk } = useStore();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState("");
  const [usePlay, setUsePlay] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowPreview, setAllowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<"content" | "progress">("progress");
  const [previewLimit, setPreviewLimit] = useState("1");
  const [previewBody, setPreviewBody] = useState("");
  if (!user) return null;
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const onProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "");
    const price = Number(data.get("price") ?? 0);
    const tags = String(data.get("tags") ?? "");
    const file = pickedFile(data.get("file"));
    const cover = pickedFile(data.get("cover"));
    const limit = Number(previewLimit);
    const problem =
      (Array.from(title.trim()).length < 2 ? "err.product.title" : "") ||
      (!Number.isFinite(price) || price < 1 || price > 9999 ? "err.price" : "") ||
      tagProblem(tags) ||
      (!file ? "err.file" : "") ||
      (!usePlay && !allowDownload ? "err.open" : "") ||
      (allowPreview && !usePlay ? "err.preview.play" : "") ||
      (allowPreview && previewMode === "content" && Array.from(previewBody.trim()).length < 1 ? "err.preview.body" : "") ||
      (allowPreview && previewMode === "progress" && (!Number.isInteger(limit) || limit < 1 || limit > 20000) ? "err.preview.limit" : "") ||
      (file && file.size > MAX_FILE ? "err.file.size" : "") ||
      (cover && cover.size > MAX_COVER ? "err.cover.size" : "") ||
      (cover && !coverOk(cover) ? "err.cover.type" : "") ||
      (usePlay && file && !fileCanPlay(file) ? "err.play.file" : "");
    if (problem) {
      setError(t(problem));
      return;
    }
    setBusy(true);
    setError("");
    const result = await publishProduct({
      title,
      description: String(data.get("description") ?? ""),
      price,
      priceCurrency: String(data.get("priceCurrency") ?? "cny"),
      kind: String(data.get("kind") ?? ""),
      includes: String(data.get("includes") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      tags,
      play: usePlay,
      download: allowDownload,
      preview: allowPreview,
      previewMode,
      previewLimit: limit,
      previewBody,
      file,
      cover,
    });
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    form.reset();
    setFilename("");
    setUsePlay(true);
    setAllowDownload(true);
    setAllowPreview(false);
    setPreviewMode("progress");
    setPreviewLimit("1");
    setPreviewBody("");
    setError("");
  };
  return (
    <>
      <form className="panel studio-form" onSubmit={onProduct}>
        <h2>{t("studio.newProduct")}</h2>
        <label>
          {t("studio.productName")}
          <input name="title" required />
        </label>
        <label>
          {t("studio.kind")}
          <select name="kind" defaultValue="数字作品">
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {phrase(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("studio.price")}
          <input name="price" type="number" min="1" max="9999" step="0.01" required />
        </label>
        <label>
          价格货币 / Price currency
          <select name="priceCurrency" defaultValue="cny">
            <option value="usd">USD — US Dollar</option>
            <option value="cny">CNY — Chinese Yuan</option>
            <option value="gbp">GBP — Pound Sterling</option>
            <option value="eur">EUR — Euro</option>
            <option value="jpy">JPY — Japanese Yen</option>
            <option value="hkd">HKD — Hong Kong Dollar</option>
            <option value="sgd">SGD — Singapore Dollar</option>
            <option value="cad">CAD — Canadian Dollar</option>
            <option value="aud">AUD — Australian Dollar</option>
          </select>
        </label>
        <p className="fineprint">法币原价固定保存；商城硬币价按最新汇率换算，不会反向修改法币原价。 / Fiat price stays fixed; the marketplace coin price follows the latest FX rate.</p>
        <label>
          {t("studio.includes")}
          <input name="includes" placeholder={t("studio.includesPh")} />
        </label>
        <label>
          {t("studio.workTags")}
          <input name="tags" placeholder={t("studio.workTagsPh")} />
        </label>
        <label>
          {t("studio.desc")}
          <textarea name="description" rows={4} />
        </label>
        <label>
          {t("studio.cover")}
          <input name="cover" type="file" accept="image/png,image/jpeg,image/gif,image/webp" />
          <span className="fineprint">{t("studio.coverHint")}</span>
        </label>
        <label>
          {t("studio.file")}
          <input
            name="file"
            type="file"
            required
            onChange={(event) => {
              const next = event.currentTarget.files?.[0];
              setFilename(next?.name ?? "");
              if (next && PREVIEW_DEFAULTS.has(previewLimit)) setPreviewLimit(previewDefault(next));
            }}
          />
          <span className="fineprint">
            {t("studio.fileHint")}
            {filename ? ` · ${filename}` : ""}
          </span>
        </label>
        <AccessFields
          usePlay={usePlay}
          setUsePlay={setUsePlay}
          allowDownload={allowDownload}
          setAllowDownload={setAllowDownload}
          allowPreview={allowPreview}
          setAllowPreview={setAllowPreview}
          previewMode={previewMode}
          setPreviewMode={setPreviewMode}
          previewLimit={previewLimit}
          setPreviewLimit={setPreviewLimit}
          previewBody={previewBody}
          setPreviewBody={setPreviewBody}
        />
        <FormError message={error} />
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? t("common.wait") : t("studio.newProduct")}
        </button>
      </form>
      <section className="section">
        <h2>{t("studio.listed")}</h2>
        <div className="stack">
          {mineProducts.length === 0 && <div className="empty">{t("studio.emptyWorks")}</div>}
          {mineProducts.map((product) => {
            const sold = desk?.orders.filter((order) => order.kind === "product" && order.targetId === product.id).length ?? 0;
            return (
              <WorkEditor
                key={`${product.id}:${product.title}:${product.price}:${product.description}:${product.kind}:${product.listed}:${product.coverAt}:${product.tags.join(",")}:${product.playFormat}:${product.allowPlay}:${product.allowDownload}:${product.allowPreview}:${product.previewMode}:${product.previewLimit}:${product.previewBody}:${product.includes.join(",")}`}
                product={product}
                sold={sold}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}

export function StudioTiers() {
  const { t, phrase } = useI18n();
  const { user, tiers, updateTier } = useStore();
  const [error, setError] = useState("");
  if (!user) return null;
  const plans = tiers.filter((tier) => tier.creatorId === user.handle);
  const onSave = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await updateTier({
      id,
      name: String(data.get("name") ?? ""),
      price: Number(data.get("price") ?? 0),
      priceCurrency: String(data.get("priceCurrency") ?? "cny"),
      blurb: String(data.get("blurb") ?? ""),
      perks: String(data.get("perks") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
    setError(result ?? "");
  };
  return (
    <>
      <p className="desk-note">{t("studio.tierNote")}</p>
      {plans.map((tier) => (
        <form className="panel studio-form" key={`${tier.id}-${tier.name}-${tier.price}`} onSubmit={(event) => onSave(event, tier.id)}>
          <h2>{t("studio.tierRank", { n: tier.rank })}</h2>
          <label>
            {t("auth.name")}
            <input name="name" defaultValue={tier.name} required />
          </label>
          <label>
            {t("studio.tierPrice")}
            <input name="price" type="number" min="0.01" max="9999" step="0.01" defaultValue={tier.price} required />
          </label>
          <label>
            价格货币 / Price currency
            <select name="priceCurrency" defaultValue={tier.priceCurrency || "cny"}>
              <option value="usd">USD — US Dollar</option>
              <option value="cny">CNY — Chinese Yuan</option>
              <option value="gbp">GBP — Pound Sterling</option>
              <option value="eur">EUR — Euro</option>
              <option value="jpy">JPY — Japanese Yen</option>
              <option value="hkd">HKD — Hong Kong Dollar</option>
              <option value="sgd">SGD — Singapore Dollar</option>
              <option value="cad">CAD — Canadian Dollar</option>
              <option value="aud">AUD — Australian Dollar</option>
            </select>
          </label>
          <p className="fineprint">法币原价固定保存；会员硬币价按最新汇率换算。 / Fiat price stays fixed; the coin price follows the latest FX rate.</p>
          <label>
            {t("studio.tierBlurb")}
            <textarea name="blurb" rows={3} defaultValue={tier.blurb} />
          </label>
          <label>
            {t("studio.tierPerks")}
            <input name="perks" defaultValue={tier.perks.join("，")} placeholder={t("studio.tierPerksPh")} />
          </label>
          <p className="muted">
            {phrase(tier.name)} · {fiat(tier.price, tier.priceCurrency)} · {coinText(tier.coinPrice)}
            {t("common.per30")}
          </p>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-dark" type="submit">
            {t("studio.tierSave")}
          </button>
        </form>
      ))}
    </>
  );
}

const PAYOUT_COUNTRIES = ["AT", "AU", "BE", "CA", "CH", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "IE", "IT", "JP", "LU", "NL", "NO", "NZ", "PL", "PT", "SE", "SG", "US"];
const IBAN_COUNTRIES = new Set(["AT", "BE", "CH", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "LU", "NL", "NO", "PL", "PT", "SE"]);

function PayoutPanel() {
  const { t, lang } = useI18n();
  const { desk, savePayout } = useStore();
  const [params] = useSearchParams();
  const [country, setCountry] = useState("");
  const [holder, setHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routing, setRouting] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [transit, setTransit] = useState("");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const region = new Intl.DisplayNames([lang === "zh" ? "zh-CN" : lang === "zh-Hant" ? "zh-TW" : lang], { type: "region" });
  const next = desk?.nextPayout ? utcStamp(new Date(desk.nextPayout)) : "";
  const method = desk?.payoutMethod ?? "";
  const started = Boolean(desk?.payoutStarted);
  const kind = IBAN_COUNTRIES.has(country) ? "iban" : country;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await savePayout({ country, holder, accountNumber, routing, bankCode, branchCode, transit, institution });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAccountNumber("");
    setRouting("");
    setBankCode("");
    setBranchCode("");
    setTransit("");
    setInstitution("");
  };
  return (
    <section className="panel payout-panel">
      <h2>{t("studio.payout")}</h2>
      <p className="muted">{t("studio.payoutLead")}</p>
      {method ? <p>{t("studio.payoutSet", { method })}</p> : <p>{t("studio.payoutUnset")}</p>}
      {desk?.payoutReady ? <p>{t("studio.payoutReady")}</p> : started ? <p className="muted">{t("studio.payoutWait")}</p> : null}
      <p>{t("studio.payoutPending", { amount: yuan(desk?.pending ?? 0) })}</p>
      {next && <p>{t("studio.payoutFriday", { time: next })}</p>}
      {params.get("payout") === "return" && <p className="muted">{t("studio.payoutReturn")}</p>}
      {params.get("payout") === "error" && <p className="error">{t("studio.payoutError")}</p>}
      <form onSubmit={save}>
        <label>
          {t("studio.payoutCountry")}
          <select value={country} required onChange={(event) => setCountry(event.target.value)}>
            <option value="" disabled>
              {t("studio.payoutCountry")}
            </option>
            {PAYOUT_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {region.of(code)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("studio.payoutHolder")}
          <input value={holder} required autoComplete="off" onChange={(event) => setHolder(event.target.value)} />
        </label>
        <label>
          {t(kind === "iban" ? "studio.payoutIban" : "studio.payoutAccount")}
          <input value={accountNumber} required autoComplete="off" spellCheck={false} onChange={(event) => setAccountNumber(event.target.value)} />
        </label>
        {(kind === "GB" || kind === "AU" || kind === "US") && (
          <label>
            {t(kind === "GB" ? "studio.payoutSort" : kind === "AU" ? "studio.payoutBsb" : "studio.payoutRouting")}
            <input value={routing} required autoComplete="off" spellCheck={false} inputMode="numeric" onChange={(event) => setRouting(event.target.value)} />
          </label>
        )}
        {(kind === "HK" || kind === "JP" || kind === "SG") && (
          <>
            <label>
              {t("studio.payoutBankCode")}
              <input value={bankCode} required autoComplete="off" spellCheck={false} inputMode="numeric" onChange={(event) => setBankCode(event.target.value)} />
            </label>
            <label>
              {t("studio.payoutBranch")}
              <input value={branchCode} required autoComplete="off" spellCheck={false} inputMode="numeric" onChange={(event) => setBranchCode(event.target.value)} />
            </label>
          </>
        )}
        {kind === "CA" && (
          <>
            <label>
              {t("studio.payoutTransit")}
              <input value={transit} required autoComplete="off" spellCheck={false} inputMode="numeric" onChange={(event) => setTransit(event.target.value)} />
            </label>
            <label>
              {t("studio.payoutInstitution")}
              <input value={institution} required autoComplete="off" spellCheck={false} inputMode="numeric" onChange={(event) => setInstitution(event.target.value)} />
            </label>
          </>
        )}
        <button className="btn btn-dark" type="submit" disabled={busy}>
          {busy ? t("common.wait") : t(method ? "studio.payoutUpdate" : "studio.payoutStart")}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function StudioPayout() {
  return <PayoutPanel />;
}

export function StudioOrders() {
  const { t, phrase } = useI18n();
  const { desk } = useStore();
  const orders = desk?.orders ?? [];
  const members = desk?.members ?? [];
  return (
    <>
      <p className="desk-note">
        <Link to="/studio/payout" className="btn btn-line">
          {t("studio.payoutGo")}
        </Link>
      </p>
      <div className="studio-stats">
        <div>
          <strong>{orders.length}</strong>
          <span>{t("studio.orders")}</span>
        </div>
        <div>
          <strong>{yuan(desk?.gross ?? 0)}</strong>
          <span>{t("studio.gross")}</span>
        </div>
        <div>
          <strong>{yuan(desk?.fee ?? 0)}</strong>
          <span>{t("studio.fee")}</span>
        </div>
        <div>
          <strong>{yuan(desk?.net ?? 0)}</strong>
          <span>{t("studio.net")}</span>
        </div>
      </div>
      <p className="desk-note">{t("studio.feeNote")}</p>
      <section className="section">
        <h2>{t("studio.orders")}</h2>
        <div className="order-table">
          {orders.length === 0 && <div className="empty">{t("studio.emptyOrders")}</div>}
          {orders.map((order) => (
            <article key={order.id} className="order-row">
              <span className="pill">{order.kind === "membership" ? t("studio.orderMember") : t("studio.orderProduct")}</span>
              <div>
                <strong>{phrase(order.title)}</strong>
                <p className="muted">{t("studio.buyer", { name: order.buyer })}</p>
              </div>
              <span>{fiat(order.amount, order.currency)} · {coinText(order.coinAmount)}</span>
              <span className="muted">{formatDate(order.createdAt)}</span>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>{t("studio.members")}</h2>
        <div className="order-table">
          {members.length === 0 && <div className="empty">{t("studio.emptyMembers")}</div>}
          {members.map((member) => {
            const active = new Date(member.expiresAt).getTime() > Date.now();
            return (
              <article key={`${member.handle}-${member.expiresAt}`} className="order-row">
                <span className="pill">{active ? t("studio.active") : t("studio.ended")}</span>
                <div>
                  <strong>{member.name}</strong>
                  <p className="muted">@{member.handle}</p>
                </div>
                <span>{phrase(member.tier)}</span>
                <span className="muted">{t("studio.expires", { date: formatDate(member.expiresAt) })}</span>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function StudioGuide() {
  const { t } = useI18n();
  return (
    <article className="panel prose-page studio-form">
      <h2>{t("studio.guideH")}</h2>
      <p>{t("studio.guideP1")}</p>
      <p>{t("studio.guideP2")}</p>
      <p>{t("studio.guideP3")}</p>
      <p>{t("studio.guideP4")}</p>
      <p>{t("studio.guideP5")}</p>
      <p>{t("studio.guideP6")}</p>
    </article>
  );
}
