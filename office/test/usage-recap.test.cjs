'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createUsageLog } = require('../lib/usage-log.cjs');
const { createUsageRecap } = require('../lib/usage-recap.cjs');
const Recap = require('../renderer/usage-recap.js');

const DAY = '2026-10-16', AT = Date.parse('2026-10-16T07:00:00Z');
function workspace(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-recap-')), logs = [];
  t.after(() => { for (const log of logs) log.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, file: path.join(dataDir, 'usage-history', 'usage.sqlite3'), open: () => { const log = createUsageLog({ dataDir, now: () => AT }); logs.push(log); return log; } };
}
// A synthetic version-1 archive, written with the exact v1 table shapes.
function writeV1(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE actors(id TEXT PRIMARY KEY, provider TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '', project_name TEXT NOT NULL DEFAULT '', first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, status TEXT NOT NULL, activity TEXT NOT NULL);
    CREATE TABLE events(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES actors(id), at INTEGER NOT NULL, observed_at INTEGER NOT NULL, day TEXT NOT NULL, event TEXT NOT NULL, activity TEXT NOT NULL, status TEXT NOT NULL, tool_name TEXT NOT NULL, outcome TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, turn_id TEXT NOT NULL);
    CREATE TABLE actor_days(actor_id TEXT NOT NULL REFERENCES actors(id), day TEXT NOT NULL, events INTEGER NOT NULL DEFAULT 0, turns INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, waiting_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(actor_id,day));
    CREATE TABLE activity_days(actor_id TEXT NOT NULL REFERENCES actors(id), day TEXT NOT NULL, activity TEXT NOT NULL, ms INTEGER NOT NULL, PRIMARY KEY(actor_id,day,activity));
    CREATE TABLE archive_totals(singleton INTEGER PRIMARY KEY CHECK(singleton=1), agents INTEGER NOT NULL, events INTEGER NOT NULL);
    CREATE TABLE observed_turns(actor_id TEXT PRIMARY KEY REFERENCES actors(id), identity TEXT NOT NULL);
    CREATE TABLE boundaries(actor_id TEXT NOT NULL REFERENCES actors(id), kind TEXT NOT NULL, identity TEXT NOT NULL, PRIMARY KEY(actor_id,kind,identity));`);
  const actor = db.prepare('INSERT INTO actors VALUES(?,?,?,?,?,?,?,?)'), event = db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  actor.run('codex:main', 'codex', '', 'secret-project', AT, AT, 'idle', 'idle');
  actor.run('codex:main/helper', 'codex', 'codex:main', '', AT, AT, 'idle', 'idle');
  for (const [id, activity, outcome] of [['a', 'testing', 'success'], ['b', 'building', 'failure'], ['c', 'coding', 'success'], ['d', 'testing', '']])
    event.run(id, 'codex:main', AT, AT, DAY, 'tool-end', activity, 'active', 'Shell', outcome, 'hook', 'native', 't1');
  db.prepare('INSERT INTO actor_days VALUES(?,?,?,?,?,?,?,?)').run('codex:main', DAY, 4, 1, 3, 1, 1800000, 60000);
  db.prepare('INSERT INTO actor_days VALUES(?,?,?,?,?,?,?,?)').run('codex:main/helper', DAY, 1, 0, 0, 0, 600000, 0);
  db.prepare('INSERT INTO activity_days VALUES(?,?,?,?)').run('codex:main', DAY, 'testing', 1200000);
  db.prepare('INSERT INTO activity_days VALUES(?,?,?,?)').run('codex:main', DAY, 'coding', 600000);
  db.prepare('INSERT INTO archive_totals VALUES(1,2,4)').run();
  db.exec('PRAGMA user_version=1');
  db.close();
}

test('a version-1 archive migrates to version 2 and backfills only explicit check results', t => {
  const w = workspace(t); writeV1(w.file);
  const before = (() => { const db = new DatabaseSync(w.file); const rows = db.prepare('SELECT * FROM actor_days ORDER BY actor_id').all(); db.close(); return JSON.stringify(rows); })();
  const log = w.open();
  assert.equal(log.status().available, true);
  const recap = log.recap(DAY);
  assert.deepEqual(recap.checks, { passed: 1, failed: 1 }, 'coding results and unknown outcomes are not checks');
  assert.equal(recap.totals.agents, 2); assert.equal(recap.totals.roots, 1); assert.equal(recap.totals.helpers, 1);
  assert.equal(recap.totals.activeMs, 2400000);
  assert.deepEqual(recap.activities.map(item => item.activity), ['testing', 'coding']);
  assert.equal(log.query({ from: DAY, to: DAY }).totals.events, 5, 'existing history reads the same after migration');
  log.close();
  const db = new DatabaseSync(w.file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM actor_days ORDER BY actor_id').all()), before);
  db.close();
  const again = w.open();
  assert.deepEqual(again.recap(DAY).checks, { passed: 1, failed: 1 }, 'reopening does not backfill twice');
});

test('a future schema is refused instead of rewritten', t => {
  const w = workspace(t); fs.mkdirSync(path.dirname(w.file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(w.file); db.exec('PRAGMA user_version=3'); db.close();
  const log = w.open();
  assert.equal(log.status().available, false);
  assert.equal(log.recap(DAY).ok, false);
});

test('live check results count once, and the recap carries no project name unless asked', t => {
  const w = workspace(t), log = w.open();
  const end = (eventId, activity, outcome) => ({ provider: 'codex', sessionId: 's', event: 'tool-end', eventId, at: AT, activity, outcome, toolCallId: 'call-' + eventId, turnId: 't', evidence: { source: 'hook', kind: 'native' } });
  const snapshot = [{ id: 'codex:s', status: 'active', activity: 'testing', lastEventAt: AT, projectName: 'private-repo', title: 'Fix the login bug' }];
  assert.equal(log.record(end('pass', 'testing', 'success'), snapshot), true);
  assert.equal(log.record(end('pass', 'testing', 'success'), snapshot), false);
  assert.equal(log.record(end('fail', 'building', 'failure'), snapshot), true);
  assert.equal(log.record(end('edit', 'coding', 'success'), snapshot), true);
  const recap = log.recap(DAY);
  assert.deepEqual(recap.checks, { passed: 1, failed: 1 });
  assert.equal('projects' in recap, false);
  assert.doesNotMatch(JSON.stringify(recap), /private-repo|login/);
  const open = log.recap(DAY, { includeProjects: true });
  assert.deepEqual(open.projects.map(item => item.name), ['private-repo']);
  assert.doesNotMatch(JSON.stringify(open), /login/, 'titles never leave the log');
});

test('the recap API adds token totals and writes only a validated PNG through a safe destination', async t => {
  const w = workspace(t), log = w.open(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'office-recap-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  let chosen = path.join(out, 'recap.png'), asked = [];
  const api = createUsageRecap({ log, tokens: { query: f => (asked.push(f), { ok: true, totals: { totalTokens: 4321 } }) }, chooseExport: async name => (asked.push(name), chosen ? { filePath: chosen } : { canceled: true }) });
  const daily = api.daily({ day: DAY });
  assert.equal(daily.tokens, 4321); assert.deepEqual(asked[0], { from: DAY, to: DAY }); assert.equal('projects' in daily, false);
  assert.throws(() => api.daily({ day: '2026-02-30' }), /Invalid recap date/);
  assert.throws(() => api.daily({ day: DAY, includeProjects: 'yes' }), /privacy/);
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]);
  const png = 'data:image/png;base64,' + bytes.toString('base64');
  await assert.rejects(api.exportPng({ day: DAY, png: 'data:image/png;base64,' + Buffer.alloc(120).toString('base64') }), /Invalid recap image/);
  await assert.rejects(api.exportPng({ day: DAY, png: 'data:text/html;base64,AAAA' }), /Invalid recap image/);
  const result = await api.exportPng({ day: DAY, png });
  assert.equal(result.exported, true); assert.equal(asked.at(-1), 'agent-recap-' + DAY + '.png');
  assert.deepEqual(fs.readFileSync(chosen), bytes);
  assert.equal(fs.statSync(chosen).mode & 0o777, 0o600);
  const link = path.join(out, 'link.png'); fs.symlinkSync(path.join(out, 'elsewhere.png'), link); chosen = link;
  await assert.rejects(api.exportPng({ day: DAY, png }), /Unsafe/);
  assert.equal(fs.existsSync(path.join(out, 'elsewhere.png')), false);
  chosen = null; assert.deepEqual(await api.exportPng({ day: DAY, png }), { canceled: true });
  assert.deepEqual(fs.readdirSync(out).filter(name => name.endsWith('.tmp')), []);
});

test('recap rows are bilingual and list projects only when the record carries them', () => {
  const recap = { day: DAY, totals: { agents: 3, roots: 2, helpers: 1, turns: 5, toolCalls: 12, activeMs: 5400000, waitingMs: 120000 }, checks: { passed: 4, failed: 1 }, activities: [{ activity: 'testing', ms: 9 }, { activity: 'coding', ms: 3 }], tokens: 12000 };
  const zh = Recap.rows(recap, 'zh'), en = Recap.rows(recap, 'en');
  assert.deepEqual(zh.map(row => row.key), ['agents', 'turns', 'tools', 'checks', 'active', 'waiting', 'tokens', 'top']);
  assert.equal(zh.find(row => row.key === 'checks').detail, '通过 4 · 未通过 1');
  assert.equal(en.find(row => row.key === 'active').value, '1h 30m');
  assert.equal(en.find(row => row.key === 'top').value, 'Testing · Coding');
  assert.equal(Recap.rows({ ...recap, tokens: null }, 'en').find(row => row.key === 'tokens').value, 'No log coverage');
  assert.equal(Recap.rows({ ...recap, projects: [{ name: 'office', ms: 1 }] }, 'en').at(-1).value, 'office');
  assert.equal(Recap.hkDay(Date.parse('2026-11-12T17:00:00Z')), '2026-11-13');
});
