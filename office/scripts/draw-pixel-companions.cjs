#!/usr/bin/env node
'use strict';

// Draw original companion sprites on the same integer grid as their final
// PNGs. There is no image input, antialiasing, resampling or external tool.
const fs = require('node:fs');
const path = require('node:path');
const { deflateSync, crc32 } = require('node:zlib');

const ART = path.join(__dirname, '../assets/avatars');
const OUTLINE = '#242439';
const WHITE = '#fff1d0';
const GOLD = '#ffce63';
const RED = '#fb6868';
const EMOTES = Object.freeze(['blink', 'look-left', 'look-right', 'greet-1', 'greet-2', 'startle', 'rare-1', 'rare-2', 'success']);
const TEAL = '#6cf3ca';

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

function pen(surface, x, y, mirror = false) {
  const rx = (left, width) => mirror ? x - left - width : x + left;
  function box(left, top, width, height, color) {
    surface.box(rx(left, width), y + top, width, height, color);
  }
  return {
    box,
    dot: (left, top, color) => box(left, top, 1, 1, color),
    poly: (points, color) => surface.poly(points.map(([left, top]) => [mirror ? x - left : x + left, y + top]), color),
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

function face(p, x, y, { eyes = 'open', glance = 0, gaze = 0, happy = false, alarm = false } = {}, ink = OUTLINE, gleam = WHITE, cheek = '#ef937a') {
  for (const offset of [0, 8]) {
    if (eyes === 'closed') {
      p.box(x + offset, y + 2, 3, 1, ink);
      p.dot(x + offset + (offset === 0 ? -1 : 3), y + 1, ink);
    } else if (eyes === 'blink') {
      p.box(x + offset,y + 2,3,1,ink);
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
function feet(p, positions, shadow, color, gait = 0) {
  positions.forEach((x, i) => {
    const lift = i === gait - 1 ? 2 : 0;
    p.frame(x, -5 - lift, 5, 5, shadow);
    p.box(x + 1, -4 - lift, 2, 2, color);
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
    if (style.wickWave) {
      const x = style.wickWave;
      p.poly([[-2,-31],[x-2,-34],[x-2,-36],[x+2,-36],[x+2,-33],[2,-31]],OUTLINE);
      p.box(x-1,-35,2,3,c.light);
      p.dot(x,-36,WHITE);
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
  const bodyPen = pen(surface, x + dx, ground + dy, mirror);
  feet(feetPen, species === 'glow' ? [-11,-5,3,8] : [-14,-7,3,9], c.mid, c.light, gait);
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

const tools = {
  reading(p, color, k) {
    // A page lifts, crosses the spine and falls to the other side.
    p.poly([[-11,-9],[-11,-20],[-8,-22],[-1,-20],[6,-22],[10,-20],[10,-9],[5,-9],[-1,-7],[-5,-9]], OUTLINE);
    p.poly([[-10,-10],[-10,-19],[-8,-21],[-1,-19],[-1,-9],[-5,-10]], WHITE);
    p.poly([[0,-19],[6,-21],[9,-19],[9,-10],[5,-10],[0,-9]], '#d5ad81');
    p.box(-8,-17,5,1,'#a76f6e');
    p.box(-8,-14,4,1,'#a76f6e');
    p.box(2,-15,4,1,color);
    const page = [
      [[1,-19],[7,-21],[8,-17],[6,-12],[1,-10]],
      [[0,-19],[3,-25],[7,-25],[7,-21],[1,-10]],
      [[0,-19],[-5,-25],[-7,-24],[-7,-19],[0,-10]],
      [[0,-19],[-8,-20],[-10,-17],[-8,-12],[0,-10]]
    ][k];
    p.poly(page, '#ffedc6');
    p.box(-2,-10,2,2,color);
  },
  searching(p, color, k) {
    p.frame(-11,-8,22,6,'#655478');
    for (const x of [-9,-4,1,6]) p.box(x,-7,3,2,color);
    const x = [-5,-3,-1,1][k];
    p.poly([[x+3,-13],[x+8,-8],[x+10,-10],[x+5,-15]],OUTLINE);
    p.poly([[x+4,-13],[x+8,-9],[x+9,-10],[x+5,-14]],color);
    p.poly([[x-6,-21],[x-3,-24],[x+2,-24],[x+5,-21],[x+5,-16],[x+2,-13],[x-3,-13],[x-6,-16]],OUTLINE);
    p.poly([[x-5,-20],[x-3,-23],[x+2,-23],[x+4,-20],[x+4,-17],[x+1,-14],[x-3,-14],[x-5,-17]],color);
    p.poly([[x-3,-20],[x-1,-21],[x+2,-20],[x+2,-17],[x,-16],[x-3,-17]],'#40758c');
    p.box(x-2,-20,3,1,WHITE);
  },
  planning(p, color, k) {
    p.poly([[-10,-15],[8,-15],[11,-7],[11,-4],[-11,-4],[-11,-7]],OUTLINE);
    p.poly([[-9,-14],[7,-14],[10,-7],[-10,-7]],'#776080');
    p.box(-10,-6,20,1,'#bc8390');
    for (const [i, x] of [-9,-4,1,6].entries()) {
      p.box(x,-10,3,2,i === k ? WHITE : '#453b64');
    }
    p.frame(-10,-14,5,6,color);
    p.frame(4,-14,5,5,'#bca4e4');
    p.frame([-4,-1,2,5][k],[-17,-21,-19,-15][k],5,5,GOLD);
  },
  designing(p, color, k) {
    p.frame(-11,-21,22,17,'#53617e');
    p.box(-9,-19,18,13,'#ffe7bd');
    for (let i = 0; i <= k; i++) {
      p.box(-7 + i * 4,-12 - i,4,2,'#9a5a82');
      p.dot(-5 + i * 4,-14 - i,color);
    }
    const x = [-8,-4,0,4][k];
    p.poly([[x,-13-k],[x+2,-20-k],[x+5,-23-k],[x+7,-22-k],[x+4,-18-k]],OUTLINE);
    p.poly([[x+1,-14-k],[x+3,-20-k],[x+5,-22-k],[x+6,-22-k],[x+4,-19-k]],color);
    p.dot(x,-13-k,OUTLINE);
  },
  coding(p, color, k) {
    p.frame(-11,-23,22,14,'#665673');
    p.box(-9,-21,18,10,'#303452');
    p.box(-7,-19,3,1,TEAL);
    p.box(-5,-18,1,1,TEAL);
    p.box(-7,-17,3,1,TEAL);
    for (let i = 0; i <= k; i++) p.box(-2 + i * 2,-17,1,1,i === k ? WHITE : color);
    p.box(-7,-14,7,1,color);
    p.poly([[-9,-10],[9,-10],[11,-5],[11,-3],[-11,-3],[-11,-5]],OUTLINE);
    p.box(-9,-8,18,2,color);
    p.box(-7 + k * 4,-8,3,2,WHITE);
    p.box(-10,-5,20,1,'#777199');
  },
  testing(p, color, k) {
    p.frame(-11,-21,22,17,'#6d536b');
    p.box(-9,-19,18,6,'#333654');
    for (let i = 0; i < 5; i++) p.box(-8 + i * 3,-17,2,2,i < k + 1 ? color : '#585a74');
    p.frame(-4,-12,12,6,'#9a6584');
    p.frame(-3,k === 1 || k === 2 ? -12 : -15,10,5,k === 2 ? TEAL : RED);
    p.box(-9,-8,3,2,k === 3 ? GOLD : color);
  },
  building(p, color, k) {
    p.frame(-11,-7,22,4,'#775478');
    p.frame(-9,-11,17,5,'#a68196');
    p.box(-7,-10,6,2,'#d6aebb');
    p.box(2,-10,4,2,'#d6aebb');
    const x = [-8,-4,0,1][k];
    const y = [-18,-23,-20,-15][k];
    p.frame(x,y,10,6,color);
    p.box(x+2,y+1,5,1,WHITE);
    p.box(x+7,y+2,1,2,'#a06a7f');
  },
  running(p, color, k) {
    p.poly([[-11,-13],[-10,-15],[8,-15],[11,-13],[11,-8],[8,-6],[-10,-6],[-11,-8]],OUTLINE);
    p.poly([[-11,-12],[-9,-14],[8,-14],[10,-12],[10,-9],[8,-7],[-9,-7],[-11,-9]],'#686280');
    p.box(-9,-13,18,1,color);
    for (const x of [-8,-2,4]) p.box(x + k % 2,-11,3,2,'#37334f');
    p.frame(-10+k*4,-19,6,6,color);
    p.dot(-8+k*4,-17,WHITE);
    p.box(-8,-6,2,3,OUTLINE);
    p.box(6,-6,2,3,OUTLINE);
  },
  'waiting-tool'(p, color, k) {
    p.frame(-8,-24,16,3,'#ae8196');
    p.frame(-8,-7,16,3,'#ae8196');
    p.poly([[-7,-22],[7,-22],[7,-17],[3,-14],[7,-11],[7,-7],[-7,-7],[-7,-11],[-3,-14],[-7,-17]],OUTLINE);
    p.poly([[-6,-21],[6,-21],[6,-18],[2,-15],[2,-13],[6,-10],[6,-8],[-6,-8],[-6,-10],[-2,-13],[-2,-15],[-6,-18]],'#585776');
    p.box(-4,-20,8,2,color);
    p.box(-3,-9,k+3,1,GOLD);
    p.dot(0,-17+k*2,WHITE);
  },
  'waiting-user'(p, color, k) {
    const y = [-16,-21,-23,-19][k];
    p.poly([[-11,y],[10,y],[10,y+12],[-1,y+12],[-6,y+16],[-6,y+12],[-11,y+12]],OUTLINE);
    p.poly([[-10,y+1],[9,y+1],[9,y+11],[-2,y+11],[-5,y+14],[-5,y+11],[-10,y+11]],'#ffe6bb');
    p.box(-3,y+3,5,1,'#624f75');
    p.box(1,y+4,2,2,'#624f75');
    p.box(-1,y+6,3,1,'#624f75');
    p.box(-1,y+9,2,1,'#624f75');
    if (k === 2) glint(p, 7, y-3, color);
  },
  error(p, color, k) {
    p.frame(-11,-20,22,15,'#93617e');
    p.box(-9,-18,18,10,'#452f54');
    p.poly([[0,-17],[6,-9],[-6,-9]],RED);
    p.box(-1,-14,2,3,'#4c2c51');
    p.dot(0,-10,'#4c2c51');
    p.box(-8,-7,4,1,color);
    p.box(6,-7,3,1,k % 2 ? GOLD : RED);
    p.box(-7,-5,2,2,OUTLINE);
    p.box(5,-5,2,2,OUTLINE);
    if (k !== 0) glint(p, [-5,-6,6,4][k], [-23,-22,-25,-23][k], RED);
  }
};

// Discrete material weight shifts and paw positions reinforce what the prop
// does. Waits remain poised and the error remains jammed in every frame.
const gestures = {
  reading: [[0,0,-4],[0,-1,-7],[1,-1,-6],[0,0,-3]],
  searching: [[-1,0,-4],[0,-1,-4],[1,-1,-4],[2,0,-2]],
  planning: [[0,0,-3],[0,-1,-7],[1,-1,-6],[1,0,-4]],
  designing: [[-1,0,-5],[0,0,-5],[1,-1,-6],[2,-1,-6]],
  coding: [[0,0,1],[1,1,3],[0,0,1],[1,1,3]],
  testing: [[0,0,-3],[0,1,2],[1,1,2],[0,-1,-3]],
  building: [[0,0,-4],[0,-2,-8],[1,-1,-6],[1,1,-2]],
  running: [[-1,0,-2],[0,-1,-3],[1,0,-2],[0,1,-1]],
  'waiting-tool': [[0,0,0],[0,0,0],[0,1,0],[0,0,0]],
  'waiting-user': [[0,0,-1],[0,-1,-5],[0,-2,-7],[0,0,-3]],
  error: [[0,0,0],[-1,-1,0],[1,0,0],[0,1,0]]
};

function activity(species, name, k) {
  const sprite = surface(60, 60);
  const mirror = species === 'moss';
  const [dx, dy, reach] = gestures[name][k];
  const style = {
    dx: mirror ? 1 - dx : dx - 1,
    dy: species === 'moss' ? Math.max(-1, dy) : dy,
    reach,
    mirror,
    glance: 1,
    gait: name === 'running' ? k + 1 : 0,
    phase: k,
    exertion: !name.startsWith('waiting-') && name !== 'error',
    alarm: name === 'error'
  };
  // Moss works with its roots to the left, the other four use the right.
  // Offsets stay on the integer grid and share the atlas floor line.
  companion(sprite, 30, 56, species, style);
  const p = pen(sprite, mirror ? 11 : 49, 56);
  tools[name](p, material[species].tool, k);
  return sprite;
}

const waves = {
  folio: [{ reach: -5 }, { reach: -12 }],
  ink: [{ ripple: -13 }, { ripple: -19, dy: 1 }],
  moss: [{ leafWave: -3 }, { leafWave: 4 }],
  thread: [{ tailWave: -16 }, { tailWave: -24 }],
  glow: [{ wickWave: -3 }, { wickWave: 4, dy: -1 }]
};

function bird(p, second) {
  // A folded paper crane lifts its wings out of the companion's page stack.
  const x = second ? 17 : 13;
  const y = second ? -36 : -29;
  p.poly([[x-7,y+4],[x-5,y+1],[x-2,y+2],[x-4,y-6],[x,y-4],[x+3,y+1],[x+4,y-2],[x+7,y-1],[x+5,y+2],[x+3,y+5],[x-2,y+6]],OUTLINE);
  p.poly([[x-6,y+4],[x-4,y+2],[x-1,y+3],[x-3,y-5],[x,y-3],[x+3,y+3],[x+5,y-1],[x+6,y-1],[x+4,y+4],[x-2,y+5]],WHITE);
  p.poly([[x-1,y+3],[x+3,y+3],[x+1,y+5],[x-4,y+4]],'#c89672');
  p.dot(x+5,y,OUTLINE);
}

function bubble(p, second) {
  const x = second ? 13 : 10;
  const y = second ? -38 : -29;
  p.poly([[x-4,y-3],[x-1,y-5],[x+3,y-5],[x+6,y-2],[x+6,y+3],[x+3,y+6],[x-2,y+6],[x-5,y+3],[x-5,y-1]],OUTLINE);
  p.poly([[x-4,y-2],[x-1,y-4],[x+2,y-4],[x+5,y-1],[x+5,y+3],[x+2,y+5],[x-1,y+5],[x-4,y+2]],'#64a4ea');
  p.poly([[x-3,y-1],[x-1,y-3],[x+2,y-3],[x+4,y-1],[x+4,y+2],[x+1,y+4],[x-1,y+4],[x-3,y+2]],'#4b64b0');
  p.box(x-2,y-2,3,1,'#a6e9ff');
  p.dot(x-3,y-1,WHITE);
  if (second) glint(p,x+8,y+6,'#a6e9ff');
}

function bloom(p, second) {
  const x = second ? 10 : 7;
  const y = second ? -38 : -36;
  p.box(x-1,y+1,2,6,'#345d49');
  if (second) {
    p.poly([[x-2,y-5],[x+2,y-5],[x+3,y-3],[x+6,y-2],[x+6,y+2],[x+3,y+3],[x+2,y+5],[x-2,y+5],[x-3,y+3],[x-6,y+2],[x-6,y-2],[x-3,y-3]],OUTLINE);
    p.poly([[x-2,y-4],[x+2,y-4],[x+2,y-2],[x+5,y-2],[x+5,y+2],[x+2,y+2],[x+2,y+4],[x-2,y+4],[x-2,y+2],[x-5,y+2],[x-5,y-2],[x-2,y-2]],'#ee8890');
    p.box(x-1,y-1,3,3,GOLD);
    p.dot(x-1,y-1,WHITE);
  } else {
    p.poly([[x-4,y-3],[x+1,y-4],[x+4,y-2],[x+4,y+2],[x+1,y+4],[x-3,y+2]],OUTLINE);
    p.poly([[x-3,y-2],[x+1,y-3],[x+3,y-2],[x+3,y+1],[x+1,y+3],[x-2,y+2]],'#ee8890');
    p.box(x-2,y-2,3,1,'#ffc3b1');
  }
}

function heart(p, second) {
  const x = second ? 15 : 11;
  const y = second ? -36 : -31;
  p.poly([[x-6,y-4],[x-2,y-5],[x,y-3],[x+2,y-5],[x+6,y-4],[x+7,y],[x+6,y+3],[x,y+8],[x-6,y+3],[x-7,y]],OUTLINE);
  p.poly([[x-5,y-3],[x-2,y-4],[x,y-2],[x+2,y-4],[x+5,y-3],[x+6,y],[x+5,y+2],[x,y+7],[x-5,y+2],[x-6,y]],'#f38279');
  p.box(x-4,y-3,2,2,'#ffb68f');
  p.poly([[x+1,y-1],[x+5,y-3],[x+6,y],[x+2,y+2],[x-1,y+5],[x-3,y+4]],'#c65064');
  p.poly([[x-1,y+7],[x+1,y+7],[x+1,y+10],[x-2,y+12],[x-4,y+12],[x-4,y+11],[x-2,y+10]],'#c65064');
}

function lanternStar(p, second) {
  const x = second ? 15 : 13;
  const y = second ? -36 : -30;
  p.poly([[x,y-7],[x+2,y-3],[x+7,y-2],[x+4,y+1],[x+4,y+6],[x,y+4],[x-4,y+6],[x-4,y+1],[x-7,y-2],[x-2,y-3]],OUTLINE);
  p.poly([[x,y-5],[x+1,y-2],[x+5,y-1],[x+3,y+1],[x+3,y+4],[x,y+3],[x-3,y+4],[x-3,y+1],[x-5,y-1],[x-1,y-2]],GOLD);
  glint(p,x,y,WHITE);
  if (second) {
    p.dot(x+7,y+2,GOLD);
    p.dot(x-6,y+5,GOLD);
    p.dot(x+6,y-3,WHITE);
  }
}

const rare = { folio: bird, ink: bubble, moss: bloom, thread: heart, glow: lanternStar };
const startle = {
  folio: { reach: -3 },
  ink: { ripple: -13 },
  moss: { leafWave: -2 },
  thread: { tailWave: -14 },
  glow: { wickWave: -1 }
};

function emote(species, name) {
  const cel = surface(48,48);
  const p = pen(cel,24,44);
  let style;
  if (name === 'blink') style = { eyes: 'blink' };
  if (name === 'look-left') style = { gaze: -1 };
  if (name === 'look-right') style = { gaze: 1 };
  if (name === 'greet-1' || name === 'greet-2') {
    style = { ...waves[species][name === 'greet-2' ? 1 : 0], happy: true };
  }
  if (name === 'startle') style = { ...startle[species], alarm: true, dy: -2 };
  if (name === 'rare-1' || name === 'rare-2') style = { gaze: 1 };
  if (name === 'success') style = { eyes: 'closed', happy: true };
  if (!style) throw new RangeError('Unknown companion emote: ' + name);
  companion(cel,24,44,species,style);
  if (style.ripple) {
    // A raised hand made from the same droplet colors, without a rigid limb.
    const y = style.ripple;
    const c = material[species];
    p.poly([[13,-8],[15,-14],[16,y-2],[19,y-4],[22,y-3],[23,y],[22,y+3],[19,y+4],[17,-8]],OUTLINE);
    p.poly([[14,-9],[16,-14],[17,y-2],[19,y-3],[21,y-2],[22,y],[21,y+2],[19,y+3],[16,-9]],c.color);
    p.box(18,y-2,2,1,c.light);
  }
  if (name === 'startle') {
    // Two short seams of negative space keep the marks readable by silhouette.
    const c = material[species];
    p.poly([[-20,-27],[-18,-27],[-16,-23],[-18,-23]],c.tool);
    p.poly([[18,-28],[20,-28],[18,-24],[16,-24]],c.tool);
  }
  if (name === 'rare-1' || name === 'rare-2') rare[species](p,name === 'rare-2');
  return cel;
}

function write(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(image));
}

function generate(root = ART) {
  for (const species of Object.keys(bodies)) {
    const atlas = surface(120, 80);
    for (let i = 0; i < 6; i++) atlas.paste(pose(species, i), i % 3 * 40, Math.floor(i / 3) * 40);
    write(path.join(root, 'workshop-' + species + '.png'), atlas);
    const emoteSheet = surface(48 * EMOTES.length,48);
    EMOTES.forEach((name,i) => emoteSheet.paste(emote(species,name),i * 48,0));
    write(path.join(root,'pixel-emotes-' + species + '.png'),emoteSheet);
    for (const name of Object.keys(tools)) {
      const strip = surface(240, 60);
      for (let i = 0; i < 4; i++) strip.paste(activity(species, name, i), i * 60, 0);
      write(path.join(root, 'frames', species, name + '.png'), strip);
    }
  }
}

if (require.main === module) generate();
module.exports = { generate, pose, activity, emote, surface, png, species: Object.keys(bodies), activities: Object.keys(tools), emotes: EMOTES };
