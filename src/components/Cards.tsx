import { Link } from "react-router-dom";
import type { Creator, Post, Product } from "../types";
import { useStore } from "../store";
import { fromNow, visibilityLabel, yuan } from "../utils";
import { Avatar, Cover } from "./Cover";

export function CreatorCard({ creator }: { creator: Creator }) {
  const { followerCount } = useStore();
  return (
    <Link to={`/c/${creator.handle}`} className="card person-card">
      <Cover id={`${creator.id}-banner`} ratio="16 / 10" />
      <div className="card-body">
        <div className="person-row">
          <Avatar name={creator.name} id={creator.id} />
          <div>
            <strong>{creator.name}</strong>
            <p className="muted">@{creator.handle}</p>
          </div>
        </div>
        <p className="clamp">{creator.bio}</p>
        <div className="meta">
          <span className="pill">{creator.category}</span>
          <span className="muted">{followerCount(creator).toLocaleString("zh-CN")} 关注</span>
        </div>
      </div>
    </Link>
  );
}

export function PostCard({ post, large = false, ratio }: { post: Post; large?: boolean; ratio?: string }) {
  const { creatorById, canRead } = useStore();
  const creator = creatorById(post.creatorId);
  const open = canRead(post);
  return (
    <Link to={`/c/${post.creatorId}/posts/${post.id}`} className={`card ${large ? "card-large" : ""}`}>
      <Cover id={post.coverKey} ratio={ratio ?? (large ? "16 / 10" : "4 / 5")} />
      <div className="card-body">
        <div className="meta">
          <span className="pill">{open ? visibilityLabel(post.minRank) : "会员可见"}</span>
          <span className="muted">{fromNow(post.createdAt)}</span>
        </div>
        <h3>{post.title}</h3>
        <p className="clamp">{post.excerpt}</p>
        {creator && (
          <div className="person-row compact">
            <Avatar name={creator.name} id={creator.id} size={28} />
            <span>{creator.name}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { creatorById } = useStore();
  const creator = creatorById(product.creatorId);
  return (
    <Link to={`/c/${product.creatorId}/shop/${product.id}`} className="card">
      <Cover id={product.coverKey} ratio="1 / 1" />
      <div className="card-body">
        <div className="meta">
          <span className="pill">{product.kind}</span>
          <span className="price">{yuan(product.price)}</span>
        </div>
        <h3>{product.title}</h3>
        <p className="clamp">{product.description}</p>
        {creator && <p className="muted">{creator.name}</p>}
      </div>
    </Link>
  );
}
