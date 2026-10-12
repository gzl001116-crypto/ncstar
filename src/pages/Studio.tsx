import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { CATEGORIES, type Category } from "../types";
import { formatDate, yuan } from "../utils";

const KINDS = ["数字作品", "插画", "音乐", "设计", "摄影", "写作", "图案"] as const;

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

export function MyPage() {
  const { t } = useI18n();
  useTitle(t("my.page"));
  const { ready, user, creatorById, openStudio } = useStore();
  const navigate = useNavigate();
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
  if (!user.isCreator || !creator) {
    return (
      <div className="page">
        <header className="page-intro">
          <p className="kicker">{t("studio.navProfile")}</p>
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
        <p className="kicker">{t("studio.navProfile")}</p>
        <h1>{t("my.page")}</h1>
        <Link to={`/c/${creator.handle}`} className="btn btn-line">
          {t("studio.viewPage")}
        </Link>
      </header>
      <StudioProfile />
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

export function StudioWorks() {
  const { t, phrase } = useI18n();
  const { user, products, publishProduct, desk } = useStore();
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
          {mineProducts.map((product) => {
            const sold = desk?.orders.filter((order) => order.kind === "product" && order.targetId === product.id).length ?? 0;
            return (
              <Link key={product.id} to={`/c/${user.handle}/shop/${product.id}`} className="line">
                <div>
                  <strong>{product.title}</strong>
                  <p className="muted">
                    {phrase(product.kind)} · {yuan(product.price)} · {t("studio.sold", { n: sold })}
                  </p>
                </div>
              </Link>
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
            <input name="price" type="number" min="1" max="9999" step="1" defaultValue={tier.price} required />
          </label>
          <label>
            {t("studio.tierBlurb")}
            <textarea name="blurb" rows={3} defaultValue={tier.blurb} />
          </label>
          <label>
            {t("studio.tierPerks")}
            <input name="perks" defaultValue={tier.perks.join("，")} placeholder={t("studio.tierPerksPh")} />
          </label>
          <p className="muted">
            {phrase(tier.name)} · {yuan(tier.price)}
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

export function StudioOrders() {
  const { t, phrase } = useI18n();
  const { desk } = useStore();
  const orders = desk?.orders ?? [];
  const members = desk?.members ?? [];
  return (
    <>
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
              <span>{yuan(order.amount)}</span>
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
