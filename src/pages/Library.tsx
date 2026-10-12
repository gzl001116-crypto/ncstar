import { Link, useLocation } from "react-router-dom";
import { Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { daysLeft, downloadText, formatDate, yuan } from "../utils";

export function Library() {
  useTitle("我的库 · 星页");
  const { user, productById, creatorById, tierById } = useStore();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>登录后查看我的库</h1>
          <Link to="/login?next=/library" className="btn btn-dark">
            登录
          </Link>
        </div>
      </div>
    );
  }

  const save = async (productId: string, title: string) => {
    const response = await fetch(`/api/download?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin" });
    if (!response.ok) return;
    downloadText(title, await response.text());
  };

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">我的库</p>
        <h1>{user.name}的支持</h1>
      </header>
      {flash && <p className="banner-note">{flash}</p>}
      <section className="section">
        <h2>生效中的会员</h2>
        <div className="stack">
          {user.memberships.length === 0 && <div className="empty">还没有开通会员。</div>}
          {user.memberships.map((item) => {
            const tier = tierById(item.tierId);
            const creator = creatorById(item.creatorId);
            const left = daysLeft(item.expiresAt);
            return (
              <article key={`${item.creatorId}-${item.tierId}`} className="line">
                <div>
                  <strong>
                    {creator?.name} · {tier?.name ?? "会员"}
                  </strong>
                  <p className="muted">
                    {left > 0 ? `还剩 ${left} 天` : "已到期"} · 至 {formatDate(item.expiresAt)} · {yuan(tier?.price ?? 0)} / 30 天
                  </p>
                </div>
                <Link to={`/c/${item.creatorId}?tab=member`} className="btn btn-line">
                  {left > 0 ? "查看" : "重新开通"}
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <section className="section">
        <h2>已购作品</h2>
        <div className="cards">
          {user.library.length === 0 && <div className="empty">库里还没有作品。</div>}
          {user.library.map((item) => {
            const product = productById(item.productId);
            if (!product) return null;
            const creator = creatorById(product.creatorId);
            return (
              <article key={item.productId} className="card">
                <Cover id={product.coverKey} ratio="16 / 10" />
                <div className="card-body">
                  <h3>{product.title}</h3>
                  <p className="muted">
                    {creator?.name} · {formatDate(item.purchasedAt)}
                  </p>
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => save(product.id, product.title)}
                  >
                    下载
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
