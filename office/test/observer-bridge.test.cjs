'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createObserverBridge, buildObserverCommand, MARKER, EVENTS } = require('../lib/observer-bridge.cjs');
const { normalizeEvent } = require('../lib/provider-events.cjs');
const APP_ROOT = path.join(__dirname, '..');
const OBSERVER = path.join(APP_ROOT, 'hooks', 'observe.cjs');

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mini-office-observer-'));
  const homeDir = path.join(root, 'home');
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(homeDir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, homeDir, dataDir, env: { PATH: '' }, appRoot: APP_ROOT, electronPath: process.execPath };
}

function configFile(options, provider) { return path.join(options.homeDir, provider === 'codex' ? '.codex' : provider === 'cursor' ? '.cursor' : '.claude', provider === 'claude-code' ? 'settings.json' : 'hooks.json'); }
function writeConfig(options, provider, value) { const file = configFile(options, provider); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; }
function ownedEntries(value, provider) {
  return Object.values(value.hooks || {}).filter(Array.isArray).flat().flatMap(entry => provider === 'cursor' ? [entry] : entry.hooks || []).filter(entry => entry.command?.endsWith(MARKER));
}
function makeEvent(session = 'one', event = 'SessionStart') { return normalizeEvent('codex', { session_id: session, hook_event_name: event }, { receivedAt: 1000 }); }
function eventFile(options, provider = 'codex') { return path.join(options.dataDir, 'events', `${provider}.jsonl`); }
function append(options, value) { const file = eventFile(options); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
async function until(check, limit = 2500) { const end = Date.now() + limit; while (!check()) { if (Date.now() >= end) throw new Error('Timed out waiting for observer poll'); await new Promise(resolve => setTimeout(resolve, 25)); } }
function observe(options, input, args = ['--provider', 'codex', '--event', 'SessionStart', MARKER], shellCommand) {
  return new Promise((resolve, reject) => {
    const child = shellCommand ? spawn('/bin/sh', ['-c', shellCommand], { env: { ...process.env, HOME: options.homeDir }, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(process.execPath, [OBSERVER, ...args], { env: { ...process.env, ...options.hookEnv, HOME: options.homeDir, MINI_OFFICE_DATA_DIR: options.dataDir }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdin.on('error', () => {});
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(typeof input === 'string' || Buffer.isBuffer(input) ? input : JSON.stringify(input));
  });
}

test('start and connection inspection never install hooks or create directories', t => {
  const options = sandbox(t);
  const bridge = createObserverBridge(options);
  bridge.start(); t.after(() => bridge.stop());
  assert.equal(bridge.getConnections().length, 28);
  assert.ok(bridge.getConnections().every(connection => !connection.installed && !connection.watching && connection.lastEventAt === null));
  assert.deepEqual(fs.readdirSync(options.homeDir), []);
  assert.equal(fs.existsSync(options.dataDir), false);
});

test('catalog command and extension connections use their passive installers and preserve foreign entries',async t=>{
  const options=sandbox(t),bridge=createObserverBridge(options);
  const file=path.join(options.homeDir,'.gemini','settings.json');fs.mkdirSync(path.dirname(file),{recursive:true});
  const foreign={matcher:'*',hooks:[{type:'command',command:'echo user-gemini'}]};fs.writeFileSync(file,JSON.stringify({custom:true,hooks:{BeforeAgent:[foreign]}}));
  assert.equal((await bridge.connect('gemini-cli')).status,'ok');assert.equal(bridge.getConnections().find(c=>c.provider==='gemini-cli').installed,true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).hooks.BeforeAgent[0],foreign);assert.equal((await bridge.connect('gemini-cli')).status,'unchanged');
  assert.equal((await bridge.disconnect('gemini-cli')).status,'ok');assert.deepEqual(JSON.parse(fs.readFileSync(file)).hooks.BeforeAgent,[foreign]);
  const extension=path.join(options.homeDir,'.pi','agent','extensions','foreign');fs.mkdirSync(extension,{recursive:true});fs.writeFileSync(path.join(extension,'index.ts'),'keep');
  assert.equal((await bridge.connect('pi')).status,'ok');assert.equal(bridge.getConnections().find(c=>c.provider==='pi').installed,true);
  assert.equal((await bridge.disconnect('pi')).status,'ok');assert.equal(fs.readFileSync(path.join(extension,'index.ts'),'utf8'),'keep');
});

test('catalog hook and plugin providers append multiple owner-spool events and reach their distinct bridge channels',async t=>{
  const options=sandbox(t),received=[],bridge=createObserverBridge({...options,onEvent:event=>received.push(event)});bridge.start();t.after(()=>bridge.stop());
  for(const [provider,event] of [['gemini-cli','BeforeAgent'],['pi','before_agent_start']])for(let i=0;i<2;i++){
    const result=await observe(options,{hook_event_name:event,session_id:'real-'+i},['--provider',provider,'--event',event,MARKER]);assert.equal(result.code,0);assert.equal(result.stdout,'{}\n');
  }
  await until(()=>received.length===4);
  assert.deepEqual(received.map(e=>e.provider).sort(),['gemini-cli','gemini-cli','pi','pi']);assert.ok(received.every(e=>e.evidence.source==='hook'));
  for(const provider of ['gemini-cli','pi'])assert.equal(fs.readFileSync(eventFile(options,provider),'utf8').trim().split('\n').length,2);
});

test('CodeWhale environment-only hooks read bounded identity metadata without retaining model/prompt/error text',async t=>{
  const options=sandbox(t);options.hookEnv={DEEPSEEK_SESSION_ID:'native-session',DEEPSEEK_WORKSPACE:'/actual/project',DEEPSEEK_MODEL:'SECRET MODEL',DEEPSEEK_PROMPT:'SECRET PROMPT',DEEPSEEK_ERROR:'SECRET ERROR'};
  const args=['--provider','codewhale','--event','message_submit',MARKER];
  const result=await observe(options,'',args);assert.equal(result.code,0);assert.equal(result.stdout,'{}\n');
  const value=JSON.parse(fs.readFileSync(eventFile(options,'codewhale'),'utf8'));assert.equal(value.sessionId,'native-session');assert.equal(value.projectPath,'/actual/project');assert.equal(/SECRET|DEEPSEEK_/.test(JSON.stringify(value)),false);
  const missing=sandbox(t);missing.hookEnv={DEEPSEEK_PROMPT:'SECRET PROMPT'};assert.equal((await observe(missing,'',args)).stdout,'{}\n');assert.equal(fs.existsSync(eventFile(missing,'codewhale')),false);
});

test('all28 catalog tools have concrete isolated Connect and Disconnect paths without launching AI',async t=>{
  const options=sandbox(t);
  const hermes=path.join(options.homeDir,'.local','bin','hermes');fs.mkdirSync(path.dirname(hermes),{recursive:true});fs.writeFileSync(hermes,'#!/bin/sh\nexit 0\n',{mode:0o700});
  for(const name of ['web','desktop']){const file=path.join(options.homeDir,'.dsh','profiles',name,'package.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({name:'fixture-profile',dsh:{profile:{bundles:[]}}}));}
  let nativeLocks=0;
  const bridge=createObserverBridge({...options,hermesRunCli:()=>({status:0}),pluginHostMajor:2,kiroTemplate:{name:'fixture-agent',prompt:'fixture'},withNativeLock:async(paths,run)=>{nativeLocks++;assert.ok(paths.gateway.endsWith('gateway.lock'));return run();}});
  const connections=bridge.getConnections();assert.equal(connections.length,28);
  assert.equal(new Set(connections.map(c=>c.provider)).size,28);
  for(const {provider} of connections){
    const result=await bridge.connect(provider);assert.ok(['ok','unchanged'].includes(result.status),provider+': '+result.message);
    assert.equal(bridge.getConnections().find(c=>c.provider===provider).installed,true,provider);
  }
  for(const {provider} of connections.slice().reverse()){
    const result=await bridge.disconnect(provider);assert.ok(['ok','unchanged'].includes(result.status),provider+': '+result.message);
    assert.equal(bridge.getConnections().find(c=>c.provider===provider).installed,false,provider);
  }
  assert.equal(nativeLocks,2);
});

test('explicit connect merges only owned hooks, is idempotent, and disconnect preserves foreign entries', async t => {
  const options = sandbox(t);
  const foreign = { type: 'command', command: 'echo user-hook' };
  const decoy = { type: 'command', command: `echo '${MARKER}'` };
  const original = { custom: { preserve: true }, hooks: { PreToolUse: [{ matcher: 'Read', hooks: [foreign, decoy] }], UserCustomEvent: [{ hooks: [{ command: 'custom' }] }] } };
  const file = writeConfig(options, 'codex', original);
  const beforeBytes = fs.readFileSync(file, 'utf8');
  const bridge = createObserverBridge(options);
  const result = await bridge.connect('codex');
  assert.equal(result.status, 'ok');
  assert.equal(fs.readFileSync(result.backupPath, 'utf8'), beforeBytes);
  const installed = JSON.parse(fs.readFileSync(file));
  assert.deepEqual(installed.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
  assert.deepEqual(installed.custom, original.custom);
  assert.equal(ownedEntries(installed, 'codex').length, EVENTS.codex.length);
  assert.ok(ownedEntries(installed, 'codex').every(handler => handler.type === 'command' && !handler.command.includes('permissionDecision')));
  const bytes = fs.readFileSync(file, 'utf8');
  assert.equal((await bridge.connect('codex')).status, 'unchanged');
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.equal((fs.statSync(file).mode & 0o777), 0o600);
  assert.equal((await bridge.disconnect('codex')).status, 'ok');
  const removed = JSON.parse(fs.readFileSync(file));
  assert.equal(ownedEntries(removed, 'codex').length, 0);
  assert.deepEqual(removed.hooks.PreToolUse, original.hooks.PreToolUse);
  assert.deepEqual(removed.hooks.UserCustomEvent, original.hooks.UserCustomEvent);
  assert.equal((await bridge.disconnect('codex')).status, 'unchanged');
});

test('Claude mutations use the shared serialized operation queue', async t => {
  const options = sandbox(t);
  const file = writeConfig(options, 'claude-code', { theme: 'dark', hooks: { Stop: [{ hooks: [{ command: 'user-stop' }] }] } });
  const bridge = createObserverBridge(options);
  const results = await Promise.all([bridge.connect('claude-code'), bridge.disconnect('claude-code'), bridge.connect('claude-code')]);
  assert.ok(results.every(result => result.status === 'ok'));
  const value = JSON.parse(fs.readFileSync(file));
  assert.equal(value.theme, 'dark');
  assert.equal(value.hooks.Stop[0].hooks[0].command, 'user-stop');
  assert.equal(ownedEntries(value, 'claude-code').length, EVENTS['claude-code'].length);
});

test('Cursor uses version one flat hook entries and preserves unrelated policy', async t => {
  const options = sandbox(t);
  const file = writeConfig(options, 'cursor', { version: 1, hooks: { stop: [{ command: 'user-stop', loop_limit: 2 }] }, custom: 7 });
  const bridge = createObserverBridge(options);
  assert.equal((await bridge.connect('cursor')).status, 'ok');
  const value = JSON.parse(fs.readFileSync(file));
  assert.equal(value.version, 1);
  assert.equal(value.custom, 7);
  assert.deepEqual(value.hooks.stop[0], { command: 'user-stop', loop_limit: 2 });
  assert.ok(ownedEntries(value, 'cursor').length >= 7);
  assert.ok(ownedEntries(value, 'cursor').every(entry => !entry.hooks && entry.type === 'command' && entry.failClosed === undefined));
  assert.equal((await bridge.disconnect('cursor')).status, 'ok');
  assert.equal(JSON.parse(fs.readFileSync(file)).hooks.stop[0].command, 'user-stop');
});

test('corrupt, duplicate-key, unsupported and symlink configurations are refused intact', async t => {
  const variants = ['{broken', '{"hooks":{},"hooks":{}}', '{"hooks":{"Stop":[]},"\\u0068ooks":{}}', '{"hooks":[]}'];
  for (const text of variants) {
    const options = sandbox(t);
    const file = writeConfig(options, 'codex', text);
    assert.equal((await createObserverBridge(options).connect('codex')).status, 'error');
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  const options = sandbox(t);
  const target = path.join(options.root, 'foreign.json');
  fs.writeFileSync(target, '{"user":true}');
  const file = configFile(options, 'codex');
  fs.mkdirSync(path.dirname(file)); fs.symlinkSync(target, file);
  assert.equal((await createObserverBridge(options).connect('codex')).status, 'error');
  assert.ok(fs.lstatSync(file).isSymbolicLink());
  assert.equal(fs.readFileSync(target, 'utf8'), '{"user":true}');
  const cursor = sandbox(t);
  const cursorFile = writeConfig(cursor, 'cursor', { version: 9, hooks: {} });
  assert.equal((await createObserverBridge(cursor).connect('cursor')).status, 'error');
  assert.equal(JSON.parse(fs.readFileSync(cursorFile)).version, 9);
});

test('symlink configuration directories and existing mutation locks are not taken over', async t => {
  const options = sandbox(t);
  const foreign = path.join(options.root, 'other-config'); fs.mkdirSync(foreign);
  fs.symlinkSync(foreign, path.join(options.homeDir, '.codex'));
  assert.equal((await createObserverBridge(options).connect('codex')).status, 'error');
  assert.deepEqual(fs.readdirSync(foreign), []);
  const second = sandbox(t);
  const file = writeConfig(second, 'codex', { hooks: {} });
  const lock = path.join(path.dirname(file), '.mini-office-observer.lock');
  fs.writeFileSync(lock, 'foreign-lock');
  assert.equal((await createObserverBridge(second).connect('codex')).status, 'error');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'foreign-lock');
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { hooks: {} });
});

test('fingerprint recheck preserves a concurrent external edit', async t => {
  const options = sandbox(t);
  const file = writeConfig(options, 'codex', { hooks: {} });
  let changed = false;
  const bridge = createObserverBridge({ ...options, now: () => {
    if (!changed) { changed = true; fs.writeFileSync(file, '{"hooks":{},"external":true}'); }
    return 1000;
  } });
  assert.equal((await bridge.connect('codex')).status, 'error');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"hooks":{},"external":true}');
  assert.ok(!fs.readdirSync(path.dirname(file)).some(name => name.endsWith('.tmp')));
});

test('custom Codex home is respected without editing config.toml or trust', async t => {
  const options = sandbox(t);
  const custom = path.join(options.root, 'custom-codex'); fs.mkdirSync(custom);
  const toml = path.join(custom, 'config.toml'); fs.writeFileSync(toml, '[features]\nhooks = false\n');
  const bridge = createObserverBridge({ ...options, env: { PATH: '', CODEX_HOME: custom } });
  assert.equal((await bridge.connect('codex')).status, 'ok');
  assert.ok(fs.existsSync(path.join(custom, 'hooks.json')));
  assert.equal(fs.readFileSync(toml, 'utf8'), '[features]\nhooks = false\n');
  assert.match(bridge.getConnections().find(item => item.provider === 'codex').detail, /审核信任/);
});

test('custom configuration and spool roots refuse symlink ancestors', async t => {
  const options = sandbox(t);
  const foreign = path.join(options.root, 'foreign-root'); fs.mkdirSync(foreign);
  const link = path.join(options.root, 'linked-root'); fs.symlinkSync(foreign, link);
  fs.mkdirSync(path.join(foreign, 'nested'));
  const bridge = createObserverBridge({ ...options, env: { PATH: '', CODEX_HOME: path.join(link, 'nested') } });
  assert.equal((await bridge.connect('codex')).status, 'error');
  assert.deepEqual(fs.readdirSync(path.join(foreign, 'nested')), []);
  options.dataDir = path.join(link, 'nested', 'spool');
  assert.deepEqual(await observe(options, { session_id: 'one' }), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(fs.existsSync(path.join(foreign, 'nested', 'spool')), false);
});

test('observer writes normalized owner-only events and always abstains', async t => {
  const options = sandbox(t);
  const result = await observe(options, { session_id: 'real-one', prompt: 'First title\nPRIVATE_CANARY', last_assistant_message: 'PRIVATE_ANSWER', tool_response: { stdout: 'PRIVATE_OUTPUT' } }, ['--provider', 'codex', '--event', 'UserPromptSubmit', MARKER]);
  assert.deepEqual(result, { code: 0, stdout: '{}\n', stderr: '' });
  const file = eventFile(options);
  const text = fs.readFileSync(file, 'utf8');
  const normalized = JSON.parse(text);
  assert.equal(normalized.event, 'turn-start');
  assert.equal(normalized.title, 'First title');
  assert.ok(!text.includes('PRIVATE_'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('observer keeps an existing hook_event_name and rejects invalid, oversized or unmarked input', async t => {
  const options = sandbox(t);
  await observe(options, { session_id: 'one', hook_event_name: 'SessionEnd' });
  assert.equal(JSON.parse(fs.readFileSync(eventFile(options))).event, 'session-end');
  for (const input of ['not-json', 'x'.repeat(512 * 1024 + 1), '{}']) {
    const isolated = sandbox(t);
    assert.deepEqual(await observe(isolated, input), { code: 0, stdout: '{}\n', stderr: '' });
    assert.equal(fs.existsSync(isolated.dataDir), false);
  }
  const unmarked = sandbox(t);
  assert.deepEqual(await observe(unmarked, { session_id: 'one' }, ['--provider', 'codex', '--event', 'SessionStart']), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(fs.existsSync(unmarked.dataDir), false);
});

test('shell-quoted packaged command handles spaces and apostrophes as literal paths', async t => {
  const options = sandbox(t);
  options.dataDir = path.join(options.root, "office's $HOME; literal");
  const command = buildObserverCommand(options, 'codex', 'SessionStart');
  assert.deepEqual(await observe(options, { session_id: 'quoted' }, undefined, command), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(JSON.parse(fs.readFileSync(eventFile(options))).id, 'codex:quoted');
});

test('observer refuses symlink spool files and directories without affecting AI response', async t => {
  const options = sandbox(t);
  fs.mkdirSync(path.dirname(eventFile(options)), { recursive: true });
  const foreign = path.join(options.root, 'foreign.txt'); fs.writeFileSync(foreign, 'untouched');
  fs.symlinkSync(foreign, eventFile(options));
  assert.deepEqual(await observe(options, { session_id: 'one' }), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'untouched');
});

function fullSpool(options, session = 'retained') {
  const file = eventFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const line = Buffer.from(`${JSON.stringify(makeEvent(session))}\n`);
  const size = 8 * 1024 * 1024;
  const buffer = Buffer.alloc(size, 10);
  for (let offset = 0; offset + line.length <= size; offset += line.length) line.copy(buffer, offset);
  fs.writeFileSync(file, buffer, { mode: 0o600 });
  return buffer;
}

test('spool rotates before 8 MiB and retains at most one recognized backup', async t => {
  const options = sandbox(t);
  const first = fullSpool(options);
  assert.deepEqual(await observe(options, { session_id: 'new-one' }), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(JSON.parse(fs.readFileSync(eventFile(options))).sessionId, 'new-one');
  assert.deepEqual(fs.readFileSync(`${eventFile(options)}.1`), first);
  assert.equal(fs.statSync(`${eventFile(options)}.1`).mode & 0o777, 0o600);
  const second = fullSpool(options, 'retained-second');
  await observe(options, { session_id: 'new-two' });
  assert.deepEqual(fs.readFileSync(`${eventFile(options)}.1`), second);
  assert.equal(JSON.parse(fs.readFileSync(eventFile(options))).sessionId, 'new-two');
  assert.deepEqual(fs.readdirSync(path.dirname(eventFile(options))).sort(), ['codex.jsonl', 'codex.jsonl.1']);
  for (const name of ['codex.jsonl', 'codex.jsonl.1']) assert.ok(fs.statSync(path.join(path.dirname(eventFile(options)), name)).size <= 8 * 1024 * 1024);
});

test('foreign and symlink backups block rotation without changing either file', async t => {
  for (const linked of [false, true]) {
    const options = sandbox(t);
    const original = fullSpool(options);
    const backup = `${eventFile(options)}.1`;
    const foreign = path.join(options.root, 'foreign-backup'); fs.writeFileSync(foreign, 'foreign private data', { mode: 0o600 });
    if (linked) fs.symlinkSync(foreign, backup);
    else fs.writeFileSync(backup, 'foreign private data', { mode: 0o600 });
    assert.deepEqual(await observe(options, { session_id: 'new-one' }), { code: 0, stdout: '{}\n', stderr: '' });
    assert.deepEqual(fs.readFileSync(eventFile(options)), original);
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign private data');
    assert.equal(fs.readFileSync(backup, 'utf8'), 'foreign private data');
    assert.equal(fs.lstatSync(backup).isSymbolicLink(), linked);
  }
});

test('busy rotation lock drops observation without waiting or taking over the lock', async t => {
  const options = sandbox(t);
  const original = fullSpool(options);
  const lock = path.join(path.dirname(eventFile(options)), '.codex.append.lock');
  fs.writeFileSync(lock, 'another writer', { mode: 0o600 });
  const began = Date.now();
  assert.deepEqual(await observe(options, { session_id: 'new-one' }), { code: 0, stdout: '{}\n', stderr: '' });
  assert.ok(Date.now() - began < 900);
  assert.deepEqual(fs.readFileSync(eventFile(options)), original);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another writer');
  assert.equal(fs.existsSync(`${eventFile(options)}.1`), false);
  assert.match(createObserverBridge(options).getConnections().find(c=>c.provider==='codex').detail, /轮换锁/);
});

test('ordinary append does not contend for an existing rotation lock', async t => {
  const options = sandbox(t);
  fs.mkdirSync(path.dirname(eventFile(options)), { recursive: true });
  const lock = path.join(path.dirname(eventFile(options)), '.codex.append.lock');
  fs.writeFileSync(lock, 'another rotation', { mode: 0o600 });
  assert.deepEqual(await observe(options, { session_id: 'ordinary' }), { code: 0, stdout: '{}\n', stderr: '' });
  assert.equal(JSON.parse(fs.readFileSync(eventFile(options))).sessionId, 'ordinary');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another rotation');
});

test('simultaneous observers preserve complete JSON lines and bounded spool files', async t => {
  const options = sandbox(t);
  const count = 24;
  const results = await Promise.all(Array.from({ length: count }, (_, i) => observe(options, { session_id: `parallel-${i}` })));
  assert.ok(results.every(result => result.code === 0 && result.stdout === '{}\n' && !result.stderr));
  const lines = fs.readFileSync(eventFile(options), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, count);
  assert.equal(new Set(lines.map(line => line.sessionId)).size, lines.length);
  assert.ok(lines.every(line => line.provider === 'codex' && line.event === 'session-start'));
  assert.ok(fs.statSync(eventFile(options)).size <= 8 * 1024 * 1024);
  assert.ok(!fs.readdirSync(path.dirname(eventFile(options))).some(name => name.endsWith('.lock')));
  t.diagnostic(`Observed ${lines.length}/${count} parallel synthetic events; ordinary appends do not contend for the rotation lock.`);
});

test('bridge starts at EOF and incrementally joins partial UTF-8 events', async t => {
  const options = sandbox(t);
  append(options, makeEvent('historical'));
  const received = [];
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  const item = { ...makeEvent('new-one'), title: '中文任务' };
  const buffer = Buffer.from(`${JSON.stringify(item)}\n`);
  const split = buffer.indexOf(Buffer.from('中文')) + 1;
  fs.appendFileSync(eventFile(options), buffer.subarray(0, split));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(received.length, 0);
  fs.appendFileSync(eventFile(options), buffer.subarray(split));
  await until(() => received.length === 1);
  assert.equal(received[0].title, '中文任务');
  assert.equal(received[0].sessionId, 'new-one');
  assert.equal(bridge.getConnections().find(connection => connection.provider === 'codex').lastEventAt !== null, true);
});

test('tail follows rotation and truncation, rejects oversized/malformed lines, and strips extra fields', async t => {
  const options = sandbox(t);
  fs.mkdirSync(path.dirname(eventFile(options)), { recursive: true });
  const received = [];
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  append(options, { ...makeEvent('one'), prompt: 'PRIVATE_CANARY' });
  await until(() => received.length === 1);
  assert.equal(received[0].prompt, undefined);
  fs.renameSync(eventFile(options), `${eventFile(options)}.rotated`);
  fs.writeFileSync(eventFile(options), `${'x'.repeat(70 * 1024)}\nnot-json\n${JSON.stringify(makeEvent('two'))}\n`);
  await until(() => received.length === 2);
  fs.writeFileSync(eventFile(options), `${JSON.stringify(makeEvent('three'))}\n`);
  await until(() => received.length === 3);
  assert.deepEqual(received.map(event => event.sessionId), ['one', 'two', 'three']);
});

test('tail drains unread retained rotation before current without replaying startup history', async t => {
  const options = sandbox(t), received = [];
  append(options, makeEvent('historical'));
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  const backlog = Array.from({ length: 600 }, (_, i) => makeEvent(`before-rotation-${i}`));
  const pending = backlog.map(event => JSON.stringify(event)).join('\n') + '\n';
  assert.ok(Buffer.byteLength(pending) > 2 * 64 * 1024, 'backlog spans several bounded polling reads');
  fs.appendFileSync(eventFile(options), pending);
  fs.renameSync(eventFile(options), `${eventFile(options)}.1`);
  append(options, makeEvent('after-rotation'));
  await until(() => received.length >= backlog.length + 1);
  assert.deepEqual(received.map(event => event.sessionId), [...backlog.map(event => event.sessionId), 'after-rotation']);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(received.length, backlog.length + 1, 'drained records are delivered once');
});

test('tail preserves a split UTF-8 record through rotation while current spool is temporarily absent', async t => {
  const options = sandbox(t), received = [];
  append(options, makeEvent('historical'));
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  const line = Buffer.from(`${JSON.stringify({ ...makeEvent('split-before-rotation'), title: '中文任务' })}\n`);
  const split = line.indexOf(Buffer.from('中文')) + 1;
  fs.appendFileSync(eventFile(options), line.subarray(0, split));
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(received.length, 0);
  fs.appendFileSync(eventFile(options), line.subarray(split));
  append(options, makeEvent('last-before-rotation'));
  fs.renameSync(eventFile(options), `${eventFile(options)}.1`);
  await until(() => received.length === 2);
  assert.equal(received[0].title, '中文任务');
  append(options, makeEvent('after-rotation'));
  await until(() => received.length === 3);
  assert.deepEqual(received.map(event => event.sessionId), ['split-before-rotation', 'last-before-rotation', 'after-rotation']);
});

test('tail does not replay an unrelated or symbolic retained backup after replacement', async t => {
  const options = sandbox(t), received = [];
  append(options, makeEvent('historical'));
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  fs.renameSync(eventFile(options), `${eventFile(options)}.other`);
  fs.writeFileSync(`${eventFile(options)}.1`, `${JSON.stringify(makeEvent('unrelated-backup'))}\n`);
  append(options, makeEvent('first-current'));
  await until(() => received.length === 1);
  fs.unlinkSync(`${eventFile(options)}.1`);
  fs.renameSync(eventFile(options), `${eventFile(options)}.later`);
  fs.symlinkSync(`${eventFile(options)}.later`, `${eventFile(options)}.1`);
  append(options, makeEvent('second-current'));
  await until(() => received.length === 2);
  assert.deepEqual(received.map(event => event.sessionId), ['first-current', 'second-current']);
});

test('tail isolates malformed retained records and never joins fragments across generations', async t => {
  const options = sandbox(t), received = [];
  append(options, makeEvent('historical'));
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  bridge.start(); t.after(() => bridge.stop());
  const fragment = JSON.stringify(makeEvent('cross-generation-phantom'));
  const split = Math.floor(fragment.length / 2);
  fs.appendFileSync(eventFile(options), `${'x'.repeat(70 * 1024)}\nnot-json\n${JSON.stringify(makeEvent('retained-valid'))}\n${fragment.slice(0, split)}`);
  fs.renameSync(eventFile(options), `${eventFile(options)}.1`);
  fs.writeFileSync(eventFile(options), `${fragment.slice(split)}\n${JSON.stringify(makeEvent('current-valid'))}\n`);
  await until(() => received.length >= 2);
  assert.deepEqual(received.map(event => event.sessionId), ['retained-valid', 'current-valid']);
});

test('stop keeps installed configuration and restart skips intervening history', async t => {
  const options = sandbox(t);
  const received = [];
  const bridge = createObserverBridge({ ...options, onEvent: event => received.push(event) });
  await bridge.connect('codex');
  bridge.start(); bridge.stop();
  assert.equal(bridge.getConnections().find(c=>c.provider==='codex').installed, true);
  assert.equal(bridge.getConnections().find(c=>c.provider==='codex').watching, false);
  append(options, makeEvent('while-stopped'));
  bridge.start(); t.after(() => bridge.stop());
  append(options, makeEvent('after-restart'));
  await until(() => received.length === 1);
  assert.equal(received[0].sessionId, 'after-restart');
});
