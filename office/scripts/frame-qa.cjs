#!/usr/bin/env node
'use strict';
/* Frame registration QA for the bitmap keyframe strips
 * (docs/plans/2026-11-04-route-a-frame-animation.md §3.2, §3.7, §6).
 *
 * Reads one generated keyframe sheet (a 2×2 grid or a 1×N row, any size,
 * on a flat keying colour or real alpha), keys it, registers every frame
 * to the species' idle cell of the workshop atlas (feet baseline, body
 * height, body centre), writes assets/avatars/frames/<species>/<activity>.png
 * as a 512-cell row and refreshes renderer/creature-frame-manifest.js.
 * Every tolerance in the plan is measured and printed; a breach fails the
 * run unless --force is given. Pure Electron nativeImage, no dependencies.
 *
 *   electron scripts/frame-qa.cjs --species moss --activity coding \
 *     --sheet /tmp/moss-coding.jpg --duration 2400 [--sequence 0,1,0,1,2,3] \
 *     [--beats 0,.14,.3,.44,.6,.8] [--cuts 1,3,5] [--shift 2:-6,0] [--force] [--dry] \
 *     [--preview /tmp/out.png]
 *
 * --sequence plays keys in that order (a key may repeat for a rhythm);
 * --beats gives each step's start offset in the cycle; --cuts lists step
 * indexes that enter as a hard cut instead of a dissolve; --motion is a JSON
 * array with one whole-body {x,y,rot,sx,sy} annotation per key (rig units,
 * degrees) that the runtime interpolates between steps; --scale height|floor|eyes|width|<n>
 * picks how the sheet is sized to the atlas: height (default) the median body
 * height, floor the median eye-to-floor height (props held overhead), eyes a
 * per-frame eye anchor, width a per-frame body width, or a fixed number
 * (collapsed poses). Feet and floor place every frame in all modes but eyes.
 *
 *   electron scripts/frame-qa.cjs --check   # re-measure every registered strip
 */
const fs = require('fs'), path = require('path');
const { app, nativeImage } = require('electron');
const CELL = 512, BASELINE = 440, DISPLAY = 64;
// A frame cell is drawn over SPAN rig units centred on the feet, where the
// atlas cell covers BODY units: the extra room is for props and raised
// limbs, which the plan wants clearly outside the silhouette (§3.3).
const SPAN = 120, BODY = 80, ATLAS_LEFT = 37.5, ATLAS_TOP = 35;
const FRAME_LEFT = ATLAS_LEFT + BODY / 2 - SPAN / 2;
const DISPLAY_SPAN = Math.round(DISPLAY * SPAN / BODY);
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'renderer', 'creature-frame-manifest.js');
const framesDir = path.join(root, 'assets', 'avatars', 'frames');
// Adjacent IoU is a drift check (same creature, same place), not a smoothness
// check: smoothness is the dissolve's job and keys are meant to differ.
const TOL = Object.freeze({ baseline: 2, centroid: 4, height: .03, stretch: .22, iou: .45, soft: [.01, .08], displacement: .15, xor: .12, diff: .10, outside: .25 });
const ACTIVITIES = new Set(['idle', 'reading', 'searching', 'planning', 'designing', 'coding', 'testing', 'building', 'running', 'waiting-tool', 'waiting-user', 'error', 'blink']);

function args(argv) {
  const out = { shift: {}, force: false, dry: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--species') out.species = next();
    else if (a === '--activity') out.activity = next();
    else if (a === '--sheet') out.sheet = next();
    else if (a === '--duration') out.duration = Number(next());
    else if (a === '--beats') out.beats = next().split(',').map(Number);
    else if (a === '--cuts') out.cuts = next().split(',').map(Number);
    else if (a === '--sequence') out.sequence = next().split(',').map(Number);
    else if (a === '--motion') out.motion = JSON.parse(next());
    else if (a === '--scale') { const v = next(); out.scale = ['floor', 'eyes', 'height', 'width'].includes(v) ? v : Number(v); }
    else if (a === '--shift') { const [k, v] = next().split(':'); out.shift[Number(k)] = v.split(',').map(Number); }
    else if (a === '--preview') out.preview = next();
    else if (a === '--force') out.force = true;
    else if (a === '--dry') out.dry = true;
    else if (a === '--check') out.check = true;
    else if (a === '--measure') out.measure = true;
  }
  return out;
}

// --- raw RGBA helpers (nativeImage bitmaps are BGRA, premultiplied) --------
function decode(file) {
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('Cannot decode ' + file);
  const { width, height } = image.getSize(), bgra = image.toBitmap();
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = bgra[i * 4 + 3], k = a ? 255 / a : 0;
    px[i * 4] = Math.min(255, bgra[i * 4 + 2] * k); px[i * 4 + 1] = Math.min(255, bgra[i * 4 + 1] * k); px[i * 4 + 2] = Math.min(255, bgra[i * 4] * k); px[i * 4 + 3] = a;
  }
  return { width, height, px };
}
function encode({ width, height, px }) {
  const bgra = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = px[i * 4 + 3] / 255;
    bgra[i * 4] = Math.round(px[i * 4 + 2] * a); bgra[i * 4 + 1] = Math.round(px[i * 4 + 1] * a); bgra[i * 4 + 2] = Math.round(px[i * 4] * a); bgra[i * 4 + 3] = px[i * 4 + 3];
  }
  return nativeImage.createFromBitmap(bgra, { width, height }).toPNG();
}
const blank = (width, height) => ({ width, height, px: new Uint8ClampedArray(width * height * 4) });
function crop(img, x0, y0, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) out.px.set(img.px.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4);
  return out;
}
// Area-averaging downscale / bilinear upscale on straight RGBA weighted by alpha.
function resample(img, w, h) {
  const out = blank(w, h), sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
      const wx = Math.min(x1, xx + 1) - Math.max(x0, xx), wy = Math.min(y1, yy + 1) - Math.max(y0, yy), wgt = wx * wy;
      if (wgt <= 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4, al = img.px[i + 3] / 255 * wgt;
      r += img.px[i] * al; g += img.px[i + 1] * al; b += img.px[i + 2] * al; a += al; n += wgt;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { out.px[o] = r / a; out.px[o + 1] = g / a; out.px[o + 2] = b / a; }
    out.px[o + 3] = n ? Math.round(a / n * 255) : 0;
  }
  return out;
}
function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const tx = dx + x, ty = dy + y;
    if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
    dst.px.set(src.px.subarray((y * src.width + x) * 4, (y * src.width + x) * 4 + 4), (ty * dst.width + tx) * 4);
  }
}

// --- keying ---------------------------------------------------------------
function keyColour(img) {
  // Median of a ring of corner samples. Real alpha sheets report null.
  const pts = [];
  for (const [x, y] of [[2, 2], [img.width - 3, 2], [2, img.height - 3], [img.width - 3, img.height - 3], [img.width >> 1, 2], [2, img.height >> 1]]) {
    const i = (y * img.width + x) * 4; pts.push([img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]);
  }
  if (pts.every(p => p[3] === 0)) return null;
  const med = k => pts.map(p => p[k]).sort((a, b) => a - b)[pts.length >> 1];
  return [med(0), med(1), med(2)];
}
function keyOut(img, bg, lo = 48, hi = 104) {
  if (!bg) return img;
  const out = blank(img.width, img.height), [br, bgc, bb] = bg;
  // Two opinions, the more opaque wins: RGB distance from the key colour
  // (catches dark outlines that share the key's hue) and the key's own
  // chroma signature, min(R,B)−G for magenta, scaled to the sampled key
  // (catches shaded terracotta that happens to sit near the key in RGB).
  const keyChroma = Math.min(br, bb) - bgc, cLo = keyChroma * .25, cHi = keyChroma * .55;
  for (let i = 0; i < img.width * img.height; i++) {
    const r = img.px[i * 4], g = img.px[i * 4 + 1], b = img.px[i * 4 + 2];
    const d = Math.hypot(r - br, g - bgc, b - bb), c = Math.min(r, b) - g;
    const byDistance = Math.max(0, Math.min(1, (d - lo) / (hi - lo)));
    const byChroma = keyChroma > 40 ? 1 - Math.max(0, Math.min(1, (c - cLo) / (cHi - cLo))) : 0;
    const a = Math.max(byDistance, byChroma);
    if (a <= 0) continue;
    // Despill: solve the foreground colour that, over the key, produced this pixel.
    const fr = a < 1 ? (r - (1 - a) * br) / a : r, fg = a < 1 ? (g - (1 - a) * bgc) / a : g, fb = a < 1 ? (b - (1 - a) * bb) / a : b;
    out.px[i * 4] = Math.max(0, Math.min(255, fr)); out.px[i * 4 + 1] = Math.max(0, Math.min(255, fg)); out.px[i * 4 + 2] = Math.max(0, Math.min(255, fb));
    out.px[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// --- measurement ----------------------------------------------------------
function measure(img, threshold = 96) {
  const cols = new Uint32Array(img.width), rows = new Uint32Array(img.height);
  let count = 0, soft = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const a = img.px[(y * img.width + x) * 4 + 3];
    if (a > 0 && a < 255) soft++;
    if (a >= threshold) { cols[x]++; rows[y]++; count++; sumX += x; sumY += y; }
  }
  if (!count) return null;
  let top = 0; while (rows[top] === 0) top++;
  let bottom = img.height - 1; while (rows[bottom] === 0) bottom--;
  let left = 0; while (cols[left] === 0) left++;
  let right = img.width - 1; while (cols[right] === 0) right--;
  // The body is the widest run of columns at least half as tall as the
  // tallest column; limbs and ground props are shorter and fall outside it.
  const peak = Math.max(...cols), floor = peak * .5;
  let best = [0, -1], run = null;
  for (let x = 0; x <= img.width; x++) {
    if (x < img.width && cols[x] >= floor) { if (run === null) run = x; }
    else if (run !== null) { if (x - run > best[1] - best[0]) best = [run, x - 1]; run = null; }
  }
  // Baseline: the lowest opaque row inside the body columns.
  // The baseline is the lowest row where a real share of the body columns
  // is opaque, so a keyed-out shadow smear or a stray crumb cannot set it.
  let baseline = bottom;
  const need = Math.max(2, Math.round((best[1] - best[0] + 1) * .12));
  for (let y = bottom; y >= top; y--) { let hits = 0; for (let x = best[0]; x <= best[1]; x++) if (img.px[(y * img.width + x) * 4 + 3] >= threshold && ++hits >= need) break; if (hits >= need) { baseline = y; break; } }
  let bodyTop = top;
  for (let y = top; y <= bottom; y++) { let hit = false; for (let x = best[0]; x <= best[1]; x++) if (img.px[(y * img.width + x) * 4 + 3] >= threshold) { hit = true; break; } if (hit) { bodyTop = y; break; } }
  const result = { count, soft: soft / (img.width * img.height), bbox: [left, top, right, bottom], body: best, bodyCentre: (best[0] + best[1]) / 2, centroid: [sumX / count, sumY / count], baseline, bodyTop, bodyHeight: baseline - bodyTop + 1 };
  result.feetCentre = feetCentre(img, result);
  result.eyes = eyes(img, result);
  return result;
}
function mask(img, threshold = 96) {
  const m = new Uint8Array(img.width * img.height);
  for (let i = 0; i < m.length; i++) m[i] = img.px[i * 4 + 3] >= threshold ? 1 : 0;
  return m;
}
function iou(a, b) { let inter = 0, union = 0; for (let i = 0; i < a.length; i++) { if (a[i] & b[i]) inter++; if (a[i] | b[i]) union++; } return union ? inter / union : 1; }
function xor(a, b) { let n = 0, on = 0; for (let i = 0; i < a.length; i++) { if (a[i] ^ b[i]) n++; if (a[i] | b[i]) on++; } return on ? n / on : 0; }
function diff(a, b, threshold = 24) {
  let changed = 0, on = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const aa = a.px[i * 4 + 3], ba = b.px[i * 4 + 3];
    if (aa < 96 && ba < 96) continue; on++;
    if (Math.abs(aa - ba) > 64 || Math.abs(a.px[i * 4] - b.px[i * 4]) + Math.abs(a.px[i * 4 + 1] - b.px[i * 4 + 1]) + Math.abs(a.px[i * 4 + 2] - b.px[i * 4 + 2]) > threshold * 3) changed++;
  }
  return on ? changed / on : 0;
}
// Pixels of a frame outside the idle silhouette (dilated by 4px): the prop
// and limb share, per §3.3.
function outside(frame, idle, dilate = 4) {
  const m = mask(idle), d = new Uint8Array(m.length), w = idle.width, h = idle.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) for (let yy = Math.max(0, y - dilate); yy <= Math.min(h - 1, y + dilate); yy++) for (let xx = Math.max(0, x - dilate); xx <= Math.min(w - 1, x + dilate); xx++) d[yy * w + xx] = 1;
  const f = mask(frame); let out = 0, on = 0;
  for (let i = 0; i < f.length; i++) if (f[i]) { on++; if (!d[i]) out++; }
  return on ? out / on : 0;
}

// Eyes: the two darkest compact blobs of similar size on one row. Their
// spacing is the one body measure that survives squash, lean and collapse,
// so it can set the sheet scale when the body height cannot (§3.2 eye anchor).
function eyes(img, m) {
  const w = img.width, h = img.height, seen = new Uint8Array(w * h), blobs = [];
  const dark = i => img.px[i * 4 + 3] >= 96 && img.px[i * 4] < 80 && img.px[i * 4 + 1] < 70 && img.px[i * 4 + 2] < 70;
  const [left, top, right, bottom] = m.bbox;
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const start = y * w + x; if (seen[start] || !dark(start)) continue;
    const stack = [start]; seen[start] = 1; let n = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const i = stack.pop(), px = i % w, py = (i - px) / w; n++; sx += px; sy += py;
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && Math.abs(j % w - px) <= 1 && dark(j)) { seen[j] = 1; stack.push(j); }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const aspect = bw / bh, relY = (sy / n - top) / Math.max(1, bottom - top);
    if (n >= 12 && n / (bw * bh) > .35 && bw < m.bodyHeight * .2 && bh < m.bodyHeight * .2 && aspect > .4 && aspect < 2.5 && relY > .2 && relY < .8) blobs.push({ n, x: sx / n, y: sy / n, w: bw, h: bh });
  }
  let best = null;
  for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
    const a = blobs[i], b = blobs[j], dy = Math.abs(a.y - b.y), dx = Math.abs(a.x - b.x), sizeRatio = Math.min(a.n, b.n) / Math.max(a.n, b.n);
    if (dy > Math.max(a.h, b.h) * .6 || dx < Math.max(a.w, b.w) * 1.2 || dx > m.bodyHeight * .4 || sizeRatio < .55) continue;
    const shape = Math.min(a.w / b.w, b.w / a.w) * Math.min(a.h / b.h, b.h / a.h);
    const score = sizeRatio * shape * (a.n + b.n) / (1 + dy);
    if (!best || score > best.score) best = { score, span: dx, centre: [(a.x + b.x) / 2, (a.y + b.y) / 2], blobs: [a, b] };
  }
  return best;
}

// Lowest row where a quarter of the given columns is opaque.
function floorUnder(img, x0, x1, threshold = 96) {
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(img.width - 1, Math.round(x1));
  const need = Math.max(2, Math.round((x1 - x0 + 1) * .25));
  for (let y = img.height - 1; y >= 0; y--) { let hits = 0; for (let x = x0; x <= x1; x++) if (img.px[(y * img.width + x) * 4 + 3] >= threshold && ++hits >= need) return y; }
  return null;
}

// --- registration ---------------------------------------------------------
function atlasIdle(species) {
  const atlas = decode(path.join(root, 'assets', 'avatars', 'workshop-' + species + '.png'));
  const cell = crop(atlas, 0, 0, CELL, CELL), ref = measure(cell);
  // The same idle painting placed in a frame cell, as the renderer shows it.
  const inFrame = register(cell, frameReference(ref)).cell;
  return { cell, ref: frameReference(ref), atlasRef: ref, inFrame };
}
function splitSheet(sheet) {
  // 2×2 grids read left-to-right, top-to-bottom; wide rows read left-to-right.
  const ratio = sheet.width / sheet.height;
  if (Math.abs(ratio - 1) < .05) { const w = sheet.width >> 1, h = sheet.height >> 1; return [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => crop(sheet, x, y, w, h)); }
  const n = Math.round(ratio), w = Math.floor(sheet.width / n);
  return Array.from({ length: n }, (_, i) => crop(sheet, i * w, 0, w, sheet.height));
}
// Atlas idle measurements mapped into frame-cell pixels.
function frameReference(ref) {
  const k = BODY / SPAN;
  const toFrame = x => (ATLAS_LEFT + x * BODY / CELL - FRAME_LEFT) * CELL / SPAN;
  return { bodyHeight: ref.bodyHeight * k, bodyWidth: (ref.body[1] - ref.body[0] + 1) * k, bodyCentre: toFrame(ref.bodyCentre), feetCentre: toFrame(ref.feetCentre), baseline: BASELINE, eyeSpan: ref.eyes ? ref.eyes.span * k : null, eyeCentre: ref.eyes ? [toFrame(ref.eyes.centre[0]), BASELINE - (ref.baseline - ref.eyes.centre[1]) * k] : null, eyeToBody: ref.eyes ? (ref.eyes.centre[0] - ref.bodyCentre) * k : 0, eyeToFloor: ref.eyes ? (ref.baseline - ref.eyes.centre[1]) * k : null };
}
// Feet centre: the opaque mass of the body columns within the bottom rows,
// which stays put when the body leans, squashes or stretches.
function feetCentre(img, m) {
  const from = Math.max(m.bodyTop, m.baseline - Math.round(m.bodyHeight * .08));
  let sum = 0, n = 0;
  for (let y = from; y <= m.baseline; y++) for (let x = m.body[0]; x <= m.body[1]; x++) if (img.px[(y * img.width + x) * 4 + 3] >= 96) { sum += x; n++; }
  return n ? sum / n : m.bodyCentre;
}
// One scale for the whole sheet, so squash and stretch keys survive: the
// median body height across frames is the creature's rest height. Each
// frame is then placed by its feet, horizontally and on the baseline.
// A neighbouring cell's prop can poke across the grid line (a leaf held
// high above one frame lands at the bottom of the frame above). Anything
// touching the cell border that is not part of the main figure is bleed.
function pruneBleed(cell, threshold = 96) {
  const w = cell.width, h = cell.height, label = new Int32Array(w * h).fill(-1), comps = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] >= 0 || cell.px[start * 4 + 3] < threshold) continue;
    const id = comps.length, comp = { area: 0, border: false, pixels: [] }; comps.push(comp);
    const stack = [start]; label[start] = id;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w; comp.area++; comp.pixels.push(i);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) comp.border = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx; if (label[j] < 0 && cell.px[j * 4 + 3] >= threshold) { label[j] = id; stack.push(j); }
      }
    }
  }
  const largest = Math.max(0, ...comps.map(c => c.area));
  let removed = 0;
  for (const comp of comps) if (comp.border && comp.area < largest * .3) { removed += comp.area; for (const i of comp.pixels) cell.px[i * 4 + 3] = 0; }
  // Soft fringe left behind by removed pieces.
  if (removed) for (let i = 0; i < w * h; i++) if (cell.px[i * 4 + 3] > 0 && cell.px[i * 4 + 3] < threshold && label[i] < 0) {
    const x = i % w, y = (i - x) / w; let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && cell.px[(ny * w + nx) * 4 + 3] >= threshold) { near = true; break; } }
    if (!near) cell.px[i * 4 + 3] = 0;
  }
  return removed;
}
function registerAll(frames, ref, shifts = {}, scaleBy = 'height') {
  const measures = frames.map(f => { const m = measure(f); if (!m) throw new Error('Empty frame'); return m; });
  const median = values => { const v = [...values].sort((a, b) => a - b); return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
  let scale, perFrame = null;
  if (Number.isFinite(scaleBy)) scale = scaleBy;
  else if (scaleBy === 'width') {
    // Sheets whose creature changes size from cell to cell, in poses that
    // keep the body upright: size each frame by its own body width.
    perFrame = measures.map(m => ref.bodyWidth / (m.body[1] - m.body[0] + 1));
  } else if (scaleBy === 'eyes') {
    // The eye spacing survives squash, lean, collapse and a generator that
    // drifts in size from cell to cell: size and place each frame by its
    // eyes, and find its floor under the body the eyes imply.
    if (!ref.eyeSpan) throw new Error('--scale eyes: the atlas idle has no detectable eye pair');
    const spans = measures.map(m => m.eyes?.span);
    const fallback = median(spans.filter(Number.isFinite));
    if (!Number.isFinite(fallback)) throw new Error('--scale eyes: no eye pair found in any frame');
    perFrame = spans.map(span => ref.eyeSpan / (Number.isFinite(span) ? span : fallback));
  } else if (scaleBy === 'floor') {
    // One sheet scale from the median eye-to-floor height, for sheets whose
    // prop is held overhead (a raised leaf would inflate the body height).
    const heights = measures.filter(m => m.eyes).map(m => m.baseline - m.eyes.centre[1]);
    if (!ref.eyeToFloor || !heights.length) throw new Error('--scale floor: no eye pair found');
    scale = ref.eyeToFloor / median(heights);
  } else scale = ref.bodyHeight / median(measures.map(m => m.bodyHeight));
  const byEyes = scaleBy === 'eyes';
  return frames.map((f, i) => {
    const shift = shifts[i] || [0, 0];
    const k = perFrame ? perFrame[i] : scale;
    const scaled = resample(f, Math.round(f.width * k), Math.round(f.height * k)), sm = measure(scaled);
    let dx, dy;
    if (byEyes && sm.eyes) {
      const half = ref.bodyWidth * .45, floor = floorUnder(scaled, sm.eyes.centre[0] - ref.eyeToBody - half, sm.eyes.centre[0] - ref.eyeToBody + half);
      dx = Math.round(ref.eyeCentre[0] - sm.eyes.centre[0] + shift[0]); dy = Math.round(BASELINE - (floor ?? sm.baseline) + shift[1]);
    } else { dx = Math.round(ref.feetCentre - feetCentre(scaled, sm) + shift[0]); dy = Math.round(BASELINE - sm.baseline + shift[1]); }
    const cell = blank(CELL, CELL); paste(cell, scaled, dx, dy);
    return { cell, scale: k, dx, dy };
  });
}
const register = (frame, ref, shift) => registerAll([frame], ref, { 0: shift })[0];

function report(cells, ref, idleInFrame) {
  // Compare at display scale: a frame cell shows at DISPLAY_SPAN px when the
  // body shows at DISPLAY px, so the idle cell is embedded at the same scale.
  const small = cells.map(c => resample(c, DISPLAY_SPAN, DISPLAY_SPAN));
  const smallIdle = resample(idleInFrame, DISPLAY_SPAN, DISPLAY_SPAN);
  const rows = cells.map((cell, i) => {
    const m = measure(cell), next = cells[(i + 1) % cells.length];
    const sm = measure(small[i]), snext = measure(small[(i + 1) % cells.length]);
    const displacement = Math.hypot(sm.centroid[0] - snext.centroid[0], sm.centroid[1] - snext.centroid[1]) / (sm.bodyHeight || DISPLAY);
    return {
      frame: i, baseline: m.baseline, baselineDelta: m.baseline - BASELINE, feetDelta: +(m.feetCentre - ref.feetCentre).toFixed(1), centreDelta: +(m.bodyCentre - ref.bodyCentre).toFixed(1),
      bodyWidthRatio: +((m.body[1] - m.body[0] + 1) / ref.bodyWidth).toFixed(3), eyeSpanRatio: m.eyes && ref.eyeSpan ? +(m.eyes.span / ref.eyeSpan).toFixed(3) : null, eyeDelta: m.eyes && ref.eyeCentre ? [+(m.eyes.centre[0] - ref.eyeCentre[0]).toFixed(1), +(m.eyes.centre[1] - ref.eyeCentre[1]).toFixed(1)] : null,
      heightRatio: +(m.bodyHeight / ref.bodyHeight).toFixed(3), soft: +m.soft.toFixed(3),
      iouNext: +iou(mask(cell), mask(next)).toFixed(3), xorNext64: +xor(mask(small[i]), mask(small[(i + 1) % cells.length])).toFixed(3),
      diffNext64: +diff(small[i], small[(i + 1) % cells.length]).toFixed(3), displacementNext64: +displacement.toFixed(3),
      outsideIdle: +outside(cell, idleInFrame).toFixed(3), diffIdle64: +diff(small[i], smallIdle).toFixed(3)
    };
  });
  const problems = [];
  const sorted = rows.map(r => r.heightRatio).sort((a, b) => a - b), restRatio = sorted.length % 2 ? sorted[sorted.length >> 1] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  if (Math.abs(restRatio - 1) > TOL.height) problems.push(`rest body height ratio ${restRatio.toFixed(3)} off by more than ${TOL.height * 100}%`);
  for (const r of rows) {
    if (Math.abs(r.baselineDelta) > TOL.baseline) problems.push(`frame ${r.frame}: baseline off by ${r.baselineDelta}px`);
    if (Math.abs(r.feetDelta) > TOL.centroid) problems.push(`frame ${r.frame}: feet centre off by ${r.feetDelta}px`);
    if (Math.abs(r.heightRatio - 1) > TOL.stretch) problems.push(`frame ${r.frame}: body height ratio ${r.heightRatio} beyond squash/stretch range`);
    if (r.iouNext < TOL.iou) problems.push(`frame ${r.frame}: silhouette IoU to next ${r.iouNext} < ${TOL.iou}`);
    if (r.soft < TOL.soft[0] || r.soft > TOL.soft[1]) problems.push(`frame ${r.frame}: semi-transparent share ${r.soft} outside ${TOL.soft.join('–')}`);
  }
  // Legibility at 64px: a key must differ from its neighbour by displacement,
  // silhouette or pixel change; and the activity must differ from idle.
  const legible = rows.map(r => r.displacementNext64 >= TOL.displacement || r.xorNext64 >= TOL.xor || r.diffNext64 >= TOL.diff);
  if (legible.some(v => !v)) problems.push('frames too alike at 64px: ' + rows.filter((_, i) => !legible[i]).map(r => r.frame).join(','));
  const prop = Math.max(...rows.map(r => r.outsideIdle));
  if (prop < TOL.outside) problems.push(`prop/limb share outside idle silhouette peaks at ${prop} < ${TOL.outside}`);
  return { rows, problems, small };
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) return { version: 1, cell: CELL, span: SPAN, baseline: BASELINE, blend: 150, strips: {} };
  const text = fs.readFileSync(manifestPath, 'utf8'), start = text.indexOf('/*MANIFEST*/') + '/*MANIFEST*/'.length, end = text.indexOf('/*END*/');
  return JSON.parse(text.slice(start, end));
}
function saveManifest(manifest) {
  const ordered = { ...manifest, strips: Object.fromEntries(Object.keys(manifest.strips).sort().map(s => [s, Object.fromEntries(Object.keys(manifest.strips[s]).sort().map(a => [a, manifest.strips[s][a]]))])) };
  const body = [
    '/* Registered bitmap keyframe strips. Generated by scripts/frame-qa.cjs;',
    ' * do not edit by hand. Each strip is assets/avatars/frames/<species>/<activity>.png,',
    ' * a row of square cells with the feet on `baseline` of a `cell`-px cell.',
    ' * `sequence` lists key indexes in play order, `beats` their start offsets (0–1)',
    ' * inside `duration` ms, and `cuts` the steps that enter as a hard cut instead',
    ' * of a `blend` ms dissolve. Optional `motion` holds one small whole-body',
    ' * {x,y,rot,sx,sy} annotation per key, interpolated between steps. */',
    '(function (root, factory) {',
    "  'use strict';",
    '  const api = factory();',
    "  if (typeof module === 'object' && module.exports) module.exports = api;",
    '  else root.OfficeCreatureFrameManifest = api;',
    "})(typeof globalThis === 'object' ? globalThis : this, function () {",
    "  'use strict';",
    '  return Object.freeze(/*MANIFEST*/' + JSON.stringify(ordered, null, 2).replace(/\n/g, '\n  ') + '/*END*/);',
    '});',
    ''
  ].join('\n');
  fs.writeFileSync(manifestPath, body);
}

// The release policy (lib/release-artwork.cjs) wants every packaged asset
// named exactly, so package.json lists each strip rather than a glob.
function syncBuildFiles(manifest) {
  const file = path.join(root, 'package.json'), pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const strips = Object.entries(manifest.strips).flatMap(([species, entries]) => Object.keys(entries).map(activity => 'assets/avatars/frames/' + species + '/' + activity + '.png'));
  const kept = pkg.build.files.filter(name => !String(name).startsWith('assets/avatars/frames/'));
  const at = kept.findIndex(name => name === 'assets/avatars/workshop-folio.png');
  kept.splice(at < 0 ? kept.length : at, 0, ...strips.sort());
  pkg.build.files = kept;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
}
function contact(cells, small, out) {
  // Full-size row above a 64px row, for a human look. Opaque atelier ground.
  const sheet = blank(CELL * cells.length, CELL + DISPLAY_SPAN + 16);
  for (let i = 0; i < sheet.width * sheet.height; i++) { sheet.px[i * 4] = 242; sheet.px[i * 4 + 1] = 234; sheet.px[i * 4 + 2] = 220; sheet.px[i * 4 + 3] = 255; }
  cells.forEach((c, i) => composite(sheet, c, i * CELL, 0)); small.forEach((s, i) => composite(sheet, s, i * CELL + 8, CELL + 8));
  fs.writeFileSync(out, encode(sheet));
}
function composite(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const si = (y * src.width + x) * 4, a = src.px[si + 3] / 255; if (!a) continue;
    const di = ((dy + y) * dst.width + dx + x) * 4;
    for (let k = 0; k < 3; k++) dst.px[di + k] = src.px[si + k] * a + dst.px[di + k] * (1 - a);
  }
}

async function main() {
  const opt = args(process.argv.slice(2));
  await app.whenReady();
  const manifest = loadManifest();
  if (opt.check) {
    let failures = 0;
    for (const [species, strips] of Object.entries(manifest.strips)) {
      const { ref, inFrame } = atlasIdle(species);
      for (const [activity, entry] of Object.entries(strips)) {
        const strip = decode(path.join(framesDir, species, activity + '.png'));
        const cells = Array.from({ length: entry.frames }, (_, i) => crop(strip, i * CELL, 0, CELL, CELL));
        const waived = new Set(entry.waived || []), problems = report(cells, ref, inFrame).problems.filter(problem => !waived.has(problem));
        console.log(JSON.stringify({ species, activity, frames: entry.frames, ok: !problems.length, problems, waived: [...waived] }));
        if (problems.length) failures++;
      }
    }
    app.exit(failures ? 1 : 0); return;
  }
  if (!opt.species || !ACTIVITIES.has(opt.activity) || !opt.sheet) { console.error('usage: --species <id> --activity <name> --sheet <file> --duration <ms>'); app.exit(2); return; }
  const { ref, inFrame, atlasRef } = atlasIdle(opt.species);
  const sheet = decode(opt.sheet), bg = keyColour(sheet);
  const raw = splitSheet(keyOut(sheet, bg));
  const bleed = raw.map(cell => pruneBleed(cell));
  if (opt.measure) {
    // Raw per-cell measurements before any registration, for diagnosing a sheet.
    for (const [i, cell] of raw.entries()) { const m = measure(cell); console.log(JSON.stringify({ frame: i, bbox: m.bbox, body: m.body, baseline: m.baseline, bodyTop: m.bodyTop, bodyHeight: m.bodyHeight, feetCentre: +m.feetCentre.toFixed(1), eyes: m.eyes ? { span: +m.eyes.span.toFixed(1), centre: m.eyes.centre.map(v => Math.round(v)) } : null })); }
    app.exit(0); return;
  }
  const registered = registerAll(raw, ref, opt.shift, opt.scale || 'height');
  const cells = registered.map(r => r.cell);
  const { rows, problems, small } = report(cells, ref, inFrame);
  const duration = opt.duration || manifest.strips[opt.species]?.[opt.activity]?.duration || 2400;
  const sequence = opt.sequence || cells.map((_, i) => i);
  if (sequence.some(k => !Number.isInteger(k) || k < 0 || k >= cells.length)) throw new Error('--sequence indexes a missing key');
  const beats = opt.beats || sequence.map((_, i) => +(i / sequence.length).toFixed(4));
  if (beats.length !== sequence.length || beats.some((b, i) => i && b <= beats[i - 1]) || beats[0] !== 0) throw new Error('--beats must start at 0, increase and match --sequence');
  if (opt.motion && (!Array.isArray(opt.motion) || opt.motion.length !== cells.length || opt.motion.some(m => !m || typeof m !== 'object' || Object.keys(m).some(k => !['x', 'y', 'rot', 'sx', 'sy'].includes(k) || !Number.isFinite(m[k]))))) throw new Error('--motion needs one {x,y,rot,sx,sy} object per key');
  // A forced write records exactly which checks it waived, so --check can
  // hold the strip to everything else and a reviewer can see the trade.
  const entry = { frames: cells.length, duration, sequence, beats, cuts: opt.cuts || [], ...(opt.motion ? { motion: opt.motion } : {}), ...(problems.length && opt.force ? { waived: problems } : {}), source: path.basename(opt.sheet), key: bg ? '#' + bg.map(v => v.toString(16).padStart(2, '0')).join('') : 'alpha', registration: registered.map(r => ({ scale: +r.scale.toFixed(4), dx: r.dx, dy: r.dy })) };
  console.log(JSON.stringify({ species: opt.species, activity: opt.activity, bleedRemoved: bleed, reference: { atlas: { bodyHeight: atlasRef.bodyHeight, bodyCentre: atlasRef.bodyCentre, baseline: atlasRef.baseline }, frame: ref }, key: entry.key, rows, problems }, null, 1));
  if (opt.preview) contact(cells, small, opt.preview);
  if (problems.length && !opt.force) { console.error('frame-qa: ' + problems.length + ' problem(s); pass --force to write anyway.'); app.exit(1); return; }
  if (!opt.dry) {
    const strip = blank(CELL * cells.length, CELL); cells.forEach((c, i) => paste(strip, c, i * CELL, 0));
    fs.mkdirSync(path.join(framesDir, opt.species), { recursive: true });
    fs.writeFileSync(path.join(framesDir, opt.species, opt.activity + '.png'), encode(strip));
    manifest.strips[opt.species] = manifest.strips[opt.species] || {}; manifest.strips[opt.species][opt.activity] = entry;
    saveManifest(manifest);
    syncBuildFiles(manifest);
    console.log('wrote ' + path.relative(root, path.join(framesDir, opt.species, opt.activity + '.png')) + ' and ' + path.relative(root, manifestPath));
  }
  app.exit(0);
}
main().catch(error => { console.error(error); app.exit(1); });
