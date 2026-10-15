import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Cover, coverSrc } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { coinText, fiat } from "../utils";

export function Checkout() {
  const { t, phrase, lang } = useI18n();
  useTitle(t("checkout.title"));
  const { user, productById, creatorById, tierById, removeFromCart, checkoutCart, checkoutTier, checkoutProduct, completeCheckout, activeMembership } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const directId = params.get("product") ?? "";
  const sessionId = params.get("session_id") ?? "";
  const canceled = params.get("pay") === "cancel";
  const tier = tierById(params.get("tier") ?? "");
  const creator = tier ? creatorById(tier.creatorId) : undefined;
  const existing = tier ? activeMembership(tier.creatorId) : undefined;

  useEffect(() => {
    if (!sessionId || !user) return;
    let stopped = false;
    setBusy(true);
    setError("");
    const confirm = async () => {
      for (let attempt = 0; attempt < 20 && !stopped; attempt += 1) {
        const result = await completeCheckout(sessionId);
        if (stopped) return;
        if (!result.error) {
          const flash =
            result.code === "toast.member" && result.name
              ? t("checkout.flashMember", { name: phrase(result.name) })
              : t("checkout.flashCart");
          navigate("/library", { replace: true, state: { flash } });
          return;
        }
        if (result.code !== "err.pay.pending" || attempt === 19) {
          setBusy(false);
          setError(result.error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    };
    void confirm();
    return () => {
      stopped = true;
    };
  }, [sessionId, user]);

  if (!user) {
    const next = `/checkout${params.toString() ? `?${params.toString()}` : ""}`;
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>{t("checkout.loginH")}</h1>
          <p>{t("checkout.loginP")}</p>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="btn btn-dark">
            {t("checkout.goLogin")}
          </Link>
        </div>
      </div>
    );
  }

  const direct = directId ? productById(directId) : undefined;
  const lines = direct
    ? [direct]
    : user.cart
    .map((id) => productById(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.creatorId !== user.handle);

  const totalCoins = tier ? tier.coinPrice ?? 0 : lines.reduce((sum, item) => sum + (item.coinPrice ?? 0), 0);

  const pay = async () => {
    setBusy(true);
    setError("");
    const result = tier ? await checkoutTier(tier.id, lang) : direct ? await checkoutProduct(direct.id, lang) : await checkoutCart(lang);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    setBusy(false);
    navigate("/library", {
      state: { flash: tier ? t("checkout.flashMember", { name: phrase(tier.name) }) : t("checkout.flashCart") },
    });
  };

  return (
    <div className="page checkout">
      <div>
        <p className="kicker">{t("checkout.kicker")}</p>
        <h1>{tier ? t("checkout.member") : t("cart")}</h1>
        <p className="fineprint">
          {t("checkout.note")} <Link to="/terms">{t("footer.terms")}</Link>
          <span> · </span>
          <Link to="/privacy">{t("footer.privacy")}</Link>
          <span> · </span>
          <Link to="/tokushoho">{t("footer.tokushoho")}</Link>
        </p>
        {tier && creator ? (
          <article className="line">
            <div>
              <strong>
                {creator.name} · {phrase(tier.name)}
              </strong>
              <p>{phrase(tier.blurb)}</p>
              <p className="muted">{existing ? t("checkout.renewNote") : t("checkout.freshNote")}</p>
            </div>
            <span className="price">{fiat(tier.price, tier.priceCurrency)}</span>
            <span className="muted">{coinText(tier.coinPrice)}</span>
          </article>
        ) : lines.length === 0 ? (
          <div className="empty">
            {t("checkout.empty")} <Link to="/explore?kind=products">{t("checkout.browse")}</Link>
          </div>
        ) : (
          lines.map((product) => (
            <article key={product.id} className="line">
              <Cover id={product.coverKey} src={coverSrc(product)} ratio="1 / 1" className="line-cover" />
              <div>
                <strong>{product.title}</strong>
                <p className="muted">{creatorById(product.creatorId)?.name}</p>
                <button type="button" className="text-btn" onClick={() => removeFromCart(product.id)}>
                  {t("common.remove")}
                </button>
              </div>
              <span className="price">{fiat(product.price, product.priceCurrency)}</span>
              <span className="muted">{coinText(product.coinPrice)}</span>
            </article>
          ))
        )}
      </div>
      <aside className="pay-card">
        <h2>应付硬币 / Coins due: {totalCoins.toFixed(2)} 🪙</h2>
        <p className="muted">余额 / Balance: {(user.coins ?? 0).toFixed(2)} 🪙</p>
        {canceled && !error && <p className="banner-note">{t("checkout.canceled")}</p>}
        {sessionId && busy && <p className="muted">{t("checkout.returning")}</p>}
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-dark btn-block" disabled={busy || (!tier && lines.length === 0) || totalCoins <= 0 || (user.coins ?? 0) < totalCoins} onClick={() => void pay()}>
          {busy ? t("common.wait") : "确认并支付硬币 / Pay with coins"}
        </button>
        {(user.coins ?? 0) < totalCoins && <p className="muted">硬币余额不足，请先前往硬币中心充值。</p>}
        <p className="fineprint">作品、会员及创作者支持均使用硬币支付。充值通过 Stripe 完成。</p>
      </aside>
    </div>
  );
}
