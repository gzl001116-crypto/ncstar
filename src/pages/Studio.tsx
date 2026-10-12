import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { CATEGORIES, type Category } from "../types";
import { yuan } from "../utils";

export function Studio() {
  const { t, phrase, rank, locale } = useI18n();
  useTitle(t("studio.title"));
  const { ready, user, posts, products, tiers, creatorById, publishPost, publishProduct, updateProfile, openStudio, followerCount, supporterCount } =
    useStore();
  const navigate = useNavigate();
  const [profileError, setProfileError] = useState("");
  const [postError, setPostError] = useState("");
  const [shopError, setShopError] = useState("");
  const [openError, setOpenError] = useState("");

  if (!ready) {
    return (
      <div className="page narrow">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>{t("studio.loginH")}</h1>
          <p>{t("studio.loginP")}</p>
          <Link to="/login?next=/studio" className="btn btn-dark">
            {t("login")}
          </Link>
        </div>
      </div>
    );
  }

  const creator = creatorById(user.handle);
  const minePosts = posts.filter((post) => post.creatorId === user.handle);
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const plans = tiers.filter((tier) => tier.creatorId === user.handle);

  const onProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await updateProfile({
      name: String(data.get("name") ?? ""),
      bio: String(data.get("bio") ?? ""),
      location: String(data.get("location") ?? ""),
      category: String(data.get("category") ?? "") as Category,
    });
    setProfileError(result ?? "");
  };

  const onPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await publishPost({
      title: String(data.get("title") ?? ""),
      excerpt: String(data.get("excerpt") ?? ""),
      body: String(data.get("body") ?? ""),
      minRank: Number(data.get("minRank") ?? 0),
    });
    if (result) {
      setPostError(result);
      return;
    }
    event.currentTarget.reset();
    setPostError("");
  };

  const onProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await publishProduct({
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price") ?? 0),
      kind: String(data.get("kind") ?? ""),
      includes: String(data.get("includes") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      fileBody: String(data.get("fileBody") ?? ""),
    });
    if (result) {
      setShopError(result);
      return;
    }
    event.currentTarget.reset();
    setShopError("");
  };

  return (
    <div className="page">
      <header className="page-intro">
        <p className="kicker">{t("nav.studio")}</p>
        <h1>{user.isCreator ? t("studio.desk", { name: user.name }) : t("studio.openH")}</h1>
      </header>
      {!user.isCreator || !creator ? (
        <div className="empty">
          <p>{t("studio.openP")}</p>
          {openError && <p className="error">{openError}</p>}
          <button
            type="button"
            className="btn btn-dark"
            onClick={async () => {
              const result = await openStudio();
              setOpenError(result ?? "");
              if (!result) navigate("/studio");
            }}
          >
            {t("home.open")}
          </button>
        </div>
      ) : (
        <>
          <div className="studio-stats">
            <div>
              <strong>{followerCount(creator).toLocaleString(locale)}</strong>
              <span>{t("common.followers")}</span>
            </div>
            <div>
              <strong>{supporterCount(creator.id).toLocaleString(locale)}</strong>
              <span>{t("common.supporters")}</span>
            </div>
            <div>
              <strong>{minePosts.length}</strong>
              <span>{t("common.posts")}</span>
            </div>
            <div>
              <strong>{yuan(mineProducts.reduce((sum, item) => sum + item.price, 0))}</strong>
              <span>{t("studio.priceSum")}</span>
            </div>
            <Link to={`/c/${creator.handle}`} className="btn btn-line">
              {t("studio.viewPage")}
            </Link>
          </div>

          <div className="studio-grid">
            <form className="panel" onSubmit={onProfile}>
              <h2>{t("studio.profile")}</h2>
              <label>
                {t("auth.name")}
                <input name="name" defaultValue={creator.name} />
              </label>
              <label>
                {t("studio.location")}
                <input name="location" defaultValue={creator.location} />
              </label>
              <label>
                {t("studio.category")}
                <select name="category" defaultValue={creator.category}>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {phrase(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("studio.bio")}
                <textarea name="bio" defaultValue={creator.bio} rows={4} />
              </label>
              {profileError && <p className="error">{profileError}</p>}
              <button className="btn btn-dark" type="submit">
                {t("common.save")}
              </button>
            </form>

            <form className="panel" onSubmit={onPost}>
              <h2>{t("studio.newPost")}</h2>
              <label>
                {t("studio.postTitle")}
                <input name="title" required />
              </label>
              <label>
                {t("studio.excerpt")}
                <input name="excerpt" />
              </label>
              <label>
                {t("studio.body")}
                <textarea name="body" rows={5} required />
              </label>
              <label>
                {t("studio.who")}
                <select name="minRank" defaultValue="0">
                  <option value="0">{t("rank.public")}</option>
                  {plans.map((tier) => (
                    <option key={tier.id} value={tier.rank}>
                      {t("studio.andAbove", { name: phrase(tier.name) })}
                    </option>
                  ))}
                </select>
              </label>
              {postError && <p className="error">{postError}</p>}
              <button className="btn btn-dark" type="submit">
                {t("studio.publish")}
              </button>
            </form>

            <form className="panel" onSubmit={onProduct}>
              <h2>{t("studio.newProduct")}</h2>
              <label>
                {t("studio.productName")}
                <input name="title" required />
              </label>
              <label>
                {t("studio.kind")}
                <input name="kind" placeholder={t("studio.kindPh")} />
              </label>
              <label>
                {t("studio.price")}
                <input name="price" type="number" min="1" max="9999" step="1" required />
              </label>
              <label>
                {t("studio.includes")}
                <input name="includes" placeholder={t("studio.includesPh")} />
              </label>
              <label>
                {t("studio.desc")}
                <textarea name="description" rows={4} />
              </label>
              <label>
                {t("studio.file")}
                <textarea name="fileBody" rows={5} required placeholder={t("studio.filePh")} />
              </label>
              {shopError && <p className="error">{shopError}</p>}
              <button className="btn btn-dark" type="submit">
                {t("studio.newProduct")}
              </button>
            </form>
          </div>

          <section className="section">
            <h2>{t("studio.listed")}</h2>
            <div className="stack">
              {minePosts.length === 0 && mineProducts.length === 0 && <div className="empty">{t("studio.empty")}</div>}
              {minePosts.map((post) => (
                <Link key={post.id} to={`/c/${user.handle}/posts/${post.id}`} className="line">
                  <div>
                    <strong>{post.title}</strong>
                    <p className="muted">{t("studio.postMeta", { vis: rank(post.minRank) })}</p>
                  </div>
                </Link>
              ))}
              {mineProducts.map((product) => (
                <Link key={product.id} to={`/c/${user.handle}/shop/${product.id}`} className="line">
                  <div>
                    <strong>{product.title}</strong>
                    <p className="muted">
                      {phrase(product.kind)} · {yuan(product.price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section className="section">
            <h2>{t("studio.tiers")}</h2>
            <div className="tier-grid">
              {plans.map((tier) => (
                <article key={tier.id} className="ticket">
                  <h3>{phrase(tier.name)}</h3>
                  <div className="ticket-price">
                    <strong>{yuan(tier.price)}</strong>
                    <span>{t("common.per30")}</span>
                  </div>
                  <p>{phrase(tier.blurb)}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
