'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Appearance = require('../lib/agent-appearance.js');
const actor = (id, extra = {}) => ({ id: 'codex:' + id, sessionId: id, provider: 'codex', ...extra });
const unique = (allocator, ids) => new Set(ids.map(id => allocator.forRoot(id).appearanceKey)).size;
function collidingRoots(count) {
  const groups = new Map();
  for (let index = 0; index < 1000; index++) {
    const session = actor('collision-' + index), key = Appearance.forSession(session).id;
    if (!groups.has(key)) groups.set(key, []);
    const roots = groups.get(key); roots.push(session.id);
    if (roots.length === count) return roots;
  }
  throw Error('Missing colliding fixture');
}

test('the bilingual five-creature catalog is immutable and offers only family allocation', () => {
  assert.deepEqual(Appearance.IDS, ['folio', 'ink', 'moss', 'thread', 'glow']);
  assert.deepEqual(Appearance.MODES, ['mixed']);
  assert.ok(Object.isFrozen(Appearance.catalog));
  assert.deepEqual(Appearance.catalog.map(design => design.labelZh), ['纸团', '墨豆', '苔盒', '线团', '灯籽']);
  for (const design of Appearance.catalog) {
    assert.ok(Object.isFrozen(design));
    for (const field of ['labelZh','labelEn','roleZh','roleEn','descriptionZh','descriptionEn']) assert.ok(design[field]);
    assert.equal(design.asset, 'workshop-' + design.id + '.png');
    assert.equal(design.renderer, 'creature'); assert.equal(design.poseColumns, 3); assert.equal(design.poseRows, 2);
    assert.equal(design.variantIndex, 0); assert.equal(design.appearanceKey, design.id + ':0');
  }
});

test('all providers, including Claude, resolve nested helpers to their actual main appearance', () => {
  for (const provider of ['claude-code','claude','Claude Code','cursor','codex','future-provider']) {
    const root = actor('root-' + provider, { provider }), child = actor('child', { provider: 'different-provider', parentId: root.id });
    const nested = actor('nested', { parentId: child.id }), sessions = Object.freeze([Object.freeze(root),Object.freeze(child),Object.freeze(nested)]);
    const chosen = Appearance.forSession(root, { sessions });
    assert.ok(Appearance.catalog.includes(chosen));
    assert.equal(Appearance.forSession(child, { sessions }), chosen);
    assert.equal(Appearance.forSession(nested, { sessions }), chosen);
    assert.equal(Appearance.resolveRoot(nested, { sessions }), root.id);
    assert.equal(Appearance.forSession({ ...nested, activity: 'error', status: 'idle', title: 'renamed', language: 'en' }, { sessions: Appearance.indexSessions(sessions) }), chosen);
    const restored = JSON.parse(JSON.stringify(sessions));
    assert.equal(Appearance.forSession(restored[2], { sessions: restored }), chosen);
  }
});

test('missing parents, native parent IDs and cyclic ancestry are safe and presentation only', () => {
  const root = actor('root'), child = actor('child', { parentSessionId: 'root' });
  assert.equal(Appearance.resolveRoot(child), root.id);
  assert.equal(Appearance.forSession(child), Appearance.forSession(root));
  assert.equal(Appearance.forSession(child, { sessions: [root,child] }), Appearance.forSession(root));
  const a = actor('a', { parentId: 'codex:b' }), b = actor('b', { parentId: a.id }), descendant = actor('0-child', { parentId: b.id });
  const sessions = [descendant,b,a], before = JSON.stringify(sessions);
  for (const session of sessions) assert.equal(Appearance.resolveRoot(session, { sessions }), a.id);
  assert.equal(JSON.stringify(sessions), before);
  assert.doesNotThrow(() => Appearance.forSession(null)); assert.equal(Appearance.resolveRoot(null), '');
});

test('one to five colliding live roots receive distinct original designs in deterministic order', () => {
  const roots = collidingRoots(5);
  assert.equal(new Set(roots.map(id => Appearance.forSession({ id }).id)).size, 1, 'fixture exercises genuine hash collisions');
  for (let count = 1; count <= 5; count++) {
    const ids = roots.slice(0,count), allocator = Appearance.createAllocator(), baseline = Appearance.createAllocator();
    allocator.update(ids); baseline.update([...ids].reverse());
    assert.equal(allocator.baseCount, 5); assert.equal(unique(allocator, ids), count);
    assert.equal(new Set(ids.map(id => allocator.forRoot(id).id)).size, count);
    assert.ok(ids.every(id => allocator.forRoot(id).variantIndex === 0));
    assert.deepEqual(ids.map(id => allocator.forRoot(id)), ids.map(id => baseline.forRoot(id)));
  }
});

test('snapshot shuffles and arrivals preserve every main still physically present, including departures', () => {
  const roots = collidingRoots(5), allocator = Appearance.createAllocator();
  allocator.update(roots.slice(0,2)); const departing = allocator.forRoot(roots[0]), resident = allocator.forRoot(roots[1]);
  allocator.update([...roots].reverse());
  assert.equal(allocator.forRoot(roots[0]), departing); assert.equal(allocator.forRoot(roots[1]), resident);
  const before = roots.map(id => allocator.forRoot(id));
  for (let index = 0; index < 20; index++) allocator.update([...roots].sort((a,b) => index % 2 ? a.localeCompare(b) : b.localeCompare(a)));
  assert.deepEqual(roots.map(id => allocator.forRoot(id)), before);
  assert.equal(unique(allocator, roots), 5);
});

test('returning families reclaim a free old slot without displacing a visible owner', () => {
  const roots = collidingRoots(5), allocator = Appearance.createAllocator(); allocator.update(roots);
  const old = allocator.forRoot(roots[0]); allocator.update(roots.slice(1)); allocator.update(roots);
  assert.equal(allocator.forRoot(roots[0]), old);
  const newcomer = 'codex:newcomer'; allocator.update([...roots.slice(1),newcomer]);
  const occupied = allocator.forRoot(newcomer); assert.equal(occupied, old);
  const returning = [roots[0],...roots.slice(2),newcomer]; allocator.update(returning);
  assert.equal(allocator.forRoot(newcomer), occupied); assert.notEqual(allocator.forRoot(roots[0]), old);
  assert.equal(unique(allocator, returning), 5);
});

test('overflow uses balanced material variants with unique appearance keys and no hidden roots', () => {
  const roots = Array.from({ length: 27 }, (_, index) => 'codex:overflow-' + index), allocator = Appearance.createAllocator();
  allocator.update(roots);
  assert.equal(allocator.activeRoots.length, roots.length); assert.equal(unique(allocator, roots), roots.length);
  const rows = new Map();
  for (const id of roots) {
    const design = allocator.forRoot(id);
    assert.ok(Number.isInteger(design.variantIndex) && design.variantIndex >= 0);
    assert.equal(design.appearanceKey, design.id + ':' + design.variantIndex); assert.ok(Object.isFrozen(design));
    if (!rows.has(design.variantIndex)) rows.set(design.variantIndex, []);
    rows.get(design.variantIndex).push(design.id);
  }
  for (let row = 0; row < 5; row++) assert.deepEqual([...rows.get(row)].sort(), [...Appearance.IDS].sort());
  assert.equal(rows.get(5).length, 2);
  const retained = roots.filter(id => allocator.forRoot(id).variantIndex >= 4).slice(0,4), before = retained.map(id => allocator.forRoot(id));
  allocator.update(retained); assert.deepEqual(retained.map(id => allocator.forRoot(id)), before, 'shrinking a crowd never recolours its remaining owners');
  allocator.update([...retained,'codex:fresh-a','codex:fresh-b']);
  assert.equal(unique(allocator, allocator.activeRoots), 6); assert.deepEqual(retained.map(id => allocator.forRoot(id)), before);
});

test('helpers inherit the exact allocated root material and colour variant without consuming slots', () => {
  const roots = Array.from({ length: 9 }, (_, index) => actor('main-' + index)), allocator = Appearance.createAllocator();
  allocator.update(roots.map(session => session.id));
  const root = roots.find(session => allocator.forRoot(session.id).variantIndex > 0), child = actor('child', { parentId: root.id }), nested = actor('nested', { parentId: child.id });
  const sessions = [...roots,child,nested], before = JSON.stringify(sessions), expected = allocator.forRoot(root.id);
  assert.equal(allocator.forSession(child, { sessions }), expected);
  assert.equal(allocator.forSession(nested, { sessions: Appearance.indexSessions(sessions) }), expected);
  assert.equal(allocator.activeRoots.length, 9); assert.equal(JSON.stringify(sessions), before);
});

test('passive history cannot reserve live shapes and bounded retention never evicts visible roots', () => {
  const allocator = Appearance.createAllocator({ retentionLimit: 5 }), roots = collidingRoots(5); allocator.update(roots);
  const before = roots.map(id => allocator.forRoot(id));
  for (let index = 0; index < 100; index++) allocator.forRoot('historical-' + index);
  assert.equal(allocator.size, 5); allocator.update(roots);
  assert.deepEqual(roots.map(id => allocator.forRoot(id)), before);
  const many = Array.from({ length: 20 }, (_, index) => 'live-' + index); allocator.update(many);
  assert.equal(allocator.size, many.length); assert.equal(unique(allocator, many), many.length);
  allocator.update(many.slice(0,2)); assert.equal(allocator.size, 5); assert.equal(unique(allocator, many.slice(0,2)), 2);
});

test('all retired global policies migrate to automatic allocation and cannot force duplicate mains', () => {
  const previous = ['original','orb','console','sprout','kite','prism',...Appearance.IDS];
  for (const mode of previous) {
    assert.equal(Appearance.normalizeMode(mode), 'mixed'); assert.equal(Appearance.migrateMode(mode), 'mixed');
    assert.equal(Appearance.forSession(actor('root'), { mode }), Appearance.forSession(actor('root')));
  }
  assert.equal(Appearance.migrateMode('mixed'), 'mixed');
  for (const invalid of ['', 'bad', '__proto__', null, {}, 1]) { assert.equal(Appearance.migrateMode(invalid), null); assert.equal(Appearance.normalizeMode(invalid), 'mixed'); }
});

test('browser and Node consumers receive the same allocator and ancestry API', () => {
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/agent-appearance.js'),'utf8'), context);
  const browser = context.OfficeAgentAppearance, allocator = browser.createAllocator(); allocator.update(['a','b','c','d','e','f']);
  assert.deepEqual(Array.from(browser.IDS), Appearance.IDS); assert.equal(allocator.activeRoots.length, 6);
  assert.equal(new Set(allocator.activeRoots.map(id => allocator.forRoot(id).appearanceKey)).size, 6);
  assert.equal(browser.forSession(actor('browser')).id, Appearance.forSession(actor('browser')).id);
});
