/* State families performed by the whole painted body about its feet, plus an
 * eyelid blink cut from the body's own pixels. This is the body half of the
 * frame-animation plan (docs/plans/2026-11-04-route-a-frame-animation.md):
 * one legible motion vocabulary per observed state family, large enough to
 * read at a 64px body, with no prop, no timer and no invented state. Every
 * loop is an ordinary pausable WAAPI clock owned by the performance layer. */
(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./painted-creature-frame-manifest.js') : root.OfficePaintedCreatureFrameManifest);
  if (node) module.exports = api;
  else root.OfficePaintedCreatureFrames = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Manifest) {
  'use strict';
  const PIVOT = '77.5px 111px';
  const NS = 'http://www.w3.org/2000/svg';
  // Painted keyframe strips (scripts/frame-qa.cjs) draw over a SPAN-unit
  // square centred on the feet, where the atlas cell covers 80 units; the
  // feet of both sit on the same floor line.
  const FEET_Y = 115, ATLAS_LEFT = 37.5, ATLAS_BODY = 80;
  const MANIFEST = Manifest && typeof Manifest === 'object' ? Manifest : { cell: 512, span: 120, baseline: 440, blend: 150, strips: {} };
  const SPAN = MANIFEST.span || 120, FRAME_LEFT = ATLAS_LEFT + ATLAS_BODY / 2 - SPAN / 2, FRAME_TOP = FEET_Y - (MANIFEST.baseline || 440) * SPAN / (MANIFEST.cell || 512);
  function strip(species, activity) { return MANIFEST.strips?.[species]?.[activity] || null; }
  // Opacity tracks for one strip: each step shows its key from its beat to
  // the next beat; a step enters by a `blend` ms cross-dissolve unless it is
  // listed in `cuts`, when it lands as a hard cut.
  function tracks(entry) {
    const n = entry.sequence?.length || entry.frames, sequence = entry.sequence || Array.from({ length: n }, (_, i) => i);
    const beats = entry.beats || sequence.map((_, i) => i / n), cuts = new Set(entry.cuts || []), b = Math.min(.45 / n, (MANIFEST.blend || 150) / entry.duration);
    const steps = sequence.map((key, j) => ({ key, start: beats[j], end: j + 1 < n ? beats[j + 1] : 1, cutIn: cuts.has(j), cutOut: cuts.has((j + 1) % n) }));
    const value = (step, t) => {
      const ramp = (from, to, at) => Math.max(0, Math.min(1, (at - from) / (to - from)));
      const inside = (t) => t >= step.start && t < step.end ? (step.cutIn || t >= step.start + b ? 1 : ramp(step.start, step.start + b, t)) : 0;
      const tail = (t) => !step.cutOut && t >= step.end && t < step.end + b ? 1 - ramp(step.end, step.end + b, t) : 0;
      return Math.max(inside(t), tail(t), inside(t + 1), tail(t + 1));
    };
    const points = new Set([0, 1]);
    for (const step of steps) for (const t of [step.start, step.start + b, step.end, step.end + b]) { const w = ((t % 1) + 1) % 1; points.add(+w.toFixed(5)); if (step.cutIn || step.cutOut) points.add(+Math.max(0, w - 1e-4).toFixed(5)); }
    const offsets = [...points].sort((x, y) => x - y);
    return Array.from({ length: entry.frames }, (_, key) => offsets.map(offset => ({ offset, opacity: +Math.max(...steps.filter(step => step.key === key).map(step => value(step, offset === 1 ? 1 - 1e-9 : offset)), 0).toFixed(4), easing: 'linear' })));
  }
  // Whole-body annotations per key (§4.2), interpolated from step to step so
  // the lean, dip or sway continues while the painted keys dissolve.
  function motion(entry) {
    if (!Array.isArray(entry.motion) || !entry.motion.length) return null;
    const n = entry.sequence?.length || entry.frames, sequence = entry.sequence || Array.from({ length: n }, (_, i) => i);
    const beats = entry.beats || sequence.map((_, i) => i / n);
    const frames = sequence.map((key, j) => K(beats[j], entry.motion[key] || {}));
    return [...frames, K(1, entry.motion[sequence[0]] || {})];
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
  // Painted eye rectangles in rig units, per sheet cell whose eyes share the
  // idle registration. A lid copies the pixels directly above the eyes down
  // over them, so the blink is made of the creature's own material. Moss's
  // eyes sit in a clay recess and Glow's under its light core: neither has
  // matching skin to borrow, so they wait for a painted closed-eye frame.
  const EYES = Object.freeze({
    folio: { 0: [66, 82, 22, 12], 1: [66, 82, 22, 12] },
    ink: { 0: [61, 90, 26, 12], 1: [61, 90, 26, 12] },
    thread: { 0: [71, 83, 25, 12], 1: [71, 83, 25, 12] }
  });
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
  function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function create({ document, pose, lid, lidGroup, lidClip, creature = 'folio', shell = null, defs = null, id = 'cp', assetBase = '../assets/avatars/', onReady } = {}) {
    if (!document || !pose) throw new TypeError('Frames need the pose group of an existing creature.');
    let loop = null, blink = null, key = '', blinkKey = '', destroyed = false, species = creature;
    let painted = null, paintedKey = '', reels = [];
    let resource = null;
    // Keep only the requested strip. Its decoded bitmap is shared by the
    // four SVG views; a late decode cannot replace a newer activity/species.
    function ready(activity) {
      const entry = strip(species, activity);
      if (!group || !entry) { resource = null; return false; }
      if (typeof document.createElement !== 'function') return true;
      const href = assetBase + 'painted-frames/' + species + '/' + activity + '.png';
      if (resource?.href === href) return resource.status === 'ready';
      const probe = document.createElement('img');
      if (typeof probe.decode !== 'function') return true;
      const request = resource = { href, probe, status: 'pending' };
      probe.src = href;
      probe.decode().then(() => {
        if (destroyed || resource !== request) return;
        request.status = probe.naturalWidth === MANIFEST.cell * entry.frames && probe.naturalHeight === MANIFEST.cell ? 'ready' : 'failed';
        onReady?.();
      }, () => {
        if (destroyed || resource !== request) return;
        request.status = 'failed'; onReady?.();
      });
      return false;
    }
    const attribute = (node, name, value) => { value = String(value); if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
    const style = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };
    const element = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); parent?.append(n); return n; };
    // The painted strip lives in the shell beside the atlas body; one
    // <image> per key, all showing the same strip at different x offsets.
    let group = null, frameClip = null, images = [];
    if (shell && defs) {
      frameClip = element('clipPath', { id: id + '-frame-cell' }, defs);
      element('rect', { x: FRAME_LEFT, y: FRAME_TOP, width: SPAN, height: SPAN }, frameClip);
      group = element('g', { class: 'cp-frames', 'data-active': 'false' }, shell);
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
      if (group) attribute(group, 'data-active', 'false');
    }
    function paint(activity, phase, still = false) {
      const entry = group ? strip(species, activity) : null;
      const nextKey = entry ? [species, activity, entry.frames, entry.duration, still ? 'still' : 'live'].join('|') : '';
      if (nextKey === paintedKey) return;
      stopPainted();
      if (!entry) return;
      const href = assetBase + 'painted-frames/' + species + '/' + activity + '.png';
      for (let k = 0; k < entry.frames; k++) { const img = image(k); attribute(img, 'href', href); attribute(img, 'width', SPAN * entry.frames); }
      for (let k = entry.frames; k < images.length; k++) attribute(images[k], 'href', '');
      attribute(group, 'data-active', 'true'); attribute(group, 'data-strip', activity);
      painted = entry; paintedKey = nextKey;
      // Quiet preferences get the first key as a still tableau: no reels.
      if (still || typeof images[0].animate !== 'function') { style(images[0], 'opacity', '1'); return; }
      const at = Number.isFinite(phase) ? ((phase % entry.duration) + entry.duration) % entry.duration : 0;
      reels = tracks(entry).map((frames, k) => { const reel = images[k].animate(frames, { duration: entry.duration, iterations: Infinity, easing: 'linear', fill: 'both' }); reel.currentTime = at; return reel; });
      const sway = motion(entry);
      if (sway && typeof pose.animate === 'function') { const reel = pose.animate(sway, { duration: entry.duration, iterations: Infinity, easing: 'linear', fill: 'both' }); reel.currentTime = at; reels.push(reel); }
    }
    function stopLoop() { if (loop) { loop.cancel(); loop = null; } key = ''; }
    function stopBlink() { if (blink) { blink.cancel(); blink = null; } blinkKey = ''; if (lid) style(lid, 'transform', 'none'); }
    function hold(activity) {
      const sig = signature(species, activity);
      style(pose, 'transform', sig ? sig.frames[0].transform : 'none');
    }
    function eyes(poseIndex) { return EYES[species]?.[poseIndex] || null; }
    function placeLid(poseIndex) {
      if (!lid || !lidClip) return null;
      const rect = eyes(poseIndex);
      attribute(lidGroup || lid, 'data-active', Boolean(rect));
      if (!rect) return null;
      attribute(lidClip, 'x', rect[0]); attribute(lidClip, 'y', rect[1]); attribute(lidClip, 'width', rect[2]); attribute(lidClip, 'height', rect[3]);
      return rect;
    }
    function update({ creature: next = species, activity = '', animate = false, quiet = false, walking = false, standby = false, painted: allowPainted = true, identity = '', poseIndex = 0, phase = 0 } = {}) {
      if (destroyed) return null;
      species = Object.hasOwn(SIDE, next) ? next : 'folio';
      // A painted strip replaces both the body signature and the vector
      // props for its activity; the signature stays the fallback.
      const live = animate && !walking && !quiet;
      if (allowPainted && !walking && (live || quiet) && ready(activity)) paint(activity, phase, !live); else stopPainted();
      const sig = live && !painted ? signature(species, activity) : null;
      const nextKey = sig ? [species, activity, sig.duration].join('|') : '';
      attribute(pose, 'data-family', FAMILIES[activity] || 'idle');
      if (nextKey !== key || !sig) {
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
      const rect = placeLid(poseIndex);
      // Standby owns the body as a sleeping tableau; a dozing creature does not blink.
      const wantBlink = Boolean(rect) && !painted && !quiet && !walking && !standby && typeof lid?.animate === 'function';
      const nextBlinkKey = wantBlink ? [species, poseIndex, identity].join('|') : '';
      if (nextBlinkKey !== blinkKey) {
        stopBlink();
        if (wantBlink) {
          const period = 2800 + hash(identity + species) % 2400, drop = rect[3] + 1;
          const open = 'translate(0px,0px)', closed = 'translate(0px,' + drop + 'px)';
          blink = lid.animate([
            { offset: 0, transform: open, easing: SNAP }, { offset: 80 / period, transform: closed, easing: 'linear' },
            { offset: 120 / period, transform: closed, easing: SETTLE }, { offset: 190 / period, transform: open }, { offset: 1, transform: open }
          ], { duration: period, iterations: Infinity, easing: 'linear', delay: 600 + hash(species + identity) % 1400, fill: 'both' });
          blinkKey = nextBlinkKey;
        }
      }
      return { family: FAMILIES[activity] || 'idle', loop, blink, painted: Boolean(painted) };
    }
    function destroy() { if (destroyed) return; destroyed = true; resource = null; stopLoop(); stopBlink(); stopPainted(); group?.remove(); frameClip?.remove(); }
    return Object.freeze({ update, destroy, has(activity, next = species) { species = Object.hasOwn(SIDE, next) ? next : 'folio'; return ready(activity); }, get loop() { return loop; }, get blink() { return blink; }, get painted() { return painted; }, get reels() { return reels; } });
  }
  return Object.freeze({ create, signature, tracks, motion, strip, FAMILIES, EYES, SIDE, PIVOT, SPAN, FRAME_LEFT, FRAME_TOP });
});
