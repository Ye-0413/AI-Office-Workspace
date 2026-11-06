'use strict';

// Each activity describes a continuous, looping physical action. The artist
// samples these curves at the atlas rate and snaps every mark to a texel.
const OUTLINE = '#242439';
const PAPER = '#ffe7bd';
const WHITE = '#fff1d0';
const GOLD = '#ffce63';
const RED = '#fb6868';
const TEAL = '#6cf3ca';
const r = Math.round;
const tau = Math.PI * 2;
const unit = x => x - Math.floor(x);
const wave = x => Math.sin(tau * x);
const cycle = x => .5 - .5 * Math.cos(tau * x);
const progress = (t, from, to) => Math.max(0, Math.min(1, (t - from) / (to - from)));
const ease = (t, from, to) => {
  const x = progress(t, from, to);
  return x * x * (3 - 2 * x);
};
const riseFall = (t, up, peak, release, down) => ease(t, up, peak) - ease(t, release, down);
const step = (x, count) => Math.floor(unit(x) * count);

function strip(p, x, y, length, cursor, color, base = '#777199') {
  p.box(x,y,length,1,base);
  p.box(x+step(cursor,length-1),y,2,1,color);
}

function spark(p, x, y, color) {
  p.box(x-1,y,3,1,color);
  p.box(x,y-1,1,3,color);
}

// These figures describe the state being observed. In waits the tool stays
// parked, and error cels retain the broken track throughout the cycle.
const action = {
  reading(t) {
    const turn = ease(t,.23,.73);
    const lift = Math.sin(Math.PI * turn);
    const corner = r(7 - 14 * turn);
    const trace = unit(t * 2);
    const hand = -11 - 6 * lift;
    return { hand, lean: .8 * lift, draw(p, color) {
      p.poly([[-11,-9],[-11,-20],[-8,-22],[-1,-20],[6,-22],[10,-20],[10,-9],[5,-9],[-1,-7],[-5,-9]],OUTLINE);
      p.poly([[-10,-10],[-10,-19],[-8,-21],[-1,-19],[-1,-9],[-5,-10]],WHITE);
      p.poly([[0,-19],[6,-21],[9,-19],[9,-10],[5,-10],[0,-9]],'#d5ad81');
      p.box(-8,-17,5,1,'#a76f6e');
      p.box(-8,-14,4,1,'#a76f6e');
      p.box(2,-16,5,1,'#a76f6e');
      p.box(2,-13,4,1,'#a76f6e');
      if (lift > .025) {
        const top = -21 - r(7 * lift);
        p.poly([[0,-19],[corner-2,top],[corner+2,top-1],[corner+3,top+3],[0,-9]],'#a76f6e');
        p.poly([[0,-18],[corner-1,top+1],[corner+1,top],[corner+2,top+3],[0,-10]],'#fff3d5');
      }
      p.box(-2,-10,2,2,color);
      const mark = step(trace,12);
      p.dot(mark < 6 ? -8 + mark : 2 + mark - 6,mark < 6 ? -16 : -15,color);
    } };
  },
  searching(t) {
    const scan = cycle(t);
    const x = r(-6 + 11 * scan);
    const y = r(2 * wave(t + .08));
    return { hand: -13 + y, lean: scan, draw(p, color) {
      p.frame(-11,-8,22,6,'#655478');
      for (const card of [-9,-4,1,6]) {
        p.box(card,-7,3,2,Math.abs(card+1-x) < 3 ? WHITE : color);
        p.dot(card+1,-4,'#464260');
      }
      p.poly([[x+2,-13+y],[x+5,-9+y],[x+6,-10+y],[x+3,-15+y]],OUTLINE);
      p.poly([[x-5,-21+y],[x-3,-23+y],[x+2,-23+y],[x+5,-21+y],[x+5,-16+y],[x+2,-13+y],[x-3,-13+y],[x-5,-16+y]],OUTLINE);
      p.poly([[x-4,-20+y],[x-2,-22+y],[x+1,-22+y],[x+4,-20+y],[x+4,-17+y],[x+1,-14+y],[x-2,-14+y],[x-4,-17+y]],color);
      p.poly([[x-3,-20+y],[x-1,-21+y],[x+2,-20+y],[x+2,-17+y],[x,-16+y],[x-3,-17+y]],'#40758c');
      p.box(x-2+step(t*3,3),-20+y,2,1,WHITE);
    } };
  },
  planning(t) {
    const travel = cycle(t);
    const arc = Math.abs(wave(t));
    const x = r(-7 + 11 * travel);
    const y = -15 - r(7 * arc);
    return { hand: y+3, lean: travel, draw(p,color) {
      p.poly([[-10,-15],[8,-15],[11,-7],[11,-4],[-11,-4],[-11,-7]],OUTLINE);
      p.poly([[-9,-14],[7,-14],[10,-7],[-10,-7]],'#776080');
      p.box(-10,-6,20,1,'#bc8390');
      for (const pos of [-9,-4,1,6]) p.box(pos,-10,3,2,'#453b64');
      p.frame(-10,-14,5,6,color);
      p.frame(5,-14,5,5,'#bca4e4');
      const target = r(x * .95);
      p.box(target,-9,4,1,'#bca4e4');
      p.frame(x,y,5,5,GOLD);
      p.dot(x+1+step(t*2,3),y+1,WHITE);
    } };
  },
  designing(t) {
    const stroke = ease(t,.06,.58);
    const reset = ease(t,.62,.94);
    const x = r(-8 + 15 * (stroke - reset));
    const y = r(-11 - 3 * wave(stroke * .5) - 3 * Math.sin(Math.PI * reset));
    const shown = r(15 * stroke), erased = r(15 * reset);
    return { hand: y-3, lean: (x+8)/15, draw(p,color) {
      p.frame(-11,-21,22,17,'#53617e');
      p.box(-9,-19,18,13,PAPER);
      for (let i=erased;i<shown;i++) {
        const rise = r(3 * wave(i / 30));
        p.box(-8+i,-11-rise,1,2,'#9a5a82');
        if (i % 3 === 1) p.dot(-8+i,-12-rise,color);
      }
      p.poly([[x,y],[x+1,y-7],[x+3,y-10],[x+4,y-9],[x+3,y-6]],OUTLINE);
      p.poly([[x+1,y-2],[x+2,y-7],[x+3,y-9],[x+3,y-7]],color);
      p.dot(x,y,OUTLINE);
      strip(p,-8,-18,16,t*2,'#c5829b','#dec5ab');
    } };
  },
  coding(t) {
    const press = cycle(t*4);
    const key = r(-8 + 14 * cycle(t));
    return { hand: -9 + 3 * press, weight: press, lean: (key+8)/14, draw(p,color) {
      p.frame(-11,-23,22,14,'#665673');
      p.box(-9,-21,18,10,'#303452');
      p.box(-7,-19,3,1,TEAL);
      p.dot(-5,-18,TEAL);
      p.box(-7,-17,3,1,TEAL);
      const caret = step(t*3,13);
      for (let i=0;i<caret;i++) if (i % 4 !== 2) p.dot(-3+i,-17,color);
      p.box(-4+caret,-15,2,1,WHITE);
      strip(p,-8,-13,15,t*3,color,'#596280');
      p.poly([[-9,-10],[9,-10],[11,-5],[11,-3],[-11,-3],[-11,-5]],OUTLINE);
      p.box(-9,-8,18,2,color);
      p.box(key,-8+r(press),3,2,WHITE);
      p.box(-10,-5,20,1,'#777199');
    } };
  },
  testing(t) {
    const press = riseFall(t,.05,.23,.58,.80);
    const top = -15 + r(4 * press);
    return { hand: top+1, weight: press, draw(p,color) {
      p.frame(-11,-21,22,17,'#6d536b');
      p.box(-9,-19,18,6,'#333654');
      for (const tick of [-8,-5,-2,1,4,7]) p.box(tick,-17,2,2,'#585a74');
      p.box(-8+r(15 * cycle(t*2)),-17,2,2,GOLD);
      p.frame(-4,-12,12,6,'#9a6584');
      p.frame(-3,top,10,5,RED);
      p.box(-1,top+1,4,1,'#ffad95');
      strip(p,-9,-8,4,t*3,color,'#564b66');
    } };
  },
  building(t) {
    const carried = riseFall(t,.02,.31,.53,.78);
    const traverse = ease(t,.17,.63) - ease(t,.77,.98);
    const x = r(-9 + 11 * traverse);
    const y = -15 - r(9 * carried);
    return { hand: y+4, lean: traverse, weight: carried*.6, draw(p,color) {
      p.frame(-11,-7,22,4,'#775478');
      p.frame(-9,-11,17,5,'#a68196');
      p.box(-7,-10,6,2,'#d6aebb');
      p.box(2,-10,4,2,'#d6aebb');
      p.frame(x,y,8,5,color);
      p.box(x+2,y+1,4,1,WHITE);
      p.box(x+5,y+2,1,2,'#a06a7f');
      p.box(r(x*.75),-8,3,1,'#a06a7f');
      strip(p,-9,-5,18,t*2,'#d6aebb','#594567');
    } };
  },
  running(t) {
    const stride = t*3;
    return { hand: -12 - cycle(stride), lean: cycle(stride), stride, draw(p,color) {
      p.poly([[-11,-13],[-10,-15],[8,-15],[11,-13],[11,-8],[8,-6],[-10,-6],[-11,-8]],OUTLINE);
      p.poly([[-10,-12],[-9,-14],[8,-14],[10,-12],[10,-9],[8,-7],[-9,-7],[-10,-9]],'#686280');
      p.box(-9,-13,18,1,color);
      const belt = step(stride,6);
      for (let i=-9;i<9;i++) if ((i + 9 + belt) % 6 < 3) p.box(i,-11,1,2,'#37334f');
      const carriage = step(t*2,18);
      for (const offset of [0,9]) {
        for (let k=0;k<5;k++) {
          const x = (carriage + offset + k) % 18 - 9;
          p.box(x,-18,1,5,k===0||k===4 ? OUTLINE : color);
          p.dot(x,-18,OUTLINE);
          p.dot(x,-14,OUTLINE);
          if (k===2) p.dot(x,-16,WHITE);
        }
      }
      p.box(-8,-6,2,3,OUTLINE);
      p.box(6,-6,2,3,OUTLINE);
    } };
  },
  'waiting-tool'(t) {
    return { still: true, lean: cycle(t)*.25, draw(p,color) {
      p.frame(-8,-24,16,3,'#ae8196');
      p.frame(-8,-7,16,3,'#ae8196');
      p.poly([[-7,-22],[7,-22],[7,-17],[3,-14],[7,-11],[7,-7],[-7,-7],[-7,-11],[-3,-14],[-7,-17]],OUTLINE);
      p.poly([[-6,-21],[6,-21],[6,-18],[2,-15],[2,-13],[6,-10],[6,-8],[-6,-8],[-6,-10],[-2,-13],[-2,-15],[-6,-18]],'#585776');
      p.box(-4,-20,8,2,color);
      p.box(-3,-9,6,1,GOLD);
      // A parked hourglass with a moving bezel light, rather than falling sand.
      strip(p,-6,-23,12,t*3,GOLD,'#ae8196');
    } };
  },
  'waiting-user'(t) {
    const offer = riseFall(t,.12,.28,.57,.81);
    const y = -16 - r(7 * offer);
    return { still: true, hand: y+10, lean: offer*.4, draw(p,color) {
      p.poly([[-11,y],[10,y],[10,y+12],[-1,y+12],[-6,y+16],[-6,y+12],[-11,y+12]],OUTLINE);
      p.poly([[-10,y+1],[9,y+1],[9,y+11],[-2,y+11],[-5,y+14],[-5,y+11],[-10,y+11]],'#ffe6bb');
      p.box(-3,y+3,5,1,'#624f75');
      p.box(1,y+4,2,2,'#624f75');
      p.box(-1,y+6,3,1,'#624f75');
      p.box(-1,y+9,2,1,'#624f75');
      const dot = step(t*3,24);
      if(dot<16) p.dot(-8+dot,y,color);
      else p.dot(9,y+dot-15,color);
    } };
  },
  error(t) {
    const recoil = riseFall(t,.42,.46,.48,.57);
    return { still: true, alarm: true, weight: -recoil, lean: -recoil, draw(p,color) {
      p.frame(-11,-20,22,15,'#93617e');
      p.box(-9,-18,18,10,'#452f54');
      p.poly([[0,-17],[6,-9],[-6,-9]],RED);
      p.box(-1,-14,2,3,'#4c2c51');
      p.dot(0,-10,'#4c2c51');
      p.box(-7,-5,2,2,OUTLINE);
      p.box(5,-5,2,2,OUTLINE);
      // The signal lights trace two disconnected pieces of the same broken
      // circuit. Neither the gap nor the warning clears during the loop.
      strip(p,-9,-7,7,t*4,color,'#77415d');
      strip(p,2,-7,7,t*5+.5,RED,'#77415d');
      if (recoil > .5) spark(p,7,-22,RED);
    } };
  }
};

const styles = {
  folio: { shift: .11, period: 2, mass: .75 },
  ink: { shift: .28, period: 2, mass: 1.25 },
  moss: { shift: .37, period: 1, mass: .4 },
  thread: { shift: .09, period: 3, mass: 1.2 },
  glow: { shift: .33, period: 2, mass: 1 }
};

function materialGesture(species, p, t, effort, color) {
  const bounce = cycle(t);
  const x = r(5 * wave(t));
  if (species === 'folio') {
    // A moving edge highlight suggests the page corners give with the hand.
    p.box(x-4,-23,3,1,'#fff4d7');
  } else if (species === 'ink') {
    const y = -13-r(9*bounce);
    p.frame(-18,y,3,3,color);
    p.dot(-17,y+1,'#a6e9ff');
  } else if (species === 'glow') {
    const y = -29-r(5*bounce+2*effort);
    p.dot(-7+x,y,GOLD);
    if (bounce > .55) p.dot(-6+x,y-1,WHITE);
  }
}

// A small, stepped highlight crosses the existing material clusters. This is
// ambient movement of the body, independent of whether its tool can act.
// The palette is finite and every texel stays fully opaque or transparent.
const reflectivity = { folio: .85, ink: 1.2, moss: .75, thread: .9, glow: 1.3 };

function paletteFor(species, colors) {
  const coat = species === 'moss' ? ['#79aa58', colors.color] : [colors.color, colors.light];
  return new Map(coat.map(hex => {
    const rgb = Number.parseInt(hex.slice(1),16);
    const palette = [5,12,22].map(amount => [rgb >> 16, (rgb >> 8) & 255, rgb & 255]
      .map(channel => Math.min(255,channel+r(amount*reflectivity[species]))));
    return [rgb,palette];
  }));
}

function breathe(cel, x, y, mirror, t, shift, palette) {
  const focus = 11 * wave(t * 2 + shift) + 2 * wave(t * 5);
  const depth = 3 * wave(t * 3 + .25 + shift);
  for (let row=y-34;row<y-6;row++) {
    for (let column=x-17;column<x+18;column++) {
      const offset=(row*cel.width+column)*4;
      if (cel.bytes[offset+3] === 0) continue;
      const colors=palette.get(cel.bytes.readUIntBE(offset,3));
      if (!colors) continue;
      const localX=mirror ? x-column-1 : column-x;
      const skew = localX + (row-y+19) * .42;
      const distance = Math.abs(skew-focus) + .19 * Math.abs(row-y+22-depth);
      if (distance >= 6) continue;
      const [red,green,blue] = colors[distance < 2.5 ? 2 : distance < 4.3 ? 1 : 0];
      cel.bytes[offset]=red; cel.bytes[offset+1]=green; cel.bytes[offset+2]=blue;
    }
  }
}

function createActivityArtist({ surface, pen, companion, material, manifest }) {
  const names = Object.freeze(Object.keys(action));
  const palettes = Object.fromEntries(Object.entries(material).map(([species, colors]) => [species,paletteFor(species,colors)]));
  for (const name of names) if (!manifest.strips.folio[name]) throw new Error('Missing activity timing: ' + name);
  function activity(species, name, index) {
    const entry = manifest.strips[species]?.[name];
    if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.frames) throw new RangeError('Invalid activity cel ' + species + '/' + name + '/' + index);
    const t = index / entry.frames;
    const cel = surface(manifest.cell, manifest.cell);
    const performance = action[name](t);
    const { shift, period, mass } = styles[species];
    const phase = t * period + shift;
    const motion = wave(phase);
    const mirror = species === 'moss';
    const hand = performance.hand === undefined ? undefined : r(performance.hand + 9);
    const effort = performance.weight || 0;
    const lean = performance.lean || 0;
    const quiet = performance.still === true;
    const dx = r(-1 + lean * .65 + motion * (quiet ? .24 : .7));
    const dy = r(effort + motion * mass * (quiet ? .2 : .75));
    const style = {
      dx: mirror ? -dx : dx, dy, mirror,
      reach: hand === undefined ? 0 : hand || -1,
      glance: motion > -.62 ? 1 : 0,
      alarm: performance.alarm,
      gait: performance.stride === undefined ? 0 : step(performance.stride,4) + 1,
      leafWave: !quiet && species === 'moss' ? r(2 * wave(phase)) : undefined,
      tailWave: !quiet && species === 'thread' ? -12-r(3 * cycle(phase)) : undefined
    };
    // Tools sit 19 texels beside the body centre; the cell leaves at least
    // three clear texels past their widest reach so no prop meets the clip.
    const centre = manifest.cell / 2;
    companion(cel,centre,manifest.baseline,species,style);
    breathe(cel,centre+style.dx,manifest.baseline+dy,mirror,t,shift,palettes[species]);
    if (!quiet) materialGesture(species,pen(cel,centre+style.dx,manifest.baseline+dy,mirror),phase,effort,material[species].tool);
    performance.draw(pen(cel,mirror ? centre-19 : centre+19,manifest.baseline),material[species].tool);
    return cel;
  }
  return Object.freeze({ activity, activities: names });
}

module.exports = { createActivityArtist };
