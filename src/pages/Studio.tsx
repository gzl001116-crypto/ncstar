import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { CATEGORIES, type Category } from "../types";
import { yuan } from "../utils";

export function Studio() {
  useTitle("创作台 · 星页");
  const { user, posts, products, tiers, creatorById, publishPost, publishProduct, updateProfile, openStudio, followerCount, supporterCount } =
    useStore();
  const navigate = useNavigate();
  const [profileError, setProfileError] = useState("");
  const [postError, setPostError] = useState("");
  const [shopError, setShopError] = useState("");

  if (!user) {
    return (
      <div className="page narrow">
        <div className="empty">
          <h1>登录后使用创作台</h1>
          <p>创作者演示账号：studio@xingye.app / xingye123</p>
          <Link to="/login?next=/studio" className="btn btn-dark">
            登录
          </Link>
        </div>
      </div>
    );
  }

  const creator = creatorById(user.handle);
  const minePosts = posts.filter((post) => post.creatorId === user.handle);
  const mineProducts = products.filter((product) => product.creatorId === user.handle);
  const plans = tiers.filter((tier) => tier.creatorId === user.handle);

  const onProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    updateProfile({
      name: String(data.get("name") ?? ""),
      bio: String(data.get("bio") ?? ""),
      location: String(data.get("location") ?? ""),
      category: String(data.get("category") ?? "") as Category,
    });
    setProfileError("");
  };

  const onPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = publishPost({
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

  const onProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = publishProduct({
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price") ?? 0),
      kind: String(data.get("kind") ?? ""),
      includes: String(data.get("includes") ?? "")
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
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
        <p className="kicker">创作台</p>
        <h1>{user.isCreator ? `${user.name}的工作台` : "开通你的创作页"}</h1>
      </header>
      {!user.isCreator || !creator ? (
        <div className="empty">
          <p>开通之后会出现主页、两档 30 天会员，以及发布动态和上架作品的表单。</p>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              openStudio();
              navigate("/studio");
            }}
          >
            开通创作页
          </button>
        </div>
      ) : (
        <>
          <div className="studio-stats">
            <div>
              <strong>{followerCount(creator).toLocaleString("zh-CN")}</strong>
              <span>关注</span>
            </div>
            <div>
              <strong>{supporterCount(creator.id).toLocaleString("zh-CN")}</strong>
              <span>支持中</span>
            </div>
            <div>
              <strong>{minePosts.length}</strong>
              <span>动态</span>
            </div>
            <div>
              <strong>{yuan(mineProducts.reduce((sum, item) => sum + item.price, 0))}</strong>
              <span>在售标价合计</span>
            </div>
            <Link to={`/c/${creator.handle}`} className="btn btn-line">
              查看主页
            </Link>
          </div>

          <div className="studio-grid">
            <form className="panel" onSubmit={onProfile}>
              <h2>主页</h2>
              <label>
                名字
                <input name="name" defaultValue={creator.name} />
              </label>
              <label>
                所在地
                <input name="location" defaultValue={creator.location} />
              </label>
              <label>
                分类
                <select name="category" defaultValue={creator.category}>
                  {CATEGORIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                简介
                <textarea name="bio" defaultValue={creator.bio} rows={4} />
              </label>
              {profileError && <p className="error">{profileError}</p>}
              <button className="btn btn-dark" type="submit">
                保存
              </button>
            </form>

            <form className="panel" onSubmit={onPost}>
              <h2>发一条动态</h2>
              <label>
                标题
                <input name="title" required />
              </label>
              <label>
                摘要
                <input name="excerpt" />
              </label>
              <label>
                正文
                <textarea name="body" rows={5} required />
              </label>
              <label>
                谁可以看
                <select name="minRank" defaultValue="0">
                  <option value="0">公开</option>
                  {plans.map((tier) => (
                    <option key={tier.id} value={tier.rank}>
                      {tier.name}及以上
                    </option>
                  ))}
                </select>
              </label>
              {postError && <p className="error">{postError}</p>}
              <button className="btn btn-dark" type="submit">
                发布
              </button>
            </form>

            <form className="panel" onSubmit={onProduct}>
              <h2>上架一件作品</h2>
              <label>
                名称
                <input name="title" required />
              </label>
              <label>
                类型
                <input name="kind" placeholder="壁纸、音源、模板…" />
              </label>
              <label>
                价格（元）
                <input name="price" type="number" min="1" max="9999" step="1" required />
              </label>
              <label>
                包含内容
                <input name="includes" placeholder="用逗号分开" />
              </label>
              <label>
                介绍
                <textarea name="description" rows={4} />
              </label>
              {shopError && <p className="error">{shopError}</p>}
              <button className="btn btn-dark" type="submit">
                上架
              </button>
            </form>
          </div>

          <section className="section">
            <h2>已经放上去的</h2>
            <div className="stack">
              {minePosts.length === 0 && mineProducts.length === 0 && <div className="empty">还没有新的动态或作品。</div>}
              {minePosts.map((post) => (
                <Link key={post.id} to={`/c/${user.handle}/posts/${post.id}`} className="line">
                  <div>
                    <strong>{post.title}</strong>
                    <p className="muted">动态 · {post.minRank > 0 ? "会员" : "公开"}</p>
                  </div>
                </Link>
              ))}
              {mineProducts.map((product) => (
                <Link key={product.id} to={`/c/${user.handle}/shop/${product.id}`} className="line">
                  <div>
                    <strong>{product.title}</strong>
                    <p className="muted">
                      {product.kind} · {yuan(product.price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section className="section">
            <h2>会员档</h2>
            <div className="tier-grid">
              {plans.map((tier) => (
                <article key={tier.id} className="ticket">
                  <h3>{tier.name}</h3>
                  <div className="ticket-price">
                    <strong>{yuan(tier.price)}</strong>
                    <span>/ 30 天</span>
                  </div>
                  <p>{tier.blurb}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
