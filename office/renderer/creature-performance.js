/* Six painted poses, restrained material motion, and the existing observation
 * clock. A creature never invents work, completion, or a reminder timer. */
(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('../lib/avatar-performance-model.js') : root.OfficeAvatarPerformanceModel, root.OfficeCreatureActivity, node ? require('./creature-frames.js') : root.OfficeCreatureFrames);
  if (node) module.exports = api;
  else root.OfficeCreaturePerformance = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Model, Activity, Frames) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', CELL = 80, LEFT = 37.5, TOP = 35;
  const POSES = Object.freeze(['idle', 'working', 'thinking', 'resting', 'attention', 'completed']);
  const IDS = new Set(['folio', 'ink', 'moss', 'thread', 'glow']);
  // Material silhouette baselines measured above alpha 220 in each 512px
  // cell. Transparent glow/dust does not move the physical feet. The sheet's
  // six poses retain their own height rather than stretching a resting body.
  const BASELINES = Object.freeze({ folio: [473,471,469,433,419,418], ink: [494,508,508,412,408,426], moss: [505,506,506,431,449,452], thread: [479,480,477,440,458,444], glow: [473,473,472,432,432,432] });
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
    // painted texture remain spatially unchanged, including antialiased alpha.
    return Object.freeze({ index, hue, filter: 'sepia('+sepia+') saturate('+saturation+') hue-rotate('+hue+'deg) brightness('+Number((light*tone).toFixed(6))+')' });
  }
  const SINE = 'cubic-bezier(.37,0,.63,1)';
  // Finite reactions in each material's own body language. Frames run between
  // the current transform and rest; every beat returns to the painted pose.
  const CUES = Object.freeze({
    folio: {
      greet: ['translateY(1px) rotate(2deg) scale(1.04,.94)', 'translateY(-6px) rotate(-10deg) scale(.96,1.05)', 'translateY(-2px) rotate(8deg)', 'rotate(-3deg)'],
      attention: ['scale(1.07,.91)', 'translateY(-8.5px) rotate(-6deg) scale(.94,1.08)', 'rotate(4.5deg) scale(1.05,.95)', 'rotate(-1.8deg)'],
      startle: ['rotate(-5deg) scale(.88,1.1)', 'rotate(2.5deg) scale(1.06,.94)', 'rotate(-.8deg)'],
      success: ['scale(1.06,.92)', 'translateY(-6.5px) rotate(-11deg) scale(.96,1.05)', 'translateY(-2.5px) rotate(7deg)', 'scale(1.03,.97)']
    },
    ink: {
      greet: ['scale(1.13,.87)', 'translateY(-4.5px) scale(.9,1.12)', 'scale(1.06,.94)', 'scale(.98,1.02)'],
      attention: ['scale(1.17,.83)', 'translateY(-8.5px) scale(.86,1.17)', 'scale(1.11,.89)', 'scale(.96,1.04)'],
      startle: ['scale(.84,1.17)', 'scale(1.1,.91)', 'scale(.98,1.02)'],
      success: ['scale(1.15,.85)', 'translateY(-6.5px) scale(.88,1.15)', 'scale(1.07,.93)', 'scale(.98,1.02)']
    },
    moss: {
      greet: ['translateY(.8px) scale(1.03,.96)', 'translateY(-3.5px) rotate(-4deg) skewX(3deg)', 'rotate(3deg) skewX(-2.5deg)', 'rotate(-1.2deg)'],
      attention: ['translateY(1px) scale(1.04,.95)', 'translateY(-5.5px) rotate(-2.8deg)', 'translateY(1.2px) scale(1.06,.93)', 'rotate(1.2deg)'],
      startle: ['translateY(-3.5px) rotate(-1.5deg)', 'translateY(1px) scale(1.05,.94)', 'scale(.99,1.01)'],
      success: ['translateY(.8px) scale(1.03,.96)', 'translateY(-4.5px) rotate(-2deg)', 'translateY(1px) scale(1.05,.94)', 'skewX(-2.5deg)']
    },
    thread: {
      greet: ['scale(1.06,.93)', 'translateY(-6.5px) rotate(-10deg)', 'scale(1.07,.93)', 'translateY(-2.5px) rotate(6deg)', 'scale(1.02,.98)'],
      attention: ['scale(1.1,.9)', 'translateY(-9.5px) rotate(-12deg) scale(.92,1.08)', 'scale(1.09,.91)', 'translateY(-3.5px) rotate(7deg)', 'scale(1.02,.98)'],
      startle: ['translateY(-4.5px) scale(.9,1.1)', 'rotate(-5deg) scale(1.06,.94)', 'rotate(1.5deg)'],
      success: ['scale(1.09,.91)', 'translateY(-7.5px) rotate(14deg)', 'scale(1.07,.93)', 'translateY(-2.5px) rotate(-5deg)']
    },
    glow: {
      greet: ['translateY(1px) scale(.97)', 'translateY(-5.5px) rotate(-4deg) scale(1.04)', 'translateY(-3.5px) rotate(4deg)', 'translateY(-1.2px)'],
      attention: ['translateY(-7.5px) scale(1.07)', 'translateY(-4.5px) rotate(-4deg)', 'translateY(-5.5px) rotate(4deg)', 'translateY(-1.2px)'],
      startle: ['translateY(2.5px) scale(.92)', 'translateY(-4px) scale(1.06)', 'translateY(-.8px)'],
      success: ['translateY(-6.5px) scale(1.08)', 'translateY(-3.5px) rotate(-2deg)', 'translateY(-1.2px) scale(1.03)']
    }
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
  function sourcePoseFor(session = {}, options = {}, creature) {
    const pose = poseFor(session, options);
    if (creature === 'moss' && session.activity === 'error') return 0;
    if (pose === 'working' || pose === 'thinking' && session.activity !== 'planning') return 0;
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
    // The previous painted cell stays mounted so a pose change dissolves
    // instead of cutting. It is a second view of the same sheet.
    const previous = element('image', { id: id + '-previous', x: LEFT, y: TOP, width: CELL * 3, height: CELL * 2, preserveAspectRatio: 'none' }, defs);
    const previousClip = element('clipPath', { id: id + '-previous-cell' }, defs);
    const previousRect = element('rect', { x: LEFT, y: TOP, width: CELL, height: CELL }, previousClip);
    const eyeClip = element('clipPath', { id: id + '-eyes' }, defs);
    const eyeRect = element('rect', { x: 0, y: 0, width: 0, height: 0 }, eyeClip);
    const motion = element('g', { class: 'cp-motion' }, svg), art = element('g', { class: 'cp-art' }, motion);
    // .cp-pose performs the observed state family with the whole body about
    // its feet; .cp-gesture stays the repertoire's own body track.
    const poseGroup = element('g', { class: 'cp-pose' }, art), gesture = element('g', { class: 'cp-gesture' }, poseGroup);
    const shell = element('g', { class: 'cp-shell' }, gesture), feet = element('g', { class: 'cp-feet' }, gesture);
    const parts = {};
    // The body is one unsliced painting. Only the four feet are separate
    // slices, for the stride; nothing above the ankles is ever cut or skewed.
    const bodyPrevious = element('g', { class: 'cp-body cp-body-previous', 'clip-path': 'url(#' + previousClip.id + ')' }, shell);
    element('use', { href: '#' + previous.id }, bodyPrevious);
    bodyPrevious.style.setProperty('opacity', '0');
    const bodyNow = element('g', { class: 'cp-body cp-body-now', 'clip-path': 'url(#' + cellClip.id + ')' }, shell);
    element('use', { href: '#' + source.id }, bodyNow);
    // The lid is the creature's own pixels from just above its eyes, clipped
    // to the eye rectangle and slid down for a blink.
    const lid = element('g', { class: 'cp-lid', 'clip-path': 'url(#' + eyeClip.id + ')', 'data-active': 'false' }, shell);
    const lidUse = element('use', { class: 'cp-lid-skin', href: '#' + source.id }, lid);
    for (let index = 0; index < 4; index++) {
      const clip = element('clipPath', { id: id + '-foot-' + (index + 1) }, defs);
      element('rect', { x: LEFT + index * CELL / 4, y: TOP + 64, width: CELL / 4, height: 16 }, clip);
      const node = element('g', { class: 'cp-part cp-foot-' + (index + 1), 'clip-path': 'url(#' + cellClip.id + ')' }, feet);
      element('use', { href: '#' + source.id, 'clip-path': 'url(#' + clip.id + ')' }, node);
      parts['foot-' + (index + 1)] = node;
    }
    const light = element('ellipse', { class: 'cp-inner-light', cx: 77.5, cy: 82, rx: 8, ry: 10, fill: '#ffe3a2', opacity: '.08' }, shell);
    parts.light = light;
    const frames = Frames?.create?.({ document, pose: poseGroup, lid: lidUse, lidGroup: lid, lidClip: eyeRect, creature: design?.id, shell, defs, id });
    let dissolves = [];
    function stopDissolve() { for (const animation of dissolves) animation.cancel(); dissolves = []; style(bodyPrevious, 'opacity', '0'); }
    // A pose change cross-dissolves the old painted cell into the new one
    // over 220ms; the feet and lid follow the incoming cell.
    function dissolve() {
      if (quiet || hidden || health !== 'healthy' || typeof bodyPrevious.animate !== 'function') return;
      stopDissolve();
      const timing = { duration: 220, easing: SINE, fill: 'both' };
      const out = bodyPrevious.animate([{ opacity: 1 }, { opacity: 0 }], timing);
      dissolves = [out, ...[bodyNow, feet, lid].map(node => node.animate([{ opacity: 0 }, { opacity: 1 }], timing))];
      out.finished.then(() => { if (dissolves.includes(out)) stopDissolve(); }, () => {});
    }
    const neutral = element('g', { class: 'cp-neutral', 'aria-hidden': 'true' }, motion);
    element('path', { fill: '#a8b2a2', stroke: '#59685e', 'stroke-width': '1', d: 'M57 99Q55 87 66 79Q75 72 83 79Q99 84 99 98Q98 107 87 108H69Q58 108 57 99Z' }, neutral);
    for (const x of [59,69,84,94]) element('path', { fill: '#82917f', d: 'M'+x+' 105h5v8q0 2-2.5 2t-2.5-2Z' }, neutral);
    for (const x of [68,85]) element('ellipse', { fill: '#34493f', cx: x, cy: 93, rx: '1.7', ry: '2.5' }, neutral);
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
    const probe = document.createElement('img');
    const attribute = (node, name, value) => { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const style = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
    // A painted keyframe strip for the observed activity carries its own
    // props, so the vector repertoire stands down for it; without one the
    // repertoire performs as before.
    // An explicit recipe preview (gallery, audits) asks for the vector
    // repertoire itself, so strips stand down there.
    function vectorPreview(options) { return options.preview === true && Number.isInteger(options.repertoireIndex); }
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
      const baseline = currentDesign.poseBaselines?.[index] || BASELINES[currentDesign.id][index];
      const key = currentDesign.id + '/' + index + '/' + baseline;
      if (key === frameKey) return;
      const offset = (512 - baseline) * CELL / 512;
      if (frameKey) {
        // Keep the outgoing cell on the previous view, then dissolve.
        attribute(previous, 'href', source.getAttribute('href')); attribute(previous, 'x', source.getAttribute('x')); attribute(previous, 'y', source.getAttribute('y'));
        attribute(previousRect, 'y', cellRect.getAttribute('y'));
      }
      attribute(source, 'x', LEFT - index % 3 * CELL); attribute(source, 'y', TOP - Math.floor(index / 3) * CELL + offset);
      attribute(cellRect, 'y', TOP + offset); attribute(layer, 'data-pose-index', index);
      if (frameKey) dissolve();
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
      const creature = currentDesign.id, from = view?.getComputedStyle?.(motion)?.transform || 'none';
      const side = Math.sign(direction) || 1;
      const beats = kind === 'glance'
        ? ['rotate(' + side * 6.5 + 'deg) translateX(' + side * 1.6 + 'px)', 'rotate(' + side * 5 + 'deg) translateX(' + side * 1.4 + 'px)', 'rotate(' + side * -1.5 + 'deg)']
        : CUES[creature][kind];
      const frames = [from, ...beats, 'none'].map((transform, index, all) => ({ transform, offset: index / (all.length - 1), easing: SINE }));
      stopCues();
      const animation = motion.animate(frames, { duration: CUE_DURATION[kind], easing: 'linear' });
      cues.add(animation); animation.finished.catch(() => {}).finally(() => cues.delete(animation));
      return true;
    }
    function cue(kind, { direction = 0 } = {}) {
      if (destroyed || hidden || quiet || gait || health !== 'healthy' || typeof motion.animate !== 'function') return false;
      if (kind === 'wave') kind = 'greet';
      if (activity?.cue?.(kind, { direction })) {
        if (kind === 'tool-success') react('success');
        return true;
      }
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
        // The first painted pose is a mount, not a change; only later swaps land.
        if (pose) attribute(layer, 'data-pose-change', 'true');
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
      // The whole-body state family and the blink share the activity's
      // animate decision; hidden pauses them with every other owned clock.
      const performed = frames?.update?.({ creature: currentDesign.id, activity: observedActivity, animate: activityAnimate, quiet, walking, standby: Boolean(options.standby), painted: !vectorPreview(options), identity, poseIndex: index, phase: work.phaseOffset });
      attribute(layer, 'data-frames', Boolean(performed?.painted));
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
      stopCues(); stopGait(); stopDissolve(); paused.clear(); lease?.release(); lease = null;
      frames?.destroy?.(); activity?.destroy?.();
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
