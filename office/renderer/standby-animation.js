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
    folio: '<path class="standby-toy" d="M98 88H102V86H108V84H114V88H112V94H108V92H104V94H102V90H98Z" fill="#efd79d" stroke="#856340" stroke-width="2"/>',
    ink: '<path class="standby-toy" d="M104 86H108V90H112V96H110V98H102V96H100V92H102V90H104Z" fill="#78b6dd" stroke="#263856" stroke-width="2"/>',
    moss: '<g class="standby-toy"><path d="M106 98V90H102V88H100V84H104V86H108V82H114V86H110V90H108V98Z" fill="#a8bd78" stroke="#5d6d36" stroke-width="2"/><path d="M100 96H112V100H100Z" fill="#a97b55"/></g>',
    thread: '<g class="standby-toy"><path d="M102 86H110V88H112V96H110V98H102V96H100V90H102Z" fill="#df907a" stroke="#6c4653" stroke-width="2"/><path d="M102 90H106V92H110M102 94H108V96H112" fill="none" stroke="#ffbe98" stroke-width="2"/></g>',
    glow: '<path class="standby-toy" d="M104 84H108V88H112V94H108V98H104V94H100V88H104Z" fill="#f5d47e" stroke="#9f684b" stroke-width="2"/>'
  });
  function seed(value) {
    let hash = 2166136261;
    for (const letter of String(value)) { hash ^= letter.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }
  function frames(material, phase) {
    const play = {
      folio: [[0, 0], [-2, -4], [2, 0], [0, -2], [0, 0]],
      ink: [[0, 0], [-2, 0], [0, -4], [2, 0], [0, 0]],
      moss: [[0, 0], [-2, 0], [0, 0], [2, 0], [0, 0]],
      thread: [[0, 0], [2, -6], [-2, 0], [2, -4], [0, 0]],
      glow: [[0, 0], [0, -2], [2, -4], [0, -2], [0, 0]]
    };
    const cels = phase === 'doze' ? [[0, 0], [0, -2], [0, 0]] : play[material];
    return cels.map(([x, y]) => ({ transform: 'translate(' + x + 'px,' + y + 'px)' }));
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
      overlay.innerHTML = '<g class="standby-sleep"><path d="M106 70H112V72H110V74H108V76H114M114 60H122V62H120V64H118V66H116V68H124"/></g><g class="standby-play">' + PROPS[material] + '</g>';
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
      const add = (target, keyframes) => {
        if (!target?.animate) return;
        const motion = target.animate(keyframes.map(frame => ({ ...frame, easing: 'steps(2,end)' })), { duration: DURATION, fill: 'both' });
        motion.finished.catch(() => {});
        if (initial) motion.currentTime = identitySeed % DURATION;
        motions.push(motion);
      };
      add(shell, frames(material, phase));
      add(overlay.querySelector('.standby-sleep'), [
        { opacity: 0, transform: 'translate(0,2px)' },
        { opacity: .8, transform: 'translate(2px,-4px)', offset: .5 },
        { opacity: 0, transform: 'translate(4px,-8px)' }
      ]);
      add(overlay.querySelector('.standby-toy'), phase === 'play'
        ? [
          { transform: 'none', opacity: .6 },
          { transform: material === 'thread' ? 'translateX(-6px)' : 'translateY(-6px)', opacity: 1, offset: .45 },
          { transform: 'translateY(-2px)', opacity: .9, offset: .65 },
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
