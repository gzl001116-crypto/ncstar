import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { fromNow, visibilityLabel, yuan } from "../utils";
import { NotFound } from "./NotFound";

export function CreatorPage() {
  const { handle = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "posts";
  const { creators, posts, products, tiers, user, followed, toggleFollow, followerCount, supporterCount, canRead, activeMembership } =
    useStore();
  const navigate = useNavigate();
  const creator = creators.find((item) => item.handle === handle);
  useTitle(creator ? `${creator.name} · 星页` : "未找到 · 星页");
  if (!creator) return <NotFound />;

  const own = user?.handle === creator.handle;
  const list = posts.filter((post) => post.creatorId === creator.id);
  const shelf = products.filter((product) => product.creatorId === creator.id);
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
        <Avatar name={creator.name} id={creator.id} size={88} />
        <div className="profile-copy">
          <p className="kicker">
            {creator.category} · {creator.location}
          </p>
          <h1>{creator.name}</h1>
          <p className="muted">@{creator.handle}</p>
          <p>{creator.bio}</p>
          <div className="tag-row">
            {creator.tags.map((tag) => (
              <span key={tag} className="pill">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="profile-side">
          <div className="stat-row">
            <div className="stat">
              <strong>{followerCount(creator).toLocaleString("zh-CN")}</strong>
              <span>关注</span>
            </div>
            <div className="stat">
              <strong>{supporterCount(creator.id).toLocaleString("zh-CN")}</strong>
              <span>支持中</span>
            </div>
          </div>
          {own ? (
            <Link to="/studio" className="btn btn-line">
              编辑创作页
            </Link>
          ) : (
            <button
              type="button"
              className={followed(creator.id) ? "btn btn-soft" : "btn btn-dark"}
              onClick={() => (user ? toggleFollow(creator.id) : navigate(`/login?next=/c/${creator.handle}`))}
            >
              {followed(creator.id) ? "已关注" : "关注"}
            </button>
          )}
        </div>
      </header>

      <div className="tabs" role="tablist">
        {[
          ["posts", "动态"],
          ["shop", "商店"],
          ["member", "会员"],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "posts" && (
        <div className="stack">
          {list.length === 0 && <div className="empty">还没有动态。</div>}
          {list.map((post) => (
            <Link key={post.id} to={`/c/${creator.handle}/posts/${post.id}`} className="post-row">
              <Cover id={post.coverKey} ratio="1 / 1" />
              <div>
                <div className="meta">
                  <span className="pill">{canRead(post) ? visibilityLabel(post.minRank) : "会员可见"}</span>
                  <span className="muted">{fromNow(post.createdAt)}</span>
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
          {shelf.length === 0 && <div className="empty">商店还空着。</div>}
          {shelf.map((product) => (
            <Link key={product.id} to={`/c/${creator.handle}/shop/${product.id}`} className="card">
              <Cover id={product.coverKey} ratio="1 / 1" />
              <div className="card-body">
                <div className="meta">
                  <span className="pill">{product.kind}</span>
                  <span className="price">{yuan(product.price)}</span>
                </div>
                <h3>{product.title}</h3>
                <p className="clamp">{product.description}</p>
              </div>
            </Link>
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
                <p className="kicker">{current ? "当前档位" : `${tier.rank === 1 ? "入门" : "更完整"}`}</p>
                <h2>{tier.name}</h2>
                <div className="ticket-price">
                  <strong>{yuan(tier.price)}</strong>
                  <span>/ 30 天</span>
                </div>
                <p>{tier.blurb}</p>
                <p className="muted">
                  可解锁 {unlocks.length} 篇动态 · {files} 个附件
                </p>
                <div className="ticket-dash" />
                <ul>
                  {tier.perks.map((perk) => (
                    <li key={perk}>{perk}</li>
                  ))}
                </ul>
                <span className="stamp">不自动续费</span>
                {own ? (
                  <span className="muted">这是你的会员档</span>
                ) : (
                  <Link to={`/checkout?tier=${tier.id}`} className="btn btn-dark btn-block">
                    {current ? "再续 30 天" : membership ? "换成此档" : "开通 30 天"}
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
