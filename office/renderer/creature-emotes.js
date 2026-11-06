/* Authored expression cels on the same texel and foot line as the main atlas. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeCreatureEmotes = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const SPAN = 96, LEFT = 29.5, TOP = 27, COLUMNS = 18, FPS = 30;
  // OFF shows the ordinary body; BLANK shows neither body nor cel, so a
  // helper can stay unseen until its own material has gathered.
  const OFF = -1, BLANK = -2;
  // The first row is the 600ms stride. The renderer drives it by distance,
  // and the remaining clips share the same texture and cell registration.
  // Clone choreography clips run at 60 fps. `lead` and `tail` are timeline
  // beats without cels: the parent keeps its body during a lead, a forming
  // helper stays blank, and a dissolved helper stays blank through its tail.
  let count = 0;
  const CLIPS = Object.freeze(Object.fromEntries(Object.entries({
    walk: 600, blink: 200, 'glance-left': 480, 'glance-right': 480,
    greet: 620, startle: 420, rare: 1260, success: 560,
    split: { duration: 700, fps: 60 },
    absorb: { duration: 400, fps: 60, lead: 800 },
    condense: { duration: 500, fps: 60, lead: 700, leadBlank: true },
    dissolve: { duration: 500, fps: 60, tail: 700 }
  }).map(([name, spec]) => {
    const { duration, fps = FPS, lead = 0, tail = 0, leadBlank = false } = typeof spec === 'number' ? { duration: spec } : spec;
    const frames = Math.ceil(duration * fps / 1000);
    const clip = Object.freeze({ duration, fps, frames, first: count, lead, tail, leadBlank, total: lead + duration + tail });
    count += frames;
    return [name, clip];
  })));
  const ROWS = Math.ceil(count / COLUMNS);
  // Clone clips are a shared physical moment with another real body; ordinary
  // reactions wait rather than cutting them.
  const CLONE_CLIPS = Object.freeze(['split', 'absorb', 'condense', 'dissolve']);
  function appendClip(timeline, name, at, duration) {
    const clip = CLIPS[name];
    if (clip.lead) { timeline.push([at / duration, clip.leadBlank ? BLANK : OFF]); at += clip.lead; }
    for (let i = 0; i < clip.frames; i++) {
      timeline.push([(at + i * clip.duration / clip.frames) / duration, clip.first + i]);
    }
    let end = (at + clip.duration) / duration;
    if (clip.tail) { timeline.push([end, BLANK]); end = (at + clip.duration + clip.tail) / duration; }
    if (end < 1) timeline.push([end, OFF]);
  }
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
    const image = node('image', { x: LEFT, y: TOP, width: SPAN * COLUMNS, height: SPAN * ROWS, opacity: 0, 'data-pixel-emote': '' }, group);
    image.style.setProperty('--cp-walk-cels', String(CLIPS.walk.frames));
    image.style.setProperty('--cp-walk-strip-width', CLIPS.walk.frames * SPAN + 'px');
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
      const expressionFrames = timeline.map(([offset, cel]) => {
        const index = Math.max(0, cel);
        const x = -(index % COLUMNS) * SPAN, y = -Math.floor(index / COLUMNS) * SPAN;
        return { offset, opacity: Number(cel >= 0), transform: 'translate(' + x + 'px,' + y + 'px)', easing: 'step-end' };
      });
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
      const timeline = [[0, OFF]];
      appendClip(timeline, 'blink', period * .29, period);
      appendClip(timeline, seed % 2 ? 'glance-left' : 'glance-right', period * .68, period);
      appendClip(timeline, 'blink', period * .87, period);
      play('idle', period, timeline, Infinity, idleTime ?? seed % period);
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
        if (destroyed || probe !== request || ready || request.naturalWidth !== SPAN * COLUMNS || request.naturalHeight !== SPAN * ROWS) return;
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

    function locked() { return Boolean(owner) && CLONE_CLIPS.includes(owner.name); }
    function cue(name, direction) {
      if (!ready || !canStart() || owner?.name === 'rare' && name !== 'rare') return false;
      if (locked() && !CLONE_CLIPS.includes(name)) return false;
      const clipName = name === 'glance' ? (direction < 0 ? 'glance-left' : 'glance-right') : name;
      if (clipName === 'walk' || !Object.hasOwn(CLIPS, clipName)) return false;
      const duration = CLIPS[clipName].total, timeline = [];
      appendClip(timeline, clipName, 0, duration);
      if (owner?.name === 'idle') idleTime = owner.animations[0].currentTime;
      stop();
      return play(name, duration, timeline);
    }

    return Object.freeze({ update, cue, refresh, locked, destroy() {
      destroyed = true;
      stop();
      if (probe) probe.onload = null;
      group.remove();
      clip.remove();
    } });
  }
  return Object.freeze({ create, CLIPS, CLONE_CLIPS, SPAN, COLUMNS, ROWS });
});
