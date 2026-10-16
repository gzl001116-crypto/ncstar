function FanstarThread({ kind, targetId }) {
  const { user } = he();
  const path = Ve();
  const [data, setData] = v.useState(null), [text, setText] = v.useState(''), [reply, setReply] = v.useState(null);
  const [busy, setBusy] = v.useState(false), [error, setError] = v.useState(''), [status, setStatus] = v.useState('');
  const [expanded, setExpanded] = v.useState({});
  const input = v.useRef(null), pending = v.useRef(false), sequence = v.useRef(0);
  const endpoint = '/api/threads?kind=' + kind + '&targetId=' + encodeURIComponent(targetId);
  v.useEffect(() => {
    let active = true; sequence.current++; pending.current = false;
    setData(null); setText(''); setReply(null); setError(''); setStatus(''); setExpanded({}); setBusy(false);
    Fe(endpoint).then(result => { if (active) setData(result); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; sequence.current++; };
  }, [kind, targetId, user?.id]);
  const mutate = async payload => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setStatus('');
    const current = sequence.current;
    try {
      const result = await Fe('/api/threads', { method: 'POST', body: JSON.stringify({ kind, targetId, ...payload }) });
      if (current !== sequence.current) return;
      setData(result);
      if (payload.op === 'comment') {
        if (payload.parentId) {
          const lookup = new Map(result.comments.map(item => [item.id, item]));
          let root = lookup.get(payload.parentId); const visited = new Set();
          while (root?.parentId && lookup.has(root.parentId) && !visited.has(root.id)) { visited.add(root.id); root = lookup.get(root.parentId); }
          if (root) setExpanded(value => ({ ...value, [root.id]: true }));
        }
        setText(''); setReply(null); setStatus(payload.parentId ? '回复已发布。' : '评论已发布。');
      } else if (payload.op === 'setComments') {
        if (!result.enabled) setReply(null);
        setStatus(result.enabled ? '评论已开启。' : '评论已关闭，已有评论仍可查看。');
      } else {
        if (!result.comments.some(item => item.id === reply?.id)) setReply(null);
        setStatus('评论及其回复已删除。');
      }
    } catch (reason) {
      if (current === sequence.current) {
        setError(reason.message);
        try { const latest = await Fe(endpoint); if (current === sequence.current) setData(latest); } catch {}
      }
    } finally { if (current === sequence.current) { pending.current = false; setBusy(false); } }
  };
  const enabled = data?.enabled !== false;
  const byId = new Map((data?.comments || []).map(item => [item.id, item]));
  const children = new Map();
  for (const item of data?.comments || []) {
    const parentId = byId.has(item.parentId) ? item.parentId : '';
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(item);
  }
  const login = '/login?next=' + encodeURIComponent(path.pathname + path.search + '#comments');
  const renderItem = (item, nested) => n.jsxs('article', { id: 'comment-' + item.id, className: 'tw-comment' + (nested ? ' tw-comment-reply' : ''), children: [
    n.jsx(ht, { name: item.name, id: item.handle || item.id, size: 32, stamp: item.avatarAt }),
    n.jsxs('div', { className: 'tw-comment-body', children: [
      n.jsxs('div', { className: 'tw-comment-head', children: [n.jsx('strong', { children: item.name }), item.isAuthor && n.jsx('span', { className: 'tw-author-badge', children: '作者' }), n.jsx('time', { dateTime: item.createdAt, children: new Date(item.createdAt).toLocaleString('zh-CN') })] }),
      nested && n.jsx('small', { className: 'muted', children: '回复 @' + (byId.get(item.parentId)?.name || '用户') }),
      n.jsx('p', { children: item.text }),
      n.jsxs('div', { className: 'tw-thread-actions', children: [
        enabled && (user ? n.jsx('button', { type: 'button', className: 'tw-text-button', disabled: busy, onClick: () => { setReply(item); setStatus(''); input.current?.focus(); input.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, children: '回复' }) : n.jsx(q, { className: 'tw-text-button', to: login, children: '回复' })),
        item.canDelete && n.jsx('button', { type: 'button', className: 'tw-text-button', disabled: busy, onClick: () => { if (!children.get(item.id)?.length || window.confirm('删除这条评论及其全部回复？')) void mutate({ op: 'delete', commentId: item.id }); }, children: children.get(item.id)?.length ? '删除评论及回复' : '删除评论' }),
      ] }),
    ] }),
  ] }, item.id);
  const discussions = [...(children.get('') || [])].reverse().map(root => {
    const replies = [], visited = new Set([root.id]);
    const visit = item => { if (visited.has(item.id)) return; visited.add(item.id); replies.push(item); for (const child of children.get(item.id) || []) visit(child); };
    for (const child of children.get(root.id) || []) visit(child);
    const open = !!expanded[root.id];
    return n.jsxs('div', { className: 'fs-discussion', children: [renderItem(root, false), replies.length > 0 && n.jsx('button', { type: 'button', className: 'tw-text-button fs-replies-toggle', 'aria-expanded': open, 'aria-controls': 'replies-' + root.id, onClick: () => setExpanded(value => ({ ...value, [root.id]: !value[root.id] })), children: open ? '收起回复（' + replies.length + '）' : '展开 ' + replies.length + ' 条回复' }),
      open && n.jsx('div', { className: 'fs-replies', id: 'replies-' + root.id, children: replies.map(item => renderItem(item, true)) }),
    ] }, root.id);
  });
  return n.jsxs('section', { className: 'tw-thread', id: 'comments', children: [
    n.jsxs('div', { className: 'fs-thread-heading', children: [n.jsx('h2', { children: '评论' + (data ? ' · ' + data.total : '') }), data?.canManage && n.jsxs('label', { className: 'fs-comment-switch', children: [n.jsx('input', { type: 'checkbox', role: 'switch', checked: enabled, disabled: busy, onChange: event => void mutate({ op: 'setComments', enabled: event.target.checked }), 'aria-label': '允许评论与回复' }), '允许评论与回复'] })] }),
    data && !enabled && n.jsx('p', { className: 'fs-comments-closed', role: 'status', children: '作者已关闭评论，已有评论和回复仍可查看。' }),
    enabled && (user ? n.jsxs('form', { className: 'tw-thread-compose', onSubmit: event => { event.preventDefault(); if (data && text.trim()) void mutate({ op: 'comment', text, parentId: reply?.id || '' }); }, children: [
      reply && n.jsxs('div', { className: 'tw-reply-context', children: [n.jsx('span', { children: '回复 @' + reply.name }), n.jsx('button', { type: 'button', className: 'tw-text-button', disabled: busy, onClick: () => { setReply(null); input.current?.focus(); }, children: '取消回复' })] }),
      n.jsx('textarea', { ref: input, 'aria-label': reply ? '回复评论' : '写评论', placeholder: reply ? '回复 @' + reply.name + '…' : '分享你的看法…', maxLength: 1000, rows: 3, value: text, disabled: busy || !data, onChange: event => setText(event.target.value) }),
      n.jsxs('div', { className: 'tw-comment-compose-actions', children: [n.jsx('small', { className: 'muted', children: text.length + ' / 1000' }), n.jsx('button', { type: 'submit', className: 'btn btn-dark btn-small', disabled: busy || !data || !text.trim(), children: busy ? '提交中…' : reply ? '发表回复' : '发表评论' })] }),
    ] }) : n.jsxs('p', { className: 'muted', children: [n.jsx(q, { to: login, children: '登录' }), '后参与评论或回复。'] })),
    error && n.jsx('p', { className: 'error', role: 'alert', children: error }), status && n.jsx('p', { role: 'status', children: status }),
    !data && !error && n.jsx('p', { className: 'muted', children: '正在载入评论…' }),
    data && !data.comments.length && n.jsx('p', { className: 'muted', children: '还没有评论。' }),
    n.jsx('div', { className: 'tw-comments', children: discussions }),
    data && data.comments.length < data.total && n.jsx('small', { className: 'muted', children: '显示最近 50 个讨论及其回复。' }),
  ] });
}
