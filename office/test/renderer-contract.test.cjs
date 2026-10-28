'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Scene = require('../lib/scene-model.js');
const Director = require('../lib/animation-director.js');
const Clones = require('../lib/clone-lifecycle.js');
const I18n = require('../lib/i18n-model.js');
const { createSessionStore } = require('../lib/session-store.cjs');
const { normalizeEvent } = require('../lib/provider-events.cjs');

// Execute the renderer's actual functions without opening a GUI or installing hooks.
const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
function functionSource(name) {
  const match = new RegExp('^  (?:async )?function ' + name + '\\(', 'm').exec(source);
  assert.ok(match, 'renderer function missing: ' + name);
  const rest = source.slice(match.index + match[0].length);
  const next = /^  (?:async )?function /m.exec(rest);
  assert.ok(next, 'renderer function boundary missing: ' + name);
  return source.slice(match.index, match.index + match[0].length + next.index);
}
function node(content = '') {
  return { value: '', textContent: content, disabled: false, hidden: false, dataset: {}, children: [], listeners: new Map(), attributes: {}, append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items.flatMap(item => item.isFragment ? item.children : [item]); }, addEventListener(name, callback) { this.listeners.set(name, callback); }, setAttribute(name, value) { this.attributes[name] = value; }, click() { if (!this.disabled) return this.listeners.get('click')?.(); } };
}
function context(extra = {}) {
  const nodes = new Map();
  const errors = [];
  const sandbox = {
    Scene, Director, I18n, activeRoom:null, window: {OfficeVenues:require('../lib/venue-model.js'),OfficeRoomDesigns:require('../lib/room-designs.js')}, cloneLedger:Clones.createLedger().update(extra.snapshot?.sessions || []), restedClones:new Set(), persona:require('../lib/agent-persona.js').forSession, keepsakeIcon:()=> '✦',settings:{},language:'zh', bridge: {}, mutationPending: false, snapshot:{sessions:[],connections:[]},setupAssistant:null,
    $: id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    text: (target, value) => { target.textContent = String(value ?? ''); },
    element: (tag, className, content) => ({ ...node(content), tagName: tag, className }),
    document: { createDocumentFragment: () => ({ ...node(), isFragment: true }) },
    actors: new Map(), selectedSession: 'fixture', attendance: {retired: []}, currentPage: { overflowIds: [] },
    renderConnections: () => {}, refreshSnapshot: async () => {},
    showError: error => errors.push(error.message),
    timeAgo: () => '刚刚收到事件', sourceName: () => '工具 hook 事件', confidenceName: () => '明确事件',
    ...extra,
  };
  vm.createContext(sandbox);
  for (const name of ['displayName', 'zoneName', 'cloneSummary', 'cloneBusy', 'call', 'connect', 'renderInspector']) vm.runInContext(functionSource(name), sandbox);
  return { sandbox, nodes, errors };
}

test('both IPC failure formats reject with their original useful message', async () => {
  const { sandbox } = context();
  sandbox.bridge.fixture = async () => ({ status: 'error', message: '观察配置正在被另一操作使用；请稍后重试' });
  await assert.rejects(sandbox.call('fixture'), /观察配置正在被另一操作使用；请稍后重试/);
  sandbox.bridge.fixture = async () => ({ ok: false, error: '项目目录不存在' });
  await assert.rejects(sandbox.call('fixture'), /项目目录不存在/);
  sandbox.bridge.fixture = async () => ({ status: 'error' });
  await assert.rejects(sandbox.call('fixture'), /操作未完成，请稍后重试/);
});

test('connection errors remain visible in the panel and also enter the common error path', async () => {
  const message = '观察配置版本未知，已保留原文件';
  const { sandbox, nodes, errors } = context();
  let refreshes = 0;
  sandbox.refreshSnapshot = async () => { refreshes += 1; };
  sandbox.bridge.connectProvider = async () => ({ status: 'error', message });
  await sandbox.connect('cursor');
  assert.equal(nodes.get('connection-result').textContent, message);
  assert.deepEqual(errors, [message]);
  assert.equal(sandbox.mutationPending, false);
  assert.equal(refreshes, 0);
});

test('successful and unchanged connection results keep their message and refresh the snapshot', async () => {
  const { sandbox, nodes, errors } = context();
  let refreshes = 0;
  sandbox.refreshSnapshot = async () => { refreshes += 1; };
  sandbox.bridge.connectProvider = async () => ({ status: 'ok', detail: '配置已安装，请审核 hooks 信任' });
  await sandbox.connect('codex');
  assert.equal(nodes.get('connection-result').textContent, '配置已安装，请审核 hooks 信任');
  sandbox.bridge.connectProvider = async () => ({ status: 'unchanged', installed: true, message: '配置已经就绪' });
  await sandbox.connect('codex');
  assert.equal(nodes.get('connection-result').textContent, '配置已经就绪');
  assert.equal(refreshes, 2);
  assert.equal(sandbox.mutationPending, false);
  assert.deepEqual(errors, []);
});

test('installed connection buttons remove configuration while uninstalled tools still connect', async () => {
  const { sandbox, nodes } = context({ providerIds: ['codex', 'cursor', 'claude-code'], snapshot: { connections: [{ provider: 'codex', installed: true, watching: true }, { provider: 'cursor', installed: false }, { provider: 'claude-code', installed: true }] } });
  const calls = [];
  sandbox.connect = async (provider, remove) => { calls.push([provider, remove]); };
  vm.runInContext(functionSource('renderConnections'), sandbox);
  sandbox.renderConnections();
  const buttons = nodes.get('provider-connections').children.map(row => row.children[2]);
  assert.deepEqual(buttons.map(button => button.textContent), ['移除配置', '连接', '移除配置']);
  for (const button of buttons) await button.click();
  assert.deepEqual(calls, [['codex', true], ['cursor', false], ['claude-code', true]]);
  sandbox.mutationPending = true;
  sandbox.renderConnections();
  assert.equal(nodes.get('provider-connections').children.every(row => row.children[2].disabled), true);
});

test('removal uses disconnect IPC, refreshes connections, and preserves Codex read-only observation wording', async () => {
  const { sandbox, nodes, errors } = context();
  const removed = [];
  let refreshes = 0;
  sandbox.bridge.connectProvider = async () => { throw new Error('removal must not install hooks'); };
  sandbox.bridge.disconnectProvider = async provider => { removed.push(provider); return { status: 'ok', installed: false }; };
  sandbox.refreshSnapshot = async () => { refreshes += 1; };
  await sandbox.connect('codex', true);
  assert.equal(nodes.get('connection-result').textContent, '已移除观察配置；本地只读观察仍可继续');
  await sandbox.connect('cursor', true);
  assert.equal(nodes.get('connection-result').textContent, '已移除本应用的观察配置。');
  await sandbox.connect('claude-code', true);
  assert.deepEqual(removed, ['codex', 'cursor', 'claude-code']);
  assert.equal(refreshes, 3);
  assert.equal(sandbox.mutationPending, false);
  assert.deepEqual(errors, []);
});

test('an installed Hermes plugin can be reloaded without removing its configuration',async()=>{
  const {sandbox,nodes}=context({providerIds:['hermes'],snapshot:{connections:[{provider:'hermes',installed:true,watching:false}]}});
  const calls=[];sandbox.connect=async(...args)=>calls.push(args);vm.runInContext(functionSource('renderConnections'),sandbox);sandbox.renderConnections();
  const actions=nodes.get('provider-connections').children[0].children[2];assert.deepEqual(actions.children.map(button=>button.textContent),['重新加载','移除配置']);
  await actions.children[0].click();await actions.children[1].click();assert.deepEqual(calls,[['hermes',false],['hermes',true]]);
  sandbox.mutationPending=true;sandbox.renderConnections();assert.ok(nodes.get('provider-connections').children[0].children[2].children.every(button=>button.disabled));
});

test('a failed removal keeps the backend message and unlocks the panel without reporting success', async () => {
  const { sandbox, nodes, errors } = context();
  let refreshes = 0;
  sandbox.refreshSnapshot = async () => { refreshes += 1; };
  sandbox.bridge.disconnectProvider = async () => ({ status: 'error', message: '配置被另一操作占用，原文件已保留' });
  await sandbox.connect('codex', true);
  assert.equal(nodes.get('connection-result').textContent, '配置被另一操作占用，原文件已保留');
  assert.deepEqual(errors, ['配置被另一操作占用，原文件已保留']);
  assert.equal(refreshes, 0);
  assert.equal(sandbox.mutationPending, false);
});

test('live folders remain available and missing-path tasks remain disabled', () => {
  const session = { id: 'fixture', sessionId: 'fixture', provider: 'codex', title: '真实任务', projectPath: '/projects/mini-office', activity: 'waiting-user', status: 'waiting', attention: true, events: [] };
  const { sandbox, nodes } = context({ snapshot: { mode: 'live', sessions: [session] } });
  sandbox.renderInspector();
  assert.equal(nodes.get('open-source').disabled, false);
  assert.match(nodes.get('inspect-action-note').textContent, /回到 Codex 回答或处理审批/);
  session.projectPath = '';
  sandbox.renderInspector();
  assert.equal(nodes.get('open-source').disabled, true);
});

test('root inspector counts nested observed identities and localizes names without rewriting task data', () => {
  const session = { id: 'fixture', sessionId: 'native-root-id', provider: 'codex', title: 'Keep This User Title', activity: 'planning', status: 'active', events: [] };
  const sessions = [session,
    { id: 'coding-child', parentId: session.id, activity: 'coding', status: 'active' },
    { id: 'nested-ended', parentId: 'coding-child', closed: true },
    { id: 'idle-child', parentId: session.id, activity: 'idle', status: 'idle' },
    { id: 'stale-child', parentId: session.id, activity: 'unknown', status: 'stale', disconnected: true },
    { id: 'unknown-child', parentId: session.id, activity: 'unknown', status: 'active' }];
  const { sandbox, nodes } = context({ snapshot: { mode: 'live', sessions }, settings: { nameStyle: 'classic' } });
  const p = require('../lib/agent-persona.js').forSession(session);
  sandbox.renderInspector();
  assert.equal(nodes.get('inspect-nickname').textContent, p.aliasZh);
  assert.equal(nodes.get('inspect-persona-name').textContent, p.aliasZh);
  assert.equal(nodes.get('inspect-title').textContent, session.title);
  assert.match(nodes.get('inspect-session-id').textContent, /native-root-id/);
  assert.equal(nodes.get('inspect-helper').textContent, '分身 1 活跃 · 累计 5');
  assert.match(nodes.get('inspect-helper').title, /独立分身/);
  sandbox.language = 'en';
  sandbox.renderInspector();
  assert.equal(nodes.get('inspect-nickname').textContent, p.aliasEn);
  assert.equal(nodes.get('inspect-persona-name').textContent, p.aliasEn);
  assert.equal(nodes.get('inspect-helper').textContent, '1 active clones · 5 total');
  assert.equal(nodes.get('inspect-title').textContent, session.title);
});

test('greeting remains visibly disabled while a body is cloning or holding for returning clones', () => {
  const session = { id: 'fixture', sessionId: 'native-root-id', provider: 'codex', title: 'Original task', activity: 'planning', status: 'active', events: [] };
  const actor = { session, clonePhase: 'splitting', holdingFamily: false, departing: false };
  const { sandbox, nodes } = context({ snapshot: { mode: 'live', sessions: [session] }, actors: new Map([[session.id, actor]]) });
  sandbox.renderInspector(); assert.equal(nodes.get('greet-agent').disabled, true);
  actor.clonePhase = 'working'; actor.holdingFamily = true;
  sandbox.renderInspector(); assert.equal(nodes.get('greet-agent').disabled, true);
  actor.holdingFamily = false;
  sandbox.renderInspector(); assert.equal(nodes.get('greet-agent').disabled, false);
  assert.equal(session.activity, 'planning');
});

test('a real completed helper turn returns visually while its native session and historical ledger stay open', () => {
  let now = 1000;
  const store = createSessionStore({ now: () => now, staleMs: 10000 });
  const emit = raw => store.ingest(normalizeEvent('codex', { session_id: 'root', ...raw }, { receivedAt: now++, source: 'hook' }));
  emit({ hook_event_name: 'UserPromptSubmit', turn_id: 'parent-turn', prompt: 'Observe actual helper work' });
  emit({ hook_event_name: 'SubagentStart', turn_id: 'child-turn', agent_id: 'helper' });
  emit({ hook_event_name: 'Stop', turn_id: 'child-turn', agent_id: 'helper' });
  const session = Object.freeze(store.snapshot().find(item => item.parentId));
  assert.equal(session.closed, false);
  assert.equal(session.status, 'idle');
  const actor = { id: session.id, session }, parent = { id: session.parentId, departing: false };
  const rested = new Set(), observedIds = new Set([actor.id, parent.id]), spoken = [];
  const actors = new Map([[actor.id, actor], [parent.id, parent]]);
  let releases = 0, navigationRequests = 0, trafficRequests = 0;
  const sandbox = { Scene, actors, observedIds,
    say: (_parent, phrase) => spoken.push(phrase), rememberRestedClone: id => rested.add(id),
    removeActor: id => actors.delete(id), releaseWaitingRoots: () => { releases++; }, queueNavigation: () => { navigationRequests++; }, queueTraffic: () => { trafficRequests++; } };
  vm.createContext(sandbox);
  for (const name of ['completedCloneTurn', 'completedCloneReturn', 'finishCloneReturn']) vm.runInContext(functionSource(name), sandbox);
  assert.equal(sandbox.completedCloneTurn(session, 0), true);
  assert.equal(sandbox.completedCloneTurn(session, session.turnCompletedAt), false, 'the same completion cannot start another return');
  for (const patch of [{ activeTools: 1 }, { attention: true }, { status: 'stale' }, { disconnected: true }, { activity: 'unknown' }]) {
    assert.equal(sandbox.completedCloneTurn({ ...session, ...patch }, 0), false);
  }
  sandbox.finishCloneReturn(actor, parent, 'completed');
  assert.deepEqual(spoken, ['结束分身。']);
  assert.equal(rested.has(actor.id), true);
  assert.equal(observedIds.has(actor.id), false, 'new real work must split a new visual body from its parent');
  assert.equal(actors.has(actor.id), false);
  assert.equal(releases, 1);
  assert.equal(navigationRequests, 1, 'physical station planning resumes after an actual absorption');
  assert.equal(trafficRequests, 1, 'the finite dock reservation releases waiting real routes');
  assert.equal(store.snapshot().find(item => item.id === actor.id).closed, false);
  const ledger = Clones.createLedger().update(store.snapshot(), now);
  assert.deepEqual(ledger.stats(parent.id), { active: 0, total: 1, ended: 0, open: 1, uncertain: 0 });
});
