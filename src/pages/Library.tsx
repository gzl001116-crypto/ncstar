import { Link, useLocation } from "react-router-dom";
import { Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { isAbsolute, playHref } from "../site";
import { useStore } from "../store";
import { daysLeft, formatDate, saveDownload, yuan } from "../utils";

export function Library() {
  const { t, phrase } = useI18n();
  useTitle(t("lib.title"));
  const { user, productById, creatorById, tierById } = useStore();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>{t("lib.loginH")}</h1>
          <Link to="/login?next=/library" className="btn btn-dark">
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }

  const save = async (productId: string, title: string) => {
    const response = await fetch(`/api/download?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin" });
    if (!response.ok) return;
    await saveDownload(response, title);
  };

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("lib.kicker")}</p>
        <h1>{t("lib.support", { name: user.name })}</h1>
      </header>
      {flash && <p className="banner-note">{flash}</p>}
      <section className="section">
        <h2>{t("lib.active")}</h2>
        <div className="stack">
          {user.memberships.length === 0 && <div className="empty">{t("lib.noneMember")}</div>}
          {user.memberships.map((item) => {
            const tier = tierById(item.tierId);
            const creator = creatorById(item.creatorId);
            const left = daysLeft(item.expiresAt);
            return (
              <article key={`${item.creatorId}-${item.tierId}`} className="line">
                <div>
                  <strong>
                    {creator?.name} · {phrase(tier?.name ?? "") || t("common.member")}
                  </strong>
                  <p className="muted">
                    {t("lib.until", {
                      status: left > 0 ? t("lib.left", { n: left }) : t("lib.expired"),
                      date: formatDate(item.expiresAt),
                      price: yuan(tier?.price ?? 0),
                    })}
                  </p>
                </div>
                <Link to={`/c/${item.creatorId}?tab=member`} className="btn btn-line">
                  {left > 0 ? t("common.view") : t("lib.reopen")}
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <section className="section">
        <h2>{t("lib.bought")}</h2>
        <div className="cards">
          {user.library.length === 0 && <div className="empty">{t("lib.noneProduct")}</div>}
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
                  <div className="hero-actions">
                    {product.playFormat && (
                      isAbsolute(playHref(product.id)) ? (
                        <a className="btn btn-line" href={playHref(product.id)}>{t("play.open")}</a>
                      ) : (
                        <Link className="btn btn-line" to={playHref(product.id)}>{t("play.open")}</Link>
                      )
                    )}
                    {product.allowDownload && (
                      <button type="button" className="btn btn-line" onClick={() => save(product.id, product.title)}>
                        {t("common.download")}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
