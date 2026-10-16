'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures/provider-events.json');
const { normalizeEvent, classifyShell, actorKey } = require('../office/lib/provider-events.cjs');
const TIME = 1792051200000;

for (const fixture of fixtures.cases) {
  test(`provider fixture: ${fixture.name} [${fixture.provenance}]`, () => {
    const source = fixture.raw.hook_event_name ? 'official-example' : fixture.provenance;
    const actual = normalizeEvent(fixture.provider, fixture.raw, { receivedAt: TIME, source });
    if (fixture.expected === null) return assert.equal(actual, null);
    assert.ok(actual);
    for (const [key, value] of Object.entries(fixture.expected)) assert.deepEqual(actual[key], value, key);
    assert.equal(actual.at, TIME);
    assert.equal(actual.evidence.source, source);
    assert.equal(typeof actual.eventId, 'string');
    assert.ok(actual.eventId.length > 20);
    assert.ok(fixture.sourceUrl.startsWith('https://'));
  });
}

test('three Codex sessions, two turns, and two child helpers retain distinct actors', () => {
  const raw = { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_use_id: 'call-a', tool_input: {} };
  const actors = ['codex-a', 'codex-b', 'codex-c'].map(session_id => normalizeEvent('codex', { ...raw, session_id }));
  assert.equal(new Set(actors.map(x => x.id)).size, 3);
  const next = normalizeEvent('codex', { ...raw, session_id: 'codex-a', turn_id: 'turn-b' });
  assert.equal(next.id, actors[0].id);
  assert.notEqual(next.eventId, actors[0].eventId);
  const children = ['child-a', 'child-b'].map(agent_id => normalizeEvent('codex', {
    session_id: 'codex-a', hook_event_name: 'SubagentStart', agent_id,
  }));
  assert.notEqual(children[0].id, children[1].id);
  assert.equal(children[0].parentId, 'codex:codex-a');
});

test('actor components cannot collide through colon separators', () => {
  assert.notEqual(actorKey('codex', 'a:b'), actorKey('codex', 'a', 'b'));
});

test('missing identifiers, fallback identifiers, unknown providers and event dialects are rejected', () => {
  for (const raw of [null, [], 'text', {}, { hook_event_name: 'SessionStart' },
    { session_id: 'default', hook_event_name: 'SessionStart' },
    { session_id: 'codex:default', hook_event_name: 'SessionStart' },
    { session_id: 'a\nb', hook_event_name: 'SessionStart' },
    { session_id: 'a', hook_event_name: 'FutureToolEvent' },
    { session_id: 'a', hook_event_name: 'constructor' },
    { session_id: 'a', hook_event_name: 'toString' },
    { session_id: 'a', event: 'SessionStart' },
    { session_id: 'a', hook_event_name: 'PostToolUseFailure' },
  ]) assert.equal(normalizeEvent('codex', raw), null);
  assert.equal(normalizeEvent('unknown', { session_id: 'a', hook_event_name: 'SessionStart' }), null);
  assert.equal(normalizeEvent('cursor', { conversation_id: 'a', hook_event_name: 'SessionStart' }), null);
  assert.equal(normalizeEvent('claude-code', { session_id: 'a', hook_event_name: 'preToolUse' }), null);
});

test('tool event IDs survive duplicate delivery, but distinct calls and phases do not collapse', () => {
  const raw = { session_id: 'a', turn_id: 't', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'call-a', tool_input: { command: 'npm test' } };
  const first = normalizeEvent('codex', raw, { receivedAt: TIME });
  assert.equal(first.eventId, normalizeEvent('codex', raw, { receivedAt: TIME + 200 }).eventId);
  assert.notEqual(first.eventId, normalizeEvent('codex', { ...raw, tool_use_id: 'call-b' }).eventId);
  assert.notEqual(first.eventId, normalizeEvent('codex', { ...raw, hook_event_name: 'PostToolUse' }).eventId);
});

test('replay is pure, does not mutate raw input, and accepts explicit timestamps', () => {
  const raw = Object.freeze({ session_id: 'a', hook_event_name: 'SessionStart' });
  assert.deepEqual(normalizeEvent('codex', raw), normalizeEvent('codex', raw));
  assert.equal(normalizeEvent('codex', raw).at, 0);
  assert.equal(normalizeEvent('codex', raw, { receivedAt: new Date(TIME) }).at, TIME);
  assert.equal(normalizeEvent('codex', raw, { receivedAt: new Date(TIME).toISOString() }).at, TIME);
  assert.equal(normalizeEvent('codex', { ...raw, timestamp: new Date(TIME).toISOString() }).at, TIME);
});

test('normalized events retain only a bounded first-line title, never full task or outputs', () => {
  const prefix = '实现一个精致的工作室';
  const raw = {
    session_id: 'a', hook_event_name: 'UserPromptSubmit',
    prompt: `${prefix.repeat(8)}\nPRIVATE_PROMPT_CANARY`,
    last_assistant_message: 'PRIVATE_ANSWER_CANARY', tool_input: { secret: 'PRIVATE_INPUT_CANARY' },
    tool_response: { stdout: 'PRIVATE_OUTPUT_CANARY' }, transcript_path: '/PRIVATE_TRANSCRIPT_CANARY',
  };
  const event = normalizeEvent('codex', raw);
  assert.equal(Array.from(event.title).length, 48);
  const serialized = JSON.stringify(event);
  for (const token of ['PRIVATE_PROMPT_CANARY', 'PRIVATE_ANSWER_CANARY', 'PRIVATE_INPUT_CANARY', 'PRIVATE_OUTPUT_CANARY', 'PRIVATE_TRANSCRIPT_CANARY']) assert.ok(!serialized.includes(token));
  for (const key of ['prompt', 'last_assistant_message', 'tool_input', 'tool_response', 'transcript_path']) assert.ok(!Object.hasOwn(event, key));
});

test('explicit internal markers are rejected without hiding user sessions by title or path', () => {
  const base = { session_id: 'a', hook_event_name: 'SessionStart' };
  for (const flag of [{ internal: true }, { is_internal: true }, { codex_internal_thread: 'ambient_suggestions' }, { thread_source: 'internal' }]) assert.equal(normalizeEvent('codex', { ...base, ...flag }), null);
  assert.ok(normalizeEvent('codex', { ...base, session_title: 'memories', cwd: '/example/memories' }));
  assert.ok(normalizeEvent('codex', { ...base, transcript_path: '' }));
});

test('shell classifier recognizes direct commands without matching quoted examples or compound steps', () => {
  const samples = [
    ['npm test', 'testing'], ['npm run test:unit', 'testing'], ['pnpm test', 'testing'],
    ['npx vitest run', 'testing'], ['node --test test/a.test.js', 'testing'], ['python3 -m pytest', 'testing'],
    ['cargo test', 'testing'], ['swift test', 'testing'], ['go test ./...', 'testing'],
    ['cd /example && npm test', 'testing'], ['CI=1 npm test', 'testing'], ['env CI=1 npm test', 'testing'],
    ["bash -lc 'npm test'", 'testing'], ['npm run build', 'building'], ['cmake --build build', 'building'],
    ['rg "npm test" src', 'searching'], ['cat README.md', 'reading'], ['git diff --stat', 'reading'],
    ["echo 'npm test'", 'running'], ['node app.js --test', 'running'], ['npm install && npm test', 'running'],
    ['npm test && npm run build', 'running'], ["npm test; false", 'running'], ['npm test | cat', 'running'],
    ['npm test > result.txt', 'running'], ['npm test # example', 'running'], ['$(npm test)', 'running'],
    ['echo `npm test`', 'running'], ['npm test\necho done', 'running'], ["bash -lc 'echo npm test'", 'running'],
    ['find . -exec npm test ;', 'running'], ['sed -i s/a/b/ src/a.js', 'running'],
  ];
  for (const [command, expected] of samples) assert.equal(classifyShell(command).activity, expected, command);
});

test('unknown/custom tool names do not become activities because their names contain a keyword', () => {
  for (const tool_name of ['mcp__custom__test_connection', 'read_secret', 'design-and-build']) {
    const event = normalizeEvent('codex', { session_id: 'a', hook_event_name: 'PreToolUse', tool_name, tool_input: {} });
    assert.equal(event.activity, 'unknown');
  }
});

test('exit fields are evidence, output prose and stringified integers are not', () => {
  const base = { session_id: 'a', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } };
  for (const result of ['error: not actually a failure', 'All tests passed', { stdout: 'Process exited with code 1' }, { exit_code: '0' }, { exitCode: null }, { exitCode: 1e20 }]) {
    assert.equal(normalizeEvent('codex', { ...base, tool_response: result }).outcome, 'unknown');
  }
  assert.equal(normalizeEvent('codex', { ...base, tool_response: { exit_code: 0 } }).outcome, 'success');
  assert.equal(normalizeEvent('codex', { ...base, tool_response: { exitCode: 9 } }).outcome, 'failure');
  assert.equal(normalizeEvent('codex', { ...base, tool_response: { interrupted: true, exit_code: 1 } }).outcome, 'cancelled');
});

test('failed compound command says tool failed, never claims a particular test segment failed', () => {
  const actual = normalizeEvent('codex', {
    session_id: 'a', hook_event_name: 'PostToolUse', tool_name: 'Bash',
    tool_input: { command: 'npm test && npm run build' }, tool_response: { exit_code: 1 },
  });
  assert.equal(actual.outcome, 'failure');
  assert.equal(actual.summary, '工具执行未成功');
  assert.ok(!actual.summary.includes('测试失败'));
});

test('Cursor generic shell start does not manufacture an approval state', () => {
  const event = normalizeEvent('cursor', { conversation_id: 'a', hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'npm ci' } });
  assert.equal(event.event, 'tool-start');
  assert.equal(event.activity, 'running');
  assert.equal(normalizeEvent('cursor', { conversation_id: 'a', hook_event_name: 'PermissionRequest' }), null);
});

test('Stop with background evidence stays waiting; next session lifecycle is independent', () => {
  for (const extra of [{ background_tasks: [{ type: 'shell' }] }, { session_crons: [{ id: 'cron-a' }] }, { stop_hook_active: true }, { background_tasks_count: 1 }]) {
    const event = normalizeEvent('claude-code', { session_id: 'a', hook_event_name: 'Stop', ...extra });
    assert.equal(event.event, 'turn-end');
    assert.equal(event.activity, 'waiting-tool');
  }
  assert.equal(normalizeEvent('claude-code', { session_id: 'a', hook_event_name: 'SessionEnd' }).event, 'session-end');
});

test('upstream provider marker never becomes a fake child identity', () => {
  const event = normalizeEvent('claude-code', { session_id: 'a', event: 'PreToolUse', agent_id: 'claude-code', subagent_id: 'child-a', tool_name: 'Read' }, { source: 'upstream' });
  assert.equal(event.id, 'claude-code:a:child-a');
  const parent = normalizeEvent('claude-code', { session_id: 'a', event: 'SessionStart', agent_id: 'claude-code' }, { source: 'upstream' });
  assert.equal(parent.id, 'claude-code:a');
});

test('project roots remain unknown for ambiguous multi-root workspaces and relative paths', () => {
  const base = { conversation_id: 'a', hook_event_name: 'sessionStart' };
  assert.equal(normalizeEvent('cursor', { ...base, workspace_roots: ['/one', '/two'] }).projectPath, undefined);
  assert.equal(normalizeEvent('cursor', { ...base, cwd: './relative' }).projectPath, undefined);
  assert.equal(normalizeEvent('cursor', { ...base, cwd: 'C:\\project' }).projectPath, 'C:\\project');
});
