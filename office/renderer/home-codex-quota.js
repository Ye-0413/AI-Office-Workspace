/* Present the last passively observed Codex allowance; it is not a cash balance. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeHomeCodexQuota = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const COPY = {
    zh: {
      title: 'Codex 额度', unavailable: '等待记录', recent: '已观察', stale: '已过期',
      unavailableDetail: '尚未从本机 Codex 日志观察到可用额度。',
      recentDetail: '显示最近一次观察；额度可能在记录之间变化。',
      staleDetail: '记录已超过 5 分钟，或报告的重置时间已过；等待新的 Codex 记录。',
      source: '来源：本机 Codex 会话日志。记录可能来自不同账号，不能确认当前账号；这不是货币余额。',
      primary: '第一时段', secondary: '第二时段', unknownDuration: '时长未报告',
      remaining: '剩余 {value}', reset: '报告重置：{time}（香港）', noReset: '未报告重置时间',
      observed: '观察时间：{time}（香港）', day: '天', hour: '小时', minute: '分钟',
      shortDay: '天', shortHour: '时', shortMinute: '分'
    },
    en: {
      title: 'Codex quota', unavailable: 'Waiting', recent: 'Observed', stale: 'Stale',
      unavailableDetail: 'No available quota has been observed in local Codex logs yet.',
      recentDetail: 'The latest observation may change between records.',
      staleDetail: 'This observation is over 5 minutes old or a reported reset has passed; waiting for a new Codex record.',
      source: 'Source: local Codex session logs. Records may come from different accounts; the current account cannot be confirmed. This is not a cash balance.',
      primary: 'Primary window', secondary: 'Secondary window', unknownDuration: 'duration not reported',
      remaining: '{value} remaining', reset: 'Reported reset: {time} (Hong Kong)', noReset: 'Reset time not reported',
      observed: 'Observed: {time} (Hong Kong)', day: 'day', hour: 'hour', minute: 'minute',
      shortDay: 'd', shortHour: 'h', shortMinute: 'm'
    }
  };
  function validPercent(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; }
  function validTime(value) { return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()); }
  function formatRemaining(used) {
    if (!validPercent(used)) return '—';
    const remaining = 100 - used;
    if (remaining > 0 && remaining < 0.1) return '<0.1%';
    if (remaining < 100 && remaining > 99.9) return '>99.9%';
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(remaining) + '%';
  }
  function formatDuration(value, language = 'en', short = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    const copy = COPY[language === 'en' ? 'en' : 'zh'];
    const [amount, unit] = value % 1440 === 0 ? [value / 1440, 'day'] : value % 60 === 0 ? [value / 60, 'hour'] : [value, 'minute'];
    const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3, useGrouping: false }).format(amount);
    if (short) return number + copy[{ day: 'shortDay', hour: 'shortHour', minute: 'shortMinute' }[unit]];
    return language === 'en' ? `${number} ${copy[unit]}${amount === 1 ? '' : 's'}` : `${number} ${copy[unit]}`;
  }
  function create(options = {}) {
    const doc = options.document || (typeof document === 'object' ? document : null);
    const get = id => doc?.getElementById(id);
    const panel = get('home-codex-quota'), toggle = get('home-codex-quota-toggle'), details = get('home-codex-quota-details');
    if (!panel || !toggle || !details) return Object.freeze({ update() {}, updateLanguage() {}, destroy() {} });
    const ledger = get('activity-stats');
    let language = options.language === 'en' ? 'en' : 'zh', quota = null, open = false;
    const tr = (key, values) => COPY[language][key].replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? '—'));
    function time(value) {
      return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', {
        timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(new Date(value));
    }
    function setOpen(value) {
      open = Boolean(value); details.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (ledger) ledger.dataset.quotaOpen = String(open);
    }
    const onToggle = () => setOpen(!open);
    const onPointerDown = event => { if (open && !panel.contains(event.target)) setOpen(false); };
    const onKeyDown = event => {
      if (!open || event.key !== 'Escape') return;
      setOpen(false);
      if (panel.contains(doc.activeElement)) toggle.focus();
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    toggle.addEventListener('click', onToggle);
    doc.addEventListener('pointerdown', onPointerDown);
    doc.addEventListener('keydown', onKeyDown);
    function render() {
      const found = new Map();
      if (quota?.available === true && validTime(quota.observedAt) && Array.isArray(quota.windows)) {
        for (const window of quota.windows) {
          if (window && ['primary', 'secondary'].includes(window.slot) && validPercent(window.usedPercent) && !found.has(window.slot)) found.set(window.slot, window);
        }
      }
      const available = found.size > 0, stale = available && quota.stale === true;
      panel.dataset.state = !available ? 'unavailable' : stale ? 'stale' : 'recent';
      get('home-codex-quota-label').textContent = tr('title');
      get('home-codex-quota-status').textContent = tr(!available ? 'unavailable' : stale ? 'stale' : 'recent');
      get('home-codex-quota-details-title').textContent = tr('title');
      const status = tr(!available ? 'unavailableDetail' : stale ? 'staleDetail' : 'recentDetail');
      get('home-codex-quota-details-status').textContent = status;
      get('home-codex-quota-source').textContent = tr('source');
      toggle.setAttribute('aria-label', tr('title'));
      const descriptions = [status];
      for (const [slot, fallback] of [['primary', '1'], ['secondary', '2']]) {
        const window = found.get(slot), row = get(`home-codex-quota-${slot}`), detail = get(`home-codex-quota-${slot}-detail`);
        row.hidden = !window && (available || slot === 'secondary');
        detail.hidden = !window;
        if (!window) {
          get(`home-codex-quota-${slot}-label`).textContent = '';
          get(`home-codex-quota-${slot}-value`).textContent = '—';
          get(`home-codex-quota-${slot}-fill`).style.width = '0%';
          row.dataset.level = 'unknown';
          continue;
        }
        const remaining = 100 - window.usedPercent;
        const value = formatRemaining(window.usedPercent);
        const duration = formatDuration(window.windowMinutes, language);
        get(`home-codex-quota-${slot}-label`).textContent = formatDuration(window.windowMinutes, language, true) || fallback;
        get(`home-codex-quota-${slot}-value`).textContent = value;
        get(`home-codex-quota-${slot}-fill`).style.width = `${remaining}%`;
        row.dataset.level = remaining <= 15 ? 'low' : remaining <= 40 ? 'watch' : 'normal';
        const heading = `${tr(slot)} · ${duration || tr('unknownDuration')}`;
        const windowDetail = `${tr('remaining', { value })} · ${validTime(window.resetAt) ? tr('reset', { time: time(window.resetAt) }) : tr('noReset')}`;
        get(`home-codex-quota-${slot}-detail-label`).textContent = heading;
        get(`home-codex-quota-${slot}-detail-value`).textContent = windowDetail;
        descriptions.push(`${heading}: ${windowDetail}.`);
      }
      const observed = available ? tr('observed', { time: time(quota.observedAt) }) : '';
      get('home-codex-quota-observed').textContent = observed;
      if (observed) descriptions.push(observed + '.');
      descriptions.push(tr('source'));
      const description = descriptions.join(' ');
      get('home-codex-quota-accessible').textContent = description;
      toggle.title = description;
    }
    function update(snapshot) { quota = snapshot?.codexQuota || null; render(); }
    function updateLanguage(value) { language = value === 'en' ? 'en' : 'zh'; render(); }
    function destroy() {
      toggle.removeEventListener('click', onToggle);
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('keydown', onKeyDown);
      setOpen(false);
    }
    setOpen(false); render();
    return Object.freeze({ update, updateLanguage, destroy });
  }
  return Object.freeze({ create, formatDuration, formatRemaining });
});
