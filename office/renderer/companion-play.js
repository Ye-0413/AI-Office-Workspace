/* Local play with companions: a hover glance, petting by slow strokes, and a
 * yarn ball that draws a look. Play only asks a body for a finite cosmetic
 * cue; it never changes a session, a seat, a route or an observation clock. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCompanionPlay = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const GLANCE_GAP_MS = 6000, PET_GAP_MS = 4000, TOY_GAP_MS = 1500;
  const STROKE_PX = 6, STROKES = 3, STROKE_WINDOW_MS = 1200;

  function create({ office, getActors, getContext, tr = value => value, now = () => Date.now() } = {}) {
    if (!office?.ownerDocument) throw new TypeError('Companion play needs the office element.');
    const document = office.ownerDocument;
    const last = new Map(), strokes = new Map(), hearts = new Set();
    let toyAt = -Infinity, destroyed = false;
    const context = () => ({ hidden: false, reducedMotion: false, lowPower: false, ...(getContext?.() || {}) });
    const quiet = () => { const value = context(); return destroyed || value.hidden || value.reducedMotion || value.lowPower; };

    function actorFor(target) {
      const node = target?.closest?.('.actor[data-session-id]');
      if (!node) return null;
      for (const actor of getActors?.()?.values?.() || []) if (actor.node === node) return actor;
      return null;
    }
    // Busy bodies are walking, arriving, leaving or already greeting.
    function free(actor) {
      return actor && actor.performance && !actor.entryPending && !actor.navigation && !actor.motion && !actor.departing
        && actor.node.dataset.reaction !== 'true' && actor.node.dataset.walking !== 'true' && !actor.spec?.stale;
    }
    function due(actor, kind, gap) {
      const key = actor.id + '/' + kind, time = now();
      if (time - (last.get(key) ?? -Infinity) < gap) return false;
      last.set(key, time);
      return true;
    }
    function side(actor, x) {
      const box = actor.node.getBoundingClientRect?.();
      return box && Number.isFinite(x) ? Math.sign(x - (box.left + box.width / 2)) || 1 : 1;
    }

    function heart(actor) {
      const mark = document.createElement('span');
      mark.className = 'companion-heart';
      mark.setAttribute('aria-hidden', 'true');
      actor.node.append(mark);
      hearts.add(mark);
      const done = () => { hearts.delete(mark); mark.remove(); };
      const animation = mark.animate?.([
        { opacity: 0, transform: 'translate(-50%, 0) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%, -10px) scale(1)', offset: .3 },
        { opacity: 0, transform: 'translate(-50%, -26px) scale(.9)' }
      ], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (animation?.finished) animation.finished.then(done, done); else done();
    }

    function glance(actor, x) {
      if (quiet() || !free(actor) || !due(actor, 'glance', GLANCE_GAP_MS)) return false;
      return Boolean(actor.performance.cue?.('glance', { direction: side(actor, x) }));
    }
    function pet(actor) {
      if (quiet() || !free(actor) || !due(actor, 'pet', PET_GAP_MS)) return false;
      if (!actor.performance.cue?.('greet')) return false;
      heart(actor);
      return true;
    }

    function onOver(event) {
      const actor = actorFor(event.target);
      if (!actor || actorFor(event.relatedTarget) === actor) return;
      glance(actor, event.clientX);
    }
    function onMove(event) {
      if (event.buttons || event.pointerType === 'touch') return;
      const actor = actorFor(event.target);
      if (!actor) return;
      const time = now(), track = strokes.get(actor.id) || { x: event.clientX, direction: 0, turns: [] };
      const dx = event.clientX - track.x;
      if (Math.abs(dx) >= STROKE_PX) {
        const direction = Math.sign(dx);
        if (track.direction && direction !== track.direction) track.turns.push(time);
        track.direction = direction; track.x = event.clientX;
      }
      track.turns = track.turns.filter(at => time - at <= STROKE_WINDOW_MS);
      strokes.set(actor.id, track);
      if (track.turns.length >= STROKES && pet(actor)) track.turns = [];
    }
    function onLeave(event) {
      const actor = actorFor(event.target);
      if (actor && actorFor(event.relatedTarget) !== actor) strokes.delete(actor.id);
    }

    const toy = document.createElement('button');
    toy.type = 'button';
    toy.className = 'companion-toy';
    const label = () => tr('毛线球：点一下，大家会看过来');
    toy.setAttribute('aria-label', label()); toy.title = label();
    function toss() {
      if (destroyed || now() - toyAt < TOY_GAP_MS) return 0;
      toyAt = now();
      const box = toy.getBoundingClientRect?.(), x = box ? box.left + box.width / 2 : NaN;
      if (!quiet()) {
        toy.animate?.([{ transform: 'none' }, { transform: 'translateX(18px) rotate(220deg)', offset: .55 }, { transform: 'translateX(14px) rotate(200deg)', offset: .75 }, { transform: 'none' }],
          { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
      let looked = 0;
      for (const actor of getActors?.()?.values?.() || []) if (glance(actor, x)) looked++;
      return looked;
    }
    toy.addEventListener('click', toss);
    office.append(toy);

    office.addEventListener('pointerover', onOver);
    office.addEventListener('pointermove', onMove);
    office.addEventListener('pointerout', onLeave);

    return Object.freeze({
      glance, pet, toss, toy,
      relabel() { toy.setAttribute('aria-label', label()); toy.title = label(); },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        office.removeEventListener('pointerover', onOver);
        office.removeEventListener('pointermove', onMove);
        office.removeEventListener('pointerout', onLeave);
        toy.removeEventListener('click', toss);
        toy.remove();
        for (const mark of hearts) mark.remove();
        hearts.clear(); strokes.clear(); last.clear();
      }
    });
  }

  return Object.freeze({ GLANCE_GAP_MS, PET_GAP_MS, create });
});
