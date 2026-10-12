import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { downloadText, formatDate } from "../utils";
import { NotFound } from "./NotFound";

export function PostPage() {
  const { handle = "", postId = "" } = useParams();
  const navigate = useNavigate();
  const { t, phrase, rel, rank } = useI18n();
  const { ready, posts, comments, creatorById, tiers, canRead, liked, toggleLike, user, addComment, activeMembership, tierById } = useStore();
  const post = posts.find((item) => item.id === postId && item.creatorId === handle);
  const creator = creatorById(handle);
  useTitle(post ? `${post.title} · ${t("brand")}` : t("nf.title"));
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!ready) return <div className="page"><p className="muted">{t("common.loading")}</p></div>;
  if (!post || !creator) return <NotFound />;

  const open = canRead(post);
  const thread = comments.filter((item) => item.postId === post.id);
  const membership = activeMembership(creator.id);
  const viewerRank = user?.handle === creator.id ? 99 : (tierById(membership?.tierId ?? "")?.rank ?? 0);
  const needed = tiers
    .filter((tier) => tier.creatorId === creator.id && tier.rank >= post.minRank)
    .sort((a, b) => a.price - b.price)[0];

  const onComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      navigate(`/login?next=/c/${handle}/posts/${post.id}`);
      return;
    }
    const result = await addComment(post.id, text);
    if (result) {
      setError(result);
      return;
    }
    setText("");
    setError("");
  };

  const saveFile = async (name: string) => {
    const response = await fetch(`/api/download?postId=${encodeURIComponent(post.id)}`, { credentials: "same-origin" });
    if (!response.ok) {
      setError(t("err.download.now"));
      return;
    }
    downloadText(name, await response.text());
  };

  return (
    <article className="page reading">
      <Link to={`/c/${creator.handle}`} className="back">
        {t("post.home", { name: creator.name })}
      </Link>
      <Cover id={post.coverKey} ratio="16 / 8" className="banner" />
      <div className="meta">
        <span className="pill">{open ? rank(post.minRank) : t("rank.locked")}</span>
        <span className="muted">{formatDate(post.createdAt)}</span>
      </div>
      <h1>{post.title}</h1>
      <div className="byline">
        <Link to={`/c/${creator.handle}`} className="person-row">
          <Avatar name={creator.name} id={creator.id} size={36} />
          <span>
            {creator.name}
            <small className="muted"> {rel(post.createdAt)}</small>
          </span>
        </Link>
        <button
          type="button"
          className={liked(post.id) ? "btn btn-soft" : "btn btn-line"}
          aria-pressed={liked(post.id)}
          onClick={() => (user ? toggleLike(post.id) : navigate(`/login?next=/c/${handle}/posts/${post.id}`))}
        >
          {liked(post.id) ? t("post.liked") : t("post.like")} · {post.likes}
        </button>
      </div>

      {open ? (
        <>
          <div className="prose">
            {post.body.split("\n\n").map((paragraph, index) => (
              <p key={`${post.id}-${index}`}>{paragraph}</p>
            ))}
          </div>
          {post.attachments.length > 0 && (
            <div className="files">
              <h2>{t("post.files")}</h2>
              {post.attachments.map((file) => {
                const need = file.minRank ?? post.minRank;
                const unlocked = viewerRank >= need;
                const gate = tiers.find((tier) => tier.creatorId === creator.id && tier.rank === need);
                return (
                  <div key={file.name} className="file">
                    <div>
                      <strong>{file.name}</strong>
                      <p className="muted">
                        {file.size}
                        {need > 0 ? ` · ${phrase(gate?.name ?? "") || t("common.member")}` : ""}
                      </p>
                    </div>
                    {unlocked ? (
                      <button type="button" className="btn btn-line" onClick={() => saveFile(file.name)}>
                        {t("common.download")}
                      </button>
                    ) : (
                      <Link to={gate ? `/checkout?tier=${gate.id}` : `/c/${creator.handle}?tab=member`} className="btn btn-dark">
                        {t("common.unlock")}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="lockbox">
          <p className="kicker">{t("post.locked")}</p>
          <h2>{needed ? t("post.lockTitle", { name: phrase(needed.name) }) : t("post.lockMember")}</h2>
          <p>{post.excerpt}</p>
          <div className="hero-actions">
            {needed && (
              <Link to={`/checkout?tier=${needed.id}`} className="btn btn-dark">
                {t("creator.open30")}
              </Link>
            )}
            <Link to={`/c/${creator.handle}?tab=member`} className="btn btn-line">
              {t("post.compare")}
            </Link>
          </div>
        </div>
      )}

      <section className="comments">
        <h2>{t("post.comments", { n: thread.length })}</h2>
        <form onSubmit={onComment} className="composer">
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={user ? t("post.placeholder") : t("post.placeholderLogin")} rows={3} />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-dark" type="submit">
            {t("common.send")}
          </button>
        </form>
        <div className="stack">
          {thread.map((item) => (
            <div key={item.id} className="comment">
              <Avatar name={item.author} id={item.author} size={32} />
              <div>
                <strong>{item.author}</strong>
                <span className="muted"> {rel(item.createdAt)}</span>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
          {thread.length === 0 && <p className="muted">{t("post.none")}</p>}
        </div>
      </section>
    </article>
  );
}
