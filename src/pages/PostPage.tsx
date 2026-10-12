import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, Cover } from "../components/Cover";
import { useTitle } from "../hooks";
import { useStore } from "../store";
import { downloadText, formatDate, fromNow, visibilityLabel } from "../utils";
import { NotFound } from "./NotFound";

export function PostPage() {
  const { handle = "", postId = "" } = useParams();
  const navigate = useNavigate();
  const { ready, posts, comments, creatorById, tiers, canRead, liked, toggleLike, user, addComment, activeMembership, tierById } = useStore();
  const post = posts.find((item) => item.id === postId && item.creatorId === handle);
  const creator = creatorById(handle);
  useTitle(post ? `${post.title} · 星页` : "未找到 · 星页");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!ready) return <div className="page"><p className="muted">正在载入</p></div>;
  if (!post || !creator) return <NotFound />;

  const open = canRead(post);
  const thread = comments.filter((item) => item.postId === post.id);
  const membership = activeMembership(creator.id);
  const rank = user?.handle === creator.id ? 99 : (tierById(membership?.tierId ?? "")?.rank ?? 0);
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
      setError("现在还不能下载这份附件");
      return;
    }
    downloadText(name, await response.text());
  };

  return (
    <article className="page reading">
      <Link to={`/c/${creator.handle}`} className="back">
        ← {creator.name}的主页
      </Link>
      <Cover id={post.coverKey} ratio="16 / 8" className="banner" />
      <div className="meta">
        <span className="pill">{open ? visibilityLabel(post.minRank) : "会员可见"}</span>
        <span className="muted">{formatDate(post.createdAt)}</span>
      </div>
      <h1>{post.title}</h1>
      <div className="byline">
        <Link to={`/c/${creator.handle}`} className="person-row">
          <Avatar name={creator.name} id={creator.id} size={36} />
          <span>
            {creator.name}
            <small className="muted"> {fromNow(post.createdAt)}</small>
          </span>
        </Link>
        <button
          type="button"
          className={liked(post.id) ? "btn btn-soft" : "btn btn-line"}
          aria-pressed={liked(post.id)}
          onClick={() => (user ? toggleLike(post.id) : navigate(`/login?next=/c/${handle}/posts/${post.id}`))}
        >
          {liked(post.id) ? "已喜欢" : "喜欢"} · {post.likes}
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
              <h2>附件</h2>
              {post.attachments.map((file) => {
                const need = file.minRank ?? post.minRank;
                const unlocked = rank >= need;
                const gate = tiers.find((tier) => tier.creatorId === creator.id && tier.rank === need);
                return (
                  <div key={file.name} className="file">
                    <div>
                      <strong>{file.name}</strong>
                      <p className="muted">
                        {file.size}
                        {need > 0 ? ` · ${gate?.name ?? "会员"}` : ""}
                      </p>
                    </div>
                    {unlocked ? (
                      <button type="button" className="btn btn-line" onClick={() => saveFile(file.name)}>
                        下载
                      </button>
                    ) : (
                      <Link to={gate ? `/checkout?tier=${gate.id}` : `/c/${creator.handle}?tab=member`} className="btn btn-dark">
                        解锁
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
          <p className="kicker">这一页锁着</p>
          <h2>开通{needed ? `「${needed.name}」` : "会员"}后可以阅读</h2>
          <p>{post.excerpt}</p>
          <div className="hero-actions">
            {needed && (
              <Link to={`/checkout?tier=${needed.id}`} className="btn btn-dark">
                开通 30 天
              </Link>
            )}
            <Link to={`/c/${creator.handle}?tab=member`} className="btn btn-line">
              比较档位
            </Link>
          </div>
        </div>
      )}

      <section className="comments">
        <h2>评论 {thread.length}</h2>
        <form onSubmit={onComment} className="composer">
          <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={user ? "写一句你看到的" : "登录后才能评论"} rows={3} />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-dark" type="submit">
            发送
          </button>
        </form>
        <div className="stack">
          {thread.map((item) => (
            <div key={item.id} className="comment">
              <Avatar name={item.author} id={item.author} size={32} />
              <div>
                <strong>{item.author}</strong>
                <span className="muted"> {fromNow(item.createdAt)}</span>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
          {thread.length === 0 && <p className="muted">还没有评论。</p>}
        </div>
      </section>
    </article>
  );
}
