import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import type { Creator, Post, Product } from "../types";
import { useStore } from "../store";
import { yuan } from "../utils";
import { Avatar, Cover } from "./Cover";

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
  const { phrase } = useI18n();
  const { creatorById } = useStore();
  const creator = creatorById(product.creatorId);
  return (
    <Link to={`/c/${product.creatorId}/shop/${product.id}`} className="card">
      <Cover id={product.coverKey} ratio="1 / 1" />
      <div className="card-body">
        <div className="meta">
          <span className="pill">{phrase(product.kind)}</span>
          <span className="price">{yuan(product.price)}</span>
        </div>
        <h3>{product.title}</h3>
        <p className="clamp">{phrase(product.description)}</p>
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
  );
}
