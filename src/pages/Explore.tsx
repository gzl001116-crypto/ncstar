import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CreatorCard, PostCard, ProductCard } from "../components/Cards";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { CATEGORIES } from "../types";
import { includesQuery } from "../utils";

const KINDS = [
  { id: "all", label: "explore.kind.all" },
  { id: "creators", label: "explore.kind.creators" },
  { id: "posts", label: "explore.kind.posts" },
  { id: "products", label: "explore.kind.products" },
] as const;

export function Explore() {
  const { t, phrase } = useI18n();
  useTitle(t("explore.title"));
  const { ready, creators, posts, products } = useStore();
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
          .map((product) => `${product.title} ${product.description} ${product.tags.join(" ")}`)
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
    return includesQuery(`${product.title} ${product.description} ${product.kind} ${product.tags.join(" ")} ${creator?.name ?? ""}`, q);
  });

  const showCreators = kind === "all" || kind === "creators";
  const showPosts = kind === "all" || kind === "posts";
  const showProducts = kind === "all" || kind === "products";
  const empty = (!showCreators || creatorHits.length === 0) && (!showPosts || postHits.length === 0) && (!showProducts || productHits.length === 0);

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("nav.explore")}</p>
        <h1>{t("explore.h1")}</h1>
        <label className="search search-large">
          <input
            value={q}
            onChange={(event) => set("q", event.target.value)}
            placeholder={t("explore.ph")}
            aria-label={t("explore.filter")}
          />
        </label>
      </header>
      <div className="filters">
        <div className="chips">
          {KINDS.map((item) => (
            <button key={item.id} type="button" className={kind === item.id ? "chip on" : "chip"} onClick={() => set("kind", item.id)}>
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="chips">
          {["全部", ...CATEGORIES].map((item) => (
            <button key={item} type="button" className={cat === item ? "chip on" : "chip"} onClick={() => set("cat", item)}>
              {phrase(item)}
            </button>
          ))}
        </div>
      </div>

      {!ready ? (
        <div className="empty">{t("common.loading")}</div>
      ) : empty ? (
        <div className="empty">{q ? t("explore.noMatch") : t("explore.empty")}</div>
      ) : null}

      {showCreators && creatorHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t("explore.creators")}</h2>
            <span className="muted">{creatorHits.length}</span>
          </div>
          <div className="cards four">{creatorHits.map((creator) => <CreatorCard key={creator.id} creator={creator} />)}</div>
        </section>
      )}
      {showPosts && postHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t("explore.posts")}</h2>
            <span className="muted">{postHits.length}</span>
          </div>
          <div className="cards">{postHits.map((post) => <PostCard key={post.id} post={post} />)}</div>
        </section>
      )}
      {showProducts && productHits.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t("explore.products")}</h2>
            <span className="muted">{productHits.length}</span>
          </div>
          <div className="cards">{productHits.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        </section>
      )}
    </div>
  );
}
