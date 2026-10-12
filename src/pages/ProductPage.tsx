import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { creatorShare, yuan } from "../utils";
import { NotFound } from "./NotFound";

export function ProductPage() {
  const { handle = "", productId = "" } = useParams();
  const navigate = useNavigate();
  const { ready, productById, creatorById, addToCart, owns, user } = useStore();
  const product = productById(productId);
  const creator = creatorById(handle);
  useTitle(product ? `${product.title} · 星页` : "未找到 · 星页");
  if (!ready) return <div className="page"><p className="muted">正在载入</p></div>;
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
        <p className="pill">{product.kind}</p>
        <h1>{product.title}</h1>
        <p className="price price-lg">{yuan(product.price)}</p>
        <p>{product.description}</p>
        <ul className="includes">
          {product.includes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="fineprint">创作者实收约 {yuan(creatorShare(product.price))}，平台服务费 8% 从这一侧扣除。支持者支付的是标价。</p>
        {owned ? (
          <Link to="/library" className="btn btn-pine btn-block">
            已在我的库
          </Link>
        ) : mine ? (
          <p className="muted">这是你上架的作品。</p>
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
              放入购物袋
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
              直接结账
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
