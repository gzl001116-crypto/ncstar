function FanstarThread({ kind, targetId }) {
  const { user } = he();
  const path = Ve();
  const [data, setData] = v.useState(null);
  const [text, setText] = v.useState("");
  const [reply, setReply] = v.useState(null);
  const [busy, setBusy] = v.useState(false);
  const [error, setError] = v.useState("");
  const [status, setStatus] = v.useState("");
  const input = v.useRef(null);
  const pending = v.useRef(false);
  const sequence = v.useRef(0);
  v.useEffect(() => {
    let active = true;
    sequence.current++;
    setData(null); setText(""); setReply(null); setError(""); setStatus("");
    Fe("/api/threads?kind=" + kind + "&targetId=" + encodeURIComponent(targetId))
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; sequence.current++; };
  }, [kind, targetId, user?.id]);
  const mutate = async (payload) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setStatus("");
    const current = sequence.current;
    try {
      const result = await Fe("/api/threads", { method: "POST", body: JSON.stringify({ kind, targetId, ...payload }) });
      if (current !== sequence.current) return;
      setData(result);
      if (payload.op === "comment") { setText(""); setReply(null); setStatus(payload.parentId ? "回复已发布。" : "评论已发布。"); }
      else { if (!result.comments.some(item => item.id === reply?.id)) setReply(null); setStatus("评论及其回复已删除。"); }
    } catch (reason) { if (current === sequence.current) setError(reason.message); }
    finally { pending.current = false; setBusy(false); }
  };
  const byId = new Map((data?.comments || []).map(item => [item.id, item]));
  const children = new Map();
  for (const item of data?.comments || []) {
    const parentId = byId.has(item.parentId) ? item.parentId : "";
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(item);
  }
  const ordered = [];
  const visit = (item, nested) => {
    ordered.push({ item, nested });
    for (const child of children.get(item.id) || []) visit(child, true);
  };
  for (const root of [...(children.get("") || [])].reverse()) visit(root, false);
  return n.jsxs("section", { className: "tw-thread", id: "comments", children: [
    n.jsx("h2", { children: "评论" + (data ? " · " + data.total : "") }),
    user ? n.jsxs("form", { className: "tw-thread-compose", onSubmit: event => {
      event.preventDefault();
      if (data && text.trim()) void mutate({ op: "comment", text, parentId: reply?.id || "" });
    }, children: [
      reply && n.jsxs("div", { className: "tw-reply-context", children: [
        n.jsx("span", { children: "回复 @" + reply.name }),
        n.jsx("button", { type: "button", className: "tw-text-button", disabled: busy, onClick: () => { setReply(null); input.current?.focus(); }, children: "取消回复" }),
      ] }),
      n.jsx("textarea", { ref: input, "aria-label": reply ? "回复评论" : "写评论", placeholder: reply ? "回复 @" + reply.name + "…" : "分享你的看法…", maxLength: 1000, rows: 3, value: text, disabled: busy || !data, onChange: event => setText(event.target.value) }),
      n.jsxs("div", { className: "tw-comment-compose-actions", children: [
        n.jsx("small", { className: "muted", children: text.length + " / 1000" }),
        n.jsx("button", { type: "submit", className: "btn btn-dark btn-small", disabled: busy || !data || !text.trim(), children: busy ? "提交中…" : reply ? "发表回复" : "发表评论" }),
      ] }),
    ] }) : n.jsxs("p", { className: "muted", children: [n.jsx(q, { to: "/login?next=" + encodeURIComponent(path.pathname + path.search + "#comments"), children: "登录" }), "后参与评论或回复。"] }),
    error && n.jsx("p", { className: "error", role: "alert", children: error }),
    status && n.jsx("p", { role: "status", children: status }),
    !data && !error && n.jsx("p", { className: "muted", children: "正在载入评论…" }),
    data && !data.comments.length && n.jsx("p", { className: "muted", children: "还没有评论，来聊聊吧。" }),
    n.jsx("div", { className: "tw-comments", children: ordered.map(({ item, nested }) => n.jsxs("article", {
      id: "comment-" + item.id, className: "tw-comment" + (nested ? " tw-comment-reply" : ""), children: [
        n.jsx(ht, { name: item.name, id: item.handle || item.id, size: 32, stamp: item.avatarAt }),
        n.jsxs("div", { className: "tw-comment-body", children: [
          n.jsxs("div", { className: "tw-comment-head", children: [
            n.jsx("strong", { children: item.name }),
            item.isAuthor && n.jsx("span", { className: "tw-author-badge", children: "作者" }),
            n.jsx("time", { dateTime: item.createdAt, children: new Date(item.createdAt).toLocaleString("zh-CN") }),
          ] }),
          nested && n.jsx("small", { className: "muted", children: "回复 @" + (byId.get(item.parentId)?.name || "用户") }),
          n.jsx("p", { children: item.text }),
          n.jsxs("div", { className: "tw-thread-actions", children: [
            user ? n.jsx("button", { type: "button", className: "tw-text-button", disabled: busy, onClick: () => { setReply(item); setStatus(""); input.current?.focus(); input.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, children: "回复" })
              : n.jsx(q, { className: "tw-text-button", to: "/login?next=" + encodeURIComponent(path.pathname + path.search + "#comments"), children: "回复" }),
            item.canDelete && n.jsx("button", { type: "button", className: "tw-text-button", disabled: busy, onClick: () => {
              if (!children.get(item.id)?.length || window.confirm("删除这条评论及其全部回复？")) void mutate({ op: "delete", commentId: item.id });
            }, children: children.get(item.id)?.length ? "删除评论及回复" : "删除评论" }),
          ] }),
        ] }),
      ],
    }, item.id)) }),
    data && data.comments.length < data.total && n.jsx("small", { className: "muted", children: "显示最近 50 个讨论及其回复。" }),
  ] });
}

function rg({ product }) {
  const community = v.useContext(qt);
  const [busy, setBusy] = v.useState(false);
  const [error, setError] = v.useState("");
  return n.jsxs("section", { className: "tw-work-community", children: [
    n.jsxs("div", { className: "tw-work-social-actions", children: [
      n.jsx(ap, { productId: product.id }),
      n.jsxs("button", { type: "button", className: "tw-favorite", "aria-pressed": community.data.likedIds.includes(product.id), disabled: busy || !community.ready, onClick: async () => {
        setBusy(true); setError("");
        try { await community.act(product.id, "like", !community.data.likedIds.includes(product.id)); }
        catch (reason) { setError(reason.message); }
        finally { setBusy(false); }
      }, children: ["♡ ", community.data.likedIds.includes(product.id) ? "已点赞" : "点赞", " · ", community.data.counts[product.id]?.likes || 0] }),
      n.jsx("span", { className: "muted", children: (community.data.counts[product.id]?.favorites || 0) + " 人收藏" }),
    ] }),
    error && n.jsx("p", { className: "error", role: "alert", children: error }),
    n.jsx(FanstarThread, { kind: "work", targetId: product.id }, product.id),
  ] });
}
