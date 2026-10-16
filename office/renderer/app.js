/* The room only presents observations. It never approves or executes agent work. */
(function () {
  'use strict';
  const Scene = window.OfficeScene;
  const Attendance = window.OfficeAttendance;
  const Director = window.OfficeAnimationDirector;
  const Family = window.OfficeFamily;
  const I18n = window.OfficeI18n;
  const bridge = window.office;
  const $ = (id) => document.getElementById(id);
  const office = $('office');
  const world = $('world');
  const actorsLayer = $('actors');
  const actors = new Map();
  const archivedTurns = new Map();
  const settingsDefaults = { rain: false, night: false, sceneTime: 'auto', nameStyle: 'classic', reducedMotion: false, lowPower: false, idleVisitor: true, sound: false, selectedProject: '', language: 'zh' };
  let settings = { ...settingsDefaults };
  let language = 'zh';
  const scenery = window.OfficeDayScenery.create({ office, world, layer: $('window-scenery') });
  const attendanceModels = { live: Attendance.createAttendance(), demo: Attendance.createAttendance() };
  let attendance = { present: [], entering: [], leaving: [], retired: [] };
  const staticCopy = [];
  const copyWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = copyWalker.nextNode(); node; node = copyWalker.nextNode()) if (node.nodeValue.trim()) staticCopy.push({ node, original: node.nodeValue });
  const staticAttributes = [...document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')].flatMap(node => ['aria-label','title','alt','placeholder'].filter(name => node.hasAttribute(name)).map(name => ({node,name,original:node.getAttribute(name)})));
  let doorTimer = 0;
  let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [], demo: { running: false, tick: 0 } };
  let selectedProject = '';
  let roomSelectionExplicit = false;
  let selectedSession = '';
  let page = 0;
  let seats = new Map();
  let rooms = [];
  let currentPage = { page: 0, pages: 1, roots: [], visible: [], hidden: 0, helperOverflow: 0 };
  let frameTimer = 0;
  let spriteNonce = 0;
  let destroyed = false;
  let snapshotReceived = 0;
  let mutationPending = false;
  let previousAttention = new Set();
  const mediaReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const providerIds = window.OfficeProviders.getAllProviders().map(provider => provider.id === 'cursor-agent' ? 'cursor' : provider.id);
  const observedIds = new Set();
  let familyGraph = Family.build([]);
  const visitor = window.OfficeIdleVisitor.create({ layer: $('visitors'), world, openDoor, context: () => ({ enabled: settings.idleVisitor, ready: snapshotReceived > 0, mode: snapshot.mode, busy: attendance.present.length > 0 || actors.size > 0, hidden: document.hidden, reducedMotion: reduced(), lowPower: settings.lowPower, language }) });

  function tr(value) { return I18n.translate(language, String(value == null ? '' : value)); }
  function text(element, value) {
    const literal = element.id === 'inspect-title' || element.id === 'inspect-session-id' || /(?:^|\s)(?:roster-task|project-option)(?:\s|$)/.test(element.className || '');
    element.textContent = literal ? String(value == null ? '' : value) : tr(value);
  }
  function applyLanguage() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = I18n.t(language, 'app.title');
    for (const item of staticCopy) if (item.node.isConnected) item.node.nodeValue = tr(item.original);
    for (const item of staticAttributes) if (item.node.isConnected) item.node.setAttribute(item.name, tr(item.original));
    $('language-button').textContent = language === 'en' ? '中文' : 'EN';
    $('language-button').setAttribute('aria-label', language === 'en' ? 'Switch to Chinese' : '切换到 English');
  }
  function openDoor() {
    $('studio-door').dataset.open = 'true';
    clearTimeout(doorTimer);
    doorTimer = setTimeout(() => { $('studio-door').dataset.open = 'false'; }, reduced() ? 200 : 1250);
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) text(node, content);
    return node;
  }
  function showError(error) {
    const message = error && error.message ? error.message : String(error || '操作未完成');
    text($('error-message').querySelector('span'), message);
    $('error-message').hidden = false;
  }
  async function call(method, ...args) {
    if (!bridge || typeof bridge[method] !== 'function') throw new Error('桌面连接尚未就绪，请重新打开小小工作室。');
    const result = await bridge[method](...args);
    if (result && (result.ok === false || result.status === 'error')) throw new Error(result.error || result.message || '操作未完成，请稍后重试。');
    return result;
  }
  async function attempt(action) {
    try { return await action(); }
    catch (error) { showError(error); return null; }
  }
  function persona(session) { return window.OfficeAgentPersona.forSession(session); }
  function displayName(session) { const p = persona(session); return settings.nameStyle === 'harbour' ? (language === 'en' ? p.aliasEn : p.aliasZh) : Scene.identityName(session); }
  function keepsakeIcon(session) { return ({teacup:'♨',paperboat:'⛵',bookmark:'▤',lantern:'✧',leaf:'❧',pebble:'◇',bell:'♧',pencil:'✎',shell:'⌁',star:'✦',acorn:'♧',ribbon:'⋈'})[persona(session).keepsake] || '✦'; }
  function reduced() { return settings.reducedMotion || mediaReduce.matches; }
  function quietSprites() { return reduced() || settings.lowPower || document.hidden; }
  function assetURL(name, replay) { return '../assets/avatars/' + name + (replay ? '?_t=' + (++spriteNonce) : ''); }
  function setPose(actor, name, replay = false) {
    const asset = quietSprites() ? 'clawd-static-base.svg' : name;
    actor.wantedAsset = name;
    if (actor.currentAsset === asset && !replay) return;
    actor.currentAsset = asset;
    actor.image.dataset.asset = asset;
    actor.image.src = assetURL(asset, replay && !quietSprites());
  }
  function timeAgo(value) {
    const milliseconds = Math.max(0, Date.now() - Scene.timestamp(value));
    if (!value || !Scene.timestamp(value)) return '尚未收到事件';
    if (milliseconds < 12000) return '刚刚收到事件';
    if (milliseconds < 60000) return Math.floor(milliseconds / 1000) + ' 秒前收到事件';
    if (milliseconds < 3600000) return Math.floor(milliseconds / 60000) + ' 分钟前收到事件';
    return Math.floor(milliseconds / 3600000) + ' 小时前收到事件';
  }
  function sourceName(source) {
    const value = String(source || '');
    if (/demo|模拟/i.test(value)) return '模拟事件';
    if (/hook/i.test(value)) return '工具 hook 事件';
    if (/jsonl|log|rollout|transcript/i.test(value)) return '只读会话日志';
    return value || '事件来源未提供';
  }
  function confidenceName(confidence) {
    const names = { high: '明确事件', medium: '基于工具类型判断', low: '活动尚不确定', exact: '明确事件', inferred: '基于工具类型判断', unknown: '活动尚不确定' };
    return names[confidence] || (Number.isFinite(confidence) ? '判断依据 ' + Math.round(confidence * 100) + '%' : '查看原始事件核对');
  }
  function refreshScale() {
    const scale = Math.min(office.clientWidth / Scene.WORLD.width, office.clientHeight / Scene.WORLD.height);
    $('world-frame').style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
  }
  function actorTransform(point, helper) {
    const depth = .76 + point.y / 500;
    return 'translate3d(' + (point.x * 12.8).toFixed(2) + 'px,' + (point.y * 7.2).toFixed(2) + 'px,0) scale(' + (depth * (helper ? .84 : 1)).toFixed(4) + ')';
  }
  function currentPosition(actor) {
    if (actor.motion) {
      try {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(actor.node).transform);
        if (Number.isFinite(matrix.m41) && Number.isFinite(matrix.m42)) return { x: matrix.m41 / 12.8, y: matrix.m42 / 7.2 };
      } catch (_) { /* Keep the last authoritative scene coordinate. */ }
    }
    return { ...actor.position };
  }
  function cancelAction(actor) {
    actor.serial += 1;
    if (actor.opacityMotion) { actor.opacityMotion.cancel(); actor.opacityMotion = null; }
    if (actor.motion) {
      actor.position = currentPosition(actor);
      actor.node.style.transform = actorTransform(actor.position, actor.helper);
      actor.motion.cancel();
      actor.motion = null;
    }
    for (const pending of actor.delays) { clearTimeout(pending.timer); pending.resolve(false); }
    actor.delays.clear();
    if (actor.defer) { clearTimeout(actor.defer); actor.defer = 0; }
    actor.queuedSeat = null;
    actor.node.dataset.walking = 'false';
    actor.node.dataset.reaction = 'false';
    actor.bubble.dataset.show = 'false';
    actor.completing = false;
    return actor.serial;
  }
  function delay(actor, milliseconds, serial) {
    if (actor.serial !== serial) return Promise.resolve(false);
    return new Promise((resolve) => {
      const pending = { timer: 0, resolve };
      pending.timer = setTimeout(() => { actor.delays.delete(pending); resolve(actor.serial === serial && !destroyed); }, milliseconds);
      actor.delays.add(pending);
    });
  }
  function say(actor, phrase, duration = 2300) {
    text(actor.bubble, phrase);
    actor.bubble.style.transform = 'translateX(-50%)';
    const bounds = actor.bubble.getBoundingClientRect();
    const displayScale = actor.button.getBoundingClientRect().width / actor.button.offsetWidth;
    const correction = Math.max(8 - bounds.left, Math.min(0, innerWidth - 8 - bounds.right));
    if (correction && displayScale > 0) actor.bubble.style.transform = 'translateX(calc(-50% + ' + (correction / displayScale).toFixed(2) + 'px))';
    actor.bubble.dataset.show = 'true';
    clearTimeout(actor.bubbleTimer);
    actor.bubbleTimer = setTimeout(() => { actor.bubble.dataset.show = 'false'; }, duration);
  }
  function ensureMotionTicker() {
    if (frameTimer || destroyed) return;
    function tick() {
      frameTimer = 0;
      if (destroyed) return;
      let moving = false;
      for (const actor of actors.values()) {
        if (actor.motion) {
          const point = currentPosition(actor);
          actor.node.style.zIndex = String(Math.round(point.y * 10));
          moving = true;
        }
      }
      renderHelperLinks();
      if (moving && !document.hidden) frameTimer = setTimeout(tick, settings.lowPower ? 240 : 110);
    }
    frameTimer = setTimeout(tick, 80);
  }
  async function move(actor, target, serial, carrying = false) {
    if (actor.serial !== serial) return false;
    const start = currentPosition(actor);
    const path = Scene.route(start, target);
    if (path.length < 2) { actor.node.dataset.walking = 'false'; return true; }
    const length = path.slice(1).reduce((sum, point, index) => sum + Scene.distance(path[index], point), 0);
    if (length < .65 || reduced() || document.hidden) {
      actor.position = { x: target.x, y: target.y };
      actor.node.style.transform = actorTransform(actor.position, actor.helper);
      actor.node.style.zIndex = String(Math.round(target.y * 10));
      actor.arrivedAt = performance.now();
      return true;
    }
    actor.node.dataset.walking = 'true';
    actor.carry.dataset.carry = String(carrying);
    text(actor.carry, actor.session.activity === 'reading' || actor.session.activity === 'searching' ? '≡' : '✓');
    setPose(actor, carrying ? 'clawd-working-carrying.svg' : 'clawd-static-base.svg');
    text(actor.state, '前往' + Scene.ZONES[target.zone || actor.spec.zone].name);
    const points = [];
    let traveled = 0;
    for (let index = 0; index < path.length; index += 1) {
      if (index) traveled += Scene.distance(path[index - 1], path[index]);
      points.push({ transform: actorTransform(path[index], actor.helper), offset: length ? traveled / length : index / (path.length - 1) });
    }
    // This is a character crossing a physical room, not a delayed UI transition.
    const duration = Math.max(360, Math.min(6000, length * 48));
    const motion = actor.node.animate(points, { duration, easing: 'linear', fill: 'forwards' });
    actor.motion = motion;
    ensureMotionTicker();
    try { await motion.finished; }
    catch (_) { return false; }
    if (actor.serial !== serial) return false;
    actor.position = { x: target.x, y: target.y };
    actor.node.style.transform = actorTransform(actor.position, actor.helper);
    actor.node.style.zIndex = String(Math.round(target.y * 10));
    actor.motion = null;
    motion.cancel();
    actor.node.dataset.walking = 'false';
    actor.arrivedAt = performance.now();
    if (!quietSprites()) {
      actor.arrival.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: .8, offset: .25 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 500, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    return true;
  }
  function finishAtStation(actor) {
    actor.spec = Scene.activitySpec(actor.session);
    actor.node.dataset.walking = 'false';
    const plan = Director.plan(actor.session, { now: Date.now(), language });
    const freshCue = plan.cueKey && plan.cueKey !== actor.lastCue;
    setPose(actor, plan.asset || actor.spec.asset, Boolean(freshCue));
    actor.node.dataset.phase = plan.phase || '';
    actor.node.dataset.workProp = plan.prop || '';
    if (freshCue && !quietSprites()) {
      actor.lastCue = plan.cueKey;
      say(actor, plan.caption, 2100);
      addEffect(actor.session.activity === 'error' ? 'problem' : 'reply', actor.position);
    } else if (actor.lastPhase && actor.lastPhase !== plan.phase && !quietSprites() && Date.now() - (actor.lastChatter || 0) > 12000) {
      say(actor, plan.caption, 1800);
      actor.lastChatter = Date.now();
    }
    actor.lastPhase = plan.phase;
    text(actor.state, plan.label || actor.spec.label);
    if (actor.session.id === selectedSession) renderInspector();
    updateProps();
  }
  async function settle(actor, seat, urgent = false) {
    const serial = cancelAction(actor);
    actor.target = seat;
    actor.spec = Scene.activitySpec(actor.session);
    if (actor.spec.stale) { finishAtStation(actor); return; }
    // Short bursts of tools in one area should not make a character pace constantly.
    const dwelling = performance.now() - actor.arrivedAt;
    if (!urgent && dwelling < 1700 && Scene.distance(actor.position, seat) > 1 && !actor.justEntered) {
      if (!await delay(actor, 1700 - dwelling, serial)) return;
    }
    actor.justEntered = false;
    if (!await move(actor, seat, serial, ['reading', 'searching'].includes(actor.session.activity))) return;
    finishAtStation(actor);
    const phrase = { library: '找找这里的线索', board: '把思路理一理', desk: '开始动手', bench: '看看运行结果', front: '需要你看一下', sofa: '等下一项工作' }[seat.zone];
    if (phrase && actor.lastZone !== seat.zone) say(actor, phrase, actor.session.activity === 'waiting-user' ? 4500 : 1900);
    actor.lastZone = seat.zone;
  }
  function addEffect(kind, point, target) {
    if (quietSprites()) return;
    const effect = element('span', 'scene-effect ' + (kind === 'delivery' || kind === 'reply' ? 'note-delivery' : 'task-spark'), kind === 'delivery' ? '✓' : kind === 'reply' ? '≡' : kind === 'problem' ? '!' : '✦');
    $('effects').append(effect);
    const from = { x: point.x * 12.8, y: point.y * 7.2 - 48 };
    const to = target ? { x: target.x * 12.8, y: target.y * 7.2 - 45 } : { x: from.x + 7, y: from.y - 40 };
    const animation = effect.animate([
      { transform: 'translate(' + from.x + 'px,' + from.y + 'px) rotate(-7deg)', opacity: 0 },
      { transform: 'translate(' + from.x + 'px,' + (from.y - 7) + 'px) rotate(-3deg)', opacity: 1, offset: .18 },
      { transform: 'translate(' + to.x + 'px,' + to.y + 'px) rotate(8deg)', opacity: 0 }
    ], { duration: kind === 'delivery' ? 1400 : 900, easing: 'cubic-bezier(.77,0,.175,1)' });
    animation.finished.catch(() => {}).finally(() => effect.remove());
  }
  async function completeTurn(actor, turnAt, restSeat) {
    const serial = cancelAction(actor);
    actor.completing = true;
    actor.target = restSeat || { x: 15, y: 79, zone: 'sofa' };
    actor.lastTurnAt = turnAt;
    actor.node.dataset.walking = 'false';
    text(actor.state, '这一轮完成');
    setPose(actor, 'clawd-happy.svg', true);
    say(actor, actor.helper ? '这一份交给你' : '这一轮完成啦', 2200);
    addEffect('spark', actor.position);
    if (!await delay(actor, quietSprites() ? 200 : 1900, serial)) return;
    const archive = { x: 84, y: 80, zone: 'archive' };
    if (!await move(actor, archive, serial, true)) return;
    setPose(actor, 'clawd-working-carrying.svg');
    text(actor.state, '把这一轮收好');
    addEffect('delivery', actor.position, { x: 83, y: 71 });
    const key = Scene.projectKey(actor.session);
    archivedTurns.set(key, Math.min(3, (archivedTurns.get(key) || 0) + 1));
    $('archive-stack').dataset.count = String(archivedTurns.get(selectedProject) || 0);
    if (!await delay(actor, quietSprites() ? 100 : 900, serial)) return;
    const seat = actor.target;
    if (!await move(actor, seat, serial)) return;
    actor.completing = false;
    finishAtStation(actor);
    say(actor, '会话还在，等下一轮', 2400);
  }
  async function depart(actor, inactive = false) {
    if (actor.departing) return;
    actor.departing = true;
    const serial = cancelAction(actor);
    actor.node.dataset.attention = 'false';
    text(actor.state, inactive ? '出去歇一会儿' : '会话结束，收拾一下');
    say(actor, inactive ? '有新工作再回来' : '这次先收工啦', 2200);
    if (!inactive) {
      if (!await move(actor, { x: 84, y: 80, zone: 'archive' }, serial, true)) return;
      addEffect('delivery', actor.position, { x: 83, y: 71 });
      if (!await delay(actor, quietSprites() ? 100 : 700, serial)) return;
    }
    if (!await move(actor, Scene.ZONES.exit, serial, false)) return;
    openDoor();
    if (!reduced()) {
      const fade = actor.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      actor.opacityMotion = fade;
      await fade.finished.catch(() => {});
    }
    if (actor.serial !== serial) return;
    removeActor(actor.id);
  }
  function makeActor(session, seat) {
    const node = element('div', 'actor');
    node.dataset.sessionId = session.id;
    const shadow = element('span', 'actor-shadow');
    const arrival = element('span', 'actor-arrival');
    const button = element('button', 'actor-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    const body = element('span', 'character-body');
    const image = element('img');
    image.alt = '';
    image.draggable = false;
    body.append(image);
    const plate = element('span', 'nameplate');
    const title = element('span', 'actor-title');
    const relation = element('span', 'actor-relation');
    const subline = element('span', 'actor-subline');
    const provider = element('span', 'actor-provider');
    const state = element('span', 'actor-state');
    subline.append(provider, state);
    const keepsake = element('span', 'actor-keepsake', keepsakeIcon(session));
    keepsake.setAttribute('aria-hidden', 'true');
    plate.append(title, relation, subline, keepsake);
    const mark = element('span', 'actor-mark', '!');
    mark.setAttribute('aria-hidden', 'true');
    const bubble = element('span', 'actor-bubble');
    bubble.setAttribute('aria-hidden', 'true');
    const carry = element('span', 'actor-prop', '≡');
    carry.setAttribute('aria-hidden', 'true');
    button.append(body, plate, mark, bubble);
    node.append(shadow, arrival, carry, button);
    actorsLayer.append(node);
    const restored = observedIds.has(session.id) && !attendance.entering.includes(session.id);
    observedIds.add(session.id);
    const actor = { id: session.id, session, spec: Scene.activitySpec(session), node, button, body, image, title, relation, provider, state, bubble, carry, arrival, position: restored ? { x: seat.x, y: seat.y } : { x: Scene.ZONES.exit.x, y: Scene.ZONES.exit.y }, target: seat, helper: Boolean(session.parentId), serial: 0, delays: new Set(), motion: null, lastTurnAt: Scene.timestamp(session.turnCompletedAt), arrivedAt: -10000, lastZone: restored ? seat.zone : '', currentAsset: '', wantedAsset: '', bubbleTimer: 0, defer: 0, justEntered: !restored, completing: false, departing: false };
    node.style.transform = actorTransform(actor.position, actor.helper);
    node.style.zIndex = '860';
    image.addEventListener('error', () => {
      if (actor.currentAsset !== 'clawd-static-base.svg') { actor.currentAsset = 'clawd-static-base.svg'; image.dataset.asset = 'clawd-static-base.svg'; image.src = assetURL('clawd-static-base.svg'); }
      else { image.hidden = true; showError('角色素材未能加载，请重新打开应用。任务状态仍在观察。'); }
    });
    button.addEventListener('click', () => selectSession(actor.id));
    button.addEventListener('dblclick', () => react(actor));
    button.addEventListener('keydown', (event) => { if (event.key === ' ' && event.shiftKey) { event.preventDefault(); react(actor); } });
    updateActorLabel(actor);
    actors.set(session.id, actor);
    if (restored) finishAtStation(actor);
    else {
      openDoor();
      settle(actor, seat, true).catch(showError);
      if (!quietSprites()) actor.opacityMotion = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    return actor;
  }
  function updateActorLabel(actor) {
    const session = actor.session;
    const spec = Scene.activitySpec(session);
    actor.node.dataset.helper = String(Boolean(session.parentId));
    actor.node.dataset.attention = String(Scene.needsAttention(session));
    actor.node.dataset.error = String(session.activity === 'error');
    actor.node.dataset.stale = String(Boolean(spec.stale));
    actor.node.dataset.selected = String(session.id === selectedSession);
    actor.provider.dataset.provider = String(session.provider).toLowerCase();
    actor.title.textContent = displayName(session);
    const family = familyGraph.info.get(session.id);
    const parent = familyGraph.byId.get(session.parentId);
    actor.node.style.setProperty('--family-color', family ? family.color : '#a7a563');
    actor.node.dataset.family = family ? family.rootId : session.id;
    actor.node.dataset.hasFamily = String(Boolean(session.parentId || family && family.descendants));
    actor.relation.textContent = parent ? I18n.t(language,'identity.parent',{name:displayName(parent)}) : session.parentId ? tr('子任务 · 父任务未在场') : family && family.descendants ? I18n.t(language,'family.leader',{count:family.descendants}) : '';
    actor.relation.title = actor.relation.textContent;
    text(actor.provider, session.provider === 'claude-code' ? 'Claude' : Scene.providerName(session.provider));
    if (!actor.motion && !actor.completing && !actor.departing) text(actor.state, spec.label);
    actor.button.setAttribute('aria-label', displayName(session) + ' · ' + Scene.providerName(session.provider) + ' · ' + String(session.title || '未命名任务') + '，' + tr(spec.label) + '。' + tr('单击查看详情，双击打招呼。'));
    actor.button.setAttribute('aria-pressed', String(session.id === selectedSession));
  }
  async function react(actor) {
    if (actor.departing || actor.spec.stale) return;
    if (actor.session.activity === 'waiting-user' || actor.session.activity === 'error') {
      say(actor, '请回原工具看一下', 3000);
      selectSession(actor.id);
      return;
    }
    const seat = actor.target;
    const serial = cancelAction(actor);
    actor.node.dataset.reaction = 'true';
    const p = persona(actor.session);
    const pose = ['teacup','bookmark','leaf'].includes(p.keepsake) ? 'clawd-aegyo-shy.svg' : ['paperboat','lantern','bell'].includes(p.keepsake) ? 'clawd-react-double.svg' : 'clawd-react-double-jump.svg';
    setPose(actor, pose, true);
    say(actor, language === 'en' ? p.greetingEn : p.greetingZh, 3000);
    if (!await delay(actor, quietSprites() ? 700 : 1800, serial)) return;
    actor.node.dataset.reaction = 'false';
    settle(actor, seat, true).catch(showError);
  }
  function removeActor(id) {
    const actor = actors.get(id);
    if (!actor) return;
    cancelAction(actor);
    clearTimeout(actor.bubbleTimer);
    actor.node.remove();
    actors.delete(id);
    if (selectedSession === id) { selectedSession = ''; $('inspector').hidden = true; }
    refreshQuietPresentation();
  }
  function refreshQuietPresentation() {
    // Keep navigation available when a different room still has observed work.
    // Departing actors retain their scene until they actually reach the door.
    const quiet = snapshot.mode === 'live' && attendance.present.length === 0 && actors.size === 0;
    office.dataset.quiet = String(quiet);
    $('empty-state').hidden = !quiet;
    if (quiet) { selectedSession = ''; $('inspector').hidden = true; }
    visitor.tick();
  }
  function clearActors() {
    for (const id of [...actors.keys()]) removeActor(id);
    seats = new Map();
    $('helper-links').replaceChildren();
    for (const effect of $('effects').children) effect.getAnimations().forEach((animation) => animation.cancel());
    $('effects').replaceChildren();
  }
  function reconcileActors() {
    const sessions = snapshot.sessions;
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));
    const visibleIds = new Set(currentPage.visible.map((session) => session.id));
    const retiringIds = new Set(attendance.retired);
    for (const actor of [...actors.values()]) {
      const next = sessionMap.get(actor.id);
      if ((next && Scene.isClosed(next) || retiringIds.has(actor.id) || attendance.leaving.includes(actor.id)) && Scene.projectKey(next || actor.session) === selectedProject) { actor.session = next || actor.session; depart(actor, !Scene.isClosed(actor.session)).catch(showError); }
      else if (!visibleIds.has(actor.id) && !actor.departing) removeActor(actor.id);
    }
    const nextSeats = Scene.assignSeats(currentPage.visible, seats);
    for (const session of currentPage.visible) {
      const seat = nextSeats.get(session.id);
      let actor = actors.get(session.id);
      if (!actor) { makeActor(session, seat); continue; }
      const old = actor.session;
      const oldSpec = actor.spec;
      const spec = Scene.activitySpec(session);
      actor.session = session;
      actor.spec = spec;
      actor.helper = Boolean(session.parentId);
      updateActorLabel(actor);
      const completedAt = Scene.timestamp(session.turnCompletedAt);
      const newCompletion = completedAt > actor.lastTurnAt && session.activity === 'idle' && !spec.stale;
      const targetChanged = !actor.target || actor.target.zone !== seat.zone || Scene.distance(actor.target, seat) > .7;
      const stateChanged = old.activity !== session.activity || oldSpec.stale !== spec.stale || Boolean(old.attention) !== Boolean(session.attention);
      // A brief tool can end before its route starts. Invalidate that old route
      // even when the next activity returns to the actor's existing station.
      const queuedChanged = actor.queuedSeat && (actor.queuedSeat.zone !== seat.zone || Scene.distance(actor.queuedSeat, seat) > .7);
      if (actor.defer && queuedChanged) {
        clearTimeout(actor.defer);
        actor.defer = 0;
        actor.queuedSeat = null;
      }
      if (actor.departing) {
        actor.departing = false;
        cancelAction(actor);
        settle(actor, seat, true).catch(showError);
        continue;
      }
      if (newCompletion) completeTurn(actor, completedAt, seat).catch(showError);
      else if (targetChanged || stateChanged) {
        if (spec.stale) {
          cancelAction(actor);
          finishAtStation(actor);
        } else if (targetChanged || (oldSpec.stale && !spec.stale && Scene.distance(actor.position, seat) > .7)) {
          const urgent = Scene.needsAttention(session);
          if (urgent) settle(actor, seat, true).catch(showError);
          else if (!actor.defer) {
            if (actor.motion) cancelAction(actor);
            const serial = actor.serial;
            const queued = { ...seat };
            actor.queuedSeat = queued;
            actor.defer = setTimeout(() => {
              if (actors.get(actor.id) !== actor || actor.serial !== serial || actor.queuedSeat !== queued) return;
              actor.defer = 0;
              actor.queuedSeat = null;
              settle(actor, queued).catch(showError);
            }, 1000);
          }
        } else if (!actor.motion && !actor.completing) finishAtStation(actor);
      } else if (!actor.motion && !actor.completing && !actor.departing && actor.node.dataset.reaction !== 'true') finishAtStation(actor);
    }
    seats = nextSeats;
    renderHelperLinks();
    updateProps();
  }
  function renderHelperLinks() {
    const layer = $('helper-links');
    const fragments = document.createDocumentFragment();
    for (const actor of actors.values()) {
      if (!actor.session.parentId) continue;
      const family = familyGraph.info.get(actor.id);
      const parent = (family ? family.ancestors : [actor.session.parentId]).map(id => actors.get(id)).find(candidate => candidate && !candidate.departing);
      if (!parent || parent.departing || actor.departing) continue;
      const childPoint = currentPosition(actor);
      const parentPoint = currentPosition(parent);
      const ax = parentPoint.x * 12.8;
      const ay = parentPoint.y * 7.2 + 2;
      const bx = childPoint.x * 12.8;
      const by = childPoint.y * 7.2 + 2;
      const line = element('span', 'helper-thread');
      line.dataset.parentId = parent.id;
      line.dataset.childId = actor.id;
      line.dataset.selected = String(selectedSession === actor.id || selectedSession === parent.id);
      line.style.setProperty('--family-color', family ? family.color : '#a7a563');
      line.style.width = Math.hypot(bx - ax, by - ay) + 'px';
      line.style.transform = 'translate(' + ax + 'px,' + ay + 'px) rotate(' + Math.atan2(by - ay, bx - ax) + 'rad)';
      fragments.append(line);
    }
    layer.replaceChildren(fragments);
  }
  function updateProps() {
    const activeZones = new Set();
    for (const actor of actors.values()) if (!actor.motion && !actor.departing && !actor.spec.stale) activeZones.add(actor.spec.zone);
    for (const prop of world.querySelectorAll('[data-zone-prop]')) prop.dataset.active = String(activeZones.has(prop.dataset.zoneProp));
    for (const label of world.querySelectorAll('[data-zone-label]')) label.dataset.active = String(activeZones.has(label.dataset.zoneLabel));
    $('archive-stack').dataset.count = String(archivedTurns.get(selectedProject) || 0);
  }
  function selectSession(id) {
    const session = snapshot.sessions.find((item) => item.id === id);
    if (!session) return;
    const roomKey = Scene.projectKey(session);
    if (roomKey !== selectedProject) switchRoom(roomKey, false);
    const family = Scene.pageSessions(attendance.present, roomKey);
    const roots = family.roots;
    const mainId = family.rootIdsBySession.get(session.id) || session.id;
    const index = roots.findIndex((item) => item.id === mainId);
    const nextPage = index < 0 ? page : Math.floor(index / Scene.CAPACITY);
    selectedSession = id;
    if (nextPage !== page) { page = nextPage; clearActors(); selectedSession = id; render(); }
    else if (!currentPage.visible.some((item) => item.id === id)) render();
    $('inspector').hidden = false;
    for (const actor of actors.values()) updateActorLabel(actor);
    renderInspector();
  }
  function renderInspector() {
    if (!selectedSession || $('inspector').hidden) return;
    const session = snapshot.sessions.find((item) => item.id === selectedSession);
    if (!session) { $('inspector').hidden = true; return; }
    const spec = Scene.activitySpec(session);
    const actor = actors.get(session.id);
    $('inspect-provider').dataset.provider = String(session.provider).toLowerCase();
    text($('inspect-provider'), Scene.providerName(session.provider));
    $('inspect-nickname').textContent = displayName(session);
    const personality = persona(session);
    $('inspect-persona-name').textContent = settings.nameStyle === 'harbour' ? Scene.identityName(session) : (language === 'en' ? personality.aliasEn : personality.aliasZh);
    $('inspect-persona-trait').textContent = language === 'en' ? personality.traitEn : personality.traitZh;
    $('inspect-keepsake').textContent = keepsakeIcon(session);
    $('greet-agent').disabled = !actor || actor.departing || Boolean(spec.stale);
    text($('inspect-title'), session.title || '未命名任务');
    text($('inspect-location'), attendance.retired.includes(session.id) ? '门外休息' : actor && actor.motion ? '前往' + Scene.ZONES[(actor.target || spec).zone].name : Scene.ZONES[spec.zone].name);
    text($('inspect-summary'), session.summary || spec.verb);
    text($('inspect-state'), spec.label);
    text($('inspect-signal'), timeAgo(session.lastEventAt));
    text($('inspect-tools'), Number(session.activeTools) > 0 ? session.activeTools + ' 个工具调用进行中' : '');
    const parent = snapshot.sessions.find(item => item.id === session.parentId);
    const children = snapshot.sessions.filter(item => item.parentId === session.id && !Scene.isClosed(item));
    $('inspect-helper').hidden = !session.parentId && !children.length;
    $('inspect-helper').dataset.parentId = parent ? parent.id : '';
    $('inspect-helper').disabled = !parent;
    text($('inspect-helper'), parent ? (language === 'en' ? '↳ Helping ' : '↳ 协助 ') + displayName(parent) + ' ↗' : session.parentId ? (language === 'en' ? 'Parent is outside' : '父任务未在场') : (language === 'en' ? 'Leader · ' + children.length + ' helpers' : '领队 · ' + children.length + ' 位帮手'));
    text($('open-source'), '打开项目文件夹 ↗');
    $('open-source').disabled = snapshot.mode === 'demo' || !session.projectPath;
    text($('inspect-action-note'), snapshot.mode === 'demo' ? '演示中的模拟项目，不对应本地文件夹。' : Scene.needsAttention(session) ? '请回到 ' + Scene.providerName(session.provider) + ' 回答或处理审批。' : spec.stale ? '最后位置已保留，尚不能确认当前进度。' : '此按钮打开 Finder。任务与对话请回到原工具查看。');
    text($('inspect-source'), sourceName(session.evidence && session.evidence.source));
    text($('inspect-confidence'), confidenceName(session.evidence && session.evidence.confidence));
    text($('inspect-animation'), Director.plan(session, { now: Date.now(), language }).detail);
    text($('inspect-session-id'), 'Task ID: ' + String(session.sessionId || session.id) + (session.subagentId ? ' · Agent ID: ' + session.subagentId : ''));
    const events = Array.isArray(session.events) ? session.events.slice(-8).reverse() : [];
    const fragment = document.createDocumentFragment();
    for (const event of events) {
      const row = element('li');
      const time = element('time');
      const date = new Date(Scene.timestamp(event.at));
      text(time, Number.isFinite(date.getTime()) && Scene.timestamp(event.at) ? date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
      const eventText = element('span', '', event.summary || (Scene.SPECS[event.activity] && Scene.SPECS[event.activity].label) || '收到活动事件');
      const raw = element('code', '', event.event || (event.evidence && event.evidence.rawEvent) || '');
      row.append(time, eventText, raw);
      fragment.append(row);
    }
    if (!events.length) fragment.append(element('li', '', '尚无可显示的活动记录'));
    $('inspect-events').replaceChildren(fragment);
  }
  function renderConnections() {
    const fragment = document.createDocumentFragment();
    const query = $('provider-search').value.trim().toLowerCase();
    for (const provider of providerIds) {
      if (query && !(provider + ' ' + Scene.providerName(provider)).toLowerCase().includes(query)) continue;
      const connection = snapshot.connections.find((item) => item.provider === provider || (provider === 'claude-code' && item.provider === 'claude')) || {};
      const row = element('div', 'provider-row');
      const icon = element('span', 'provider-icon', ({ codex: 'Cx', cursor: '↗', 'claude-code': '✳', hermes: 'H' })[provider] || Scene.providerName(provider).slice(0,2));
      icon.dataset.provider = provider;
      const copy = element('div', 'provider-copy');
      const name = element('div', 'provider-name', Scene.providerName(provider));
      const status = element('div', 'provider-status');
      status.dataset.connected = String(Boolean(connection.watching));
      status.append(element('i'), element('span', '', connection.watching ? '正在观察' + (connection.lastEventAt ? ' · ' + timeAgo(connection.lastEventAt) : ' · 等待新会话事件') : connection.installed ? '已配置 · 等待工具产生事件' : '尚未接入'));
      const detail = element('div', 'provider-detail', connection.detail || (provider === 'codex' ? '同一个工具的多个 session 会分别入驻。' : '添加状态观察 hooks，保留原有配置。'));
      copy.append(name, status, detail);
      const button = element('button', 'button button-paper', connection.installed ? '移除配置' : '连接');
      button.type = 'button';
      button.disabled = mutationPending;
      button.addEventListener('click', () => connect(provider, Boolean(connection.installed)));
      if (provider === 'hermes' && connection.installed) {
        const actions = element('span','provider-actions');
        const reload = element('button','button button-paper','重新加载');
        reload.type = 'button';
        reload.disabled = mutationPending;
        reload.addEventListener('click', () => connect('hermes', false));
        actions.append(reload,button);
        row.append(icon,copy,actions);
      } else row.append(icon, copy, button);
      fragment.append(row);
    }
    $('provider-connections').replaceChildren(fragment);
    const watching = snapshot.connections.filter((item) => item.watching).length;
    text($('connection-count'), watching);
    $('connections-button').setAttribute('aria-label', '连接 AI 工具，' + watching + ' 个正在观察');
  }
  function renderRoster() {
    const fragment = document.createDocumentFragment();
    const sessions = snapshot.sessions.filter((session) => !Scene.isClosed(session) && Scene.projectKey(session) === selectedProject);
    for (const session of Family.build(sessions).ordered) {
      const spec = Scene.activitySpec(session);
      const row = element('button', 'roster-row');
      row.type = 'button';
      row.dataset.attention = String(Scene.needsAttention(session));
      const family = familyGraph.info.get(session.id);
      row.style.setProperty('--family-color',family ? family.color : '#a7a563');
      row.style.marginLeft = (Math.min(3,family ? family.depth : 0)*18)+'px';
      const copy = element('span', 'roster-copy');
      copy.append(element('strong', '', displayName(session)), element('span', 'roster-task', session.title || '未命名任务'));
      const parent = familyGraph.byId.get(session.parentId);
      if (parent) { const relation = element('span','roster-relation'); relation.textContent = '↳ ' + I18n.t(language,'identity.parent',{name:displayName(parent)}); copy.append(relation); }
      row.append(copy, element('span', 'roster-state', (attendance.retired.includes(session.id) ? tr('门外休息') : tr(spec.label)) + ' →'));
      row.addEventListener('click', () => { $('roster-dialog').close(); selectSession(session.id); });
      fragment.append(row);
    }
    $('roster-list').replaceChildren(fragment);
  }
  function render() {
    office.dataset.mode = snapshot.mode;
    attendance = attendanceModels[snapshot.mode].update(snapshot.sessions);
    familyGraph = Family.build(snapshot.sessions.filter(session => !Scene.isClosed(session)));
    const roomBefore = selectedProject;
    rooms = Scene.roomsFor(snapshot.sessions);
    const roomChoice = Scene.chooseRoom(rooms, attendance.present, { current: selectedProject, explicit: roomSelectionExplicit });
    selectedProject = roomChoice.key;
    roomSelectionExplicit = roomChoice.explicit;
    if (roomBefore && roomBefore !== selectedProject) { clearActors(); page = 0; }
    const options = document.createDocumentFragment();
    for (const room of rooms) {
      const option = element('option', 'project-option', I18n.t(language, 'room.option', {name:room.name,count:room.roots}) + (room.helpers ? I18n.t(language,'room.helpersSuffix',{count:room.helpers}) : '') + (room.attention ? I18n.t(language,'room.attentionSuffix',{count:room.attention}) : ''));
      option.value = room.key;
      options.append(option);
    }
    if (selectedProject && !rooms.some((room) => room.key === selectedProject)) {
      const option = element('option', 'project-option', I18n.t(language,'room.quietOption',{name:selectedProject.split(/[\\/]/).filter(Boolean).pop()}));
      option.value = selectedProject;
      options.append(option);
    }
    $('project-select').replaceChildren(options);
    $('project-select').value = selectedProject;
    $('room-switcher').hidden = !rooms.length;
    currentPage = Scene.pageSessions(attendance.present, selectedProject, page, selectedSession);
    page = currentPage.page;
    reconcileActors();
    const alive = snapshot.sessions.filter((session) => !Scene.isClosed(session));
    const allRoomSessions = alive.filter((session) => Scene.projectKey(session) === selectedProject);
    const roomSessions = attendance.present.filter((session) => Scene.projectKey(session) === selectedProject);
    const localAttention = roomSessions.filter(Scene.needsAttention);
    const otherAttention = alive.filter((session) => Scene.projectKey(session) !== selectedProject && Scene.needsAttention(session));
    const helpers = roomSessions.filter((session) => session.parentId).length;
    const rootCount = roomSessions.length - helpers;
    const quiet = roomSessions.filter((session) => session.status === 'stale' || session.disconnected).length;
    $('page-empty').hidden = roomSessions.length > 0 || !attendance.present.some((session) => Scene.projectKey(session) !== selectedProject);
    $('other-attention').hidden = !otherAttention.length;
    text($('other-attention'), '其他房间 ' + otherAttention.length + ' 项待处理');
    $('attention-jump').hidden = !localAttention.length;
    text($('attention-jump'), localAttention.length + ' 项需要你 →');
    $('status-dot').dataset.status = localAttention.length ? 'waiting' : roomSessions.length ? 'active' : 'empty';
    let summary = roomSessions.length ? rootCount + ' 项独立任务' + (helpers ? ' · ' + helpers + ' 位临时帮手' : '') : '实时办公室 · 等待任务入驻';
    if (quiet) summary += ' · ' + quiet + ' 项信号暂未更新';
    if (currentPage.helperOverflow) summary += ' · 另 ' + currentPage.helperOverflow + ' 位帮手在协作';
    text($('room-summary'), summary);
    const recent = roomSessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    text($('signal-summary'), recent ? timeAgo(recent) : '');
    $('pagination').hidden = currentPage.pages <= 1;
    $('roster-button').hidden = allRoomSessions.length === 0;
    text($('roster-button'), '全部 ' + allRoomSessions.length + ' 位伙伴');
    text($('page-label'), (page + 1) + ' / ' + currentPage.pages + ' 组');
    $('page-prev').disabled = page === 0;
    $('page-next').disabled = page >= currentPage.pages - 1;
    $('demo-controls').hidden = snapshot.mode !== 'demo';
    const stories = Array.isArray(snapshot.demo.stories) ? snapshot.demo.stories : [];
    const storySelect = $('demo-story');
    const storyKey = stories.map(story => story.id).join(':') + ':' + language;
    if (storySelect.dataset.stories !== storyKey) {
      storySelect.replaceChildren(...stories.map(story => { const option = document.createElement('option'); option.value = story.id; option.textContent = language === 'en' ? story.titleEn : story.titleZh; return option; }));
      storySelect.dataset.stories = storyKey;
    }
    storySelect.hidden = stories.length === 0;
    storySelect.value = snapshot.demo.storyId || 'classic';
    const frameLabel = language === 'en' ? snapshot.demo.frameLabelEn : snapshot.demo.frameLabelZh;
    $('demo-scene-label').hidden = snapshot.mode !== 'demo' || !frameLabel;
    $('demo-scene-label').textContent = frameLabel ? (language === 'en' ? 'Simulated · ' : '模拟 · ') + frameLabel : '';
    text($('demo-play'), snapshot.demo && snapshot.demo.running ? '暂停事件' : '继续演示');
    text($('mode-label'), snapshot.mode === 'demo' ? '演示房间' : '实时观察');
    $('mode-button').setAttribute('aria-label', snapshot.mode === 'demo' ? '当前是模拟演示，点击回到实时观察' : '当前是实时观察，点击体验演示房间');
    renderConnections();
    if ($('roster-dialog').open) renderRoster();
    renderInspector();
    const nextAttention = new Set(alive.filter(Scene.needsAttention).map((session) => session.id));
    for (const session of alive) if (nextAttention.has(session.id) && !previousAttention.has(session.id)) text($('announcer'), I18n.t(language,'announce.attention',{provider:Scene.providerName(session.provider),title:session.title || '任务'}));
    previousAttention = nextAttention;
    refreshQuietPresentation();
  }
  function receive(next) {
    if (!next || !Array.isArray(next.sessions)) return;
    snapshotReceived += 1;
    if (next.mode !== snapshot.mode || ((next.demo && snapshot.demo) && (next.demo.tick < snapshot.demo.tick || next.demo.storyId !== snapshot.demo.storyId))) {
      if (next.mode === 'demo' && next.demo && snapshot.demo && (next.demo.tick < snapshot.demo.tick || next.demo.storyId !== snapshot.demo.storyId)) attendanceModels.demo.clear();
      clearActors();
      selectedSession = '';
      selectedProject = '';
      roomSelectionExplicit = false;
      archivedTurns.clear();
      observedIds.clear();
      page = 0;
      previousAttention.clear();
    }
    snapshot = { ...next, mode: next.mode === 'demo' ? 'demo' : 'live', sessions: next.sessions.filter((session) => session && typeof session.id === 'string'), connections: Array.isArray(next.connections) ? next.connections : [], demo: next.demo || { running: false, tick: 0 } };
    render();
  }
  async function refreshSnapshot() { const next = await call('getSnapshot'); if (next) receive(next); }
  async function changeMode(mode) {
    if (mutationPending) return;
    mutationPending = true;
    $('mode-button').disabled = true;
    try { await call('setMode', mode); await refreshSnapshot(); }
    catch (error) { showError(error); }
    finally { mutationPending = false; $('mode-button').disabled = false; renderConnections(); }
  }
  function switchRoom(key, persist = true) {
    roomSelectionExplicit = true;
    if (key === selectedProject) { if (persist) saveSettings({ selectedProject: key }); return; }
    clearActors();
    selectedProject = key;
    selectedSession = '';
    page = 0;
    $('inspector').hidden = true;
    render();
    if (persist) saveSettings({ selectedProject: key });
  }
  function jumpAttention(outside = false) {
    const candidates = snapshot.sessions.filter((session) => Scene.needsAttention(session) && (outside ? Scene.projectKey(session) !== selectedProject : Scene.projectKey(session) === selectedProject));
    if (!candidates.length) return;
    const index = candidates.findIndex((session) => session.id === selectedSession);
    selectSession(candidates[(index + 1) % candidates.length].id);
  }
  function applySettings(next) {
    settings = { ...settingsDefaults, ...next };
    const previousLanguage = language;
    language = settings.language === 'en' ? 'en' : 'zh';
    applyLanguage();
    office.dataset.rain = String(settings.rain);
    scenery.update(settings, language);
    office.dataset.reducedMotion = String(reduced());
    office.dataset.lowPower = String(settings.lowPower);
    for (const key of ['rain', 'reducedMotion', 'lowPower', 'idleVisitor']) $('setting-' + key).checked = Boolean(settings[key]);
    $('setting-sceneTime').value = settings.sceneTime;
    $('setting-nameStyle').value = settings.nameStyle;
    for (const actor of actors.values()) {
      if (reduced() && actor.motion) {
        const target = actor.target;
        const wasDeparting = actor.departing;
        cancelAction(actor);
        if (wasDeparting && (attendance.retired.includes(actor.id) || Scene.isClosed(actor.session))) { openDoor(); removeActor(actor.id); continue; }
        actor.departing = false;
        actor.position = { x: target.x, y: target.y };
        actor.node.style.transform = actorTransform(actor.position, actor.helper);
        finishAtStation(actor);
      } else setPose(actor, actor.wantedAsset || actor.spec.asset);
      updateActorLabel(actor);
      if (previousLanguage !== language) { clearTimeout(actor.bubbleTimer); actor.bubble.dataset.show = 'false'; }
    }
    renderHelperLinks();
    visitor.tick();
    renderInspector();
    if (previousLanguage !== language) render();
  }
  async function saveSettings(patch) {
    const previous = settings;
    applySettings({ ...settings, ...patch });
    try {
      const saved = await call('setSettings', patch);
      if (saved && typeof saved === 'object') applySettings(saved);
      text($('settings-result'), '已保存到这台 Mac。');
    } catch (error) { applySettings(previous); showError(error); }
  }
  async function connect(provider, remove = false) {
    if (mutationPending) return;
    mutationPending = true;
    renderConnections();
    text($('connection-result'), (remove ? '正在移除 ' : '正在连接 ') + Scene.providerName(provider) + (remove ? ' 观察配置…' : '…'));
    try {
      const result = await call(remove ? 'disconnectProvider' : 'connectProvider', provider);
      const message = remove ? (provider === 'codex' ? '已移除观察配置；本地只读观察仍可继续' : (result && result.message) || '已移除本应用的观察配置。') : result && (result.message || result.detail) || (provider === 'codex' ? '配置已就绪，请在 Codex 中审核 hooks 信任，再开始新任务。' : '观察配置已就绪，请在原工具开始一个任务。');
      text($('connection-result'), message);
      await refreshSnapshot();
    } catch (error) { text($('connection-result'), error.message); showError(error); }
    finally { mutationPending = false; renderConnections(); }
  }
  function openDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
    if (id === 'connections-dialog') renderConnections();
    if (id === 'roster-dialog') renderRoster();
    if (id === 'settings-dialog') refreshDisplays();
  }
  async function refreshDisplays() {
    try {
      const displays = await call('listDisplays');
      const fragment = document.createDocumentFragment();
      for (const display of Array.isArray(displays) ? displays : []) {
        const option = element('option', '', (display.label || '显示器 ' + display.id) + ' · ' + display.width + ' × ' + display.height + (display.primary ? ' · 主屏' : ''));
        option.value = String(display.id);
        fragment.append(option);
      }
      $('display-select').replaceChildren(fragment);
      $('move-display').disabled = !$('display-select').options.length;
    } catch (error) { text($('settings-result'), error.message); }
  }

  $('connections-button').addEventListener('click', () => openDialog('connections-dialog'));
  $('provider-search').addEventListener('input', renderConnections);
  $('language-button').addEventListener('click', () => saveSettings({ language: language === 'en' ? 'zh' : 'en' }));
  $('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
  $('day-clock').addEventListener('click', () => { openDialog('settings-dialog'); $('setting-sceneTime').focus(); });
  $('setting-sceneTime').addEventListener('change', event => saveSettings({ sceneTime: event.target.value }));
  $('day-reset').addEventListener('click', () => { $('setting-sceneTime').focus(); saveSettings({ sceneTime: 'auto' }); });
  $('roster-button').addEventListener('click', () => openDialog('roster-dialog'));
  $('greet-agent').addEventListener('click', () => { const actor = actors.get(selectedSession); if (actor) react(actor); });
  $('setting-nameStyle').addEventListener('change', event => saveSettings({ nameStyle: event.target.value }));
  $('demo-story').addEventListener('change', event => attempt(async () => {
    try { const result = await call('demoAction', 'story:' + event.target.value); if (result && Array.isArray(result.sessions)) receive(result); else await refreshSnapshot(); }
    finally { $('demo-story').value = snapshot.demo.storyId || 'classic'; }
  }));
  $('inspect-helper').addEventListener('click', () => { const id = $('inspect-helper').dataset.parentId; if (id) selectSession(id); });
  $('mode-button').addEventListener('click', () => changeMode(snapshot.mode === 'demo' ? 'live' : 'demo'));
  $('exit-demo').addEventListener('click', () => changeMode('live'));
  $('dismiss-error').addEventListener('click', () => { $('error-message').hidden = true; });
  $('project-select').addEventListener('change', (event) => switchRoom(event.target.value));
  $('other-attention').addEventListener('click', () => jumpAttention(true));
  $('attention-jump').addEventListener('click', () => jumpAttention(false));
  $('page-prev').addEventListener('click', () => { page = Math.max(0, page - 1); clearActors(); render(); });
  $('page-next').addEventListener('click', () => { page = Math.min(currentPage.pages - 1, page + 1); clearActors(); render(); });
  $('close-inspector').addEventListener('click', () => { selectedSession = ''; $('inspector').hidden = true; for (const actor of actors.values()) updateActorLabel(actor); });
  $('open-source').addEventListener('click', () => attempt(async () => {
    const id = selectedSession;
    if (!id) return;
    const result = await call('openSource', id);
    if (result && (result.message || result.detail)) text($('inspect-action-note'), result.message || result.detail);
  }));
  for (const [id, action] of [['demo-play', null], ['demo-next', 'advance'], ['demo-reset', 'reset']]) {
    $(id).addEventListener('click', () => attempt(async () => { await call('demoAction', action || (snapshot.demo.running ? 'pause' : 'play')); await refreshSnapshot(); }));
  }
  for (const key of ['rain', 'reducedMotion', 'lowPower', 'idleVisitor']) $('setting-' + key).addEventListener('change', (event) => saveSettings({ [key]: event.target.checked }));
  $('move-display').addEventListener('click', () => attempt(async () => {
    const value = $('display-select').value;
    if (!value) return;
    await call('moveToDisplay', /^\d+$/.test(value) ? Number(value) : value);
    text($('settings-result'), '办公室已移到选中的屏幕。');
  }));
  for (const close of document.querySelectorAll('[data-close-dialog]')) close.addEventListener('click', () => close.closest('dialog').close());
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { selectedSession = ''; $('inspector').hidden = true; for (const actor of actors.values()) updateActorLabel(actor); }
  });
  document.addEventListener('visibilitychange', () => {
    office.dataset.hidden = String(document.hidden);
    for (const actor of actors.values()) setPose(actor, actor.wantedAsset || actor.spec.asset);
    visitor.tick();
    if (!document.hidden) { scenery.update(settings, language); ensureMotionTicker(); }
  });
  mediaReduce.addEventListener('change', () => applySettings(settings));
  const observer = new ResizeObserver(refreshScale);
  observer.observe(office);
  refreshScale();
  $('room-art').addEventListener('error', () => showError('房间背景未能加载，请重新打开应用。'));

  let unsubscribe = null;
  if (bridge && typeof bridge.onSnapshot === 'function') {
    try { unsubscribe = bridge.onSnapshot(receive); }
    catch (error) { showError(error); }
  }
  const receivedAtStart = snapshotReceived;
  Promise.all([call('getSettings'), call('getSnapshot')]).then(([savedSettings, initial]) => {
    // Settings can arrive after the first live push. Apply the saved deliberate
    // room choice once, without mistaking future automatic choices for intent.
    if (savedSettings && savedSettings.selectedProject) {
      clearActors(); page = 0;
      selectedProject = savedSettings.selectedProject;
      roomSelectionExplicit = true;
    }
    applySettings(savedSettings || settingsDefaults);
    if (snapshotReceived === receivedAtStart) receive(initial);
    else render();
  }).catch((error) => { showError(error); applySettings(settings); render(); });
  const clockTimer = setInterval(() => {
    if (document.hidden) return;
    scenery.update(settings, language);
    renderInspector();
    const roomSessions = snapshot.sessions.filter((session) => Scene.projectKey(session) === selectedProject && !Scene.isClosed(session));
    const recent = roomSessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    text($('signal-summary'), recent ? timeAgo(recent) : '');
  }, 12000);
  window.addEventListener('beforeunload', () => {
    destroyed = true;
    visitor.destroy();
    scenery.destroy();
    clearInterval(clockTimer);
    clearTimeout(frameTimer);
    clearTimeout(doorTimer);
    clearActors();
    observer.disconnect();
    if (typeof unsubscribe === 'function') unsubscribe();
  });
})();
