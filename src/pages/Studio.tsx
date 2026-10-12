import { FormEvent, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { CATEGORIES, type Category } from "../types";
import { yuan } from "../utils";

function StudioGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  useTitle(t("studio.title"));
  const { ready, user, creatorById, openStudio } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [openError, setOpenError] = useState("");

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
  if (!user.isCreator || !creator) {
    return (
      <div className="page">
        <header className="page-intro">
          <p className="kicker">{t("nav.studio")}</p>
          <h1>{t("studio.openH")}</h1>
        </header>
        <div className="empty">
          <p>{t("studio.openP")}</p>
          {openError && <p className="error">{openError}</p>}
          <button
            type="button"
            className="btn btn-dark"
            onClick={async () => {
              const result = await openStudio();
              setOpenError(result ?? "");
              if (!result) navigate("/studio");
            }}
          >
            {t("home.open")}
          </button>
        </div>
      </div>
    );
  }

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
        <NavLink to="/studio/profile">{t("studio.navProfile")}</NavLink>
        <NavLink to="/studio/posts">{t("studio.navPosts")}</NavLink>
        <NavLink to="/studio/works">{t("studio.navWorks")}</NavLink>
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
  const { user, posts, products, tiers, creatorById, followerCount, supporterCount } = useStore();
  const creator = creatorById(user?.handle ?? "");
  if (!user || !creator) return null;
  const minePosts = posts.filter((post) => post.creatorId === user.handle);
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const plans = tiers.filter((tier) => tier.creatorId === user.handle);
  return (
    <>
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
          <strong>{minePosts.length}</strong>
          <span>{t("common.posts")}</span>
        </div>
        <div>
          <strong>{yuan(mineProducts.reduce((sum, item) => sum + item.price, 0))}</strong>
          <span>{t("studio.priceSum")}</span>
        </div>
        <Link to={`/c/${creator.handle}`} className="btn btn-line">
          {t("studio.viewPage")}
        </Link>
      </div>
      <section className="section">
        <h2>{t("studio.tiers")}</h2>
        <div className="tier-grid">
          {plans.map((tier) => (
            <article key={tier.id} className="ticket">
              <h3>{phrase(tier.name)}</h3>
              <div className="ticket-price">
                <strong>{yuan(tier.price)}</strong>
                <span>{t("common.per30")}</span>
              </div>
              <p>{phrase(tier.blurb)}</p>
            </article>
          ))}
        </div>
      </section>
    </>
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
    });
    setError(result ?? "");
  };
  return (
    <form className="panel studio-form" onSubmit={onProfile}>
      <h2>{t("studio.profile")}</h2>
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
    const data = new FormData(event.currentTarget);
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
    event.currentTarget.reset();
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
                <p className="muted">{t("studio.postMeta", { vis: rank(post.minRank) })}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export function StudioWorks() {
  const { t, phrase } = useI18n();
  const { user, products, publishProduct } = useStore();
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  if (!user) return null;
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const onProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setError(t("err.file"));
      return;
    }
    const result = await publishProduct({
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price") ?? 0),
      kind: String(data.get("kind") ?? ""),
      includes: String(data.get("includes") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      file,
    });
    if (result) {
      setError(result);
      return;
    }
    event.currentTarget.reset();
    setFilename("");
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
          <input name="kind" placeholder={t("studio.kindPh")} />
        </label>
        <label>
          {t("studio.price")}
          <input name="price" type="number" min="1" max="9999" step="1" required />
        </label>
        <label>
          {t("studio.includes")}
          <input name="includes" placeholder={t("studio.includesPh")} />
        </label>
        <label>
          {t("studio.desc")}
          <textarea name="description" rows={4} />
        </label>
        <label>
          {t("studio.file")}
          <input
            name="file"
            type="file"
            required
            onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? "")}
          />
          <span className="fineprint">{filename || t("studio.fileHint")}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark" type="submit">
          {t("studio.newProduct")}
        </button>
      </form>
      <section className="section">
        <h2>{t("studio.listed")}</h2>
        <div className="stack">
          {mineProducts.length === 0 && <div className="empty">{t("studio.emptyWorks")}</div>}
          {mineProducts.map((product) => (
            <Link key={product.id} to={`/c/${user.handle}/shop/${product.id}`} className="line">
              <div>
                <strong>{product.title}</strong>
                <p className="muted">
                  {phrase(product.kind)} · {yuan(product.price)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
