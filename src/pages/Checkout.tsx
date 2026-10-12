import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { creatorShare, yuan } from "../utils";

export function Checkout() {
  useTitle("结账 · 星页");
  const { user, productById, creatorById, tierById, removeFromCart, checkoutCart, checkoutTier, activeMembership } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [method, setMethod] = useState("");
  const [error, setError] = useState("");
  const tier = tierById(params.get("tier") ?? "");
  const creator = tier ? creatorById(tier.creatorId) : undefined;
  const existing = tier ? activeMembership(tier.creatorId) : undefined;

  if (!user) {
    const next = `/checkout${params.get("tier") ? `?tier=${params.get("tier")}` : ""}`;
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>先登录，再结账</h1>
          <p>这是演示结账，不会产生真实扣款。</p>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="btn btn-dark">
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const lines = user.cart
    .map((id) => productById(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.creatorId !== user.handle);

  const total = tier ? tier.price : lines.reduce((sum, item) => sum + item.price, 0);

  const pay = () => {
    if (!method) {
      setError("请选择一种演示支付方式");
      return;
    }
    const result = tier ? checkoutTier(tier.id) : checkoutCart();
    if (result) {
      setError(result);
      return;
    }
    navigate("/library", { state: { flash: tier ? `已开通「${tier.name}」，有效期 30 天。` : "作品已放进我的库。" } });
  };

  return (
    <div className="page checkout">
      <div>
        <p className="kicker">演示结账</p>
        <h1>{tier ? "开通会员" : "购物袋"}</h1>
        <p className="fineprint">不会产生真实扣款。选择任一方式都可以完成这笔演示订单。</p>
        {tier && creator ? (
          <article className="line">
            <div>
              <strong>
                {creator.name} · {tier.name}
              </strong>
              <p>{tier.blurb}</p>
              <p className="muted">30 天 · 不自动续费{existing ? " · 新的 30 天从今天重新计算" : ""}</p>
            </div>
            <span className="price">{yuan(tier.price)}</span>
          </article>
        ) : lines.length === 0 ? (
          <div className="empty">
            购物袋是空的。
            <Link to="/explore?kind=products">去看看作品</Link>
          </div>
        ) : (
          lines.map((product) => (
            <article key={product.id} className="line">
              <Cover id={product.coverKey} ratio="1 / 1" className="line-cover" />
              <div>
                <strong>{product.title}</strong>
                <p className="muted">{creatorById(product.creatorId)?.name}</p>
                <button type="button" className="text-btn" onClick={() => removeFromCart(product.id)}>
                  移除
                </button>
              </div>
              <span className="price">{yuan(product.price)}</span>
            </article>
          ))
        )}
      </div>
      <aside className="pay-card">
        <h2>应付 {yuan(total)}</h2>
        <p className="muted">创作者合计实收约 {yuan(creatorShare(total))}。</p>
        <div className="methods">
          {[
            ["balance", "演示余额"],
            ["card", "演示银行卡"],
          ].map(([id, label]) => (
            <label key={id} className={method === id ? "method on" : "method"}>
              <input type="radio" name="method" checked={method === id} onChange={() => setMethod(id)} />
              {label}
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-dark btn-block" disabled={!tier && lines.length === 0} onClick={pay}>
          确认支付
        </button>
      </aside>
    </div>
  );
}
