import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Cover, coverSrc } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { creatorShare, yuan } from "../utils";

export function Checkout() {
  const { t, phrase, lang } = useI18n();
  useTitle(t("checkout.title"));
  const { user, productById, creatorById, tierById, removeFromCart, checkoutCart, checkoutTier, completeCheckout, activeMembership } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const finished = useRef("");
  const sessionId = params.get("session_id") ?? "";
  const canceled = params.get("pay") === "cancel";
  const tier = tierById(params.get("tier") ?? "");
  const creator = tier ? creatorById(tier.creatorId) : undefined;
  const existing = tier ? activeMembership(tier.creatorId) : undefined;

  useEffect(() => {
    if (!sessionId || !user || finished.current === sessionId) return;
    finished.current = sessionId;
    setBusy(true);
    setError("");
    void completeCheckout(sessionId).then((result) => {
      setBusy(false);
      if (result.error) {
        finished.current = "";
        setError(result.error);
        return;
      }
      const flash =
        result.code === "toast.member" && result.name
          ? t("checkout.flashMember", { name: phrase(result.name) })
          : t("checkout.flashCart");
      navigate("/library", { replace: true, state: { flash } });
    });
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

  const lines = user.cart
    .map((id) => productById(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => item.creatorId !== user.handle);

  const total = tier ? tier.price : lines.reduce((sum, item) => sum + item.price, 0);

  const pay = async () => {
    setBusy(true);
    setError("");
    const result = tier ? await checkoutTier(tier.id, lang) : await checkoutCart(lang);
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
            <span className="price">{yuan(tier.price)}</span>
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
              <span className="price">{yuan(product.price)}</span>
            </article>
          ))
        )}
      </div>
      <aside className="pay-card">
        <h2>{t("checkout.due", { amount: yuan(total) })}</h2>
        <p className="muted">{t("checkout.share", { amount: yuan(creatorShare(total)) })}</p>
        {canceled && !error && <p className="banner-note">{t("checkout.canceled")}</p>}
        {sessionId && busy && <p className="muted">{t("checkout.returning")}</p>}
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-dark btn-block" disabled={busy || (!tier && lines.length === 0)} onClick={pay}>
          {busy ? t("common.wait") : t("checkout.confirm")}
        </button>
      </aside>
    </div>
  );
}
