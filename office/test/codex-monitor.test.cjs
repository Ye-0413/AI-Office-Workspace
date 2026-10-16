'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCodexMonitor, LIMITS } = require('../lib/codex-monitor.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');
const Director = require('../lib/animation-director.js');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-codex-'));
  let time = Date.now();
  const date = new Date(time);
  const dir = path.join(temp, 'sessions', `${date.getFullYear()}`, `${date.getMonth() + 1}`.padStart(2, '0'), `${date.getDate()}`.padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const events = [], monitors = [];
  function row(type, payload, at = time) { return JSON.stringify({ timestamp: new Date(at).toISOString(), type, payload }); }
  function file(name, rows) {
    const p = path.join(dir, `rollout-${name}.jsonl`);
    fs.writeFileSync(p, rows.join('\n') + '\n'); return p;
  }
  function monitor(extra = {}) {
    const m = createCodexMonitor({ codexHome: temp, now: () => time, onEvent: e => events.push(e), intervalMs: 10000, ...extra }); monitors.push(m); return m;
  }
  t.after(() => { for (const m of monitors) m.stop(); fs.rmSync(temp, { recursive: true, force: true }); });
  return { temp, dir, row, file, monitor, events, tick(ms = 10) { time += ms; return time; }, now: () => time,
    meta(id = 'one', extra = {}) { return row('session_meta', { id, session_id: id, cwd: '/test/project', source: 'vscode', ...extra }); },
    start(id = 't1') { return row('event_msg', { type: 'task_started', turn_id: id }); },
    end(id = 't1') { return row('event_msg', { type: 'task_complete', turn_id: id }); },
    call(id = 'a', name = 'exec_command', args = { cmd: 'npm test' }) { return row('response_item', { type: 'function_call', name, arguments: JSON.stringify(args), call_id: id }); },
    output(id = 'a', output = '{"exit_code":0}') { return row('response_item', { type: 'function_call_output', call_id: id, output }); },
  };
}
function historicalFile(f, daysAgo, name, rows, modifiedAt = f.now()) {
  const date = new Date(f.now()); date.setDate(date.getDate() - daysAgo);
  const dir = path.join(f.temp, 'sessions', `${date.getFullYear()}`, `${date.getMonth() + 1}`.padStart(2, '0'), `${date.getDate()}`.padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-${name}.jsonl`);
  fs.writeFileSync(file, rows.join('\n') + '\n');
  fs.utimesSync(file, modifiedAt / 1000, modifiedAt / 1000);
  return file;
}
test('startup restores only latest sustained state and never historical completion/question', t => {
  const f = fixture(t);
  f.file('active', [f.meta('active'), f.start(), f.call()]);
  f.file('done', [f.meta('done'), f.start(), f.call(), f.output(), f.end()]);
  f.file('question', [f.meta('question'), f.start(), f.call('q', 'request_user_input', { questions: [{ question: 'PRIVATE QUESTION' }] })]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.length, 2);
  assert.ok(f.events.every(e => e.sessionId === 'active'));
  assert.equal(f.events[1].activity, 'testing');
  assert.equal(f.events[1].evidence.source, 'codex-jsonl');
  assert.equal(f.events[1].evidence.confidence, 'rollout-derived');
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
  const before = f.events.length; m.poll(); assert.equal(f.events.length, before);
});
test('live append correlates concurrent tools, waiting input, output outcomes, and turn boundaries', t => {
  const f = fixture(t), p = f.file('live', [f.meta()]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(e) { f.events.push(e); store.ingest(e); } }); m.start();
  assert.equal(f.events.length, 0);
  f.tick(); fs.appendFileSync(p, [f.start(), f.call('a'), f.call('b', 'apply_patch', { patch: 'PRIVATE PATCH' })].join('\n') + '\n'); m.poll();
  assert.equal(store.snapshot()[0].activeTools, 2);
  f.tick(); fs.appendFileSync(p, f.output('a', '{"exit_code":1,"output":"PRIVATE OUTPUT"}') + '\n'); m.poll();
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].status, 'active');
  assert.equal(f.events.at(-1).outcome, 'failure');
  f.tick(); fs.appendFileSync(p, f.output('b') + '\n' + f.call('q', 'request_user_input', {}) + '\n'); m.poll();
  assert.equal(store.snapshot()[0].status, 'waiting');
  f.tick(); fs.appendFileSync(p, f.output('q') + '\n' + f.end() + '\n'); m.poll();
  assert.equal(store.snapshot()[0].status, 'idle'); assert.equal(store.snapshot()[0].closed, false);
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
});
test('real Desktop freeform exec classifies nested calls and preserves a fast code change across the renderer snapshot gap', t => {
  const f=fixture(t), p=f.file('code-mode',[f.meta()]);
  const store=createSessionStore({now:f.now});
  const m=f.monitor({onEvent(e){f.events.push(e);store.ingest(e);}});m.start();
  f.tick();
  const call=(id,input)=>f.row('response_item',{type:'custom_tool_call',name:'exec',input,call_id:id});
  const output=id=>f.row('response_item',{type:'custom_tool_call_output',call_id:id,output:'{"result":"PRIVATE OUTPUT"}'});
  fs.appendFileSync(p,[f.start(),call('patch','text(await tools.apply_patch("PRIVATE PATCH"));'),output('patch')].join('\n')+'\n');m.poll();
  const edit=f.events.find(e=>e.toolCallId==='patch'&&e.event==='tool-start');
  assert.equal(edit.activity,'coding'); assert.equal(edit.toolName,'exec → apply_patch'); assert.equal(edit.evidence.confidence,'code-mode-derived');
  assert.equal(store.snapshot()[0].activity,'planning'); assert.equal(store.snapshot()[0].activeTools,0);
  f.tick(2000);
  assert.equal(Director.plan(store.snapshot()[0],{now:f.now()}).phase,'recent-work/coding');
  f.tick();fs.appendFileSync(p,call('test','const r = await tools.exec_command({cmd:"npm test"}); text(r);')+'\n');m.poll();
  assert.equal(store.snapshot()[0].activity,'testing'); assert.match(Director.plan(store.snapshot()[0],{now:f.now()}).phase,/^testing\//);
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
});
test('partial lines wait for newline, malformed lines do not stop later valid records', t => {
  const f = fixture(t), p = f.file('partial', [f.meta()]);
  const m = f.monitor(); m.start();
  const line = f.start(); fs.appendFileSync(p, line.slice(0, 30)); m.poll();
  assert.equal(f.events.length, 0);
  fs.appendFileSync(p, line.slice(30) + '\nnot json\n' + f.call() + '\n'); m.poll();
  assert.equal(f.events.length, 2); assert.ok(m.status().malformedLines >= 1);
});
test('same root rollout files merge; a newer completed turn suppresses old active backfill', t => {
  const f = fixture(t);
  f.file('old', [f.meta(), f.start('old'), f.call()]);
  f.tick(100);
  f.file('new', [f.meta(), f.start('new'), f.end('new')]);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
});
test('upstream filename identity keeps optional Desktop turn UUID suffixes out of actor identity', t => {
  const f = fixture(t), thread = '019d23d4-f1a9-7633-b9c7-758327137228';
  const turns = ['019d23d4-f1a9-7633-b9c7-758327137221', '019d23d4-f1a9-7633-b9c7-758327137222', '019d23d4-f1a9-7633-b9c7-758327137223'];
  f.file(`2026-10-15T12-00-00-${thread}_${turns[0]}`, [f.meta(turns[0]), f.start(turns[0]), f.call('old-call')]);
  f.tick(100);
  f.file(`2026-10-15T12-00-01-${thread}_${turns[1]}`, [f.meta(turns[1]), f.start(turns[1]), f.end(turns[1])]);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
  f.tick(100);
  f.file(`2026-10-15T12-00-02-${thread}_${turns[2]}`, [f.meta(turns[2]), f.start(turns[2]), f.call('current-call')]); m.poll();
  assert.equal(f.events.length, 2); assert.ok(f.events.every(e => e.id === `codex:${thread}` && e.turnId === turns[2]));
  assert.equal(f.events[1].toolCallId, 'current-call');
});
test('a complete first metadata record plus upstream filename UUID can identify a child without metadata id', t => {
  const f = fixture(t), child = '019d23d4-f1a9-7633-b9c7-758327137228';
  f.file(`2026-10-15T12-00-00-${child}`, [f.meta('root', { id: undefined, parent_thread_id: 'root', source: { subagent: { thread_spawn: { parent_thread_id: 'root' } } } }), f.start('child-turn'), f.call('child-tool')]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.length, 2); assert.ok(f.events.every(e => e.id === `codex:root:${child}` && e.parentId === 'codex:root'));
});
test('real Desktop subagent metadata stays distinct from root with reliable parent link', t => {
  const f = fixture(t);
  f.file('root', [f.meta('root'), f.start()]);
  f.file('child', [f.meta('child', { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent',
    agent_nickname: 'Worker', source: { subagent: { thread_spawn: { parent_thread_id: 'root', depth: 1 } } } }), f.start(), f.call()]);
  const m = f.monitor(); m.start();
  const child = f.events.find(e => e.subagentId);
  assert.equal(child.id, 'codex:root:child'); assert.equal(child.parentId, 'codex:root'); assert.equal(child.title, 'Worker');
  assert.ok(f.events.some(e => e.id === 'codex:root'));
});
test('Desktop fork metadata and copied parent history cannot merge distinct small child rollouts into root', t => {
  const f = fixture(t), store = createSessionStore({ now: f.now });
  f.file('root', [f.meta('root'), f.start('root-turn'), f.call('root-read', 'read_file')]);
  const children = ['child-a', 'child-b'].map(id => f.file(id, [
    f.meta(id, { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent', subagent_history_start_ordinal: 6 }),
    f.meta('root'), f.start('copied-root-turn'), f.call('copied-root-call'), f.output('copied-root-call'), f.end('copied-root-turn'),
    f.start(`${id}-turn`), f.call(`${id}-tool`, 'read_file'),
  ]));
  const m = f.monitor({ onEvent(e) { f.events.push(e); store.ingest(e); } }); m.start();
  assert.deepEqual(store.snapshot().map(s => s.id).sort(), ['codex:root', 'codex:root:child-a', 'codex:root:child-b']);
  assert.ok(f.events.every(e => e.toolCallId !== 'copied-root-call' && e.turnId !== 'copied-root-turn'));
  f.tick(); fs.appendFileSync(children[0], f.output('child-a-tool') + '\n' + f.end('child-a-turn') + '\n'); m.poll();
  const sessions = store.snapshot();
  assert.equal(sessions.find(s => s.id === 'codex:root:child-a').status, 'idle');
  assert.equal(sessions.find(s => s.id === 'codex:root:child-b').activeTools, 1);
  assert.equal(sessions.find(s => s.id === 'codex:root').activeTools, 1);
});
test('a partially written Desktop fork prefix never appears as a working child before its own records arrive', t => {
  const f = fixture(t), p = f.file('fork-prefix', [
    f.meta('child', { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent', subagent_history_start_ordinal: 6 }),
    f.meta('root'), f.start('copied-turn'), f.call('copied-tool'),
  ]);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
  f.tick(); fs.appendFileSync(p, [f.output('copied-tool'), f.end('copied-turn'), f.start('own-turn'), f.call('own-tool')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.length, 2);
  assert.ok(f.events.every(e => e.id === 'codex:root:child' && e.turnId === 'own-turn'));
});
test('tail attachment fences retimed fork history until exact native thread evidence is observed', t => {
  const f = fixture(t), p = f.file('large-fork', [
    f.meta('child', { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent', subagent_history_start_ordinal: 100 }),
    f.meta('root'), f.row('unknown_metadata', { filler: 'x'.repeat(LIMITS.tail * 2) }),
    f.start('copied-turn'), f.call('copied-tool'), f.row('response_item', { type: 'reasoning' }),
  ]);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
  f.tick(); fs.appendFileSync(p, [f.row('event_msg', { type: 'thread_settings_applied', thread_id: 'child' }), f.start('own-turn'), f.call('own-tool')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.length, 2); assert.ok(f.events.every(e => e.id === 'codex:root:child' && e.turnId === 'own-turn'));
});
test('a large Desktop child restores sustained work using exact tail thread markers without replaying parent work', t => {
  const f = fixture(t);
  f.file('large-working-child', [
    f.meta('child', { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent', subagent_history_start_ordinal: 6 }),
    f.meta('root'), f.start('copied-turn'), f.call('copied-tool'), f.output('copied-tool'), f.end('copied-turn'),
    f.row('unknown_metadata', { filler: 'x'.repeat(LIMITS.tail * 2) }),
    f.row('token_usage_record', { thread_id: 'child', turn_id: 'own-turn' }), f.call('own-tool'),
  ]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.length, 2); assert.ok(f.events.every(e => e.id === 'codex:root:child' && e.turnId === 'own-turn'));
  assert.equal(f.events[1].toolCallId, 'own-tool');
});
test('tail fork ownership recognizes a post-creation task start expressed in Unix seconds', t => {
  const f = fixture(t);
  f.file('seconds-start-child', [
    f.meta('child', { session_id: 'root', parent_thread_id: 'root', thread_source: 'subagent',
      timestamp: new Date(f.now() - 5000).toISOString(), subagent_history_start_ordinal: 100 }),
    f.row('unknown_metadata', { filler: 'x'.repeat(LIMITS.tail * 2) }),
    f.row('event_msg', { type: 'task_started', turn_id: 'copied-turn', started_at: Math.floor((f.now() - 60000) / 1000) }),
    f.call('copied-tool'),
    f.row('event_msg', { type: 'task_started', turn_id: 'own-turn', started_at: Math.floor((f.now() - 1000) / 1000) }),
    f.call('own-tool'),
  ]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.length, 2);
  assert.ok(f.events.every(e => e.id === 'codex:root:child' && e.turnId === 'own-turn'));
  assert.equal(f.events[1].toolCallId, 'own-tool');
});
test('nested Desktop children retain root task identity and direct parent identity', t => {
  const f = fixture(t);
  f.file('nested-child', [f.meta('nested', { session_id: 'root', parent_thread_id: 'helper', thread_source: 'subagent' }), f.start(), f.call()]);
  const m = f.monitor(); m.start();
  assert.ok(f.events.every(e => e.id === 'codex:root:nested' && e.parentId === 'codex:root:helper'));
});
test('guardian review records are ambient implementation activity rather than user office actors', t => {
  const f = fixture(t);
  f.file('guardian', [f.meta('guardian', { session_id: 'root', parent_thread_id: 'root', thread_source: 'guardian_review' }), f.start(), f.call()]);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
});
test('known collaboration tools coordinate at planning or waiting while opaque exec stays unclassified', t => {
  const f = fixture(t), p = f.file('collaboration', [f.meta(), f.start()]);
  const m = f.monitor(); m.start();
  for (const [index, name] of ['spawn_agent', 'collaboration.followup_task', 'functions.send_message', 'collaboration.wait_agent', 'exec'].entries()) {
    f.tick(); fs.appendFileSync(p, f.call(`collab-${index}`, name, { input: 'PRIVATE TASK TEXT' }) + '\n'); m.poll();
    assert.equal(f.events.at(-1).activity, ['planning', 'planning', 'planning', 'waiting-tool', 'running'][index]);
    fs.appendFileSync(p, f.output(`collab-${index}`) + '\n'); m.poll();
  }
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
});
test('real collaboration message records refresh an active actor heartbeat without moving its station or leaking text', t => {
  const f = fixture(t), p = f.file('collaboration-message', [f.meta(), f.start(), f.call('write', 'apply_patch')]);
  const store = createSessionStore({ now: f.now, staleMs: 1000 });
  const m = f.monitor({ onEvent(e) { f.events.push(e); store.ingest(e); } }); m.start();
  f.tick(1500); assert.equal(store.snapshot()[0].status, 'stale');
  const message = () => f.row('response_item', { type: 'agent_message', id: 'amsg-one', author: 'root', recipient: 'child', content: 'PRIVATE COLLABORATION MESSAGE' });
  fs.appendFileSync(p, message() + '\n'); m.poll();
  assert.equal(store.snapshot()[0].status, 'active'); assert.equal(store.snapshot()[0].activity, 'coding');
  assert.equal(store.snapshot()[0].lastEventAt, f.now()); assert.equal(store.snapshot()[0].activeTools, 1);
  assert.equal(f.events.at(-1).evidence.rawEvent, 'response_item:agent_message');
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
  fs.appendFileSync(p, f.output('write') + '\n' + f.end() + '\n'); m.poll();
  const before = f.events.length;
  f.tick(); fs.appendFileSync(p, message() + '\n'); m.poll();
  assert.equal(f.events.length, before); assert.equal(store.snapshot()[0].status, 'idle');
});
test('truncation and inode replacement are reattached silently, no old completion replay', t => {
  const f = fixture(t), p = f.file('rotate', [f.meta(), f.start(), f.call('a', 'exec_command', { cmd: 'x'.repeat(5000) })]);
  const m = f.monitor(); m.start(); const before = f.events.length;
  f.tick(100); fs.writeFileSync(p, [f.meta(), f.start('new'), f.end('new')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.length, before);
  fs.renameSync(p, p + '.old'); f.tick(100);
  fs.writeFileSync(p, [f.meta(), f.start('third'), f.call('b')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.at(-1).toolCallId, 'b'); assert.equal(f.events.at(-1).turnId, 'third');
});
test('old embedded timestamps and quota writes cannot resurrect a completed session', t => {
  const f = fixture(t), p = f.file('history', [f.meta(), f.start(), f.end()]);
  const m = f.monitor(); m.start();
  const old = f.row('event_msg', { type: 'task_started', turn_id: 'ancient' }, f.now() - 3600000);
  fs.appendFileSync(p, old + '\n' + f.row('event_msg', { type: 'token_count', info: {} }) + '\n'); m.poll();
  assert.equal(f.events.length, 0);
});
test('oversized records are bounded and skipped; stop tears down polling and prevents further events', t => {
  const f = fixture(t), p = f.file('bounded', [f.meta()]);
  const m = f.monitor(); m.start();
  fs.appendFileSync(p, 'X'.repeat(LIMITS.perRead + 100) + '\n' + f.start() + '\n');
  m.poll(); m.poll();
  assert.ok(m.status().oversizedLines >= 1); assert.equal(f.events.at(-1).event, 'turn-start');
  assert.ok(m.status().bytesRead <= LIMITS.perPoll * m.status().scans);
  const before = f.events.length; m.stop(); fs.appendFileSync(p, f.call() + '\n'); m.poll();
  assert.equal(f.events.length, before); assert.equal(m.status().running, false);
});
test('missing directory is a quiet read-only observation, no files/config created', t => {
  const f = fixture(t), missing = path.join(f.temp, 'missing');
  const m = f.monitor({ codexHome: missing }); m.start();
  assert.equal(m.status().files, 0); assert.equal(m.status().error, null); assert.equal(fs.existsSync(missing), false);
});
test('discovery/content work remains bounded across many large logs and later polls continue attaching', t => {
  const f = fixture(t);
  for (let i = 0; i < 10; i++) {
    f.file(`large-${i}`, [f.meta(`session-${i}`), f.row('unknown_metadata', { filler: 'x'.repeat(LIMITS.tail * 2) }), f.start()]);
  }
  const m = f.monitor(); m.start();
  assert.ok(m.status().bytesRead <= LIMITS.perPoll);
  const first = m.status().files; assert.ok(first > 0 && first < 10);
  const before = m.status().bytesRead; m.poll();
  assert.ok(m.status().bytesRead - before <= LIMITS.perPoll); assert.equal(m.status().files, 10);
});
test('restart discovers recently active roots and children in creation folders older than seven days', t => {
  const f = fixture(t);
  historicalFile(f, 30, 'old-root', [f.meta('old-root'), f.start('root-turn'), f.call('root-tool', 'read_file')]);
  historicalFile(f, 29, 'old-child', [f.meta('old-child', { session_id: 'old-root', parent_thread_id: 'old-root', thread_source: 'subagent' }), f.start('child-turn'), f.call('child-tool')]);
  historicalFile(f, 30, 'completed', [f.meta('completed'), f.start(), f.end()]);
  const stale = historicalFile(f, 31, 'stale', [f.meta('stale'), f.start()], f.now() - LIMITS.fresh - 1000);
  const opened = [], facade = { ...fs, openSync(file, flags) { opened.push(file); return fs.openSync(file, flags); } };
  for (let restart = 0; restart < 2; restart += 1) {
    f.events.length = 0;
    const m = f.monitor({ fs: facade }); m.start();
    assert.deepEqual([...new Set(f.events.map(e => e.id))].sort(), ['codex:old-root', 'codex:old-root:old-child']);
    assert.equal(m.status().error, null);
    m.stop();
  }
  assert.ok(!opened.includes(stale), 'stale historical rollouts must not have their content read');
});
test('historical discovery advances a bounded cursor while fresh recent writes retain priority', t => {
  const f = fixture(t);
  const recent = f.file('recent-priority', [f.meta('recent'), f.start('recent-turn')]);
  for (let index = 0; index < LIMITS.historyOperations * 3; index += 1) {
    historicalFile(f, 40, `z-completed-${String(index).padStart(4, '0')}`, [f.meta(`done-${index}`), f.start(), f.end()], f.now() - LIMITS.fresh - 1000);
  }
  historicalFile(f, 40, '000-old-active', [f.meta('old-active'), f.start('old-turn'), f.call('old-tool')]);
  let operations = 0;
  const facade = { ...fs,
    readdirSync(...args) { operations += 1; return fs.readdirSync(...args); },
    statSync(...args) { operations += 1; return fs.statSync(...args); },
  };
  const operationLimit = LIMITS.days * (LIMITS.candidates * 2 + 1) + LIMITS.historyOperations + LIMITS.candidates + LIMITS.files;
  const m = f.monitor({ fs: facade }); m.start();
  assert.ok(operations <= operationLimit);
  assert.ok(f.events.some(e => e.id === 'codex:recent'));
  assert.ok(!f.events.some(e => e.id === 'codex:old-active'), 'the large historical slice must resume in later polls');
  f.tick(); fs.appendFileSync(recent, f.call('new-live-tool', 'apply_patch') + '\n');
  for (let index = 0; index < 5; index += 1) {
    operations = 0; const before = m.status().bytesRead;
    m.poll();
    assert.ok(operations <= operationLimit, `discovery work exceeded its bound on slice ${index}`);
    assert.ok(m.status().bytesRead - before <= LIMITS.perPoll);
    if (index === 0) assert.ok(f.events.some(e => e.toolCallId === 'new-live-tool'), 'live work must not wait for history traversal');
  }
  assert.ok(f.events.some(e => e.id === 'codex:old-active' && e.toolCallId === 'old-tool'));
  assert.ok(f.events.every(e => ['codex:recent', 'codex:old-active'].includes(e.id)));
});
test('completed historical sweeps rescan for an old chat that becomes active later', t => {
  const f = fixture(t);
  const old = historicalFile(f, 20, 'dormant', [f.meta('dormant'), f.start(), f.end()], f.now() - LIMITS.fresh - 1000);
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
  f.tick(LIMITS.historyRescanMs + 1);
  fs.appendFileSync(old, f.start('new-turn') + '\n' + f.call('new-tool') + '\n');
  fs.utimesSync(old, f.now() / 1000, f.now() / 1000);
  m.poll();
  assert.ok(f.events.some(e => e.id === 'codex:dormant' && e.turnId === 'new-turn' && e.toolCallId === 'new-tool'));
});
test('resumed older filenames in a busy current-day folder cannot starve behind the recent filename limit', t => {
  const f = fixture(t);
  for (let index = 0; index < LIMITS.candidates * 2 + 20; index += 1) {
    historicalFile(f, 0, `z-completed-${String(index).padStart(4, '0')}`, [f.meta(`done-${index}`), f.start(), f.end()]);
  }
  f.tick(100);
  historicalFile(f, 0, '000-resumed', [f.meta('resumed'), f.start('resumed-turn'), f.call('resumed-tool')]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.length, 0, 'the priority filename slice and first historical slice do not reach this file');
  m.poll();
  assert.ok(f.events.some(e => e.id === 'codex:resumed' && e.toolCallId === 'resumed-tool'));
});
test('new-day activity has immediate priority while a historical traversal is pending', t => {
  const f = fixture(t);
  for (let index = 0; index < LIMITS.historyOperations * 2; index += 1) {
    historicalFile(f, 40, `done-${index}`, [f.meta(`done-${index}`)], f.now() - LIMITS.fresh - 1000);
  }
  const m = f.monitor(); m.start(); assert.equal(f.events.length, 0);
  f.tick(24 * 60 * 60 * 1000);
  historicalFile(f, 0, 'new-day', [f.meta('new-day'), f.start('today-turn'), f.call('today-tool')]);
  m.poll();
  assert.ok(f.events.some(e => e.id === 'codex:new-day' && e.toolCallId === 'today-tool'));
});
test('unknown schema remains explicit diagnostics and cannot classify itself as completed or testing', t => {
  const f = fixture(t), p = f.file('unknown', [f.meta(), f.start()]);
  const m = f.monitor(); m.start(); const before = f.events.length;
  fs.appendFileSync(p, f.row('event_msg', { type: 'future_test_complete', prompt: 'PRIVATE' }) + '\n'); m.poll();
  assert.equal(f.events.length, before); assert.ok(m.status().unsupportedTypes.includes('event_msg:future_test_complete'));
  assert.ok(!JSON.stringify(m.status()).includes('PRIVATE'));
});
test('a partially written initial session_meta is retried from zero and later live events are observable', t => {
  const f = fixture(t), m = f.monitor(); m.start();
  const meta = f.meta('partial-meta'), p = path.join(f.dir, 'rollout-partial-meta.jsonl');
  fs.writeFileSync(p, meta.slice(0, 30)); m.poll(); m.poll();
  assert.equal(f.events.length, 0);
  fs.appendFileSync(p, meta.slice(30) + '\n' + f.start() + '\n' + f.call() + '\n'); m.poll();
  assert.ok(f.events.some(e => e.sessionId === 'partial-meta' && e.event === 'tool-start' && e.activity === 'testing'));
  assert.equal(m.status().malformedLines, 0); assert.equal(m.status().error, null);
});
test('oversized tool output is reconciled only by an explicit Codex terminal with unknown outcome, never success', t => {
  const f = fixture(t), p = f.file('large-output', [f.meta()]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(e) { f.events.push(e); store.ingest(e); } }); m.start();
  fs.appendFileSync(p, f.start() + '\n' + f.call() + '\n'); m.poll();
  fs.appendFileSync(p, f.output('a', JSON.stringify({ exit_code: 0, output: 'x'.repeat(LIMITS.perRead + 100) })) + '\n');
  m.poll(); m.poll();
  assert.equal(store.snapshot()[0].activeTools, 1); assert.equal(store.snapshot()[0].turnCompletedAt, undefined);
  fs.appendFileSync(p, f.end() + '\n'); m.poll();
  const s = store.snapshot()[0]; assert.equal(s.activeTools, 0); assert.equal(s.status, 'idle'); assert.ok(s.turnCompletedAt);
  const correction = f.events.find(e => e.event === 'tool-end');
  assert.equal(correction.outcome, 'unknown'); assert.equal(correction.toolCallId, 'a');
  assert.deepEqual(correction.evidence, { source: 'codex-jsonl', rawEvent: 'event_msg:task_complete', confidence: 'terminal-derived' });
  assert.equal(f.events.filter(e => e.outcome === 'success').length, 0); assert.ok(m.status().oversizedLines > 0);
});
test('Codex terminal reconciles only its own observed tools and cannot finish an active child', t => {
  const f = fixture(t), p = f.file('terminal-parent', [f.meta('parent')]);
  const child = f.file('terminal-child', [f.meta('child', { session_id: 'parent', parent_thread_id: 'parent', source: { subagent: { thread_spawn: { parent_thread_id: 'parent' } } } }), f.start('child-turn'), f.call('child-tool')]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(e) { f.events.push(e); store.ingest(e); } }); m.start();
  fs.appendFileSync(p, f.start('parent-turn') + '\n' + f.call('parent-tool') + '\n'); m.poll();
  fs.appendFileSync(p, f.end('parent-turn') + '\n'); m.poll();
  let parent = store.snapshot().find(s => !s.parentId);
  assert.equal(parent.activeTools, 0); assert.equal(parent.activity, 'waiting-tool'); assert.equal(parent.turnCompletedAt, undefined);
  assert.equal(store.snapshot().find(s => s.parentId).activeTools, 1);
  fs.appendFileSync(child, f.end('child-turn') + '\n'); m.poll();
  parent = store.snapshot().find(s => !s.parentId); assert.equal(parent.status, 'idle'); assert.ok(parent.turnCompletedAt);
});
