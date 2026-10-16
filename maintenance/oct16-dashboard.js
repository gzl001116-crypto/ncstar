function fanstarUtcRange(preset, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  if (preset === 'today') {}
  else if (preset === '7d') start.setUTCDate(start.getUTCDate() - 6);
  else if (preset === 'month') start.setUTCDate(1);
  else if (preset === 'year') { start.setUTCMonth(0, 1); }
  else start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function fanstarMoney(value, currency) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function FanstarIncomeLine({ data, metric }) {
  const rows = data.series, width = 800, height = 280, left = 84, right = 24, top = 22, bottom = 48;
  const values = rows.map(row => Number(row[metric] || 0));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const y = value => top + (max - value) / (max - min) * (height - top - bottom);
  const x = index => rows.length === 1 ? (left + width - right) / 2 : left + index / (rows.length - 1) * (width - left - right);
  const points = rows.map((row, index) => x(index) + ',' + y(row[metric])).join(' ');
  const labels = [...new Set([0, Math.floor((rows.length - 1) / 3), Math.floor((rows.length - 1) * 2 / 3), rows.length - 1])].filter(index => index >= 0);
  const title = metric === 'net' ? '净收入' : '成交收入';
  return n.jsxs('svg', { className: 'fs-income-svg', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title + '趋势，' + data.from + ' 至 ' + data.to + '，UTC，' + data.currency, children: [
    n.jsx('title', { children: title + '趋势（' + (data.bucket === 'month' ? '按 UTC 月份' : '按 UTC 日期') + '）' }),
    ...[0, 1, 2, 3, 4].map(index => {
      const value = min + (max - min) * index / 4, py = y(value);
      return n.jsxs('g', { children: [n.jsx('line', { x1: left, y1: py, x2: width - right, y2: py, stroke: '#dce4dc', strokeDasharray: '4 5' }), n.jsx('text', { x: left - 12, y: py + 4, textAnchor: 'end', className: 'fs-chart-label', children: Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2, notation: 'compact' }) })] }, index);
    }),
    rows.length > 1 && n.jsx('polygon', { points: `${x(0)},${y(0)} ${points} ${x(rows.length - 1)},${y(0)}`, fill: '#dcebe0', opacity: 0.65 }),
    rows.length > 1 && n.jsx('polyline', { points, fill: 'none', stroke: '#2c654a', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' }),
    ...rows.map((row, index) => n.jsxs('g', { children: [
      n.jsx('circle', { cx: x(index), cy: y(row[metric]), r: rows.length > 80 ? 1.8 : 3.5, fill: '#2c654a' }),
      n.jsx('circle', { cx: x(index), cy: y(row[metric]), r: 9, fill: 'transparent', tabIndex: 0, 'aria-label': row.date + ' UTC，' + title + ' ' + fanstarMoney(row[metric], data.currency) + '，' + row.orders + ' 笔', children: n.jsx('title', { children: row.date + ' UTC\n' + title + '：' + fanstarMoney(row[metric], data.currency) + '\n订单：' + row.orders + ' 笔' }) }),
    ] }, row.date)),
    ...labels.map(index => n.jsx('text', { x: x(index), y: height - 16, textAnchor: index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle', className: 'fs-chart-label', children: data.bucket === 'month' ? rows[index].date : rows[index].date.slice(5) }, index)),
    n.jsx('text', { x: left, y: 12, className: 'fs-chart-label', children: data.currency }),
  ] });
}

function FanstarIncomeTypes({ data }) {
  const names = { product: '作品销售', membership: '会员收入', support: '创作者支持', other: '其他收入' };
  const types = data.types.filter(row => row.kind !== 'other' || row.orders > 0);
  const largest = Math.max(1, ...types.map(row => Math.abs(row.net)));
  return n.jsx('div', { className: 'fs-income-types', children: types.map((row, index) => n.jsxs('div', { className: 'fs-income-type', children: [
    n.jsxs('div', { className: 'fs-type-label', children: [n.jsx('strong', { children: names[row.kind] || row.kind }), n.jsx('strong', { children: fanstarMoney(row.net, data.currency) })] }),
    n.jsx('div', { className: 'fs-type-track', role: 'img', 'aria-label': (names[row.kind] || row.kind) + '净收入 ' + fanstarMoney(row.net, data.currency), children: n.jsx('span', { style: { width: (Math.abs(row.net) / largest * 100) + '%', backgroundColor: ['#2c654a', '#8aa78b', '#bdad78', '#8d96a3'][index % 4] } }) }),
    n.jsx('small', { className: 'muted', children: row.orders + ' 笔订单' }),
  ] }, row.kind)) });
}

function FanstarDashboard() {
  const { user, posts, products, creatorById, followerCount, supporterCount } = he();
  const { t } = ye();
  const [preset, setPreset] = v.useState('30d');
  const [range, setRange] = v.useState(() => fanstarUtcRange('30d'));
  const [draft, setDraft] = v.useState(() => fanstarUtcRange('30d'));
  const [currency, setCurrency] = v.useState('CNY'), [metric, setMetric] = v.useState('net');
  const [data, setData] = v.useState(null), [error, setError] = v.useState(''), [validation, setValidation] = v.useState('');
  const [busy, setBusy] = v.useState(true), [revision, setRevision] = v.useState(0);
  v.useEffect(() => {
    if (!user?.isCreator) return;
    let active = true; setBusy(true); setData(null); setError('');
    const query = new URLSearchParams({ from: range.from, to: range.to, currency });
    Fe('/api/creator-dashboard?' + query).then(result => { if (active) setData(result); }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [user?.id, range.from, range.to, currency, revision]);
  const creator = creatorById(user?.handle || '');
  if (!user || !creator) return null;
  const changePreset = value => {
    setPreset(value); setValidation('');
    if (value !== 'custom') { const next = fanstarUtcRange(value); setDraft(next); setRange(next); }
  };
  const applyRange = event => {
    event.preventDefault();
    const from = new Date(draft.from + 'T00:00:00Z'), to = new Date(draft.to + 'T00:00:00Z');
    if (!draft.from || !draft.to || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || to.getTime() - from.getTime() > 3660 * 86400000) { setValidation('请选择有效日期范围，结束日期不能早于开始日期，最长支持 10 年。'); return; }
    setValidation(''); setPreset('custom'); setRange({ ...draft });
  };
  const summary = data?.summary;
  const cards = [
    ['净收入', summary && fanstarMoney(summary.net, currency), '已扣平台服务费', 'fs-stat-net'],
    ['成交收入', summary && fanstarMoney(summary.gross, currency), '所选期间的成交金额', ''],
    ['平台服务费', summary && fanstarMoney(summary.fee, currency), '按订单实际记账费用统计', ''],
    ['订单数', summary ? summary.orders.toLocaleString('zh-CN') : null, summary ? '平均净收入 ' + fanstarMoney(summary.average, currency) + ' / 笔' : '所选期间的成交订单', ''],
  ];
  return n.jsxs('div', { className: 'fs-dashboard', children: [
    n.jsxs('header', { className: 'fs-dashboard-heading', children: [n.jsxs('div', { children: [n.jsx('p', { className: 'kicker', children: '收入与创作' }), n.jsx('h2', { children: '仪表盘' }), n.jsx('p', { className: 'muted', children: '按 UTC 时间查看收入、订单与收入来源。' })] }), n.jsx(q, { to: '/c/' + creator.handle, className: 'btn btn-line btn-small', children: t('studio.viewPage') })] }),
    n.jsxs('section', { className: 'panel fs-dashboard-filters', 'aria-label': '收入统计筛选', children: [
      n.jsxs('div', { className: 'fs-filter-top', children: [n.jsx('div', { className: 'fs-period-buttons', role: 'group', 'aria-label': '时间范围', children: [['today', '今天'], ['7d', '近 7 天'], ['30d', '近 30 天'], ['month', '本月'], ['year', '今年'], ['custom', '自定义']].map(([value, label]) => n.jsx('button', { type: 'button', className: 'btn btn-small ' + (preset === value ? 'btn-dark' : 'btn-line'), 'aria-pressed': preset === value, onClick: () => changePreset(value), children: label }, value)) }),
        n.jsxs('label', { className: 'fs-currency-filter', children: ['记账币种', n.jsx('select', { value: currency, onChange: event => setCurrency(event.target.value), 'aria-label': '收入统计币种', children: (data?.currencies || [currency]).map(code => n.jsx('option', { value: code, children: code }, code)) })] }),
      ] }),
      n.jsxs('form', { className: 'fs-date-range', onSubmit: applyRange, children: [n.jsxs('label', { children: ['开始日期（UTC）', n.jsx('input', { type: 'date', value: draft.from, required: true, 'aria-label': '开始日期 UTC', onChange: event => { setDraft(value => ({ ...value, from: event.target.value })); setPreset('custom'); } })] }), n.jsx('span', { className: 'muted fs-date-separator', children: '至' }), n.jsxs('label', { children: ['结束日期（UTC）', n.jsx('input', { type: 'date', value: draft.to, required: true, 'aria-label': '结束日期 UTC', onChange: event => { setDraft(value => ({ ...value, to: event.target.value })); setPreset('custom'); } })] }), n.jsx('button', { className: 'btn btn-dark btn-small', type: 'submit', children: '应用日期' }), n.jsx('button', { className: 'btn btn-line btn-small', type: 'button', disabled: busy, onClick: () => setRevision(value => value + 1), children: '刷新' })] }),
      validation && n.jsx('p', { className: 'error', role: 'alert', children: validation }),
      n.jsx('small', { className: 'muted', children: range.from + ' — ' + range.to + ' · UTC 00:00 至结束日期次日 00:00（不含）' }),
    ] }),
    busy && n.jsx('p', { className: 'muted', role: 'status', children: '正在加载收入统计…' }),
    error && n.jsxs('div', { className: 'error fs-dashboard-error', role: 'alert', children: [error, n.jsx('button', { type: 'button', className: 'btn btn-line btn-small', onClick: () => setRevision(value => value + 1), children: '重试' })] }),
    n.jsx('div', { className: 'fs-revenue-stats', children: cards.map(([label, value, note, className]) => n.jsxs('div', { className: 'panel fs-revenue-stat ' + className, children: [n.jsx('span', { children: label }), n.jsx('strong', { children: value ?? '—' }), n.jsx('small', { children: note })] }, label)) }),
    data && n.jsxs(n.Fragment, { children: [
      data.summary.orders === 0 && n.jsx('p', { className: 'fs-dashboard-empty', children: '所选时间及币种暂无成交记录，图表按零收入显示。' }),
      n.jsxs('div', { className: 'fs-dashboard-charts', children: [
        n.jsxs('section', { className: 'panel fs-income-panel', children: [n.jsxs('div', { className: 'fs-chart-heading', children: [n.jsxs('div', { children: [n.jsx('h3', { children: '收入趋势' }), n.jsx('p', { className: 'muted', children: (data.bucket === 'month' ? '按月' : '按日') + '统计 · UTC · ' + data.currency })] }), n.jsx('select', { value: metric, onChange: event => setMetric(event.target.value), 'aria-label': '收入趋势指标', children: [n.jsx('option', { value: 'net', children: '净收入' }), n.jsx('option', { value: 'gross', children: '成交收入' })] })] }), n.jsx(FanstarIncomeLine, { data, metric })] }),
        n.jsxs('section', { className: 'panel fs-income-panel', children: [n.jsx('h3', { children: '收入来源' }), n.jsx('p', { className: 'muted', children: '分类净收入 · ' + data.currency }), n.jsx(FanstarIncomeTypes, { data })] }),
      ] }),
      n.jsx('p', { className: 'fineprint', children: '统计采用订单记录的金额和币种，不进行实时汇率换算。不同记账币种分别统计；净收入为成交收入扣除平台服务费，尚未扣除银行或支付服务商的结算费用。' }),
      n.jsxs('details', { className: 'panel fs-revenue-details', children: [n.jsx('summary', { children: data.bucket === 'month' ? '查看每月收入明细' : '查看每日收入明细' }), n.jsx('div', { className: 'fs-table-scroll', children: n.jsxs('table', { children: [n.jsx('caption', { children: data.from + ' 至 ' + data.to + ' · UTC · ' + data.currency }), n.jsx('thead', { children: n.jsx('tr', { children: ['日期（UTC）', '订单数', '成交收入', '平台服务费', '净收入'].map(label => n.jsx('th', { scope: 'col', children: label }, label)) }) }), n.jsx('tbody', { children: data.series.map(row => n.jsxs('tr', { children: [n.jsx('th', { scope: 'row', children: row.date }), n.jsx('td', { children: row.orders }), n.jsx('td', { children: fanstarMoney(row.gross, data.currency) }), n.jsx('td', { children: fanstarMoney(row.fee, data.currency) }), n.jsx('td', { children: fanstarMoney(row.net, data.currency) })] }, row.date)) })] }) })] }),
    ] }),
    n.jsxs('section', { className: 'fs-creator-brief', children: [n.jsx('h3', { children: '创作概况' }), n.jsx('div', { className: 'fs-creator-metrics', children: [[followerCount(creator), '关注者'], [supporterCount(creator.id), '支持者'], [posts.filter(post => post.creatorId === user.handle).length, '动态'], [products.filter(product => product.creatorId === user.handle).length, '作品']].map(([count, label]) => n.jsxs('div', { children: [n.jsx('strong', { children: count.toLocaleString('zh-CN') }), n.jsx('span', { children: label })] }, label)) }), n.jsx('div', { className: 'fs-dashboard-shortcuts', children: [['/studio/posts', '管理动态'], ['/studio/works', '管理作品'], ['/studio/tiers', '会员档位'], ['/studio/orders', '查看订单'], ['/studio/payout', '结算管理']].map(([to, label]) => n.jsx(q, { to, className: 'btn btn-line btn-small', children: label }, to)) })] }),
  ] });
}
