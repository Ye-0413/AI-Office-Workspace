/* The room only presents observations. It never approves or executes agent work. */
(function () {
  'use strict';
  const Scene = window.OfficeScene;
  const Attendance = window.OfficeAttendance;
  const Director = window.OfficeAnimationDirector;
  const performanceClocks = window.OfficeAvatarPerformanceModel.createClockRegistry({ limit: 2048 });
  const Family = window.OfficeFamily;
  const Clones = window.OfficeClones;
  const Traffic = window.OfficeSceneTraffic;
  const I18n = window.OfficeI18n;
  const bridge = window.office;
  const $ = (id) => document.getElementById(id);
  const office = $('office');
  const world = $('world');
  const actorsLayer = $('actors');
  const actors = new Map();
  const archivedTurns = new Map();
  const settingsDefaults = { rain: false, night: false, sceneTime: 'auto', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: true, sound: false, selectedProject: '', language: 'zh' };
  let settings = { ...settingsDefaults };
  let language = 'zh';
  const scenery = window.OfficeDayScenery.create({ office, world, layer: $('window-scenery') });
  const attendanceModel = Attendance.createAttendance();
  const cloneLedger = Clones.createLedger();
  const restedClones = new Set();
  const paletteRegistry = Family.createPaletteRegistry();
  const CLOCK_RESERVED = [{ left: 470, top: 65, right: 830, bottom: 170 }];
  const ENTRY_POINT = { x: 87, y: 78, zone: 'exit' };
  const traffic = Traffic.createCoordinator({ reservedRects: CLOCK_RESERVED, gap: Scene.ACTOR_GAP, limit: 64,
    legalPoint: (point, actor) => Scene.legalActorPoint(point, { ...actor, reservedRects: CLOCK_RESERVED }) });
  const trafficWaiters = new Map();
  let trafficTimer = 0;
  let reflowPending = false;
  let entranceLane = false;
  let entranceRenderScheduled = false;
  let attendance = { present: [], entering: [], leaving: [], retired: [] };
  const staticCopy = [];
  const copyWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = copyWalker.nextNode(); node; node = copyWalker.nextNode()) if (node.nodeValue.trim()) staticCopy.push({ node, original: node.nodeValue });
  const staticAttributes = [...document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')].flatMap(node => ['aria-label','title','alt','placeholder'].filter(name => node.hasAttribute(name)).map(name => ({node,name,original:node.getAttribute(name)})));
  let doorTimer = 0;
  let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
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
  function displayName(session) { const p = persona(session); return language === 'en' ? p.aliasEn : p.aliasZh; }
  function cloneSummary(session) { return I18n.t(language, 'family.clonesSummary', cloneLedger.stats(session.id)); }
  function archiveCount() { return selectedProject === Scene.ALL_ROOMS ? Math.min(3, [...archivedTurns.values()].reduce((sum, count) => sum + count, 0)) : archivedTurns.get(selectedProject) || 0; }
  function keepsakeIcon(session) { return ({teacup:'♨',paperboat:'⛵',bookmark:'▤',lantern:'✧',leaf:'❧',pebble:'◇',bell:'♧',pencil:'✎',shell:'⌁',star:'✦',acorn:'♧',ribbon:'⋈'})[persona(session).keepsake] || '✦'; }
  function reduced() { return settings.reducedMotion || mediaReduce.matches; }
  function quietSprites() { return reduced() || settings.lowPower || document.hidden; }
  function assetURL(name, replay) { return '../assets/avatars/' + name + (replay ? '?_t=' + (++spriteNonce) : ''); }
  function setPose(actor, name, replay = false) {
    const performance = actor.performance && actor.performance.update(actor.session, { now: Date.now(), reducedMotion: reduced(), lowPower: settings.lowPower, hidden: document.hidden || actor.entryPending, walking: Boolean(actor.motion) || actor.node.dataset.walking === 'true', reaction: actor.completing || actor.node.dataset.reaction === 'true' || Boolean(actor.performanceSuspended) || cloneBusy(actor) || actor.holdingFamily, departing: actor.departing, stale: actor.spec.stale });
    const asset = quietSprites() ? 'clawd-static-base.svg' : performance && performance.active ? performance.asset : name;
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
    if (/hook/i.test(value)) return '工具 hook 事件';
    if (/jsonl|log|rollout|transcript/i.test(value)) return '只读会话日志';
    return value || '事件来源未提供';
  }
  function confidenceName(confidence) {
    const names = { high: '明确事件', medium: '基于工具类型判断', low: '活动尚不确定', exact: '明确事件', inferred: '基于工具类型判断', unknown: '活动尚不确定', 'restored-wait': '恢复的等待状态' };
    return names[confidence] || (Number.isFinite(confidence) ? '判断依据 ' + Math.round(confidence * 100) + '%' : '查看原始事件核对');
  }
  function refreshScale() {
    const scale = Math.min(office.clientWidth / Scene.WORLD.width, office.clientHeight / Scene.WORLD.height);
    $('world-frame').style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
  }
  function actorTransform(point, helper) {
    return 'translate3d(' + (point.x * 12.8).toFixed(2) + 'px,' + (point.y * 7.2).toFixed(2) + 'px,0) scale(' + Scene.actorScale(point, { helper, scale: settings.agentScale }).toFixed(4) + ')';
  }
  function sceneOptions() {
    return { suppressedIds: restedClones, scale: settings.agentScale,
      reservedRects: entranceLane ? CLOCK_RESERVED.concat(Scene.actorBounds(ENTRY_POINT, { scale: settings.agentScale })) : CLOCK_RESERVED, previousSeats: seats };
  }
  function updateEntranceLane() {
    const needsLane = actor => !actor.helper && !reduced() && !document.hidden && (actor.entryPending && !actor.restoreEntry || actor.entranceActive);
    const needed = [...actors.values()].some(needsLane);
    if (needed === entranceLane || entranceRenderScheduled || destroyed) return;
    entranceRenderScheduled = true;
    queueMicrotask(() => {
      entranceRenderScheduled = false;
      if (destroyed) return;
      entranceLane = [...actors.values()].some(needsLane);
      render();
    });
  }
  function actorGeometry(actor) { return { helper: actor.helper, scale: settings.agentScale }; }
  function transitCaption(actor, yielding = false) {
    actor.state.textContent = Scene.needsAttention(actor.session) ? tr(Scene.activitySpec(actor.session).label)
      : yielding ? language === 'en' ? 'Making room' : '让一让' : language === 'en' ? 'Waiting for a clear path' : '等候通道';
  }
  function visibleActors() { return [...actors.values()].filter(actor => !actor.entryPending); }
  function syncTraffic() {
    traffic.sync(visibleActors().map(actor => ({ id: actor.id, position: currentPosition(actor), ...actorGeometry(actor),
      canYield: !actor.departing && !cloneBusy(actor) && !actor.holdingFamily && !actor.completing && !actor.spec.stale })));
  }
  function spaceFree(point, actor, overlapIds = []) {
    return Scene.legalActorPoint(point, { ...actorGeometry(actor), reservedRects: CLOCK_RESERVED })
      && visibleActors().every(other => other === actor || overlapIds.includes(other.id)
        || !Scene.actorsOverlap(point, actorGeometry(actor), currentPosition(other), actorGeometry(other)));
  }
  function doorPoint(actor) {
    const candidates = [];
    for (const y of [78, 80, 76, 44, 41]) for (const x of [87, 84, 81, 78, 75, 72]) candidates.push({ x, y, zone: 'exit' });
    return candidates.find(point => spaceFree(point, actor)) || { ...currentPosition(actor), zone: 'exit' };
  }
  function queueTraffic() {
    if (trafficTimer || destroyed) return;
    trafficTimer = setTimeout(pumpTraffic, 60);
  }
  function pumpTraffic() {
    trafficTimer = 0;
    if (destroyed) return;
    let progressed = false;
    syncTraffic();
    if (!traffic.state().active && !traffic.state().queued) {
      for (const actor of actors.values()) if (actor.entryPending) {
        const parent = actor.helper ? cloneAncestor(actor) : null;
        const instantEntry = reduced() || document.hidden;
        const point = actor.restoreEntry || instantEntry || actor.helper && quietSprites() ? actor.target : parent ? currentPosition(parent)
          : ENTRY_POINT;
        if (!actor.helper && !actor.restoreEntry && !instantEntry && !entranceLane) continue;
        const overlapIds = parent && !actor.restoreEntry && !quietSprites() ? [parent.id] : [];
        if (!spaceFree(point, actor, overlapIds)) continue;
        actor.entryPending = false; actor.node.style.visibility = '';
        observedIds.add(actor.id);
        progressed = true;
        actor.position = { x: point.x, y: point.y };
        actor.node.style.transform = actorTransform(actor.position, actor.helper);
        if (actor.restoreEntry) { actor.justEntered = false; finishAtStation(actor); }
        else if (actor.helper) enterClone(actor, actor.target).catch(showError);
        else { actor.entranceActive = true; openDoor(); settle(actor, actor.target, true).catch(showError); }
        syncTraffic();
        // Materialize one visitor at a time; a later arrival must not enter
        // the swept path of an already reserved walk.
        if (!actor.restoreEntry && !instantEntry && !(actor.helper && quietSprites())) break;
      }
    }
    const reservation = traffic.nextAny();
    if (reservation.kind === 'wait') {
      for (const { actor } of trafficWaiters.values()) {
        actor.node.dataset.traffic = 'queued';
        transitCaption(actor);
      }
    } else if (reservation.kind === 'arrived' || reservation.kind === 'move') {
      const id = reservation.id, actor = actors.get(id), pending = trafficWaiters.get(id);
      if (!actor || actor.entryPending) { traffic.cancel(id); return; }
      if (reservation.kind === 'arrived') {
        trafficWaiters.delete(id); actor.node.dataset.traffic = 'arrived';
        actor.yielding = false;
        if (pending) pending.resolve(true); else finishAtStation(actor);
        progressed = true;
      } else {
        trafficWaiters.delete(id);
        const serial = actor.serial;
        if (reservation.yielding) actor.yielding = true;
        animateWalk(actor, reservation.path, serial, pending?.carrying, reservation.instant, reservation.yielding).then(ok => {
          traffic.finish(id, reservation.token, currentPosition(actor));
          if (pending && ok && reservation.temporary) {
            trafficWaiters.set(id, pending);
            actor.node.dataset.traffic = 'queued';
          } else if (pending) pending.resolve(ok);
          if (!pending && ok) {
            if (reservation.temporary) {
              actor.node.dataset.traffic = 'yielding';
              transitCaption(actor, true);
            } else { actor.yielding = false; finishAtStation(actor); }
          }
          renderHelperLinks();
          queueTraffic();
        }).catch(error => { traffic.cancel(id, currentPosition(actor)); actor.yielding = false; pending?.resolve(false); showError(error); queueTraffic(); });
      }
    }
    // A blocked room sleeps until a movement completes, a request changes or
    // a real snapshot arrives. Do not burn a permanent polling loop at rest.
    if (progressed) { renderHelperLinks(); updateProps(); }
    if (progressed && (traffic.state().queued || trafficWaiters.size || [...actors.values()].some(actor => actor.entryPending))) queueTraffic();
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
  function cloneBusy(actor) { return ['splitting', 'returning', 'absorbing'].includes(actor.clonePhase); }
  function completedCloneTurn(session, previousTurnAt = 0) {
    return Scene.timestamp(session.turnCompletedAt) > previousTurnAt && session.activity === 'idle'
      && !session.disconnected && session.status !== 'stale' && !session.attention && !(Number(session.activeTools) > 0);
  }
  function completedCloneReturn(reason) { return reason === 'ended' || reason === 'completed'; }
  function clonePhase(actor, phase) { actor.clonePhase = phase; actor.node.dataset.clonePhase = phase; }
  function cloneAncestor(actor) {
    const chain = cloneLedger.parentChain(actor.id);
    const rootId = cloneLedger.rootFor(actor.id);
    if (rootId && rootId !== actor.id) { const at = chain.indexOf(rootId); if (at >= 0) chain.splice(at, 1); chain.unshift(rootId); }
    if (!chain.length && actor.session.parentId) chain.push(actor.session.parentId);
    return chain.map(id => actors.get(id)).find(parent => parent && parent !== actor && !parent.departing
      && !['returning', 'absorbing'].includes(parent.clonePhase) && (!parent.helper || !Scene.isClosed(parent.session))) || null;
  }
  function cloneEffect(actor, anchor, kind) {
    if (quietSprites() || !anchor) return;
    const effect = window.OfficeCloneMotion.burst({ anchor: anchor.node, kind, ownerId: actor.id, asset: assetURL('clawd-static-base.svg') });
    actor.cloneEffects.add(effect);
    effect.finished.finally(() => actor.cloneEffects.delete(effect));
  }
  function relatedClones(actor) {
    return [...actors.values()].filter(child => child.helper && child !== actor && cloneLedger.parentChain(child.id).includes(actor.id));
  }
  function holdForClones(actor) {
    if (!actor.holdingFamily) cancelAction(actor);
    actor.holdingFamily = true; actor.node.dataset.cloneHold = 'true';
    setPose(actor, 'clawd-static-base.svg');
    text(actor.state, '等分身归位');
  }
  function rememberRestedClone(id) {
    restedClones.add(id);
    const current = new Set(snapshot.sessions.map(session => session.id));
    for (const cached of restedClones) {
      if (restedClones.size <= 4096) break;
      if (!current.has(cached)) restedClones.delete(cached);
    }
  }
  function releaseWaitingRoots() {
    queueMicrotask(() => {
      if (destroyed) return;
      for (const actor of actors.values()) if (!actor.helper && actor.retireRequested && !actor.departing) depart(actor, actor.retireRequested.inactive).catch(showError);
    });
  }
  function cancelAction(actor) {
    actor.serial += 1;
    actor.yielding = false;
    const pendingMove = trafficWaiters.get(actor.id);
    if (pendingMove) { trafficWaiters.delete(actor.id); pendingMove.resolve(false); }
    traffic.cancel(actor.id, currentPosition(actor));
    delete actor.node.dataset.traffic;
    for (const effect of actor.cloneEffects || []) effect.cancel();
    actor.cloneEffects?.clear();
    clonePhase(actor, actor.helper ? 'working' : '');
    actor.returnReason = '';
    delete actor.node.dataset.cloneTarget;
    delete actor.node.dataset.cloneReason;
    if (actor.opacityMotion) { actor.opacityMotion.cancel(); actor.opacityMotion = null; }
    actor.node.style.opacity = '1';
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
    queueTraffic();
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
    let correction = Math.max(8 - bounds.left, Math.min(0, innerWidth - 8 - bounds.right));
    let down = 0;
    const clock = $('day-clock').getBoundingClientRect();
    const shifted = { left: bounds.left + correction, right: bounds.right + correction, top: bounds.top, bottom: bounds.bottom };
    if (shifted.left < clock.right + 6 && shifted.right > clock.left - 6 && shifted.top < clock.bottom + 6 && shifted.bottom > clock.top - 6) {
      const candidates = [clock.left - 8 - shifted.right, clock.right + 8 - shifted.left]
        .filter(dx => shifted.left + dx >= 8 && shifted.right + dx <= innerWidth - 8)
        .sort((a, b) => Math.abs(a) - Math.abs(b));
      if (candidates.length) correction += candidates[0];
      else down = Math.max(0, clock.bottom + 8 - shifted.top);
    }
    if (displayScale > 0) {
      actor.bubble.style.transform = 'translateX(calc(-50% + ' + (correction / displayScale).toFixed(2) + 'px)) translateY(' + (down / displayScale).toFixed(2) + 'px)';
      const positioned = actor.bubble.getBoundingClientRect();
      const anchor = actor.button.getBoundingClientRect();
      const tip = Math.max(9, Math.min(actor.bubble.offsetWidth - 14, ((anchor.left + anchor.right) / 2 - positioned.left) / displayScale));
      actor.bubble.style.setProperty('--bubble-tail-x', tip.toFixed(2) + 'px');
    }
    actor.bubble.dataset.show = 'true';
    clearTimeout(actor.bubbleTimer);
    actor.bubbleTimer = setTimeout(() => { actor.bubble.dataset.show = 'false'; }, duration);
  }
  function ensureMotionTicker() {
    if (frameTimer || destroyed || document.hidden || ![...actors.values()].some(actor => actor.motion)) return;
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
      if (moving && !document.hidden) frameTimer = requestAnimationFrame(tick);
    }
    frameTimer = requestAnimationFrame(tick);
  }
  async function move(actor, target, serial, carrying = false) {
    if (actor.serial !== serial) return false;
    syncTraffic();
    const parent = actor.helper ? cloneAncestor(actor) : null;
    const overlapIds = parent && (cloneBusy(actor) || actor.justEntered
      || Scene.actorsOverlap(currentPosition(actor), actorGeometry(actor), currentPosition(parent), actorGeometry(parent))) ? [parent.id] : [];
    if (!traffic.request(actor.id, target, { instant: reduced() || document.hidden, overlapIds })) return false;
    actor.node.dataset.traffic = 'queued';
    transitCaption(actor);
    return new Promise(resolve => { trafficWaiters.set(actor.id, { actor, target, serial, carrying, resolve }); pumpTraffic(); });
  }
  async function animateWalk(actor, path, serial, carrying = false, instant = false, yielding = false) {
    if (actor.serial !== serial) return false;
    const target = path.at(-1);
    actor.node.dataset.traffic = 'moving';
    const length = path.slice(1).reduce((sum, point, index) => sum + Scene.distance(path[index], point), 0);
    if (length < .65 || instant || reduced() || document.hidden) {
      actor.position = { x: target.x, y: target.y };
      actor.node.style.transform = actorTransform(actor.position, actor.helper);
      actor.node.style.zIndex = String(Math.round(target.y * 10));
      actor.arrivedAt = performance.now();
      actor.node.dataset.traffic = 'arrived';
      return true;
    }
    actor.node.dataset.walking = 'true';
    actor.carry.dataset.carry = String(carrying);
    text(actor.carry, '≡');
    setPose(actor, carrying ? 'clawd-working-carrying.svg' : 'clawd-static-base.svg');
    if (yielding) transitCaption(actor, true);
    else text(actor.state, actor.clonePhase === 'returning' ? completedCloneReturn(actor.returnReason) ? '结束分身' : '分身暂歇' : '前往' + Scene.ZONES[target.zone || actor.spec.zone].name);
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
    actor.node.dataset.traffic = 'arrived';
    if (!quietSprites()) {
      actor.arrival.animate([{ opacity: 0, transform: 'scale(.95)' }, { opacity: .8, offset: .25 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 500, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    return true;
  }
  function finishAtStation(actor) {
    if (trafficWaiters.has(actor.id)) return;
    if (actor.yielding) { transitCaption(actor, true); return; }
    if (cloneBusy(actor)) return;
    if (actor.holdingFamily) { setPose(actor, 'clawd-static-base.svg'); text(actor.state, '等分身归位'); return; }
    actor.spec = Scene.activitySpec(actor.session);
    actor.node.dataset.walking = 'false';
    const plan = Director.plan(actor.session, { now: Date.now(), language });
    actor.performanceSuspended = /^(?:cue|recent-work)\//.test(plan.phase || '');
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
    actor.entranceActive = false;
    updateEntranceLane();
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
    text(actor.state, '这一轮已歇下');
    setPose(actor, 'clawd-static-base.svg');
    say(actor, '会话还在，等下一轮', 2400);
    const key = Scene.projectKey(actor.session);
    archivedTurns.set(key, Math.min(3, (archivedTurns.get(key) || 0) + 1));
    $('archive-stack').dataset.count = String(archiveCount());
    const seat = actor.target;
    if (!await move(actor, seat, serial)) return;
    actor.entranceActive = false;
    updateEntranceLane();
    actor.completing = false;
    finishAtStation(actor);
  }
  async function enterClone(actor, seat) {
    const serial = cancelAction(actor);
    actor.target = seat;
    const parent = cloneAncestor(actor);
    actor.node.dataset.cloneOrigin = parent ? parent.id : '';
    actor.position = parent ? currentPosition(parent) : { x: seat.x, y: seat.y };
    actor.node.style.transform = actorTransform(actor.position, true);
    actor.node.style.zIndex = String(Math.round(actor.position.y * 10) + 1);
    if (quietSprites()) {
      actor.position = { x: seat.x, y: seat.y };
      actor.node.style.transform = actorTransform(actor.position, true);
      actor.node.style.zIndex = String(Math.round(seat.y * 10));
      actor.justEntered = false;
      finishAtStation(actor);
      return;
    }
    clonePhase(actor, 'splitting');
    text(actor.state, '分身出现');
    setPose(actor, 'clawd-static-base.svg');
    cloneEffect(actor, parent || actor, 'split');
    const fade = actor.node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    actor.opacityMotion = fade;
    fade.finished.catch(() => {}).then(() => {
      if (actor.serial !== serial || actors.get(actor.id) !== actor) return;
      actor.opacityMotion = null; fade.cancel();
      clonePhase(actor, 'working');
    });
    if (!await move(actor, seat, serial)) return;
    if (actor.serial !== serial) return;
    actor.justEntered = false;
    clonePhase(actor, 'working');
    finishAtStation(actor);
  }
  function finishCloneReturn(actor, parent, reason) {
    if (parent && actors.get(parent.id) === parent && !parent.departing) say(parent, completedCloneReturn(reason) ? '结束分身。' : '分身暂歇。', 2400);
    // A confirmed helper TURN may return its visual body while the real native
    // session remains open. Cache that body until new observed work arrives;
    // never fabricate SessionEnd or change the ledger's open/ended counts.
    if (reason !== 'ended') rememberRestedClone(actor.id);
    // This body was absorbed, rather than merely hidden on another page. A
    // later real reopening of the same identity must split from its root again.
    observedIds.delete(actor.id);
    removeActor(actor.id);
    releaseWaitingRoots();
  }
  function finishQuietClone(actor) {
    if (!actor.helper || !quietSprites() || !actor.departing && !cloneBusy(actor) && !actor.motion) return;
    const returning = actor.departing;
    const reason = actor.returnReason || (Scene.isClosed(actor.session) ? 'ended' : 'resting');
    const parent = returning ? cloneAncestor(actor) : null;
    const target = actor.target;
    cancelAction(actor);
    if (returning) { actor.departing = true; finishCloneReturn(actor, parent, reason); return; }
    actor.justEntered = false;
    // Reduced motion still reserves the destination. Another visible body
    // may be travelling between the old and newly planned seat layouts.
    move(actor, target, actor.serial).then(ok => { if (ok && actors.get(actor.id) === actor) finishAtStation(actor); }).catch(showError);
  }
  async function returnClone(actor, reason) {
    if (actor.departing) return;
    const serial = cancelAction(actor);
    actor.departing = true; actor.returnReason = reason;
    clonePhase(actor, 'returning');
    actor.node.dataset.cloneReason = reason;
    actor.node.dataset.attention = 'false';
    text(actor.state, completedCloneReturn(reason) ? '结束分身' : '分身暂歇');
    let parent = cloneAncestor(actor);
    actor.node.dataset.cloneTarget = parent ? parent.id : '';
    setPose(actor, 'clawd-static-base.svg');
    if (quietSprites()) { finishCloneReturn(actor, parent, reason); return; }
    // Re-read the rendered body after each leg: the original parent may have
    // moved, returned into its own parent, or left this room in the meantime.
    while (parent && actor.serial === serial && !destroyed) {
      actor.node.dataset.cloneTarget = parent.id;
      const target = { ...currentPosition(parent), zone: parent.target?.zone || parent.spec.zone };
      if (!await move(actor, target, serial)) return;
      parent = cloneAncestor(actor);
      if (!parent || Scene.distance(currentPosition(actor), currentPosition(parent)) < 1.1) break;
      if (!await delay(actor, 80, serial)) return;
    }
    if (actor.serial !== serial || destroyed) return;
    parent = cloneAncestor(actor);
    actor.node.dataset.cloneTarget = parent ? parent.id : '';
    if (parent) {
      actor.position = currentPosition(parent);
      actor.node.style.transform = actorTransform(actor.position, true);
    }
    clonePhase(actor, 'absorbing');
    actor.node.dataset.walking = 'false';
    actor.bubble.dataset.show = 'false';
    cloneEffect(actor, parent || actor, 'absorb');
    const fade = actor.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    actor.opacityMotion = fade;
    await fade.finished.catch(() => {});
    if (actor.serial !== serial || destroyed) return;
    finishCloneReturn(actor, parent, reason);
  }
  async function depart(actor, inactive = false) {
    // An unmaterialized entrance has no body or route reservation to return.
    // Remove that pending presentation immediately when its source retires.
    if (actor.entryPending) {
      if (actor.helper && inactive) rememberRestedClone(actor.id);
      observedIds.delete(actor.id);
      removeActor(actor.id);
      releaseWaitingRoots();
      return;
    }
    if (actor.departing) return;
    if (actor.helper) {
      const completed = inactive && completedCloneTurn(actor.session, actor.lastTurnAt);
      if (completed) actor.lastTurnAt = Scene.timestamp(actor.session.turnCompletedAt);
      await returnClone(actor, inactive ? completed ? 'completed' : 'resting' : 'ended'); return;
    }
    actor.retireRequested = { inactive };
    if (cloneLedger.stats(actor.id).active > 0) { holdForClones(actor); return; }
    // A root waits locally for visible clones to merge; helpers never acquire
    // an independent doorway route, including uncertain or idle retirements.
    for (const child of relatedClones(actor)) if (!child.departing) {
      const current = snapshot.sessions.find(session => session.id === child.id);
      if (current) { child.session = current; child.spec = Scene.activitySpec(current); }
      depart(child, !Scene.isClosed(child.session)).catch(showError);
    }
    if (relatedClones(actor).length) { holdForClones(actor); return; }
    actor.holdingFamily = false; actor.node.dataset.cloneHold = 'false';
    actor.departing = true;
    const serial = cancelAction(actor);
    actor.node.dataset.attention = 'false';
    text(actor.state, inactive ? '出去歇一会儿' : '会话结束，收拾一下');
    say(actor, inactive ? '有新工作再回来' : '这次先收工啦', 2200);
    if (!await move(actor, doorPoint(actor), serial, false)) return;
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
    const restored = reflowPending || observedIds.has(session.id) && !attendance.entering.includes(session.id)
      || snapshotReceived === 1 && !session.parentId;
    const helper = Boolean(session.parentId);
    const actor = { id: session.id, session, spec: Scene.activitySpec(session), node, button, body, image, title, relation, provider, state, bubble, carry, arrival, position: { x: seat.x, y: seat.y }, target: seat, helper, serial: 0, delays: new Set(), cloneEffects: new Set(), clonePhase: helper ? 'working' : '', motion: null, lastTurnAt: Scene.timestamp(session.turnCompletedAt), arrivedAt: -10000, lastZone: restored ? seat.zone : '', currentAsset: '', wantedAsset: '', bubbleTimer: 0, defer: 0, justEntered: !restored, completing: false, departing: false, holdingFamily: false, retireRequested: null, entryPending: true, restoreEntry: restored };
    node.style.visibility = 'hidden';
    node.dataset.clonePhase = actor.clonePhase;
    actor.performance = window.OfficeAvatarPerformance.create({ actorNode: node, body, image, session, clockRegistry: performanceClocks });
    actor.appearance = window.OfficeFamilyAppearance.create({ actorNode: node, body, image });
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
    // Image state is available while the physical entrance waits its turn.
    setPose(actor, actor.spec.asset);
    updateEntranceLane();
    queueTraffic();
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
    const parent = familyGraph.byId.get(session.parentId) || actors.get(session.parentId)?.session;
    const rootId = cloneLedger.rootFor(session.id) || (family ? family.rootId : session.id);
    const counts = cloneLedger.stats(session.id);
    const appearance = paletteRegistry.forRoot(rootId);
    actor.node.style.setProperty('--family-color', appearance.color);
    actor.appearance?.update({ rootId, appearance, helper: Boolean(session.parentId), depth: family ? family.depth : 0, language });
    actor.node.dataset.family = rootId;
    actor.node.dataset.hasFamily = 'true';
    actor.node.dataset.activeClones = String(counts.active);
    actor.node.dataset.totalClones = String(counts.total);
    actor.relation.textContent = parent ? I18n.t(language,'identity.parent',{name:displayName(parent)}) : session.parentId ? tr('子任务 · 父任务未在场') : cloneSummary(session);
    actor.relation.title = session.parentId ? actor.relation.textContent : I18n.t(language, 'family.clonesHint');
    text(actor.provider, session.provider === 'claude-code' ? 'Claude' : Scene.providerName(session.provider));
    if (actor.holdingFamily) text(actor.state, '等分身归位');
    else if (!actor.motion && !actor.yielding && !trafficWaiters.has(actor.id) && !actor.completing && !actor.departing && !cloneBusy(actor)) text(actor.state, spec.label);
    if (actor.yielding) transitCaption(actor, true);
    if (trafficWaiters.has(actor.id)) transitCaption(actor);
    actor.button.setAttribute('aria-label', displayName(session) + ' · ' + Scene.providerName(session.provider) + ' · ' + String(session.title || '未命名任务') + '，' + tr(spec.label) + '。' + tr('单击查看详情，双击打招呼。'));
    actor.button.setAttribute('aria-pressed', String(session.id === selectedSession));
  }
  async function react(actor) {
    if (actor.departing || actor.spec.stale || cloneBusy(actor) || actor.holdingFamily) return;
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
    if (!await delay(actor, 3000, serial)) return;
    actor.node.dataset.reaction = 'false';
    settle(actor, seat, true).catch(showError);
  }
  function removeActor(id) {
    const actor = actors.get(id);
    if (!actor) return;
    cancelAction(actor);
    clearTimeout(actor.bubbleTimer);
    if (actor.performance) { actor.performance.update(actor.session, { now: Date.now(), hidden: true }); actor.performance.destroy(); }
    if (actor.appearance) actor.appearance.destroy();
    actor.node.remove();
    actors.delete(id);
    updateEntranceLane();
    renderHelperLinks();
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
    traffic.clear();
    $('helper-links').replaceChildren();
    for (const effect of $('effects').children) effect.getAnimations().forEach((animation) => animation.cancel());
    $('effects').replaceChildren();
  }
  function reconcileActors() {
    const sessions = snapshot.sessions;
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));
    const visibleIds = new Set(currentPage.visible.map((session) => session.id));
    const retiringIds = new Set(attendance.retired);
    // Process descendants first so their return owns its parent anchor before
    // a simultaneous root end can begin the doorway departure.
    for (const actor of [...actors.values()].sort((a, b) => cloneLedger.parentChain(b.id).length - cloneLedger.parentChain(a.id).length)) {
      const next = sessionMap.get(actor.id);
      if (actor.retireRequested && next && !Scene.isClosed(next) && visibleIds.has(actor.id)) {
        actor.retireRequested = null; actor.holdingFamily = false; actor.node.dataset.cloneHold = 'false';
      }
      if ((next && Scene.isClosed(next) || retiringIds.has(actor.id) || attendance.leaving.includes(actor.id) || actor.retireRequested) && Scene.inRoom(next || actor.session, selectedProject)) {
        actor.session = next || actor.session; actor.spec = Scene.activitySpec(actor.session); updateActorLabel(actor);
        depart(actor, !Scene.isClosed(actor.session)).catch(showError);
      }
      else if (!visibleIds.has(actor.id) && !actor.departing) removeActor(actor.id);
    }
    const nextSeats = currentPage.seats;
    for (const session of currentPage.visible.slice().sort((a, b) => cloneLedger.parentChain(a.id).length - cloneLedger.parentChain(b.id).length)) {
      // A quiet synchronous return earlier in this reconciliation may have
      // absorbed this idle body after the visible-page list was calculated.
      if (restedClones.has(session.id) && !Clones.isActive(session)) continue;
      const seat = nextSeats.get(session.id);
      if (!seat) continue;
      let actor = actors.get(session.id);
      if (!actor) { makeActor(session, seat); continue; }
      const old = actor.session;
      const oldSpec = actor.spec;
      const spec = Scene.activitySpec(session);
      actor.session = session;
      actor.spec = spec;
      actor.helper = Boolean(session.parentId);
      updateActorLabel(actor);
      if (actor.entryPending) { actor.target = seat; continue; }
      if (reflowPending) {
        cancelAction(actor);
        actor.position = { x: seat.x, y: seat.y }; actor.target = seat;
        actor.entranceActive = false;
        actor.node.style.transform = actorTransform(actor.position, actor.helper);
        actor.node.style.zIndex = String(Math.round(seat.y * 10));
        actor.justEntered = false; finishAtStation(actor); continue;
      }
      const completedAt = Scene.timestamp(session.turnCompletedAt);
      const newCompletion = actor.helper ? completedCloneTurn(session, actor.lastTurnAt) : completedAt > actor.lastTurnAt && session.activity === 'idle' && !spec.stale;
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
        // An idle source row can remain present during a neutral return after
        // its root ends. Only new work/reopening may interrupt that return.
        if (actor.helper && ['resting', 'completed'].includes(actor.returnReason) && !Clones.isActive(session)) continue;
        actor.departing = false;
        cancelAction(actor);
        settle(actor, seat, true).catch(showError);
        continue;
      }
      if (newCompletion && actor.helper) { actor.lastTurnAt = completedAt; returnClone(actor, 'completed').catch(showError); }
      else if (newCompletion) completeTurn(actor, completedAt, seat).catch(showError);
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
    reflowPending = false;
    updateEntranceLane();
    queueTraffic();
    renderHelperLinks();
    updateProps();
  }
  function renderHelperLinks() {
    const layer = $('helper-links');
    const fragments = document.createDocumentFragment();
    for (const actor of actors.values()) {
      if (!actor.session.parentId || actor.entryPending) continue;
      const family = familyGraph.info.get(actor.id);
      // Relationship lines follow the observed immediate ancestry; the main
      // body used for split/return motion is deliberately a separate choice.
      const parent = cloneLedger.parentChain(actor.id).map(id => actors.get(id))
        .find(candidate => candidate && candidate !== actor && !candidate.departing);
      if (!parent || parent.entryPending || parent.departing || actor.departing) continue;
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
      line.style.setProperty('--family-color', paletteRegistry.forRoot(cloneLedger.rootFor(actor.id) || family?.rootId || actor.id).color);
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
    $('archive-stack').dataset.count = String(archiveCount());
  }
  function selectSession(id) {
    const session = snapshot.sessions.find((item) => item.id === id);
    if (!session) return;
    if (!Scene.inRoom(session, selectedProject)) switchRoom(Scene.projectKey(session), false);
    const family = Scene.pageSessions(attendance.present, selectedProject, 0, '', sceneOptions());
    const roots = family.roots;
    const mainId = family.rootIdsBySession.get(session.id) || session.id;
    const index = roots.findIndex((item) => item.id === mainId);
    const nextPage = index < 0 ? page : Math.floor(index / family.capacity);
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
    $('inspect-persona-name').textContent = displayName(session);
    $('inspect-persona-trait').textContent = language === 'en' ? personality.traitEn : personality.traitZh;
    $('inspect-keepsake').textContent = keepsakeIcon(session);
    $('greet-agent').disabled = !actor || actor.departing || Boolean(spec.stale) || cloneBusy(actor) || actor.holdingFamily;
    text($('inspect-title'), session.title || '未命名任务');
    text($('inspect-location'), attendance.retired.includes(session.id) || restedClones.has(session.id) ? session.parentId ? '分身暂歇' : '门外休息' : actor && actor.motion ? '前往' + Scene.ZONES[(actor.target || spec).zone].name
      : actor && actor.node?.dataset.traffic === 'queued' ? language === 'en' ? 'Waiting for a clear path' : '等候通道' : Scene.ZONES[spec.zone].name);
    text($('inspect-summary'), session.summary || spec.verb);
    text($('inspect-state'), spec.label);
    text($('inspect-signal'), timeAgo(session.lastEventAt));
    text($('inspect-tools'), Number(session.activeTools) > 0 ? session.activeTools + ' 个工具调用进行中' : '');
    const parent = snapshot.sessions.find(item => item.id === session.parentId) || actors.get(session.parentId)?.session;
    $('inspect-helper').hidden = false;
    $('inspect-helper').dataset.parentId = parent ? parent.id : '';
    $('inspect-helper').disabled = !parent;
    text($('inspect-helper'), parent ? (language === 'en' ? '↳ Helping ' : '↳ 协助 ') + displayName(parent) + ' ↗' : session.parentId ? (language === 'en' ? 'Parent is outside' : '父任务未在场') : cloneSummary(session));
    $('inspect-helper').title = session.parentId ? $('inspect-helper').textContent : I18n.t(language, 'family.clonesHint');
    text($('open-source'), '打开项目文件夹 ↗');
    $('open-source').disabled = !session.projectPath;
    text($('inspect-action-note'), Scene.needsAttention(session) ? '请回到 ' + Scene.providerName(session.provider) + ' 回答或处理审批。' : spec.stale ? '最后位置已保留，尚不能确认当前进度。' : '此按钮打开 Finder。任务与对话请回到原工具查看。');
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
    const sessions = snapshot.sessions.filter((session) => !Scene.isClosed(session) && Scene.inRoom(session, selectedProject));
    for (const session of Family.build(sessions).ordered) {
      const spec = Scene.activitySpec(session);
      const row = element('button', 'roster-row');
      row.type = 'button';
      row.dataset.attention = String(Scene.needsAttention(session));
      const family = familyGraph.info.get(session.id);
      row.style.setProperty('--family-color', paletteRegistry.forRoot(cloneLedger.rootFor(session.id) || family?.rootId || session.id).color);
      row.style.marginLeft = (Math.min(3,family ? family.depth : 0)*18)+'px';
      const copy = element('span', 'roster-copy');
      copy.append(element('strong', '', displayName(session)), element('span', 'roster-task', session.title || '未命名任务'));
      const parent = familyGraph.byId.get(session.parentId);
      if (parent) { const relation = element('span','roster-relation'); relation.textContent = '↳ ' + I18n.t(language,'identity.parent',{name:displayName(parent)}); copy.append(relation); }
      else if (!session.parentId) { const relation = element('span','roster-relation'); relation.textContent = cloneSummary(session); relation.title = I18n.t(language, 'family.clonesHint'); copy.append(relation); }
      row.append(copy, element('span', 'roster-state', (attendance.retired.includes(session.id) || restedClones.has(session.id) ? tr(session.parentId ? '分身暂歇' : '门外休息') : tr(spec.label)) + ' →'));
      row.addEventListener('click', () => { $('roster-dialog').close(); selectSession(session.id); });
      fragment.append(row);
    }
    $('roster-list').replaceChildren(fragment);
  }
  function render() {
    office.dataset.mode = snapshot.mode;
    cloneLedger.update(snapshot.sessions, Date.now());
    for (const session of snapshot.sessions) if (Clones.isActive(session)) restedClones.delete(session.id);
    attendance = attendanceModel.update(snapshot.sessions);
    familyGraph = Family.build(snapshot.sessions);
    const openFamilies = snapshot.sessions.filter(session => !Scene.isClosed(session))
      .map(session => cloneLedger.rootFor(session.id) || familyGraph.info.get(session.id)?.rootId || session.id);
    paletteRegistry.update(openFamilies);
    familyGraph = Family.build(snapshot.sessions, { registry: paletteRegistry });
    const roomBefore = selectedProject;
    rooms = Scene.roomsFor(snapshot.sessions);
    const roomChoice = Scene.chooseRoom(rooms, attendance.present, { current: selectedProject, explicit: roomSelectionExplicit });
    selectedProject = roomChoice.key;
    roomSelectionExplicit = roomChoice.explicit;
    if (roomBefore && roomBefore !== selectedProject) { clearActors(); page = 0; }
    const options = document.createDocumentFragment();
    const overview = element('option', 'project-option', I18n.t(language, 'room.overview', {count: rooms.reduce((sum, room) => sum + room.roots, 0)}));
    overview.value = Scene.ALL_ROOMS;
    options.append(overview);
    for (const room of rooms) {
      const option = element('option', 'project-option', I18n.t(language, 'room.option', {name:room.name,count:room.roots}) + (room.helpers ? I18n.t(language,'room.helpersSuffix',{count:room.helpers}) : '') + (room.attention ? I18n.t(language,'room.attentionSuffix',{count:room.attention}) : ''));
      option.value = room.key;
      options.append(option);
    }
    if (selectedProject && selectedProject !== Scene.ALL_ROOMS && !rooms.some((room) => room.key === selectedProject)) {
      const option = element('option', 'project-option', I18n.t(language,'room.quietOption',{name:selectedProject.split(/[\\/]/).filter(Boolean).pop()}));
      option.value = selectedProject;
      options.append(option);
    }
    $('project-select').replaceChildren(options);
    $('project-select').value = selectedProject;
    $('room-switcher').hidden = !rooms.length;
    currentPage = Scene.pageSessions(attendance.present, selectedProject, page, selectedSession, sceneOptions());
    page = currentPage.page;
    reconcileActors();
    const alive = snapshot.sessions.filter((session) => !Scene.isClosed(session));
    const allRoomSessions = alive.filter((session) => Scene.inRoom(session, selectedProject));
    const roomSessions = attendance.present.filter((session) => Scene.inRoom(session, selectedProject) && !restedClones.has(session.id));
    const localAttention = roomSessions.filter(Scene.needsAttention);
    const otherAttention = alive.filter((session) => !Scene.inRoom(session, selectedProject) && Scene.needsAttention(session));
    const outsideRoots = attendance.present.filter(session => !session.parentId && !Scene.inRoom(session, selectedProject)).length;
    $('all-projects').hidden = !outsideRoots;
    text($('all-projects'), I18n.t(language, 'room.showAll', {count: outsideRoots}));
    $('all-projects').title = I18n.t(language, 'room.showAll', {count: outsideRoots});
    const helpers = roomSessions.filter((session) => session.parentId).length;
    const rootCount = roomSessions.length - helpers;
    const quiet = roomSessions.filter((session) => session.status === 'stale' || session.disconnected).length;
    $('page-empty').hidden = roomSessions.length > 0 || !attendance.present.some((session) => !Scene.inRoom(session, selectedProject));
    $('other-attention').hidden = !otherAttention.length;
    text($('other-attention'), '其他房间 ' + otherAttention.length + ' 项待处理');
    $('attention-jump').hidden = !localAttention.length;
    text($('attention-jump'), localAttention.length + ' 项需要你 →');
    $('status-dot').dataset.status = localAttention.length ? 'waiting' : roomSessions.length ? 'active' : 'empty';
    let summary = roomSessions.length ? rootCount + ' 项独立任务' + (helpers ? ' · ' + helpers + ' 位临时帮手' : '') : '实时办公室 · 等待任务入驻';
    if (quiet) summary += ' · ' + quiet + ' 项信号暂未更新';
    if (currentPage.helperOverflow) summary += language === 'en' ? ' · including ' + currentPage.helperOverflow + ' helpers off stage' : ' · 其中 ' + currentPage.helperOverflow + ' 位帮手未显示';
    text($('room-summary'), summary);
    const stats = snapshot.activityStats;
    const count = key => stats && !stats.error && Number.isInteger(stats[key]) && stats[key] >= 0 ? stats[key] : '—';
    text($('today-total'), count('total'));
    text($('today-roots'), (language === 'en' ? 'Main ' : '主 Agent ') + count('roots'));
    text($('today-helpers'), (language === 'en' ? 'clones ' : '分身 ') + count('helpers'));
    $('activity-stats').dataset.available = String(Boolean(stats && !stats.error));
    $('activity-stats').dataset.error = String(Boolean(stats?.error));
    $('activity-stats').querySelector('.stats-label').textContent = stats?.error ? (language === 'en' ? 'Today · incomplete' : '今日活跃 · 不完整')
      : language === 'en' ? 'Today’s active agents' : '今日活跃 Agent';
    $('activity-stats').title = stats?.error ? (language === 'en' ? 'Saving or restoring today’s observed count failed; the count may be incomplete.' : '今日观察统计保存或恢复失败，数据可能不完整。')
      : language === 'en' ? 'Unique agents observed working today in Hong Kong time, across all projects. The count may omit activity before observation began.'
        : '按香港时间统计今天实际观察到工作的独立 Agent，涵盖所有项目；开始观察前的活动可能未计入。';
    const recent = roomSessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    text($('signal-summary'), recent ? timeAgo(recent) : '');
    $('pagination').hidden = currentPage.pages <= 1;
    $('roster-button').hidden = allRoomSessions.length === 0;
    text($('roster-button'), '全部 ' + allRoomSessions.length + ' 位伙伴');
    text($('page-label'), (page + 1) + ' / ' + currentPage.pages + ' 组');
    $('page-prev').disabled = page === 0;
    $('page-next').disabled = page >= currentPage.pages - 1;
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
    snapshot = { ...next, mode: 'live', sessions: next.sessions.filter((session) => session && typeof session.id === 'string'), connections: Array.isArray(next.connections) ? next.connections : [] };
    render();
  }
  async function refreshSnapshot() { const next = await call('getSnapshot'); if (next) receive(next); }
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
    const candidates = snapshot.sessions.filter((session) => Scene.needsAttention(session) && (outside ? !Scene.inRoom(session, selectedProject) : Scene.inRoom(session, selectedProject)));
    if (!candidates.length) return;
    const index = candidates.findIndex((session) => session.id === selectedSession);
    selectSession(candidates[(index + 1) % candidates.length].id);
  }
  function applySettings(next) {
    const oldScale = settings.agentScale;
    const requestedScale = Number(next && next.agentScale);
    const nextScale = Number.isFinite(requestedScale) && requestedScale > 0 ? Math.max(.65, Math.min(1.35, requestedScale)) : 1;
    const scaleChanged = oldScale !== nextScale;
    if (scaleChanged) {
      // Capture physical positions before changing the transform scale.
      for (const actor of [...actors.values()]) {
        const returning = actor.helper && actor.departing;
        const reason = actor.returnReason;
        const parent = returning ? cloneAncestor(actor) : null;
        const leaving = actor.departing && !actor.helper;
        cancelAction(actor);
        if (returning) finishCloneReturn(actor, parent, reason || (Scene.isClosed(actor.session) ? 'ended' : 'resting'));
        else if (leaving) { openDoor(); removeActor(actor.id); }
      }
      traffic.clear();
      reflowPending = true;
    }
    settings = { ...settingsDefaults, ...next, agentScale: nextScale };
    const previousLanguage = language;
    language = settings.language === 'en' ? 'en' : 'zh';
    applyLanguage();
    office.dataset.rain = String(settings.rain);
    scenery.update(settings, language);
    office.dataset.reducedMotion = String(reduced());
    office.dataset.lowPower = String(settings.lowPower);
    for (const key of ['rain', 'reducedMotion', 'lowPower', 'idleVisitor']) $('setting-' + key).checked = Boolean(settings[key]);
    $('setting-sceneTime').value = settings.sceneTime;
    $('setting-agentScale').value = String(Math.round(settings.agentScale * 100));
    text($('agent-scale-value'), Math.round(settings.agentScale * 100) + '%');
    for (const actor of [...actors.values()]) {
      finishQuietClone(actor);
      if (!actors.has(actor.id)) continue;
      if (reduced() && actor.motion) {
        const target = actor.target;
        const wasDeparting = actor.departing;
        cancelAction(actor);
        if (wasDeparting && (attendance.retired.includes(actor.id) || Scene.isClosed(actor.session))) { if (!actor.helper) openDoor(); removeActor(actor.id); continue; }
        actor.departing = false;
        settle(actor, target, true).catch(showError);
      } else setPose(actor, actor.wantedAsset || actor.spec.asset);
      updateActorLabel(actor);
      if (previousLanguage !== language) { clearTimeout(actor.bubbleTimer); actor.bubble.dataset.show = 'false'; }
    }
    renderHelperLinks();
    visitor.tick();
    renderInspector();
    render();
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
  $('setting-agentScale').addEventListener('change', event => saveSettings({ agentScale: Number(event.target.value) / 100 }));
  $('day-reset').addEventListener('click', () => { $('setting-sceneTime').focus(); saveSettings({ sceneTime: 'auto' }); });
  $('roster-button').addEventListener('click', () => openDialog('roster-dialog'));
  $('greet-agent').addEventListener('click', () => { const actor = actors.get(selectedSession); if (actor) react(actor); });
  $('inspect-helper').addEventListener('click', () => { const id = $('inspect-helper').dataset.parentId; if (id) selectSession(id); });
  $('dismiss-error').addEventListener('click', () => { $('error-message').hidden = true; });
  $('project-select').addEventListener('change', (event) => switchRoom(event.target.value));
  $('all-projects').addEventListener('click', () => switchRoom(Scene.ALL_ROOMS));
  $('other-attention').addEventListener('click', () => jumpAttention(true));
  $('attention-jump').addEventListener('click', () => jumpAttention(false));
  $('page-prev').addEventListener('click', () => { page = Math.max(0, page - 1); selectedSession = ''; $('inspector').hidden = true; clearActors(); render(); });
  $('page-next').addEventListener('click', () => { page = Math.min(currentPage.pages - 1, page + 1); selectedSession = ''; $('inspector').hidden = true; clearActors(); render(); });
  $('close-inspector').addEventListener('click', () => { selectedSession = ''; $('inspector').hidden = true; for (const actor of actors.values()) updateActorLabel(actor); });
  $('open-source').addEventListener('click', () => attempt(async () => {
    const id = selectedSession;
    if (!id) return;
    const result = await call('openSource', id);
    if (result && (result.message || result.detail)) text($('inspect-action-note'), result.message || result.detail);
  }));
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
    for (const actor of [...actors.values()]) { finishQuietClone(actor); if (actors.has(actor.id)) setPose(actor, actor.wantedAsset || actor.spec.asset); }
    renderHelperLinks();
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
    const roomSessions = snapshot.sessions.filter((session) => Scene.inRoom(session, selectedProject) && !Scene.isClosed(session));
    const recent = roomSessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    text($('signal-summary'), recent ? timeAgo(recent) : '');
  }, 12000);
  const secondsTimer = setInterval(() => { if (!document.hidden) scenery.updateClock(settings, language); }, 1000);
  window.addEventListener('beforeunload', () => {
    destroyed = true;
    visitor.destroy();
    scenery.destroy();
    clearInterval(clockTimer);
    clearInterval(secondsTimer);
    cancelAnimationFrame(frameTimer);
    clearTimeout(trafficTimer);
    clearTimeout(doorTimer);
    clearActors();
    performanceClocks.clear();
    observer.disconnect();
    if (typeof unsubscribe === 'function') unsubscribe();
  });
})();
