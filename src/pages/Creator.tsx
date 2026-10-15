import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/Cards";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { yuan } from "../utils";
import { NotFound } from "./NotFound";

export function CreatorPage() {
  const { handle = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "posts";
  const { t, phrase, rel, rank, locale } = useI18n();
  const { ready, creators, posts, products, tiers, user, followed, toggleFollow, followerCount, supporterCount, canRead, activeMembership, supportCreator } =
    useStore();
  const navigate = useNavigate();
  const [supportAmount, setSupportAmount] = useState("5");
  const [supportCurrency, setSupportCurrency] = useState("usd");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState("");
  const creator = creators.find((item) => item.handle === handle);
  useTitle(creator ? `${creator.name} · ${t("brand")}` : t("creator.missingTitle"));
  if (!ready) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  if (!creator) return <NotFound />;

  const own = user?.handle === creator.handle;
  const list = posts.filter((post) => post.creatorId === creator.id);
  const shelf = products.filter((product) => product.creatorId === creator.id && product.listed);
  const plans = tiers.filter((tier) => tier.creatorId === creator.id).sort((a, b) => a.rank - b.rank);
  const membership = activeMembership(creator.id);

  const setTab = (next: string) => {
    const query = new URLSearchParams(params);
    if (next === "posts") query.delete("tab");
    else query.set("tab", next);
    setParams(query);
  };

  return (
    <div className="page narrow">
      <Cover id={`${creator.id}-hero`} ratio="16 / 5.2" className="banner" />
      <header className="profile">
        <Avatar name={creator.name} id={creator.id} size={88} stamp={creator.avatarAt} />
        <div className="profile-copy">
          <p className="kicker">
            {phrase(creator.category)} · {phrase(creator.location)}
          </p>
          <h1>{creator.name}</h1>
          <p className="muted">@{creator.handle}</p>
          <p>{phrase(creator.bio)}</p>
          <div className="tag-row">
            {creator.tags.map((tag) => (
              <span key={tag} className="pill">
                {phrase(tag)}
              </span>
            ))}
          </div>
        </div>
        <div className="profile-side">
          <div className="stat-row">
            <div className="stat">
              <strong>{followerCount(creator).toLocaleString(locale)}</strong>
              <span>{t("common.followers")}</span>
            </div>
            <div className="stat">
              <strong>{supporterCount(creator.id).toLocaleString(locale)}</strong>
              <span>{t("common.supporters")}</span>
            </div>
          </div>
          {own ? (
            <Link to="/page" className="btn btn-line">
              {t("creator.edit")}
            </Link>
          ) : (
            <button
              type="button"
              className={followed(creator.id) ? "btn btn-soft" : "btn btn-dark"}
              onClick={() => (user ? toggleFollow(creator.id) : navigate(`/login?next=/c/${creator.handle}`))}
            >
              {followed(creator.id) ? t("creator.following") : t("creator.follow")}
            </button>
          )}
          {!own && (
            <div className="stack" style={{ marginTop: "1rem" }}>
              <strong>支持创作者 / Support creator</strong>
              <div className="row">
                <input aria-label="Support amount" type="number" min="0.01" max="9999" step="0.01" value={supportAmount} onChange={(event) => setSupportAmount(event.target.value)} />
                <select aria-label="Support currency" value={supportCurrency} onChange={(event) => setSupportCurrency(event.target.value)}>
                  <option value="usd">USD</option>
                  <option value="cny">CNY</option>
                  <option value="gbp">GBP</option>
                  <option value="eur">EUR</option>
                  <option value="jpy">JPY</option>
                  <option value="hkd">HKD</option>
                  <option value="sgd">SGD</option>
                  <option value="cad">CAD</option>
                  <option value="aud">AUD</option>
                </select>
              </div>
              <button type="button" className="btn btn-line" disabled={supportBusy || Number(supportAmount) <= 0} onClick={async () => {
                if (!user) { navigate(`/login?next=/c/${creator.handle}`); return; }
                setSupportBusy(true);
                setSupportError("");
                const result = await supportCreator({ creatorId: creator.handle, amount: Number(supportAmount), currency: supportCurrency });
                setSupportBusy(false);
                if (result) setSupportError(result);
              }}>
                {supportBusy ? "处理中…" : "使用硬币支持 / Support with coins"}
              </button>
              {supportError && <p className="error">{supportError}</p>}
              {user && <p className="muted">当前余额 / Balance: {(user.coins ?? 0).toFixed(2)} 🪙</p>}
            </div>
          )}
        </div>
      </header>

      <div className="tabs" role="tablist">
        {[
          ["posts", t("creator.tab.posts")],
          ["shop", t("creator.tab.shop")],
          ["member", t("creator.tab.member")],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <div className="stack">
          {list.length === 0 && <div className="empty">{t("creator.noPosts")}</div>}
          {list.map((post) => (
            <Link key={post.id} to={`/c/${creator.handle}/posts/${post.id}`} className="post-row">
              <Cover id={post.coverKey} ratio="1 / 1" />
              <div>
                <div className="meta">
                  <span className="pill">{canRead(post) ? rank(post.minRank) : t("rank.locked")}</span>
                  <span className="muted">{rel(post.createdAt)}</span>
                </div>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "shop" && (
        <div className="cards">
          {shelf.length === 0 && <div className="empty">{t("creator.shopEmpty")}</div>}
          {shelf.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {tab === "member" && (
        <div className="tier-grid">
          {plans.map((tier) => {
            const unlocks = list.filter((post) => post.minRank > 0 && post.minRank <= tier.rank);
            const files = unlocks.reduce((sum, post) => sum + post.attachments.filter((file) => (file.minRank ?? post.minRank) <= tier.rank).length, 0);
            const current = membership?.tierId === tier.id;
            return (
              <article key={tier.id} className="ticket">
                <p className="kicker">{current ? t("creator.current") : tier.rank === 1 ? t("creator.entry") : t("creator.fuller")}</p>
                <h2>{phrase(tier.name)}</h2>
                <div className="ticket-price">
                  <strong>{yuan(tier.price)}</strong>
                  <span>{t("common.per30")}</span>
                </div>
                <p>{phrase(tier.blurb)}</p>
                <p className="muted">{t("creator.unlocks", { posts: unlocks.length, files })}</p>
                <div className="ticket-dash" />
                <ul>
                  {tier.perks.map((perk) => (
                    <li key={perk}>{phrase(perk)}</li>
                  ))}
                </ul>
                <span className="stamp">{t("common.noRenew")}</span>
                {own ? (
                  <span className="muted">{t("creator.ownTier")}</span>
                ) : (
                  <Link to={`/checkout?tier=${tier.id}`} className="btn btn-dark btn-block">
                    {current ? t("creator.renew") : membership ? t("creator.switch") : t("creator.open30")}
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
