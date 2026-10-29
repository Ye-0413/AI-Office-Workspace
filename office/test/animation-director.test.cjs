'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Director = require('../lib/animation-director.js');
const { createSessionStore } = require('../lib/session-store.cjs');
const now = 120000;
const session = (activity = 'coding', patch = {}) => ({ id: 'codex:actor-a', sessionId: 'actor-a', provider: 'codex', activity, status: 'active', activeTools: 1, lastEventAt: now - 10000, evidence: { rawEvent: 'PreToolUse' }, events: [], ...patch });
const end = (patch = {}) => ({ eventId: 'result-a', event: 'tool-end', at: now - 500, activity: 'planning', outcome: 'success', evidence: { rawEvent: 'PostToolUse' }, ...patch });
const phasePlans = (value, language = 'zh') => Array.from({ length: 9 }, (_, index) => Director.plan(value, { now: now + index * Director.PHASE_MS, language }));

test('all 50 original SVGs are accounted for; selected assets are declared and restored SVGs stay isolated', () => {
  const directory = path.join(__dirname, '..', 'assets', 'avatars');
  const manifest = require('../assets/avatars.manifest.json');
  const original = manifest.files.filter(file => /^avatars\/clawd.*\.svg$/.test(file.destination)).map(file => path.posix.basename(file.destination)).sort();
  const selected = Object.values(Director.ASSETS);
  const excluded = Object.keys(Director.EXCLUDED);
  assert.equal(original.length, 50);
  assert.equal(new Set([...selected, ...excluded]).size, 50);
  assert.deepEqual([...new Set([...selected, ...excluded])].sort(), original);
  assert.ok(selected.length >= 20, 'use a meaningful part of the original animation library');
  // A clean source checkout includes workshop PNGs but no restricted SVGs.
  // If any authorized SVGs are restored, require the complete upstream set.
  const restored = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => /^clawd.*\.svg$/.test(name)).sort() : [];
  if (restored.length > 0) {
    assert.deepEqual(restored, original);
    for (const filename of selected) {
      const content = fs.readFileSync(path.join(directory, filename), 'utf8');
      assert.match(content, /<svg\b/);
      assert.doesNotMatch(content, /<script\b/i, filename + ' must animate as an isolated img');
    }
  }
});

test('each supported activity has several eight-second expressive phases without inventing completion or sleep', () => {
  for (const activity of ['reading', 'searching', 'coding', 'designing', 'testing', 'building', 'running', 'waiting-user', 'waiting-tool', 'error', 'idle']) {
    const plans = phasePlans(session(activity));
    assert.ok(new Set(plans.map(plan => plan.asset)).size >= 2, activity + ' needs visual variation');
    assert.ok(new Set(plans.map(plan => plan.phase)).size >= 2, activity + ' needs a meaningful phase');
    for (const plan of plans) {
      assert.ok(plan.caption && plan.detail && plan.prop);
      assert.doesNotMatch(plan.asset, /sleep|collapse|doze|low-battery|outlaw|typing-boss/);
      assert.notEqual(plan.asset, Director.ASSETS.acknowledge, 'no success expression without a result');
      assert.doesNotMatch(plan.caption, /通过|完成|passed|complete/i);
    }
  }
});

test('phases use a stable clock rather than resetting on every metadata heartbeat or task-description edit', () => {
  const original = session('reading', { title: 'first title', summary: 'first summary' });
  const first = Director.plan(original, { now });
  const changed = Director.plan({ ...original, title: 'another title', summary: 'another summary', lastEventAt: now, events: [{ event: 'metadata', at: now, eventId: 'metadata' }] }, { now });
  assert.deepEqual(changed, first);
  const before = Director.plan(original, { now: now + 20 });
  assert.equal(before.asset, first.asset, 'nearby snapshots should not constantly reset assets');
  assert.ok(Director.PHASE_MS >= 6000 && Director.PHASE_MS <= 10000);
});

test('waiting, errors and loss of signal outrank parallel work and successful historical tool results', () => {
  for (const activity of ['waiting-user', 'waiting-tool', 'error']) {
    const value = session(activity, { activeTools: 8, events: [end()] });
    const plan = Director.plan(value, { now });
    assert.ok(plan.phase.startsWith(activity + '/'));
    assert.notEqual(plan.asset, Director.ASSETS.acknowledge);
    assert.notEqual(plan.asset, Director.ASSETS.juggle);
  }
  const attention = Director.plan(session('unknown', { attention: true, toolName: 'request_user_input' }), { now });
  assert.match(attention.phase, /^waiting-user\//);
  assert.equal(attention.caption, '等你回答');
  for (const value of [session('coding', { disconnected: true }), session('testing', { status: 'stale' }), session('unknown'), session('future-unknown-activity'), session('idle', { closed: true })]) {
    const plan = Director.plan({ ...value, events: [end()], activeTools: 8 }, { now });
    assert.equal(plan.asset, Director.ASSETS.still);
    assert.equal(plan.cueKey, undefined);
  }
});

test('only an explicit successful tool outcome produces a brief acknowledgement; cancelled or uncertain results never do', () => {
  const value = session('coding');
  const success = Director.plan({ ...value, events: [end()] }, { now });
  assert.equal(success.asset, Director.ASSETS.acknowledge);
  assert.equal(success.phase, 'cue/tool-success');
  assert.match(success.detail, /不代表整个/);
  for (const outcome of [undefined, 'unknown', 'cancelled', 'failure']) {
    const result = Director.plan({ ...value, events: [end({ outcome, summary: 'all tests passed and the whole task is complete' })] }, { now });
    assert.notEqual(result.asset, Director.ASSETS.acknowledge, String(outcome));
  }
  assert.equal(Director.plan({ ...value, events: [end({ outcome: 'failure' })] }, { now }).asset, Director.ASSETS.error);
  assert.equal(Director.plan({ ...value, events: [end({ outcome: 'cancelled' })] }, { now }).phase, 'cue/tool-cancelled');
});

test('reaction cues require a recent identified event and have distinct replay keys for distinct results', () => {
  const value = session('coding');
  const first = Director.plan({ ...value, events: [end()] }, { now });
  const second = Director.plan({ ...value, events: [end({ eventId: 'result-b' })] }, { now });
  assert.notEqual(first.cueKey, second.cueKey);
  assert.equal(first.asset, second.asset);
  for (const event of [end({ eventId: undefined }), end({ at: now - Director.CUE_MS - 1 }), end({ at: now + 1 })]) {
    assert.equal(Director.plan({ ...value, events: [event] }, { now }).cueKey, undefined);
  }
  const newerWork = { eventId: 'next-start', event: 'tool-start', at: now - 10, activity: 'planning' };
  assert.equal(Director.plan({ ...value, events: [end(), newerWork] }, { now }).cueKey, undefined, 'a newer activity supersedes the earlier reaction');
});

test('helpers greet only on a real recent child-start event, then resume their actual activity', () => {
  const event = { eventId: 'child-start', event: 'subagent-start', at: now - 100, evidence: { rawEvent: 'SubagentStart' } };
  const helper = session('reading', { parentId: 'codex:parent', events: [event] });
  assert.equal(Director.plan(helper, { now }).phase, 'cue/helper-joined');
  assert.equal(Director.plan({ ...helper, parentId: undefined }, { now }).cueKey, undefined);
  const later = Director.plan(helper, { now: now + Director.CUE_MS });
  assert.match(later.phase, /^reading\//);
  assert.equal(later.cueKey, undefined);
});

test('parallel coordination uses actual activeTools, while tool name and explicit context events refine safe phases', () => {
  const two = phasePlans(session('coding', { activeTools: 2 }));
  const three = phasePlans(session('coding', { activeTools: 3 }));
  assert.ok(two.some(plan => plan.asset === Director.ASSETS.headphones));
  assert.equal(two.some(plan => plan.asset === Director.ASSETS.juggle), false);
  assert.ok(three.some(plan => plan.asset === Director.ASSETS.juggle));
  assert.equal(phasePlans(session('coding', { activeTools: 1, parentId: 'a-parent', subagentCount: 20 })).some(plan => plan.asset === Director.ASSETS.juggle), false);
  const compact = Director.plan(session('planning', { evidence: { rawEvent: 'PreCompact' } }), { now });
  assert.ok([Director.ASSETS.think, Director.ASSETS.focus].includes(compact.asset));
  assert.equal(Director.plan(session('unknown', { evidence: { rawEvent: 'PreCompact' } }), { now }).asset, Director.ASSETS.still);
  assert.ok(phasePlans(session('searching', { toolName: 'WebSearch' })).some(plan => plan.caption === '查找资料线索'));
});

test('real reducer snapshots retain source fidelity through a tool result and a pending question', () => {
  const store = createSessionStore({ now: () => now, staleMs: 999999 });
  const event = (kind, patch = {}) => ({ provider: 'codex', sessionId: 'actual-reducer-fixture', event: kind, eventId: kind + '-' + Object.keys(patch).join('-'), turnId: 'turn', at: now - 1000, evidence: { source: 'hook', rawEvent: 'fixture' }, ...patch });
  store.ingest(event('turn-start', { activity: 'planning' }));
  store.ingest(event('tool-start', { toolCallId: 'test', toolName: 'Bash', activity: 'testing' }));
  store.ingest(event('tool-end', { eventId: 'test-success', toolCallId: 'test', toolName: 'Bash', outcome: 'success', activity: 'testing', at: now - 800 }));
  assert.equal(store.snapshot()[0].activity, 'planning', 'the reducer has already moved beyond the tool');
  const recent = Director.plan(store.snapshot()[0], { now });
  assert.equal(recent.phase, 'recent-work/testing');
  assert.equal(recent.recentWork, true);
  assert.equal(store.snapshot()[0].activeTools, 0, 'recent-work is a presentation of past evidence, never a pending tool');
  store.ingest(event('waiting-user', { eventId: 'question', toolCallId: 'question', toolName: 'request_user_input', activity: 'waiting-user', at: now - 700 }));
  store.ingest(event('tool-start', { eventId: 'parallel-start', toolCallId: 'parallel', activity: 'coding', at: now - 600 }));
  store.ingest(event('tool-end', { eventId: 'parallel-success', toolCallId: 'parallel', outcome: 'success', at: now - 500 }));
  assert.match(Director.plan(store.snapshot()[0], { now }).phase, /^waiting-user\//);
});

test('planning is pure, localized, available as browser UMD, and does not invent sleep after a long quiet period', () => {
  const value = Object.freeze({ ...session('coding'), evidence: Object.freeze({ rawEvent: 'PreToolUse' }), events: Object.freeze([]) });
  const english = Director.plan(value, { now, language: 'en-US' });
  const chinese = Director.plan(value, { now, language: 'zh' });
  assert.equal(english.asset, chinese.asset);
  assert.equal(english.phase, chinese.phase);
  assert.doesNotMatch(english.caption, /[\u4e00-\u9fff]/);
  assert.notEqual(english.caption, chinese.caption);
  assert.deepEqual(Director.plan(value, { now, language: 'en-US' }), english);
  assert.equal(Director.plan({ ...value, events: [end()] }, { now: 0 }).cueKey, undefined, 'an explicit replay clock at zero must not be replaced by a future event timestamp');
  const browser = {};
  vm.createContext(browser);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'animation-director.js'), 'utf8'), browser);
  assert.equal(typeof browser.OfficeAnimationDirector.plan, 'function');
  assert.equal(browser.OfficeAnimationDirector.plan(value, { now, language: 'en' }).asset, english.asset);
  const later = Director.plan(value, { now: now + 86400000 });
  assert.match(later.phase, /^coding\//);
  assert.doesNotMatch(later.asset, /sleep|collapse|doze/);
});


test('thinking holds one continuous asset through time, metadata, parallel counts and recent tool outcomes', () => {
  const value = session('planning');
  const first = Director.plan(value, { now });
  for (const clock of [now, now + 8500, now + 60000]) {
    for (const outcome of ['success', 'failure', 'unknown']) {
      const current = Director.plan({...value, lastEventAt:clock, activeTools:5, events:[end({at:clock-100,outcome})]}, {now:clock});
      assert.equal(current.asset, first.asset);
      assert.equal(current.phase, 'planning/think');
      assert.equal(current.cueKey, undefined);
    }
  }
  assert.notEqual(Director.plan({...value, activity:'coding'}, {now}).phase, first.phase);
  assert.equal(Director.plan({...value, attention:true}, {now}).phase.startsWith('waiting-user/'), true);
});

test('a fast observed edit survives a snapshot interval at its current station, then returns to continuous thinking', () => {
  const store = createSessionStore({ now: () => now, staleMs:999999 });
  const event = (kind, patch={}) => ({ provider:'codex',sessionId:'quick-edit',event:kind,eventId:kind,turnId:'turn',at:now-1000,
    evidence:{source:'codex-jsonl',rawEvent:'response_item:custom_tool_call'},...patch });
  store.ingest(event('turn-start',{activity:'planning'}));
  store.ingest(event('tool-start',{toolCallId:'edit',toolName:'exec → apply_patch',activity:'coding',at:now-900}));
  store.ingest(event('tool-end',{toolCallId:'edit',toolName:'exec → apply_patch',activity:'planning',outcome:'unknown',at:now-800}));
  const value=store.snapshot()[0];
  assert.equal(value.activity,'planning'); assert.equal(value.activeTools,0);
  assert.equal(value.events.at(-1).activity,'planning'); assert.equal(value.events.at(-1).observedActivity,'coding');
  const first=Director.plan(value,{now,language:'en'});
  assert.equal(first.phase,'recent-work/coding'); assert.equal(first.asset,Director.ASSETS.type);
  assert.match(first.label,/Just worked/); assert.doesNotMatch(first.caption,/success|finished|complete/i);
  const next=Director.plan({...value,lastEventAt:now+2000},{now:now+2000,language:'en'});
  assert.equal(next.cueKey,first.cueKey,'a heartbeat never restarts the action replay');
  const expired=Director.plan(value,{now:now+Director.WORK_CUE_MS});
  assert.equal(expired.phase,'planning/think'); assert.equal(expired.cueKey,undefined);
  assert.equal(Director.plan(value,{now:now+Director.WORK_CUE_MS+20000}).asset,expired.asset);
  for (const patch of [{activity:'waiting-user'},{activity:'error'},{activity:'idle'},{disconnected:true},{closed:true},{activeTools:1}]) {
    assert.equal(Director.observedWork({...value,...patch},{now}),null);
    assert.notEqual(Director.plan({...value,...patch},{now}).phase,'recent-work/coding');
  }
  store.ingest(event('tool-start',{eventId:'next',toolCallId:'read',toolName:'Read',activity:'reading',at:now-500}));
  assert.match(Director.plan(store.snapshot()[0],{now}).phase,/^reading\//);
});
