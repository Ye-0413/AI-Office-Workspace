/* Display-only counter feedback. Values update immediately; motion never queues data. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeNumberFlip = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const numeric = value => /\d/.test(value);
  function create({ getContext = () => ({}) } = {}) {
    const states = new Map();
    let disposed = false;
    const quiet = () => {
      const context = getContext();
      return Boolean(context.reducedMotion || context.lowPower || context.hidden);
    };
    function settle(state) {
      state.generation++;
      const motions = state.motions;
      state.motions = null;
      for (const motion of motions || []) motion.cancel();
      state.outgoing?.remove(); state.outgoing = null;
      delete state.node.dataset.flipping;
    }
    function update(node, value) {
      if (!node) return;
      const next = String(value ?? '');
      if (disposed || !node.ownerDocument?.createElement) { node.textContent = next; return; }
      let state = states.get(node);
      if (!state || state.face.parentNode !== node) {
        if (state) settle(state);
        const face = node.ownerDocument.createElement('span');
        face.className = 'number-value'; face.textContent = next;
        node.replaceChildren(face); node.classList.add('number-counter');
        state = { node, face, value: next, outgoing: null, motions: null, generation: 0 };
        states.set(node, state);
        return; // Initial loading, including its placeholder, has no flip.
      }
      if (quiet()) settle(state);
      const previous = state.value;
      if (previous === next) return;
      state.value = next; state.face.textContent = next;
      if (!numeric(previous) || !numeric(next) || quiet() || typeof state.face.animate !== 'function') {
        settle(state); return;
      }
      // Bursts replace the incoming value inside the existing 200ms cycle.
      // They cannot restart its clock or leave a queue of obsolete numbers.
      if (state.motions) return;
      const outgoing = node.ownerDocument.createElement('span');
      outgoing.className = 'number-outgoing'; outgoing.setAttribute('aria-hidden', 'true');
      outgoing.dataset.number = previous;
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (style) outgoing.style.font = style.font;
      const easeOut = style?.getPropertyValue('--ease-out').trim() || 'cubic-bezier(.23,1,.32,1)';
      const easeInOut = style?.getPropertyValue('--ease-in-out').trim() || 'cubic-bezier(.77,0,.175,1)';
      node.append(outgoing); state.outgoing = outgoing; node.dataset.flipping = 'true';
      const generation = ++state.generation;
      try {
        const leaving = outgoing.animate([
          { transform: 'perspective(320px) rotateX(0deg)', opacity: 1 },
          { transform: 'perspective(320px) rotateX(85deg)', opacity: 0 }
        ], { duration: 100, easing: easeInOut, fill: 'both' });
        state.motions = [leaving];
        const entering = state.face.animate([
          { transform: 'perspective(320px) rotateX(-85deg)', opacity: 0 },
          { transform: 'perspective(320px) rotateX(0deg)', opacity: 1 }
        ], { duration: 100, delay: 100, easing: easeOut, fill: 'both' });
        state.motions.push(entering);
        Promise.all(state.motions.map(motion => motion.finished)).catch(() => {}).then(() => {
          if (state.generation === generation) settle(state);
        });
      } catch { settle(state); }
    }
    function sync() { if (quiet()) for (const state of states.values()) settle(state); }
    function destroy() { disposed = true; for (const state of states.values()) settle(state); states.clear(); }
    return Object.freeze({ update, sync, destroy });
  }
  return Object.freeze({ create });
});
