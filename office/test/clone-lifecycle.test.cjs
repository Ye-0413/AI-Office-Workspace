'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Clones = require('../lib/clone-lifecycle.js');
const { createSessionStore } = require('../lib/session-store.cjs');
const { normalizeEvent } = require('../lib/provider-events.cjs');

const root = { id: 'codex:root', status: 'active', activity: 'planning' };
const child = (id, extra = {}) => ({ id, parentId: root.id, status: 'active', activity: 'coding', ...extra });

test('counts unique full IDs across nested helpers and keeps independent roots separate', () => {
  const ledger = Clones.createLedger();
  const children = [child('codex:shared'), child('cursor:shared'), child('codex:nested', { parentId: 'codex:shared' })];
  ledger.update([root, ...children, children[0], { id: 'other-root' }, child('other-child', { parentId: 'other-root' })], 100);
  assert.deepEqual(ledger.stats(root.id), { active: 3, total: 3, ended: 0, open: 3, uncertain: 0 });
  assert.equal(ledger.stats('other-root').total, 1);
  assert.equal(ledger.rootFor('codex:nested'), root.id);
  assert.deepEqual(ledger.parentChain('codex:nested'), ['codex:shared', root.id]);
  ledger.update([root, ...children], 200);
  assert.equal(ledger.stats(root.id).total, 3, 'repeated snapshots cannot create new clones');
  assert.deepEqual(ledger.stats('codex:shared'), { active: 0, total: 0, ended: 0, open: 0, uncertain: 0 });
});

test('idle, stale, disconnected and missing helpers stop counting as active without becoming ended', () => {
  const ledger = Clones.createLedger();
  const idle = child('idle', { status: 'idle', activity: 'idle' });
  const stale = child('stale', { status: 'stale', activity: 'unknown' });
  const disconnected = child('disconnected', { disconnected: true });
  const waiting = child('waiting', { status: 'waiting', activity: 'waiting-user', attention: true });
  ledger.update([root, idle, stale, disconnected, waiting, child('missing')], 1);
  assert.deepEqual(ledger.stats(root.id), { active: 2, total: 5, ended: 0, open: 5, uncertain: 2 });
  ledger.update([root, idle, stale, disconnected, waiting], 9999999);
  assert.deepEqual(ledger.stats(root.id), { active: 1, total: 5, ended: 0, open: 5, uncertain: 3 });
  ledger.update([], 999999999);
  assert.deepEqual(ledger.stats(root.id), { active: 0, total: 5, ended: 0, open: 5, uncertain: 5 });
});

test('confirmed end remains historical after removal, startup seeds closed children, and real reopening reuses the identity', () => {
  const ledger = Clones.createLedger();
  ledger.update([root, child('ended', { closed: true, status: 'closed' }), child('working')], 1);
  assert.deepEqual(ledger.stats(root.id), { active: 1, total: 2, ended: 1, open: 1, uncertain: 0 });
  ledger.update([root, child('working')], 2);
  assert.equal(ledger.stats(root.id).ended, 1);
  ledger.update([root, child('ended'), child('working')], 3);
  assert.deepEqual(ledger.stats(root.id), { active: 2, total: 2, ended: 0, open: 2, uncertain: 0 });
});
test('a generic active status without known work evidence stays uncertain instead of inventing activity', () => {
  const ledger = Clones.createLedger();
  ledger.update([root, child('unknown-result', { activity: 'unknown', activeTools: 0 }),
    child('known-running', { activity: 'running' }), child('unknown-tool', { activity: 'unknown', activeTools: 1 })], 1);
  assert.deepEqual(ledger.stats(root.id), { active: 2, total: 3, ended: 0, open: 3, uncertain: 1 });
  assert.equal(Clones.isActive({ status: 'active', activity: 'unknown', activeTools: 0 }), false);
});

test('late and temporarily missing parent ancestry resolves actual roots without guessed or duplicate attribution', () => {
  const ledger = Clones.createLedger();
  ledger.update([root, child('nested', { parentId: 'middle' })], 1);
  assert.equal(ledger.rootFor('nested'), null, 'an unseen parent is not evidence of a root');
  assert.equal(ledger.stats(root.id).total, 0);
  assert.deepEqual(ledger.parentChain('nested'), ['middle']);
  ledger.update([root, child('middle'), child('nested', { parentId: 'middle' })], 2);
  assert.equal(ledger.rootFor('nested'), root.id);
  assert.equal(ledger.stats(root.id).total, 2);
  ledger.update([root, child('nested', { parentId: 'middle' })], 3);
  assert.deepEqual(ledger.parentChain('nested'), ['middle', root.id]);
  assert.deepEqual(ledger.stats(root.id), { active: 1, total: 2, ended: 0, open: 2, uncertain: 1 });
  ledger.update([root, child('middle'), child('nested', { parentId: 'middle', closed: true })], 4);
  assert.deepEqual(ledger.stats(root.id), { active: 1, total: 2, ended: 1, open: 1, uncertain: 0 });
});

test('later observed ancestry reattributes a whole subtree instead of accumulating it under two roots', () => {
  const ledger = Clones.createLedger();
  ledger.update([{ id: 'middle' }, { id: 'nested', parentId: 'middle', status: 'active' }], 1);
  assert.equal(ledger.stats('middle').total, 1);
  ledger.update([root, child('middle'), { id: 'nested', parentId: 'middle', status: 'active' }], 2);
  assert.equal(ledger.stats('middle').total, 0);
  assert.equal(ledger.stats(root.id).total, 2);
  ledger.update([root, { id: 'middle', status: 'active' }], 3);
  assert.equal(ledger.rootFor('nested'), root.id, 'partial metadata cannot erase a previously observed parent');
});

test('presentation repair copies only missing observed direct parents without mutating or inventing source records', () => {
  const ledger = Clones.createLedger().update([root, child('middle'), child('nested', { parentId: 'middle' }), { id: 'self', parentId: 'self' }]);
  const missing = Object.freeze({ id: 'middle', status: 'active', activity: 'coding' });
  const nested = Object.freeze({ id: 'nested', status: 'active' });
  const explicit = Object.freeze({ id: 'middle', parentId: 'new-positive-parent' });
  const unknown = Object.freeze({ id: 'unknown', status: 'active' }), self = Object.freeze({ id: 'self' });
  const rows = Object.freeze([root, missing, nested, explicit, unknown, self, null]);
  const before = JSON.stringify(rows), projected = ledger.presentationSessions(rows);
  assert.notEqual(projected, rows); assert.equal(projected.length, rows.length);
  assert.notEqual(projected[1], missing); assert.deepEqual(projected[1], { ...missing, parentId: root.id });
  assert.deepEqual(projected[2], { ...nested, parentId: 'middle' }, 'restore the immediate parent rather than skipping to the root');
  assert.equal(projected[0], root); assert.equal(projected[3], explicit, 'an explicit positive parent takes precedence over retained history');
  assert.equal(projected[4], unknown); assert.equal(projected[5], self); assert.equal(projected[6], null);
  assert.equal(JSON.stringify(rows), before); assert.equal(Object.hasOwn(missing, 'parentId'), false);
  const unchanged = Object.freeze([root, explicit, unknown, self, null]);
  assert.equal(ledger.presentationSessions(unchanged), unchanged, 'an unchanged view allocates neither an array nor any record');
  assert.deepEqual(ledger.presentationSessions(undefined), []);
});

test('a real normalized helper rehydrated after the default store history limit retains its observed parent in presentation only', () => {
  let time = 10000;
  const store = createSessionStore({ now: () => time, staleMs: 180000 }), ledger = Clones.createLedger();
  store.onChange(rows => ledger.update(rows, time));
  function emit(hook_event_name, session_id, extra = {}) {
    const event = normalizeEvent('codex', { hook_event_name, session_id, ...extra }, { receivedAt: ++time, source: 'hook' });
    assert.ok(event); assert.equal(store.ingest(event), true);
  }
  for (let index = 0; index < 100; index++) emit('UserPromptSubmit', 'root-' + index, { turn_id: 'root-turn-' + index });
  emit('UserPromptSubmit', 'rehydrated-helper', { parent_thread_id: 'root-0', turn_id: 'child-turn-1' });
  assert.equal(store.snapshot().find(session => session.id === 'codex:rehydrated-helper').parentId, 'codex:root-0');
  emit('Stop', 'rehydrated-helper', { turn_id: 'child-turn-1' });
  assert.equal(store.snapshot().some(session => session.id === 'codex:rehydrated-helper'), false, 'the idle child is genuinely evicted above the default 100-record target');
  emit('UserPromptSubmit', 'rehydrated-helper', { turn_id: 'child-turn-2' });
  const sourceRows = store.snapshot(), raw = sourceRows.find(session => session.id === 'codex:rehydrated-helper');
  assert.equal(raw.parentId, undefined); assert.equal(ledger.rootFor(raw.id), 'codex:root-0');
  const projected = ledger.presentationSessions(sourceRows), helper = projected.find(session => session.id === raw.id);
  assert.equal(helper.parentId, 'codex:root-0'); assert.equal(helper.id, raw.id); assert.equal(helper.activity, raw.activity); assert.equal(helper.status, raw.status);
  assert.equal(helper.events, raw.events, 'projection changes no event, lifecycle or work evidence');
  assert.equal(raw.parentId, undefined); assert.equal(store.snapshot().find(session => session.id === raw.id).parentId, undefined, 'view repair does not mutate the reducer');
});

test('malformed input and cycles stay bounded and never invent an unrelated family', () => {
  const ledger = Clones.createLedger();
  ledger.update([null, {}, { id: 3 }, { id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'self', parentId: 'self' }, root], NaN);
  assert.equal(ledger.size, 4);
  assert.equal(ledger.rootFor('a'), null);
  assert.equal(ledger.rootFor('self'), null);
  assert.deepEqual(ledger.stats(root.id), { active: 0, total: 0, ended: 0, open: 0, uncertain: 0 });
  assert.deepEqual(Clones.parentChain([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], 'a'), ['b']);
  ledger.update(undefined, Infinity);
  assert.equal(ledger.rootFor('a'), null);
});

test('memory trimming removes only whole absent confirmed-ended families and protects ongoing history', () => {
  const ledger = Clones.createLedger({ retentionLimit: 3 });
  ledger.update([{ id: 'old-root', closed: true }, { id: 'old-child', parentId: 'old-root', closed: true }], 1);
  ledger.update([root, child('now-child')], 2);
  assert.equal(ledger.size, 2);
  assert.equal(ledger.rootFor('old-child'), null);
  assert.equal(ledger.stats(root.id).total, 1);
  ledger.update([root, child('now-child'), child('ended-one', { closed: true }), child('ended-two', { closed: true })], 3);
  ledger.update([root], 4);
  assert.equal(ledger.size, 4, 'an ongoing family may exceed the soft target to retain exact identity history');
  assert.deepEqual(ledger.stats(root.id), { active: 0, total: 3, ended: 2, open: 1, uncertain: 1 });
});

test('the real reducer distinguishes a helper Stop from its authoritative SubagentEnd', () => {
  let now = 1000;
  const store = createSessionStore({ now: () => now, staleMs: 10000 });
  const ledger = Clones.createLedger();
  const emit = (hook_event_name, extra = {}) => {
    store.ingest(normalizeEvent('codex', { session_id: 'root', turn_id: 'turn', hook_event_name, ...extra }, { receivedAt: now++, source: 'hook' }));
    ledger.update(store.snapshot(), now);
  };
  emit('UserPromptSubmit', { prompt: 'Inspect real session state' });
  emit('SubagentStart', { agent_id: 'helper' });
  assert.equal(ledger.stats('codex:root').active, 1);
  emit('Stop', { agent_id: 'helper' });
  assert.deepEqual(ledger.stats('codex:root'), { active: 0, total: 1, ended: 0, open: 1, uncertain: 0 });
  emit('SubagentStop', { agent_id: 'helper' });
  assert.deepEqual(ledger.stats('codex:root'), { active: 0, total: 1, ended: 1, open: 0, uncertain: 0 });
});

test('UMD runs without Node or browser effects and returned counts/ancestry are defensive', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/clone-lifecycle.js'), 'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox), ['OfficeClones']);
  const ledger = Clones.createLedger().update([root, child('helper')], 1);
  const counts = ledger.stats(root.id), chain = ledger.parentChain('helper');
  counts.total = 999; chain.push('invented-root');
  assert.equal(ledger.stats(root.id).total, 1);
  assert.deepEqual(ledger.parentChain('helper'), [root.id]);
  assert.ok(Object.isFrozen(Clones));
  assert.ok(Object.isFrozen(ledger));
});
