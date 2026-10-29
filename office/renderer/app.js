/* The room only presents observations. It never approves or executes agent work. */
(function () {
  'use strict';
  const BaseScene = window.OfficeScene;
  let Scene = BaseScene;
  const Attendance = window.OfficeAttendance;
  const Director = window.OfficeAnimationDirector;
  const performanceClocks = window.OfficeAvatarPerformanceModel.createClockRegistry({ limit: 2048 });
  const Family = window.OfficeFamily;
  const Clones = window.OfficeClones;
  const Traffic = window.OfficeSceneTraffic;
  const BaseWalkingLayout = window.OfficeWalkingLayout;
  let WalkingLayout = BaseWalkingLayout;
  let activeRoom = null;
  const WalkTiming = window.OfficeWalkTiming;
  const I18n = window.OfficeI18n;
  const bridge = window.office;
  const $ = (id) => document.getElementById(id);
  const office = $('office');
  const world = $('world');
  const actorsLayer = $('actors');
  const actors = new Map();
  const presentationReentries = new Map();
  const NAMEPLATE_METRICS_VERSION = 4;
  const archivedTurns = new Map();
  // Older observation bridges without roomDesign retain their legacy room.
  // Current native settings explicitly supply daily rotation by default.
  const settingsDefaults = { rain: false, night: false, sceneTime: 'auto', sceneVenue: 'workshop', sceneTheme: 'auto', sceneWeather: 'auto', roomDesign: 'legacy', agentAppearance: 'mixed', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: true, sound: false, selectedProject: '', language: 'zh' };
  let settings = { ...settingsDefaults };
  let deferredPhysicalScale = null;
  const sizeStability = window.OfficeSizeStability.create({ requestedScale: settings.agentScale });
  let settingsRequest = 0;
  let language = 'zh';
  const usageHistory = window.OfficeUsageHistory?.create({ bridge, getLanguage: () => language });
  const manualQuestions = window.OfficeManualQuestions?.create({ bridge, language });
  const setupAssistant = window.OfficeSetupAssistant?.create({ bridge, getLanguage: () => language });
  const appearancePicker = window.OfficeAppearancePicker?.create({ container: $('settings-dialog') });
  const scenery = window.OfficeDayScenery.create({ office, world, layer: $('window-scenery') });
  const attendanceModel = Attendance.createAttendance();
  const cloneLedger = Clones.createLedger();
  const restedClones = new Set();
  const paletteRegistry = Family.createPaletteRegistry();
  const companionRegistry = window.OfficeAgentAppearance?.createAllocator();
  const CLOCK_RESERVED = Scene.CLOCK_RESERVED;
  let ENTRY_POINT = { x: 87, y: 78, zone: 'exit' };
  const makeTraffic = () => Traffic.createCoordinator({ reservedRects: CLOCK_RESERVED, obstacles: WalkingLayout.OBSTACLES, gap: scale => currentPage.gap ?? WalkingLayout.gapForScale(scale), limit: 256, maxConcurrent: 8, passThrough: true, yieldBatchSize: 1,
    route: (from, to, actor) => walkingRoute(from, to, actor),
    holdingPoints: () => currentPage.holdingPoints,
    legalPoint: (point, actor) => WalkingLayout.legalPoint(point, { ...actor, reservedRects: CLOCK_RESERVED }) });
  let traffic = makeTraffic();
  const trafficWaiters = new Map();
  let trafficTimer = 0;
  let blockedTrafficTimer = 0;
  let blockedTraffic = null;
  let reflowPending = false;
  let attendance = { present: [], entering: [], leaving: [], retired: [] };
  const staticCopy = [];
  const copyWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = copyWalker.nextNode(); node; node = copyWalker.nextNode()) if (node.nodeValue.trim()) staticCopy.push({ node, original: node.nodeValue });
  const staticAttributes = [...document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')].flatMap(node => ['aria-label','title','alt','placeholder'].filter(name => node.hasAttribute(name)).map(name => ({node,name,original:node.getAttribute(name)})));
  let doorTimer = 0;
  let snapshot = { mode: 'live', now: Date.now(), sessions: [], connections: [] };
  let nativeWindowHidden = false;
  function sceneHidden() { return document.hidden || nativeWindowHidden; }
  let selectedProject = '';
  let roomSelectionExplicit = false;
  let selectedSession = '';
  let inspectorReturnFocus = null;
  let rosterRenderKey = '';
  let page = 0;
  let seats = new Map();
  let uniformScale = 1;
  let admissionFrame = 0;
  let fitting = false;
  let navigationTimer = 0;
  let transferOwner = null;
  let transferContinuation = null;
  let layoutRefreshOwner = null;
  let layoutRefreshRequested = false;
  let clearingActors = false;
  let propsPending = false;
  const actorFootprints = new Map();
  const footprintCache = new Map();
  let rooms = [];
  let currentPage = { page: 0, pages: 1, roots: [], visible: [], hidden: 0, helperOverflow: 0 };
  let frameTimer = 0;
  let spriteNonce = 0;
  let destroyed = false;
  let snapshotReceived = 0;
  let mutationPending = false;
  let previousAttention = new Set();
  const mediaReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const numberFlip = window.OfficeNumberFlip?.create({ getContext: () => ({ reducedMotion: reduced(), lowPower: settings.lowPower, hidden: sceneHidden() }) });
  const homeTokenUsage = window.OfficeHomeTokenUsage?.create({ language, numberFlip });
  const providerIds = window.OfficeProviders.getAllProviders().map(provider => provider.id === 'cursor-agent' ? 'cursor' : provider.id);
  const observedIds = new Set();
  let familyGraph = Family.build([]);
  const visitor = window.OfficeIdleVisitor.create({ layer: $('visitors'), world, openDoor, getScene: () => Scene, getLayout: () => WalkingLayout, context: () => ({ enabled: settings.idleVisitor, ready: snapshotReceived > 0, mode: snapshot.mode, busy: attendance.present.length > 0 || actors.size > 0, hidden: sceneHidden(), reducedMotion: reduced(), lowPower: settings.lowPower, language, roomKey:activeRoom?.id||'legacy' }) });
  const sceneContext = () => ({ venue: settings.roomDesign==='legacy'?settings.sceneVenue:activeRoom?.effectVenue || settings.sceneVenue,
    scene: settings.roomDesign==='legacy'?settings.sceneVenue:activeRoom?.effectVenue || settings.sceneVenue, theme: settings.sceneTheme, weather: settings.sceneWeather,
    roomDesign: settings.roomDesign, room: activeRoom, layout: WalkingLayout,
    language, reducedMotion: reduced(), lowPower: settings.lowPower, hidden: sceneHidden(), fitting, scale: uniformScale, mode: snapshot.mode,
    artworkKey: $('room-art').dataset.artworkKey || '', dayPhase: office.dataset.dayPhase, now: Date.now() });
  const social = window.OfficeAgentSocial?.create({ layer: $('social-effects'), world, getActors: () => actors, getContext: sceneContext });
  const stationArrival = window.OfficeStationArrival?.create({ layer: $('station-arrivals'), world, getActors: () => actors, getContext: sceneContext });
  const onStationArrival = event => stationArrival?.arrive(event.detail);
  office.addEventListener('office:actor-arrival', onStationArrival);
  const themeEnvironment = window.OfficeThemeEnvironment?.create({ office, world, getState: sceneContext });
  const venueStage = window.OfficeVenueStage?.create({ office, world, topbar: document.querySelector('.topbar'), getState: sceneContext,
    onSelectVenue: id => saveSettings({ sceneVenue: id, roomDesign: 'legacy' }), onSelectRoom: id => saveSettings({ roomDesign: id }),
    onCommitArtwork: commitRoomArtwork, onInteraction: payload => social?.trigger(payload) });
  const festivalStage = window.OfficeFestivalStage?.create({ office, world, topbar: document.querySelector('.topbar'), getState: sceneContext,
    onSelectTheme: (id,meta) => { venueStage?.update({ ...sceneContext(), theme: id, instant: meta?.source === 'keyboard' }); return saveSettings({ sceneTheme: id }); }, onSelectWeather: id => saveSettings({ sceneWeather: id }), onInteraction: payload => { themeEnvironment?.trigger(payload); social?.trigger(payload); } });

  office.dataset.festivals = String(Boolean(festivalStage));

  function updateRoomSigns() {
    for (const label of world.querySelectorAll('[data-zone-label]')) {
      const zone=label.dataset.zoneLabel, furniture=activeRoom?.furniture[zone];
      if (furniture) {
        label.style.left=(furniture.x1+furniture.x2)/2+'%';label.style.top=furniture.y2+1+'%';label.style.transform='translateX(-50%)';
        label.textContent=window.OfficeRoomDesigns.zoneLabel(activeRoom.id,zone,language);
      } else {
        label.style.removeProperty('left');label.style.removeProperty('top');label.style.removeProperty('transform');
        label.textContent=tr(BaseScene.ZONES[zone]?.name||'');
      }
    }
  }
  function commitRoomArtwork(art) {
    const room=art.layout||null;
    if ((room?.id||'legacy')===(activeRoom?.id||'legacy')) return true;
    // Finish finite physical journeys before replacing their floor. Room
    // relocation changes scenery geometry, never observed work or identity.
    if (hasFiniteClone() || cloneAwaitingReturn() || [...actors.values()].some(a=>a.motion||a.entryPending||a.departing)) return false;
    const nextScene=room?window.OfficeRoomDesigns.createScene(BaseScene,room):BaseScene;
    const nextLayout=room?BaseWalkingLayout.forScene(nextScene):BaseWalkingLayout;
    const cast=[...actors.values()].map(a=>a.session);
    let fitted;
    try { fitted=nextLayout.layoutFullSizeWalking(cast,{passThrough:true,requestedScale:settings.agentScale,footprints:actorFootprints,reservedRects:CLOCK_RESERVED}); }
    catch (error) {
      // Scenery may wait for a physical slot; it never resizes or removes a
      // resident just to commit a different floor beneath existing work.
      if (error.code === 'FIXED_SIZE_CAPACITY') return false;
      throw error;
    }
    cancelPhysicalRoutes();
    Scene=nextScene;WalkingLayout=nextLayout;activeRoom=room;traffic=makeTraffic();
    currentPage=fitted;seats=fitted.seats;uniformScale=fitted.uniformScale;fitting=false;
    ENTRY_POINT={...fitted.entryPoint,zone:'exit'};
    office.dataset.roomChanging='true';
    if(room)office.dataset.roomDesign=room.id;else delete office.dataset.roomDesign;
    for(const actor of actors.values()){
      const point=fitted.seats.get(actor.id);if(!point)throw new Error('Room geometry omitted an observed identity');
      // Keep the original body, rig, name and work clocks. This scenery
      // relocation is never dispatched as a work arrival or task event.
      actor.position={...point};actor.target=point;actor.navigation=null;actor.resumeNavigation=null;
      actor.node.style.transform=actorTransform(point,actor.helper);actor.node.style.zIndex=String(Math.round(point.y*10));
      actor.node.dataset.walking='false';actor.node.dataset.traffic='arrived';
    }
    updateRoomSigns();visitor.tick();render();
    requestAnimationFrame(()=>{if(!destroyed)delete office.dataset.roomChanging;});
    return true;
  }

  function tr(value) { return I18n.translate(language, String(value == null ? '' : value)); }
  function text(element, value) {
    const literal = element.id === 'inspect-title' || element.id === 'inspect-session-id' || /(?:^|\s)(?:roster-task|project-option)(?:\s|$)/.test(element.className || '');
    const next = literal ? String(value == null ? '' : value) : tr(value);
    if (element.id === 'today-total' && typeof numberFlip !== 'undefined' && numberFlip) numberFlip.update(element, next);
    else element.textContent = next;
  }
  function applyLanguage() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = I18n.t(language, 'app.title');
    for (const item of staticCopy) if (item.node.isConnected) item.node.nodeValue = tr(item.original);
    for (const item of staticAttributes) if (item.node.isConnected) item.node.setAttribute(item.name, tr(item.original));
    updateRoomSigns();
    $('language-button').textContent = language === 'en' ? '中文' : 'EN';
    $('language-button').setAttribute('aria-label', language === 'en' ? 'Switch to Chinese' : '切换到 English');
    usageHistory?.updateLanguage();
    homeTokenUsage?.updateLanguage(language);
    manualQuestions?.updateLanguage(language);
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
  function nameplateMode(count) { return count >= 12 ? 'compact' : 'full'; }
  function createActorPlate(session) {
    // Both the live body and its measurement probe use this exact structure.
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
    return { plate, title, relation, subline, provider, state, keepsake };
  }
  function nameplateRelation(session, parent, mode = 'full') {
    if (parent) return I18n.t(language, 'identity.parent', { name: displayName(parent) });
    if (session.parentId) return tr('子任务 · 父任务未在场');
    return I18n.t(language, mode === 'compact' ? 'family.clonesSummaryCompact' : 'family.clonesSummary', cloneLedger.stats(session.id));
  }
  function nameplateFamilyBadgeText(session) {
    const family = familyGraph.info.get(session.id);
    const rootId = cloneLedger.rootFor(session.id) || (family ? family.rootId : session.id);
    const code = String(paletteRegistry.forRoot(rootId).badge || '').replace(/[^0-9]/g, '').slice(0, 8);
    return (session.parentId ? '↳' : '') + code;
  }
  function showError(error) {
    const message = error && error.message ? error.message : String(error || '操作未完成');
    text($('error-message').querySelector('span'), message);
    $('error-message').hidden = false;
  }
  async function call(method, ...args) {
    if (!bridge || typeof bridge[method] !== 'function') throw new Error('桌面连接尚未就绪，请重新打开 AI Work Space。');
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
  function zoneName(zone) { return zone === 'stage' ? (language === 'en' ? 'All-agent floor' : '全员席位') : (activeRoom&&window.OfficeRoomDesigns.zoneLabel(activeRoom.id,zone,language)) || window.OfficeVenues?.zoneLabel(settings.sceneVenue, zone, language) || tr(Scene.ZONES[zone]?.name || ''); }
  function cloneSummary(session) { return I18n.t(language, 'family.clonesSummary', cloneLedger.stats(session.id)); }
  function archiveCount() { return selectedProject === Scene.ALL_ROOMS ? Math.min(3, [...archivedTurns.values()].reduce((sum, count) => sum + count, 0)) : archivedTurns.get(selectedProject) || 0; }
  function keepsakeIcon(session) { return ({teacup:'♨',paperboat:'⛵',bookmark:'▤',lantern:'✧',leaf:'❧',pebble:'◇',bell:'♧',pencil:'✎',shell:'⌁',star:'✦',acorn:'♧',ribbon:'⋈'})[persona(session).keepsake] || '✦'; }
  function reduced() { return settings.reducedMotion || mediaReduce.matches; }
  function quietSprites() { return reduced() || settings.lowPower || sceneHidden(); }
  function assetURL(name, replay) { return '../assets/avatars/' + (window.OfficePublicArtwork ? window.OfficePublicArtwork.asset(name) : name) + (replay ? '?_t=' + (++spriteNonce) : ''); }
  function setPose(actor, name, replay = false) {
    const performanceSession = actor.visualWorkActivity ? { ...actor.session, activity: actor.visualWorkActivity } : actor.session;
    const performance = actor.performance && actor.performance.update(performanceSession, { now: Date.now(), reducedMotion: reduced(), lowPower: settings.lowPower, hidden: sceneHidden() || actor.entryPending, walking: Boolean(actor.motion) || actor.node.dataset.walking === 'true', reaction: false, departing: actor.departing, stale: actor.spec.stale });
    actor.fallback?.retry();
    actor.performance?.retry?.();
    const wantedAsset = actor.design?.asset || (quietSprites() ? 'clawd-static-base.svg' : performance && performance.active ? performance.asset : name);
    const asset = window.OfficePublicArtwork ? window.OfficePublicArtwork.asset(wantedAsset) : wantedAsset;
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
  function nextEntryCandidate(incoming) {
    const sessions = incoming ? new Map(incoming.map(session => [session.id, session])) : null;
    const candidates = [...actors.values()].filter(actor => actor.entryPending && (!sessions || sessions.has(actor.id)));
    if (incoming) for (const session of incoming.slice().sort((a,b) => cloneLedger.parentChain(a.id).length - cloneLedger.parentChain(b.id).length)) {
      if (!actors.has(session.id)) candidates.push({ id: session.id, session, helper: Boolean(session.parentId), entryPending: true });
    }
    const staged = candidates.find(actor => actor.stagedEntry);
    const ordered = staged ? [staged] : candidates;
    for (const actor of ordered) {
      const session = sessions?.get(actor.id) || actor.session;
      if (Scene.isClosed(session)) continue;
      const parent = actor.helper ? cloneAncestor(actor) : null;
      if (parent?.entryPending || parent?.motion || parent?.navigation || parent?.yielding || parent?.routeReservation || parent?.resumeNavigation) continue;
      // A not-yet-reserved source never pins a parent's queued real journey.
      // Once staged, its finite reservation owns that source until charge ends.
      if (parent?.pendingStation && !actor.stagedEntry) continue;
      return { actor, parent };
    }
    return null;
  }
  function openingDockPairs(incoming) {
    const next = nextEntryCandidate(incoming);
    return new Map(next?.actor.helper && next.parent ? [[next.actor.id, next.parent.id]] : []);
  }
  function openingRouteReady(actor, parent) {
    const proof = currentPage.openingProof, same = (a,b) => a && b && Math.abs(a.x-b.x)<.0005 && Math.abs(a.y-b.y)<.0005;
    return Boolean(proof && proof.childId === actor.id && proof.parentId === parent.id
      && Math.abs(proof.scale-uniformScale)<.00001 && same(proof.source,currentPosition(parent)) && same(proof.target,actor.target));
  }
  function closingDockPairs() {
    const current = new Map(snapshot.sessions.map(session => [session.id, session])), pairs = new Map();
    for (const actor of actors.values()) {
      if (!actor.helper || actor.entryPending) continue;
      const session = current.get(actor.id);
      const owned = ['return', 'absorb'].includes(actor.navigation?.kind)
        && !(session && hasBodyActivity(session));
      // The first closed snapshot is planned before reconcileActors starts
      // returnClone. Reserve exactly the same existing, visible ancestor now.
      if (!(session && Scene.isClosed(session)) && !owned) continue;
      const parent = owned ? actors.get(actor.navigation.parentId) || cloneAncestor(actor) : cloneAncestor(actor);
      if (parent && parent !== actor && !parent.entryPending) pairs.set(actor.id, parent.id);
    }
    return pairs;
  }
  function finiteExitIds(present) {
    const presentIds = new Set(present.map(session => session.id));
    const current = new Map(snapshot.sessions.map(session => [session.id, session]));
    const pinned = pinnedDockIds(), exits = new Set();
    for (const actor of actors.values()) {
      if (actor.helper || actor.session.parentId || actor.entryPending || presentIds.has(actor.id)
        || actor.holdingFamily && !actor.retireRequested || pinned.has(actor.id) || relatedClones(actor).length
        || present.some(session => cloneLedger.parentChain(session.id).includes(actor.id))) continue;
      const session = current.get(actor.id);
      if (session?.parentId) continue;
      const owned = actor.navigation?.kind === 'exit' || actor.resumeNavigation?.kind === 'exit';
      const idle = session && !session.disconnected && session.status === 'idle'
        && (!session.activity || session.activity === 'idle') && !session.attention && !(Number(session.activeTools) > 0);
      // Attendance has already retired this admitted body. A vanished source,
      // confirmed close/idle, or its still-owned exit is finite evidence;
      // uncertainty alone cannot invent a trip to the door.
      if (owned || !session || Scene.isClosed(session) || idle) exits.add(actor.id);
    }
    return exits;
  }
  // A certificate owns three real requests, never a recorded animation path.
  // Its source is checked once; expected physical progress must not invalidate
  // the immutable initial sourceKey on every metadata heartbeat.
  function transferSamePoint(a, b) {
    return Boolean(a && b && Math.abs(a.x-b.x) < .001 && Math.abs(a.y-b.y) < .001);
  }
  function transferInputs() {
    const present = attendance.present.filter(session => !restedClones.has(session.id) || hasBodyActivity(session));
    const ids = new Set(present.map(session => session.id));
    return present.concat([...actors.values()].filter(actor => !ids.has(actor.id) && !restedClones.has(actor.id))
      .map(actor => snapshot.sessions.find(session => session.id === actor.id) || actor.session));
  }
  function transferPhysicalOwner(actor) {
    return Boolean(actor.motion || actor.routeReservation || actor.yielding || actor.resumeNavigation
      || actor.navigation || actor.entryPending || actor.stagedEntry || actor.cloneCharge || cloneBusy(actor) || actor.opacityMotion);
  }
  function transferAvailable(incoming) {
    if (destroyed || fitting || quietSprites() || incoming.length !== actors.size) return false;
    const state = traffic.state();
    return !state.queued && !state.activeMoves.length && !trafficWaiters.size
      && incoming.every(session => { const actor = actors.get(session.id); return actor && !actor.departing && !transferPhysicalOwner(actor); });
  }
  function transferEligible(incoming) {
    const pinned = pinnedDockIds();
    return new Set(incoming.filter(session => {
      const actor = actors.get(session.id);
      return actor && canYieldAtStation(actor, pinned, true) && hasBodyActivity(session)
        && !Scene.activitySpec(session).stale && !session.attention && !['waiting', 'stale'].includes(session.status);
    }).map(session => session.id));
  }
  function transferSemanticKey(incoming) {
    const present = new Set(attendance.present.map(session => session.id));
    const observed = new Map(snapshot.sessions.map(session => [session.id, session]));
    return JSON.stringify([settings.agentScale, settings.sceneVenue, settings.sceneTheme, language,
      incoming.slice().sort((a,b) => a.id.localeCompare(b.id)).map(session => {
        session = observed.get(session.id) || session;
        const actor = actors.get(session.id), footprint = actorFootprints.get(session.id);
        return [session.id, session.provider || null, session.parentId || null, session.status || null, session.activity || null,
          session.turnId || null, session.turnCompletedAt || null, Boolean(session.attention), Boolean(session.disconnected), Boolean(session.closed),
          present.has(session.id), observed.has(session.id), footprint && ['left','right','top','bottom'].map(key => footprint[key]),
          Boolean(actor?.holdingFamily), Boolean(actor?.retireRequested), Boolean(actor?.departing), Boolean(actor?.helper)];
      })]);
  }
  function transferValid(owner, incoming = transferInputs()) {
    if (!owner || transferOwner !== owner || destroyed || fitting || quietSprites()
      || actors.size !== owner.cast.size || Math.abs(uniformScale-owner.certificate.scale) > .00001
      || transferSemanticKey(incoming) !== owner.semanticKey) return false;
    for (const [id, original] of owner.cast) {
      const actor = actors.get(id);
      if (actor !== original.actor || actor.serial !== original.serial || actor.node !== original.node
        || actor.image !== original.image || actor.performance !== original.performance || actor.entryPending || actor.stagedEntry
        || actor.resumeNavigation || actor.cloneCharge || cloneBusy(actor) || actor.opacityMotion) return false;
      if (actor.navigation && actor.navigation.transferOwner !== owner) return false;
      if (actor.routeReservation && actor.routeReservation.transferOwner !== owner) return false;
      if (actor.pendingStation && actor.pendingStation.transferOwner !== owner) return false;
      if ((actor.motion || actor.routeReservation || actor.yielding) && !owner.certificate.affectedIds.includes(id)) return false;
      const target = owner.targets.get(id);
      if (!target || !transferSamePoint(actor.target, target)) return false;
    }
    return true;
  }
  function revokeTransfer(reason, skipActor = null, replan = true) {
    const owner = transferOwner;
    if (!owner) return;
    transferOwner = null; transferContinuation = null;
    delete office.dataset.transferStatus; delete office.dataset.transferStep;
    for (const [id, original] of owner.cast) {
      const actor = actors.get(id);
      if (actor !== original.actor) continue;
      if (actor.pendingStation?.transferOwner === owner) actor.pendingStation = null;
      const owned = actor.navigation?.transferOwner === owner || actor.routeReservation?.transferOwner === owner;
      if (actor !== skipActor && owned && actor.serial === original.serial) cancelAction(actor);
      else if (actor.navigation?.transferOwner === owner) actor.navigation = null;
    }
    if (replan && !destroyed && !clearingActors) queueLayoutRefresh(true);
  }
  function acceptTransfer(certificate, incoming) {
    if (!certificate || certificate.version !== 1 || certificate.kind !== 'two-slot-swap'
      || certificate.steps?.length !== 3 || certificate.participants?.length !== 2 || !transferAvailable(incoming)
      || Math.abs(certificate.scale-uniformScale) > .00001 || certificate.initialPositions.length !== actors.size
      || certificate.finalTargets.length !== actors.size) return false;
    const targets = new Map(certificate.finalTargets.map(point => [point.id, currentPage.seats.get(point.id)]));
    if (targets.size !== actors.size || certificate.initialPositions.some(point => !actors.has(point.id) || !transferSamePoint(currentPosition(actors.get(point.id)), point))
      || certificate.finalTargets.some(point => !transferSamePoint(targets.get(point.id), point))
      || JSON.stringify([certificate.scale, certificate.finalTargets]) !== certificate.targetKey) return false;
    const eligible = transferEligible(incoming);
    if (!certificate.participants.every(id => eligible.has(id))
      || [...actors.values()].some(actor => actor.pendingStation && !certificate.participants.includes(actor.id))) return false;
    const now = performance.now();
    const due = Math.max(...certificate.participants.map(id => {
      const actor = actors.get(id), pending = actor.pendingStation;
      return pending && transferSamePoint(pending.seat, targets.get(id)) ? pending.due : now + 1700;
    }));
    const owner = transferOwner = { certificate, targets, phase: 'pending', due, index: 0, waiting: false, requestDone: false,
      semanticKey: transferSemanticKey(incoming), cast: new Map([...actors].map(([id, actor]) => [id,
        { actor, serial: actor.serial, node: actor.node, image: actor.image, performance: actor.performance }])) };
    for (const id of certificate.participants) {
      const actor = actors.get(id);
      // Retain the original intent deadline. Only this finite owner may consume
      // it; no old per-actor callback is cancelled until the stable recheck.
      actor.pendingStation = { seat: targets.get(id), due, transferOwner: owner };
    }
    office.dataset.transferStatus = 'pending'; office.dataset.transferStep = '0';
    return true;
  }
  function transferDrained(owner) {
    const state = traffic.state();
    return !state.queued && !state.activeMoves.length && !trafficWaiters.size
      && [...owner.cast.values()].every(({ actor }) => !actor.motion && !actor.routeReservation && !actor.yielding && !actor.resumeNavigation);
  }
  function continueTransfer() {
    const owner = transferOwner;
    if (!owner) return;
    if (!transferValid(owner)) { revokeTransfer('owner-changed'); return; }
    if (owner.phase === 'pending') {
      if (performance.now() < owner.due) return;
      if (!transferDrained(owner) || owner.certificate.initialPositions.some(point => !transferSamePoint(currentPosition(actors.get(point.id)), point))) {
        revokeTransfer('source-changed'); return;
      }
      owner.phase = 'running'; office.dataset.transferStatus = 'running';
      for (const id of owner.certificate.affectedIds) {
        const actor = actors.get(id);
        actor.navigation = { kind: 'transfer', target: owner.targets.get(id), transferOwner: owner };
      }
      for (const id of owner.certificate.participants) actors.get(id).pendingStation = null;
    }
    if (!transferDrained(owner)) return;
    if (owner.waiting) {
      if (!owner.requestDone) return;
      const completed = owner.certificate.steps[owner.index];
      if (completed.settledPositions.some(point => !transferSamePoint(currentPosition(actors.get(point.id)), point))) {
        revokeTransfer('drain-endpoint-changed'); return;
      }
      owner.index += 1; owner.waiting = false;
    }
    if (owner.index === owner.certificate.steps.length) {
      transferOwner = null; delete office.dataset.transferStatus; delete office.dataset.transferStep;
      for (const { actor } of owner.cast.values()) if (actor.navigation?.transferOwner === owner) actor.navigation = null;
      for (const id of owner.certificate.participants) {
        const actor = actors.get(id), target = owner.targets.get(id);
        actor.lastZone = target.workZone || target.zone;
        finishAtStation(actor); actualArrival(actor, target, actor.serial, 'station');
      }
      queueLayoutRefresh(true); queueNavigation(); queueTraffic(); return;
    }
    const step = owner.certificate.steps[owner.index], actor = actors.get(step.id);
    owner.waiting = true; owner.requestDone = false;
    office.dataset.transferStep = String(owner.index);
    move(actor, step.target, actor.serial, ['reading', 'searching'].includes(actor.session.activity)).then(ok => {
      if (transferOwner !== owner) return;
      if (!ok) { revokeTransfer('request-cancelled'); return; }
      owner.requestDone = true; queueTransferContinuation();
    }).catch(error => { if (transferOwner === owner) { revokeTransfer('request-failed'); showError(error); } });
  }
  function queueTransferContinuation() {
    if (!transferOwner || transferContinuation || destroyed) return;
    const owner = transferContinuation = transferOwner;
    queueMicrotask(() => {
      if (transferContinuation !== owner) return;
      transferContinuation = null;
      if (transferOwner === owner) continueTransfer();
    });
  }
  function sceneOptions(incoming = snapshot.sessions, exiting = new Set()) {
    const pinned = pinnedDockIds();
    const closingPairs = closingDockPairs();
    const observedById = new Map(snapshot.sessions.map(session => [session.id, session]));
    for (const [child, parent] of closingPairs) { pinned.add(child); pinned.add(parent); }
    return { passThrough: true, allowTransfers: transferAvailable(incoming), transferEligibleIds: transferEligible(incoming), requestedScale: deferredPhysicalScale ?? settings.agentScale, maximumScale: deferredPhysicalScale ?? currentPage.scaleCeiling, residentIds: new Set(actors.keys()), venue: settings.sceneVenue, footprints: actorFootprints, reservedRects: CLOCK_RESERVED, previousSeats: seats, previousScale: uniformScale, previousRequestedScale: currentPage.requestedScale,
      closingDockPairs: closingPairs, openingDockPairs: openingDockPairs(incoming), finiteExitIds: new Set(exiting),
      // A settled absent ancestor has no ordinary station route. A first late
      // descendant, its real holding walk, and fresh work keep their own owners.
      fixedHoldingIds: new Set([...actors.values()].filter(actor => !actor.entryPending && actor.holdingFamily
        && !actor.motion && !actor.routeReservation && !actor.navigation && !actor.resumeNavigation
        && !(observedById.has(actor.id) && hasBodyActivity(observedById.get(actor.id))
          && attendance.present.some(session => session.id === actor.id))).map(actor => actor.id)),
      openingBusyIds: new Set([...actors.values()].filter(actor => !actor.entryPending && (actor.motion || actor.routeReservation || actor.resumeNavigation || actor.yielding)).map(actor => actor.id)),
      currentPositions: new Map([...actors.values()].filter(actor => !actor.entryPending).map(actor => [actor.id, currentPosition(actor)])),
      immovableIds: new Set([...actors.values()].filter(actor => !actor.entryPending && !canYieldAtStation(actor, pinned)).map(actor => actor.id)),
      allowedOverlaps: new Set([...actors.values()].flatMap(actor => {
        const parent = endpointParent(actor);
        return parent ? [JSON.stringify([actor.id, parent.id].sort())] : [];
      })) };
  }
  function updateEntranceLane() {
    office.dataset.entranceQueue = String([...actors.values()].filter(actor => actor.entryPending).length);
    updateSignalSummary();
  }
  function updateSignalSummary() {
    const count = [...actors.values()].filter(actor => actor.entryPending).length;
    const recent = snapshot.sessions.reduce((latest, session) => Math.max(latest, Scene.timestamp(session.lastEventAt)), 0);
    const signal = recent ? tr(timeAgo(recent)) : '';
    $('signal-summary').textContent = signal;
    const summary = $('room-summary');
    if (summary.dataset.baseSummary) summary.textContent = summary.dataset.baseSummary
      + (count ? ' · ' + (language === 'en' ? count + ' entering the room' : count + ' 位正在入场') : '');
  }
  function actorGeometry(actor) { return { helper: actor.helper, uniformScale, layoutMode: currentPage.layoutMode, footprint: actorFootprints.get(actor.id) }; }
  function walkingRoute(from, to, actor) {
    const proof = currentPage.routeGeometry, seat = currentPage.seats?.get(actor.id);
    const footprint = actorFootprints.get(actor.id), recorded = proof?.footprints.get(actor.id);
    const samePoint = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
    // The allocator already proved this exact entrance route. Reuse only its
    // own geometry revision; Traffic still checks every leg against the real
    // current bodies and remaining moving corridors before reserving it.
    if (proof && proof.paths === currentPage.pathsById && proof.scale === currentPage.uniformScale
      && actor.uniformScale === proof.scale && uniformScale === proof.scale
      && samePoint(from, ENTRY_POINT) && samePoint(to, seat)
      && recorded && footprint && actor.footprint
      && ['left', 'right', 'top', 'bottom'].every(key => recorded[key] === footprint[key] && recorded[key] === actor.footprint[key])) {
      const path = proof.paths.get(actor.id);
      if (Array.isArray(path) && path.length > 1 && samePoint(path[0], from) && samePoint(path.at(-1), to)
        && path.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return path.map(p => ({ x: p.x, y: p.y }));
    }
    return WalkingLayout.route(from, to, actor);
  }
  function measureActorFootprints(sessions) {
    const frameScale = world.getBoundingClientRect().width / Scene.WORLD.width;
    if (!frameScale) return;
    const liveIds = new Set(sessions.map(session => session.id));
    for (const id of actorFootprints.keys()) if (!liveIds.has(id) && !actors.has(id)) actorFootprints.delete(id);
    let grew = false;
    const mode = office.dataset.nameplateMode || 'full';
    for (const session of sessions) {
      const parent = familyGraph.byId.get(session.parentId) || actors.get(session.parentId)?.session;
      const relation = nameplateRelation(session, parent, mode);
      const labels = [...new Set([tr(Scene.activitySpec(session).label), tr(Director.plan(session, { now: Date.now(), language }).label),
        tr('会话已结束'), tr('这一轮已歇下'), tr(session.parentId ? '结束分身' : '等分身归位'),
        actors.get(session.id)?.state.textContent].filter(Boolean))];
      const name = displayName(session), provider = tr(session.provider === 'claude-code' ? 'Claude' : Scene.providerName(session.provider));
      const badgeText = nameplateFamilyBadgeText(session);
      const key = JSON.stringify([NAMEPLATE_METRICS_VERSION, mode, Boolean(session.parentId), language, name, relation, provider, badgeText, labels]);
      let footprint = footprintCache.get(key);
      if (!footprint) {
        // Measure the same CSS and text as the real plate before choosing a
        // page. Artwork stays inside the fixed body canvas; no sprite sampling.
        const node = element('div', 'actor');
        node.dataset.helper = String(Boolean(session.parentId)); node.dataset.hasFamily = 'true'; node.dataset.selected = 'true';
        node.dataset.error = String(session.activity === 'error'); node.dataset.attention = String(Scene.needsAttention(session));
        node.dataset.stale = String(Boolean(Scene.activitySpec(session).stale));
        node.style.cssText = 'visibility:hidden;pointer-events:none;transform:translate3d(0,0,0)';
        const button = element('button', 'actor-button'), body = element('span', 'character-body');
        const { plate, title, relation: relationNode, subline, provider: providerNode, state } = createActorPlate(session);
        title.textContent = name; relationNode.textContent = relation;
        providerNode.textContent = provider; providerNode.dataset.provider = String(session.provider).toLowerCase();
        const badge = element('span', 'family-badge', badgeText);
        badge.dataset.helper = String(Boolean(session.parentId)); badge.setAttribute('aria-hidden', 'true');
        plate.append(badge);
        button.append(body, plate); node.append(button); actorsLayer.append(node);
        const origin = node.getBoundingClientRect();
        footprint = { left: 0, right: 0, top: 0, bottom: 0 };
        for (const label of labels) {
          state.textContent = label;
          for (const part of [body, plate, ...plate.children, ...subline.children]) {
            const rect = part.getBoundingClientRect();
            // display:none descendants have a viewport-zero rect, not a
            // coordinate relative to this hidden-but-measurable world probe.
            if (!(rect.width > 0 || rect.height > 0)) continue;
            footprint.left = Math.max(footprint.left, (origin.left - rect.left) / frameScale);
            footprint.right = Math.max(footprint.right, (rect.right - origin.left) / frameScale);
            footprint.top = Math.max(footprint.top, (origin.top - rect.top) / frameScale);
            footprint.bottom = Math.max(footprint.bottom, (rect.bottom - origin.top) / frameScale);
          }
        }
        node.remove();
        const painted = window.OfficeSizeStability.bodyFootprint(session);
        for (const key of ['left', 'right', 'top', 'bottom']) footprint[key] = Math.max(footprint[key], painted[key]);
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
      cancelPhysicalRoutes(); reflowPending = true;
    }
  }
  function transitCaption(actor, yielding = false) {
    // Traffic describes the body, not the observed session. A coding agent
    // keeps coding while its route is queued or it temporarily makes room.
    actor.node.dataset.trafficHint = yielding ? 'yielding' : 'queued';
    if (!actor.departing && !cloneBusy(actor) && !actor.holdingFamily) {
      if (!actor.motion && actor.node.dataset.walking !== 'true') finishAtStation(actor);
      else text(actor.state, Director.plan(actor.session, { now: Date.now(), language }).label || actor.spec.label);
    }
  }
  function clearTrafficBlock() {
    clearTimeout(blockedTrafficTimer); blockedTrafficTimer = 0; blockedTraffic = null;
  }
  function reflowBlockedTraffic() {
    clearTrafficBlock();
    // A blocked route cannot complete a real journey. Keep every admitted
    // body at its actual foot, and ask the allocator for another safe station.
    for (const { actor } of trafficWaiters.values()) {
      actor.node.dataset.traffic = 'queued';
      actor.node.dataset.trafficHint = language === 'en' ? 'Waiting for a clear route' : '等待通道空位';
    }
    reflowPending = true;
    render();
  }
  function trackTrafficBlock() {
    const signature = JSON.stringify([...trafficWaiters].map(([id, pending]) => [id, pending.target.x, pending.target.y]).sort());
    const now = performance.now();
    if (!blockedTraffic || blockedTraffic.signature !== signature) blockedTraffic = { signature, since: now };
    if (now - blockedTraffic.since >= 2500) { reflowBlockedTraffic(); return; }
    if (!blockedTrafficTimer) blockedTrafficTimer = setTimeout(() => { blockedTrafficTimer = 0; pumpTraffic(); }, 500);
  }
  function visibleActors() { return [...actors.values()].filter(actor => !actor.entryPending); }
  function pinnedDockIds() {
    return new Set([...actors.values()].filter(child => child.cloneCharge || child.entryPending && child.stagedEntry && child.navigation?.kind === 'entry' || ['return', 'absorb'].includes(child.navigation?.kind)).map(child => child.navigation?.parentId).filter(Boolean));
  }
  function canYieldAtStation(actor, pinned, ignoreTransfer = false) {
    return (ignoreTransfer || !transferOwner || !transferOwner.certificate.participants.includes(actor.id)) && !actor.entryPending && !actor.departing && !cloneBusy(actor)
      && !actor.holdingFamily && !actor.retireRequested && !actor.completing && !actor.spec.stale && !pinned.has(actor.id);
  }
  function canYieldActor(actor, pinned) {
    return canYieldAtStation(actor, pinned) && !actor.motion && !actor.routeReservation;
  }
  function syncTraffic() {
    const pinned = pinnedDockIds();
    traffic.sync([...actors.values()].filter(actor => !actor.entryPending || actor.stagedEntry).map(actor => ({ id: actor.id, position: currentPosition(actor), ...actorGeometry(actor), staged: Boolean(actor.stagedEntry),
      canYield: canYieldActor(actor, pinned) })));
  }
  function queueTraffic() {
    if (trafficTimer || destroyed) return;
    trafficTimer = setTimeout(pumpTraffic, 60);
  }
  function pumpTraffic() {
    // move() can pump synchronously while a scheduled pump still owns this
    // handle. Retire it before replacing the owner, not just its variable.
    clearTimeout(trafficTimer);
    trafficTimer = 0;
    if (destroyed) return;
    if (fitting) { queueAdmission(); return; }
    let progressed = false;
    syncTraffic();
    const trafficState = traffic.state();
    if (!transferOwner && trafficState.activeMoves.length < trafficState.maxConcurrent && ![...actors.values()].some(actor => actor.stagedEntry)) {
      const next = nextEntryCandidate();
      if (next) {
        const { actor, parent } = next;
        // An unobserved ancestor cannot be invented just to stage an entry.
        if (actor.helper && !parent) {
          restoreUnobservedHelper(actor).catch(showError); progressed = true;
        } else if (!actor.helper || openingRouteReady(actor, parent)) {
          // A positive source proof belongs to this exact helper. Its actual
          // arrival/slot release re-proves the next pending sibling's source.
          if (actor.helper) enterClone(actor, actor.target).catch(showError);
          else settle(actor, actor.target, true).catch(showError);
          progressed = true;
        }
      }
    }
    const reservations = traffic.nextBatch?.() || [traffic.nextAny()];
    // A swap reserves every departing member together. Validate the whole
    // batch before starting any leg so an obsolete actor cannot strand its
    // partner at a destination whose old occupant never actually departs.
    if (reservations.length > 1 && reservations.some(reservation => {
      if (!['move', 'arrived'].includes(reservation.kind)) return false;
      const actor = actors.get(reservation.id), pending = trafficWaiters.get(reservation.id);
      return !actor || actor.entryPending && !actor.stagedEntry
        || actor.stagedEntry && (!pending || pending.serial !== actor.serial)
        || transferOwner && (transferOwner.phase !== 'running' || !transferOwner.certificate.steps[transferOwner.index].drainIds.includes(actor.id));
    })) {
      if (transferOwner) revokeTransfer('obsolete-batch');
      for (const reservation of reservations) {
        const actor = actors.get(reservation.id), pending = trafficWaiters.get(reservation.id);
        if (!actor) {
          traffic.cancel(reservation.id);
          if (pending) { trafficWaiters.delete(reservation.id); pending.resolve(false); }
          continue;
        }
        // Cancelling the reservation alone leaves navigation.target looking
        // satisfied even though its body never departed. Release the same
        // physical owner as a refit, then retry its still-current intent from
        // its actual feet. Unadmitted bodies must lose their staged flag so
        // nextEntryCandidate can prove their source again.
        const navigation = actor.navigation || actor.resumeNavigation
          || { kind: actor.entryPending ? 'entry' : 'station', target: actor.target };
        const flags = { departing: actor.departing, returnReason: actor.returnReason, clonePhase: actor.clonePhase,
          cloneTarget: actor.node.dataset.cloneTarget, cloneReason: actor.node.dataset.cloneReason };
        cancelAction(actor);
        Object.assign(actor, flags); clonePhase(actor, flags.clonePhase);
        if (flags.cloneTarget) actor.node.dataset.cloneTarget = flags.cloneTarget;
        if (flags.cloneReason) actor.node.dataset.cloneReason = flags.cloneReason;
        actor.resumeNavigation = navigation; actor.navigation = null;
      }
      resumeNavigation(); queueTraffic(); return;
    }
    for (const reservation of reservations) {
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
        let splitEffect = null;
        if (actor.stagedEntry) {
          if (!pending || pending.serial !== actor.serial) { traffic.cancel(id); return; }
          actor.stagedEntry = false; actor.entryPending = false;
          actor.node.style.visibility = '';
          actor.node.style.opacity = '1';
          actor.entranceActive = !actor.helper; observedIds.add(actor.id);
          if (actor.helper && actor.node.dataset.cloneOrigin) splitEffect = cloneEffect(actor, cloneAncestor(actor) || actor, 'split');
          else if (!actor.helper) openDoor();
          updateEntranceLane();
          progressed = true;
        }
        if (reservation.kind === 'arrived') {
          trafficWaiters.delete(id); actor.node.dataset.traffic = 'arrived';
          actor.yielding = false;
          if (pending) pending.resolve(true); else finishAtStation(actor);
          queueTransferContinuation();
          progressed = true;
        } else {
          trafficWaiters.delete(id);
          const serial = actor.serial;
          const routeOwner = actor.routeReservation = { token: reservation.token, serial, transferOwner };
          if (transferOwner && (transferOwner.phase !== 'running' || !transferOwner.certificate.steps[transferOwner.index].drainIds.includes(id))) { revokeTransfer('unexpected-mover'); return; }
          actor.cloneCharge = Boolean(splitEffect && !quietSprites());
          actor.node.dataset.cloneCharge = String(actor.cloneCharge);
          if (reservation.yielding) actor.yielding = true;
          const travel = async () => {
            if (actor.cloneCharge) await splitEffect.ready;
            if (actor.serial !== serial || actor.routeReservation !== routeOwner || destroyed) return false;
            actor.cloneCharge = false; actor.node.dataset.cloneCharge = 'false'; queueNavigation();
            return animateWalk(actor, reservation.path, serial, pending?.carrying, reservation.instant, reservation.yielding);
          };
          travel().then(ok => {
            if (actor.routeReservation === routeOwner) actor.routeReservation = null;
            traffic.finish(id, reservation.token, currentPosition(actor));
            if (ok && actor.serial === serial && !reservation.temporary) actor.yielding = false;
            if (pending && ok && reservation.temporary) {
              trafficWaiters.set(id, pending);
              actor.node.dataset.traffic = 'queued';
            } else if (pending) pending.resolve(ok);
            if (!pending && ok) {
              if (reservation.temporary) {
                actor.node.dataset.traffic = 'yielding';
                transitCaption(actor, true);
              } else finishAtStation(actor);
            }
            queueTransferContinuation();
            renderHelperLinks();
            if (ok && (currentPage.exitOwnerIds?.length || [...actors.values()].some(child => child.helper && child.entryPending))) queueLayoutRefresh(true);
            queueTraffic();
          }).catch(error => {
            if (actor.serial !== serial || actors.get(actor.id) !== actor) { pending?.resolve(false); return; }
            if (actor.routeReservation === routeOwner) actor.routeReservation = null;
            actor.cloneCharge = false; actor.node.dataset.cloneCharge = 'false'; traffic.cancel(id, currentPosition(actor)); actor.yielding = false;
            pending?.resolve(false); showError(error); queueNavigation(); queueTraffic();
          });
          progressed = true;
        }
      } else clearTrafficBlock();
    }
    // A blocked room sleeps until a movement completes, a request changes or
    // a real snapshot arrives. Do not burn a permanent polling loop at rest.
    if (progressed) { renderHelperLinks(); updateProps(); }
    if (reservations.some(reservation => reservation.reason === 'searching') || traffic.state().active || progressed && (traffic.state().queued || trafficWaiters.size || [...actors.values()].some(actor => actor.entryPending))) queueTraffic();
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
  function endpointParent(actor) {
    if (!actor.endpointOverlap && actor.helper && cloneBusy(actor) && !actor.entryPending) {
      const parent = cloneAncestor(actor);
      if (parent) actor.endpointOverlap = { parentId: parent.id, serial: actor.serial, kind: actor.clonePhase };
    }
    const evidence = actor.endpointOverlap;
    if (!evidence) return null;
    const parent = actors.get(evidence.parentId);
    if (!parent || parent === actor || actor.entryPending) { actor.endpointOverlap = null; delete actor.node.dataset.endpointOverlap; return null; }
    const actualGeometry = value => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(value.node).transform);
      return { ...actorGeometry(value), uniformScale: Math.hypot(matrix.m11, matrix.m12) };
    };
    if (!Scene.actorsOverlap(currentPosition(actor), actualGeometry(actor), currentPosition(parent), actualGeometry(parent), currentPage.gap)) {
      actor.endpointOverlap = null; delete actor.node.dataset.endpointOverlap; return null;
    }
    actor.node.dataset.endpointOverlap = parent.id;
    return parent;
  }
  function completedCloneTurn(session, previousTurnAt = 0) {
    return Scene.timestamp(session.turnCompletedAt) > previousTurnAt && session.activity === 'idle'
      && !session.disconnected && session.status !== 'stale' && !session.attention && !(Number(session.activeTools) > 0);
  }
  function completedCloneReturn(reason) { return reason === 'ended' || reason === 'completed'; }
  function clonePhase(actor, phase) { actor.clonePhase = phase; actor.node.dataset.clonePhase = phase; queueDeferredResize(); }
  function cloneAncestor(actor) {
    const chain = cloneLedger.parentChain(actor.id);
    const rootId = cloneLedger.rootFor(actor.id);
    if (rootId && rootId !== actor.id) { const at = chain.indexOf(rootId); if (at >= 0) chain.splice(at, 1); chain.unshift(rootId); }
    if (!chain.length && actor.session.parentId) chain.push(actor.session.parentId);
    return chain.map(id => actors.get(id)).find(parent => parent && parent !== actor && !parent.departing
      && !['returning', 'absorbing'].includes(parent.clonePhase) && (!parent.helper || !Scene.isClosed(parent.session))) || null;
  }
  function cloneEffect(actor, anchor, kind) {
    if (quietSprites() || !anchor) return null;
    const effect = window.OfficeCloneMotion.burst({ anchor: anchor.node, kind, ownerId: actor.id });
    actor.cloneEffects.add(effect);
    effect.finished.finally(() => actor.cloneEffects.delete(effect));
    if (kind === 'split' && anchor !== actor) effect.ready.then(() => {
      if (actor.target && actors.get(actor.id) === actor) parentGlance(anchor, actor, actor.target);
    }).catch(() => {});
    return effect;
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
  function needsOpeningRefresh(ancestorId) {
    const present = new Set((currentPage.visible || []).map(session => session.id));
    return snapshot.sessions.some(session => {
      if (!session.parentId || !present.has(session.id) || Scene.isClosed(session)) return false;
      const body = actors.get(session.id);
      if (body && !body.entryPending) return false;
      const chain = cloneLedger.parentChain(session.id);
      return chain.some(id => (!ancestorId || id === ancestorId) && actors.has(id) && !actors.get(id).entryPending);
    });
  }
  function resumeActiveActor(actor) {
    if (!hasBodyActivity(actor.session) || !actor.departing && !actor.holdingFamily && !actor.retireRequested) return;
    const retiredMain = !actor.helper && !actor.entryPending;
    cancelAction(actor);
    actor.departing = false; actor.holdingFamily = false; actor.retireRequested = null;
    actor.node.dataset.cloneHold = 'false';
    if (retiredMain && needsOpeningRefresh(actor.id)) queueLayoutRefresh(true);
  }
  function cancelPhysicalRoutes() {
    revokeTransfer('fit', null, false);
    // Re-fitting owns geometry, never a session's return/retirement intent.
    for (const actor of actors.values()) if (actor.motion || actor.routeReservation || actor.yielding || actor.stagedEntry || trafficWaiters.has(actor.id)) {
      const navigation = actor.navigation || (!actor.entryPending && (actor.motion || actor.routeReservation || actor.yielding) ? { kind: 'station', target: actor.target } : null);
      const flags = { departing: actor.departing, returnReason: actor.returnReason, clonePhase: actor.clonePhase,
        cloneTarget: actor.node.dataset.cloneTarget, cloneReason: actor.node.dataset.cloneReason };
      cancelAction(actor);
      Object.assign(actor, flags); clonePhase(actor, flags.clonePhase);
      if (flags.cloneTarget) actor.node.dataset.cloneTarget = flags.cloneTarget;
      if (flags.cloneReason) actor.node.dataset.cloneReason = flags.cloneReason;
      actor.resumeNavigation = navigation; actor.navigation = null;
    }
    traffic.clear();
  }
  function fadeBody(actor, target) {
    const from = Math.max(0, Math.min(1, Number(getComputedStyle(actor.node).opacity) || 0));
    if (actor.opacityMotion) { actor.opacityMotion.cancel(); actor.opacityMotion = null; }
    actor.node.style.transitionProperty = 'transform';
    actor.node.style.opacity = String(target);
    if (quietSprites() || Math.abs(from - target) < .00001) {
      delete actor.node.dataset.bodyFade; actor.node.style.removeProperty('transition-property'); return Promise.resolve(true);
    }
    actor.node.dataset.bodyFade = target === 0 ? 'absorb' : 'restore';
    const motion = actor.node.animate([{ opacity: from }, { opacity: target }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
    actor.opacityMotion = motion;
    return motion.finished.then(() => true, () => false).then(ok => {
      if (actor.opacityMotion === motion) { actor.opacityMotion = null; delete actor.node.dataset.bodyFade; actor.node.style.removeProperty('transition-property'); }
      return ok;
    });
  }
  function cancelAction(actor, { dispose = false } = {}) {
    if (transferOwner?.cast.has(actor.id)) revokeTransfer(dispose ? 'dispose' : 'actor-owner-released', actor, !dispose);
    // Finish only the old distance-phase lease, at the composed physical foot.
    if (actor.motion) syncWalkingGait(actor);
    const releasedPhysicalOwner = Boolean(actor.motion || actor.routeReservation || actor.resumeNavigation || actor.yielding);
    const releasedExitOwner = actor.navigation?.kind === 'exit' || actor.resumeNavigation?.kind === 'exit';
    const hasFadeEvidence = actor.opacityMotion || actor.clonePhase === 'absorbing'
      || actor.node.style.opacity && Number(actor.node.style.opacity) < 1;
    const bodyOpacity = hasFadeEvidence ? Math.max(0, Math.min(1, Number(getComputedStyle(actor.node).opacity) || 0)) : 1;
    if (actor.helper && cloneBusy(actor) && !actor.entryPending) {
      const parent = cloneAncestor(actor);
      if (parent) {
        actor.endpointOverlap = { parentId: parent.id, serial: actor.serial, kind: actor.clonePhase };
        endpointParent(actor);
      }
    }
    actor.serial += 1;
    actor.routeReservation = null; actor.cloneCharge = false; actor.node.dataset.cloneCharge = 'false';
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
    actor.node.style.transitionProperty = 'transform';
    actor.node.style.opacity = String(bodyOpacity);
    if (!dispose && bodyOpacity < .99999) fadeBody(actor, 1);
    else { actor.node.style.opacity = dispose ? String(bodyOpacity) : '1'; delete actor.node.dataset.bodyFade; actor.node.style.removeProperty('transition-property'); }
    if (actor.motion) {
      actor.position = currentPosition(actor);
      actor.node.style.transition = 'none';
      actor.node.style.transform = actorTransform(actor.position, actor.helper);
      const oldMotion = actor.motion;
      actor.performance?.locomotion?.(null, oldMotion);
      if (actor.walkTiming?.motion === oldMotion) actor.walkTiming = null;
      oldMotion.cancel();
      actor.motion = null;
      void getComputedStyle(actor.node).transform;
      actor.node.style.removeProperty('transition');
    }
    for (const pending of actor.delays) { clearTimeout(pending.timer); pending.resolve(false); }
    actor.delays.clear();
    if (actor.defer) { clearTimeout(actor.defer); actor.defer = 0; }
    actor.queuedSeat = null;
    actor.navigation = null;
    actor.resumeNavigation = null;
    actor.pendingStation = null;
    actor.node.dataset.walking = 'false';
    actor.node.dataset.reaction = 'false';
    actor.bubble.dataset.show = 'false';
    actor.completing = false;
    queueTraffic();
    if (!dispose && (releasedExitOwner || releasedPhysicalOwner && needsOpeningRefresh())) queueLayoutRefresh(true);
    return actor.serial;
  }
  function queueNavigation() {
    clearTimeout(navigationTimer); navigationTimer = 0;
    if (destroyed || fitting) return;
    // Every due intent in this navigation turn must reach Traffic before its
    // first reservation. Otherwise a reciprocal station change looks like a
    // parked blocker merely because the second request has not been submitted.
    const previousBatch = queueNavigation.batch;
    const batch = queueNavigation.batch = { pumpRequested: false };
    try {
      let next = Infinity;
      const now = performance.now();
      const pinnedDocks = pinnedDockIds();
      if (transferOwner?.phase === 'pending') {
        if (transferOwner.due <= now) queueTransferContinuation();
        else next = transferOwner.due;
      }
      for (const actor of actors.values()) if (actor.pendingStation && !actor.entryPending && !actor.departing && !actor.holdingFamily) {
        if (pinnedDocks.has(actor.id) || actor.pendingStation.transferOwner === transferOwner && transferOwner) continue;
        if (actor.pendingStation.due <= now) {
          const seat = actor.pendingStation.seat; actor.pendingStation = null;
          settle(actor, seat, true).catch(showError);
        } else next = Math.min(next, actor.pendingStation.due);
      }
      if (Number.isFinite(next)) navigationTimer = setTimeout(() => { navigationTimer = 0; queueNavigation(); }, Math.max(0, next - performance.now()));
    } finally {
      queueNavigation.batch = previousBatch;
      if (batch.pumpRequested) {
        if (previousBatch) previousBatch.pumpRequested = true;
        else pumpTraffic();
      }
    }
  }
  function requestStation(actor, seat, urgent = false) {
    actor.target = seat;
    if (transferOwner?.cast.has(actor.id)) return;
    if (actor.entryPending || actor.departing || actor.holdingFamily || actor.spec.stale) return;
    if (['entry', 'return', 'absorb', 'exit'].includes(actor.navigation?.kind)) return;
    const currentTarget = actor.navigation?.target || actor.position;
    // Match the allocator's <.001 per-axis endpoint proof; a tiny real
    // remaining step must not strand a larger proved fit forever.
    if (Scene.distance(currentTarget, seat) <= .0005) {
      actor.pendingStation = null;
      if (!actor.navigation && !actor.motion && actor.node.dataset.traffic !== 'arrived') actor.node.dataset.traffic = 'arrived';
      return;
    }
    const previous = actor.pendingStation;
    const unchanged = previous && Scene.distance(previous.seat, seat) <= .08;
    // Only a stable functional destination owns a new route. Repeated tool
    // metadata never restarts its deadline or touches a running body/rig.
    actor.pendingStation = { seat, due: unchanged ? previous.due : performance.now() + (urgent ? 0 : 1700) };
    queueNavigation();
  }
  function resumeNavigation() {
    if (fitting || destroyed) return;
    let releasedResume = false;
    for (const actor of actors.values()) {
      const navigation = actor.resumeNavigation; actor.resumeNavigation = null;
      if (!navigation) continue;
      releasedResume = true;
      if (navigation.kind === 'return') { actor.departing = false; returnClone(actor, navigation.reason).catch(showError); }
      else if (navigation.kind === 'exit') { actor.departing = false; depart(actor, navigation.inactive).catch(showError); }
      else if (navigation.kind === 'holding') moveHolding(actor, actor.target).catch(showError);
      else if (!actor.entryPending) requestStation(actor, actor.target, true);
    }
    queueNavigation(); queueTraffic();
    if (releasedResume && needsOpeningRefresh()) queueLayoutRefresh(true);
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
  function syncWalkingGait(actor) {
    const owner = actor.walkTiming;
    if (!owner || owner.motion !== actor.motion || owner.serial !== actor.serial) return;
    const time = Number(owner.motion.currentTime);
    const sample = owner.plan.sampleAt(Number.isFinite(time) ? time : 0);
    actor.performance?.locomotion?.({ owner: owner.motion, distanceWorld: sample.pathDistance, speedWorld: sample.worldSpeed, scale: uniformScale });
  }
  function ensureMotionTicker() {
    if (frameTimer || destroyed || sceneHidden() || ![...actors.values()].some(actor => actor.motion)) return;
    function tick() {
      frameTimer = 0;
      if (destroyed) return;
      let moving = false;
      for (const actor of actors.values()) {
        if (actor.motion) {
          syncWalkingGait(actor);
          endpointParent(actor);
          actor.node.style.zIndex = '10';
          moving = true;
        } else if (actor.endpointOverlap && actors.get(actor.endpointOverlap.parentId)?.motion) endpointParent(actor);
      }
      renderHelperLinks();
      if (moving && !sceneHidden()) frameTimer = requestAnimationFrame(tick);
    }
    frameTimer = requestAnimationFrame(tick);
  }
  async function move(actor, target, serial, carrying = false) {
    if (actor.serial !== serial) return false;
    syncTraffic();
    const parent = actor.helper ? cloneAncestor(actor) : null;
    const endpoint = endpointParent(actor);
    // A fresh clone may already be at its station while its actual main must
    // leave their interrupted return endpoint. Reuse only that proven pair,
    // and only when the complete destination is clear of the real child.
    const separating = [...actors.values()].filter(child => child !== actor && endpointParent(child) === actor
      && !Scene.actorsOverlap(target, actorGeometry(actor), currentPosition(child), actorGeometry(child), currentPage.gap));
    const overlapIds = [...new Set([...(parent && (cloneBusy(actor) || actor.justEntered) ? [parent.id] : []), ...(endpoint ? [endpoint.id] : []), ...separating.map(child => child.id)])];
    if (!traffic.request(actor.id, target, { instant: reduced() || sceneHidden(), overlapIds })) return false;
    actor.node.dataset.traffic = 'queued';
    transitCaption(actor);
    return new Promise(resolve => {
      trafficWaiters.set(actor.id, { actor, target, serial, carrying, resolve });
      if (queueNavigation.batch) queueNavigation.batch.pumpRequested = true;
      else pumpTraffic();
    });
  }
  async function animateWalk(actor, path, serial, carrying = false, instant = false, yielding = false) {
    if (actor.serial !== serial) return false;
    const target = path.at(-1);
    actor.node.dataset.traffic = 'moving';
    const length = path.slice(1).reduce((sum, point, index) => sum + Scene.distance(path[index], point), 0);
    if (length < .000001 || instant || reduced() || sceneHidden()) {
      actor.node.style.transition = 'none';
      actor.position = { x: target.x, y: target.y };
      actor.node.style.transform = actorTransform(actor.position, actor.helper);
      actor.node.style.zIndex = '10';
      actor.arrivedAt = performance.now();
      actor.node.dataset.traffic = 'arrived';
      void getComputedStyle(actor.node).transform;
      actor.node.style.removeProperty('transition');
      return true;
    }
    actor.node.dataset.walking = 'true';
    actor.carry.dataset.carry = String(carrying);
    text(actor.carry, '≡');
    setPose(actor, carrying ? 'clawd-working-carrying.svg' : 'clawd-static-base.svg');
    if (yielding) transitCaption(actor, true);
    else text(actor.state, lifecycleCaption(actor) || Director.plan(actor.session, { now: Date.now(), language }).label || actor.spec.label);
    // Physical motion keeps every reserved vertex. Exact segment time laws
    // brake at turns without cutting through an unproved rounded corridor.
    const plan = WalkTiming.planWalk(path);
    if (!plan.valid) throw new Error('Invalid physical walking path: ' + plan.reason);
    const points = plan.vertices.map(vertex => ({ transform: actorTransform(vertex.point, actor.helper), offset: vertex.offset, easing: vertex.easing }));
    const duration = plan.duration;
    // The same transform also carries a gentle shared fit transition. A walk
    // owns it exclusively until its final inline foot is committed, otherwise
    // removing a filled WAAPI effect exposes a stale CSS transition to origin.
    actor.node.style.transition = 'none';
    const motion = actor.node.animate(points, { duration, easing: 'linear', fill: 'forwards' });
    actor.motion = motion;
    actor.walkTiming = { motion, serial, plan };
    syncWalkingGait(actor);
    ensureMotionTicker();
    try { await motion.finished; }
    catch (_) { return false; }
    if (actor.serial !== serial || actor.motion !== motion) return false;
    syncWalkingGait(actor);
    actor.performance?.locomotion?.(null, motion);
    if (actor.walkTiming?.motion === motion) actor.walkTiming = null;
    actor.position = { x: target.x, y: target.y };
    actor.node.style.transform = actorTransform(actor.position, actor.helper);
    actor.node.style.zIndex = '10';
    actor.motion = null;
    motion.cancel();
    void getComputedStyle(actor.node).transform;
    actor.node.style.removeProperty('transition');
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
    const previousMeaning = String(actor.lastPhase || '').split('/')[0], nextMeaning = String(plan.phase || '').split('/')[0];
    if (['stale', 'waiting-user', 'error', 'unknown', 'closed'].includes(previousMeaning) && previousMeaning !== nextMeaning) {
      clearTimeout(actor.bubbleTimer); actor.bubble.dataset.show = 'false';
    }
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
  function queueLayoutRefresh(releasedSlot = false) {
    if (destroyed || clearingActors) return;
    const goalScale = Number(currentPage.targetUniformScale || currentPage.uniformScale || uniformScale);
    if (!releasedSlot && !layoutRefreshRequested && goalScale <= uniformScale + .00001) return;
    layoutRefreshRequested = true;
    if (fitting || layoutRefreshOwner) return;
    const owner = layoutRefreshOwner = {};
    queueMicrotask(() => {
      if (layoutRefreshOwner !== owner) return;
      layoutRefreshOwner = null;
      if (destroyed || clearingActors) { layoutRefreshRequested = false; return; }
      if (fitting || !layoutRefreshRequested) return;
      layoutRefreshRequested = false;
      // Only a real endpoint or a released allocated slot can request this
      // refresh. Re-prove the fit from actual feet, preserving every actor.
      render();
    });
  }
  function actualArrival(actor, seat, serial, kind) {
    if (destroyed || actor.serial !== serial || actors.get(actor.id) !== actor || actor.entryPending) return;
    const reentry = actor.presentationReentry;
    const workEndpoint = kind === 'entry' || kind === 'station';
    const unchangedWork = reentry && reentry.activity === actor.session.activity && reentry.status === actor.session.status && reentry.turnId === actor.session.turnId;
    if (workEndpoint && !unchangedWork) actor.presentationReentry = null;
    // A preference-only readmission changes the drawing, not observed work.
    // Keep that work marker through any same-work parking moves as well;
    // only genuinely new work restores decorative feedback. Still release
    // pending layout owners at each real endpoint below.
    if (!workEndpoint || !unchangedWork) {
      office.dispatchEvent(new CustomEvent('office:actor-arrival', { detail: {
        actor, actorId: actor.id, zone: seat.zone || actor.target.zone, serial, kind,
        position: { ...currentPosition(actor) }
      } }));
    }
    const pendingOpening = [...actors.values()].some(child => child.helper && child.entryPending);
    queueLayoutRefresh(Boolean(pendingOpening || currentPage.exitOwnerIds?.length));
  }
  function placeOutside(actor, point) {
    if (!actor.entryPending) throw new Error('Only a not-yet-admitted body may set an entry origin');
    actor.node.style.transition = 'none';
    actor.position = { x: point.x, y: point.y };
    actor.node.style.transform = actorTransform(actor.position, actor.helper);
    void getComputedStyle(actor.node).transform;
    actor.node.style.removeProperty('transition');
  }
  async function moveHolding(actor, seat) {
    const serial = cancelAction(actor);
    actor.departing = false; actor.holdingFamily = true; actor.node.dataset.cloneHold = 'true';
    actor.target = seat; const navigation = actor.navigation = { kind: 'holding', target: seat };
    if (!await move(actor, seat, serial) || actor.serial !== serial) return;
    if (actor.navigation === navigation) actor.navigation = null;
    finishAtStation(actor); actualArrival(actor, seat, serial, 'holding'); queueTraffic();
  }
  async function restoreUnobservedHelper(actor) {
    const serial = cancelAction(actor), seat = actor.target;
    actor.navigation = { kind: 'restore', target: seat };
    placeOutside(actor, seat); actor.stagedEntry = true;
    actor.node.dataset.cloneOrigin = ''; actor.node.dataset.originEvidence = 'unobserved-parent';
    if (!await move(actor, seat, serial) || actor.serial !== serial) return;
    actor.navigation = null; actor.justEntered = false;
    actor.lastZone = seat.zone;
    finishAtStation(actor); queueTraffic();
  }
  async function settle(actor, seat, urgent = false) {
    const serial = cancelAction(actor);
    actor.target = seat;
    actor.spec = Scene.activitySpec(actor.session);
    if (actor.spec.stale && !actor.entryPending) { finishAtStation(actor); return; }
    const navigation = actor.navigation = { kind: actor.entryPending ? 'entry' : 'station', target: seat };
    if (actor.entryPending && !actor.helper) {
      actor.stagedEntry = true;
      placeOutside(actor, ENTRY_POINT);
    }
    actor.justEntered = false;
    if (!await move(actor, seat, serial, ['reading', 'searching'].includes(actor.session.activity))) return;
    if (actor.serial !== serial || actors.get(actor.id) !== actor) return;
    if (actor.navigation === navigation) actor.navigation = null;
    actor.entranceActive = false;
    updateEntranceLane();
    finishAtStation(actor);
    actualArrival(actor, seat, serial, navigation.kind);
    const phrase = { library: '找找这里的线索', board: '把思路理一理', desk: '开始动手', bench: '看看运行结果', front: '需要你看一下', sofa: '等下一项工作' }[seat.zone];
    if (phrase && actor.lastZone !== seat.zone) say(actor, phrase, actor.session.activity === 'waiting-user' ? 4500 : 1900);
    actor.lastZone = seat.zone;
    if (Scene.distance(actor.target, seat) > .0005) requestStation(actor, actor.target);
    queueNavigation(); queueTraffic();
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
  // A turn boundary is the only evidence here; the sparkle never claims success.
  function turnSparkles(point) {
    if (quietSprites()) return;
    const x = point.x * 12.8, y = point.y * 7.2 - 120;
    [[-24, 34], [-9, 46], [10, 40], [25, 30]].forEach(([dx, rise], index) => {
      const spark = element('span', 'scene-effect turn-spark', '✦');
      $('effects').append(spark);
      const motion = spark.animate([
        { transform: `translate(${x + dx * .4}px,${y}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x + dx * .8}px,${y - rise * .45}px) scale(1)`, opacity: 1, offset: .35 },
        { transform: `translate(${x + dx}px,${y - rise}px) scale(.7)`, opacity: 0 }
      ], { duration: 700, delay: 140 + index * 60, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' });
      motion.finished.catch(() => {}).finally(() => spark.remove());
    });
  }
  const BODY_CUES = Object.freeze({
    hop: { duration: 640, frames: [
      { transform: 'translateY(0px) scale(1,1)', easing: 'cubic-bezier(.23,1,.32,1)' },
      { transform: 'translateY(0px) scale(1.04,.94)', offset: .15, easing: 'cubic-bezier(.23,1,.32,1)' },
      { transform: 'translateY(-6px) scale(.97,1.04)', offset: .45, easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translateY(0px) scale(1.04,.95)', offset: .75, easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translateY(0px) scale(1,1)' }] },
    startle: { duration: 300, frames: [
      { transform: 'translate(0px,0px)', easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translate(-1.5px,-1px)', offset: .2, easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translate(1.5px,0px)', offset: .45, easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translate(-1px,0px)', offset: .7, easing: 'cubic-bezier(.37,0,.63,1)' },
      { transform: 'translate(0px,0px)' }] }
  });
  function leanFrames(direction) {
    const lean = `rotate(${Math.sign(direction) * 2}deg)`;
    return [{ transform: 'rotate(0deg)', easing: 'cubic-bezier(.37,0,.63,1)' }, { transform: lean, offset: .25 },
      { transform: lean, offset: .7, easing: 'cubic-bezier(.37,0,.63,1)' }, { transform: 'rotate(0deg)' }];
  }
  // Body cues add onto whatever the body is doing and own no route or clock.
  function bodyCue(actor, kind, direction = 0) {
    if (quietSprites() || !actor?.body?.animate || actor.departing || actors.get(actor.id) !== actor) return;
    const cue = kind === 'glance' ? direction && { duration: 1200, frames: leanFrames(direction) } : BODY_CUES[kind];
    if (!cue) return;
    actor.bodyCue?.cancel();
    const motion = actor.body.animate(cue.frames, { duration: cue.duration, composite: 'add' });
    actor.bodyCue = motion;
    motion.finished.catch(() => {}).finally(() => { if (actor.bodyCue === motion) actor.bodyCue = null; });
    requestAnimationFrame(() => {
      if (actor.bodyCue === motion && kind !== 'hop') actor.performance?.cue?.(kind, { direction });
    });
  }
  function parentGlance(parent, child, toward) {
    if (!parent || parent === child || parent.motion) return;
    const dx = (toward ?? currentPosition(child)).x - currentPosition(parent).x;
    if (Math.abs(dx) >= .5) bodyCue(parent, 'glance', dx);
  }
  async function enterClone(actor, seat) {
    const serial = cancelAction(actor);
    actor.target = seat;
    const parent = cloneAncestor(actor);
    actor.node.dataset.cloneOrigin = parent ? parent.id : '';
    const navigation = actor.navigation = { kind: 'entry', target: seat, parentId: parent?.id };
    placeOutside(actor, parent ? currentPosition(parent) : seat);
    actor.node.style.zIndex = '10';
    actor.stagedEntry = actor.entryPending;
    clonePhase(actor, 'splitting');
    text(actor.state, '分身出现');
    setPose(actor, 'clawd-static-base.svg');
    if (!await move(actor, seat, serial)) return;
    if (actor.serial !== serial) return;
    actor.justEntered = false;
    if (actor.navigation === navigation) actor.navigation = null;
    clonePhase(actor, 'working');
    actor.lastZone = seat.zone;
    finishAtStation(actor);
    actualArrival(actor, seat, serial, 'entry');
    if (Scene.distance(actor.target, seat) > .0005) requestStation(actor, actor.target);
    queueNavigation(); queueTraffic();
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
    queueNavigation(); queueTraffic();
  }
  async function returnClone(actor, reason) {
    if (actor.departing) return;
    const serial = cancelAction(actor);
    actor.departing = true; actor.returnReason = reason;
    clonePhase(actor, 'returning');
    const parent = cloneAncestor(actor);
    const navigation = actor.navigation = { kind: 'return', reason, target: parent ? currentPosition(parent) : currentPosition(actor), parentId: parent?.id };
    actor.node.dataset.cloneTarget = parent ? parent.id : '';
    actor.node.dataset.cloneReason = reason;
    text(actor.state, completedCloneReturn(reason) ? '结束分身' : '分身暂歇');
    setPose(actor, 'clawd-static-base.svg');
    if (parent) {
      // A physical docking target stays still for this finite return; its
      // latest observed functional destination remains queued afterwards.
      if (parent.motion || parent.navigation?.kind === 'station') {
        const destination = parent.target;
        cancelAction(parent); parent.target = destination;
        requestStation(parent, destination, true);
      }
      navigation.target = currentPosition(parent);
      if (!await move(actor, navigation.target, serial)) return;
    } else if (!quietSprites() && !await delay(actor, 220, serial)) return;
    if (actor.serial !== serial || destroyed) return;
    if (parent) actualArrival(actor, { ...navigation.target, zone: parent.target.zone || 'lobby' }, serial, 'return');
    clonePhase(actor, 'absorbing');
    actor.navigation = { ...navigation, kind: 'absorb' };
    const effect = cloneEffect(actor, parent || actor, 'absorb');
    parentGlance(parent, actor);
    if (!quietSprites() && effect) {
      await effect.ready;
      if (actor.serial !== serial || actors.get(actor.id) !== actor || destroyed) return;
      const faded = await Promise.all([effect.finished, fadeBody(actor, 0)]);
      if (!faded[1]) return;
    }
    if (actor.serial !== serial || actors.get(actor.id) !== actor || destroyed) return;
    finishCloneReturn(actor, parent, reason);
  }
  function settleQuietCloneEffects(actor) {
    if (!quietSprites()) return;
    for (const effect of actor.cloneEffects) effect.cancel();
    actor.cloneEffects.clear();
    if (actor.clonePhase === 'absorbing' && actor.navigation?.kind === 'absorb') {
      const parent = actors.get(actor.navigation.parentId) || cloneAncestor(actor);
      finishCloneReturn(actor, parent, actor.navigation.reason || actor.returnReason);
    } else if (actor.opacityMotion && !actor.departing) fadeBody(actor, 1);
  }
  async function depart(actor, inactive = false) {
    if (actor.departing) return;
    if (actor.entryPending) { removeActor(actor.id); return; }
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
    if (relatedClones(actor).length || currentPage.visible.some(session => cloneLedger.parentChain(session.id).includes(actor.id))) { holdForClones(actor); return; }
    const proof = currentPage.exitProof;
    if (actor.holdingFamily && !currentPage.exitOwnerIds?.includes(actor.id)) { queueLayoutRefresh(true); return; }
    if (currentPage.exitOwnerIds?.includes(actor.id)
      && (!proof || !proof.removedIds.includes(actor.id) || Math.abs(proof.scale - uniformScale) > .00001)) return;
    actor.holdingFamily = false; actor.node.dataset.cloneHold = 'false';
    const serial = cancelAction(actor); actor.departing = true;
    actor.navigation = { kind: 'exit', inactive, target: ENTRY_POINT };
    text(actor.state, inactive ? '这一轮已歇下' : '会话已结束');
    if (actor.entryPending) { removeActor(actor.id); return; }
    if (!await move(actor, ENTRY_POINT, serial)) return;
    if (actor.serial !== serial || actors.get(actor.id) !== actor || destroyed) return;
    actualArrival(actor, ENTRY_POINT, serial, 'exit');
    openDoor();
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
    body.style.setProperty('--avatar-presentation-scale', String(window.OfficeSizeStability.PRESENTATION_SCALE * window.OfficeSizeStability.bodyRatio(session)));
    const image = element('img');
    image.alt = '';
    image.draggable = false;
    body.append(image);
    const { plate, title, relation, provider, state } = createActorPlate(session);
    const mark = element('span', 'actor-mark', '!');
    mark.setAttribute('aria-hidden', 'true');
    const bubble = element('span', 'actor-bubble');
    bubble.setAttribute('aria-hidden', 'true');
    const carry = element('span', 'actor-prop', '≡');
    carry.setAttribute('aria-hidden', 'true');
    button.append(body, plate, mark, bubble);
    node.append(shadow, arrival, carry, button);
    actorsLayer.append(node);
    const helper = Boolean(session.parentId);
    node.dataset.bodyRatio = String(window.OfficeSizeStability.bodyRatio(session));
    const actor = { id: session.id, session, spec: Scene.activitySpec(session), node, button, body, image, title, relation, provider, state, bubble, carry, arrival, position: { ...ENTRY_POINT }, target: seat, helper, serial: 0, delays: new Set(), cloneEffects: new Set(), clonePhase: helper ? 'working' : '', motion: null, lastTurnAt: Scene.timestamp(session.turnCompletedAt), arrivedAt: -10000, lastZone: '', currentAsset: '', wantedAsset: '', bubbleTimer: 0, defer: 0, justEntered: true, completing: false, departing: false, holdingFamily: false, retireRequested: null, entryPending: true, navigation: null, pendingStation: null, resumeNavigation: null };
    actor.presentationReentry = presentationReentries.get(session.id) || null;
    presentationReentries.delete(session.id);
    node.style.visibility = 'hidden'; node.style.opacity = '1';
    node.dataset.clonePhase = actor.clonePhase;
    actor.design = companionFor(session);
    node.dataset.bodyDesign = actor.design?.id || 'original';
    node.dataset.bodyAppearance = actor.design?.appearanceKey || actor.design?.id || 'original';
    node.dataset.bodyVariant = String(actor.design?.variantIndex || 0);
    actor.performance = window.OfficeAvatarPerformance.create({ actorNode: node, body, image, session, clockRegistry: performanceClocks, design: actor.design });
    actor.appearance = window.OfficeFamilyAppearance.create({ actorNode: node, body, image });
    node.style.transform = actorTransform(actor.position, actor.helper);
    node.style.zIndex = '10';
    image.addEventListener('error', () => {
      if (destroyed || actors.get(actor.id) !== actor) return;
      // Workshop sheets have a local, single-frame fallback owned by their
      // renderer. Swapping in a legacy sheet would corrupt its 3×2 crop.
      if (actor.design?.renderer === 'creature') { image.hidden = true; return; }
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
        if (recovering) body.querySelector('.ap-rig defs image')?.setAttribute('href', assetURL(actor.design?.asset || window.OfficeAvatarPerformanceModel.ASSET, true));
      }
    });
    button.addEventListener('click', () => selectSession(actor.id));
    button.addEventListener('dblclick', () => react(actor));
    button.addEventListener('keydown', (event) => { if (event.key === ' ' && event.shiftKey) { event.preventDefault(); react(actor); } });
    updateActorLabel(actor);
    actor.fallback = actor.design?.renderer === 'creature' ? null : window.OfficeAvatarFallback?.create({ actorNode: node, body, image });
    actors.set(session.id, actor);
    observedIds.add(actor.id);
    setPose(actor, actor.spec.asset);
    updateEntranceLane(); queueTraffic();
    return actor;
  }
  function lifecycleCaption(actor) {
    if (actor.holdingFamily) return '等分身归位';
    if (actor.clonePhase === 'splitting') return '分身出现';
    if (['returning', 'absorbing'].includes(actor.clonePhase)) {
      const navigation = [actor.navigation, actor.resumeNavigation].find(owner => ['return', 'absorb'].includes(owner?.kind));
      return completedCloneReturn(navigation?.reason || actor.returnReason) ? '结束分身' : '分身暂歇';
    }
    if (!actor.helper) {
      const exit = [actor.navigation, actor.resumeNavigation].find(owner => owner?.kind === 'exit') || actor.retireRequested;
      if (exit) return exit.inactive ? '这一轮已歇下' : '会话已结束';
    }
    return '';
  }
  function companionRoot(session) {
    const knownRoot = cloneLedger.rootFor(session.id);
    if (knownRoot) return knownRoot;
    // Even before a parent is observed, its reported identity anchors all of
    // its helpers. Retain that evidence across incomplete metadata snapshots.
    const chain = cloneLedger.parentChain(session.id), missingAncestor = chain[chain.length - 1];
    if (missingAncestor && !familyGraph.byId.has(missingAncestor)) return missingAncestor;
    return window.OfficeAgentAppearance?.resolveRoot(session, { sessions: familyGraph.byId })
      || familyGraph.info.get(session.id)?.rootId || session.id;
  }
  function companionFor(session) {
    const design = companionRegistry ? companionRegistry.forRoot(companionRoot(session))
      : window.OfficeAgentAppearance?.forSession(session, { sessions: familyGraph.byId, mode: settings.agentAppearance }) || null;
    return window.OfficePublicArtwork ? window.OfficePublicArtwork.design(design) : design;
  }
  function syncActorDesign(actor) {
    const design = companionFor(actor.session);
    if ((actor.design?.appearanceKey || actor.design?.id || 'original') === (design?.appearanceKey || design?.id || 'original')) return;
    const changedFormat = actor.design?.renderer !== design?.renderer;
    const changedAsset = actor.design?.asset !== design?.asset;
    // Keep the actual actor, position and accumulated work clocks. A switch
    // between artwork formats changes only its internal presentation rig.
    actor.fallback?.destroy(); actor.fallback = null;
    actor.design = design;
    actor.node.dataset.bodyDesign = design?.id || 'original';
    actor.node.dataset.bodyAppearance = design?.appearanceKey || design?.id || 'original';
    actor.node.dataset.bodyVariant = String(design?.variantIndex || 0);
    actor.performance?.setDesign(design);
    if (changedFormat && actor.appearance) {
      actor.appearance.destroy();
      actor.appearance = window.OfficeFamilyAppearance.create({ actorNode: actor.node, body: actor.body, image: actor.image });
    }
    if (changedFormat || changedAsset) actor.currentAsset = '';
    setPose(actor, actor.wantedAsset || actor.spec.asset);
    actor.fallback = design?.renderer === 'creature' ? null : window.OfficeAvatarFallback?.create({ actorNode: actor.node, body: actor.body, image: actor.image });
  }
  function updateActorLabel(actor) {
    const session = actor.session;
    syncActorDesign(actor);
    const spec = Scene.activitySpec(session);
    actor.node.dataset.helper = String(Boolean(session.parentId));
    actor.node.dataset.attention = String(Scene.needsAttention(session));
    actor.node.dataset.error = String(session.activity === 'error');
    actor.node.dataset.stale = String(Boolean(spec.stale));
    actor.node.dataset.selected = String(session.id === selectedSession);
    actor.provider.dataset.provider = String(session.provider).toLowerCase();
    actor.title.textContent = displayName(session);
    actor.title.title = actor.title.textContent;
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
    actor.relation.textContent = nameplateRelation(session, parent, office.dataset.nameplateMode || 'full');
    const fullRelation = nameplateRelation(session, parent);
    actor.relation.title = fullRelation + (session.parentId ? '' : ' · ' + I18n.t(language, 'family.clonesHint'));
    text(actor.provider, session.provider === 'claude-code' ? 'Claude' : Scene.providerName(session.provider));
    const lifecycle = lifecycleCaption(actor);
    if (lifecycle) text(actor.state, lifecycle);
    else if (actor.motion && !actor.departing) text(actor.state, Director.plan(session, { now: Date.now(), language }).label || spec.label);
    else if (!actor.motion && !actor.yielding && !trafficWaiters.has(actor.id) && !actor.completing && !actor.departing && !cloneBusy(actor)) text(actor.state, spec.label);
    if (actor.yielding) transitCaption(actor, true);
    if (trafficWaiters.has(actor.id)) transitCaption(actor);
    actor.button.setAttribute('aria-label', displayName(session) + ' · ' + Scene.providerName(session.provider) + ' · ' + String(session.title || tr('未命名任务')) + ' · ' + fullRelation + '，' + tr(spec.label) + '。' + tr('单击查看详情，双击打招呼。'));
    actor.button.setAttribute('aria-pressed', String(session.id === selectedSession));
  }
  async function react(actor) {
    if (actor.entryPending || actor.navigation || actor.motion || actor.departing || actor.spec.stale || cloneBusy(actor) || actor.holdingFamily) return;
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
      if (actor.design?.renderer === 'creature') actor.performance?.cue?.('wave');
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
    const releasedSlot = currentPage.seats?.has(id);
    cancelAction(actor, { dispose: true });
    clearTimeout(actor.bubbleTimer);
    actor.fallback?.destroy();
    if (actor.performance) { actor.performance.update(actor.session, { now: Date.now(), hidden: true }); actor.performance.destroy(); }
    if (actor.appearance) actor.appearance.destroy();
    actor.node.remove();
    actors.delete(id);
    updateEntranceLane();
    renderHelperLinks();
    if (selectedSession === id) closeInspector();
    refreshQuietPresentation();
    if (releasedSlot) queueLayoutRefresh(true);
    if (actor.helper) queueDeferredResize();
  }
  function refreshQuietPresentation() {
    // Keep navigation available when a different room still has observed work.
    // Departing actors retain their scene until they actually reach the door.
    const quiet = snapshot.mode === 'live' && attendance.present.length === 0 && actors.size === 0;
    office.dataset.quiet = String(quiet);
    $('empty-state').hidden = !quiet;
    if (quiet && selectedSession) closeInspector();
    visitor.tick();
  }
  function clearActors({ readmission = false } = {}) {
    if (!readmission) presentationReentries.clear();
    else {
      const currentIds = new Set(snapshot.sessions.filter(session => !Scene.isClosed(session)).map(session => session.id));
      for (const id of presentationReentries.keys()) if (!currentIds.has(id)) presentationReentries.delete(id);
      for (const actor of actors.values()) {
        if (currentIds.has(actor.id) && (!actor.entryPending || actor.presentationReentry)) {
          const { activity, status, turnId } = actor.session;
          presentationReentries.set(actor.id, actor.presentationReentry || { activity, status, turnId });
        }
      }
    }
    revokeTransfer('clear', null, false);
    const wasClearing = clearingActors;
    clearingActors = true; layoutRefreshOwner = null; layoutRefreshRequested = false;
    try { for (const id of [...actors.keys()]) removeActor(id); }
    finally { clearingActors = wasClearing; }
    seats = new Map();
    traffic.clear();
    $('helper-links').replaceChildren();
    for (const effect of $('effects').children) effect.getAnimations().forEach((animation) => animation.cancel());
    $('effects').replaceChildren();
  }
  function queueAdmission() {
    if (admissionFrame || destroyed || !fitting) return;
    admissionFrame = requestAnimationFrame(admitBodies);
  }
  function admitBodies() {
    admissionFrame = 0;
    if (destroyed) return;
    const cast = [...actors.values()].map(actor => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(actor.node).transform);
      const scale = Math.hypot(matrix.m11, matrix.m12);
      return { scale };
    });
    // A newcomer uses the destination scale. Keep its finite arrival at that
    // same scale as everyone else; do not expose a smaller body halfway through
    // an older body's fit transition merely because the envelopes already clear.
    // Chromium serializes matrix() with limited significant digits: a scale
    // above 1 can round by 0.000005. Exact string equality would strand a new
    // body forever even after its transition has completely finished.
    const sameScale = cast.every(item => Math.abs(item.scale - uniformScale) <= .00001);
    if (sameScale) { fitting = false; if (layoutRefreshRequested) queueLayoutRefresh(); else resumeNavigation(); }
    else queueAdmission();
  }
  function hasBodyActivity(session) {
    // Unknown activity is a valid live body, even without a classified tool.
    // Do not use the narrower work-statistics predicate as a visibility gate.
    return !Scene.isClosed(session) && !session.disconnected && session.status !== 'stale'
      && (Clones.isActive(session) || ['active', 'waiting'].includes(session.status) && session.activity !== 'idle');
  }
  function refreshActorSession(actor, session) {
    actor.session = session;
    actor.spec = Scene.activitySpec(session);
    actor.helper = Boolean(session.parentId);
    const ratio = String(window.OfficeSizeStability.bodyRatio(session));
    if (actor.node.dataset.bodyRatio !== ratio) {
      actor.node.dataset.bodyRatio = ratio;
      actor.body?.style.setProperty('--avatar-presentation-scale', String(window.OfficeSizeStability.PRESENTATION_SCALE * Number(ratio)));
    }
  }
  function reconcileActors() {
    const sessionMap = new Map(snapshot.sessions.map(session => [session.id, session]));
    const visibleIds = new Set(currentPage.visible.map(session => session.id));
    const nextSeats = currentPage.seats;
    const scaleChanged = Math.abs(uniformScale - currentPage.uniformScale) > .000001;
    if (scaleChanged) { cancelPhysicalRoutes(); fitting = true; }
    uniformScale = currentPage.uniformScale;
    // Snapshot reconciliation never writes a desired station into a physical
    // foot point. Only a completed/interrupted real walk owns that coordinate.
    if (scaleChanged) for (const actor of actors.values()) actor.node.style.transform = actorTransform(actor.position, actor.helper);
    for (const actor of [...actors.values()]) if (!visibleIds.has(actor.id)) {
      const next = sessionMap.get(actor.id);
      refreshActorSession(actor, next || actor.session);
      // A retained real ancestor still shows current ledger facts and language.
      // Refresh only its label; its physical holding/exit owner is unchanged.
      updateActorLabel(actor);
      const newDescendant = !actor.helper && actor.departing && currentPage.visible.some(session => cloneLedger.parentChain(session.id).includes(actor.id));
      if (newDescendant) {
        // A late real descendant extends the visual ancestor anchor; it does
        // not reopen the ended AI session. Stop its exit at the actual foot
        // and walk to a safe holding dock before the new split starts.
        actor.departing = false; holdForClones(actor);
        moveHolding(actor, nextSeats.get(actor.id) || actor.target).catch(showError);
        continue;
      }
      depart(actor, !Scene.isClosed(actor.session)).catch(showError);
    }
    const admissionOrder = new Map();
    for (const move of currentPage.scheduledProof?.entry.moves || []) {
      if (!admissionOrder.has(move.id)) admissionOrder.set(move.id, admissionOrder.size);
    }
    // Preserve the proved entry order when a near seat would block a farther
    // newcomer. Actual Traffic still owns and validates each physical leg.
    for (const session of currentPage.visible.slice().sort((a,b) => cloneLedger.parentChain(a.id).length - cloneLedger.parentChain(b.id).length
      || (admissionOrder.get(a.id) ?? currentPage.visible.length) - (admissionOrder.get(b.id) ?? currentPage.visible.length))) {
      if (restedClones.has(session.id) && !hasBodyActivity(session)) continue;
      const seat = nextSeats.get(session.id);
      if (!seat) throw new Error('全员布局缺少角色席位：' + session.id);
      let actor = actors.get(session.id);
      if (!actor) { makeActor(session, seat); continue; }
      const old = actor.session, previousTurn = actor.lastTurnAt;
      refreshActorSession(actor, session);
      resumeActiveActor(actor);
      actor.target = seat;
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
          if (!actor.motion) { bodyCue(actor, 'hop'); turnSparkles(actor.position); }
        }
        if (old.activity !== session.activity) social?.update();
        if (!actor.departing && actor.node.dataset.reaction !== 'true') finishAtStation(actor);
        if (old.activity !== 'error' && session.activity === 'error' && !actor.motion) bodyCue(actor, 'startle');
        requestStation(actor, seat, Boolean(endpointParent(actor)));
      }
    }
    seats = nextSeats; reflowPending = false;
    office.dataset.layout = currentPage.layoutMode;
    office.dataset.flat = 'true';
    office.dataset.fitScale = uniformScale.toFixed(4);
    queueAdmission(); if (!fitting) resumeNavigation(); queueNavigation(); queueTraffic(); updateEntranceLane();
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
    if (propsPending || destroyed) return;
    propsPending = true;
    queueMicrotask(() => {
      propsPending = false;
      if (destroyed) return;
      const activeZones = new Set();
      for (const actor of actors.values()) if (!actor.entryPending && !actor.motion && !actor.departing && !actor.holdingFamily && !actor.spec.stale) activeZones.add(actor.lastZone || actor.spec.zone);
      for (const prop of world.querySelectorAll('[data-zone-prop]')) {
        const active = String(activeZones.has(prop.dataset.zoneProp));
        if (prop.dataset.active !== active) prop.dataset.active = active;
      }
      for (const label of world.querySelectorAll('[data-zone-label]')) {
        const active = String(activeZones.has(label.dataset.zoneLabel));
        if (label.dataset.active !== active) label.dataset.active = active;
      }
      const archive = $('archive-stack'), count = String(archiveCount());
      if (archive.dataset.count !== count) archive.dataset.count = count;
    });
  }
  function closeInspector({ restoreFocus = true } = {}) {
    const hadFocus = $('inspector').contains(document.activeElement);
    const previous = inspectorReturnFocus;
    selectedSession = '';
    $('inspector').hidden = true;
    inspectorReturnFocus = null;
    for (const actor of actors.values()) updateActorLabel(actor);
    renderHelperLinks();
    if (!restoreFocus || !hadFocus) return;
    const preferred = previous?.node?.isConnected ? previous.node : actors.get(previous?.id)?.button;
    const target = preferred && !preferred.disabled && preferred.getClientRects().length ? preferred : !$('roster-button').hidden ? $('roster-button') : $('settings-button');
    target.focus({ preventScroll: true });
  }
  function selectSession(id, { returnFocus } = {}) {
    const session = snapshot.sessions.find((item) => item.id === id);
    if (!session) return;
    if (!$('inspector').contains(document.activeElement)) {
      const active = returnFocus || document.activeElement;
      inspectorReturnFocus = { node: active && active !== document.body ? active : actors.get(id)?.button, id };
    }
    selectedSession = id;
    $('inspector').hidden = false;
    for (const actor of actors.values()) updateActorLabel(actor);
    renderInspector();
    renderHelperLinks();
    $('inspector').focus({ preventScroll: true });
  }
  function renderInspector() {
    if (!selectedSession || $('inspector').hidden) return;
    const session = snapshot.sessions.find((item) => item.id === selectedSession);
    if (!session) { closeInspector(); return; }
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
    text($('inspect-title'), session.title || tr('未命名任务'));
    const makingRoom = actor && (actor.yielding || actor.node?.dataset.traffic === 'queued');
    text($('inspect-location'), attendance.retired.includes(session.id) || restedClones.has(session.id) ? spec.stale ? '信号中断 · 保留在名单' : session.parentId ? '分身暂歇' : '门外休息'
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
    text($('inspect-action-note'), Scene.needsAttention(session) ? '请回到 ' + Scene.providerName(session.provider) + ' 回答或处理审批。' : spec.stale ? '身份和末次状态已保留；信号中断不代表任务结束。' : '此按钮打开 Finder。任务与对话请回到原工具查看。');
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
    const sessions = snapshot.sessions.filter((session) => !Scene.isClosed(session) && Scene.inRoom(session, selectedProject));
    const query = $('roster-search').value.trim().toLocaleLowerCase(language);
    const attentionOnly = $('roster-attention').getAttribute('aria-pressed') === 'true';
    const visible = Family.build(sessions).ordered.filter(session => {
      if (attentionOnly && !Scene.needsAttention(session)) return false;
      const parent = familyGraph.byId.get(session.parentId);
      return !query || [displayName(session), session.title, Scene.providerName(session.provider), session.provider, session.projectPath,
        session.sessionId, session.id, session.subagentId, parent && displayName(parent)].filter(Boolean).join(' ').toLocaleLowerCase(language).includes(query);
    });
    const count = language === 'en' ? `${visible.length} of ${sessions.length} agents` : `${visible.length} / ${sessions.length} 位伙伴`;
    if ($('roster-count').textContent !== count) $('roster-count').textContent = count;
    $('roster-reset').hidden = !query && !attentionOnly;
    $('roster-empty').hidden = visible.length > 0;
    const emptyCopy = language === 'en' ? 'No matching agents. Try another name, task, tool or project.' : '没有找到伙伴，试试其他昵称、任务、工具或项目。';
    if ($('roster-empty').textContent !== emptyCopy) $('roster-empty').textContent = emptyCopy;
    // Snapshot heartbeats must not replace a focused row or reset its scroll.
    const renderKey = JSON.stringify([language, selectedSession, visible.map(session => [session.id, displayName(session), session.title, session.parentId,
      session.provider, session.activity, session.status, session.disconnected, Scene.needsAttention(session), attendance.retired.includes(session.id),
      restedClones.has(session.id), cloneSummary(session), paletteRegistry.forRoot(cloneLedger.rootFor(session.id) || familyGraph.info.get(session.id)?.rootId || session.id).color,
      session.parentId && displayName(familyGraph.byId.get(session.parentId) || session)])]);
    if (rosterRenderKey === renderKey) return;
    rosterRenderKey = renderKey;
    const list = $('roster-list');
    const focused = document.activeElement.closest?.('.roster-row');
    const focusedId = focused?.dataset.sessionId;
    const focusedIndex = focused ? [...list.children].indexOf(focused) : -1;
    const scrollTop = list.scrollTop;
    const fragment = document.createDocumentFragment();
    for (const session of visible) {
      const spec = Scene.activitySpec(session);
      const row = element('button', 'roster-row');
      row.type = 'button';
      row.dataset.sessionId = session.id;
      row.dataset.selected = String(session.id === selectedSession);
      row.setAttribute('aria-pressed', String(session.id === selectedSession));
      row.dataset.attention = String(Scene.needsAttention(session));
      const family = familyGraph.info.get(session.id);
      row.style.setProperty('--family-color', paletteRegistry.forRoot(cloneLedger.rootFor(session.id) || family?.rootId || session.id).color);
      row.style.marginLeft = '0px';
      const copy = element('span', 'roster-copy');
      copy.append(element('strong', '', displayName(session)), element('span', 'roster-task', session.title || tr('未命名任务')));
      const parent = familyGraph.byId.get(session.parentId);
      if (parent) { const relation = element('span','roster-relation'); relation.textContent = '↳ ' + I18n.t(language,'identity.parent',{name:displayName(parent)}); copy.append(relation); }
      else if (!session.parentId) { const relation = element('span','roster-relation'); relation.textContent = cloneSummary(session); relation.title = I18n.t(language, 'family.clonesHint'); copy.append(relation); }
      row.append(copy, element('span', 'roster-state', (attendance.retired.includes(session.id) || restedClones.has(session.id) ? tr(spec.stale ? '信号中断 · 保留在名单' : session.parentId ? '分身暂歇' : '门外休息') : tr(spec.label)) + ' →'));
      row.addEventListener('click', () => { $('roster-dialog').close(); selectSession(session.id, { returnFocus: $('roster-button') }); });
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    list.scrollTop = scrollTop;
    if (focusedId) {
      const rows = [...list.children];
      (rows.find(row => row.dataset.sessionId === focusedId) || rows[Math.min(focusedIndex, rows.length - 1)] || $('roster-search')).focus({ preventScroll: true });
    }
  }
  function hasFiniteClone() {
    return [...actors.values()].some(actor => actor.helper && ['splitting', 'returning', 'absorbing'].includes(actor.clonePhase));
  }
  // A clone whose work just ended must walk back before a readmission
  // rebuilds the room; a rebuilt idle clone would never receive a body.
  function cloneAwaitingReturn() {
    const current = new Map(snapshot.sessions.map(session => [session.id, session]));
    return [...actors.values()].some(actor => actor.helper && !actor.departing && !actor.entryPending
      && (!current.has(actor.id) || !hasBodyActivity(current.get(actor.id))));
  }
  let deferredResizeQueued = false;
  function queueDeferredResize() {
    if (deferredResizeQueued || deferredPhysicalScale === null || destroyed || clearingActors) return;
    deferredResizeQueued = true;
    queueMicrotask(() => {
      deferredResizeQueued = false;
      if (!destroyed && !clearingActors && deferredPhysicalScale !== null && !hasFiniteClone()) render();
    });
  }
  function render() {
    if (deferredPhysicalScale !== null && !hasFiniteClone() && !cloneAwaitingReturn()) {
      deferredPhysicalScale = null;
      cancelPhysicalRoutes();
      clearActors({ readmission: true });
      reflowPending = true;
    }
    office.dataset.sizePending = String(deferredPhysicalScale !== null);
    office.dataset.mode = snapshot.mode;
    cloneLedger.update(snapshot.sessions, Date.now());
    // A pruned provider record may return without its optional parent field.
    // Restore only the ledger's already observed link in a local view copy so
    // layout, size, labels and clone routing agree without changing the source.
    const familySessions = cloneLedger.presentationSessions?.(snapshot.sessions);
    if (familySessions && familySessions !== snapshot.sessions) snapshot = { ...snapshot, sessions: familySessions };
    for (const session of snapshot.sessions) if (hasBodyActivity(session)) restedClones.delete(session.id);
    attendance = attendanceModel.update(snapshot.sessions);
    // A lost signal supplies no exit or clone-completion evidence. Unload
    // only the visual body after grace, retaining the exact source/roster row.
    // Remove it before fitting: a stale pinned foot must not shrink live work.
    if (attendance.signalLost?.length) {
      const wasClearing = clearingActors;
      clearingActors = true;
      try {
        for (const id of attendance.signalLost) {
          observedIds.delete(id);
          removeActor(id);
        }
      } finally { clearingActors = wasClearing; }
    }
    familyGraph = Family.build(snapshot.sessions);
    const openFamilies = snapshot.sessions.filter(session => !Scene.isClosed(session))
      .map(session => cloneLedger.rootFor(session.id) || familyGraph.info.get(session.id)?.rootId || session.id);
    paletteRegistry.update(openFamilies);
    familyGraph = Family.build(snapshot.sessions, { registry: paletteRegistry });
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
    const layoutBodies = presentBodies.concat(retiringBodies);
    // Reserve a complete appearance for each real family until its last body
    // leaves. A closed root still walking out must not share its appearance
    // with an arriving main; nested helpers use that same root reservation.
    companionRegistry?.update([...new Set(layoutBodies.concat([...actors.values()].map(actor => actor.session)).map(companionRoot))]);
    // Presentation is decided from observed cast, including actual retirees,
    // before either the real plate or its probe is measured. Never key this
    // mode to a solver's output scale: that would feed font changes back into fit.
    // Count cannot change plate metrics underneath a fixed-size resident.
    office.dataset.nameplateMode = nameplateMode(1);
    measureActorFootprints(layoutBodies);
    currentPage.scaleCeiling = sizeStability.maximum();
    if (transferOwner && !transferValid(transferOwner, layoutBodies)) revokeTransfer('snapshot-or-geometry', null, false);
    if (transferOwner) currentPage = { ...currentPage, visible: presentBodies };
    else {
      const options = sceneOptions(layoutBodies, finiteExitIds(presentBodies));
      try { currentPage = WalkingLayout.layoutFullSizeWalking(layoutBodies, options); }
      catch (error) {
        if (error.code !== 'FIXED_SIZE_CAPACITY') throw error;
        // Keep the user's size and every admitted resident if a transient
        // clone dock or changed floor cannot yet admit a new observation.
        currentPage = WalkingLayout.layoutFixedWalking(layoutBodies, { ...options, fullSize: true });
      }
      currentPage.visible = presentBodies.filter(session => currentPage.seats.has(session.id));
      if (currentPage.transferCertificate && !acceptTransfer(currentPage.transferCertificate, layoutBodies)) {
        // An unequipped/quiet/changed physical cast cannot execute a certificate.
        // Ask for the ordinary proof instead of issuing its two blocked goals.
        currentPage = WalkingLayout.layoutFullSizeWalking(layoutBodies, { ...options, allowTransfers: false });
        currentPage.visible = presentBodies.filter(session => currentPage.seats.has(session.id));
      }
      currentPage.routeGeometry = { paths: currentPage.pathsById, scale: currentPage.uniformScale,
        footprints: new Map([...actorFootprints].map(([id, footprint]) => [id, { ...footprint }])) };
    }
    sizeStability.observe({ count: layoutBodies.length, uniformScale: currentPage.uniformScale, targetUniformScale: currentPage.targetUniformScale });
    currentPage.scaleCeiling = sizeStability.maximum();
    page = 0;
    if (currentPage.entryPoint) ENTRY_POINT = { ...currentPage.entryPoint, zone: 'exit' };
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
    let summary = roomSessions.length ? tr(rootCount + ' 项独立任务') + (helpers ? ' · ' + tr(helpers + ' 位临时帮手') : '') : tr('实时办公室 · 等待任务入驻');
    if (quiet) summary += ' · ' + tr(quiet + ' 项信号暂未更新');
    if (attendance.signalLost?.length) summary += ' · ' + I18n.t(language, 'room.signalLost', { count: attendance.signalLost.length });
    const crowded = roomSessions.length > 0 && uniformScale < .35;
    office.dataset.readability = crowded ? 'crowded' : 'readable';
    if (crowded) summary += ' · ' + I18n.t(language, 'room.crowded', { percent: Math.max(1, Math.round(uniformScale * 100)) });
    if (deferredPhysicalScale !== null) summary += language === 'en' ? ' · size change after clone transition' : ' · 等分身过渡完成后调整大小';
    const waitingForDock = currentPage.overflowIds?.length || 0;
    office.dataset.overflowCount = String(waitingForDock);
    if (waitingForDock) summary += language === 'en' ? ' · ' + waitingForDock + ' awaiting a work dock' : ' · ' + waitingForDock + ' 位等候工位';
    $('room-summary').textContent = summary;
    $('room-summary').dataset.baseSummary = summary;
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
    updateSignalSummary();
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
    venueStage?.update(sceneContext()); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); social?.update(); stationArrival?.update();
  }
  function receive(next) {
    if (!next || !Array.isArray(next.sessions)) return;
    const previouslyHidden = sceneHidden();
    // Native window evidence is independent of AI activity. A retained boolean
    // remains the last confirmed host state if the next native read fails.
    nativeWindowHidden = typeof next.windowVisibility?.hidden === 'boolean' ? next.windowVisibility.hidden : false;
    snapshotReceived += 1;
    snapshot = { ...next, mode: 'live', sessions: next.sessions.filter((session) => session && typeof session.id === 'string'), connections: Array.isArray(next.connections) ? next.connections : [] };
    usageHistory?.updateStatus(snapshot.usageLog);
    homeTokenUsage?.update(snapshot);
    manualQuestions?.update(snapshot);
    setupAssistant?.update(snapshot.setup);
    // Reconcile fresh work before quiet lifecycle cleanup: this packet may
    // revoke the very absorption owner that was active before native hiding.
    render();
    if (previouslyHidden !== sceneHidden()) refreshVisibility();
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
      sizeStability.request(nextScale);
      if (hasFiniteClone()) {
        // Save the requested preference immediately, but let the finite owner
        // finish at its already-proved geometry. A larger body may not fit
        // these feet; it must receive a fresh proof after the real return.
        const heldScale = deferredPhysicalScale ?? uniformScale;
        deferredPhysicalScale = nextScale === heldScale ? null : heldScale;
      } else {
        deferredPhysicalScale = null;
        cancelPhysicalRoutes();
        clearActors({ readmission: true });
        reflowPending = true;
      }
    }
    if (transferOwner && (next?.reducedMotion || next?.lowPower || mediaReduce.matches || sceneHidden())) revokeTransfer('quiet', null, false);
    settings = { ...settingsDefaults, ...next, agentScale: nextScale };
    numberFlip?.sync();
    const previousLanguage = language;
    language = settings.language === 'en' ? 'en' : 'zh';
    applyLanguage();
    appearancePicker?.update({ value: settings.agentAppearance, language, reducedMotion: reduced(), lowPower: settings.lowPower, hidden: nativeWindowHidden });
    office.dataset.rain = String(settings.rain);
    scenery.update(settings, language);
    office.dataset.reducedMotion = String(reduced());
    office.dataset.lowPower = String(settings.lowPower);
    for (const key of ['rain', 'reducedMotion', 'lowPower', 'idleVisitor']) $('setting-' + key).checked = Boolean(settings[key]);
    if (window.OfficeFestivals) $('setting-rain').checked = window.OfficeFestivals.resolve({ theme: settings.sceneTheme, weather: settings.sceneWeather }).weather === 'rain';
    $('setting-sceneTime').value = settings.sceneTime;
    $('setting-agentScale').value = String(Math.round(settings.agentScale * 100));
    text($('agent-scale-value'), Math.round(settings.agentScale * 100) + '%');
    if (reduced() && [...actors.values()].some(actor => actor.motion)) cancelPhysicalRoutes();
    for (const actor of [...actors.values()]) {
      settleQuietCloneEffects(actor);
      if (!actors.has(actor.id)) continue;
      setPose(actor, actor.wantedAsset || actor.spec.asset);
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
    const opening = !dialog.open;
    if (opening) dialog.showModal();
    if (id === 'connections-dialog') renderConnections();
    if (id === 'roster-dialog') {
      renderRoster();
      if (opening) $('roster-search').focus({ preventScroll: true });
    }
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
  $('agent-size-refit').addEventListener('click', () => {
    sizeStability.request(settings.agentScale);
    cancelPhysicalRoutes(); reflowPending = true; render();
    text($('settings-result'), '已按当前大小重新排列。');
  });
  $('day-reset').addEventListener('click', () => { $('setting-sceneTime').focus(); saveSettings({ sceneTime: 'auto' }); });
  $('roster-button').addEventListener('click', () => openDialog('roster-dialog'));
  $('roster-search').addEventListener('input', renderRoster);
  $('roster-search').addEventListener('search', renderRoster);
  $('roster-attention').addEventListener('click', () => {
    $('roster-attention').setAttribute('aria-pressed', String($('roster-attention').getAttribute('aria-pressed') !== 'true'));
    renderRoster();
  });
  $('roster-reset').addEventListener('click', () => {
    $('roster-search').value = '';
    $('roster-attention').setAttribute('aria-pressed', 'false');
    renderRoster();
    $('roster-search').focus({ preventScroll: true });
  });
  $('roster-dialog').addEventListener('cancel', event => {
    if (!$('roster-search').value) return;
    event.preventDefault();
    $('roster-search').value = '';
    renderRoster();
    $('roster-search').focus({ preventScroll: true });
  });
  $('roster-dialog').addEventListener('keydown', event => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = [...$('roster-list').children];
    const index = rows.indexOf(document.activeElement);
    const inSearch = event.target === $('roster-search');
    if ((!inSearch && index < 0) || !rows.length) return;
    let next;
    if (event.key === 'ArrowDown') next = rows[Math.min(index + 1, rows.length - 1)];
    else if (event.key === 'ArrowUp') next = rows[index <= 0 ? rows.length - 1 : index - 1];
    else if (!inSearch && event.key === 'Home') next = rows[0];
    else if (!inSearch && event.key === 'End') next = rows[rows.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  $('greet-agent').addEventListener('click', () => { const actor = actors.get(selectedSession); if (actor) react(actor); });
  $('inspect-helper').addEventListener('click', () => { const id = $('inspect-helper').dataset.parentId; if (id) selectSession(id); });
  $('dismiss-error').addEventListener('click', () => { $('error-message').hidden = true; });
  $('project-select').addEventListener('change', (event) => switchRoom(event.target.value));
  $('all-projects').addEventListener('click', () => switchRoom(Scene.ALL_ROOMS));
  $('other-attention').addEventListener('click', () => jumpAttention(true));
  $('attention-jump').addEventListener('click', () => jumpAttention(false));
  $('page-prev').addEventListener('click', () => { page = Math.max(0, page - 1); selectedSession = ''; $('inspector').hidden = true; clearActors(); render(); });
  $('page-next').addEventListener('click', () => { page = Math.min(currentPage.pages - 1, page + 1); selectedSession = ''; $('inspector').hidden = true; clearActors(); render(); });
  $('close-inspector').addEventListener('click', () => closeInspector());
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
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      openDialog('roster-dialog');
    }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !$('inspector').hidden) { event.preventDefault(); closeInspector(); }
  });
  function refreshVisibility() {
    numberFlip?.sync();
    if (sceneHidden()) revokeTransfer('hidden');
    office.dataset.hidden = String(sceneHidden());
    appearancePicker?.update({ language, reducedMotion: reduced(), lowPower: settings.lowPower, hidden: nativeWindowHidden });
    for (const actor of [...actors.values()]) {
      settleQuietCloneEffects(actor);
      if (actors.has(actor.id)) setPose(actor, actor.wantedAsset || actor.spec.asset);
    }
    renderHelperLinks();
    visitor.tick();
    venueStage?.update(sceneContext()); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); social?.update(); stationArrival?.update();
    if (!sceneHidden()) { scenery.update(settings, language); ensureMotionTicker(); }
  }
  document.addEventListener('visibilitychange', refreshVisibility);
  mediaReduce.addEventListener('change', () => applySettings(settings));
  const observer = new ResizeObserver(refreshScale);
  observer.observe(office);
  window.addEventListener('resize', refreshScale);
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
    if (sceneHidden()) return;
    scenery.update(settings, language);
    festivalStage?.update(sceneContext()); venueStage?.update(sceneContext()); themeEnvironment?.update(sceneContext());
    renderInspector();
    updateSignalSummary();
  }, 12000);
  const secondsTimer = setInterval(() => { if (!sceneHidden()) { scenery.updateClock(settings, language); festivalStage?.update(sceneContext()); themeEnvironment?.update(sceneContext()); venueStage?.refreshArtwork(); social?.tick(); } }, 1000);
  window.addEventListener('beforeunload', () => {
    destroyed = true;
    window.removeEventListener('resize', refreshScale);
    document.removeEventListener('visibilitychange', refreshVisibility);
    appearancePicker?.destroy();
    usageHistory?.dispose();
    numberFlip?.destroy();
    manualQuestions?.dispose();
    setupAssistant?.dispose();
    visitor.destroy();
    office.removeEventListener('office:actor-arrival', onStationArrival);
    stationArrival?.destroy(); social?.destroy(); venueStage?.destroy(); festivalStage?.destroy(); themeEnvironment?.destroy();
    scenery.destroy();
    clearInterval(clockTimer);
    clearInterval(secondsTimer);
    clearTimeout(navigationTimer);
    cancelAnimationFrame(frameTimer);
    cancelAnimationFrame(admissionFrame);
    clearTimeout(trafficTimer);
    clearTrafficBlock();
    clearTimeout(doorTimer);
    clearActors();
    performanceClocks.clear();
    observer.disconnect();
    if (typeof unsubscribe === 'function') unsubscribe();
  });
})();
