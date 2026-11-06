'use strict';

// Draw silhouette, eyes and props on a half-texel grid during motion.
// Rest endpoints retain the coarser pixel clusters of the identity atlas.
const { CLIPS, CLONE_CLIPS, SPAN, COLUMNS, ROWS } = require('../renderer/creature-emotes.js');
const OUTLINE = '#242439', WHITE = '#fff1d0', GOLD = '#ffce63';
const TAU = 2 * Math.PI;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const ease = (t, from, to) => smooth((t - from) / (to - from));
const envelope = (t, attack, release) => ease(t, 0, attack) * (1 - ease(t, release, 1));

function glint(p, x, y, color = WHITE) {
  p.box(x - 1, y, 3, 1, color);
  p.box(x, y - 1, 1, 3, color);
}

function bird(p, time) {
  // A folded paper crane lifts its wings out of the companion's page stack.
  const x = 13 + 4 * time, y = -29 - 7 * time;
  const flap = 2 * Math.sin(time * Math.PI * 5);
  p.poly([[x-7,y+4],[x-5,y+1],[x-2,y+2],[x-4,y-6+flap],[x,y-4+flap],[x+3,y+1],[x+4,y-2],[x+7,y-1],[x+5,y+2],[x+3,y+5],[x-2,y+6]],OUTLINE);
  p.poly([[x-6,y+4],[x-4,y+2],[x-1,y+3],[x-3,y-5+flap],[x,y-3+flap],[x+3,y+3],[x+5,y-1],[x+6,y-1],[x+4,y+4],[x-2,y+5]],WHITE);
  p.poly([[x-1,y+3],[x+3,y+3],[x+1,y+5],[x-4,y+4]],'#c89672');
  p.dot(x+5,y,OUTLINE);
}

function bubble(p, time) {
  const x = 10 + 3 * time, y = -29 - 9 * time;
  const shine = 1.5 * Math.sin(time * Math.PI * 2);
  p.poly([[x-4,y-3],[x-1,y-5],[x+3,y-5],[x+6,y-2],[x+6,y+3],[x+3,y+6],[x-2,y+6],[x-5,y+3],[x-5,y-1]],OUTLINE);
  p.poly([[x-4,y-2],[x-1,y-4],[x+2,y-4],[x+5,y-1],[x+5,y+3],[x+2,y+5],[x-1,y+5],[x-4,y+2]],'#64a4ea');
  p.poly([[x-3,y-1],[x-1,y-3],[x+2,y-3],[x+4,y-1],[x+4,y+2],[x+1,y+4],[x-1,y+4],[x-3,y+2]],'#4b64b0');
  p.box(x-2+shine,y-2,3,1,'#a6e9ff');
  p.dot(x-3,y-1,WHITE);
  if (time > .4) glint(p,x+7+time,y+6,'#a6e9ff');
}

function bloom(p, time) {
  const x = 7 + 3 * time, y = -35 - 3 * time;
  p.box(x-1,y+1,2,6,'#345d49');
  p.poly([[x-2,y-5],[x+2,y-5],[x+3,y-3],[x+6,y-2],[x+6,y+2],[x+3,y+3],[x+2,y+5],[x-2,y+5],[x-3,y+3],[x-6,y+2],[x-6,y-2],[x-3,y-3]],OUTLINE);
  p.poly([[x-2,y-4],[x+2,y-4],[x+2,y-2],[x+5,y-2],[x+5,y+2],[x+2,y+2],[x+2,y+4],[x-2,y+4],[x-2,y+2],[x-5,y+2],[x-5,y-2],[x-2,y-2]],'#ee8890');
  p.box(x-1,y-1,3,3,GOLD);
  p.dot(x-1,y-1,WHITE);
}

function heart(p, time) {
  const x = 11 + 4 * time, y = -31 - 5 * time;
  p.poly([[x-6,y-4],[x-2,y-5],[x,y-3],[x+2,y-5],[x+6,y-4],[x+7,y],[x+6,y+3],[x,y+8],[x-6,y+3],[x-7,y]],OUTLINE);
  p.poly([[x-5,y-3],[x-2,y-4],[x,y-2],[x+2,y-4],[x+5,y-3],[x+6,y],[x+5,y+2],[x,y+7],[x-5,y+2],[x-6,y]],'#f38279');
  p.box(x-4,y-3,2,2,'#ffb68f');
  p.poly([[x+1,y-1],[x+5,y-3],[x+6,y],[x+2,y+2],[x-1,y+5],[x-3,y+4]],'#c65064');
  p.poly([[x-1,y+7],[x+1,y+7],[x+1,y+10],[x-2,y+12],[x-4,y+12],[x-4,y+11],[x-2,y+10]],'#c65064');
}

function lanternStar(p, time) {
  const x = 13 + 2 * time, y = -30 - 6 * time;
  p.poly([[x,y-7],[x+2,y-3],[x+7,y-2],[x+4,y+1],[x+4,y+6],[x,y+4],[x-4,y+6],[x-4,y+1],[x-7,y-2],[x-2,y-3]],OUTLINE);
  p.poly([[x,y-5],[x+1,y-2],[x+5,y-1],[x+3,y+1],[x+3,y+4],[x,y+3],[x-3,y+4],[x-3,y+1],[x-5,y-1],[x-1,y-2]],GOLD);
  glint(p,x,y,WHITE);
  if (time > .4) {
    p.dot(x+7,y+2,GOLD);
    p.dot(x-6,y+5,GOLD);
    p.dot(x+6,y-3,WHITE);
  }
}

const rare = { folio: bird, ink: bubble, moss: bloom, thread: heart, glow: lanternStar };

function ripple(p, y, colors) {
  p.poly([[13,-8],[15,-14],[16,y-2],[19,y-4],[22,y-3],[23,y],[22,y+3],[19,y+4],[17,-8]],OUTLINE);
  p.poly([[14,-9],[16,-14],[17,y-2],[19,y-3],[21,y-2],[22,y],[21,y+2],[19,y+3],[16,-9]],colors.color);
  p.box(18,y-2,2,1,colors.light);
}

function materialPose(species, amount, phase) {
  const sway = Math.sin(TAU * phase);
  if (species === 'folio') return { reach: -amount * (8 + 3 * sway) };
  if (species === 'ink') return { ripple: -9 - amount * (8 + 3 * sway) };
  if (species === 'moss') return { leafWave: amount * (2 + 3 * sway) };
  if (species === 'thread') return { tailWave: -10 - amount * (10 + 3 * sway) };
  return { wickWave: amount * 4 * sway, wickLift: amount * (3 + sway) };
}

function walk(species, t) {
  const phase = TAU * t;
  const stride = [0, Math.PI, Math.PI, 0].map((opposite, i) => {
    const swing = Math.sin(phase + opposite);
    return [1.8 * Math.cos(phase + opposite), Math.max(0, swing) * (i === 0 || i === 3 ? 2.2 : 1.8)];
  });
  const weight = species === 'moss' ? .55 : 1;
  const lean = .8 * Math.sin(phase) * weight;
  const spring = .016 * (1 - Math.cos(phase * 2)) * weight;
  const style = { stride, warp: (x, y) => [x + lean * Math.max(0, (-y - 5) / 28), y * (1 + spring)] };
  if (species === 'moss') style.leafWave = 2.2 * Math.sin(phase - .5);
  if (species === 'thread') style.tailWave = -11 - 2.5 * Math.sin(phase - .6);
  if (species === 'glow') Object.assign(style, { wickWave: 1.6 * Math.sin(phase - .5), wickLift: 1.2 * (1 - Math.cos(phase)) });
  return style;
}

// ---- Clone choreography ----------------------------------------------------
// A parent anticipates and lets go of its own material (split), later taking
// it back in (absorb). The helper gathers from that material at the parent's
// feet (condense) or returns to it (dissolve). Each beat is physical and
// finite; none of them says that work began, ended or succeeded.
const SEED_DARK = '#4a3328', LEAF = '#79aa58';
const scaleAbout = (sx, sy, cx = 0, cy = 0) => (x, y) => [cx + (x - cx) * sx, cy + (y - cy) * sy];
const rotateAbout = (angle, cx, cy) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const compose = (...warps) => (x, y) => warps.reduce(([a, b], warp) => warp(a, b), [x, y]);
// Paper folds in discrete beats: hold, snap, hold.
function folds(t, values, snap = .55) {
  const n = values.length - 1, s = Math.min(n - 1e-9, Math.max(0, t) * n), k = Math.floor(s);
  return values[k] + (values[k + 1] - values[k]) * ease(s - k, 0, snap);
}
function mote(p, x, y, size, color = GOLD) {
  p.box(x - size, y - size, 2 * size + 1, 2 * size + 1, color);
  p.box(x - size - 1, y, 2 * size + 3, 1, color);
  p.box(x, y - size - 1, 1, 2 * size + 3, color);
  p.dot(x, y, WHITE);
}
function seed(p, x, y, stem = 0) {
  p.box(x - 2, y - 4, 4, 4, SEED_DARK);
  p.dot(x - 1, y - 4, LEAF);
  if (stem > .2) {
    p.box(x, y - 4 - stem, 1, stem, LEAF);
    p.box(x + 1, y - 4 - stem, 2, 1, '#bdd979');
  }
}
function strand(p, x, y, length, colors) {
  p.box(x, y, length, 1, colors.color);
  p.box(x + length - 2, y - 2, 2, 2, colors.mid);
  p.dot(x + length - 1, y - 1, colors.light);
}

const clone = {
  split(species, t, colors) {
    // Anticipation flattens the body into its own material; release springs
    // back a little taller, then the eyes settle on the ground in front.
    const squash = ease(t, 0, .42) * (1 - ease(t, .42, .66));
    const spring = Math.sin(Math.PI * ease(t, .6, .92));
    const base = { eyelid: .45 * ease(t, .7, .86), phase: Math.floor(t * 10) % 4 };
    if (species === 'folio') return { style: { ...base, warp: scaleAbout(1 + .16 * squash - .05 * spring, 1 - .32 * squash + .08 * spring), exertion: squash > .15 || spring > .2 } };
    if (species === 'ink') return { style: { ...base, warp: scaleAbout(1 + .34 * squash - .05 * spring, 1 - .42 * squash + .1 * spring), ripple: squash > .2 ? -9 - 8 * squash : 0 } };
    if (species === 'moss') {
      const lean = .38 * squash;
      return { style: { ...base, warp: (x, y) => [x + y * lean, y * (1 - .14 * squash + .05 * spring)], leafWave: -4 * squash + 3 * spring } };
    }
    if (species === 'thread') {
      const pull = ease(t, .3, .62) * (1 - ease(t, .8, 1));
      return { style: { ...base, warp: scaleAbout(1 + .14 * squash, 1 - .24 * squash + .08 * spring), tailWave: -10 + 7 * pull } };
    }
    return { style: { ...base, warp: scaleAbout(1 + .1 * squash, 1 - .16 * squash + .07 * spring), wickLift: 5 - 5 * squash + 4 * spring, exertion: spring > .3 } };
  },
  absorb(species, t, colors) {
    // One welcoming beat as the returned material settles back in.
    const a = envelope(t, .3, .62);
    const base = { happy: a > .4, phase: Math.floor(t * 8) % 4 };
    if (species === 'folio') return { style: { ...base, warp: scaleAbout(1 - .16 * a, 1 + .1 * a), exertion: a > .2 } };
    if (species === 'ink') return { style: { ...base, warp: scaleAbout(1 - .08 * a, 1 + .18 * a), ripple: a > .2 ? -9 - 6 * a : 0 } };
    if (species === 'moss') return { style: { ...base, warp: scaleAbout(1 + .04 * a, 1 + .1 * a), leafWave: 4 * Math.sin(TAU * t) * a } };
    if (species === 'thread') return { style: { ...base, warp: scaleAbout(1 - .12 * a, 1 - .12 * a), tailWave: -10 - 10 * a } };
    return { style: { ...base, warp: scaleAbout(1 + .03 * a, 1 + .06 * a), wickLift: 5 + 4 * a, exertion: a > .3 },
      after: p => { if (a > .5) { glint(p, 11, -29, GOLD); glint(p, -13, -27, WHITE); } } };
  },
  condense(species, t, colors) {
    // The helper gathers from a slip, puddle, seed, strand or light mote at
    // the parent's feet. Feet appear once there is a body to stand on them.
    if (species === 'folio') {
      const sy = folds(t, [.1, .38, .72, 1.06, 1]), sx = folds(t, [1.7, 1.35, 1.1, .98, 1]);
      return { style: { warp: scaleAbout(sx, sy), eyes: t < .78 ? 'closed' : 'open', hideFeet: t < .7 } };
    }
    if (species === 'ink') {
      const g = ease(t, 0, .78), over = .08 * Math.sin(Math.PI * ease(t, .6, 1));
      return { style: { warp: scaleAbout(1.9 - .9 * g, .16 + .84 * g + over), eyes: t < .6 ? 'closed' : 'open', hideFeet: t < .62, ripple: t > .3 && t < .9 ? -9 - 5 * (1 - g) : 0 },
        before: p => { if (t < .7) p.box(-14 - 6 * (1 - g), -1, 28 + 12 * (1 - g), 1, colors.shadow); } };
    }
    if (species === 'moss') {
      const rise = ease(t, .22, .82);
      return { style: { warp: scaleAbout(1 + .3 * (1 - rise), Math.max(rise, .02)), eyes: t < .8 ? 'closed' : 'open', hideFeet: t < .66, leafWave: 3 * Math.sin(TAU * t) * (1 - rise) },
        before: p => { p.box(-6, -1, 12, 1, colors.shadow); if (t < .3) seed(p, 0, 0, 5 * ease(t, .04, .3)); } };
    }
    if (species === 'thread') {
      const s = .16 + .84 * ease(t, 0, .82), angle = -1.25 * TAU * (1 - ease(t, 0, .86));
      return { style: { warp: compose(scaleAbout(s, s), rotateAbout(angle, 0, -14 * s)), eyes: t < .8 ? 'closed' : 'open', hideFeet: t < .7, tailWave: -10 + 9 * (1 - s) },
        before: p => { if (t < .35) strand(p, -18, -2, 12 - 20 * t, colors); } };
    }
    const s = Math.max(ease(t, .22, .86), .02);
    return { style: { warp: scaleAbout(s, s, 0, -17), eyes: t < .75 ? 'closed' : 'open', hideFeet: t < .72, wickLift: 2 + 4 * s, exertion: t > .8, phase: Math.floor(t * 12) % 4 },
      before: p => { if (t < .3) mote(p, 0, -17, 1 + 2 * ease(t, 0, .25)); },
      after: p => { if (t > .8) { glint(p, 12, -27, GOLD); glint(p, -13, -24, WHITE); } } };
  },
  dissolve(species, t, colors) {
    // The reverse: the body gives itself back to the same material.
    if (species === 'folio') {
      const sy = folds(t, [1, .72, .38, .1]), sx = folds(t, [1, 1.1, 1.35, 1.7]);
      return { style: { warp: scaleAbout(sx, sy), eyes: t > .2 ? 'closed' : 'open', hideFeet: t > .3 } };
    }
    if (species === 'ink') {
      const g = ease(t, 0, .6), c = ease(t, .62, 1);
      return { style: { warp: scaleAbout((1 + .9 * g) * (1 - .75 * c), (1 - .84 * g) * (1 - .8 * c)), eyes: t > .3 ? 'closed' : 'open', hideFeet: t > .4, ripple: t > .1 && t < .6 ? -9 - 5 * g : 0 },
        before: p => { if (t > .3 && t < .95) p.box(-14 - 6 * g * (1 - c), -1, 28 + 12 * g * (1 - c), 1, colors.shadow); } };
    }
    if (species === 'moss') {
      const sink = ease(t, .1, .8);
      return { style: { warp: scaleAbout(1 + .3 * sink, Math.max(1 - sink, .02)), eyes: t > .3 ? 'closed' : 'open', hideFeet: t > .35, leafWave: 3 * Math.sin(TAU * t) * sink },
        before: p => { p.box(-6, -1, 12, 1, colors.shadow); if (t > .75) seed(p, 0, 0, 5 * (1 - ease(t, .75, 1))); } };
    }
    if (species === 'thread') {
      const s = 1 - .84 * ease(t, .1, .95), angle = 1.25 * TAU * ease(t, .1, .95);
      return { style: { warp: compose(scaleAbout(s, s), rotateAbout(angle, 0, -14 * s)), eyes: t > .3 ? 'closed' : 'open', hideFeet: t > .3, tailWave: -10 + 9 * (1 - s) },
        before: p => { if (t > .7) strand(p, -18, -2, 20 * (t - .7), colors); } };
    }
    const s = Math.max(1 - ease(t, .1, .85), .02);
    return { style: { warp: scaleAbout(s, s, 0, -17), eyes: t > .3 ? 'closed' : 'open', hideFeet: t > .3, wickLift: 2 + 4 * s, exertion: t < .25, phase: Math.floor(t * 12) % 4 },
      after: p => { if (t > .8) mote(p, 0, -17, 1 + 2 * (1 - ease(t, .8, 1))); } };
  }
};

function createExpressions({ surface, pen, companion, material, pose }) {
  function neutral(image, species) {
    const still = pose(species, 0);
    // One source texel is a 2×2 block in the action atlas. Match the main
    // atlas exactly when the expression owner is mounted or released.
    for (let y = 0; y < still.height; y++) {
      for (let x = 0; x < still.width; x++) {
        const from = (y * still.width + x) * 4;
        if (!still.bytes[from + 3]) continue;
        for (const row of [0, 1]) {
          for (const col of [0, 1]) {
            const to = ((y * 2 + row + 8) * image.width + x * 2 + col + 8) * 4;
            still.bytes.copy(image.bytes, to, from, from + 4);
          }
        }
      }
    }
    return image;
  }
  function render(species, name, index) {
    const clip = CLIPS[name];
    if (!clip || !Number.isInteger(index) || index < 0 || index >= clip.frames) throw new RangeError('Unknown expression cel: ' + name + ' #' + index);
    const image = surface(SPAN, SPAN);
    // A forming helper starts from raw material and a dissolving one ends as
    // it; every other clip begins and ends on the identity atlas pose.
    const drawnFirst = name === 'condense', drawnLast = name === 'dissolve';
    if (name !== 'walk' && ((index === 0 && !drawnFirst) || (index === clip.frames - 1 && !drawnLast))) return neutral(image, species);
    const grid = {
      box(x, y, w, h, color) {
        const left = Math.round(x * 2), top = Math.round(y * 2);
        image.box(left, top, Math.round((x + w) * 2) - left, Math.round((y + h) * 2) - top, color);
      },
      poly(points, color) { image.poly(points.map(([x, y]) => [Math.round(x * 2), Math.round(y * 2)]), color); }
    };
    const p = pen(grid, 24, 44), colors = material[species];
    const t = index / (name === 'walk' ? clip.frames : clip.frames - 1);
    let style = {}, beat = null;
    if (CLONE_CLIPS.includes(name)) { beat = clone[name](species, t, colors); style = beat.style; beat.before?.(p); }
    if (name === 'walk') style = walk(species, t);
    if (name === 'blink') style.eyelid = envelope(t, .42, .57);
    if (name.startsWith('glance-')) {
      const direction = name === 'glance-left' ? -1 : 1, gaze = direction * envelope(t, .31, .64);
      style = { gazeX: gaze * 1.4, warp: (x, y) => [x + gaze * Math.max(0, (-y - 7) / 22), y] };
    }
    if (name === 'greet') {
      const amount = envelope(t, .23, .68);
      if (amount > .03) style = materialPose(species, amount, (t - .13) * 2.5);
      style.happy = amount > .25;
      style.warp = (x, y) => [x * (1 - .035 * amount), y * (1 + .055 * amount)];
    }
    if (name === 'startle') {
      const flinch = envelope(t, .19, .36);
      const settle = envelope(t, .48, .6) * (1 - ease(t, .16, .34)) - .28 * Math.sin(TAU * t) * flinch;
      if (flinch > .06) style = materialPose(species, flinch * .52, t);
      style.alarm = flinch > .38;
      style.eyelid = .52 * envelope(t, .63, .69) * (1 - flinch);
      style.warp = (x, y) => [x * (1 - .06 * flinch), y * (1 + .12 * flinch - .045 * settle)];
      if (flinch > .22) {
        p.poly([[-20,-25-3*flinch],[-18,-25-3*flinch],[-16,-22-3*flinch],[-18,-22-3*flinch]],colors.tool);
        p.poly([[18,-26-3*flinch],[20,-26-3*flinch],[18,-23-3*flinch],[16,-23-3*flinch]],colors.tool);
      }
    }
    if (name === 'rare') {
      const amount = envelope(t, .2, .8);
      style.gazeX = 1.35 * amount;
      style.warp = (x, y) => [x + .65 * amount * Math.max(0, (-y - 5) / 22), y * (1 + .04 * amount)];
    }
    if (name === 'success') {
      const smile = envelope(t, .22, .65);
      style.happy = smile > .2;
      style.eyelid = .85 * smile;
      style.warp = (x, y) => [x * (1 - .04 * smile), y * (1 + .07 * smile)];
      if (smile > .42) glint(p, 16 + smile, -25 - 3 * smile, GOLD);
    }

    companion(grid, 24, 44, species, style);
    if (style.ripple) ripple(p, style.ripple, colors);
    beat?.after?.(p);
    if (name === 'rare') {
      const travel = ease(t, .08, .92);
      const reveal = ease(t, .09, .36) * (1 - ease(t, .77, .99));
      if (reveal > .08) {
        const centerX = { folio: 13+4*travel, ink: 10+3*travel, moss: 7+3*travel, thread: 11+4*travel, glow: 13+2*travel }[species];
        const centerY = { folio: -29-7*travel, ink: -29-9*travel, moss: -35-3*travel, thread: -31-5*travel, glow: -30-6*travel }[species];
        const scale = (.12 + .88 * reveal) * (1 + .08 * Math.sin(TAU * travel * 2));
        rare[species](pen(grid, 24, 44, false, (x, y) => [centerX + (x - centerX) * scale, centerY + (y - centerY) * scale]), travel);
      }
    }
    return image;
  }

  function atlas(species) {
    const image = surface(SPAN * COLUMNS, SPAN * ROWS);
    for (const [name, clip] of Object.entries(CLIPS)) {
      for (let i = 0; i < clip.frames; i++) {
        const cell = clip.first + i;
        image.paste(render(species, name, i), SPAN * (cell % COLUMNS), SPAN * Math.floor(cell / COLUMNS));
      }
    }
    return image;
  }
  return Object.freeze({ render, atlas });
}

module.exports = { createExpressions, CLIPS };
