import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { creatorShare, yuan } from "../utils";
import { NotFound } from "./NotFound";

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
          <Avatar name={creator.name} id={creator.id} size={36} />
          <span>{creator.name}</span>
        </Link>
        <p className="pill">{phrase(product.kind)}</p>
        <h1>{product.title}</h1>
        <p className="price price-lg">{yuan(product.price)}</p>
        <p>{phrase(product.description)}</p>
        <ul className="includes">
          {product.includes.map((item) => (
            <li key={item}>{phrase(item)}</li>
          ))}
        </ul>
        <p className="fineprint">{t("product.share", { amount: yuan(creatorShare(product.price)) })}</p>
        {owned ? (
          <Link to="/library" className="btn btn-pine btn-block">
            {t("product.inLibrary")}
          </Link>
        ) : mine ? (
          <p className="muted">{t("product.mine")}</p>
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
