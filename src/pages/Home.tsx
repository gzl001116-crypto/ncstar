import { Link } from "react-router-dom";
import { CreatorCard, PostCard, ProductCard } from "../components/Cards";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { yuan } from "../utils";

export function Home() {
  const { t, phrase } = useI18n();
  useTitle(t("home.title"));
  const { ready, creators, posts, products, tiers } = useStore();
  const words = t("home.words").split("|");
  const featured = creators.slice(0, 4);
  const lead = posts[0];
  const side = posts.slice(1, 3);
  const shelf = products.slice(0, 6);
  const spotlight = lead ? creators.find((creator) => creator.id === lead.creatorId) : creators[0];
  const sample = tiers.find((tier) => tier.creatorId === spotlight?.id) ?? tiers[0];

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">{t("home.kicker")}</p>
          <h1>
            {t("home.h1").split("\n").map((line, index) => (
              <span key={line}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>
          <p className="lead">{t("home.lead")}</p>
          <div className="hero-actions">
            <Link to="/explore" className="btn btn-dark">
              {t("home.browse")}
            </Link>
            <Link to="/register?as=creator" className="btn btn-line">
              {t("home.open")}
            </Link>
          </div>
          <p className="fineprint">{t("common.feeNote")}</p>
        </div>
        {spotlight && lead && (
          <Link to={`/c/${spotlight.handle}`} className="stage">
            <article className="stage-back">
              <Cover id={`${spotlight.id}-banner`} ratio="16 / 11" />
            </article>
            <article className="stage-card">
              <Cover id={lead.coverKey} ratio="16 / 10" />
              <div className="stage-copy">
                <div className="person-row">
                  <Avatar name={spotlight.name} id={spotlight.id} size={36} />
                  <div>
                    <strong>{spotlight.name}</strong>
                    <p className="muted">
                      {sample ? t("home.tierLine", { name: phrase(sample.name), price: yuan(sample.price) }) : t("common.creator")}
                    </p>
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
          {words.map((word) => (
            <span key={word}>{word}</span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">{t("home.week")}</p>
            <h2>{t("home.justWrote")}</h2>
          </div>
          <Link to="/explore?kind=posts">{t("home.allPosts")}</Link>
        </div>
        {!ready ? (
          <div className="empty">{t("common.loading")}</div>
        ) : posts.length === 0 ? (
          <div className="empty">{t("home.noPosts")}</div>
        ) : (
          <div className="feature">
            {lead && <PostCard post={lead} large />}
            <div className="feature-side">
              {side.map((post) => (
                <PostCard key={post.id} post={post} ratio="16 / 11" />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">{t("home.onList")}</p>
            <h2>{t("home.followPeople")}</h2>
          </div>
          <Link to="/explore?kind=creators">{t("home.allCreators")}</Link>
        </div>
        {!ready || featured.length === 0 ? (
          <div className="empty">{ready ? t("home.noCreators") : t("common.loading")}</div>
        ) : (
          <div className="cards four">
            {featured.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">{t("home.shop")}</p>
            <h2>{t("home.shelf")}</h2>
          </div>
          <Link to="/explore?kind=products">{t("home.allProducts")}</Link>
        </div>
        {!ready || shelf.length === 0 ? (
          <div className="empty">{ready ? t("home.noProducts") : t("common.loading")}</div>
        ) : (
          <div className="cards">
            {shelf.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="section split">
        <div>
          <p className="kicker">{t("home.thirty")}</p>
          <h2>{t("home.supportOnce")}</h2>
          <ol className="steps">
            <li>
              <span>01</span>
              <div>
                <strong>{t("home.s1t")}</strong>
                <p>{t("home.s1p")}</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{t("home.s2t")}</strong>
                <p>{t("home.s2p")}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{t("home.s3t")}</strong>
                <p>{t("home.s3p")}</p>
              </div>
            </li>
          </ol>
        </div>
        {sample && spotlight && (
          <Link to={`/c/${spotlight.handle}?tab=member`} className="ticket ticket-link">
            <p className="kicker">
              {spotlight.name} · {phrase(sample.name)}
            </p>
            <div className="ticket-price">
              <strong>{yuan(sample.price)}</strong>
              <span>{t("common.per30")}</span>
            </div>
            <p>{phrase(sample.blurb)}</p>
            <div className="ticket-dash" />
            <ul>
              {sample.perks.map((perk) => (
                <li key={perk}>{phrase(perk)}</li>
              ))}
            </ul>
            <span className="stamp">{t("common.noRenew")}</span>
          </Link>
        )}
      </section>
    </div>
  );
}
