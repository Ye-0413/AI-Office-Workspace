/* The keepsake shelf, earned room decorations and the growth stage. The view
 * only reads the main-process unlock ledger; play and clicks never earn. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('../lib/progression-model.js') : root.OfficeProgression);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeProgressionView = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Progression) {
  'use strict';

  const REFRESH_MS = 60000;
  const PLACES = Object.freeze({ fern: [27, 58], lamp: [58.5, 47], trophy: [35, 42], bunting: [44, 13], clock: [73, 25] });
  const COPY = {
    zh: { open: '纪念品架', eyebrow: '真实工作换来的小东西', title: '纪念品架', close: '关闭纪念品架', keepsakes: '纪念品', decorations: '房间装饰', growth: '伙伴成长',
      locked: '还没带来', keepsakeHint: '完成一轮真实对话的伙伴会带来自己的纪念品。', stage: '第 {stage} / 3 阶段', next: '再完成 {count} 轮进入下一阶段', top: '已到最高阶段',
      note: '全部来自本机使用记录，可随时重建；点击、抚摸或玩具都不会增加。', unavailable: '纪念品架暂不可用。' },
    en: { open: 'Keepsake shelf', eyebrow: 'Small things earned by real work', title: 'Keepsake shelf', close: 'Close keepsake shelf', keepsakes: 'Keepsakes', decorations: 'Room decorations', growth: 'Companion growth',
      locked: 'Not yet', keepsakeHint: 'A companion brings its keepsake after finishing a real turn.', stage: 'Stage {stage} / 3', next: '{count} more turns to the next stage', top: 'Top stage reached',
      note: 'Everything comes from local usage records and can be rebuilt; clicks, petting and toys never add to it.', unavailable: 'The keepsake shelf is unavailable.' }
  };
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));

  function create({ bridge, office, world, getLanguage = () => 'zh', isHidden = () => false, persona } = {}) {
    const document = office?.ownerDocument;
    if (!document || !world || typeof bridge?.getProgression !== 'function' || !Progression) return Object.freeze({ refresh() {}, updateLanguage() {}, destroy() {} });
    const copy = () => COPY[getLanguage() === 'en' ? 'en' : 'zh'];
    const make = (tag, className, parent) => { const node = document.createElement(tag); if (className) node.className = className; parent?.append(node); return node; };
    let state = null, destroyed = false, serial = 0;

    const decorations = make('div', 'room-decorations', world); decorations.setAttribute('aria-hidden', 'true');
    const button = make('button', 'keepsake-shelf-button', world); button.type = 'button';
    const dialog = make('dialog', 'office-dialog keepsake-shelf-dialog', office); dialog.setAttribute('aria-labelledby', 'keepsake-shelf-title');
    const header = make('div', 'dialog-header', dialog), titles = make('div', '', header);
    const eyebrow = make('span', 'dialog-eyebrow', titles), title = make('h2', '', titles); title.id = 'keepsake-shelf-title';
    const close = make('button', 'dialog-close', header); close.type = 'button'; close.textContent = '×';
    const body = make('div', 'keepsake-shelf-body', dialog);

    function section(name) { const part = make('section', 'keepsake-shelf-section', body); make('h3', '', part).textContent = name; return part; }
    function render() {
      const text = copy(), language = getLanguage() === 'en' ? 'en' : 'zh';
      button.setAttribute('aria-label', text.open); button.title = text.open;
      eyebrow.textContent = text.eyebrow; title.textContent = text.title; close.setAttribute('aria-label', text.close);
      body.replaceChildren();
      if (!state?.ok) { make('p', 'dialog-intro', body).textContent = text.unavailable; return; }
      const keep = section(text.keepsakes), grid = make('ul', 'keepsake-grid', keep);
      for (const item of Progression.KEEPSAKES) {
        const earned = state.keepsakes.includes(item.id), cell = make('li', 'keepsake-item', grid);
        cell.dataset.keepsake = item.id; cell.dataset.earned = String(earned);
        make('span', 'keepsake-icon', cell).textContent = earned ? item.icon : '?';
        make('span', 'keepsake-name', cell).textContent = earned ? item[language] : text.locked;
      }
      make('p', 'keepsake-hint', keep).textContent = text.keepsakeHint;
      const decor = section(text.decorations), list = make('ul', 'decoration-list', decor);
      for (const item of Progression.DECORATIONS) {
        const earned = state.decorations.includes(item.id), row = make('li', 'decoration-item', list);
        row.dataset.decoration = item.id; row.dataset.earned = String(earned);
        make('span', 'decoration-name', row).textContent = item[language];
        make('span', 'decoration-hint', row).textContent = language === 'en' ? item.hintEn : item.hintZh;
        const meter = make('progress', '', row); meter.max = 1; meter.value = earned ? 1 : state.progress?.[item.id] || 0;
      }
      const grow = section(text.growth);
      make('p', 'growth-stage', grow).textContent = fill(text.stage, { stage: state.growth }) + ' · '
        + (state.nextGrowth === null ? text.top : fill(text.next, { count: Math.max(0, state.nextGrowth - state.turns) }));
      make('p', 'keepsake-hint', body).textContent = text.note;
    }
    function place() {
      decorations.replaceChildren();
      for (const id of state?.decorations || []) {
        const [left, top] = PLACES[id] || [], image = make('img', 'room-decoration', decorations);
        image.dataset.decoration = id; image.alt = ''; image.src = '../assets/decorations/' + id + '.svg';
        image.style.left = left + '%'; image.style.top = top + '%';
      }
    }
    function apply() {
      if (destroyed) return;
      // Attribute writes restyle every body, so only real changes are written.
      const growth = String(state?.growth || 0);
      if (office.dataset.growth !== growth) office.dataset.growth = growth;
      const earned = new Set(state?.keepsakes || []);
      for (const node of world.querySelectorAll('.actor[data-session-id]')) {
        const keepsake = earned.size ? persona?.(node.dataset.sessionId)?.keepsake : null;
        const value = String(Boolean(keepsake && earned.has(keepsake)));
        if (node.dataset.keepsakeEarned !== value) node.dataset.keepsakeEarned = value;
      }
    }
    async function refresh() {
      if (destroyed || isHidden()) return;
      const mine = ++serial;
      try {
        const next = await bridge.getProgression();
        if (destroyed || mine !== serial) return;
        state = next?.ok ? next : null;
      } catch { if (destroyed || mine !== serial) return; state = null; }
      place(); apply(); render();
    }
    const cast = world.querySelector('#actors');
    const watcher = cast && document.defaultView?.MutationObserver ? new document.defaultView.MutationObserver(apply) : null;
    watcher?.observe(cast, { childList: true });
    const timer = setInterval(refresh, REFRESH_MS);
    const open = () => { render(); if (!dialog.open) dialog.showModal?.(); };
    button.addEventListener('click', open);
    close.addEventListener('click', () => dialog.close?.());
    render(); refresh();
    return Object.freeze({
      refresh, apply,
      updateLanguage() { render(); },
      destroy() {
        destroyed = true; clearInterval(timer); watcher?.disconnect();
        button.removeEventListener('click', open);
        decorations.remove(); button.remove(); dialog.remove();
        delete office.dataset.growth;
      }
    });
  }

  return Object.freeze({ PLACES, COPY, create });
});
