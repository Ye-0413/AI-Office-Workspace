#!/usr/bin/env node
'use strict';

// Draw original companion sprites on the same integer grid as their final
// PNGs. There is no image input, antialiasing, resampling or external tool.
const fs = require('node:fs');
const path = require('node:path');
const { deflateSync, crc32 } = require('node:zlib');
const { createExpressions, CLIPS } = require('./pixel-expression-cels.cjs');

const ART = path.join(__dirname, '../assets/avatars');
const OUTLINE = '#242439';
const WHITE = '#fff1d0';
const GOLD = '#ffce63';
const RED = '#fb6868';
const EMOTES = Object.freeze(Object.keys(CLIPS));

function surface(width, height) {
  const bytes = Buffer.alloc(width * height * 4);
  const colors = new Map();
  function dot(x, y, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    if (!colors.has(color)) colors.set(color, Buffer.from(color.slice(1) + 'ff', 'hex'));
    colors.get(color).copy(bytes, (y * width + x) * 4);
  }
  function box(x, y, w, h, color) {
    for (let row = y; row < y + h; row++) {
      for (let column = x; column < x + w; column++) dot(column, row, color);
    }
  }
  function poly(points, color) {
    const left = Math.min(...points.map(([x]) => x));
    const right = Math.max(...points.map(([x]) => x));
    const top = Math.min(...points.map(([, y]) => y));
    const bottom = Math.max(...points.map(([, y]) => y));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let fill = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [ax, ay] = points[i];
          const [bx, by] = points[j];
          if ((ay > y + .5) !== (by > y + .5) && x + .5 < ax + (bx - ax) * (y + .5 - ay) / (by - ay)) fill = !fill;
        }
        if (fill) dot(x, y, color);
      }
    }
  }
  function paste(source, x, y) {
    for (let row = 0; row < source.height; row++) {
      source.bytes.copy(bytes, ((y + row) * width + x) * 4, row * source.width * 4, (row + 1) * source.width * 4);
    }
  }
  return { width, height, bytes, dot, box, poly, paste };
}

function png(surface) {
  const { width, height, bytes } = surface;
  const size = Buffer.alloc(13);
  size.writeUInt32BE(width);
  size.writeUInt32BE(height, 4);
  size[8] = 8;
  size[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) bytes.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  function chunk(name, data) {
    const typeAndData = Buffer.concat([Buffer.from(name), data]);
    const head = Buffer.alloc(4);
    const checksum = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([head, typeAndData, checksum]);
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', size), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}

function pen(surface, x, y, mirror = false, warp) {
  function poly(points, color) {
    surface.poly(points.map(point => {
      const [left, top] = warp ? warp(...point) : point;
      return [mirror ? x - left : x + left, y + top];
    }), color);
  }
  function box(left, top, width, height, color) {
    if (warp) {
      poly([[left, top], [left + width, top], [left + width, top + height], [left, top + height]], color);
      return;
    }
    surface.box(mirror ? x - left - width : x + left, y + top, width, height, color);
  }
  return {
    box,
    dot: (left, top, color) => box(left, top, 1, 1, color),
    poly,
    frame(left, top, width, height, color) {
      box(left, top, width, height, OUTLINE);
      box(left + 1, top + 1, width - 2, height - 2, color);
    }
  };
}

function glint(p, x, y, color = WHITE) {
  p.box(x - 1, y, 3, 1, color);
  p.box(x, y - 1, 1, 3, color);
}

function face(p, x, y, { eyes = 'open', glance = 0, gaze = 0, gazeX, eyelid, happy = false, alarm = false } = {}, ink = OUTLINE, gleam = WHITE, cheek = '#ef937a') {
  for (const offset of [0, 8]) {
    if (eyes === 'closed') {
      p.box(x + offset, y + 2, 3, 1, ink);
      p.dot(x + offset + (offset === 0 ? -1 : 3), y + 1, ink);
    } else if (eyes === 'blink') {
      p.box(x + offset,y + 2,3,1,ink);
    } else if (eyelid || gazeX) {
      const pupil = x + offset + (gazeX || 0), opening = Math.max(1, 4 * (1 - (eyelid || 0)));
      const top = y + (4 - opening) * .68;
      p.box(pupil, top, alarm ? 4 : 3, opening, ink);
      if (opening >= 1.5) p.box(pupil + (gazeX > 0 ? .5 : 1.5), top, 1, Math.min(1.5, opening / 2), gleam);
    } else if (gaze) {
      const pupil = x + offset + Math.sign(gaze);
      p.box(pupil,y,3,4,ink);
      p.box(pupil + (gaze < 0 ? 2 : 0),y + 1,1,2,gleam);
    } else {
      const shift = Math.sign(glance);
      p.box(x + offset + shift, y, alarm ? 4 : 3, alarm ? 5 : 4, ink);
      p.dot(x + offset + 1 + shift, y, gleam);
    }
  }
  p.box(x - 3, y + 4, 2, 1, cheek);
  p.box(x + 12, y + 4, 2, 1, cheek);
  if (happy) {
    p.box(x + 4, y + 5, 3, 2, ink);
    p.dot(x + 5, y + 6, cheek);
  } else if (alarm) {
    p.box(x + 4, y + 6, 3, 3, ink);
    p.dot(x + 5, y + 7, cheek);
  } else if (eyes !== 'closed') {
    p.box(x + 5, y + 5, 2, 1, ink);
  }
}

// Foot edges reach the ground line, including in resting and activity poses.
function feet(p, positions, shadow, color, gait = 0, stride) {
  positions.forEach((x, i) => {
    const [slide, lift] = stride?.[i] || [0, i === gait - 1 ? 2 : 0];
    p.frame(x + slide, -5 - lift, 5, 5, shadow);
    p.box(x + slide + 1, -4 - lift, 2, 2, color);
  });
}

const material = {
  folio: { light: '#fff0c5', color: '#efc88d', mid: '#c89672', shadow: '#9c665d', tool: '#efb978' },
  ink: { light: '#a6e9ff', color: '#64a4ea', mid: '#4b64b0', shadow: '#3b417c', tool: '#8bbaff' },
  moss: { light: '#f5ad77', color: '#d37c53', mid: '#b05243', shadow: '#773b42', tool: '#a9d681' },
  thread: { light: '#ffb68f', color: '#f38279', mid: '#c65064', shadow: '#80394f', tool: '#ffa0a0' },
  glow: { light: '#fff1a3', color: '#ffc462', mid: '#ee8b48', shadow: '#a84f44', tool: '#ffd872' }
};

const bodies = {
  folio(p, style, c) {
    // Tall folded corners, cream front, paper layers on the right edge.
    p.poly([[-15,-8],[-15,-19],[-17,-25],[-17,-29],[-13,-29],[-6,-25],[-1,-29],[5,-31],[11,-31],[11,-27],[15,-23],[15,-9],[12,-4],[-11,-4]], OUTLINE);
    p.poly([[-14,-9],[-14,-19],[-16,-27],[-12,-26],[-6,-23],[-1,-27],[5,-30],[10,-30],[10,-25],[14,-22],[14,-10],[11,-5],[-10,-5]], c.color);
    p.poly([[-13,-12],[-13,-20],[-15,-26],[-10,-23],[-6,-22],[-1,-26],[5,-29],[9,-29],[8,-24],[12,-21],[12,-11],[9,-8],[-9,-8]], c.light);
    p.poly([[1,-25],[9,-29],[8,-24],[4,-22],[-4,-21]], c.mid);
    p.poly([[-15,-26],[-9,-24],[-6,-22],[-12,-21]], c.mid);
    p.box(-12,-10,24,1,c.mid);
    p.box(-10,-7,19,1,c.shadow);
    p.box(-10,-13,3,1,WHITE);
    p.box(9,-19,2,1,WHITE);
    if (style.exertion) {
      // The top sheet rolls along the spine with each hard stroke.
      const x = [-7,-4,-1,-4][style.phase];
      p.box(x,-23,5,1,WHITE);
      p.box(x+2,-24,3,1,WHITE);
    }
    face(p,-5,-19,style,OUTLINE,WHITE,'#e49a7d');
  },
  ink(p, style, c) {
    // A hooked droplet silhouette and discrete dark pools along the base.
    p.poly([[-16,-5],[-17,-9],[-16,-15],[-13,-20],[-9,-22],[-6,-26],[-3,-31],[1,-31],[2,-26],[9,-23],[14,-19],[17,-12],[17,-7],[13,-4],[-13,-4]], OUTLINE);
    p.poly([[-15,-6],[-16,-9],[-15,-15],[-12,-19],[-8,-21],[-5,-26],[-2,-29],[0,-29],[1,-25],[9,-22],[13,-18],[16,-12],[16,-8],[12,-5],[-12,-5]], c.mid);
    p.poly([[-14,-11],[-12,-17],[-8,-20],[-4,-24],[-2,-28],[0,-26],[0,-23],[8,-20],[12,-16],[14,-12],[12,-9],[6,-8],[-10,-8]], c.color);
    p.poly([[-11,-18],[-8,-19],[-6,-21],[-2,-21],[-4,-18],[-8,-17],[-10,-15],[-12,-15]], c.light);
    p.box(-12,-14,2,1,WHITE);
    p.box(8,-7,5,1,c.shadow);
    p.box(-13,-7,6,1,c.shadow);
    p.box(-4,-6,7,1,c.shadow);
    if (style.exertion) {
      // A drop rises off the back and collapses into the same pool.
      const y = [-16,-20,-23,-19][style.phase];
      p.frame(-18,y,3,3,c.color);
      p.dot(-17,y+1,c.light);
    }
    face(p,-4,-15,style,'#24274c',c.light,'#aa91dc');
  },
  moss(p, style, c) {
    // A stepped canopy of moss over a terracotta block, topped by a sprout.
    p.poly([[-17,-20],[-15,-25],[-10,-25],[-10,-27],[-6,-27],[-6,-29],[2,-29],[2,-27],[9,-27],[9,-25],[13,-25],[17,-21],[17,-9],[13,-4],[-12,-4],[-16,-8]],OUTLINE);
    p.poly([[-15,-19],[-13,-21],[12,-21],[16,-18],[16,-9],[12,-5],[-11,-5],[-15,-8]],c.mid);
    p.poly([[-14,-18],[-12,-20],[11,-20],[15,-17],[15,-11],[11,-8],[-10,-8],[-14,-11]],c.color);
    p.box(-14,-12,2,2,c.light);
    p.box(12,-9,2,1,c.shadow);
    p.box(-8,-6,4,1,c.shadow);
    p.poly([[-16,-19],[-14,-24],[-9,-24],[-9,-26],[-5,-26],[-5,-28],[1,-28],[1,-26],[8,-26],[8,-24],[13,-24],[16,-21],[16,-18],[12,-18],[12,-16],[8,-16],[8,-19],[2,-19],[2,-17],[-3,-17],[-3,-19],[-9,-19],[-9,-17],[-13,-17],[-13,-19]],'#4b814e');
    p.poly([[-14,-22],[-11,-23],[-7,-23],[-7,-25],[-3,-25],[-3,-27],[1,-27],[1,-25],[7,-25],[7,-23],[13,-23],[14,-20],[-13,-20]],'#79aa58');
    p.box(-9,-23,3,1,'#bdd979');
    p.box(5,-24,2,1,'#bdd979');
    p.box(-3,-21,4,1,'#345d49');
    p.box(10,-21,2,1,'#345d49');
    const sprout = style.leafWave ?? (style.exertion ? [0,1,2,1][style.phase] : 0);
    const lean = points => points.map(([x, y]) => [x + (y < -30 ? sprout : 0), y]);
    p.poly(lean([[-1,-27],[-1,-32],[-5,-32],[-8,-36],[-4,-37],[0,-34],[1,-32],[2,-36],[8,-38],[8,-34],[5,-31],[2,-30],[2,-27]]),OUTLINE);
    p.poly(lean([[0,-28],[0,-32],[-4,-33],[-7,-36],[-4,-36],[0,-33],[2,-31],[3,-35],[7,-37],[7,-34],[5,-32],[1,-30],[1,-28]]),'#a9d681');
    face(p,-5,-16,style,'#402d36',WHITE,'#f3a072');
  },
  thread(p, style, c) {
    // Interleaved low-res yarn bands, including a loose strand on the left.
    if (style.tailWave) {
      const y = style.tailWave;
      p.poly([[-13,-12],[-18,-13],[-22,y+4],[-23,y],[-22,y-2],[-19,y-2],[-18,y+2],[-16,-12],[-13,-12],[-12,-9]],OUTLINE);
      p.poly([[-13,-11],[-18,-12],[-21,y+4],[-22,y],[-21,y-1],[-20,y-1],[-19,y+3],[-16,-11],[-13,-10]],c.color);
      p.box(-22,y,2,1,c.light);
    } else {
      p.poly([[-15,-9],[-15,-7],[-18,-7],[-19,-8],[-19,-11],[-16,-11],[-16,-9],[-14,-9],[-14,-12],[-11,-12],[-10,-7],[-15,-6]],OUTLINE);
      p.box(-18,-9,3,1,c.mid);
      p.box(-15,-10,3,2,c.color);
    }
    if (style.exertion) {
      // The spare end trails the ball by one discrete beat.
      const y = [-11,-13,-12,-10][style.phase];
      p.box(-20,y,4,2,OUTLINE);
      p.box(-20,y,3,1,c.mid);
      p.box(-17,y+1,2,2,c.color);
    }
    p.poly([[-16,-13],[-15,-20],[-11,-25],[-7,-28],[-1,-30],[6,-29],[11,-27],[15,-23],[17,-18],[17,-12],[14,-7],[9,-4],[-10,-4],[-15,-8]],OUTLINE);
    p.poly([[-15,-13],[-14,-20],[-10,-24],[-6,-27],[-1,-29],[6,-28],[11,-26],[14,-22],[16,-18],[16,-12],[13,-8],[9,-5],[-10,-5],[-14,-8]],c.mid);
    p.poly([[-14,-13],[-13,-19],[-9,-24],[-5,-27],[0,-28],[5,-27],[10,-25],[14,-21],[15,-16],[13,-12],[9,-9],[-9,-9]],c.color);
    p.poly([[-13,-15],[-13,-18],[-8,-24],[-4,-26],[-1,-27],[-5,-23],[-9,-20],[-11,-16]],c.light);
    p.poly([[-11,-13],[-8,-17],[-6,-21],[-2,-25],[4,-28],[6,-27],[1,-24],[-3,-20],[-5,-16],[-9,-12]],c.shadow);
    p.poly([[-7,-10],[-3,-15],[1,-19],[5,-23],[10,-25],[12,-24],[7,-22],[3,-18],[-2,-14],[-4,-10]],c.mid);
    p.poly([[4,-10],[9,-14],[14,-18],[15,-18],[15,-15],[11,-12],[8,-9]],c.light);
    p.box(-8,-8,17,1,c.shadow);
    p.box(-4,-6,12,1,c.shadow);
    p.box(-7,-17,20,7,c.color);
    face(p,-4,-17,style,OUTLINE,WHITE,'#ffab90');
  },
  glow(p, style, c) {
    // Amber lantern seed with a stepped, opaque light core.
    p.poly([[-12,-7],[-15,-12],[-15,-18],[-12,-23],[-7,-26],[-4,-28],[-3,-32],[3,-32],[3,-28],[8,-26],[12,-22],[15,-16],[15,-10],[11,-6],[7,-4],[-8,-4]],OUTLINE);
    p.poly([[-11,-8],[-14,-12],[-14,-17],[-11,-22],[-7,-25],[-3,-27],[-2,-31],[2,-31],[2,-27],[8,-25],[11,-21],[14,-16],[14,-11],[10,-7],[6,-5],[-7,-5]],c.mid);
    p.poly([[-11,-10],[-13,-13],[-13,-17],[-10,-21],[-6,-24],[-2,-26],[2,-27],[8,-24],[11,-21],[13,-16],[12,-12],[8,-8],[4,-7],[-6,-7]],c.color);
    p.poly([[-7,-11],[-9,-14],[-9,-18],[-5,-22],[0,-24],[5,-23],[9,-20],[10,-15],[8,-11],[3,-9],[-3,-9]],c.light);
    p.poly([[-12,-14],[-12,-17],[-9,-21],[-6,-22],[-8,-18],[-9,-15]],WHITE);
    p.box(-2,-31,4,3,'#84674f');
    p.box(-1,-31,2,1,'#d7a567');
    if (style.wickWave || style.wickLift) {
      const x = style.wickWave || 0, y = -31 - (style.wickLift ?? 5);
      p.poly([[-2,-31],[x-2,y+2],[x-2,y],[x+2,y],[x+2,y+3],[2,-31]],OUTLINE);
      p.box(x-1,y+1,2,3,c.light);
      p.dot(x,y,WHITE);
    }
    p.box(-8,-8,4,1,WHITE);
    if (style.exertion) {
      const x = [-7,-5,-3,-6][style.phase];
      const y = [-30,-33,-35,-32][style.phase];
      glint(p,x,y,style.phase === 2 ? WHITE : GOLD);
    }
    face(p,-5,-17,style,'#744038',WHITE,'#f29b5d');
  }
};

function companion(surface, x, ground, species, style = {}) {
  const { rest, gait, dx = 0, dy = 0, reach = 0, mirror = false } = style;
  const c = material[species];
  const feetPen = pen(surface, x, ground, mirror);
  const bodyPen = pen(surface, x + dx, ground + dy, mirror, style.warp);
  // A gathering or dissolving helper has no feet yet; everything else stands.
  if (!style.hideFeet) feet(feetPen, species === 'glow' ? [-11,-5,3,8] : [-14,-7,3,9], c.mid, c.light, gait, style.stride);
  if (rest) {
    // The low silhouette reads as a curl, including in the static gallery.
    bodyPen.poly([[-16,-13],[-12,-18],[-6,-20],[4,-20],[11,-17],[16,-13],[16,-8],[12,-4],[-12,-4],[-16,-8]],OUTLINE);
    bodyPen.poly([[-15,-12],[-11,-17],[-6,-19],[4,-19],[11,-16],[15,-12],[15,-9],[11,-5],[-11,-5],[-15,-8]],c.mid);
    bodyPen.poly([[-14,-12],[-10,-16],[-5,-18],[4,-18],[10,-15],[13,-12],[9,-8],[-10,-8]],c.color);
    bodyPen.box(-9,-15,5,1,c.light);
    bodyPen.box(-4,-16,4,1,c.light);
    if (species === 'moss') bodyPen.box(-11,-17,18,3,'#79aa58');
    if (species === 'folio') bodyPen.poly([[-13,-13],[-14,-21],[-9,-18],[-6,-15]],c.light);
    if (species === 'thread') bodyPen.poly([[-13,-12],[-8,-16],[-3,-18],[1,-18],[-3,-15],[-7,-12]],c.shadow);
    if (species === 'ink') bodyPen.poly([[-8,-17],[-4,-22],[-2,-22],[-1,-18]],c.color);
    if (species === 'glow') bodyPen.box(-2,-20,4,3,'#84674f');
    face(bodyPen,-4,-12,{ eyes: 'closed' },OUTLINE,c.light,c.mid);
  } else {
    bodies[species](bodyPen, style, c);
  }
  if (reach) {
    // Lead paw replaces the outer edge of the resting silhouette.
    const top = -9 + reach;
    bodyPen.poly([[12,-10],[16,top-3],[20,top-3],[21,top-1],[21,top+1],[18,top+3],[15,top+2],[12,-6]],OUTLINE);
    bodyPen.poly([[13,-9],[16,top-2],[19,top-2],[20,top],[18,top+2],[15,top+1],[13,-7]],c.color);
    bodyPen.box(17,top-1,2,1,c.light);
  }
}

function pose(species, index) {
  const sheet = surface(40, 40);
  const p = pen(sheet, 20, 40);
  const style = [
    {}, { glance: 1, dx: 1, dy: 1 }, { glance: -1, dy: -1 },
    { rest: true }, { alarm: true, dy: -1 }, { eyes: 'closed', happy: true, dy: -1 }
  ][index];
  companion(sheet, 20, 40, species, style);
  if (index === 1) p.box(13,-23,2,2,material[species].tool);
  if (index === 2) {
    p.box(-16,-26,3,2,material[species].tool);
    p.box(-19,-29,4,3,material[species].tool);
  }
  if (index === 3) {
    p.box(11,-21,3,1,material[species].light);
    p.box(13,-24,3,1,material[species].light);
    p.box(15,-27,3,1,material[species].light);
  }
  if (index === 4) {
    p.box(16,-31,2,5,RED);
    p.box(16,-25,2,2,RED);
  }
  if (index === 5) {
    glint(p,15,-25,GOLD);
    glint(p,-14,-26,GOLD);
  }
  return sheet;
}

const activityManifest = require('../renderer/creature-frame-manifest.js');
const { activity, activities } = require('./pixel-activity-cels.cjs').createActivityArtist({
  surface, pen, companion, material, manifest: activityManifest
});

function activityAtlas(species, name) {
  const { cell, columns } = activityManifest;
  const { frames } = activityManifest.strips[species][name];
  const atlas = surface(cell * columns, cell * Math.ceil(frames / columns));
  for (let index = 0; index < frames; index++) {
    atlas.paste(activity(species, name, index), index % columns * cell, Math.floor(index / columns) * cell);
  }
  return atlas;
}

const expressions = createExpressions({ surface, pen, companion, material, pose });
const emote = expressions.render;

function write(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(image));
}

function generate(root = ART) {
  for (const species of Object.keys(bodies)) {
    const atlas = surface(120, 80);
    for (let i = 0; i < 6; i++) atlas.paste(pose(species, i), i % 3 * 40, Math.floor(i / 3) * 40);
    write(path.join(root, 'workshop-' + species + '.png'), atlas);
    write(path.join(root, 'pixel-emotes-' + species + '.png'), expressions.atlas(species));
    for (const name of activities) {
      write(path.join(root, 'frames', species, name + '.png'), activityAtlas(species, name));
    }
  }
}

if (require.main === module) generate();
module.exports = { generate, pose, activity, emote, surface, png, species: Object.keys(bodies), activities, activityAtlas, emotes: EMOTES };
