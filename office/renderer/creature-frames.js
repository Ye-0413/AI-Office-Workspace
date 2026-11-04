/* Native-grid cels share the observed creature clock. */
(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./creature-frame-manifest.js') : root.OfficeCreatureFrameManifest);
  if (node) module.exports = api;
  else root.OfficeCreatureFrames = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Manifest) {
  'use strict';
  const PIVOT = '77.5px 111px';
  const NS = 'http://www.w3.org/2000/svg';
  // The 60-pixel reel and the 40-pixel atlas both use two rig units
  // per texel and share the same physical floor line.
  const FEET_Y = 115, ATLAS_LEFT = 37.5, ATLAS_BODY = 80;
  const MANIFEST = Manifest || { cell: 60, span: 120, baseline: 56, strips: {} };
  const SPAN = MANIFEST.span, FRAME_LEFT = ATLAS_LEFT + ATLAS_BODY / 2 - SPAN / 2;
  const FRAME_TOP = FEET_Y - MANIFEST.baseline * SPAN / MANIFEST.cell;
  function strip(species, activity) { return MANIFEST.strips[species]?.[activity] || null; }
  function tracks(entry) {
    return entry.beats.map((_, key) => [...entry.beats.map((offset, index) => ({
      offset, opacity: index === key ? 1 : 0, easing: 'step-end'
    })), { offset: 1, opacity: key === 0 ? 1 : 0 }]);
  }
  const SINE = 'cubic-bezier(.37,0,.63,1)', ORGANIC = 'cubic-bezier(.4,0,.2,1)', SETTLE = 'cubic-bezier(.2,.8,.3,1)', SNAP = 'cubic-bezier(.6,0,.9,.6)';
  // Seven families. The family decides the vocabulary; the activity picks a
  // distinct rhythm inside it so no two activities repeat a motion.
  const FAMILIES = Object.freeze({
    reading: 'study', searching: 'study', planning: 'study', designing: 'study',
    coding: 'rhythm', testing: 'rhythm', building: 'rhythm',
    running: 'run', 'waiting-tool': 'wait-tool', 'waiting-user': 'wait-user', error: 'blocked'
  });
  // Work zone side per species (Moss keeps its tools on the left).
  const SIDE = Object.freeze({ folio: 1, ink: 1, moss: -1, thread: 1, glow: 1 });
  const r = value => Number(value.toFixed(3));
  const T = ({ x = 0, y = 0, rot = 0, sx = 1, sy = 1 }) => 'translate(' + r(x) + 'px,' + r(y) + 'px) rotate(' + r(rot) + 'deg) scale(' + r(sx) + ',' + r(sy) + ')';
  const K = (offset, pose, easing = ORGANIC) => ({ offset, transform: T(pose), easing });
  // Amplitudes are in rig units of an 80-unit body and are sized for a 64px
  // body on a five-inch display: a head needs to travel about 8–12 units
  // (6–10px there) for a beat to register. Rigid clay and weightless amber
  // never squash; they lift and drop instead.
  function signature(creature, activity) {
    const s = SIDE[creature] ?? 1, family = FAMILIES[activity];
    const soft = creature === 'ink' || creature === 'thread' || creature === 'folio';
    // One squash/press beat for soft bodies, one thud for rigid ones.
    const press = (depth, extra = {}) => soft ? { sx: 1 + depth * .5, sy: 1 - depth, y: depth * 6, ...extra } : { y: depth * 12, sy: 1 - depth * .25, ...extra };
    const lift = (height, extra = {}) => soft ? { y: -height, sx: 1 - height * .012, sy: 1 + height * .018, ...extra } : { y: -height, ...extra };
    switch (activity) {
      case 'reading': return { family, duration: 3400, frames: [
        K(0, { rot: s * 10 }), K(.28, { rot: s * 10 }), K(.4, { rot: s * 17, y: 2.5, x: s * 2 }, SNAP), K(.52, { rot: s * 6, y: -1 }, SETTLE), K(.66, { rot: s * 10 }), K(1, { rot: s * 10 })] };
      case 'searching': return { family, duration: 3000, frames: [
        K(0, { rot: s * 9, x: -8 }), K(.42, { rot: s * 9, x: 8, y: -1.5 }, SINE), K(.52, { rot: s * 9, x: 8 }, SINE), K(.94, { rot: s * 9, x: -8, y: -1.5 }, SINE), K(1, { rot: s * 9, x: -8 })] };
      case 'planning': return { family, duration: 3600, frames: [
        K(0, { rot: s * 8 }), K(.18, { rot: s * 8 }), K(.3, { rot: s * 2, x: -s * 7, y: -3 }, SNAP), K(.42, { rot: s * 4, x: -s * 6 }), K(.56, { rot: s * 14, x: s * 6, y: -3 }, SNAP), K(.68, { rot: s * 12, x: s * 5 }), K(.84, { rot: s * 8 }, SETTLE), K(1, { rot: s * 8 })] };
      case 'designing': return { family, duration: 3400, frames: [
        K(0, { rot: s * 8, x: -s * 5 }), K(.1, { rot: s * 8, x: -s * 5 }), K(.58, { rot: s * 13, x: s * 9 }, SINE), K(.68, { rot: s * 10, x: s * 8, y: -5 }, SETTLE), K(.84, { rot: s * 8, x: -s * 5, y: -3 }, SINE), K(.92, { rot: s * 8, x: -s * 5 }), K(1, { rot: s * 8, x: -s * 5 })] };
      case 'coding': return { family, duration: 2400, frames: [
        K(0, { rot: s * 5 }), K(.12, { rot: s * 5, ...press(.11) }, SNAP), K(.3, { rot: s * 5 }, SETTLE),
        K(.45, { rot: s * 5, ...press(.11) }, SNAP), K(.63, { rot: s * 5 }, SETTLE),
        K(.78, { rot: s * 5, ...press(.11) }, SNAP), K(1, { rot: s * 5 }, SETTLE)] };
      case 'testing': return { family, duration: 3200, frames: [
        K(0, { rot: s * 5 }), K(.22, { rot: s * 5, ...press(.16) }, SNAP), K(.56, { rot: s * 5, ...press(.16) }), K(.66, { rot: s * 5, ...lift(6) }, SETTLE), K(.78, { rot: s * 5, ...press(.03) }), K(1, { rot: s * 5 })] };
      case 'building': return { family, duration: 3600, frames: [
        K(0, { rot: s * 4 }), K(.3, { rot: s * 4, ...lift(9) }, SINE), K(.48, { rot: s * 4, ...lift(9) }), K(.66, { rot: s * 4 }, SINE), K(.74, { rot: s * 4, ...press(.12) }, SNAP), K(.9, { rot: s * 4 }, SETTLE), K(1, { rot: s * 4 })] };
      case 'running': return { family, duration: 3000, frames: [
        K(0, { rot: s * 3 - 8 }, SINE), K(.5, { rot: s * 3 + 8, y: -1.5 }, SINE), K(1, { rot: s * 3 - 8 }, SINE)] };
      case 'waiting-tool': return { family, duration: 3600, frames: [
        K(0, { rot: -7 }, SINE), K(.5, { rot: 7 }, SINE), K(1, { rot: -7 }, SINE)] };
      case 'waiting-user': return { family, duration: 6000, frames: [
        K(0, {}), K(.07, press(.06)), K(.16, lift(8), SETTLE), K(.3, lift(7)), K(.42, {}, SINE), K(1, {})] };
      case 'error': {
        const jam = { rot: -s * 8, x: -s * 3, ...(soft ? { sx: 1.07, sy: .92 } : { y: 1.5 }) };
        return { family, duration: 7000, frames: [
          K(0, jam), K(.5, jam), K(.53, { ...jam, rot: -s * 15, x: -s * 9 }, SNAP), K(.56, { ...jam, rot: -s * 3, x: s * 1 }), K(.6, { ...jam, rot: -s * 10, x: -s * 4 }, SETTLE), K(.66, jam), K(1, jam)] };
      }
      default: return null;
    }
  }
  function create({ document, pose, creature = 'folio', shell = null, defs = null, id = 'cp', assetBase = '../assets/avatars/' } = {}) {
    if (!document || !pose) throw new TypeError('Frames need the pose group of an existing creature.');
    let loop = null, key = '', destroyed = false, species = creature;
    let painted = null, paintedKey = '', reels = [], probe = null;
    const attribute = (node, name, value) => { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const style = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
    const element = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); parent?.append(n); return n; };
    // Each cel clips the same sheet at a different grid offset.
    let group = null, frameClip = null, images = [];
    if (shell && defs) {
      frameClip = element('clipPath', { id: id + '-frame-cell' }, defs);
      element('rect', { x: FRAME_LEFT, y: FRAME_TOP, width: SPAN, height: SPAN }, frameClip);
      group = element('g', { class: 'cp-frames', 'data-active': 'false', 'data-ready': 'false' }, shell);
    }
    function image(index) {
      while (images.length <= index) {
        const img = element('image', { class: 'cp-frame', 'data-key': images.length, x: FRAME_LEFT - images.length * SPAN, y: FRAME_TOP, height: SPAN, preserveAspectRatio: 'none', 'clip-path': 'url(#' + frameClip.id + ')' }, group);
        img.style.setProperty('opacity', '0'); images.push(img);
      }
      return images[index];
    }
    function stopPainted() {
      for (const reel of reels) reel.cancel(); reels = []; paintedKey = ''; painted = null;
      for (const img of images) style(img, 'opacity', '0');
      if (probe) { probe.onload = probe.onerror = null; probe = null; }
      if (group) { attribute(group, 'data-active', 'false'); attribute(group, 'data-ready', 'false'); }
    }
    function paint(activity, phase, still = false) {
      const entry = group ? strip(species, activity) : null;
      const nextKey = entry ? [species, activity, entry.frames, entry.duration, still ? 'still' : 'live'].join('|') : '';
      if (nextKey === paintedKey) return;
      stopPainted();
      if (!entry) return;
      const href = assetBase + 'frames/' + species + '/' + activity + '.png';
      for (let k = 0; k < entry.frames; k++) { const img = image(k); attribute(img, 'href', href); attribute(img, 'width', SPAN * entry.frames); }
      for (let k = entry.frames; k < images.length; k++) attribute(images[k], 'href', '');
      attribute(group, 'data-active', 'true'); attribute(group, 'data-strip', activity);
      painted = entry; paintedKey = nextKey;
      // Keep the atlas visible until the selected reel has decoded. Stale
      // requests cannot cover the current pose after a state or species swap.
      probe = document.createElement('img');
      probe.onload = () => { if (paintedKey === nextKey) attribute(group, 'data-ready', 'true'); };
      probe.src = href;
      if (probe.complete && probe.naturalWidth > 0) attribute(group, 'data-ready', 'true');
      // Quiet preferences get the first key as a still tableau: no reels.
      if (still || typeof images[0].animate !== 'function') { style(images[0], 'opacity', '1'); return; }
      const at = Number.isFinite(phase) ? ((phase % entry.duration) + entry.duration) % entry.duration : 0;
      reels = tracks(entry).map((frames, k) => { const reel = images[k].animate(frames, { duration: entry.duration, iterations: Infinity, easing: 'linear', fill: 'both' }); reel.currentTime = at; return reel; });
    }
    function stopLoop() { if (loop) { loop.cancel(); loop = null; } key = ''; }
    function hold(activity) {
      const sig = signature(species, activity);
      style(pose, 'transform', sig ? sig.frames[0].transform : 'none');
    }
    function update({ creature: next = species, activity = '', animate = false, quiet = false, walking = false, painted: allowPainted = true, phase = 0 } = {}) {
      if (destroyed) return null;
      species = Object.hasOwn(SIDE, next) ? next : 'folio';
      // A painted strip replaces both the body signature and the vector
      // props for its activity; the signature stays the fallback.
      const live = animate && !walking && !quiet;
      if (group && allowPainted && !walking && (live || quiet) && strip(species, activity)) paint(activity, phase, !live); else stopPainted();
      const sig = live && !painted ? signature(species, activity) : null;
      const nextKey = sig ? [species, activity, sig.duration].join('|') : '';
      attribute(pose, 'data-family', FAMILIES[activity] || 'idle');
      if (nextKey !== key) {
        stopLoop();
        if (sig && typeof pose.animate === 'function') {
          style(pose, 'transform', 'none');
          loop = pose.animate(sig.frames, { duration: sig.duration, iterations: Infinity, easing: 'linear', fill: 'both' });
          const at = Number.isFinite(phase) ? ((phase % sig.duration) + sig.duration) % sig.duration : 0;
          loop.currentTime = at;
          key = nextKey;
        } else if (quiet && !walking && !painted) hold(activity);
        else style(pose, 'transform', 'none');
      }
      return { family: FAMILIES[activity] || 'idle', loop, painted: Boolean(painted) };
    }
    function destroy() { if (destroyed) return; destroyed = true; stopLoop(); stopPainted(); group?.remove(); frameClip?.remove(); }
    return Object.freeze({ update, destroy, has: activity => Boolean(group && strip(species, activity)), get loop() { return loop; }, get painted() { return painted; }, get reels() { return reels; } });
  }
  return Object.freeze({ create, signature, tracks, strip, FAMILIES, SIDE, PIVOT, SPAN, FRAME_LEFT, FRAME_TOP });
});
