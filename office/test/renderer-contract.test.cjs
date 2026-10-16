'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Scene = require('../lib/scene-model.js');
const Director = require('../lib/animation-director.js');

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
    Scene, Director, persona:require('../lib/agent-persona.js').forSession, displayName:Scene.identityName, keepsakeIcon:()=> '✦',settings:{nameStyle:'classic'},language:'zh', bridge: {}, mutationPending: false,
    $: id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    text: (target, value) => { target.textContent = String(value ?? ''); },
    element: (tag, className, content) => ({ ...node(content), tagName: tag, className }),
    document: { createDocumentFragment: () => ({ ...node(), isFragment: true }) },
    actors: new Map(), selectedSession: 'fixture', attendance: {retired: []},
    renderConnections: () => {}, refreshSnapshot: async () => {},
    showError: error => errors.push(error.message),
    timeAgo: () => '刚刚收到事件', sourceName: () => '工具 hook 事件', confidenceName: () => '明确事件',
    ...extra,
  };
  vm.createContext(sandbox);
  for (const name of ['call', 'connect', 'renderInspector']) vm.runInContext(functionSource(name), sandbox);
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

test('demo project folders are explicitly simulated and unavailable, including attention tasks', () => {
  const session = { id: 'fixture', sessionId: 'fixture', provider: 'codex', title: '演示任务', projectPath: '/Demo/小小工作室', activity: 'waiting-user', status: 'waiting', attention: true, events: [] };
  const { sandbox, nodes } = context({ snapshot: { mode: 'demo', sessions: [session] } });
  sandbox.renderInspector();
  assert.equal(nodes.get('open-source').disabled, true);
  assert.match(nodes.get('inspect-action-note').textContent, /模拟项目.*不对应本地文件夹/);
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
