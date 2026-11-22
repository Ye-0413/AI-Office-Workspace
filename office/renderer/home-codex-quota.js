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
      title: 'Codex 额度', unavailable: '等待记录', stale: '已过期',
      unavailableDetail: '尚未从本机 Codex 日志观察到可用额度。',
      recentDetail: '显示最近一次观察；额度可能在记录之间变化。',
      staleDetail: '当前显示上次观察值，等待新的 Codex 记录。',
      source: '来源：本机 Codex 会话日志。记录可能来自不同账号，不能确认当前账号；这不是货币余额。',
      primary: '第一时段', secondary: '第二时段', unknownDuration: '时长未报告', outer: '外环', inner: '内环',
      remaining: '剩余 {value}', reset: '报告重置：{time}（香港）', noReset: '未报告重置时间',
      observed: '观察时间：{time}（香港）', day: '天', hour: '小时', minute: '分钟',
      shortDay: '天', shortHour: '时', shortMinute: '分'
    },
    en: {
      title: 'Codex quota', unavailable: 'Waiting', stale: 'Stale',
      unavailableDetail: 'No available quota has been observed in local Codex logs yet.',
      recentDetail: 'The latest observation may change between records.',
      staleDetail: 'Showing the last observation while waiting for a fresh Codex record.',
      source: 'Source: local Codex session logs. Records may come from different accounts; the current account cannot be confirmed. This is not a cash balance.',
      primary: 'Primary window', secondary: 'Secondary window', unknownDuration: 'duration not reported', outer: 'Outer ring', inner: 'Inner ring',
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
    if (used < 100 && used > 99.9) return '<0.1%';
    if (used > 0 && used < 0.1) return '>99.9%';
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
  function paintRing(group, fill, window) {
    const remaining = window ? 100 - window.usedPercent : 0;
    group.dataset.slot = window?.slot || '';
    group.dataset.remaining = window ? String(remaining) : '';
    fill.setAttribute('visibility', remaining > 0 ? 'visible' : 'hidden');
    if (remaining <= 0) return;

    // A rounded cap extends beyond the arc by half the stroke width. Trim
    // both ends so the painted angle still represents the reported fraction.
    const cap = Math.asin(Number(group.getAttribute('stroke-width')) / (2 * Number(fill.getAttribute('r')))) * 100 / Math.PI;
    const trim = remaining > cap && remaining < 100 ? cap : 0;
    fill.setAttribute('stroke-linecap', trim ? 'round' : 'butt');
    fill.setAttribute('stroke-dashoffset', String(-trim / 2));
    fill.setAttribute('stroke-dasharray', `${remaining - trim} 100`);
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
    function paintDial(windows) {
      panel.dataset.rings = String(windows.length);
      const value = get('home-codex-quota-value');
      value.textContent = formatRemaining(windows[0]?.usedPercent);
      value.dataset.length = String(value.textContent.length);
      for (const [index, position] of ['outer', 'inner'].entries()) {
        const window = windows[index], id = 'home-codex-quota-' + position;
        paintRing(get(id), get(id + '-fill'), window);
        const label = get(id + '-label');
        if (window) {
          const short = windows.length > 1 || language === 'en';
          label.textContent = formatDuration(window.windowMinutes, language, short) || (window.slot === 'primary' ? '①' : '②');
        } else {
          label.textContent = position === 'outer' ? tr('unavailable') : '';
        }
      }
    }
    function render() {
      const found = new Map();
      if (quota?.available === true && validTime(quota.observedAt) && Array.isArray(quota.windows)) {
        for (const window of quota.windows) {
          if (window && ['primary', 'secondary'].includes(window.slot) && validPercent(window.usedPercent) && !found.has(window.slot)) found.set(window.slot, window);
        }
      }
      const available = found.size > 0, stale = available && quota.stale === true;
      panel.dataset.state = !available ? 'unavailable' : stale ? 'stale' : 'recent';
      const badge = get('home-codex-quota-status');
      badge.textContent = stale ? tr('stale') : '';
      badge.hidden = !stale;
      get('home-codex-quota-details-title').textContent = tr('title');
      const status = tr(!available ? 'unavailableDetail' : stale ? 'staleDetail' : 'recentDetail');
      get('home-codex-quota-details-status').textContent = status;
      get('home-codex-quota-source').textContent = tr('source');
      toggle.setAttribute('aria-label', tr('title'));
      const descriptions = [status];
      const slots = ['primary', 'secondary'];
      const windows = slots.map(slot => found.get(slot)).filter(Boolean);
      // A single weekly report also owns the outer ring. When both periods
      // are known, the shorter period goes outside regardless of slot order.
      if (windows.length === 2 && windows.every(w => Number.isFinite(w.windowMinutes) && w.windowMinutes > 0)
        && windows[1].windowMinutes < windows[0].windowMinutes) windows.reverse();
      paintDial(windows);
      for (const slot of slots) {
        const window = found.get(slot), detail = get(`home-codex-quota-${slot}-detail`);
        detail.hidden = !window;
        if (!window) continue;
        const value = formatRemaining(window.usedPercent);
        const duration = formatDuration(window.windowMinutes, language);
        const position = windows[0] === window ? 'outer' : 'inner';
        const heading = `${tr(position)} · ${tr(slot)} · ${duration || tr('unknownDuration')}`;
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
