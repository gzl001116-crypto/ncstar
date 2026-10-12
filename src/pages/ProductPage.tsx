import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { isAbsolute, playHref, playPath } from "../site";
import { useStore } from "../store";
import { creatorShare, saveDownload, yuan } from "../utils";
import { NotFound } from "./NotFound";

function PlayLink({ id, className, children }: { id: string; className: string; children: string }) {
  const href = playHref(id);
  if (isAbsolute(href)) return <a className={className} href={href}>{children}</a>;
  return <Link className={className} to={href}>{children}</Link>;
}

export function ProductPage() {
  const { handle = "", productId = "" } = useParams();
  const navigate = useNavigate();
  const { t, phrase } = useI18n();
  const { ready, productById, creatorById, addToCart, owns, user } = useStore();
  const product = productById(productId);
  const creator = creatorById(handle);
  useTitle(product ? `${product.title} · ${t("brand")}` : t("nf.title"));
  if (!ready) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  if (!product || !creator || product.creatorId !== creator.id) return <NotFound />;
  const owned = owns(product.id);
  const mine = user?.handle === creator.id;

  const goLogin = () => navigate(`/login?next=/c/${handle}/shop/${product.id}`);

  return (
    <div className="page product">
      <Cover id={product.coverKey} ratio="1 / 1" />
      <div className="buybox">
        <Link to={`/c/${creator.handle}`} className="person-row">
          <Avatar name={creator.name} id={creator.id} size={36} stamp={creator.avatarAt} />
          <span>{creator.name}</span>
        </Link>
        <div className="tag-row">
          <span className="pill">{phrase(product.kind)}</span>
          {product.playFormat && <span className="pill">{t("product.viaPlay")}</span>}
          {product.allowDownload && <span className="pill">{t("product.canDownload")}</span>}
          {!product.allowDownload && product.playFormat && <span className="pill">{t("product.playOnly")}</span>}
          {product.allowPreview && <span className="pill">{t("product.preview")}</span>}
        </div>
        {product.tags.length > 0 && (
          <div className="tag-row">
            {product.tags.map((tag) => (
              <span key={tag} className="pill">
                {tag}
              </span>
            ))}
          </div>
        )}
        <h1>{product.title}</h1>
        <p className="price price-lg">{yuan(product.price)}</p>
        <p>{phrase(product.description)}</p>
        <ul className="includes">
          {product.includes.map((item) => (
            <li key={item}>{phrase(item)}</li>
          ))}
        </ul>
        <p className="fineprint">{t("product.share", { amount: yuan(creatorShare(product.price)) })}</p>
        {product.allowPreview && product.playFormat && !owned && !mine && (
          user ? (
            <PlayLink id={product.id} className="btn btn-line">{t("product.preview")}</PlayLink>
          ) : (
            <button type="button" className="btn btn-line" onClick={() => navigate(`/login?next=${encodeURIComponent(playPath(product.id))}`)}>
              {t("product.preview")}
            </button>
          )
        )}
        {owned ? (
          <div className="hero-actions">
            {product.playFormat && <PlayLink id={product.id} className="btn btn-dark">{t("play.open")}</PlayLink>}
            {product.allowDownload && (
              <button
                type="button"
                className="btn btn-line"
                onClick={async () => {
                  const response = await fetch(`/api/download?productId=${encodeURIComponent(product.id)}`, { credentials: "same-origin" });
                  if (response.ok) await saveDownload(response, product.title);
                }}
              >
                {t("common.download")}
              </button>
            )}
            <Link to="/library" className="btn btn-pine">
              {t("product.inLibrary")}
            </Link>
          </div>
        ) : mine ? (
          <>
            <p className="muted">{t("product.mine")}</p>
            {product.playFormat && (
              <div className="hero-actions">
                <PlayLink id={product.id} className="btn btn-dark">{t("play.open")}</PlayLink>
              </div>
            )}
          </>
        ) : (
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-dark"
              onClick={() => {
                if (!user) {
                  goLogin();
                  return;
                }
                addToCart(product.id);
              }}
            >
              {t("product.add")}
            </button>
            <button
              type="button"
              className="btn btn-line"
              onClick={async () => {
                if (!user) {
                  goLogin();
                  return;
                }
                await addToCart(product.id);
                navigate("/checkout");
              }}
            >
              {t("product.buy")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
