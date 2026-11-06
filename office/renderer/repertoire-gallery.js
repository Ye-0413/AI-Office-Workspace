/* A labelled, isolated specimen viewer. It never enters the live roster,
 * allocates a family appearance, or writes an observed session. */
(function (root) {
  'use strict';
  const stateLabels = {
    reading: ['阅读', 'Reading'], searching: ['搜索', 'Searching'], planning: ['思考', 'Thinking'], coding: ['编码', 'Coding'],
    designing: ['设计', 'Designing'], testing: ['测试', 'Testing'], building: ['构建', 'Building'], running: ['执行', 'Running'],
    'waiting-tool': ['等待工具', 'Waiting for tool'], 'waiting-user': ['等待用户', 'Waiting for you'], error: ['异常', 'Error']
  };
  function create({ container } = {}) {
    const Repertoire = root.OfficeCreatureRepertoire, Performance = root.OfficeAvatarPerformance || root.OfficeCreaturePerformance, Appearance = root.OfficeAgentAppearance;
    if (!container || !Repertoire || !Performance || !Appearance) return null;
    const document = container.ownerDocument, details = document.createElement('details'); details.className = 'repertoire-gallery';
    const summary = document.createElement('summary'), content = document.createElement('div'); content.className = 'repertoire-content';
    const note = document.createElement('p'); note.className = 'repertoire-note';
    const fields = document.createElement('div'); fields.className = 'repertoire-fields';
    function field(name, values, attached = true) {
      const label = document.createElement('label'), text = document.createElement('span'), select = document.createElement('select');
      select.name = name;
      for (const value of values) { const option = document.createElement('option'); option.value = value; select.append(option); }
      label.append(text, select); if (attached) fields.append(label); return { label, text, select };
    }
    const character = field('repertoire-character', Repertoire.SPECIES), state = field('repertoire-state', Repertoire.ACTIVITIES);
    const variant = field('repertoire-variant', ['painted', ...Array.from({ length: 10 }, (_, index) => String(index))], false);
    const preview = document.createElement('figure'); preview.className = 'repertoire-preview'; preview.setAttribute('aria-hidden', 'true');
    const body = document.createElement('span'); body.className = 'character-body';
    const image = document.createElement('img'); image.alt = ''; image.draggable = false; body.append(image); preview.append(body);
    const title = document.createElement('h4'), description = document.createElement('p'); description.className = 'repertoire-description';
    const controls = document.createElement('div'); controls.className = 'repertoire-controls';
    const previous = document.createElement('button'), play = document.createElement('button'), next = document.createElement('button');
    for (const button of [previous, play, next]) { button.type = 'button'; controls.append(button); }
    const caption = document.createElement('p'); caption.className = 'repertoire-caption'; caption.setAttribute('aria-live', 'polite');
    content.append(note, fields, preview, title, description, controls, caption); details.append(summary, content); container.append(details);
    let controller = null, session = null, language = 'zh', paused = false, quiet = false, disposed = false;
    const english = () => language === 'en';
    function syncPlayback() {
      if (!controller || !details.open) return;
      // Document visibility belongs to the controller's live listener. Do not
      // copy it into inherited options or a background refresh becomes sticky.
      const reference = preferences.avatarStyle === 'painted' && variant.select.value !== 'painted';
      controller.update(session, { now: Date.now(), preview: true, repertoireIndex: reference ? Number(variant.select.value) : undefined, hidden: paused || preferences.hidden === true, reducedMotion: quiet });
    }
    function paintCopy() {
      const en = english(), painted = preferences.avatarStyle === 'painted';
      summary.textContent = painted
        ? (en ? 'Painted motion gallery · 55 activities' : '手绘动作图鉴 · 55 套动作')
        : (en ? 'Pixel motion gallery · 55 activities' : '像素动作图鉴 · 55 套动作');
      note.textContent = en ? 'Animation specimens. These are demonstrations, separate from your real sessions.' : '这里是动作演示，供你查看角色细节，不代表正在运行的真实会话。';
      character.text.textContent = en ? 'Companion' : '伙伴'; state.text.textContent = en ? 'Activity' : '状态';
      for (const option of character.select.options) { const design = Appearance.catalog.find(item => item.id === option.value); option.textContent = en ? design.labelEn : design.labelZh; }
      for (const option of state.select.options) option.textContent = stateLabels[option.value][en ? 1 : 0];
      const stateLabel = stateLabels[state.select.value][en ? 1 : 0];
      const recipes = painted ? Repertoire.recipes(character.select.value, state.select.value) : [];
      const reference = painted ? recipes[Number(variant.select.value)] : null;
      if (painted) {
        variant.text.textContent = en ? 'Variation' : '动作';
        for (const option of variant.select.options) {
          const recipe = recipes[Number(option.value)];
          option.textContent = recipe
            ? (en ? 'Reference ' : '参考 ') + String(Number(option.value) + 1).padStart(2, '0') + ' · ' + (en ? recipe.labelEn : recipe.labelZh)
            : (en ? 'Painted motion · Room animation' : '绘制动作 · 房间同款');
        }
      }
      title.textContent = reference ? (en ? reference.labelEn : reference.labelZh) : stateLabel;
      description.textContent = reference ? (en ? stateLabel + ' · ' + reference.labelEn : reference.beats.join(' → ')) : painted
        ? (en ? 'Four painted poses per loop.' : '每个循环由四张手绘姿态组成。')
        : (en ? 'Pixel art drawn at 30 frames per second.' : '活动以每秒 30 张像素帧绘制。');
      previous.textContent = en ? 'Previous' : '上一个'; next.textContent = en ? 'Next' : '下一个';
      play.textContent = quiet ? en ? 'Still pose' : '静态姿态' : paused ? en ? 'Play' : '播放' : en ? 'Pause' : '暂停';
      play.disabled = quiet; play.setAttribute('aria-pressed', String(paused || quiet));
      caption.textContent = quiet ? en ? 'Reduced motion or low power is on.' : '已遵循减少动态效果或低电耗设置。' : en ? 'Choose an activity to inspect its complete loop.' : '选择活动，观看完整循环。';
    }
    function render() {
      paintCopy(); if (!details.open || disposed) return;
      const material = Appearance.catalog.find(item => item.id === character.select.value);
      const design = root.OfficePublicArtwork?.design(material, preferences.avatarStyle) || material;
      session = { id: 'specimen:gallery:' + design.id, provider: 'codex', status: 'active', activity: state.select.value };
      if (!controller) controller = Performance.create({ actorNode: preview, body, image, session, design });
      else controller.setDesign(design);
      image.src = '../assets/avatars/' + design.asset; syncPlayback();
    }
    function stop() { controller?.destroy(); controller = null; session = null; }
    function toggle() { if (details.open) render(); else stop(); }
    function choose(delta) {
      const select = preferences.avatarStyle === 'painted' ? variant.select : state.select;
      const count = select.options.length;
      select.selectedIndex = (select.selectedIndex + delta + count) % count;
      render();
    }
    const selectActivity = () => { variant.select.value = 'painted'; render(); };
    details.addEventListener('toggle', toggle); character.select.addEventListener('change', selectActivity); state.select.addEventListener('change', selectActivity);
    variant.select.addEventListener('change', render);
    previous.addEventListener('click', () => choose(-1)); next.addEventListener('click', () => choose(1));
    play.addEventListener('click', () => { paused = !paused; syncPlayback(); paintCopy(); });
    const media = document.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
    let preferences = {};
    function update(value = preferences) {
      const styleChanged = value.avatarStyle !== preferences.avatarStyle;
      preferences = value; language = value.language === 'en' ? 'en' : 'zh'; quiet = Boolean(value.reducedMotion || value.lowPower || media.matches);
      if (styleChanged) {
        variant.select.value = 'painted';
        if (value.avatarStyle === 'painted') fields.append(variant.label);
        else variant.label.remove();
        render();
      } else { paintCopy(); syncPlayback(); }
    }
    const mediaChanged = () => update(); media.addEventListener('change', mediaChanged);
    // Closing the containing settings dialog also releases every specimen
    // clock. Native <details> alone does not know that its ancestor closed.
    const dialog = container.closest('dialog');
    const dialogClosed = () => { details.open = false; stop(); };
    dialog?.addEventListener('close', dialogClosed);
    update();
    return Object.freeze({ update, destroy() { if (disposed) return; disposed = true; stop(); media.removeEventListener('change', mediaChanged); dialog?.removeEventListener('close', dialogClosed); details.remove(); } });
  }
  root.OfficeRepertoireGallery = Object.freeze({ create });
})(typeof globalThis === 'object' ? globalThis : this);
