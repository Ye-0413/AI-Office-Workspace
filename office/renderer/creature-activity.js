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
        const first = track.keyframes[0];
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
        const animation = target.animate(track.keyframes, { duration: recipe.duration, iterations: selection.preview ? Infinity : selection.repeat, delay, easing: 'linear', fill: 'both' });
        // Track easing is applied between poses, never to the entire cycle:
        // its anticipation/contact/hold offsets retain their authored timing.
        animation.effect.setKeyframes(track.keyframes.map(frame => ({ ...frame, easing: Repertoire.EASINGS[track.easing] || Repertoire.EASINGS.organic })));
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
      if (previous && moving) {
        previous.classList.add('cv-outgoing');
        const exit = previous.animate([from, { opacity: 0, transform: 'translateY(3px)' }], { duration: 100, easing: Repertoire.EASINGS.settle, fill: 'forwards' });
        transitions.push(exit); exit.finished.then(() => { previous.remove(); exit.cancel(); transitions = transitions.filter(a => a !== exit); }, () => {});
      } else group.replaceChildren();
      selection = next; incoming = null;
      attr('data-recipe', next?.recipe.id || ''); attr('data-variant', next?.index ?? '');
      if (!next) return;
      const holder = document.createElementNS(NS, 'g'); holder.innerHTML = markup(species, current, next.index);
      incoming = holder.firstElementChild; group.append(incoming); still(next.recipe);
      if (moving) {
        const enter = incoming.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 160, delay: previous ? 100 : 0, easing: Repertoire.EASINGS.settle, fill: 'backwards' });
        transitions.push(enter); enter.finished.then(() => { if (epoch === serial) { enter.cancel(); transitions = transitions.filter(a => a !== enter); } }, () => {});
      }
      startLoops(next.phase, moving ? previous ? 260 : 160 : 0);
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
      const pulse = target.animate([{ transform: 'none' }, { transform: 'translateY(1px)', offset: .45 }, { transform: 'none' }], { duration: 220, easing: Repertoire.EASINGS.settle });
      responses.add(pulse); pulse.finished.then(() => { responses.delete(pulse); pulse.cancel(); }, () => { responses.delete(pulse); }); return true;
    }
    function destroy() {
      if (destroyed) return; destroyed = true; serial++; clearTransitions(); clearResponses(); stopLoops(); group.remove(); clip.remove();
    }
    return Object.freeze({ update, cue, destroy, get recipe() { return selection?.recipe || null; } });
  }
  return Object.freeze({ create, markup, ACTIVITIES, MATERIALS });
});
