import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import type { Creator, Post, Product } from "../types";
import { useStore } from "../store";
import { coinText, fiat } from "../utils";
import { Avatar, Cover, coverSrc } from "./Cover";

export function CreatorCard({ creator }: { creator: Creator }) {
  const { t, phrase, locale } = useI18n();
  const { followerCount } = useStore();
  return (
    <Link to={`/c/${creator.handle}`} className="card person-card">
      <Cover id={`${creator.id}-banner`} ratio="16 / 10" />
      <div className="card-body">
        <div className="person-row">
          <Avatar name={creator.name} id={creator.id} stamp={creator.avatarAt} />
          <div>
            <strong>{creator.name}</strong>
            <p className="muted">@{creator.handle}</p>
          </div>
        </div>
        <p className="clamp">{phrase(creator.bio)}</p>
        <div className="meta">
          <span className="pill">{phrase(creator.category)}</span>
          <span className="muted">
            {followerCount(creator).toLocaleString(locale)} {t("common.followers")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PostCard({ post, large = false, ratio }: { post: Post; large?: boolean; ratio?: string }) {
  const { t, rel, rank } = useI18n();
  const { creatorById, canRead } = useStore();
  const creator = creatorById(post.creatorId);
  const open = canRead(post);
  return (
    <Link to={`/c/${post.creatorId}/posts/${post.id}`} className={`card ${large ? "card-large" : ""}`}>
      <Cover id={post.coverKey} ratio={ratio ?? (large ? "16 / 10" : "4 / 5")} />
      <div className="card-body">
        <div className="meta">
          <span className="pill">{open ? rank(post.minRank) : t("rank.locked")}</span>
          <span className="muted">{rel(post.createdAt)}</span>
        </div>
        <h3>{post.title}</h3>
        <p className="clamp">{post.excerpt}</p>
        {creator && (
          <div className="person-row compact">
            <Avatar name={creator.name} id={creator.id} size={28} stamp={creator.avatarAt} />
            <span>{creator.name}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { t, phrase } = useI18n();
  const { creatorById, user, owns } = useStore();
  const navigate = useNavigate();
  const creator = creatorById(product.creatorId);
  const mine = user?.handle === product.creatorId;
  const owned = owns(product.id);
  const buy = () => {
    const next = `/checkout?product=${product.id}`;
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    navigate(next);
  };
  return (
    <article className="card product-card">
      <Link to={`/c/${product.creatorId}/shop/${product.id}`} className="card-link">
        <Cover id={product.coverKey} src={coverSrc(product)} ratio="1 / 1" />
        <div className="card-body">
          <div className="meta">
            <span className="pill">{phrase(product.kind)}</span>
            <span className="price">{fiat(product.price, product.priceCurrency)}</span>
          </div>
          <h3>{product.title}</h3>
          <p className="muted">{coinText(product.coinPrice)}</p>
          {product.description && <p className="clamp">{phrase(product.description)}</p>}
          {product.tags.length > 0 && (
            <div className="tag-row">
              {product.tags.map((tag) => (
                <span key={tag} className="pill">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {creator && <p className="muted">{creator.name}</p>}
        </div>
      </Link>
      {!mine && !owned && (
        <div className="card-actions">
          <button type="button" className="btn btn-dark btn-small" onClick={buy}>
            {t("card.buy")}
          </button>
        </div>
      )}
    </article>
  );
}
