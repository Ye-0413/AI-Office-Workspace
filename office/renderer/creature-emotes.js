/* Authored expression cels on the same texel and foot line as the main atlas. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureEmotes = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const SPAN = 96, LEFT = 29.5, TOP = 27, COUNT = 9;
  const CEL = Object.freeze({
    blink: 0, left: 1, right: 2, greetIn: 3, greetOut: 4, startle: 5, rareIn: 6, rareOut: 7, success: 8
  });
  const OFF = -1;
  const CUES = Object.freeze({
    greet: [620, [[0, CEL.greetIn], [.24, CEL.greetOut], [.48, CEL.greetIn], [.69, CEL.greetOut], [.89, OFF]]],
    startle: [360, [[0, CEL.startle], [.47, CEL.blink], [.72, OFF]]],
    rare: [1260, [[0, CEL.rareIn], [.23, CEL.rareOut], [.55, CEL.rareIn], [.68, CEL.rareOut], [.87, OFF]]],
    success: [520, [[0, CEL.success], [.76, OFF]]]
  });
  function hash(value) {
    let seed = 2166136261;
    for (const letter of value) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
    return seed >>> 0;
  }

  function create({ document, parent, body, defs, id, canStart }) {
    const node = (tag, attributes, owner) => {
      const element = document.createElementNS(NS, tag);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
      owner.append(element);
      return element;
    };
    const clip = node('clipPath', { id: id + '-emote-cell' }, defs);
    node('rect', { x: LEFT, y: TOP, width: SPAN, height: SPAN }, clip);
    const group = node('g', { class: 'cp-emotes', 'clip-path': 'url(#' + clip.id + ')', 'data-ready': 'false' }, parent);
    const image = node('image', { x: LEFT, y: TOP, width: SPAN * COUNT, height: SPAN, opacity: 0, 'data-pixel-emote': '' }, group);
    let config = {}, owner = null, probe = null, idleTime = null, ready = false, destroyed = false;

    function stop() {
      const previous = owner;
      owner = null;
      for (const animation of previous?.animations || []) animation.cancel();
    }

    function play(name, duration, beats, iterations = 1, phase = 0) {
      if (typeof image.animate !== 'function' || typeof body.animate !== 'function') return false;
      const timeline = [...beats, [1, OFF]];
      const bodyFrames = timeline.map(([offset, cel]) => ({ offset, opacity: Number(cel === OFF), easing: 'step-end' }));
      const expressionFrames = timeline.map(([offset, cel]) => ({
        offset, opacity: Number(cel !== OFF), transform: 'translateX(' + (-Math.max(0, cel) * SPAN) + 'px)', easing: 'step-end'
      }));
      const timing = { duration, iterations, fill: 'both' };
      const animations = [body.animate(bodyFrames, timing), image.animate(expressionFrames, timing)];
      const record = { name, animations };
      owner = record;
      const clock = document.timeline?.currentTime;
      for (const animation of animations) {
        if (Number.isFinite(clock)) animation.startTime = clock - phase;
        else animation.currentTime = phase;
        animation.finished.catch(() => {});
      }
      if (iterations === 1) animations[0].finished.then(() => {
        if (owner !== record) return;
        stop();
        refresh();
      }, () => {});
      return true;
    }

    function refresh() {
      if (destroyed || owner || !ready || !config.idle || !canStart()) return;
      const seed = hash(config.identity + '/' + config.species), period = 6400 + seed % 1900;
      const glance = seed % 2 ? CEL.left : CEL.right;
      play('idle', period, [[0, OFF], [.29, CEL.blink], [.29 + 110 / period, OFF],
        [.68, glance], [.68 + 300 / period, OFF], [.87, CEL.blink], [.87 + 100 / period, OFF]],
      Infinity, idleTime ?? seed % period);
      idleTime = null;
    }

    function load(species) {
      ready = false;
      group.setAttribute('data-ready', 'false');
      if (probe) probe.onload = null;
      const href = '../assets/avatars/pixel-emotes-' + species + '.png';
      image.setAttribute('href', href);
      const request = document.createElement('img');
      probe = request;
      const decoded = () => {
        if (destroyed || probe !== request || ready || request.naturalWidth !== SPAN * COUNT / 2 || request.naturalHeight !== SPAN / 2) return;
        ready = true;
        group.setAttribute('data-ready', 'true');
        refresh();
      };
      probe.onload = decoded;
      probe.src = href;
      if (probe.complete) decoded();
    }

    function update(next) {
      const speciesChanged = config.species !== next.species;
      if (speciesChanged || config.identity !== next.identity || next.disabled) {
        stop();
        idleTime = null;
      } else if (!next.idle && owner?.name === 'idle') {
        stop();
        idleTime = null;
      }
      config = next;
      if (speciesChanged) load(next.species);
      refresh();
    }

    function cue(name, direction) {
      if (!ready || !canStart() || owner?.name === 'rare' && name !== 'rare') return false;
      const entry = name === 'glance' ? [480, [[0, direction < 0 ? CEL.left : CEL.right], [.84, OFF]]] : CUES[name];
      if (!entry) return false;
      if (owner?.name === 'idle') idleTime = owner.animations[0].currentTime;
      stop();
      return play(name, ...entry);
    }

    return Object.freeze({ update, cue, refresh, destroy() {
      destroyed = true;
      stop();
      if (probe) probe.onload = null;
      group.remove();
      clip.remove();
    } });
  }
  return Object.freeze({ create });
});
