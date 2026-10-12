import { Link } from "react-router-dom";
import { CreatorCard, PostCard, ProductCard } from "../components/Cards";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { yuan } from "../utils";

const WORDS = ["速写", "环境音", "作品集", "胶片配方", "一个人的晚饭", "织物纹样", "小册子", "壁纸", "展板网格", "分轨"];

export function Home() {
  useTitle("星页 — 把作品交给喜欢它的人");
  const { creators, posts, products, tiers } = useStore();
  const featured = creators.filter((creator) => ["linyu", "nanfeng", "slowgate", "zhiye"].includes(creator.id));
  const lead = posts.find((post) => post.id === "linyu-post-1");
  const side = posts.filter((post) => ["nanfeng-post-1", "midnight-post-1"].includes(post.id));
  const shelf = products.filter((product) =>
    ["linyu-shop-1", "nanfeng-shop-2", "paper-shop-1", "slow-shop-1", "ye-shop-1", "kit-shop-1"].includes(product.id),
  );
  const sample = tiers.find((tier) => tier.id === "linyu-1");
  const linyu = creators.find((creator) => creator.id === "linyu");

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">创作者社区</p>
          <h1>
            把作品交给
            <br />
            真正喜欢它的人
          </h1>
          <p className="lead">
            星页给插画、音乐、摄影、设计和写作一个安静的主页。发布动态，上架数字作品，用 30 天会员接受支持。到期即止，不会自动续费。
          </p>
          <div className="hero-actions">
            <Link to="/explore" className="btn btn-dark">
              开始逛
            </Link>
            <Link to="/register?as=creator" className="btn btn-line">
              开通创作页
            </Link>
          </div>
          <p className="fineprint">演示社区 · 支付不会产生真实扣款 · 平台服务费 8%，由创作者承担</p>
        </div>
        {linyu && lead && (
          <Link to={`/c/${linyu.handle}`} className="stage">
            <article className="stage-back">
              <Cover id="nanfeng-rain" ratio="16 / 11" />
            </article>
            <article className="stage-card">
              <Cover id={lead.coverKey} ratio="16 / 10" />
              <div className="stage-copy">
                <div className="person-row">
                  <Avatar name={linyu.name} id={linyu.id} size={36} />
                  <div>
                    <strong>{linyu.name}</strong>
                    <p className="muted">窗边席 {sample ? yuan(sample.price) : ""} / 30 天</p>
                  </div>
                </div>
                <h2>{lead.title}</h2>
                <p>{lead.excerpt}</p>
              </div>
            </article>
          </Link>
        )}
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...WORDS, ...WORDS].map((word, index) => (
            <span key={`${word}-${index}`}>{word}</span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">本周内页</p>
            <h2>创作者刚刚写下的</h2>
          </div>
          <Link to="/explore?kind=posts">全部动态</Link>
        </div>
        <div className="feature">
          {lead && <PostCard post={lead} large />}
          <div className="feature-side">
            {side.map((post) => (
              <PostCard key={post.id} post={post} ratio="16 / 11" />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">在册</p>
            <h2>可以跟着看下去的人</h2>
          </div>
          <Link to="/explore?kind=creators">全部创作者</Link>
        </div>
        <div className="cards four">
          {featured.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">商店</p>
            <h2>能放进库里的作品</h2>
          </div>
          <Link to="/explore?kind=products">全部作品</Link>
        </div>
        <div className="cards">
          {shelf.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="section split">
        <div>
          <p className="kicker">30 天</p>
          <h2>支持一次，看到下一页</h2>
          <ol className="steps">
            <li>
              <span>01</span>
              <div>
                <strong>找到喜欢的主页</strong>
                <p>动态是公开的门口。想看线稿、分轨、配方和未刊页，再决定要不要进去。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>开通一档会员</strong>
                <p>按 30 天计算，不自动续费。到期前可以再开一档，也可以什么都不做。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>作品直接入库</strong>
                <p>商店里的数字作品在演示结账后进入我的库，可以再次下载。</p>
              </div>
            </li>
          </ol>
        </div>
        {sample && linyu && (
          <Link to={`/c/${linyu.handle}?tab=member`} className="ticket ticket-link">
            <p className="kicker">林予 · 窗边席</p>
            <div className="ticket-price">
              <strong>{yuan(sample.price)}</strong>
              <span>/ 30 天</span>
            </div>
            <p>{sample.blurb}</p>
            <div className="ticket-dash" />
            <ul>
              {sample.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            <span className="stamp">不自动续费</span>
          </Link>
        )}
      </section>
    </div>
  );
}
