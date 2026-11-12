/* A daily recap card built only from local observed metadata and session
 * token totals. Project names appear only when the person opts in. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeUsageRecap = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const HK_OFFSET = 8 * 3600000, WIDTH = 1200, HEIGHT = 630;
  const COPY = {
    zh: {
      title: '每日回顾', day: '日期（香港）', projects: '包含项目名称', export: '导出 PNG', loading: '正在整理当天的记录…',
      unavailable: '每日回顾暂不可用。', empty: '这一天还没有观察到 Agent。', canceled: '已取消导出。', exported: '已导出回顾图片。', exportError: '导出未完成，请重试。',
      agents: 'Agent', agentsDetail: '主 Agent {roots} · 分身 {helpers}', turns: '轮次', tools: '工具调用', checks: '测试与构建', checksDetail: '通过 {passed} · 未通过 {failed}',
      active: '工作时长', waiting: '等待时长', tokens: 'Token', noTokens: '无日志覆盖', top: '最常做的事', none: '暂无', projectList: '项目',
      footer: '只含本机观察的元数据，不含对话、提示词或路径。', card: 'AI Work Space · 每日回顾',
      minutes: '{value} 分', hours: '{value} 小时 {minutes} 分'
    },
    en: {
      title: 'Daily recap', day: 'Day (Hong Kong)', projects: 'Include project names', export: 'Export PNG', loading: 'Gathering the day…',
      unavailable: 'The daily recap is unavailable.', empty: 'No agents were observed on this day.', canceled: 'Export canceled.', exported: 'Recap image exported.', exportError: 'Export did not finish. Please try again.',
      agents: 'Agents', agentsDetail: 'Main {roots} · clones {helpers}', turns: 'Turns', tools: 'Tool calls', checks: 'Tests and builds', checksDetail: '{passed} passed · {failed} not passed',
      active: 'Work time', waiting: 'Waiting time', tokens: 'Tokens', noTokens: 'No log coverage', top: 'Most of the day', none: 'None yet', projectList: 'Projects',
      footer: 'Local observed metadata only: no conversations, prompts or paths.', card: 'AI Work Space · Daily recap',
      minutes: '{value}m', hours: '{value}h {minutes}m'
    }
  };
  const ACTIVITIES = {
    reading: ['阅读', 'Reading'], searching: ['检索', 'Searching'], planning: ['规划', 'Planning'], coding: ['编写代码', 'Coding'],
    designing: ['设计', 'Designing'], testing: ['测试', 'Testing'], building: ['构建', 'Building'], running: ['执行', 'Running'],
    'waiting-tool': ['等待工具', 'Waiting for a tool'], 'waiting-user': ['等待回复', 'Waiting for input'], idle: ['空闲', 'Idle'],
    error: ['出错', 'Error'], unknown: ['观察中', 'Observing']
  };

  const fill = (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
  const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
  function hkDay(at = Date.now()) { return new Date(at + HK_OFFSET).toISOString().slice(0, 10); }
  function duration(ms, copy) {
    const minutes = Math.round(count(ms) / 60000);
    return minutes < 60 ? fill(copy.minutes, { value: minutes }) : fill(copy.hours, { value: Math.floor(minutes / 60), minutes: minutes % 60 });
  }
  function activity(id, language) { const pair = ACTIVITIES[id] || ACTIVITIES.unknown; return pair[language === 'en' ? 1 : 0]; }

  function rows(recap = {}, language = 'zh') {
    const copy = COPY[language === 'en' ? 'en' : 'zh'], totals = recap.totals || {}, checks = recap.checks || {};
    const top = (recap.activities || []).slice(0, 3).map(item => activity(item.activity, language));
    const result = [
      { key: 'agents', label: copy.agents, value: String(count(totals.agents)), detail: fill(copy.agentsDetail, { roots: count(totals.roots), helpers: count(totals.helpers) }) },
      { key: 'turns', label: copy.turns, value: String(count(totals.turns)) },
      { key: 'tools', label: copy.tools, value: String(count(totals.toolCalls)) },
      { key: 'checks', label: copy.checks, value: String(count(checks.passed) + count(checks.failed)), detail: fill(copy.checksDetail, { passed: count(checks.passed), failed: count(checks.failed) }) },
      { key: 'active', label: copy.active, value: duration(totals.activeMs, copy) },
      { key: 'waiting', label: copy.waiting, value: duration(totals.waitingMs, copy) },
      { key: 'tokens', label: copy.tokens, value: Number.isSafeInteger(recap.tokens) ? recap.tokens.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN') : copy.noTokens },
      { key: 'top', label: copy.top, value: top.length ? top.join(' · ') : copy.none }
    ];
    if (Array.isArray(recap.projects) && recap.projects.length) result.push({ key: 'projects', label: copy.projectList, value: recap.projects.slice(0, 3).map(item => String(item.name)).join(' · ') });
    return result;
  }

  function draw(canvas, recap, language = 'zh') {
    const copy = COPY[language === 'en' ? 'en' : 'zh'], context = canvas.getContext('2d');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    context.fillStyle = '#f2e5c9'; context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#e3cfa6'; context.fillRect(0, HEIGHT - 70, WIDTH, 70);
    context.strokeStyle = '#b79660'; context.lineWidth = 6; context.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6);
    context.fillStyle = '#513c2b'; context.font = '600 40px system-ui, sans-serif'; context.textBaseline = 'top';
    context.fillText(copy.card, 60, 50);
    context.fillStyle = '#866a48'; context.font = '28px system-ui, sans-serif'; context.fillText(String(recap.day || ''), 60, 104);
    const cells = rows(recap, language), lines = Math.ceil(cells.length / 4), gap = 15;
    const height = Math.min(140, Math.floor((HEIGHT - 90 - 165 - (lines - 1) * gap) / lines)), big = height >= 130 ? 40 : 32;
    cells.forEach((row, index) => {
      const column = index % 4, line = Math.floor(index / 4), x = 60 + column * 275, y = 165 + line * (height + gap);
      context.fillStyle = '#fff6df'; context.fillRect(x, y, 255, height);
      context.fillStyle = '#866a48'; context.font = '20px system-ui, sans-serif'; context.fillText(row.label, x + 18, y + 12);
      context.fillStyle = '#3e503e'; context.font = (row.value.length > 12 ? '600 22px' : '600 ' + big + 'px') + ' system-ui, sans-serif';
      context.fillText(row.value.length > 30 ? row.value.slice(0, 29) + '…' : row.value, x + 18, y + 42, 220);
      if (row.detail) { context.fillStyle = '#927b58'; context.font = '17px system-ui, sans-serif'; context.fillText(row.detail, x + 18, y + height - 28, 220); }
    });
    context.fillStyle = '#7d6243'; context.font = '20px system-ui, sans-serif'; context.fillText(copy.footer, 60, HEIGHT - 48);
    return canvas;
  }

  function create({ bridge, dialog, getLanguage = () => 'zh', now = () => Date.now() } = {}) {
    const document = dialog?.ownerDocument, anchor = dialog?.querySelector?.('#usage-token-section');
    if (!document || !anchor || typeof bridge?.getUsageRecap !== 'function') return Object.freeze({ updateLanguage() {}, refresh() {}, dispose() {} });
    const copy = () => COPY[getLanguage() === 'en' ? 'en' : 'zh'];
    const make = (tag, className, parent) => { const node = document.createElement(tag); if (className) node.className = className; parent?.append(node); return node; };
    const section = make('section', 'usage-recap-section');
    section.setAttribute('aria-labelledby', 'usage-recap-title');
    const heading = make('div', 'usage-section-heading', section), title = make('h3', '', heading); title.id = 'usage-recap-title';
    const controls = make('div', 'usage-recap-controls', section);
    const dayLabel = make('label', '', controls), dayText = make('span', '', dayLabel), dayInput = make('input', '', dayLabel); dayInput.type = 'date';
    const projectLabel = make('label', 'usage-recap-privacy', controls), projects = make('input', '', projectLabel), projectText = make('span', '', projectLabel); projects.type = 'checkbox';
    const exportButton = make('button', 'button button-paper', controls); exportButton.type = 'button';
    const feedback = make('div', 'usage-feedback', section); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const list = make('dl', 'usage-overview usage-recap-overview', section);
    anchor.before(section);
    let current = null, generation = 0, disposed = false, busy = false;

    function label() {
      const text = copy();
      title.textContent = text.title; dayText.textContent = text.day; projectText.textContent = text.projects; exportButton.textContent = text.export;
    }
    function render() {
      list.replaceChildren();
      if (!current) return;
      for (const row of rows(current, getLanguage())) {
        const item = make('div', 'usage-metric usage-recap-item', list); item.dataset.key = row.key;
        make('dt', '', item).textContent = row.label;
        const value = make('dd', '', item); value.textContent = row.value;
        if (row.detail) make('small', '', value).textContent = row.detail;
      }
    }
    async function refresh() {
      if (disposed) return;
      const serial = ++generation, text = copy();
      if (!dayInput.value) dayInput.value = hkDay(now());
      feedback.textContent = text.loading; section.setAttribute('aria-busy', 'true');
      try {
        const result = await bridge.getUsageRecap({ day: dayInput.value, includeProjects: projects.checked });
        if (serial !== generation || disposed) return;
        current = result?.ok ? result : null;
        feedback.textContent = !current ? text.unavailable : current.totals?.agents ? '' : text.empty;
      } catch {
        if (serial !== generation || disposed) return;
        current = null; feedback.textContent = text.unavailable;
      }
      section.setAttribute('aria-busy', 'false'); exportButton.disabled = !current; render();
    }
    async function exportImage() {
      if (!current || busy || typeof bridge.exportUsageRecap !== 'function') return;
      busy = true; exportButton.disabled = true;
      const text = copy();
      try {
        const png = draw(document.createElement('canvas'), current, getLanguage()).toDataURL('image/png');
        const result = await bridge.exportUsageRecap({ day: current.day, png });
        if (!disposed) feedback.textContent = result?.canceled ? text.canceled : result?.exported ? text.exported : text.exportError;
      } catch { if (!disposed) feedback.textContent = text.exportError; }
      finally { busy = false; if (!disposed) exportButton.disabled = !current; }
    }
    const opened = new (document.defaultView?.MutationObserver || class { observe() {} disconnect() {} })(() => { if (dialog.open) refresh(); });
    opened.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dayInput.addEventListener('change', refresh);
    projects.addEventListener('change', refresh);
    exportButton.addEventListener('click', exportImage);
    exportButton.disabled = true;
    label();
    return Object.freeze({
      refresh,
      updateLanguage() { label(); render(); },
      dispose() { disposed = true; ++generation; opened.disconnect(); section.remove(); }
    });
  }

  return Object.freeze({ COPY, hkDay, rows, draw, create });
});
