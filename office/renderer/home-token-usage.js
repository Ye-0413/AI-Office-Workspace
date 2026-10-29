/* Read-only homepage totals from the local session-log importer. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeHomeTokenUsage = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const COPY = {
    zh: {
      daily: '今日 Token', weekly: '本周用量', title: 'Token 用量',
      source: '来源：受支持工具的本机会话日志；按香港自然日及周一至周日统计全部项目，不推算费用或额度。', coverage: '日志覆盖：{providers}。',
      units: 'M = 百万，B = 十亿，T = 万亿；面板数字为约数。',
      unavailable: '本机会话 Token 暂不可用。', importing: '正在导入，当前数值尚不完整。',
      failed: '导入或读取失败，当前数值可能不完整。', dailyCount: '{date}：{count} tokens',
      weeklyCount: '本周 {from} 至 {to}：{count} tokens', lastScan: '末次扫描：{time}（香港）'
    },
    en: {
      daily: 'Daily Token', weekly: 'Weekly usage', title: 'Token usage',
      source: 'Source: supported local session logs, across all projects. Hong Kong calendar days; weeks run Monday–Sunday. Cost and quota are not estimated.', coverage: 'Log coverage: {providers}.',
      units: 'M = million, B = billion, T = trillion; displayed totals are rounded.',
      unavailable: 'Local session tokens are unavailable.', importing: 'Import in progress; current values are incomplete.',
      failed: 'Import or read failed; current values may be incomplete.', dailyCount: '{date}: {count} tokens',
      weeklyCount: 'This week, {from} to {to}: {count} tokens', lastScan: 'Last scan: {time} (Hong Kong)'
    }
  };
  function validCount(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
  function formatTokens(value) {
    if (!validCount(value)) return '—';
    const tokens = Math.floor(value);
    const [divisor, unit] = tokens >= 1e12 ? [1e12, 'T'] : tokens >= 1e9 ? [1e9, 'B'] : [1e6, 'M'];
    const scaled = tokens / divisor;
    if (!tokens) return '0M';
    const rounded = scaled < 1 ? Math.min(Number(scaled.toPrecision(3)), 0.999) : scaled;
    return new Intl.NumberFormat('en-GB', { useGrouping: false, ...(scaled < 1 ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 2 }) }).format(rounded) + unit;
  }
  function create(options) {
    const config = options || {}, doc = config.document || (typeof document === 'object' ? document : null);
    const get = id => doc?.getElementById(id);
    const panel = get('home-token-usage');
    if (!panel) return Object.freeze({ update() {}, updateLanguage() {} });
    let language = config.language === 'en' ? 'en' : 'zh', usage = null;
    const tr = (key, values) => COPY[language][key].replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? '—'));
    const exact = value => new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'zh-CN').format(Math.floor(value));
    function render() {
      const available = usage?.available === true, error = Boolean(usage?.error), importing = Boolean(usage?.importing);
      get('home-token-daily-label').textContent = tr('daily'); get('home-token-weekly-label').textContent = tr('weekly');
      for (const [id, value] of [['home-token-daily', usage?.dailyTokens], ['home-token-weekly', usage?.weeklyTokens]]) {
        const node = get(id), next = available ? formatTokens(value) : '—';
        if (config.numberFlip) config.numberFlip.update(node, next);
        else node.textContent = next;
      }
      for (const id of ['home-token-daily', 'home-token-weekly']) get(id).dataset.long = String(get(id).textContent.length > 7);
      panel.dataset.available = String(available); panel.dataset.error = String(error); panel.dataset.importing = String(importing);
      const details = [tr('source'), tr('units')];
      const catalog = typeof globalThis === 'object' ? globalThis.OfficeProviders : null;
      const providers = Array.isArray(usage?.providers) ? usage.providers.filter(provider => typeof provider === 'string') : [];
      if (providers.length) details.push(tr('coverage', { providers: providers.map(provider => catalog?.getProvider(provider)?.name || provider).join(' / ') }));
      if (!available) details.push(tr('unavailable'));
      else {
        if (validCount(usage.dailyTokens)) details.push(tr('dailyCount', { date: usage.date, count: exact(usage.dailyTokens) }));
        if (validCount(usage.weeklyTokens)) details.push(tr('weeklyCount', { from: usage.weekFrom, to: usage.weekTo, count: exact(usage.weeklyTokens) }));
      }
      if (importing) details.push(tr('importing'));
      if (error) details.push(tr('failed'));
      const scan = new Date(usage?.lastScanAt ?? NaN);
      if (Number.isFinite(scan.getTime())) details.push(tr('lastScan', { time: new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', {
        timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(scan) }));
      const description = details.join(' ');
      panel.title = description; panel.setAttribute('aria-label', tr('title'));
      get('home-token-state').textContent = description;
    }
    function update(snapshot) { usage = snapshot?.tokenUsage || (snapshot && Object.hasOwn(snapshot, 'dailyTokens') ? snapshot : null); render(); }
    function updateLanguage(value) { language = value === 'en' ? 'en' : 'zh'; render(); }
    render();
    return Object.freeze({ update, updateLanguage });
  }
  return Object.freeze({ create, formatTokens });
});
