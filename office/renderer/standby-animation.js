/* Visual waiting between observed tasks. Never advances a work clock or
 * creates a session, completion, question, tool call or success claim. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeStandbyAnimation = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg', DURATION = 6000;
  const MATERIALS = Object.freeze(['folio', 'ink', 'moss', 'thread', 'glow']);
  const PHASES = Object.freeze(['doze', 'doze', 'play']);
  const PROPS = Object.freeze({
    folio: '<path class="standby-toy" d="m102 87 9-3-3 11-3-4-5 1Z" fill="#e9cf96" stroke="#967553" stroke-width=".7"/><path d="m102 87 3 4 6-7" fill="none" stroke="#b08b5e" stroke-width=".6"/>',
    ink: '<g class="standby-toy" fill="#b6cec4"><ellipse cx="105" cy="94" rx="3" ry="1.2"/><path d="M106 85c-1 2-3 4-3 6a3 3 0 0 0 6 0c0-2-2-4-3-6Z"/></g>',
    moss: '<g class="standby-toy"><path d="M106 96q-2-8 3-12" fill="none" stroke="#7e8f50" stroke-width="1"/><path d="M106 90q-7-5-6-1 1 5 6 1m1-3q5-7 6-3 0 4-6 3" fill="#a4b677"/><ellipse cx="104" cy="97" rx="3" ry="1" fill="#8a7254"/></g>',
    thread: '<g class="standby-toy" fill="none" stroke="#d4b49e" stroke-width="1"><circle cx="106" cy="94" r="4"/><path d="m103 91 6 6m-8-3 9-1m-4-3 1 8m-5-2q-5 4-5 0"/></g>',
    glow: '<g class="standby-toy" fill="none" stroke="#ddbc7b" stroke-width=".8"><path d="m106 84 4 7-4 7-4-7Z"/><ellipse cx="106" cy="92" rx="7" ry="2"/></g>'
  });
  function seed(value) {
    let hash = 2166136261;
    for (const letter of String(value)) { hash ^= letter.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }
  function frames(material, phase) {
    // All endpoints return to the authored material silhouette. Gestures stay
    // inside the body; the actor's own position never translates.
    const doze = {
      folio: ['none', 'rotate(-2.5deg) scale(1.02,.96)', 'none'],
      ink: ['none', 'scale(1.07,.91)', 'none'],
      moss: ['none', 'translateY(1.2px) scale(1.02,.97)', 'none'],
      thread: ['none', 'rotate(3deg) scale(1.03,.96)', 'none'],
      glow: ['none', 'translateY(1.5px) scale(.98,1.02)', 'none']
    };
    const play = {
      folio: ['none', 'translateY(-4px) rotate(-5deg)', 'rotate(4deg)', 'translateY(-2px) rotate(-2deg)', 'none'],
      ink: ['none', 'scale(1.1,.88)', 'translateY(-3px) scale(.92,1.1)', 'scale(1.04,.97)', 'none'],
      moss: ['none', 'rotate(-3deg) skewX(2deg)', 'none', 'rotate(2.5deg) skewX(-2deg)', 'none'],
      thread: ['none', 'translateY(-5px) rotate(-8deg)', 'scale(1.06,.94)', 'translateY(-2px) rotate(5deg)', 'none'],
      glow: ['none', 'translateY(-4px) rotate(2deg)', 'translateY(-2px) rotate(-2deg)', 'none']
    };
    return (phase === 'doze' ? doze : play)[material].map(transform => ({ transform }));
  }
  function create({ actorNode, body, onPhaseChange } = {}) {
    if (!actorNode || !body?.ownerDocument) throw new TypeError('Standby motion needs an observed actor and its body.');
    const document = body.ownerDocument, view = document.defaultView;
    const media = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    let destroyed = false, active = false, cycle = 0, generation = 0, shell = null, overlay = null, material = '', motions = [], paused = false, boundaryPending = false, input = {};
    const identitySeed = seed(actorNode.dataset.sessionId || actorNode.id || 'standby');
    const attribute = (name, value) => {
      if (actorNode.dataset[name] === value) return;
      actorNode.dataset[name] = value;
      // Presentation may choose a resting/awake painted pose at the same
      // boundary. Defer notification so an ordinary renderer refresh cannot
      // recursively create a second set of native animation owners.
      if (typeof onPhaseChange === 'function') Promise.resolve().then(() => {
        if (!destroyed && active && actorNode.dataset[name] === value) onPhaseChange(value);
      }).catch(() => {});
    };
    function clear() {
      generation += 1;
      for (const motion of motions) motion.cancel();
      motions = []; paused = false; boundaryPending = false;
      overlay?.remove(); overlay = null; shell = null;
      delete actorNode.dataset.standbyMotion;
    }
    function mount() {
      const nextShell = body.querySelector('.cp-shell'), rig = body.querySelector('.creature-rig');
      const nextMaterial = MATERIALS.includes(actorNode.dataset.bodyDesign) ? actorNode.dataset.bodyDesign
        : MATERIALS.includes(body.querySelector('.creature-performance')?.dataset.creature) ? body.querySelector('.creature-performance').dataset.creature : 'folio';
      if (!rig || !nextShell) return false;
      if (shell === nextShell && material === nextMaterial && overlay?.parentNode === rig) return true;
      clear(); shell = nextShell; material = nextMaterial;
      overlay = document.createElementNS(NS, 'g');
      overlay.setAttribute('class', 'standby-decoration'); overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '<g class="standby-sleep"><path d="m106 70 4 0-4 4h4m4-11h5l-5 5h5"/></g><g class="standby-play">' + PROPS[material] + '</g>';
      rig.append(overlay);
      return true;
    }
    function quiet() { return Boolean(input.reducedMotion || input.lowPower || media?.matches); }
    function hidden() { return Boolean(input.hidden || document.hidden); }
    function startCycle(initial = false) {
      const owner = ++generation, phase = PHASES[cycle % PHASES.length];
      boundaryPending = false;
      for (const motion of motions) motion.cancel(); motions = [];
      attribute('standbyMotion', phase);
      overlay.setAttribute('data-phase', phase);
      const ease = view?.getComputedStyle?.(actorNode).getPropertyValue('--ease-in-out').trim() || 'cubic-bezier(.77,0,.175,1)';
      const add = (target, keyframes) => {
        if (!target?.animate) return;
        const motion = target.animate(keyframes, { duration: DURATION, easing: ease, fill: 'both' });
        motion.finished.catch(() => {});
        if (initial) motion.currentTime = identitySeed % DURATION;
        motions.push(motion);
      };
      add(shell, frames(material, phase));
      add(overlay.querySelector('.standby-sleep'), [
        { opacity: 0, transform: 'translate(0,2px) scale(.8)' },
        { opacity: .8, transform: 'translate(2px,-3px) scale(1)', offset: .5 },
        { opacity: 0, transform: 'translate(4px,-7px) scale(1.1)' }
      ]);
      add(overlay.querySelector('.standby-toy'), phase === 'play'
        ? [
          { transform: 'none', opacity: .6 },
          { transform: material === 'thread' ? 'translateX(-5px) rotate(-40deg)' : 'translateY(-5px) rotate(14deg)', opacity: 1, offset: .45 },
          { transform: 'scale(1.1,.9)', opacity: .9, offset: .65 },
          { transform: 'none', opacity: .6 }
        ]
        : [{ opacity: 0 }, { opacity: 0 }]);
      const driver = motions[0];
      driver?.finished.then(() => {
        if (destroyed || !active || generation !== owner || quiet()) return;
        if (hidden()) { boundaryPending = true; return; }
        cycle += 1; startCycle();
      }).catch(() => {});
      syncPause();
    }
    function syncPause() {
      const shouldPause = hidden();
      if (paused === shouldPause) return;
      paused = shouldPause;
      if (!shouldPause && boundaryPending) { cycle += 1; startCycle(); return; }
      for (const motion of motions) {
        if (shouldPause) { const at = motion.currentTime; motion.pause(); if (Number.isFinite(at)) motion.currentTime = at; }
        else motion.play();
      }
    }
    function update(value = input) {
      if (destroyed) return;
      input = { ...value };
      const nextActive = Boolean(input.standby && !input.walking && !input.departing && !input.attention && !input.stale);
      if (!nextActive) { if (active || overlay) clear(); active = false; return; }
      const entering = !active; active = true;
      if (!mount()) return;
      if (quiet()) {
        if (motions.length) { generation += 1; for (const motion of motions) motion.cancel(); motions = []; paused = false; }
        attribute('standbyMotion', 'static'); overlay.setAttribute('data-phase', 'doze');
      } else if (!motions.length) {
        if (entering) cycle = identitySeed % PHASES.length;
        startCycle(entering);
      } else syncPause();
    }
    const refresh = () => update(input);
    media?.addEventListener?.('change', refresh); document.addEventListener?.('visibilitychange', refresh);
    function destroy() {
      if (destroyed) return;
      destroyed = true; clear(); active = false;
      media?.removeEventListener?.('change', refresh); document.removeEventListener?.('visibilitychange', refresh);
    }
    return Object.freeze({ update, destroy, get state() { return Object.freeze({ active, phase: actorNode.dataset.standbyMotion || '', paused, cycles: cycle, animations: motions.length }); } });
  }
  return Object.freeze({ create, MATERIALS, DURATION });
});
