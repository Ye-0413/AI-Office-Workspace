'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Progression = require('../lib/progression-model.js');
const Persona = require('../lib/agent-persona.js');
const { createUnlockLedger } = require('../lib/unlock-ledger.cjs');
const { createUsageLog } = require('../lib/usage-log.cjs');

test('decorations and growth follow real lifetime counts only', () => {
  assert.deepEqual(Progression.evaluate({}).decorations, []);
  assert.equal(Progression.evaluate({}).growth, 0);
  const some = Progression.evaluate({ turns: 30, toolCalls: 99, checksPassed: 10, days: 5, activeMs: 10 * 3600000 - 1 });
  assert.deepEqual(some.decorations, ['fern', 'trophy', 'bunting']);
  assert.equal(some.growth, 1); assert.equal(some.nextGrowth, 100);
  assert.equal(some.progress.lamp, 0.99);
  const top = Progression.evaluate({ turns: 400, toolCalls: 100, activeMs: 36000000 });
  assert.equal(top.growth, 3); assert.equal(top.nextGrowth, null);
  assert.deepEqual(Progression.evaluate({ keepsakes: ['star', 'unknown', 'teacup', 'star'] }).keepsakes, ['teacup', 'star']);
  assert.deepEqual(Progression.KEEPSAKES.map(item => item.id), ['teacup', 'paperboat', 'bookmark', 'lantern', 'leaf', 'pebble', 'bell', 'pencil', 'shell', 'star', 'acorn', 'ribbon']);
});

function ledgerFixture(t, lifetime) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-unlocks-')), file = path.join(dir, 'unlocks.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let time = 1000;
  const log = { lifetime: () => lifetime.value };
  return { file, make: () => createUnlockLedger({ file, log, now: () => time }), tick: ms => { time += ms; } };
}

test('the unlock ledger rebuilds from history, keeps first-earned dates and never loses an unlock to pruning', t => {
  const finished = { provider: 'codex', id: 'codex:finished' }, keepsake = Persona.forSession(finished).keepsake;
  const lifetime = { value: { ok: true, turns: 30, toolCalls: 120, checksPassed: 0, days: 2, activeMs: 0, finishedActors: [finished] } };
  const f = ledgerFixture(t, lifetime);
  const first = f.make().refresh();
  assert.deepEqual(first.keepsakes, [keepsake]); assert.deepEqual(first.decorations, ['fern', 'lamp']); assert.equal(first.growth, 1);
  assert.equal(first.earnedAt['decoration:fern'], 1000);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
  f.tick(5000);
  assert.equal(f.make().refresh().earnedAt['decoration:fern'], 1000, 'a reopened ledger keeps the first date');
  lifetime.value = { ok: true, turns: 2, toolCalls: 3, finishedActors: [] };
  const pruned = f.make().refresh();
  assert.deepEqual(pruned.decorations, ['fern', 'lamp']); assert.deepEqual(pruned.keepsakes, [keepsake]); assert.equal(pruned.growth, 1);
  fs.writeFileSync(f.file, '{broken');
  lifetime.value = { ok: true, turns: 30, toolCalls: 120, finishedActors: [finished] };
  const rebuilt = f.make().refresh();
  assert.deepEqual([rebuilt.keepsakes, rebuilt.decorations, rebuilt.growth], [first.keepsakes, first.decorations, first.growth]);
  fs.rmSync(f.file);
  assert.deepEqual(f.make().refresh().decorations, ['fern', 'lamp']);
  lifetime.value = { ok: false };
  assert.equal(f.make().refresh().ok, false, 'an unreadable log reports unavailability instead of inventing unlocks');
});

test('lifetime counts come from the usage log, with finished actors only', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-lifetime-'));
  let time = Date.parse('2026-10-16T07:00:00Z');
  const log = createUsageLog({ dataDir, now: () => time });
  t.after(() => { log.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const event = (sessionId, extra) => ({ provider: 'codex', sessionId, eventId: sessionId + ':' + extra.event + ':' + (extra.toolCallId || ''), at: time, turnId: 't-' + sessionId, activity: 'coding', evidence: { source: 'hook', kind: 'native' }, ...extra });
  const snap = id => [{ id: 'codex:' + id, status: 'active', activity: 'testing', lastEventAt: time }];
  log.record(event('done', { event: 'turn-start' }), snap('done'));
  log.record(event('done', { event: 'tool-end', activity: 'testing', outcome: 'success', toolCallId: 'c1' }), snap('done'));
  log.record(event('done', { event: 'turn-end' }), snap('done'));
  log.record(event('meta', { event: 'metadata', turnId: undefined }), snap('meta'));
  const lifetime = log.lifetime();
  assert.equal(lifetime.ok, true);
  assert.equal(lifetime.turns, 1); assert.equal(lifetime.checksPassed, 1); assert.equal(lifetime.days, 1);
  assert.deepEqual(lifetime.finishedActors, [{ id: 'codex:done', provider: 'codex' }]);
});
