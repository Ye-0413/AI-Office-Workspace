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
  const settingsDefaults = { rain: false, night: false, sceneTime: 'auto', sceneVenue: 'workshop', sceneTheme: 'auto', sceneWeather: 'auto', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: true, sound: false, selectedProject: '', language: 'zh' };
  let settings = { ...settingsDefaults };
  let settingsRequest = 0;
  let language = 'zh';
  const usageHistory = window.OfficeUsageHistory?.create({ bridge, getLanguage: () => language });
  const setupAssistant = window.OfficeSetupAssistant?.create({ bridge, getLanguage: () => language });
  const scenery = window.OfficeDayScenery.create({ office, world, layer: $('window-scenery') });
  const attendanceModel = Attendance.createAttendance();
  const cloneLedger = Clones.createLedger();
  const restedClones = new Set();
  const paletteRegistry = Family.createPaletteRegistry();
  const CLOCK_RESERVED = Scene.CLOCK_RESERVED;
  const ENTRY_POINT = { x: 87, y: 78, zone: 'exit' };
  const traffic = Traffic.createCoordinator({ reservedRects: CLOCK_RESERVED, gap: Scene.ACTOR_GAP, limit: 256,
    legalPoint: (point, actor) => Scene.legalActorPoint(point, { ...actor, reservedRects: CLOCK_RESERVED }) });
  const trafficWaiters = new Map();
  let trafficTimer = 0;
  let blockedTrafficTimer = 0;
  let blockedTraffic = null;
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
  let uniformScale = 1;
  const pendingArrivals = new Set();
  let admissionFrame = 0;
  const actorFootprints = new Map();
  const footprintCache = new Map();
  const protectedEntrances = new Map();
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
  const sceneContext = () => ({ venue: settings.sceneVenue, scene: settings.sceneVenue, theme: settings.sceneTheme, weather: settings.sceneWeather,
    language, reducedMotion: reduced(), lowPower: settings.lowPower, hidden: document.hidden, dayPhase: office.dataset.dayPhase, now: Date.now() });
  const social = window.OfficeAgentSocial?.create({ layer: $('social-effects'), world, getActors: () => actors, getContext: sceneContext });
  const themeEnvironment = window.OfficeThemeEnvironment?.create({ office, world, getState: sceneContext });
  const venueStage = window.OfficeVenueStage?.create({ office, world, topbar: document.querySelector('.topbar'), getState: sceneContext,
    onSelectVenue: id => saveSettings({ sceneVenue: id }), onInteraction: payload => social?.trigger(payload) });
  const festivalStage = window.OfficeFestivalStage?.create({ office, world, topbar: document.querySelector('.topbar'), getState: sceneContext,
    onSelectTheme: (id,meta) => { venueStage?.update({ ...sceneContext(), theme: id, instant: meta?.source === 'keyboard' }); return saveSettings({ sceneTheme: id }); }, onSelectWeather: id => saveSettings({ sceneWeather: id }), onInteraction: payload => { themeEnvironment?.trigger(payload); social?.trigger(payload); } });

  office.dataset.festivals = String(Boolean(festivalStage));

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
    usageHistory?.updateLanguage();
    setupAssistant?.updateLanguage();
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
  function zoneName(zone) { return zone === 'stage' ? (language === 'en' ? 'All-agent floor' : '全员席位') : window.OfficeVenues?.zoneLabel(settings.sceneVenue, zone, language) || tr(Scene.ZONES[zone]?.name || ''); }
  function cloneSummary(session) { return I18n.t(language, 'family.clonesSummary', cloneLedger.stats(session.id)); }
  function archiveCount() { return selectedProject === Scene.ALL_ROOMS ? Math.min(3, [...archivedTurns.values()].reduce((sum, count) => sum + count, 0)) : archivedTurns.get(selectedProject) || 0; }
  function keepsakeIcon(session) { return ({teacup:'♨',paperboat:'⛵',bookmark:'▤',lantern:'✧',leaf:'❧',pebble:'◇',bell:'♧',pencil:'✎',shell:'⌁',star:'✦',acorn:'♧',ribbon:'⋈'})[persona(session).keepsake] || '✦'; }
  function reduced() { return settings.reducedMotion || mediaReduce.matches; }
  function quietSprites() { return reduced() || settings.lowPower || document.hidden; }
  function assetURL(name, replay) { return '../assets/avatars/' + name + (replay ? '?_t=' + (++spriteNonce) : ''); }
  function setPose(actor, name, replay = false) {
    const performanceSession = actor.visualWorkActivity ? { ...actor.session, activity: actor.visualWorkActivity } : actor.session;
    const performance = actor.performance && actor.performance.update(performanceSession, { now: Date.now(), reducedMotion: reduced(), lowPower: settings.lowPower, hidden: document.hidden || actor.entryPending, walking: Boolean(actor.motion) || actor.node.dataset.walking === 'true', reaction: false, departing: actor.departing, stale: actor.spec.stale });
    actor.fallback?.retry();
    const asset = quietSprites() ? 'clawd-static-base.svg' : performance && performance.active ? performance.asset : name;
    actor.wantedAsset = name;
    const recoverBitmap = actor.image.hidden && actor.image.complete;
    if (actor.currentAsset === asset && !replay && !recoverBitmap) return;
    actor.currentAsset = asset;
    actor.image.dataset.asset = asset;
    // Retry a failed cached resource on a later normal state update. Do not
    // start another load while that retry is still in flight.
    actor.image.src = assetURL(asset, recoverBitmap || replay && !quietSprites());
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
    return 'translate3d(' + (point.x * 12.8).toFixed(2) + 'px,' + (point.y * 7.2).toFixed(2) + 'px,0) scale(' + uniformScale.toFixed(6) + ')';
  }
  function sceneOptions() {
    return { requestedScale: settings.agentScale, footprints: actorFootprints, reservedRects: CLOCK_RESERVED, previousSeats: seats, previousScale: uniformScale, previousRequestedScale: currentPage.requestedScale };
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
  function actorGeometry(actor) { return { helper: actor.helper, uniformScale, layoutMode: currentPage.layoutMode, footprint: actorFootprints.get(actor.id) }; }
  function measureActorFootprints(sessions) {
    const frameScale = world.getBoundingClientRect().width / Scene.WORLD.width;
    if (!frameScale) return;
    const liveIds = new Set(sessions.map(session => session.id));
    for (const id of actorFootprints.keys()) if (!liveIds.has(id) && !actors.has(id)) actorFootprints.delete(id);
    let grew = false;
    for (const session of sessions) {
      const parent = familyGraph.byId.get(session.parentId) || actors.get(session.parentId)?.session;
      const relation = parent ? I18n.t(language, 'identity.parent', { name: displayName(parent) })
        : session.parentId ? tr('子任务 · 父任务未在场') : cloneSummary(session);
      const labels = [...new Set([tr(Scene.activitySpec(session).label), tr(Director.plan(session, { now: Date.now(), language }).label),
        tr('会话已结束'), tr('这一轮已歇下'), tr(session.parentId ? '结束分身' : '等分身归位'),
        actors.get(session.id)?.state.textContent].filter(Boolean))];
      const name = displayName(session), provider = tr(session.provider === 'claude-code' ? 'Claude' : Scene.providerName(session.provider));
      const key = JSON.stringify([Boolean(session.parentId), language, name, relation, provider, labels]);
      let footprint = footprintCache.get(key);
      if (!footprint) {
        // Measure the same CSS and text as the real plate before choosing a
        // page. Artwork stays inside the fixed body canvas; no sprite sampling.
        const node = element('div', 'actor');
        node.dataset.helper = String(Boolean(session.parentId)); node.dataset.hasFamily = 'true'; node.dataset.selected = 'true';
        node.style.cssText = 'visibility:hidden;pointer-events:none;transform:translate3d(0,0,0)';
        const button = element('button', 'actor-button'), body = element('span', 'character-body'), plate = element('span', 'nameplate');
        const subline = element('span', 'actor-subline'), state = element('span', 'actor-state');
        const providerNode = element('span', 'actor-provider', provider); providerNode.dataset.provider = String(session.provider).toLowerCase();
        subline.append(providerNode, state);
        plate.append(element('span','actor-title',name), element('span','actor-relation',relation), subline,
          element('span','actor-keepsake',keepsakeIcon(session)), element('span','family-badge','88'));
        button.append(body, plate); node.append(button); actorsLayer.append(node);
        const origin = node.getBoundingClientRect();
        footprint = { left: 0, right: 0, top: 0, bottom: 0 };
        for (const label of labels) {
          state.textContent = label;
          for (const part of [body, plate, ...plate.children, ...subline.children]) {
            const rect = part.getBoundingClientRect();
            footprint.left = Math.max(footprint.left, (origin.left - rect.left) / frameScale);
            footprint.right = Math.max(footprint.right, (rect.right - origin.left) / frameScale);
            footprint.top = Math.max(footprint.top, (origin.top - rect.top) / frameScale);
            footprint.bottom = Math.max(footprint.bottom, (rect.bottom - origin.top) / frameScale);
          }
        }
        node.remove();
        // Covers the walking body's 3px/1deg bob, focus/shadow edges and
        // the one-pixel family hand outline, throughout each reserved walk.
        footprint = Object.fromEntries(Object.entries(footprint).map(([key,value]) => [key, Math.ceil(value) + 6]));
        if (footprintCache.size >= 2048) footprintCache.clear();
        footprintCache.set(key, footprint);
      }
      const previous = actorFootprints.get(session.id);
      if (previous && actors.has(session.id) && ['left','right','top','bottom'].some(key => footprint[key] > previous[key] + .5)) grew = true;
      actorFootprints.set(session.id, footprint);
    }
    if (grew) {
      protectEnteringActors();
      cancelPhysicalRoutes(); reflowPending = true;
    }
  }
  function transitCaption(actor, yielding = false) {
    // Traffic describes the body, not the observed session. A coding agent
    // keeps coding while its route is queued or it temporarily makes room.
    actor.node.dataset.trafficHint = yielding ? 'yielding' : 'queued';
    if (!actor.departing && !cloneBusy(actor) && !actor.holdingFamily) {
      if (!actor.motion) finishAtStation(actor);
      else text(actor.state, Director.plan(actor.session, { now: Date.now(), language }).label || actor.spec.label);
    }
  }
  function clearTrafficBlock() {
    clearTimeout(blockedTrafficTimer); blockedTrafficTimer = 0; blockedTraffic = null;
  }
  function protectEnteringActors() {
    for (const actor of actors.values()) if (!actor.helper && actor.entranceActive && !actor.entryPending && !actor.departing) protectedEntrances.set(actor.id, currentPosition(actor));
  }
  function reflowBlockedTraffic() {
    clearTrafficBlock();
    protectEnteringActors();
    for (const actor of [...actors.values()]) {
      const reason = actor.returnReason;
      const parent = actor.helper && actor.departing ? cloneAncestor(actor) : null;
      const retiring = actor.departing || actor.retireRequested;
      cancelAction(actor);
      if (retiring) {
        if (actor.helper) finishCloneReturn(actor, parent, reason || (Scene.isClosed(actor.session) ? 'ended' : 'resting'));
        else { openDoor(); removeActor(actor.id); }
      }
    }
    traffic.clear();
    reflowPending = true;
    // Re-run the same collision-safe layout and page selection. This changes
    // only visual attendance; real activity, ancestry and counts remain intact.
    render();
  }
  function trackTrafficBlock() {
    const signature = JSON.stringify([...trafficWaiters].map(([id, pending]) => [id, pending.target.x, pending.target.y]).sort());
    const now = performance.now();
    if (!blockedTraffic || blockedTraffic.signature !== signature) blockedTraffic = { signature, since: now };
    if (now - blockedTraffic.since >= 650) { reflowBlockedTraffic(); return; }
    if (!blockedTrafficTimer) blockedTrafficTimer = setTimeout(() => { blockedTrafficTimer = 0; pumpTraffic(); }, 680);
  }
  function visibleActors() { return [...actors.values()].filter(actor => !actor.entryPending); }
  function syncTraffic() {
    traffic.sync([...actors.values()].filter(actor => !actor.entryPending || actor.stagedEntry).map(actor => ({ id: actor.id, position: currentPosition(actor), ...actorGeometry(actor), staged: Boolean(actor.stagedEntry),
      canYield: !actor.entryPending && !actor.departing && !cloneBusy(actor) && !actor.holdingFamily && !actor.completing && !actor.spec.stale })));
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
    if (!traffic.state().active && !traffic.state().queued && ![...actors.values()].some(actor => actor.defer || actor.queuedSeat)) {
      for (const actor of actors.values()) if (actor.entryPending) {
        const parent = actor.helper ? cloneAncestor(actor) : null;
        const instantEntry = reduced() || document.hidden;
        if (!actor.helper && !actor.restoreEntry && !instantEntry) {
          if (!entranceLane) continue;
          // Request the future doorway walk while still outside. The planner
          // may first move a worker out of the way; no invisible physical body
          // is allowed to trap that worker at the portal.
          settle(actor, actor.target, true).catch(showError);
          progressed = true;
          break;
        }
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
      if (reservation.reason === 'blocked' || reservation.reason === 'invalid-scene') trackTrafficBlock();
      else clearTrafficBlock();
    } else if (reservation.kind === 'arrived' || reservation.kind === 'move') {
      clearTrafficBlock();
      const id = reservation.id, actor = actors.get(id), pending = trafficWaiters.get(id);
      if (!actor || actor.entryPending && !actor.stagedEntry) { traffic.cancel(id); return; }
      if (actor.stagedEntry) {
        if (!pending || pending.serial !== actor.serial) { traffic.cancel(id); return; }
        actor.stagedEntry = false; actor.entryPending = false;
        actor.node.style.visibility = '';
        actor.entranceActive = true; observedIds.add(actor.id); openDoor();
        progressed = true;
      }
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
    } else clearTrafficBlock();
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
      for (const actor of actors.values()) if (!actor.helper && actor.retireRequested && !actor.departing) {
        const current = snapshot.sessions.find(session => session.id === actor.id);
        if (current && attendance.present.some(session => session.id === actor.id) && hasBodyActivity(current)) {
          actor.session = current; actor.spec = Scene.activitySpec(current);
          resumeActiveActor(actor); updateActorLabel(actor); finishAtStation(actor);
        } else depart(actor, actor.retireRequested.inactive).catch(showError);
      }
    });
  }
  function resumeActiveActor(actor) {
    if (!hasBodyActivity(actor.session) || !actor.departing && !actor.holdingFamily && !actor.retireRequested) return;
    cancelAction(actor);
    actor.departing = false; actor.holdingFamily = false; actor.retireRequested = null;
    actor.node.dataset.cloneHold = 'false';
  }
  function cancelPhysicalRoutes() {
    // Fitting and font measurement do not own a seated clone's finite return.
    // Keep its delay, current pose and effects alive until it finishes or its
    // actual session resumes. Only obsolete physical routes need cancelling.
    for (const actor of actors.values()) if (!actor.departing && !actor.holdingFamily
      && (actor.motion || actor.entryPending || actor.stagedEntry || trafficWaiters.has(actor.id))) cancelAction(actor);
    traffic.clear();
  }
  function cancelAction(actor) {
    actor.serial += 1;
    actor.stagedEntry = false;
    actor.yielding = false;
    delete actor.node.dataset.trafficHint;
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
    if (!pendingArrivals.has(actor.id)) actor.node.style.opacity = '1';
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
          actor.node.style.zIndex = '10';
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
      actor.node.style.zIndex = '10';
      actor.arrivedAt = performance.now();
      actor.node.dataset.traffic = 'arrived';
      return true;
    }
    actor.node.dataset.walking = 'true';
    actor.carry.dataset.carry = String(carrying);
    text(actor.carry, '≡');
    setPose(actor, carrying ? 'clawd-working-carrying.svg' : 'clawd-static-base.svg');
    if (yielding) transitCaption(actor, true);
    else text(actor.state, actor.clonePhase === 'returning' ? completedCloneReturn(actor.returnReason) ? '结束分身' : '分身暂歇'
      : Director.plan(actor.session, { now: Date.now(), language }).label || actor.spec.label);
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
    actor.node.style.zIndex = '10';
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
    if (cloneBusy(actor) || actor.departing || actor.motion) return;
    if (actor.holdingFamily) { setPose(actor, 'clawd-static-base.svg'); text(actor.state, '等分身归位'); return; }
    actor.spec = Scene.activitySpec(actor.session);
    actor.node.dataset.walking = 'false';
    const plan = Director.plan(actor.session, { now: Date.now(), language });
    // A brief observed edit uses the same articulated body and continuous
    // per-activity clocks. Result captions never replace it with a fresh SVG.
    actor.visualWorkActivity = plan.recentWork ? plan.phase.slice('recent-work/'.length) : '';
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
    if (actor.spec.stale && !actor.entryPending) { finishAtStation(actor); return; }
    if (actor.entryPending && !actor.helper && !actor.restoreEntry && !reduced() && !document.hidden) {
      actor.stagedEntry = true;
      actor.position = { x: ENTRY_POINT.x, y: ENTRY_POINT.y };
      actor.node.style.transform = actorTransform(actor.position, false);
    }
    // Short bursts of tools in one area should not make a character pace constantly.
    const dwelling = performance.now() - actor.arrivedAt;
    if (!urgent && dwelling < 1700 && Scene.distance(actor.position, seat) > 1 && !actor.justEntered) {
      if (!await delay(actor, 1700 - dwelling, serial)) return;
    }
    actor.justEntered = false;
    if (!await move(actor, seat, serial, ['reading', 'searching'].includes(actor.session.activity))) return;
    actor.entranceActive = false;
    protectedEntrances.delete(actor.id);
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
    protectedEntrances.delete(actor.id);
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
    actor.node.style.zIndex = '10';
    if (quietSprites()) {
      actor.position = { x: seat.x, y: seat.y };
      actor.node.style.transform = actorTransform(actor.position, true);
      actor.node.style.zIndex = '10';
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
  // Bodies occupy their safe seats immediately. Finite echoes explain the
  // doorway/clone journey without putting a real observer in an invisible queue.
  function flatJourney(actor, from, to, kind) {
    if (quietSprites() || $('effects').querySelectorAll('.flat-journey').length >= 8) return;
    const echo = element('span', 'flat-journey');
    echo.dataset.kind = kind; echo.dataset.ownerId = actor.id;
    echo.style.setProperty('--family-color', paletteRegistry.forRoot(cloneLedger.rootFor(actor.id) || actor.id).color);
    const image = element('img'); image.alt = ''; image.src = assetURL('clawd-static-base.svg'); echo.append(image);
    $('effects').append(echo);
    const frames = Array.from({ length: 61 }, (_, i) => {
      const t = i / 60, progress = t * t * (3 - 2 * t);
      const x = (from.x + (to.x - from.x) * progress) * 12.8;
      const y = (from.y + (to.y - from.y) * progress) * 7.2 - Math.sin(t * Math.PI) * 28;
      return { offset: t, transform: 'translate(' + x + 'px,' + y + 'px) scale(' + uniformScale + ') rotate(' + (Math.sin(t * Math.PI * 6) * 4) + 'deg)', opacity: Math.sin(t * Math.PI) * .6 };
    });
    const motion = echo.animate(frames, { duration: 1100, easing: 'linear' });
    const effect = { cancel() { motion.cancel(); echo.remove(); } };
    actor.cloneEffects.add(effect);
    motion.finished.catch(() => {}).finally(() => { actor.cloneEffects.delete(effect); echo.remove(); });
  }
  async function returnClone(actor, reason) {
    if (actor.departing) return;
    const serial = cancelAction(actor);
    actor.departing = true; actor.returnReason = reason;
    clonePhase(actor, 'returning');
    const parent = cloneAncestor(actor);
    actor.node.dataset.cloneTarget = parent ? parent.id : '';
    actor.node.dataset.cloneReason = reason;
    text(actor.state, completedCloneReturn(reason) ? '结束分身' : '分身暂歇');
    setPose(actor, 'clawd-static-base.svg');
    flatJourney(actor, currentPosition(actor), parent ? currentPosition(parent) : currentPosition(actor), 'return');
    if (!quietSprites() && !await delay(actor, 1100, serial)) return;
    if (actor.serial !== serial || destroyed) return;
    cloneEffect(actor, parent || actor, 'absorb');
    finishCloneReturn(actor, parent, reason);
  }
  async function depart(actor, inactive = false) {
    if (actor.departing) return;
    if (actor.helper) {
      const completed = inactive && completedCloneTurn(actor.session, actor.lastTurnAt);
      if (completed) actor.lastTurnAt = Scene.timestamp(actor.session.turnCompletedAt);
      return returnClone(actor, inactive ? completed ? 'completed' : 'resting' : 'ended');
    }
    actor.retireRequested = { inactive };
    for (const child of relatedClones(actor)) if (!child.departing) {
      const current = snapshot.sessions.find(session => session.id === child.id);
      if (current) { child.session = current; child.spec = Scene.activitySpec(current); }
      // Missing work evidence is not evidence that a descendant finished.
      // Keep uncertain current bodies and their ancestor anchor in place.
      const idle = current && !current.disconnected && current.status === 'idle'
        && (!current.activity || current.activity === 'idle') && !current.attention && !(Number(current.activeTools) > 0);
      if (!current || Scene.isClosed(current) || idle) depart(child, !current || !Scene.isClosed(current)).catch(showError);
    }
    if (relatedClones(actor).length) { holdForClones(actor); return; }
    actor.holdingFamily = false; actor.node.dataset.cloneHold = 'false';
    const serial = cancelAction(actor); actor.departing = true;
    text(actor.state, inactive ? '这一轮已歇下' : '会话已结束');
    flatJourney(actor, currentPosition(actor), ENTRY_POINT, 'leave'); openDoor();
    if (!quietSprites() && !await delay(actor, 1100, serial)) return;
    if (actor.serial === serial) removeActor(actor.id);
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
    const restored = observedIds.has(session.id) && (reflowPending || !attendance.entering.includes(session.id))
      || snapshotReceived === 1 && !session.parentId;
    const helper = Boolean(session.parentId);
    const actor = { id: session.id, session, spec: Scene.activitySpec(session), node, button, body, image, title, relation, provider, state, bubble, carry, arrival, position: { x: seat.x, y: seat.y }, target: seat, helper, serial: 0, delays: new Set(), cloneEffects: new Set(), clonePhase: helper ? 'working' : '', motion: null, lastTurnAt: Scene.timestamp(session.turnCompletedAt), arrivedAt: -10000, lastZone: restored ? seat.zone : '', currentAsset: '', wantedAsset: '', bubbleTimer: 0, defer: 0, justEntered: !restored, completing: false, departing: false, holdingFamily: false, retireRequested: null, entryPending: false, restoreEntry: restored };
    node.style.visibility = 'visible';
    node.dataset.clonePhase = actor.clonePhase;
    actor.performance = window.OfficeAvatarPerformance.create({ actorNode: node, body, image, session, clockRegistry: performanceClocks });
    actor.appearance = window.OfficeFamilyAppearance.create({ actorNode: node, body, image });
    node.style.transform = actorTransform(actor.position, actor.helper);
    node.style.zIndex = '10';
    image.addEventListener('error', () => {
      if (destroyed || actors.get(actor.id) !== actor) return;
      if (actor.currentAsset !== 'clawd-static-base.svg') { actor.currentAsset = 'clawd-static-base.svg'; image.dataset.asset = 'clawd-static-base.svg'; image.src = assetURL('clawd-static-base.svg'); }
      else { image.hidden = true; showError(language === 'en' ? 'Character artwork is temporarily unavailable. A backup body is shown while observation continues.' : '角色素材暂未加载，已显示备用身体；后续更新会重试，任务仍在观察。'); }
    });
    image.addEventListener('load', () => {
      if (destroyed || actors.get(actor.id) !== actor) return;
      // A failed fallback hides only the failed bitmap. A later valid pose
      // must restore it, including walking and reduced-motion appearances.
      if (image.naturalWidth > 0) {
        const recovering = image.hidden;
        image.hidden = false;
        // The articulated body has its own external image reference. Retry
        // that reference too, rather than revealing an empty animated rig.
        if (recovering) body.querySelector('.ap-rig defs image')?.setAttribute('href', assetURL(window.OfficeAvatarPerformanceModel.ASSET, true));
      }
    });
    button.addEventListener('click', () => selectSession(actor.id));
    button.addEventListener('dblclick', () => react(actor));
    button.addEventListener('keydown', (event) => { if (event.key === ' ' && event.shiftKey) { event.preventDefault(); react(actor); } });
    updateActorLabel(actor);
    actor.fallback = window.OfficeAvatarFallback?.create({ actorNode: node, body, image });
    actors.set(session.id, actor);
    observedIds.add(actor.id);
    if (!restored && !quietSprites()) {
      // A new body waits only for its actual visible envelope to be clear.
      // This shared RAF is independent of traffic and all AI state.
      node.style.opacity = '0'; pendingArrivals.add(actor.id); queueAdmission();
    }
    setPose(actor, actor.spec.asset);
    finishAtStation(actor);
    if (!restored) {
      const parent = actor.helper ? cloneAncestor(actor) : null;
      node.dataset.cloneOrigin = parent ? parent.id : '';
      flatJourney(actor, parent ? currentPosition(parent) : actor.helper ? seat : ENTRY_POINT, seat, actor.helper ? 'split' : 'enter');
      if (!actor.helper) openDoor();
      else cloneEffect(actor, parent || actor, 'split');
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
    if (!quietSprites()) {
      const arm = actor.body.querySelector('.ap-arm-right');
      if (arm) {
        const wave = arm.animate([{ transform: 'translate(0px,0px) rotate(0deg)' },
          { transform: 'translate(0px,-5px) rotate(-12deg)', offset: .25 },
          { transform: 'translate(0px,-4px) rotate(6deg)', offset: .5 },
          { transform: 'translate(0px,-5px) rotate(-10deg)', offset: .75 },
          { transform: 'translate(0px,0px) rotate(0deg)' }],
        { duration: 1000, composite: 'add', easing: 'cubic-bezier(.77,0,.175,1)' });
        const effect = { cancel: () => wave.cancel() }; actor.cloneEffects.add(effect);
        wave.finished.catch(() => {}).finally(() => { actor.cloneEffects.delete(effect); wave.cancel(); });
      }
    }
    say(actor, language === 'en' ? p.greetingEn : p.greetingZh, 3000);
    if (!await delay(actor, 3000, serial)) return;
    actor.node.dataset.reaction = 'false';
    finishAtStation(actor);
  }
  function removeActor(id) {
    const actor = actors.get(id);
    if (!actor) return;
    cancelAction(actor);
    clearTimeout(actor.bubbleTimer);
    pendingArrivals.delete(actor.id);
    actor.fallback?.destroy();
    if (actor.performance) { actor.performance.update(actor.session, { now: Date.now(), hidden: true }); actor.performance.destroy(); }
    if (actor.appearance) actor.appearance.destroy();
    actor.node.remove();
    actors.delete(id);
    protectedEntrances.delete(id);
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
  function queueAdmission() {
    if (admissionFrame || destroyed || !pendingArrivals.size) return;
    admissionFrame = requestAnimationFrame(admitBodies);
  }
  function admitBodies() {
    admissionFrame = 0;
    if (destroyed) return;
    const cast = [...actors.values()].map(actor => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(actor.node).transform);
      const scale = Math.hypot(matrix.m11, matrix.m12);
      return { actor, bounds: Scene.actorBounds({ x: matrix.m41 / 12.8, y: matrix.m42 / 7.2 },
        { uniformScale: scale, footprint: actorFootprints.get(actor.id) }), scale };
    });
    // A newcomer uses the destination scale. Keep its finite arrival at that
    // same scale as everyone else; do not expose a smaller body halfway through
    // an older body's fit transition merely because the envelopes already clear.
    // Chromium serializes matrix() with limited significant digits: a scale
    // above 1 can round by 0.000005. Exact string equality would strand a new
    // body forever even after its transition has completely finished.
    const sameScale = cast.every(item => Math.abs(item.scale - uniformScale) <= .00001);
    for (const id of [...pendingArrivals]) {
      const item = cast.find(item => item.actor.id === id);
      if (!item) { pendingArrivals.delete(id); continue; }
      if (sameScale && cast.every(other => other === item || !Scene.boundsOverlap(item.bounds, other.bounds, 0))) {
        item.actor.node.style.opacity = '1'; pendingArrivals.delete(id);
      }
    }
    queueAdmission();
  }
  function hasBodyActivity(session) {
    // Unknown activity is a valid live body, even without a classified tool.
    // Do not use the narrower work-statistics predicate as a visibility gate.
    return !Scene.isClosed(session) && !session.disconnected && session.status !== 'stale'
      && (Clones.isActive(session) || ['active', 'waiting'].includes(session.status) && session.activity !== 'idle');
  }
  function reconcileActors() {
    const sessionMap = new Map(snapshot.sessions.map(session => [session.id, session]));
    const visibleIds = new Set(currentPage.visible.map(session => session.id));
    const nextSeats = currentPage.seats;
    const layoutChanged = reflowPending || Math.abs(uniformScale - currentPage.uniformScale) > .000001
      || [...nextSeats].some(([id, seat]) => !seats.has(id) || Scene.distance(seats.get(id), seat) > .01);
    // Stable anchors never jump on a heartbeat, new arrival or work-zone
    // change. CSS retargets the shared scale from its current rendered value.
    uniformScale = currentPage.uniformScale;
    for (const actor of actors.values()) {
      const seat = nextSeats.get(actor.id);
      if (seat) {
        actor.position = { x: seat.x, y: seat.y }; actor.target = seat;
        actor.node.style.transform = actorTransform(seat, actor.helper);
      }
    }
    for (const actor of [...actors.values()]) if (!visibleIds.has(actor.id)) {
      const next = sessionMap.get(actor.id);
      actor.session = next || actor.session; actor.spec = Scene.activitySpec(actor.session);
      depart(actor, !Scene.isClosed(actor.session)).catch(showError);
    }
    for (const session of currentPage.visible.slice().sort((a,b) => cloneLedger.parentChain(a.id).length - cloneLedger.parentChain(b.id).length)) {
      if (restedClones.has(session.id) && !hasBodyActivity(session)) continue;
      const seat = nextSeats.get(session.id);
      if (!seat) throw new Error('全员布局缺少角色席位：' + session.id);
      let actor = actors.get(session.id);
      if (!actor) { makeActor(session, seat); continue; }
      const old = actor.session, previousTurn = actor.lastTurnAt;
      actor.session = session; actor.spec = Scene.activitySpec(session); actor.helper = Boolean(session.parentId);
      resumeActiveActor(actor);
      if (layoutChanged) {
        actor.position = { x: seat.x, y: seat.y }; actor.target = seat;
        actor.entryPending = false; actor.stagedEntry = false; actor.entranceActive = false;
        actor.node.style.visibility = 'visible'; if (!pendingArrivals.has(actor.id)) actor.node.style.opacity = '1';
        actor.node.style.transform = actorTransform(seat, actor.helper); actor.node.style.zIndex = '10';
      }
      updateActorLabel(actor);
      const completedAt = Scene.timestamp(session.turnCompletedAt);
      if (actor.helper && completedCloneTurn(session, previousTurn)) {
        actor.lastTurnAt = completedAt; returnClone(actor, 'completed').catch(showError);
      } else {
        actor.lastTurnAt = Math.max(previousTurn, completedAt);
        if (!actor.helper && completedAt > previousTurn && session.activity === 'idle' && !actor.spec.stale) {
          const key = Scene.projectKey(session);
          archivedTurns.set(key, Math.min(3, (archivedTurns.get(key) || 0) + 1));
          addEffect('reply', actor.position);
        }
        if (old.activity !== session.activity) social?.update();
        if (!actor.departing && actor.node.dataset.reaction !== 'true') finishAtStation(actor);
      }
    }
    seats = nextSeats; reflowPending = false;
    office.dataset.layout = currentPage.layoutMode;
    office.dataset.flat = 'true';
    office.dataset.fitScale = uniformScale.toFixed(4);
    queueAdmission();
    renderHelperLinks(); updateProps();
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
    selectedSession = id;
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
    const makingRoom = actor && (actor.yielding || actor.node?.dataset.traffic === 'queued');
    text($('inspect-location'), attendance.retired.includes(session.id) || restedClones.has(session.id) ? session.parentId ? '分身暂歇' : '门外休息'
      : makingRoom ? (language === 'en' ? 'Temporarily making room · ' : '临时让路 · ') + zoneName((actor.target || spec).zone)
        : actor && actor.motion ? (language === 'en' ? 'Heading to ' : '前往') + zoneName((actor.target || spec).zone) : zoneName(actor?.target?.zone || spec.zone));
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
      button.disabled = mutationPending || Boolean(snapshot.setup?.running);
      button.addEventListener('click', () => connect(provider, Boolean(connection.installed)));
      if (provider === 'hermes' && connection.installed) {
        const actions = element('span','provider-actions');
        const reload = element('button','button button-paper','重新加载');
        reload.type = 'button';
        reload.disabled = mutationPending || Boolean(snapshot.setup?.running);
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
      row.style.marginLeft = '0px';
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
    for (const session of snapshot.sessions) if (hasBodyActivity(session)) restedClones.delete(session.id);
    attendance = attendanceModel.update(snapshot.sessions);
    familyGraph = Family.build(snapshot.sessions);
    const openFamilies = snapshot.sessions.filter(session => !Scene.isClosed(session))
      .map(session => cloneLedger.rootFor(session.id) || familyGraph.info.get(session.id)?.rootId || session.id);
    paletteRegistry.update(openFamilies);
    familyGraph = Family.build(snapshot.sessions, { registry: paletteRegistry });
    measureActorFootprints(attendance.present);
    // Project names remain in the inspector and roster; every project shares
    // this one floor. Saved filters from older builds cannot hide live bodies.
    rooms = Scene.roomsFor(snapshot.sessions);
    selectedProject = Scene.ALL_ROOMS; roomSelectionExplicit = false;
    $('project-select').replaceChildren(element('option', 'project-option', language === 'en' ? 'All agents · one floor' : '全体 Agent · 同一层'));
    $('project-select').firstElementChild.value = Scene.ALL_ROOMS;
    $('project-select').value = Scene.ALL_ROOMS;
    $('room-switcher').hidden = true;
    const presentBodies = attendance.present.filter(session => !restedClones.has(session.id) || hasBodyActivity(session));
    const bodyIds = new Set(presentBodies.map(session => session.id));
    const retiringBodies = [...actors.values()].filter(actor => !bodyIds.has(actor.id) && !restedClones.has(actor.id)).map(actor => snapshot.sessions.find(session => session.id === actor.id) || actor.session);
    currentPage = { ...Scene.layoutStableAll(presentBodies.concat(retiringBodies), sceneOptions()), visible: presentBodies }; page = 0;
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
    if (uniformScale < settings.agentScale - .001) summary += language === 'en' ? ' · fitted to ' + Math.round(uniformScale * 100) + '% for everyone' : ' · 全员适配 ' + Math.round(uniformScale * 100) + '%';
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
    venueStage?.update(sceneContext()); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); social?.update();
  }
  function receive(next) {
    if (!next || !Array.isArray(next.sessions)) return;
    snapshotReceived += 1;
    snapshot = { ...next, mode: 'live', sessions: next.sessions.filter((session) => session && typeof session.id === 'string'), connections: Array.isArray(next.connections) ? next.connections : [] };
    usageHistory?.updateStatus(snapshot.usageLog);
    setupAssistant?.update(snapshot.setup);
    render();
  }
  async function refreshSnapshot() { const next = await call('getSnapshot'); if (next) receive(next); }
  function switchRoom() {
    selectedProject = Scene.ALL_ROOMS; page = 0; render();
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
      protectEnteringActors();
      cancelPhysicalRoutes();
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
    if (window.OfficeFestivals) $('setting-rain').checked = window.OfficeFestivals.resolve({ theme: settings.sceneTheme, weather: settings.sceneWeather }).weather === 'rain';
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
    const request = ++settingsRequest;
    const previous = settings;
    applySettings({ ...settings, ...patch });
    try {
      const saved = await call('setSettings', patch);
      if (destroyed || request !== settingsRequest) return;
      if (saved && typeof saved === 'object') applySettings(saved);
      text($('settings-result'), '已保存到这台 Mac。');
    } catch (error) {
      if (destroyed || request !== settingsRequest) return;
      applySettings(previous); showError(error);
    }
  }
  async function connect(provider, remove = false) {
    if (mutationPending || snapshot.setup?.running) return;
    mutationPending = true;
    setupAssistant?.setProviderBusy(true);
    renderConnections();
    text($('connection-result'), (remove ? '正在移除 ' : '正在连接 ') + Scene.providerName(provider) + (remove ? ' 观察配置…' : '…'));
    try {
      const result = await call(remove ? 'disconnectProvider' : 'connectProvider', provider);
      const message = remove ? (provider === 'codex' ? '已移除观察配置；本地只读观察仍可继续' : (result && result.message) || '已移除本应用的观察配置。') : result && (result.message || result.detail) || (provider === 'codex' ? '配置已就绪，请在 Codex 中审核 hooks 信任，再开始新任务。' : '观察配置已就绪，请在原工具开始一个任务。');
      text($('connection-result'), message);
      await refreshSnapshot();
    } catch (error) { text($('connection-result'), error.message); showError(error); }
    finally { mutationPending = false; setupAssistant?.setProviderBusy(false); renderConnections(); }
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
  for (const key of ['rain', 'reducedMotion', 'lowPower', 'idleVisitor']) $('setting-' + key).addEventListener('change', (event) => saveSettings(key === 'rain' ? { rain: event.target.checked, sceneWeather: event.target.checked ? 'rain' : 'off' } : { [key]: event.target.checked }));
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
    venueStage?.update(sceneContext()); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); social?.update();
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
  const settingsAtStart = settingsRequest;
  Promise.all([call('getSettings'), call('getSnapshot')]).then(([savedSettings, initial]) => {
    // Settings can arrive after the first live push. Apply the saved deliberate
    // room choice once, without mistaking future automatic choices for intent.
    selectedProject = Scene.ALL_ROOMS;
    if (settingsRequest === settingsAtStart) applySettings(savedSettings || settingsDefaults);
    if (snapshotReceived === receivedAtStart) receive(initial);
    else render();
  }).catch((error) => { showError(error); applySettings(settings); render(); });
  const clockTimer = setInterval(() => {
    if (document.hidden) return;
    scenery.update(settings, language);
    festivalStage?.update(sceneContext()); venueStage?.update(sceneContext()); themeEnvironment?.update(sceneContext());
    renderInspector();
    const roomSessions = snapshot.sessions.filter((session) => Scene.inRoom(session, selectedProject) && !Scene.isClosed(session));
    const recent = roomSessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    text($('signal-summary'), recent ? timeAgo(recent) : '');
  }, 12000);
  const secondsTimer = setInterval(() => { if (!document.hidden) { scenery.updateClock(settings, language); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); venueStage?.refreshArtwork(); social?.tick(); } }, 1000);
  window.addEventListener('beforeunload', () => {
    destroyed = true;
    usageHistory?.dispose();
    setupAssistant?.dispose();
    visitor.destroy();
    social?.destroy(); venueStage?.destroy(); festivalStage?.destroy(); themeEnvironment?.destroy();
    scenery.destroy();
    clearInterval(clockTimer);
    clearInterval(secondsTimer);
    cancelAnimationFrame(frameTimer);
    cancelAnimationFrame(admissionFrame); pendingArrivals.clear();
    clearTimeout(trafficTimer);
    clearTrafficBlock();
    clearTimeout(doorTimer);
    clearActors();
    performanceClocks.clear();
    observer.disconnect();
    if (typeof unsubscribe === 'function') unsubscribe();
  });
})();
