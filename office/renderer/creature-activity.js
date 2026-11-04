/* Material-specific choreography describes observations, never outcomes.
 * WAAPI owns complete cycles; there is no per-creature timer or frame loop.
 *
 * Props play on a side-front stage beside the painted body, never over its
 * face. A species limb (paper strip, ink pseudopod, root, yarn, light motes)
 * reaches from the body to the authored grip, and the body itself leans,
 * presses a front foot and lets its crown follow through on the same clock. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./creature-repertoire.js') : root.OfficeCreatureRepertoire);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureActivity = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Repertoire) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ACTIVITIES = Repertoire.ACTIVITIES;
  const MATERIALS = Object.freeze({
    folio: { base: '#fff3d6', shade: '#d4af82', edge: '#7a5230', light: '#fffdf2', cycle: 3200 },
    ink: { base: '#1a3154', shade: '#0d1933', edge: '#467499', light: '#a2eefc', cycle: 2600 },
    moss: { base: '#d9a46c', shade: '#9b663e', edge: '#593d25', light: '#bed074', cycle: 4000 },
    thread: { base: '#f08b65', shade: '#be503b', edge: '#783427', light: '#ffdbb5', cycle: 3200 },
    glow: { base: '#fad06b', shade: '#df9d38', edge: '#96631c', light: '#fff9c8', cycle: 3600 }
  });
  // Where each material works, in rig units (154×129 view box, feet at y 115).
  // `face` guards the painted eyes/expression (and Glow's core) measured on
  // the sheet; `shoulder` is the limb root for each of the six painted poses;
  // Moss keeps its face on the right, so its stage mirrors to the left side.
  // `shift`/`faces` adjust poses whose painted head sits further to one side.
  const STAGES = Object.freeze({
    folio: { x: 115, y: 103, scale: .8, mirror: false, limb: 'paper', cut: 70, foot: 'foot-4', face: [64, 80, 90, 100], shoulder: [[103, 99], [103, 99], [102, 100], [104, 102], [101, 100], [103, 99]] },
    ink: { x: 113, y: 103, scale: .8, mirror: false, limb: 'ink', cut: 84, foot: 'foot-4', face: [58, 88, 88, 103], shoulder: [[104, 106], [104, 106], [102, 106], [104, 108], [104, 108], [104, 104]] },
    moss: { x: 50, y: 103, scale: .8, mirror: true, limb: 'root', cut: 68, foot: 'foot-1', face: [78, 82, 108, 100], shoulder: [[56, 101], [54, 101], [50, 101], [54, 103], [54, 101], [50, 101]] },
    thread: { x: 120, y: 103, scale: .8, mirror: false, limb: 'yarn', cut: 72, foot: 'foot-4', face: [66, 82, 95, 96], shift: [0, 0, 4, 0, 3, 0], faces: { 2: [72, 82, 99, 96], 4: [68, 82, 98, 96] }, shoulder: [[106.5, 110], [108, 110], [109, 112], [106, 110], [110, 110], [108, 110]] },
    glow: { x: 115, y: 103, scale: .8, mirror: false, limb: 'light', cut: 70, foot: 'foot-4', face: [66, 66, 90, 104], shoulder: [[78, 84], [78, 84], [77, 84], [78, 96], [78, 86], [78, 84]] }
  });
  // Unit limbs run from the shoulder (0,0) to the grip (10,0); the group is
  // stretched along x only, so widths stay true while the reach changes.
  const LIMBS = Object.freeze({
    paper: '<path d="M0 -2.8L10 -1.9L10 1.9L0 2.8Z" fill="#7a5230"/><path d="M0 -2.05L10 -1.25L10 1.25L0 2.05Z" fill="#f3e2be"/><path d="M0 -.2L10 -.12L10 .3L0 .42Z" fill="#c9a97d" opacity=".8"/>',
    ink: '<path d="M0 -3.6Q5 -2.8 10 -2.3Q10.4 0 10 2.3Q5 4.2 0 3.6Z" fill="#132a4a"/><path d="M.6 -1.9Q5 -1.4 9.4 -1.1L9.4 -.2Q5 -.4 .6 -.75Z" fill="#7be8ff" opacity=".82"/>',
    root: '<path d="M0 -2.8Q5 -3.7 10 -1.8L10 1.7Q5 3.2 0 2.8Z" fill="#6b4729"/><path d="M.6 -1.3Q5 -2.1 9.4 -.8L9.4 -.15Q5 -1.2 .6 -.4Z" fill="#9c6d44" opacity=".85"/>',
    yarn: '<path d="M0 -2.2Q5 -.7 10 -1.9L10 1.9Q5 3.2 0 2.2Z" fill="#d4543a"/><path d="M0 -1.05Q5 .35 10 -.75L10 .1Q5 1.1 0 -.15Z" fill="#ffd8b3" opacity=".8"/>',
    light: ''
  });
  const PALMS = Object.freeze({
    paper: '<path d="M-4.4 -4.2L4.7 -2L3 4.4L-5 2.2Z" fill="#f3e2be" stroke="#7a5230" stroke-width=".9" stroke-linejoin="round"/><path d="M-4.4 -4.2L0 0L3 4.4" fill="none" stroke="#7a5230" stroke-width=".6" stroke-linejoin="round"/>',
    ink: '<circle r="3.6" fill="#132a4a"/><path d="M-2.2 -1.5Q-.3 -2.8 1.8 -1.7" fill="none" stroke="#9af2ff" stroke-width=".9" stroke-linecap="round"/>',
    root: '<path d="M-2 0L3.6 -3.5M-2 0L4 2.6M-2 0L2.6 -.3" fill="none" stroke="#6b4729" stroke-width="2" stroke-linecap="round"/><path d="M.3 -1.8Q3.3 -6.2 6.2 -3.1Q3.3 -.9 .3 -1.8Z" fill="#a9c263" stroke="#4d6128" stroke-width=".7"/>',
    yarn: '<circle r="3.5" fill="none" stroke="#d4543a" stroke-width="2.3"/><path d="M-2.5 -2.2A3.4 3.4 0 0 1 1.7 -3" fill="none" stroke="#ffd8b3" stroke-width=".85" stroke-linecap="round"/>',
    light: ''
  });
  const MOTES = Object.freeze([[.38, 2.1], [.64, 1.7], [.9, 1.35]]);
  // Authored choreography was keyed for a sub-pixel envelope. Each material
  // plays it larger in its own way: paper flutters in, ink drips, clay rises
  // with weight, yarn drops and bounces, light blooms.
  const STYLES = Object.freeze({
    folio: { gain: 1.6, enter: ['translateY(5px) rotate(-9deg) scale(.9)', 'translateY(-1.8px) rotate(3.5deg) scale(1.04)'], exit: 'translateY(4px) rotate(6deg) scale(.92)' },
    ink: { gain: 1.7, enter: ['translateY(6px) scale(1.26,.5)', 'scale(.93,1.11)'], exit: 'translateY(5px) scale(1.2,.4)' },
    moss: { gain: 1.4, enter: ['translateY(8px) scale(.95)', 'translateY(-1.2px) scale(1.02,.98)'], exit: 'translateY(6px)' },
    thread: { gain: 1.7, enter: ['translateY(-8px) scale(.9)', 'translateY(1.2px) scale(1.06,.94)'], exit: 'translateY(-5px) scale(.9)' },
    glow: { gain: 1.5, enter: ['scale(.8)', 'scale(1.07)'], exit: 'scale(.86)' }
  });
  // Props whose travel would leave the 62×56 envelope at their material gain,
  // measured natively at the test's twelve phases; they play at this ceiling.
  const CEILINGS = Object.freeze(Object.fromEntries(Object.entries({
    "1.1": 'folio-coding-punch-strip folio-running-belt-loop folio-searching-window-loupe glow-running-prism-relay glow-searching-perimeter-seek ink-reading-wick-line ink-running-coil-flow ink-running-dual-channel ink-searching-loop-loupe moss-designing-silhouette-frame moss-reading-soil-strata thread-building-arched-bridge thread-coding-logic-loom thread-running-oval-carrier thread-running-weft-return thread-searching-strand-trace',
    "1.2": 'folio-designing-crease-guide folio-searching-ribbon-trace folio-testing-seam-inspect glow-running-grid-row-execution glow-running-racetrack-light glow-running-rectangular-loop ink-building-filament-bridge ink-designing-contour-loop ink-reading-drop-magnifier ink-searching-drop-lens ink-searching-ripple-map ink-testing-bridge-probe moss-running-stone-conveyor thread-building-basket-rim thread-building-rung-ladder thread-coding-ribbon-input thread-running-braid-shuttles thread-running-loom-carriage thread-running-traverse-winder thread-searching-peg-wall thread-testing-mesh-stretch thread-testing-repeat-spacing',
    "1.3": 'folio-designing-draw-arc folio-planning-route-strip folio-reading-accordion-map glow-designing-contour-light glow-running-diamond-loop glow-running-spiral-carrier glow-searching-mirror-corridor glow-searching-orbit-index glow-searching-spotlight-slots glow-testing-membrane-edge ink-designing-filament-drawing ink-planning-draw-channel ink-running-pearl-conveyor ink-searching-meniscus-window ink-searching-probe-pools moss-designing-leaf-palette moss-designing-leaf-stencil moss-designing-shape-garden moss-running-seed-track moss-searching-branch-fork thread-coding-function-wrap thread-designing-contour-board thread-reading-ribbon-bookmark thread-testing-knot-load thread-testing-ring-gauge thread-testing-tension-gate',
    "1.4": 'folio-coding-patch-tile folio-planning-grid-layout folio-reading-margin-note folio-reading-reading-window glow-designing-light-palette glow-searching-crosshair-grid ink-planning-loop-map ink-running-circulation-loop thread-building-spool-rack thread-coding-bundle-order thread-designing-scallop-edge thread-designing-woven-tile thread-searching-colour-folio',
    "1.5": 'folio-designing-swatch-fan folio-planning-sequence-cards folio-running-shuttle-track folio-testing-duplicate-compare ink-planning-layer-path ink-running-bubble-lift ink-running-relay-pools thread-searching-sample-pocket thread-searching-shuttle-drawer thread-searching-tag-fan',
    "1.6": 'ink-coding-filament-input ink-designing-swatch-droplets ink-reading-paired-mirrors ink-running-filament-shuttle ink-searching-capillary-route ink-searching-channel-branch ink-searching-pearl-sieve thread-building-corner-frame thread-testing-rub-sample'
  }).flatMap(([gain, ids]) => ids.split(' ').map(id => [id, Number(gain)]))));
  const gainFor = (species, recipe) => Math.min((STYLES[species] || STYLES.folio).gain, CEILINGS[recipe.id] || Infinity);
  const ENTER_MS = 160, EXIT_MS = 100, SETTLE_MS = 180;
  const amplified = new WeakMap();
  function amplify(transform, gain) {
    return transform.replace(/(translate[XY]?|rotate|scale[XY]?|skew[XY]?)\(([^)]*)\)/g, (match, fn, args) => fn + '(' + args.split(',').map(raw => {
      const value = raw.trim(), parsed = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(value);
      if (!parsed) return value;
      const number = Number(parsed[1]), unit = parsed[2];
      if (fn.startsWith('scale')) return number >= .6 && number <= 1.5 ? String(Math.max(.3, Number((1 + (number - 1) * gain).toFixed(4)))) : value;
      // Full turns and percentage offsets are structural; growing them would
      // break a spin's loop seam or a prop's own-size travel.
      if (unit === '%' || (unit === 'deg' && Math.abs(number) >= 90)) return value;
      return Number((number * gain).toFixed(4)) + unit;
    }).join(',') + ')');
  }
  function framesFor(track, gain) {
    let cache = amplified.get(track);
    if (!cache) amplified.set(track, cache = new Map());
    if (!cache.has(gain)) cache.set(gain, track.keyframes.map(frame => frame.transform ? { ...frame, transform: amplify(frame.transform, gain) } : { ...frame }));
    return cache.get(gain);
  }
  const round = value => Number(value.toFixed(3));
  // Static authoring transforms: `translate(x y)` and `scale(sx sy)` wrappers.
  function attributeOffset(value, point) {
    if (!value) return point;
    let { x, y } = point;
    const functions = [...value.matchAll(/(translate|scale)\(([^)]*)\)/g)].reverse();
    for (const [, fn, args] of functions) {
      const [a, b] = args.split(/[\s,]+/).filter(Boolean).map(Number);
      if (fn === 'translate') { x += a || 0; y += b || 0; }
      else { x *= Number.isFinite(a) ? a : 1; y *= Number.isFinite(b) ? b : Number.isFinite(a) ? a : 1; }
    }
    return { x, y };
  }
  function translationOf(transform) {
    let x = 0, y = 0;
    if (!transform || transform === 'none') return { x, y };
    for (const [, fn, args] of transform.matchAll(/(translate[XY]?)\(([^)]*)\)/g)) {
      const values = args.split(',').map(part => parseFloat(part));
      if (fn === 'translateX') x += values[0] || 0;
      else if (fn === 'translateY') y += values[0] || 0;
      else { x += values[0] || 0; y += values[1] || 0; }
    }
    return { x, y };
  }
  let sequence = 0;
  function markup(creature, activity, variant = 0) {
    const recipe = Repertoire.recipes(creature, activity)[variant];
    return recipe ? '<g class="cv-presence"><g class="cv-response"><g class="cv-toolset">' + recipe.markup + '</g></g></g>' : '';
  }
  function create({ document, svg, layer, creature = 'folio', bodyTarget, bodyParts } = {}) {
    if (!document || !svg || !layer) throw new TypeError('Creature tools need their existing SVG and presentation layer.');
    const view = document.defaultView;
    const group = document.createElementNS(NS, 'g'); group.setAttribute('class', 'cp-activity');
    group.setAttribute('aria-hidden', 'true');
    const clip = document.createElementNS(NS, 'clipPath'), bounds = document.createElementNS(NS, 'rect');
    clip.id = 'cv-envelope-' + (++sequence); clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    for (const [name, value] of Object.entries({ x: -31, y: -41, width: 62, height: 56 })) bounds.setAttribute(name, value);
    clip.append(bounds); svg.querySelector('defs').append(clip); group.setAttribute('clip-path', 'url(#' + clip.id + ')'); svg.append(group);
    // The limb draws after the props: the holding part is in front of what it
    // holds, while the body behind both stays painted and unbroken.
    const reach = document.createElementNS(NS, 'g'); reach.setAttribute('class', 'cp-reach'); reach.setAttribute('aria-hidden', 'true');
    reach.setAttribute('data-active', 'false'); svg.append(reach);
    let limb = null, palm = null, motes = [];
    let context = '', current = '', species = '', selection = null, incoming = null, destroyed = false, poseIndex = 0;
    let serial = 0, loopSerial = 0, loops = [], transitions = [], pendingAdvance = false, options = {};
    let quietPhase = 0, quietDelay = 0;
    const responses = new Set();
    function attr(name, value) { if (group.getAttribute(name) !== String(value)) group.setAttribute(name, String(value)); }
    function permitted() { return options.animate && !options.hidden && options.healthy; }
    function stage() { return STAGES[species] || STAGES.folio; }
    function stageX(s) { return s.x + (s.shift?.[poseIndex] || 0); }
    function placeStage() {
      const s = stage(), value = 'translate(' + stageX(s) + ' ' + s.y + ') scale(' + (s.mirror ? -s.scale : s.scale) + ' ' + s.scale + ')';
      if (group.getAttribute('transform') !== value) group.setAttribute('transform', value);
    }
    function buildReach() {
      const kind = stage().limb;
      reach.innerHTML = kind === 'light'
        ? MOTES.map((mote, index) => '<g class="cr-mote" data-reach="mote-' + index + '"><circle r="' + mote[1] + '" fill="#fff6c8" stroke="#d99b38" stroke-width=".35"/></g>').join('')
        : '<g class="cr-limb" data-reach="limb">' + LIMBS[kind] + '</g><g class="cr-palm" data-reach="palm">' + PALMS[kind] + '</g>';
      reach.setAttribute('data-limb', kind);
      limb = reach.querySelector('[data-reach="limb"]'); palm = reach.querySelector('[data-reach="palm"]');
      motes = [...reach.querySelectorAll('.cr-mote')];
      for (const node of [limb, palm, ...motes]) if (node) { node.style.transformBox = 'view-box'; node.style.transformOrigin = '0px 0px'; }
    }
    function clearTransitions() {
      for (const animation of transitions) animation.cancel(); transitions = [];
      for (const node of group.querySelectorAll('.cv-outgoing')) node.remove();
    }
    function clearResponses() { for (const response of responses) response.cancel(); responses.clear(); }
    function targets(recipe) {
      return recipe.tracks.map(track => ({ track, target: track.part === '$body' ? bodyTarget : incoming.querySelector('[data-motion="' + track.part + '"]') })).filter(item => item.target);
    }
    // The authored grip (hand, root loop, yarn loop) nearest the body is the
    // contact point; its own motion track gives the contact timeline.
    function contact(recipe) {
      if (!incoming) return null;
      const grips = [...incoming.querySelectorAll('[data-grip]')];
      for (const grip of grips) if (grip.getAttribute('data-grip') !== '1') grip.setAttribute('data-grip', '1');
      const located = grips.map(node => {
        let point = { x: 0, y: 0 };
        for (let parent = node; parent && parent !== incoming; parent = parent.parentElement) point = attributeOffset(parent.getAttribute('transform'), point);
        return { node, point, motion: node.closest('[data-motion]') };
      }).sort((a, b) => a.point.x - b.point.x);
      let chosen = located[0];
      if (!chosen) {
        const first = recipe.tracks.find(track => track.part !== '$body' && incoming.querySelector('[data-motion="' + track.part + '"]'));
        const node = first ? incoming.querySelector('[data-motion="' + first.part + '"]') : null;
        if (!node) return null;
        let point = { x: 0, y: 0 };
        for (let parent = node; parent && parent !== incoming; parent = parent.parentElement) point = attributeOffset(parent.getAttribute('transform'), point);
        chosen = { node: null, point, motion: node };
      } else chosen.node.setAttribute('data-grip', 'active');
      const part = chosen.motion?.getAttribute('data-motion');
      const track = recipe.tracks.find(item => item.part === part);
      const frames = track ? framesFor(track, gainFor(species, recipe)) : [{ offset: 0 }, { offset: 1 }];
      const s = stage(), sign = s.mirror ? -1 : 1, shoulder = s.shoulder[poseIndex] || s.shoulder[0];
      const base = translationOf(frames[0].transform);
      const timeline = frames.map((frame, index) => {
        const shift = translationOf(frame.transform);
        const local = { x: chosen.point.x + shift.x, y: chosen.point.y + shift.y };
        const x = stageX(s) + sign * s.scale * local.x, y = s.y + s.scale * local.y;
        const moved = Math.abs(shift.x - base.x) + Math.abs(shift.y - base.y) > .01;
        return { offset: frame.offset, x, y, moved, opacity: frame.opacity, easing: Repertoire.EASINGS[track?.easing] || Repertoire.EASINGS.organic, dx: sign * s.scale * (shift.x - base.x), dy: s.scale * (shift.y - base.y), index };
      });
      const anyMoved = timeline.some(frame => frame.moved);
      for (const frame of timeline) frame.w = frame.offset <= 0 || frame.offset >= 1 ? 0 : anyMoved ? (frame.moved ? 1 : 0) : 1;
      // A grip that only holds still keeps contact through the middle beats.
      if (timeline.length === 2) timeline.splice(1, 0, { ...timeline[0], offset: .22, w: 1 }, { ...timeline[1], offset: .8, w: 1 });
      const side = Math.sign((timeline[0].x) - 77.5) || sign;
      return { timeline, shoulder, side, stage: s };
    }
    // Species limb and palm, plus body posture, front foot, crown
    // follow-through and inner light: all keyed to the grip's own offsets.
    function choreograph(recipe) {
      const found = contact(recipe);
      if (!found) return [];
      const { timeline, shoulder, side, stage: s } = found, out = [];
      const frames = (map, origin, target, easing) => target ? [{ target, origin, keyframes: timeline.map((frame, index) => ({ offset: frame.offset, easing: easing || frame.easing, ...map(frame, index) })) }] : [];
      if (s.limb === 'light') {
        // Light points gather at the core, then line up toward the tool.
        motes.forEach((mote, index) => {
          const [fraction] = MOTES[index];
          out.push(...frames(frame => {
            const along = .18 + (fraction - .18) * frame.w;
            return { transform: 'translate(' + round(shoulder[0] + (frame.x - shoulder[0]) * along) + 'px,' + round(shoulder[1] + (frame.y - shoulder[1]) * along) + 'px)', opacity: round(.3 + .6 * frame.w) };
          }, '0px 0px', mote));
        });
      } else {
        let previous = null;
        const angles = timeline.map(frame => {
          let angle = Math.atan2(frame.y - shoulder[1], frame.x - shoulder[0]) * 180 / Math.PI;
          if (previous !== null) { while (angle - previous > 180) angle -= 360; while (previous - angle > 180) angle += 360; }
          previous = angle; return angle;
        });
        out.push(...frames((frame, index) => ({ transform: 'translate(' + round(shoulder[0]) + 'px,' + round(shoulder[1]) + 'px) rotate(' + round(angles[index]) + 'deg) scale(' + round(Math.max(.4, Math.hypot(frame.x - shoulder[0], frame.y - shoulder[1]) / 10)) + ',1)', ...(frame.opacity !== undefined ? { opacity: frame.opacity } : {}) }), '0px 0px', limb));
        out.push(...frames((frame, index) => ({ transform: 'translate(' + round(frame.x) + 'px,' + round(frame.y) + 'px) rotate(' + round(angles[index]) + 'deg)', ...(frame.opacity !== undefined ? { opacity: frame.opacity } : {}) }), '0px 0px', palm));
      }
      const owned = recipe.tracks.some(track => track.part === '$body');
      const posture = {
        folio: f => 'rotate(' + round(side * (3.2 * f.w) + .14 * f.dx) + 'deg) translate(' + round(side * .9 * f.w) + 'px,' + round(-.5 * f.w + .08 * f.dy) + 'px)',
        ink: f => 'translate(' + round(side * 1.8 * f.w + .12 * f.dx) + 'px,' + round(.7 * f.w) + 'px) rotate(' + round(side * 2.5 * f.w + .1 * f.dx) + 'deg) scale(' + round(1 + .06 * f.w) + ',' + round(1 - .08 * f.w) + ')',
        moss: f => 'rotate(' + round(side * 2 * f.w) + 'deg) translate(' + round(side * .5 * f.w) + 'px,' + round(.9 * f.w + .08 * Math.max(0, f.dy)) + 'px)',
        thread: f => 'rotate(' + round(side * 4.5 * f.w + .18 * f.dx) + 'deg) translate(' + round(side * 1.2 * f.w) + 'px,' + round(-.4 * f.w) + 'px)',
        glow: f => 'rotate(' + round(side * 2 * f.w) + 'deg) translate(' + round(side * 1.3 * f.w + .1 * f.dx) + 'px,0px)'
      }[species] || (() => 'none');
      if (!owned) out.push(...frames(frame => ({ transform: posture(frame) }), '77.5px 111px', bodyTarget, species === 'thread' ? Repertoire.EASINGS.settle : undefined));
      const foot = bodyParts?.[s.foot];
      const footOrigin = s.foot === 'foot-1' ? '47.5px 113px' : '107.5px 113px';
      const press = {
        folio: f => 'translate(' + round(side * 2 * f.w) + 'px,' + round(.6 * f.w) + 'px) rotate(' + round(-side * 6 * f.w) + 'deg)',
        ink: f => 'translate(' + round(side * 1.6 * f.w) + 'px,0px) scale(' + round(1 + .18 * f.w) + ',' + round(1 - .28 * f.w) + ')',
        moss: f => 'translate(' + round(side * 1.4 * f.w) + 'px,' + round(.5 * f.w) + 'px)',
        thread: f => 'translate(' + round(side * 2.2 * f.w) + 'px,' + round(-.8 * f.w) + 'px) rotate(' + round(-side * 8 * f.w) + 'deg)',
        glow: f => 'translate(' + round(side * 1.1 * f.w) + 'px,' + round(-.7 * f.w) + 'px)'
      }[species];
      if (foot && press) out.push(...frames(frame => ({ transform: press(frame) }), footOrigin, foot));
      // Ink's other soft foot alternates with the pressing one.
      const other = species === 'ink' ? bodyParts?.['foot-1'] : null;
      if (other) out.push({ target: other, origin: '47.5px 113px', keyframes: timeline.map((frame, index) => ({ offset: frame.offset, easing: frame.easing, transform: 'scale(' + round(1 + .12 * (index % 2 ? frame.w : 0)) + ',' + round(1 - .18 * (index % 2 ? frame.w : 0)) + ')' })) });
      const light = species === 'glow' ? bodyParts?.light : null;
      if (light) out.push(...frames(frame => ({ transform: 'translate(' + round(side * 3.5 * frame.w + .12 * frame.dx) + 'px,' + round(-1.5 * frame.w) + 'px) scale(' + round(1 + .4 * frame.w) + ')', opacity: round(.12 + .36 * frame.w) }), '77.5px 82px', light));
      return out;
    }
    function reachActive(value) { if (reach.getAttribute('data-active') !== String(value)) reach.setAttribute('data-active', String(value)); }
    function still(recipe) {
      for (const { track, target } of targets(recipe)) {
        const first = framesFor(track, gainFor(species, recipe))[0];
        target.style.transform = first.transform || 'none';
        if (first.opacity !== undefined) target.style.opacity = String(first.opacity);
      }
      for (const { target, origin, keyframes } of choreograph(recipe)) {
        target.style.transformBox = 'view-box'; target.style.transformOrigin = origin;
        target.style.transform = keyframes[0].transform || 'none';
        if (keyframes[0].opacity !== undefined) target.style.opacity = String(keyframes[0].opacity);
      }
      reachActive(true);
    }
    function isBody(target) { return target === bodyTarget || Boolean(bodyParts && Object.values(bodyParts).includes(target)); }
    // Painted body pieces are never frozen mid-lean: they ease back to the
    // pose, so a tool change reads as letting go rather than a cut.
    function release(target, computed) {
      const rest = target === bodyParts?.light ? '.08' : '1';
      target.style.transform = 'none'; target.style.opacity = rest;
      if (!computed || typeof target.animate !== 'function' || (computed.transform === 'none' && computed.opacity === rest)) return;
      const animation = target.animate([{ transform: computed.transform, opacity: computed.opacity }, { transform: 'none', opacity: rest }], { duration: SETTLE_MS, easing: Repertoire.EASINGS.settle });
      transitions.push(animation); animation.finished.then(() => { animation.cancel(); transitions = transitions.filter(a => a !== animation); }, () => {});
    }
    function stopLoops(freeze = false) {
      loopSerial++;
      for (const animation of loops) {
        const target = animation.effect?.target;
        if (target && isBody(target)) {
          const computed = freeze && !options.quiet && !options.hidden && view?.getComputedStyle ? view.getComputedStyle(target) : null;
          const snapshot = computed ? { transform: computed.transform, opacity: computed.opacity } : null;
          animation.cancel(); release(target, snapshot); continue;
        }
        if (freeze && target) {
          const computed = view.getComputedStyle(target);
          target.style.transform = computed.transform; target.style.opacity = computed.opacity;
        }
        animation.cancel();
      }
      loops = []; pendingAdvance = false;
      if (bodyTarget && bodyTarget.style.transform !== 'none') { bodyTarget.style.transform = 'none'; bodyTarget.style.opacity = '1'; }
    }
    function startLoops(phase = 0, delay = 0) {
      if (!incoming || !selection || !options.animate || loops.length) return;
      const epoch = ++loopSerial, recipe = selection.recipe;
      const timing = { duration: recipe.duration, iterations: selection.preview ? Infinity : selection.repeat, delay, easing: 'linear', fill: 'both' };
      const run = (target, keyframes) => {
        const animation = target.animate(keyframes, timing);
        animation.currentTime = phase;
        if (!permitted()) { animation.pause(); animation.currentTime = phase; }
        return animation;
      };
      loops = targets(recipe).map(({ track, target }) => {
        target.style.transformBox = track.part === '$body' ? 'view-box' : 'fill-box';
        target.style.transformOrigin = track.part === '$body' ? '77.5px 111px' : track.origin || 'center center';
        const keyframes = framesFor(track, gainFor(species, recipe));
        const animation = run(target, keyframes);
        // Track easing is applied between poses, never to the entire cycle:
        // its anticipation/contact/hold offsets retain their authored timing.
        animation.effect.setKeyframes(keyframes.map(frame => ({ ...frame, easing: Repertoire.EASINGS[track.easing] || Repertoire.EASINGS.organic })));
        return animation;
      });
      for (const { target, origin, keyframes } of choreograph(recipe)) {
        target.style.transformBox = 'view-box'; target.style.transformOrigin = origin;
        loops.push(run(target, keyframes));
      }
      reachActive(true);
      if (!selection.preview && loops[0]) loops[0].finished.then(() => {
        if (destroyed || epoch !== loopSerial) return;
        pendingAdvance = true;
        if (permitted()) replace(Repertoire.next(species, current, selection));
      }, () => {});
    }
    function replace(next) {
      const epoch = ++serial, previous = incoming;
      const moving = !options.quiet && !options.hidden && options.healthy;
      // Capture before cancelling entry: a prop still in its entry delay has
      // zero visible opacity and must not flash back to its base opacity.
      const computed = previous && moving ? view.getComputedStyle(previous) : null;
      const from = computed ? { opacity: computed.opacity, transform: computed.transform } : null;
      const reachFrom = previous && moving ? view.getComputedStyle(reach).opacity : null;
      clearTransitions(); clearResponses(); stopLoops(true);
      quietPhase = quietDelay = 0;
      const style = STYLES[species] || STYLES.folio;
      if (previous && moving) {
        previous.classList.add('cv-outgoing');
        const exit = previous.animate([from, { opacity: 0, transform: style.exit }], { duration: EXIT_MS, easing: Repertoire.EASINGS.settle, fill: 'forwards' });
        transitions.push(exit); exit.finished.then(() => { previous.remove(); exit.cancel(); transitions = transitions.filter(a => a !== exit); }, () => {});
      } else group.replaceChildren();
      selection = next; incoming = null;
      attr('data-recipe', next?.recipe.id || ''); attr('data-variant', next?.index ?? '');
      if (!next) { reachActive(false); return; }
      placeStage();
      const holder = document.createElementNS(NS, 'g'); holder.innerHTML = markup(species, current, next.index);
      incoming = holder.firstElementChild; group.append(incoming); still(next.recipe);
      if (moving) {
        const enter = incoming.animate([
          { opacity: 0, transform: style.enter[0], easing: Repertoire.EASINGS.settle },
          { opacity: 1, transform: style.enter[1], offset: .6, easing: Repertoire.EASINGS.organic },
          { opacity: 1, transform: 'none' }
        ], { duration: ENTER_MS, delay: previous ? EXIT_MS : 0, easing: 'linear', fill: 'backwards' });
        transitions.push(enter); enter.finished.then(() => { if (epoch === serial) { enter.cancel(); transitions = transitions.filter(a => a !== enter); } }, () => {});
        // The limb lets go of the outgoing tool and takes the next one.
        const hand = reach.animate(previous
          ? [{ opacity: reachFrom ?? 1 }, { opacity: 0, offset: EXIT_MS / (EXIT_MS + ENTER_MS) }, { opacity: 1 }]
          : [{ opacity: 0 }, { opacity: 1 }], { duration: previous ? EXIT_MS + ENTER_MS : ENTER_MS, easing: 'linear' });
        transitions.push(hand); hand.finished.then(() => { if (epoch === serial) { hand.cancel(); transitions = transitions.filter(a => a !== hand); } }, () => {});
      }
      startLoops(next.phase, moving ? previous ? EXIT_MS + ENTER_MS : ENTER_MS : 0);
    }
    function update({ activity = '', attention = false, creature: nextCreature = creature, identity = '', elapsed = 0, animate = false, quiet = false, walking = false, hidden = false, healthy = true, preview = false, repertoireIndex, poseIndex: nextPose } = {}) {
      if (destroyed) return;
      const id = Object.hasOwn(MATERIALS, nextCreature) ? nextCreature : 'folio';
      const observed = attention && activity && activity !== 'error' ? 'waiting-user' : activity;
      const state = !walking && ACTIVITIES.includes(observed) ? observed : '';
      const override = preview === true && Number.isInteger(repertoireIndex) ? repertoireIndex : undefined;
      const pose = Number.isInteger(nextPose) && nextPose >= 0 && nextPose < 6 ? nextPose : 0;
      const nextContext = JSON.stringify([id, state, identity, override, pose]);
      options = { animate: animate && Boolean(state), quiet, hidden, healthy };
      attr('data-animate', options.animate); attr('data-activity', state); attr('data-creature', id); attr('data-healthy', healthy);
      if (group.style.opacity !== (healthy ? '1' : '0')) group.style.opacity = healthy ? '1' : '0';
      if (reach.style.opacity !== (healthy ? '1' : '0')) reach.style.opacity = healthy ? '1' : '0';
      if (species !== id) {
        for (const name of ['base', 'shade', 'edge', 'light']) group.style.setProperty('--ca-' + name, MATERIALS[id][name]);
        species = id; placeStage(); buildReach();
      }
      species = id; current = state; poseIndex = pose;
      if (context !== nextContext) {
        context = nextContext; replace(state ? Repertoire.select(id, state, identity, elapsed, override) : null);
        return;
      }
      if (!options.animate) {
        clearTransitions(); clearResponses();
        if (loops.length) {
          quietPhase = Number(loops[0].currentTime) || 0; quietDelay = Number(loops[0].effect.getTiming().delay) || 0;
          stopLoops(); if (selection) still(selection.recipe);
        }
        return;
      }
      if (!permitted()) {
        clearTransitions(); clearResponses();
        for (const animation of loops) if (animation.playState === 'running' || animation.pending) {
          const time = animation.currentTime; animation.pause(); if (Number.isFinite(time)) animation.currentTime = time;
        }
      } else if (pendingAdvance) replace(Repertoire.next(species, current, selection));
      else {
        startLoops(quietPhase, quietDelay); quietPhase = quietDelay = 0;
        for (const animation of loops) if (animation.playState === 'paused') animation.play();
      }
    }
    function cue(kind) {
      if (destroyed || kind !== 'tool-success' || !permitted() || !incoming) return false;
      const target = incoming.querySelector('.cv-response');
      const pulse = target.animate([
        { transform: 'none', easing: Repertoire.EASINGS.organic },
        { transform: 'translateY(-4px) scale(1.08)', offset: .35, easing: Repertoire.EASINGS.organic },
        { transform: 'translateY(1px) scale(.97)', offset: .65, easing: Repertoire.EASINGS.organic },
        { transform: 'none' }
      ], { duration: 420, easing: 'linear' });
      responses.add(pulse); pulse.finished.then(() => { responses.delete(pulse); pulse.cancel(); }, () => { responses.delete(pulse); }); return true;
    }
    function destroy() {
      if (destroyed) return; destroyed = true; serial++; clearTransitions(); clearResponses(); stopLoops(); group.remove(); reach.remove(); clip.remove();
    }
    return Object.freeze({ update, cue, destroy, get recipe() { return selection?.recipe || null; }, get reach() { return reach; } });
  }
  return Object.freeze({ create, markup, ACTIVITIES, MATERIALS, STAGES });
});
