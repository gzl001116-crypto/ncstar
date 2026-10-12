import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CreatorCard, PostCard, ProductCard } from "../components/Cards";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { CATEGORIES } from "../types";
import { includesQuery } from "../utils";

const KINDS = [
  { id: "all", label: "全部" },
  { id: "creators", label: "创作者" },
  { id: "posts", label: "动态" },
  { id: "products", label: "作品" },
] as const;

export function Explore() {
  useTitle("探索 · 星页");
  const { creators, posts, products } = useStore();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const cat = params.get("cat") ?? "全部";
  const kind = params.get("kind") ?? "all";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "全部" || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const creatorHits = useMemo(
    () =>
      creators.filter((creator) => {
        if (cat !== "全部" && creator.category !== cat) return false;
        const written = posts
          .filter((post) => post.creatorId === creator.id)
          .map((post) => `${post.title} ${post.excerpt}`)
          .join(" ");
        const sold = products
          .filter((product) => product.creatorId === creator.id)
          .map((product) => `${product.title} ${product.description}`)
          .join(" ");
        return includesQuery(
          `${creator.name} ${creator.handle} ${creator.bio} ${creator.tags.join(" ")} ${creator.location} ${written} ${sold}`,
          q,
        );
      }),
    [creators, posts, products, cat, q],
  );

  const postHits = posts.filter((post) => {
    const creator = creators.find((item) => item.id === post.creatorId);
    if (cat !== "全部" && creator?.category !== cat) return false;
    return includesQuery(`${post.title} ${post.excerpt} ${creator?.name ?? ""}`, q);
  });
  const productHits = products.filter((product) => {
    const creator = creators.find((item) => item.id === product.creatorId);
    if (cat !== "全部" && creator?.category !== cat) return false;
    return includesQuery(`${product.title} ${product.description} ${product.kind} ${creator?.name ?? ""}`, q);
  });

  const showCreators = kind === "all" || kind === "creators";
  const showPosts = kind === "all" || kind === "posts";
  const showProducts = kind === "all" || kind === "products";
  const empty = (!showCreators || creatorHits.length === 0) && (!showPosts || postHits.length === 0) && (!showProducts || productHits.length === 0);

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">探索</p>
        <h1>找一个还想再看一页的人</h1>
        <label className="search search-large">
          <input
            value={q}
            onChange={(event) => set("q", event.target.value)}
            placeholder="试试薄荷、配乐、胶片、纹样"
            aria-label="筛选"
          />
        </label>
      </header>
      <div className="filters">
        <div className="chips">
          {KINDS.map((item) => (
            <button key={item.id} type="button" className={kind === item.id ? "chip on" : "chip"} onClick={() => set("kind", item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="chips">
          {["全部", ...CATEGORIES].map((item) => (
            <button key={item} type="button" className={cat === item ? "chip on" : "chip"} onClick={() => set("cat", item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {empty && <div className="empty">没有匹配的页面。换一个词，或者把分类放回全部。</div>}

      {showCreators && creatorHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>创作者</h2>
            <span className="muted">{creatorHits.length}</span>
          </div>
          <div className="cards four">{creatorHits.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}</div>
        </section>
      )}
      {showPosts && postHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>动态</h2>
            <span className="muted">{postHits.length}</span>
          </div>
          <div className="cards">{postHits.map((post) => <PostCard key={post.id} post={post} />)}</div>
        </section>
      )}
      {showProducts && productHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>作品</h2>
            <span className="muted">{productHits.length}</span>
          </div>
          <div className="cards">{productHits.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        </section>
      )}
    </div>
  );
}
