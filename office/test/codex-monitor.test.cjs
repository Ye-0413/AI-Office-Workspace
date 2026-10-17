'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCodexMonitor, LIMITS } = require('../lib/codex-monitor.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');
const Director = require('../lib/animation-director.js');
const { normalizeEvent } = require('../lib/provider-events.cjs');

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
test('startup restores sustained work and fresh unresolved native input, but never completed history', t => {
  const f = fixture(t);
  f.file('active', [f.meta('active'), f.start(), f.call()]);
  f.file('done', [f.meta('done'), f.start(), f.call(), f.output(), f.end()]);
  f.file('question', [f.meta('question'), f.start(), f.call('q', 'request_user_input', { questions: [{ question: 'PRIVATE QUESTION' }] })]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  assert.equal(f.events.length, 4);
  assert.deepEqual(new Set(f.events.map(event => event.sessionId)), new Set(['active', 'question']));
  const work = f.events.find(event => event.sessionId === 'active' && event.event === 'tool-start');
  assert.equal(work.activity, 'testing');
  assert.equal(work.evidence.source, 'codex-jsonl');
  assert.equal(work.evidence.confidence, 'rollout-derived');
  const waiting = f.events.find(event => event.event === 'waiting-user');
  assert.equal(waiting.toolCallId, 'q');
  assert.equal(waiting.evidence.restored, true);
  assert.equal(waiting.evidence.snapshot, 'restored-wait');
  const roots = store.snapshot();
  assert.equal(roots.length, 2);
  assert.ok(roots.every(session => !session.parentId));
  assert.equal(roots.find(session => session.sessionId === 'active').status, 'active');
  assert.equal(roots.find(session => session.sessionId === 'question').status, 'waiting');
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
  const before = f.events.length; m.poll(); assert.equal(f.events.length, before);
});
test('a restored native wait preserves original timestamps and releases only on its actual paired return', t => {
  const f = fixture(t), turnAt = f.now() - 60000, waitAt = f.now() - 45000;
  const p = f.file('pending-input', [f.meta('pending-input'),
    f.row('event_msg', { type: 'task_started', turn_id: 't1' }, turnAt),
    f.row('response_item', { type: 'function_call', name: 'request_user_input', call_id: 'native-input',
      arguments: JSON.stringify({ questions: [{ question: 'PRIVATE QUESTION', options: [{ label: 'PRIVATE CHOICE' }] }] }) }, waitAt),
    f.row('event_msg', { type: 'agent_reasoning', text: 'PRIVATE REASONING' }, f.now() - 10000)]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  assert.equal(f.events.length, 2);
  assert.equal(f.events[0].at, turnAt);
  const waiting = f.events.find(event => event.event === 'waiting-user');
  assert.equal(waiting.at, waitAt);
  assert.deepEqual(waiting.evidence, { source: 'codex-jsonl', rawEvent: 'response_item:function_call', confidence: 'restored-wait', restored: true, snapshot: 'restored-wait' });
  assert.equal(f.events[0].evidence.rawEvent, 'rollout:restored-wait-snapshot');
  assert.ok(f.events.every(event => !Object.hasOwn(event, 'outcome')));
  let session = store.snapshot()[0];
  assert.equal(session.status, 'waiting'); assert.equal(session.activity, 'waiting-user'); assert.equal(session.attention, true);
  assert.equal(session.lastEventAt, waitAt); assert.equal(session.activeTools, 1); assert.equal(session.closed, false);
  m.poll(); assert.equal(f.events.length, 2, 'polling cannot manufacture a new question or renew its timestamp');
  f.tick(); fs.appendFileSync(p, f.output('native-input', '{"answers":{"PRIVATE ANSWER":"PRIVATE BODY"}}') + '\n'); m.poll();
  session = store.snapshot()[0];
  assert.equal(session.activity, 'planning'); assert.equal(session.attention, false); assert.equal(session.activeTools, 0);
  assert.equal(f.events.at(-1).outcome, 'unknown');
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
});
test('startup does not restore answered, completed, interrupted, stale, undated or superseded input waits', t => {
  const f = fixture(t), staleAt = f.now() - LIMITS.fresh - 1;
  const wait = id => f.call(id, 'request_user_input', { questions: [{ question: 'PRIVATE QUESTION' }] });
  f.file('answered', [f.meta('answered'), f.start(), wait('answered'), f.output('answered')]);
  f.file('completed', [f.meta('completed'), f.start(), wait('completed'), f.end()]);
  f.file('interrupted', [f.meta('interrupted'), f.start(), wait('interrupted'), f.row('event_msg', { type: 'turn_aborted', turn_id: 't1' })]);
  f.file('stale', [f.meta('stale'), f.row('event_msg', { type: 'task_started', turn_id: 't1' }, staleAt - 1),
    f.row('response_item', { type: 'function_call', name: 'request_user_input', call_id: 'stale', arguments: '{}' }, staleAt),
    f.row('event_msg', { type: 'agent_reasoning' })]);
  f.file('undated', [f.meta('undated'), f.start(), JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'request_user_input', call_id: 'undated', arguments: '{}' } })]);
  f.file('superseded', [f.meta('superseded'), f.start('old'), wait('old'), f.start('new'), f.call('new-call')]);
  const m = f.monitor(); m.start();
  assert.equal(f.events.some(event => event.event === 'waiting-user'), false);
  assert.equal(f.events.some(event => ['completed', 'interrupted', 'stale', 'undated'].includes(event.sessionId)), false);
  assert.deepEqual(new Set(f.events.map(event => event.sessionId)), new Set(['answered', 'superseded']));
  assert.ok(f.events.every(event => !Object.hasOwn(event, 'outcome')));
  assert.ok(!JSON.stringify(f.events).includes('PRIVATE'));
});
for (const latestState of ['active', 'completed']) test(`an old wait with late progress cannot replace a newer ${latestState} turn from another same-thread rollout`, t => {
  const f = fixture(t), root = '019d23d4-f1a9-7633-b9c7-758327137240';
  const oldTurn = '019d23d4-f1a9-7633-b9c7-758327137241', newTurn = '019d23d4-f1a9-7633-b9c7-758327137242';
  const oldFile = f.file(`2026-10-16T12-00-00-${root}_${oldTurn}`, [f.meta(oldTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: oldTurn }, f.now() - 120000),
    f.row('response_item', { type: 'function_call', name: 'request_user_input', call_id: 'old-input', arguments: '{}' }, f.now() - 110000),
    f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn })]);
  const newFile = f.file(`2026-10-16T12-00-01-${root}_${newTurn}`, [f.meta(newTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: newTurn }, f.now() - 60000),
    latestState === 'active'
      ? f.row('response_item', { type: 'function_call', name: 'exec_command', call_id: 'new-call', arguments: '{"cmd":"npm test"}' }, f.now() - 50000)
      : f.row('event_msg', { type: 'task_complete', turn_id: newTurn }, f.now() - 50000)]);
  f.file('independent-wait', [f.meta('independent-wait'), f.start(), f.call('fresh-input', 'request_user_input', {})]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  const sessions = store.snapshot(), current = sessions.find(session => session.id === `codex:${root}`);
  if (latestState === 'active') {
    assert.equal(current.turnId, newTurn);
    assert.equal(current.activity, 'testing');
    assert.equal(current.attention, false);
  } else assert.equal(current, undefined, 'completed current history cannot resurrect an older pending question');
  assert.equal(sessions.find(session => session.sessionId === 'independent-wait').activity, 'waiting-user');
  assert.equal(f.events.some(event => event.turnId === oldTurn), false);
  const count = f.events.length;
  f.tick();
  fs.appendFileSync(oldFile, [f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }),
    f.row('event_msg', { type: 'task_started', turn_id: oldTurn }), f.call('late-old-call')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.length, count, 'later writes and a duplicate start cannot promote the old turn past the known current turn');
  const after = store.snapshot().find(session => session.id === `codex:${root}`);
  if (latestState === 'active') { assert.equal(after.turnId, newTurn); assert.equal(after.activity, 'testing'); }
  else assert.equal(after, undefined, 'old metadata cannot resurrect an ended current thread');
  f.tick(); fs.appendFileSync(newFile, f.start('genuinely-new-turn') + '\n' + f.call('current-new-call') + '\n'); m.poll();
  const resumed = store.snapshot().find(session => session.id === `codex:${root}`);
  assert.equal(resumed.turnId, 'genuinely-new-turn'); assert.equal(resumed.activity, 'testing');
  assert.equal(resumed.attention, false);
});
for (const nativeTurn of ['same', 'newer']) test(`restored wait cannot override later native hook evidence from the ${nativeTurn} turn`, t => {
  const f = fixture(t), store = createSessionStore({ now: f.now }), startAt = f.now() - 100;
  f.file('hook-owned', [f.meta('hook-owned'), f.row('event_msg', { type: 'task_started', turn_id: 'rollout-turn' }, startAt),
    f.row('response_item', { type: 'function_call', name: 'request_user_input', call_id: 'older-input', arguments: '{}' }, f.now() - 50)]);
  const turn = nativeTurn === 'same' ? 'rollout-turn' : 'new-native-turn';
  store.ingest(normalizeEvent('codex', { session_id: 'hook-owned', turn_id: turn, hook_event_name: 'UserPromptSubmit' }, { receivedAt: f.now() - 20, source: 'hook' }));
  store.ingest(normalizeEvent('codex', { session_id: 'hook-owned', turn_id: turn, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 'native-call' }, { receivedAt: f.now() - 10, source: 'hook' }));
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  assert.equal(f.events.some(event => event.evidence.snapshot === 'restored-wait'), true);
  f.tick(11000); store.prune();
  const session = store.snapshot()[0];
  assert.equal(session.turnId, turn); assert.equal(session.activity, 'reading'); assert.equal(session.attention, false);
  assert.equal(session.activeTools, 1); assert.equal(session.evidence.source, 'hook');
  assert.equal(session.turnCompletedAt, undefined);
});
for (const oldActivity of ['waiting-user', 'reading']) for (const progressAtStartup of [true, false]) test(`warm attachment advances from old ${oldActivity} with progress ${progressAtStartup ? 'before' : 'after'} startup to a genuinely newer turn`, t => {
  const f = fixture(t), root = '019d23d4-f1a9-7633-b9c7-758327137250';
  const oldTurn = '019d23d4-f1a9-7633-b9c7-758327137251', newTurn = '019d23d4-f1a9-7633-b9c7-758327137252';
  const oldRows = [f.meta(oldTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: oldTurn }, f.now() - 120000),
    f.row('response_item', { type: 'function_call', call_id: 'old-call',
      name: oldActivity === 'waiting-user' ? 'request_user_input' : 'exec_command',
      arguments: oldActivity === 'waiting-user' ? '{}' : '{"cmd":"cat src/a.js"}' }, f.now() - 100000)];
  if (progressAtStartup) oldRows.push(f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }));
  const oldFile = f.file(`2026-10-16T12-00-00-${root}_${oldTurn}`, oldRows);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  if (!progressAtStartup) { f.tick(); fs.appendFileSync(oldFile, f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }) + '\n'); m.poll(); }
  const newStartAt = f.now() - 60000, newReadAt = f.now() - 50000;
  const newFile = f.file(`2026-10-16T12-00-01-${root}_${newTurn}`, [f.meta(newTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: newTurn }, newStartAt),
    f.row('response_item', { type: 'function_call', name: 'exec_command', call_id: 'new-read', arguments: '{"cmd":"cat src/b.js"}' }, newReadAt)]);
  m.poll();
  let session = store.snapshot()[0];
  assert.equal(session.turnId, newTurn); assert.equal(session.activity, 'reading'); assert.equal(session.attention, false);
  assert.equal(session.activeTools, 1); assert.equal(session.lastEventAt, newReadAt);
  assert.equal(f.events.find(event => event.turnId === newTurn && event.event === 'turn-start').turnStartedAt, newStartAt);
  f.tick(); fs.appendFileSync(newFile, f.call('new-live-call') + '\n'); m.poll();
  session = store.snapshot()[0];
  assert.equal(session.turnId, newTurn); assert.equal(session.activity, 'testing'); assert.equal(session.activeTools, 2);
  f.tick(); fs.appendFileSync(oldFile, f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }) + '\n'); m.poll();
  session = store.snapshot()[0];
  assert.equal(session.turnId, newTurn); assert.equal(session.activity, 'testing'); assert.equal(session.attention, false);
});
for (const oldActivity of ['waiting-user', 'reading']) test(`warm attachment of a newer completed turn clears obsolete ${oldActivity} without replaying completion`, t => {
  const f = fixture(t), root = '019d23d4-f1a9-7633-b9c7-758327137260';
  const oldTurn = '019d23d4-f1a9-7633-b9c7-758327137261', endedTurn = '019d23d4-f1a9-7633-b9c7-758327137262';
  const oldFile = f.file(`2026-10-16T12-00-00-${root}_${oldTurn}`, [f.meta(oldTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: oldTurn }, f.now() - 120000),
    f.row('response_item', { type: 'function_call', call_id: 'old-call',
      name: oldActivity === 'waiting-user' ? 'request_user_input' : 'exec_command',
      arguments: oldActivity === 'waiting-user' ? '{}' : '{"cmd":"cat src/a.js"}' }, f.now() - 100000)]);
  const store = createSessionStore({ now: f.now });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  f.tick(); fs.appendFileSync(oldFile, f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }) + '\n'); m.poll();
  const startAt = f.now() - 60000, endAt = f.now() - 40000;
  const newFile = f.file(`2026-10-16T12-00-01-${root}_${endedTurn}`, [f.meta(endedTurn, { session_id: root, thread_source: 'user' }),
    f.row('event_msg', { type: 'task_started', turn_id: endedTurn }, startAt),
    f.row('event_msg', { type: 'task_complete', turn_id: endedTurn }, endAt),
    // A later duplicate terminal or progress record cannot retime the fact.
    f.row('event_msg', { type: 'task_complete', turn_id: endedTurn }, f.now() - 20000),
    f.row('event_msg', { type: 'agent_reasoning', turn_id: endedTurn })]);
  m.poll();
  let session = store.snapshot()[0];
  assert.equal(session.turnId, endedTurn); assert.equal(session.status, 'idle'); assert.equal(session.activity, 'idle');
  assert.equal(session.attention, false); assert.equal(session.activeTools, 0); assert.equal(session.closed, false);
  assert.equal(session.lastEventAt, endAt); assert.equal(session.turnCompletedAt, undefined);
  const restored = f.events.filter(event => event.evidence.snapshot === 'ended-turn');
  assert.equal(restored.length, 1); assert.equal(restored[0].event, 'metadata');
  assert.equal(restored[0].turnStartedAt, startAt); assert.equal(restored[0].turnEndedAt, endAt); assert.equal(restored[0].at, endAt);
  assert.equal(restored[0].supersedesTurnId, oldTurn); assert.equal(Object.hasOwn(restored[0], 'outcome'), false);
  assert.equal(f.events.some(event => ['turn-end', 'session-end', 'subagent-end'].includes(event.event)), false);
  assert.match(Director.plan(session, { now: f.now() }).phase, /^idle\//);
  const count = f.events.length;
  f.tick(); fs.appendFileSync(oldFile, f.row('event_msg', { type: 'agent_reasoning', turn_id: oldTurn }) + '\n' + f.call('late-old') + '\n'); m.poll();
  assert.equal(f.events.length, count); assert.equal(store.snapshot()[0].status, 'idle');
  f.tick(); fs.appendFileSync(newFile, f.start('genuine-next') + '\n' + f.call('next-call') + '\n'); m.poll();
  session = store.snapshot()[0];
  assert.equal(session.turnId, 'genuine-next'); assert.equal(session.activity, 'testing'); assert.equal(session.activeTools, 1);
  assert.equal(session.turnCompletedAt, undefined);
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
test('explicit user threads stay independent roots despite copied session and spawn ancestry', t => {
  const f = fixture(t), root = '019d23d4-f1a9-7633-b9c7-758327137220';
  const store = createSessionStore({ now: f.now });
  f.file(`2026-10-16T12-00-00-${root}`, [f.meta(root, { thread_source: 'user' }), f.start('root-turn'), f.call('root-call')]);
  const threads = ['019d23d4-f1a9-7633-b9c7-758327137221', '019d23d4-f1a9-7633-b9c7-758327137222',
    '019d23d4-f1a9-7633-b9c7-758327137223', '019d23d4-f1a9-7633-b9c7-758327137224'];
  threads.forEach((thread, index) => {
    f.file(`2026-10-16T12-00-0${index + 1}-${thread}`, [f.meta(index % 2 ? root : thread, {
      session_id: index % 2 ? root : thread,
      thread_source: 'user', ...(index >= 2 ? { parent_thread_id: root } : {}),
      source: { subagent: { thread_spawn: { parent_thread_id: root } } },
      subagent_history_start_ordinal: 9999,
    }), f.start(`independent-turn-${index}`), f.call(`independent-call-${index}`)]);
  });
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  const sessions = store.snapshot();
  assert.equal(sessions.length, 5);
  assert.deepEqual(new Set(sessions.map(session => session.id)), new Set([root, ...threads].map(id => `codex:${id}`)));
  assert.ok(sessions.every(session => !session.parentId && !session.subagentId && session.status === 'active'));
  assert.ok(sessions.every(session => session.activeTools === 1));
  assert.ok(f.events.every(event => !event.parentId && !event.subagentId));
});
test('two simultaneous Codex roots keep separate child families through monitor normalization and lifecycle updates', t => {
  const f = fixture(t), rootA = '019d23d4-f1a9-7633-b9c7-758327137230', rootB = '019d23d4-f1a9-7633-b9c7-758327137231';
  const childA = '019d23d4-f1a9-7633-b9c7-758327137232', childB = '019d23d4-f1a9-7633-b9c7-758327137233';
  const store = createSessionStore({ now: f.now });
  const first = f.file(`2026-10-16T12-00-00-${rootA}`, [f.meta(rootA, { thread_source: 'user' }), f.start('root-a-turn')]);
  f.file(`2026-10-16T12-00-01-${rootB}`, [f.meta(rootB, { thread_source: 'user' }), f.start('root-b-turn')]);
  const helper = (root, id, turn) => f.file(`2026-10-16T12-00-02-${id}`, [f.meta(id, {
    session_id: root, parent_thread_id: root, thread_source: 'subagent',
    source: { subagent: { thread_spawn: { parent_thread_id: root } } },
  }), f.start(turn), f.call(`${turn}-call`)]);
  const firstChild = helper(rootA, childA, 'child-a-turn'); helper(rootB, childB, 'child-b-turn');
  const m = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } }); m.start();
  let sessions = store.snapshot();
  assert.deepEqual(new Set(sessions.filter(session => !session.parentId).map(session => session.id)), new Set([`codex:${rootA}`, `codex:${rootB}`]));
  assert.equal(sessions.find(session => session.subagentId === childA).parentId, `codex:${rootA}`);
  assert.equal(sessions.find(session => session.subagentId === childB).parentId, `codex:${rootB}`);
  f.tick();
  fs.appendFileSync(first, f.end('root-a-turn') + '\n');
  fs.appendFileSync(firstChild, f.output('child-a-turn-call') + '\n' + f.end('child-a-turn') + '\n'); m.poll();
  sessions = store.snapshot();
  assert.equal(sessions.find(session => session.id === `codex:${rootA}`).status, 'idle');
  assert.equal(sessions.find(session => session.id === `codex:${rootB}`).status, 'active');
  assert.equal(sessions.find(session => session.subagentId === childA).activity, 'idle');
  assert.equal(sessions.find(session => session.subagentId === childB).activity, 'testing');
  assert.equal(new Set(sessions.map(session => session.id)).size, 4);
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
test('truncation restores a known newer ended state without replay; inode replacement can restore work', t => {
  const f = fixture(t), p = f.file('rotate', [f.meta(), f.start(), f.call('a', 'exec_command', { cmd: 'x'.repeat(5000) })]);
  const m = f.monitor(); m.start(); const before = f.events.length;
  f.tick(100); fs.writeFileSync(p, [f.meta(), f.start('new'), f.end('new')].join('\n') + '\n'); m.poll();
  assert.equal(f.events.length, before + 1);
  assert.equal(f.events.at(-1).event, 'metadata'); assert.equal(f.events.at(-1).evidence.snapshot, 'ended-turn');
  assert.equal(f.events.some(event => event.event === 'turn-end'), false);
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


// These cases observe real normalized results through temporary synthetic
// rollouts. The submitted commands/questions are classified, never executed.
function resultFixture(t, outputType) {
  const f = fixture(t), file = f.file('result-cancellation', [f.meta()]);
  const store = createSessionStore({ now: f.now });
  const monitor = f.monitor({ onEvent(event) { f.events.push(event); store.ingest(event); } });
  monitor.start();
  const custom = outputType === 'custom_tool_call_output';
  function call(id, command = 'npm test') {
    if (!custom) return command === null
      ? f.call(id, 'request_user_input', { questions: [{ question: 'PRIVATE QUESTION' }] })
      : f.call(id, 'exec_command', { cmd: command, private: 'PRIVATE ARGUMENT' });
    return f.row('response_item', { type: 'custom_tool_call', name: 'exec', call_id: id,
      input: command === null
        ? 'text(await tools.request_user_input({questions:[{question:"PRIVATE QUESTION"}]}));'
        : 'text(await tools.exec_command(' + JSON.stringify({ cmd: command, private: 'PRIVATE ARGUMENT' }) + '));' });
  }
  const output = (id, body) => f.row('response_item', { type: outputType, call_id: id,
    output: typeof body === 'string' ? body : JSON.stringify(body) });
  function append(...rows) { f.tick(); fs.appendFileSync(file, rows.join('\n') + '\n'); monitor.poll(); }
  const session = () => store.snapshot()[0];
  const results = id => f.events.filter(event => event.event === 'tool-end' && event.toolCallId === id);
  const privateAbsent = () => assert.ok(!JSON.stringify({ events: f.events, sessions: store.snapshot() }).includes('PRIVATE'));
  return { f, store, call, output, append, session, results, privateAbsent };
}

const CANCELLED_RESULTS = [
  ['interrupted before nonzero exit', { interrupted: true, exit_code: 1 }],
  ['interrupted before zero exit', { interrupted: true, exit_code: 0 }],
  ['interrupted before error flag', { interrupted: true, isError: true }],
  ['interrupted without exit', { interrupted: true }],
  ['is_interrupt before nonzero exit', { is_interrupt: true, exitCode: 1 }],
  ['is_interrupt before zero exit', { is_interrupt: true, exitCode: 0 }],
  ['is_interrupt before error flag', { is_interrupt: true, isError: true }],
  ['is_interrupt without exit', { is_interrupt: true }],
];
for (const outputType of ['function_call_output', 'custom_tool_call_output']) {
  for (const [label, input] of CANCELLED_RESULTS) test(`rollout ${outputType}: explicit ${label} remains a cancelled tool, not a failed or completed turn`, t => {
    const h = resultFixture(t, outputType);
    h.append(h.f.start(), h.call('cancelled-test'));
    assert.equal(h.session().activity, 'testing');
    const at = h.f.tick();
    h.append(h.output('cancelled-test', { ...input, output: 'PRIVATE RESULT BODY' }));
    const result = h.results('cancelled-test');
    assert.equal(result.length, 1);
    assert.equal(result[0].outcome, 'cancelled');
    assert.ok(result[0].at >= at);
    assert.equal(result[0].evidence.rawEvent, 'response_item:' + outputType);
    const hook = normalizeEvent('codex', { session_id: 'one', turn_id: 't1', hook_event_name: 'PostToolUse',
      tool_name: 'exec_command', tool_use_id: 'cancelled-test', tool_input: { cmd: 'npm test' }, tool_response: input });
    assert.equal(result[0].outcome, hook.outcome, 'native hook and rollout must preserve the same explicit cancellation');
    const session = h.session();
    assert.equal(session.id, 'codex:one'); assert.equal(session.turnId, 't1');
    assert.equal(session.activity, 'planning'); assert.equal(session.status, 'active');
    assert.equal(session.activeTools, 0); assert.equal(session.attention, false); assert.equal(session.closed, false);
    assert.equal(session.turnCompletedAt, undefined);
    assert.equal(Director.observedWork(session, { now: h.f.now() }), null, 'a cancelled operation cannot become a recent-work replay');
    assert.equal(Director.plan(session, { now: h.f.now() }).phase, 'planning/think');
    assert.equal(h.f.events.some(event => ['turn-end','interrupted','session-end','subagent-end'].includes(event.event)), false,
      'cancelling one tool cannot fabricate a turn/session/helper terminal');
    h.privateAbsent();
  });

  test(`rollout ${outputType}: strict cancellation flags preserve ordinary, unknown and bounded-output outcomes`, t => {
    const h = resultFixture(t, outputType);
    h.append(h.f.start());
    const controls = [
      [{ exit_code: 0 }, 'success'], [{ exitCode: 7 }, 'failure'], [{ isError: true }, 'failure'],
      [{ interrupted: false, is_interrupt: false, exit_code: 0 }, 'success'],
      [{ interrupted: 'true', exit_code: 1 }, 'failure'], [{ is_interrupt: 1, exit_code: 0 }, 'success'],
      [{ interrupted: false, is_interrupt: false }, 'unknown'],
      [{ interrupted: 'true', is_interrupt: 'true' }, 'unknown'],
      [{ exit_code: '0' }, 'unknown'],
      ['User interrupted the test; all tests passed', 'unknown'], ['{malformed', 'unknown'],
      ['[true,0]', 'unknown'],
      [JSON.stringify({ interrupted: true, output: 'PRIVATE' + 'x'.repeat(65536) }), 'unknown'],
    ];
    for (const [index, [body, expected]] of controls.entries()) {
      const id = 'control-' + index;
      h.append(h.call(id)); h.append(h.output(id, body));
      assert.equal(h.results(id).length, 1);
      assert.equal(h.results(id)[0].outcome, expected, 'control ' + index);
      assert.equal(h.session().activeTools, 0); assert.equal(h.session().closed, false);
      assert.equal(h.session().activity, expected === 'failure' ? 'error' : 'planning');
      h.privateAbsent();
    }
  });

  test(`rollout ${outputType}: cancellation releases only its matching call while parallel work and real input remain pending`, t => {
    const h = resultFixture(t, outputType);
    h.append(h.f.start(), h.call('cancel-a'), h.call('parallel-b', 'cat README.md'), h.call('question-q', null));
    const question = h.f.events.find(event => event.toolCallId === 'question-q' && event.event === 'waiting-user');
    assert.ok(question); assert.equal(h.session().activeTools, 3); assert.equal(h.session().activity, 'waiting-user');
    const beforeWrong = h.store.snapshot(), eventCount = h.f.events.length;
    h.append(h.output('wrong-call', { interrupted: true, exit_code: 1 }));
    assert.equal(h.f.events.length, eventCount); assert.deepEqual(h.store.snapshot(), beforeWrong);
    h.append(h.output('cancel-a', { interrupted: true, exit_code: 1, output: 'PRIVATE RESULT BODY' }));
    assert.equal(h.results('cancel-a')[0].outcome, 'cancelled');
    let session = h.session();
    assert.equal(session.activeTools, 2); assert.equal(session.status, 'waiting');
    assert.equal(session.activity, 'waiting-user'); assert.equal(session.attention, true);
    assert.equal(session.closed, false); assert.equal(session.turnCompletedAt, undefined);
    assert.match(Director.plan(session, { now: h.f.now() }).phase, /^waiting-user\//);
    const count = h.f.events.length;
    h.append(h.output('cancel-a', { exit_code: 0 }));
    assert.equal(h.f.events.length, count, 'duplicate output cannot finish another call or rewrite cancellation');
    assert.equal(h.session().activeTools, 2);
    h.append(h.output('parallel-b', { exit_code: 0 }));
    session = h.session();
    assert.equal(session.activeTools, 1); assert.equal(session.activity, 'waiting-user'); assert.equal(session.attention, true);
    assert.equal(h.results('question-q').length, 0, 'only the question\'s actual paired result can dismiss it');
    h.append(h.output('question-q', { answers: { answer: 'PRIVATE ANSWER' } }));
    session = h.session();
    assert.equal(session.activeTools, 0); assert.equal(session.activity, 'planning'); assert.equal(session.attention, false);
    assert.equal(session.closed, false); assert.equal(session.turnCompletedAt, undefined);
    assert.equal(h.results('question-q')[0].outcome, 'unknown', 'an answer body is not exit/success evidence');
    assert.equal(h.results('cancel-a').length, 1); h.privateAbsent();
  });
}
