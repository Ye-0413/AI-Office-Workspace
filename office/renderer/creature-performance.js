/* Six native-grid poses, discrete material cues, and the existing observation
 * clock. A creature never invents work, completion, or a reminder timer. */
(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('../lib/avatar-performance-model.js') : root.OfficeAvatarPerformanceModel, root.OfficeCreatureActivity, node ? require('./creature-frames.js') : root.OfficeCreatureFrames, node ? require('./creature-emotes.js') : root.OfficeCreatureEmotes);
  if (node) module.exports = api;
  else root.OfficeCreaturePerformance = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Model, Activity, Frames, Emotes) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', CELL = 80, LEFT = 37.5, TOP = 35;
  const POSES = Object.freeze(['idle', 'working', 'thinking', 'resting', 'attention', 'completed']);
  const IDS = new Set(['folio', 'ink', 'moss', 'thread', 'glow']);
  const VARIANT_HUES = Object.freeze([145,250,80,205,315,115,175,235,285,55]);
  const VARIANT_MATERIALS = Object.freeze({ folio: [.8,2.1,1.02], ink: [.18,1.8,1.16], moss: [.25,1.35,1.02], thread: [.18,1.35,1.01], glow: [.16,1.3,1.02] });
  const variantNumber = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function variantPalette(creature, value = 0) {
    const index = variantNumber(value);
    if (!index) return Object.freeze({ index: 0, hue: 0, filter: 'none' });
    const [sepia, saturation, light] = VARIANT_MATERIALS[creature] || VARIANT_MATERIALS.folio;
    const cycle = Math.floor((index - 1) / VARIANT_HUES.length);
    const hue = Number(((VARIANT_HUES[(index - 1) % VARIANT_HUES.length] + cycle * 137.50776405) % 360).toFixed(6));
    const tone = cycle ? .9 + (cycle * .61803398875 % 1) * .2 : 1;
    // The paper needs real chroma before hue rotation; rotating near-white
    // alone would make an overflow family look identical. Fold shading and
    // pixel clusters retain their authored values before the tint.
    return Object.freeze({ index, hue, filter: 'sepia('+sepia+') saturate('+saturation+') hue-rotate('+hue+'deg) brightness('+Number((light*tone).toFixed(6))+')' });
  }
  // Offsets are whole texels in the 2-unit rig grid. Each beat is held.
  const CUES = Object.freeze({
    folio: { greet: [[-2, 0], [0, -6], [2, -2]], attention: [[0, -8], [0, -4]], startle: [[-2, -4], [2, 0]], success: [[0, -6], [2, -2]] },
    ink: { greet: [[-2, 0], [0, -4], [2, 0]], attention: [[0, -6], [0, -2]], startle: [[0, -4], [-2, 0]], success: [[0, -6], [0, -2]] },
    moss: { greet: [[0, -2], [-2, 0], [2, 0]], attention: [[0, -4], [0, -2]], startle: [[-2, -2], [2, 0]], success: [[0, -4], [0, -2]] },
    thread: { greet: [[-2, -6], [0, 0], [2, -4]], attention: [[0, -8], [2, -2]], startle: [[2, -4], [-2, 0]], success: [[-2, -6], [2, -4]] },
    glow: { greet: [[0, -2], [2, -6], [0, -4]], attention: [[0, -6], [0, -8]], startle: [[-2, 0], [0, -4]], success: [[0, -4], [0, -8]] }
  });
  const CUE_DURATION = Object.freeze({ glance: 480, startle: 420, greet: 620, attention: 680, success: 560 });
  let serial = 0;
  function poseFor(session = {}, options = {}) {
    if (session.disconnected || session.status === 'stale' || options.stale) return 'resting';
    if (options.walking || options.reaction) return 'idle';
    if (options.standby) return options.standbyPhase === 'play' ? 'idle' : 'resting';
    if (session.activity === 'error') return 'attention';
    if (session.attention === true || ['waiting-user','waiting-tool'].includes(session.activity)) return 'idle';
    const inactive = session.closed || session.status === 'closed' || session.status === 'idle' || session.activity === 'idle';
    if (inactive && Number.isFinite(session.turnCompletedAt) && session.turnCompletedAt > 0) return 'completed';
    if (session.closed || session.status === 'closed' || options.departing) return 'resting';
    if (session.status === 'idle' || session.activity === 'idle') return 'resting';
    if (['reading', 'searching', 'planning'].includes(session.activity)) return 'thinking';
    if (['coding', 'designing', 'testing', 'building', 'running'].includes(session.activity)) return 'working';
    return 'idle';
  }
  function vectorPreview(options) { return options.preview === true && (options.legacyRepertoire === true || Number.isInteger(options.repertoireIndex)); }
  function sourcePoseFor(session = {}, options = {}, creature) {
    const pose = poseFor(session, options);
    if (vectorPreview(options)) {
      if (creature === 'moss' && session.activity === 'error') return 0;
      if (pose === 'working' || pose === 'thinking' && session.activity !== 'planning') return 0;
    }
    return POSES.indexOf(pose);
  }
  function create({ actorNode, body, image, session = {}, clockRegistry, design } = {}) {
    if (!Model || !actorNode || !body?.ownerDocument) throw new TypeError('A creature needs its existing observed actor and body.');
    const document = body.ownerDocument, view = document.defaultView, id = 'cp-' + (++serial);
    image = image || body.querySelector('img');
    const office = actorNode.closest?.('.office'), media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const registry = clockRegistry || Model.createClockRegistry({ limit: 1 });
    const element = (tag, attrs = {}, parent) => {
      const node = document.createElementNS(NS, tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
      parent?.append(node); return node;
    };
    const layer = document.createElement('span');
    layer.setAttribute('class', 'avatar-performance creature-performance'); layer.setAttribute('aria-hidden', 'true');
    const svg = element('svg', { class: 'ap-rig creature-rig', viewBox: '0 0 154 129', focusable: 'false' });
    layer.append(svg);
    const defs = element('defs', {}, svg);
    const source = element('image', { id: id + '-source', x: LEFT, y: TOP, width: CELL * 3, height: CELL * 2, preserveAspectRatio: 'none' }, defs);
    const cellClip = element('clipPath', { id: id + '-cell' }, defs);
    const cellRect = element('rect', { x: LEFT, y: TOP, width: CELL, height: CELL }, cellClip);
    const motion = element('g', { class: 'cp-motion' }, svg), art = element('g', { class: 'cp-art' }, motion);
    // .cp-pose performs the observed state family with the whole body about
    // its feet; .cp-gesture stays the repertoire's own body track.
    const poseGroup = element('g', { class: 'cp-pose' }, art), gesture = element('g', { class: 'cp-gesture' }, poseGroup);
    const shell = element('g', { class: 'cp-shell' }, gesture), feet = element('g', { class: 'cp-feet' }, gesture);
    const parts = {};
    // Four toe slices are driven by the physical route distance.
    const bodyNow = element('g', { class: 'cp-body cp-body-now', 'clip-path': 'url(#' + cellClip.id + ')' }, shell);
    element('use', { href: '#' + source.id }, bodyNow);
    for (let index = 0; index < 4; index++) {
      const clip = element('clipPath', { id: id + '-foot-' + (index + 1) }, defs);
      element('rect', { x: LEFT + index * CELL / 4, y: TOP + 64, width: CELL / 4, height: 16 }, clip);
      const node = element('g', { class: 'cp-part cp-foot-' + (index + 1), 'clip-path': 'url(#' + cellClip.id + ')' }, feet);
      element('use', { href: '#' + source.id, 'clip-path': 'url(#' + clip.id + ')' }, node);
      parts['foot-' + (index + 1)] = node;
    }
    const frames = Frames?.create?.({ document, pose: poseGroup, creature: design?.id, shell, defs, id });
    const neutral = element('g', { class: 'cp-neutral', 'aria-hidden': 'true' }, motion);
    element('path', { fill: '#293044', d: 'M63 83h28v4h6v6h4v16h-6v6h-8v-4H67v4h-8v-6h-6V93h4v-6h6Z' }, neutral);
    element('path', { fill: '#b4c4aa', d: 'M63 87h28v4h6v16H57V95h4v-4h2Z' }, neutral);
    element('path', { fill: '#758d83', d: 'M57 103h40v4H57Zm4 4h6v4h-6Zm28 0h6v4h-6Z' }, neutral);
    for (const x of [65, 85]) element('rect', { fill: '#293044', x, y: 95, width: 4, height: 6 }, neutral);
    const activity = Activity?.create?.({ document, svg, layer, creature: design?.id, bodyTarget: gesture, bodyParts: parts });
    body.append(layer);
    const originalImageOpacity = image?.style.getPropertyValue('opacity') || '';
    const originalColorFilter = actorNode.style.getPropertyValue('--creature-color-filter');
    const paused = new Map(), cues = new Set(), retiredRoutes = new WeakSet();
    let destroyed = false, identity = '', lease = null, last = null, inherited = {}, currentDesign = null;
    let hidden = false, quiet = false, waiting = false, activityAnimate = false, observedActivity = '', pose = '', frameKey = '', gait = null;
    let activityElapsed = 0;
    let health = 'pending', bitmapHealth = image?.complete && image.naturalWidth > 0 ? 'healthy' : 'pending';
    let failedAt = 0, lastRetry = 0, retrySerial = 0, probeURL = '';
    let eventCursor = null, seenEvents = new Map();
    const emotes = Emotes?.create?.({ document, parent: poseGroup, body: gesture, defs, id,
      canStart: () => !destroyed && !hidden && !quiet && !gait && health === 'healthy' });
    const probe = document.createElement('img');
    const attribute = (node, name, value) => { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const style = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
    // A painted keyframe strip for the observed activity carries its own
    // props, so the vector repertoire stands down for it; without one the
    // repertoire performs as before.
    // An explicit recipe preview (gallery, audits) asks for the vector
    // repertoire itself, so strips stand down there.
    function repertoireActivity(walking, options = inherited) { return observedActivity && !walking && !vectorPreview(options) && frames?.has?.(observedActivity) ? '' : observedActivity; }
    function paintHealth() {
      attribute(body, 'data-rig-health', health); attribute(body, 'data-bitmap-health', bitmapHealth);
      attribute(layer, 'data-art-state', health);
      style(art, 'opacity', health === 'healthy' ? '1' : '0');
      style(neutral, 'opacity', health === 'healthy' ? '0' : '1');
      if (last) {
        if (health !== 'healthy') lease?.sample(last.kind, { visible: false });
        activity?.update?.({ activity: repertoireActivity(Boolean(gait)), attention: Boolean(observedActivity) && session.attention === true, creature: currentDesign.id, identity, elapsed: activityElapsed, animate: activityAnimate, quiet, walking: Boolean(gait), hidden, healthy: health === 'healthy', preview: inherited.preview === true, repertoireIndex: inherited.repertoireIndex, poseIndex: last.poseIndex });
      }
      // A cached image can settle between observation snapshots. If its
      // recovery creates new activity clocks, acquire their hidden lease in
      // this same callback rather than letting them run until the next event.
      emotes?.refresh();
      if (!quiet) {
        if (hidden || health !== 'healthy') pause();
        else resume();
      }
    }
    function sourceLoad() { if (!destroyed) { health = 'healthy'; paintHealth(); } }
    function sourceError() { if (!destroyed) { health = 'failed'; failedAt = Date.now(); paintHealth(); } }
    function bitmapLoad() { if (!destroyed && image.naturalWidth > 0) { bitmapHealth = 'healthy'; paintHealth(); } }
    function bitmapError() { if (!destroyed) { bitmapHealth = 'failed'; paintHealth(); } }
    function probeLoad() { if (!destroyed && probe.src === probeURL && health !== 'healthy') sourceLoad(); }
    function probeError() { if (!destroyed && probe.src === probeURL && health === 'pending') sourceError(); }
    source.addEventListener('load', sourceLoad); source.addEventListener('error', sourceError);
    image?.addEventListener('load', bitmapLoad); image?.addEventListener('error', bitmapError);
    probe.addEventListener('load', probeLoad); probe.addEventListener('error', probeError);
    function probeSource() {
      let url; try { url = new URL(source.getAttribute('href'), document.baseURI || document.URL); } catch (_) { return; }
      if (url.protocol !== 'file:') return;
      probeURL = url.href; probe.src = probeURL;
    }
    function retry(now = Date.now()) {
      if (destroyed || health !== 'failed' || !Number.isFinite(now) || now - failedAt < 3000 || now - lastRetry < 3000) return false;
      let url; try { url = new URL('../assets/avatars/' + currentDesign.asset, document.baseURI || document.URL); } catch (_) { return false; }
      if (url.protocol !== 'file:') return false;
      lastRetry = now; health = 'pending'; paintHealth();
      url.searchParams.set('mini-office-creature-retry', String(++retrySerial)); attribute(source, 'href', url.href); probeSource();
      return true;
    }
    function stopCues() { for (const animation of cues) animation.cancel(); cues.clear(); }
    function ownedAnimations() {
      return (layer.getAnimations?.({ subtree: true }) || []).filter(animation => cues.has(animation)
        || typeof animation.animationName === 'string' && animation.animationName.startsWith('cp-')
        || animation.effect?.target?.closest?.('.cp-activity,.cp-reach,.cp-gesture,.cp-pose') || animation.effect?.target === gesture || animation.effect?.target === poseGroup);
    }
    function observeToolSuccess() {
      const events = (Array.isArray(session.events) ? session.events : []).filter(event => event && typeof event.eventId === 'string' && event.eventId
        && Number.isFinite(event.at) && event.at > 0);
      const latest = Math.max(0, Number.isFinite(session.lastEventAt) ? session.lastEventAt : 0, ...events.map(event => event.at));
      if (eventCursor === null) {
        eventCursor = latest || (Number.isFinite(inherited.now) ? inherited.now : 0);
        seenEvents = new Map(events.slice(-128).map(event => [event.eventId, event.at]));
        return;
      }
      const boundary = eventCursor;
      for (const event of events) {
        if (seenEvents.has(event.eventId) || event.at < boundary) continue;
        // Bounded decoration history can conservatively skip a pathological
        // same-timestamp burst; it never replays an ID forgotten by eviction.
        if (seenEvents.size >= 128 && event.at === boundary) continue;
        seenEvents.set(event.eventId, event.at);
        if (event.event === 'tool-end' && event.outcome === 'success') cue('tool-success');
      }
      eventCursor = Math.max(boundary, latest);
      seenEvents = new Map([...seenEvents].filter(([, at]) => at >= eventCursor).slice(-128));
    }
    function pause() {
      const live = ownedAnimations();
      for (const animation of paused.keys()) if (!live.includes(animation)) paused.delete(animation);
      for (const animation of live) {
        if (paused.has(animation)) continue;
        paused.set(animation, animation.playState);
        // A one-shot pose landing can report finished on the frame it ends;
        // holding it too keeps every owned clock paused, and resume skips it.
        if (animation.playState === 'running' || animation.pending || animation.playState === 'finished') {
          const at = animation.currentTime; animation.pause();
          if (Number.isFinite(at)) animation.currentTime = at;
        }
      }
    }
    function resume() {
      const live = new Set(ownedAnimations());
      for (const [animation, state] of paused) if (state === 'running' && animation.playState === 'paused' && live.has(animation)
        && !gait?.loops.includes(animation)) animation.play();
      paused.clear();
    }
    function frame(index) {
      const key = currentDesign.id + '/' + index;
      if (key === frameKey) return;
      attribute(source, 'x', LEFT - index % 3 * CELL);
      attribute(source, 'y', TOP - Math.floor(index / 3) * CELL);
      attribute(layer, 'data-pose-index', index);
      frameKey = key;
    }
    function setDesign(value) {
      if (destroyed) return false;
      const next = value || currentDesign;
      if (!next || next.renderer !== 'creature') return false;
      const creature = IDS.has(next.id) ? next.id : 'folio', asset = 'workshop-' + creature + '.png';
      const variantIndex = variantNumber(next.variantIndex), appearanceKey = next.appearanceKey || creature + ':' + variantIndex;
      const materialChanged = !currentDesign || creature !== currentDesign.id;
      const assetChanged = !currentDesign || asset !== currentDesign.asset;
      const changed = materialChanged || assetChanged || variantIndex !== currentDesign.variantIndex || appearanceKey !== currentDesign.appearanceKey;
      currentDesign = { ...next, id: creature, asset, variantIndex, appearanceKey };
      if (source.getAttribute('href') !== '../assets/avatars/' + asset && assetChanged) {
        health = 'pending'; bitmapHealth = image?.complete && image.naturalWidth > 0 ? 'healthy' : 'pending';
        attribute(source, 'href', '../assets/avatars/' + asset); paintHealth(); probeSource();
      }
      attribute(layer, 'data-creature', creature); attribute(actorNode, 'data-creature-design', creature);
      attribute(layer, 'data-color-variant', variantIndex); attribute(layer, 'data-appearance-key', appearanceKey);
      style(actorNode, '--creature-color-filter', variantPalette(creature, variantIndex).filter);
      attribute(body, 'data-creature', 'true');
      if (last) frame(last.poseIndex);
      // Changing material may replace only the body's CSS stride name. Keep
      // route distance/phase, but reacquire its current animation objects so a
      // later distance sample cannot revive a removed body's old CSS effect.
      if ((materialChanged || assetChanged) && gait) gait.loops = [];
      if (changed && !quiet && (hidden || health !== 'healthy')) pause();
      return changed;
    }
    function react(kind, direction = 0) {
      const side = Math.sign(direction) || 1;
      const beats = kind === 'glance' ? [[side * 2, 0], [side * 2, 0]] : CUES[currentDesign.id][kind];
      const frames = [[0, 0], ...beats, [0, 0]].map(([x, y]) => ({ transform: 'translate(' + x + 'px,' + y + 'px)', easing: 'step-end' }));
      stopCues();
      const animation = motion.animate(frames, { duration: CUE_DURATION[kind] });
      cues.add(animation); animation.finished.catch(() => {}).finally(() => cues.delete(animation));
      return true;
    }
    function cue(kind, { direction = 0 } = {}) {
      if (destroyed || hidden || quiet || gait || health !== 'healthy' || typeof motion.animate !== 'function') return false;
      if (kind === 'wave') kind = 'greet';
      if (kind === 'tool-success') {
        activity?.cue?.(kind, { direction });
        return emotes?.cue('success') || react('success');
      }
      if (emotes?.cue(kind === 'attention' ? 'startle' : kind, direction)) return true;
      if (activity?.cue?.(kind, { direction })) return true;
      if (!['glance', 'startle', 'greet', 'attention'].includes(kind)) return false;
      return react(kind, direction);
    }
    function stopGait() {
      if (!gait) return;
      if (gait.owner) retiredRoutes.add(gait.owner);
      gait = null;
      delete actorNode.dataset.locomotion; delete actorNode.dataset.locomotionSource; delete actorNode.dataset.locomotionPhase;
    }
    function locomotion(sample, releasedOwner) {
      if (destroyed || !gait || quiet || hidden) return false;
      if (sample === null) {
        if (!releasedOwner || gait.owner !== releasedOwner) return false;
        retiredRoutes.add(releasedOwner); gait.owner = null; return true;
      }
      const owner = sample?.owner, distance = sample?.distanceWorld;
      if (!owner || !['object', 'function'].includes(typeof owner) || retiredRoutes.has(owner)
        || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(sample.speedWorld) || sample.speedWorld < 0) return false;
      if (!gait.loops.length) {
        gait.loops = ownedAnimations().filter(animation => typeof animation.animationName === 'string' && animation.animationName.startsWith('cp-walk-'));
        for (const animation of gait.loops) animation.pause();
      }
      if (gait.owner !== owner) {
        if (gait.owner) retiredRoutes.add(gait.owner);
        gait.owner = owner; gait.lastDistance = distance;
      }
      gait.phase += Math.max(0, distance - gait.lastDistance) * 600 / 192;
      gait.lastDistance = Math.max(gait.lastDistance, distance);
      for (const animation of gait.loops) animation.currentTime = gait.phase;
      attribute(actorNode, 'data-locomotion-source', 'distance'); attribute(actorNode, 'data-locomotion-phase', gait.phase);
      return true;
    }
    function update(value = session, options = {}) {
      if (destroyed) return Model.plan({}, {});
      session = value || {}; inherited = options;
      const wasHidden = hidden;
      hidden = Boolean(options.hidden || document.hidden || office?.dataset.hidden === 'true');
      quiet = Boolean(options.lowPower || options.reducedMotion || media?.matches || office?.dataset.lowPower === 'true' || office?.dataset.reducedMotion === 'true');
      const normalized = { ...options, hidden, lowPower: Boolean(options.lowPower || office?.dataset.lowPower === 'true'), reducedMotion: Boolean(options.reducedMotion || media?.matches || office?.dataset.reducedMotion === 'true') };
      const base = Model.plan(session, normalized), work = hidden ? Model.plan(session, { ...normalized, hidden: false }) : base;
      const nextIdentity = Model.identityFor(session);
      if (nextIdentity !== identity) { lease?.release(); identity = nextIdentity; lease = registry.open(session); waiting = false; eventCursor = null; seenEvents.clear(); }
      const elapsed = lease.sample(work.kind, { now: options.now, visible: base.active && base.animate && !quiet && health === 'healthy' });
      activityElapsed = elapsed;
      const plan = base.active ? Model.plan(session, { ...normalized, visibleElapsed: elapsed }) : base;
      const nextPose = poseFor(session, options), index = sourcePoseFor(session, options, currentDesign.id);
      const walking = Boolean(options.walking && !quiet);
      if (pose !== nextPose) {
        attribute(layer, 'data-pose', nextPose); pose = nextPose;
      }
      frame(index);
      attribute(layer, 'data-walking', walking);
      attribute(layer, 'data-live', !quiet);
      // Hiding alone preserves the selector and the exact CSSAnimation object.
      // Quiet preferences deliberately replace playback with a static tableau.
      attribute(layer, 'data-animate', !quiet && (walking || work.active && work.animate));
      attribute(layer, 'data-kind', plan.kind); attribute(actorNode, 'data-performance', plan.kind);
      attribute(layer, 'data-activity', session.activity || 'unknown');
      attribute(actorNode, 'data-performance-program', plan.program);
      if (!last || nextIdentity !== last.identity) style(layer, '--cp-offset', work.phaseOffset + 'ms');
      if (image) style(image, 'opacity', '0');
      if (!body.classList.contains('has-avatar-performance')) body.classList.add('has-avatar-performance');
      if (walking && !gait) { gait = { owner: null, phase: 0, lastDistance: 0, loops: [] }; attribute(actorNode, 'data-locomotion', 'true'); }
      else if (!walking) stopGait();
      // Lifecycle suppression precedes attention. A stale request is not a
      // current request, and resource recovery must not resurrect its props.
      observedActivity = work.active && !['resting', 'completed'].includes(nextPose)
        ? session.activity === 'error' ? 'error' : session.attention === true ? 'waiting-user' : session.activity : '';
      activityAnimate = Boolean(!quiet && observedActivity && work.active && work.animate);
      activity?.update?.({ activity: repertoireActivity(walking), attention: Boolean(observedActivity) && session.attention === true, creature: currentDesign.id, identity, elapsed, animate: activityAnimate, quiet, walking, hidden, healthy: health === 'healthy', preview: options.preview === true, repertoireIndex: options.repertoireIndex, poseIndex: index });
      // Hidden pauses the existing activity and expression clocks together.
      const performed = frames?.update?.({ creature: currentDesign.id, activity: observedActivity, animate: activityAnimate, quiet, walking, painted: !vectorPreview(options), phase: options.preview ? 0 : elapsed - work.phaseOffset });
      attribute(layer, 'data-frames', Boolean(performed?.painted));
      emotes?.update({ species: currentDesign.id, identity, disabled: quiet || walking,
        idle: index === 0 && !performed?.painted && !options.standby && !options.reaction });
      if (quiet) {
        stopCues(); paused.clear();
        for (const animation of ownedAnimations()) if (typeof animation.animationName !== 'string') animation.cancel();
      }
      else if (hidden || health !== 'healthy') pause();
      else if (wasHidden || paused.size) resume();
      const needsAttention = observedActivity === 'waiting-user';
      if (needsAttention && !waiting && !walking) cue('attention');
      waiting = needsAttention;
      observeToolSuccess();
      last = { ...plan, asset: currentDesign.asset, pose, poseIndex: index, identity, appearanceKey: currentDesign.appearanceKey, variantIndex: currentDesign.variantIndex };
      return last;
    }
    function visibility() { update(session, { ...inherited, now: undefined }); }
    media?.addEventListener?.('change', visibility); document.addEventListener?.('visibilitychange', visibility);
    function destroy() {
      if (destroyed) return; destroyed = true;
      media?.removeEventListener?.('change', visibility); document.removeEventListener?.('visibilitychange', visibility);
      source.removeEventListener('load', sourceLoad); source.removeEventListener('error', sourceError);
      image?.removeEventListener('load', bitmapLoad); image?.removeEventListener('error', bitmapError);
      probe.removeEventListener('load', probeLoad); probe.removeEventListener('error', probeError); probe.removeAttribute('src');
      stopCues(); stopGait(); paused.clear(); lease?.release(); lease = null;
      frames?.destroy?.(); emotes?.destroy(); activity?.destroy?.();
      layer.remove(); body.classList.remove('has-avatar-performance'); delete body.dataset.creature;
      delete body.dataset.rigHealth; delete body.dataset.bitmapHealth;
      delete actorNode.dataset.creatureDesign; delete actorNode.dataset.performance; delete actorNode.dataset.performanceProgram;
      if (originalColorFilter) actorNode.style.setProperty('--creature-color-filter', originalColorFilter);
      else actorNode.style.removeProperty('--creature-color-filter');
      if (image) { if (originalImageOpacity) image.style.setProperty('opacity', originalImageOpacity); else image.style.removeProperty('opacity'); }
      last = null;
    }
    setDesign(design); return Object.freeze({ update, setDesign, locomotion, cue, retry, destroy, get plan() { return last; } });
  }
  return Object.freeze({ create, poseFor, sourcePoseFor, variantPalette, POSES });
});
