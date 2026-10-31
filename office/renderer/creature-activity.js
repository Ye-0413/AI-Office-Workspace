/* Material-specific choreography describes observations, never outcomes.
 * WAAPI owns complete cycles; there is no per-creature timer or frame loop. */
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
    folio: { base: '#fff0ce', shade: '#d6b58b', edge: '#8a6240', light: '#fff9e9', cycle: 3200 },
    ink: { base: '#152641', shade: '#0a1226', edge: '#32516c', light: '#8ce0ef', cycle: 2600 },
    moss: { base: '#d5a06b', shade: '#9e6a43', edge: '#664a31', light: '#b4be70', cycle: 4000 },
    thread: { base: '#ec8862', shade: '#bd523e', edge: '#874033', light: '#ffd1a3', cycle: 3200 },
    glow: { base: '#f9c762', shade: '#dd9d3d', edge: '#a97529', light: '#fff6b9', cycle: 3600 }
  });
  // Authored choreography was keyed for a sub-pixel envelope. Each material
  // plays it larger in its own way: paper flutters in, ink drips, clay rises
  // with weight, yarn drops and bounces, light blooms.
  const STYLES = Object.freeze({
    folio: { gain: 1.6, enter: ['translateY(5px) rotate(-8deg) scale(.9)', 'translateY(-1.5px) rotate(3deg) scale(1.03)'], exit: 'translateY(4px) rotate(6deg) scale(.92)' },
    ink: { gain: 1.7, enter: ['translateY(6px) scale(1.25,.5)', 'scale(.94,1.1)'], exit: 'translateY(5px) scale(1.2,.4)' },
    moss: { gain: 1.4, enter: ['translateY(8px) scale(.96)', 'translateY(-1px)'], exit: 'translateY(6px)' },
    thread: { gain: 1.7, enter: ['translateY(-8px) scale(.9)', 'translateY(1px) scale(1.05,.95)'], exit: 'translateY(-5px) scale(.9)' },
    glow: { gain: 1.5, enter: ['scale(.8)', 'scale(1.06)'], exit: 'scale(.86)' }
  });
  // Props whose travel would leave the 62×56 envelope at their material gain,
  // measured natively at the test's twelve phases; they play at this ceiling.
  const CEILINGS = Object.freeze(Object.fromEntries(Object.entries({
    "1.1": 'folio-coding-punch-strip folio-running-belt-loop folio-searching-window-loupe glow-running-prism-relay glow-searching-perimeter-seek ink-reading-wick-line ink-running-coil-flow ink-running-dual-channel ink-searching-loop-loupe moss-designing-silhouette-frame moss-reading-soil-strata thread-coding-logic-loom thread-running-oval-carrier thread-running-weft-return thread-searching-strand-trace',
    "1.2": 'folio-designing-crease-guide folio-searching-ribbon-trace folio-testing-seam-inspect glow-running-grid-row-execution glow-running-racetrack-light glow-running-rectangular-loop ink-building-filament-bridge ink-designing-contour-loop ink-reading-drop-magnifier ink-searching-drop-lens ink-searching-ripple-map ink-testing-bridge-probe moss-running-stone-conveyor thread-building-arched-bridge thread-building-basket-rim thread-building-rung-ladder thread-coding-ribbon-input thread-running-braid-shuttles thread-running-loom-carriage thread-running-traverse-winder thread-searching-peg-wall thread-testing-mesh-stretch thread-testing-repeat-spacing',
    "1.3": 'folio-designing-draw-arc folio-planning-route-strip glow-designing-contour-light glow-running-diamond-loop glow-running-spiral-carrier glow-searching-mirror-corridor glow-searching-orbit-index glow-searching-spotlight-slots glow-testing-membrane-edge ink-designing-filament-drawing ink-planning-draw-channel ink-running-pearl-conveyor ink-searching-meniscus-window ink-searching-probe-pools moss-designing-leaf-palette moss-designing-leaf-stencil moss-designing-shape-garden moss-running-seed-track moss-searching-branch-fork thread-coding-function-wrap thread-designing-contour-board thread-reading-ribbon-bookmark thread-testing-ring-gauge',
    "1.4": 'folio-coding-patch-tile folio-reading-accordion-map folio-reading-margin-note glow-designing-light-palette glow-searching-crosshair-grid ink-planning-loop-map ink-running-circulation-loop thread-building-spool-rack thread-designing-scallop-edge thread-searching-colour-folio thread-testing-knot-load thread-testing-tension-gate',
    "1.5": 'folio-designing-swatch-fan folio-planning-sequence-cards folio-running-shuttle-track folio-testing-duplicate-compare ink-planning-layer-path ink-running-relay-pools thread-coding-bundle-order thread-designing-woven-tile thread-searching-sample-pocket thread-searching-shuttle-drawer thread-searching-tag-fan',
    "1.6": 'ink-coding-filament-input ink-running-bubble-lift ink-running-filament-shuttle ink-searching-capillary-route ink-searching-channel-branch ink-searching-pearl-sieve thread-building-corner-frame thread-testing-rub-sample'
  }).flatMap(([gain, ids]) => ids.split(' ').map(id => [id, Number(gain)]))));
  const gainFor = (species, recipe) => Math.min((STYLES[species] || STYLES.folio).gain, CEILINGS[recipe.id] || Infinity);
  const ENTER_MS = 160, EXIT_MS = 100;
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
  let sequence = 0;
  function markup(creature, activity, variant = 0) {
    const recipe = Repertoire.recipes(creature, activity)[variant];
    return recipe ? '<g class="cv-presence"><g class="cv-response"><g class="cv-toolset">' + recipe.markup + '</g></g></g>' : '';
  }
  function create({ document, svg, layer, creature = 'folio', bodyTarget } = {}) {
    if (!document || !svg || !layer) throw new TypeError('Creature tools need their existing SVG and presentation layer.');
    const view = document.defaultView;
    const group = document.createElementNS(NS, 'g'); group.setAttribute('class', 'cp-activity');
    group.setAttribute('transform', 'translate(77.5 103)'); group.setAttribute('aria-hidden', 'true');
    const clip = document.createElementNS(NS, 'clipPath'), bounds = document.createElementNS(NS, 'rect');
    clip.id = 'cv-envelope-' + (++sequence); clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    for (const [name, value] of Object.entries({ x: -31, y: -41, width: 62, height: 56 })) bounds.setAttribute(name, value);
    clip.append(bounds); svg.querySelector('defs').append(clip); group.setAttribute('clip-path', 'url(#' + clip.id + ')'); svg.append(group);
    let context = '', current = '', species = '', selection = null, incoming = null, destroyed = false;
    let serial = 0, loopSerial = 0, loops = [], transitions = [], pendingAdvance = false, options = {};
    let quietPhase = 0, quietDelay = 0;
    const responses = new Set();
    function attr(name, value) { if (group.getAttribute(name) !== String(value)) group.setAttribute(name, String(value)); }
    function permitted() { return options.animate && !options.hidden && options.healthy; }
    function clearTransitions() {
      for (const animation of transitions) animation.cancel(); transitions = [];
      for (const node of group.querySelectorAll('.cv-outgoing')) node.remove();
    }
    function clearResponses() { for (const response of responses) response.cancel(); responses.clear(); }
    function targets(recipe) {
      return recipe.tracks.map(track => ({ track, target: track.part === '$body' ? bodyTarget : incoming.querySelector('[data-motion="' + track.part + '"]') })).filter(item => item.target);
    }
    function still(recipe) {
      for (const { track, target } of targets(recipe)) {
        const first = framesFor(track, gainFor(species, recipe))[0];
        target.style.transform = first.transform || 'none';
        if (first.opacity !== undefined) target.style.opacity = String(first.opacity);
      }
    }
    function stopLoops(freeze = false) {
      loopSerial++;
      for (const animation of loops) {
        const target = animation.effect?.target;
        if (freeze && target && target !== bodyTarget) {
          const computed = view.getComputedStyle(target);
          target.style.transform = computed.transform; target.style.opacity = computed.opacity;
        }
        animation.cancel();
      }
      loops = []; pendingAdvance = false;
      if (bodyTarget) { bodyTarget.style.transform = 'none'; bodyTarget.style.opacity = '1'; }
    }
    function startLoops(phase = 0, delay = 0) {
      if (!incoming || !selection || !options.animate || loops.length) return;
      const epoch = ++loopSerial, recipe = selection.recipe;
      loops = targets(recipe).map(({ track, target }) => {
        target.style.transformBox = track.part === '$body' ? 'view-box' : 'fill-box';
        target.style.transformOrigin = track.part === '$body' ? '77.5px 111px' : track.origin || 'center center';
        const keyframes = framesFor(track, gainFor(species, recipe));
        const animation = target.animate(keyframes, { duration: recipe.duration, iterations: selection.preview ? Infinity : selection.repeat, delay, easing: 'linear', fill: 'both' });
        // Track easing is applied between poses, never to the entire cycle:
        // its anticipation/contact/hold offsets retain their authored timing.
        animation.effect.setKeyframes(keyframes.map(frame => ({ ...frame, easing: Repertoire.EASINGS[track.easing] || Repertoire.EASINGS.organic })));
        animation.currentTime = phase;
        if (!permitted()) { animation.pause(); animation.currentTime = phase; }
        return animation;
      });
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
      if (!next) return;
      const holder = document.createElementNS(NS, 'g'); holder.innerHTML = markup(species, current, next.index);
      incoming = holder.firstElementChild; group.append(incoming); still(next.recipe);
      if (moving) {
        const enter = incoming.animate([
          { opacity: 0, transform: style.enter[0], easing: Repertoire.EASINGS.settle },
          { opacity: 1, transform: style.enter[1], offset: .6, easing: Repertoire.EASINGS.organic },
          { opacity: 1, transform: 'none' }
        ], { duration: ENTER_MS, delay: previous ? EXIT_MS : 0, easing: 'linear', fill: 'backwards' });
        transitions.push(enter); enter.finished.then(() => { if (epoch === serial) { enter.cancel(); transitions = transitions.filter(a => a !== enter); } }, () => {});
      }
      startLoops(next.phase, moving ? previous ? EXIT_MS + ENTER_MS : ENTER_MS : 0);
    }
    function update({ activity = '', attention = false, creature: nextCreature = creature, identity = '', elapsed = 0, animate = false, quiet = false, walking = false, hidden = false, healthy = true, preview = false, repertoireIndex } = {}) {
      if (destroyed) return;
      const id = Object.hasOwn(MATERIALS, nextCreature) ? nextCreature : 'folio';
      const observed = attention && activity && activity !== 'error' ? 'waiting-user' : activity;
      const state = !walking && ACTIVITIES.includes(observed) ? observed : '';
      const override = preview === true && Number.isInteger(repertoireIndex) ? repertoireIndex : undefined;
      const nextContext = JSON.stringify([id, state, identity, override]);
      options = { animate: animate && Boolean(state), quiet, hidden, healthy };
      attr('data-animate', options.animate); attr('data-activity', state); attr('data-creature', id); attr('data-healthy', healthy);
      if (group.style.opacity !== (healthy ? '1' : '0')) group.style.opacity = healthy ? '1' : '0';
      if (species !== id) {
        for (const name of ['base', 'shade', 'edge', 'light']) group.style.setProperty('--ca-' + name, MATERIALS[id][name]);
      }
      species = id; current = state;
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
      if (destroyed) return; destroyed = true; serial++; clearTransitions(); clearResponses(); stopLoops(); group.remove(); clip.remove();
    }
    return Object.freeze({ update, cue, destroy, get recipe() { return selection?.recipe || null; } });
  }
  return Object.freeze({ create, markup, ACTIVITIES, MATERIALS });
});
