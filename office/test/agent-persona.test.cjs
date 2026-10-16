'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Persona = require('../lib/agent-persona.js');
const Scene = require('../lib/scene-model.js');

const actor = (id, patch = {}) => ({ id, provider: 'codex', sessionId: 'fallback-id', ...patch });

test('a decorative persona is stable across changing work, snapshots, families and projects', () => {
  const session = actor('codex:550e8400-e29b-41d4-a716-446655440000', { title: 'Private title', projectPath: '/secret/project', activity: 'reading' });
  const original = Persona.forSession(session);
  assert.deepEqual(Persona.forSession({ ...session, title: 'Another task', summary: 'Another summary', projectPath: '/other', activity: 'error', parentId: 'new-parent', subagentId: 'different-helper', status: 'closed', closed: true, language: 'en' }), original);
  for (let index = 0; index < 100; index += 1) Persona.forSession(actor('unrelated-' + index));
  assert.deepEqual(Persona.forSession(session), original, 'no registration order or mutable cache can rename the persona');
  assert.deepEqual(Persona.forSession({ provider: session.provider, sessionId: session.id }), original, 'sessionId is a fallback only when actor ID is absent');
  assert.equal(Scene.identityName(actor('session-a')), 'Olive Hedgehog', 'the separate harbour layer must preserve v1 names');
  assert.deepEqual(Persona.forSession(actor('session-a')), {
    aliasZh: '无涯夫诸', aliasEn: 'Rainlane Wren',
    traitZh: '给每颗小石子编一个故事', traitEn: 'Makes up a story for every pebble',
    greetingZh: '嗨，这个角落听得见风铃。', greetingEn: 'Hi. You can hear the chimes from here.',
    keepsake: 'paperboat',
    signoffZh: '我去收一小口海风。', signoffEn: 'Off to catch a little harbour breeze.'
  }, 'Chinese v2 has a deliberate mapping while English and all other persona fields retain v1');
  assert.ok(Object.isFrozen(original));
  assert.throws(() => { original.aliasZh = 'changed'; }, TypeError);
});

test('provider aliases share personas while different providers retain separate identities', () => {
  const id = '550e8400-e29b-41d4-a716-446655440001';
  for (const providers of [['claude', 'claude-code', 'Claude Code', ' CLAUDE '], ['cursor', 'cursor-agent', 'Cursor Agent', ' CURSOR ']]) {
    const expected = Persona.forSession({ id, provider: providers[0] });
    for (const provider of providers) assert.deepEqual(Persona.forSession({ id, provider }), expected);
  }
  assert.notDeepEqual(Persona.forSession(actor(id)), Persona.forSession(actor(id, { provider: 'cursor' })));
  assert.notDeepEqual(Persona.forSession(actor('prefix-one:same-tail-1234')), Persona.forSession(actor('prefix-two:same-tail-1234')));
  assert.notDeepEqual(Persona.forSession(actor('complete-id-🌲')), Persona.forSession(actor('complete-id-🌳')), 'all code units of the complete ID matter');
  assert.notDeepEqual(Persona.forSession(actor(id, { provider: 'constructor' })), Persona.forSession(actor(id, { provider: 'toString' })), 'unknown provider names never resolve inherited object properties');
});

test('the authored cultural library supplies varied short bilingual aliases with no private identity text', () => {
  const sessions = Array.from({ length: 160 }, (_, index) => actor('unique-private-actor-uuid-' + index));
  const personas = sessions.map(Persona.forSession);
  // A finite, pure nickname pool cannot promise globally unique names. This
  // protects useful diversity without turning display text into an actor key.
  assert.ok(new Set(personas.map(persona => persona.aliasZh)).size >= 156);
  assert.ok(new Set(personas.map(persona => persona.aliasEn)).size >= 156);
  assert.ok(new Set(personas.map(persona => persona.keepsake)).size >= 10);
  assert.ok(new Set(personas.map(persona => persona.traitZh)).size >= 22);
  for (const [index, persona] of personas.entries()) {
    assert.deepEqual(Object.keys(persona).sort(), ['aliasZh', 'aliasEn', 'traitZh', 'traitEn', 'greetingZh', 'greetingEn', 'keepsake', 'signoffZh', 'signoffEn'].sort());
    assert.match(persona.aliasZh, /^[\u4e00-\u9fff]{4}$/);
    assert.match(persona.aliasEn, /^[A-Z][A-Za-z]*(?: [A-Za-z]+){1,2}$/);
    assert.match(persona.traitZh, /[\u4e00-\u9fff]/);
    assert.match(persona.traitEn, /[a-z]/i);
    assert.ok(persona.greetingZh.length <= 24);
    assert.ok(persona.greetingEn.length <= 64);
    assert.ok(persona.signoffZh.length <= 24);
    assert.ok(persona.signoffEn.length <= 70);
    assert.doesNotMatch(JSON.stringify(persona), /unique-private|uuid|fallback-id/);
    assert.equal(JSON.stringify(persona).includes(sessions[index].id), false);
  }
});

test('Chinese cultural names exceed the previous entire pool and cover mythology, stars and classical objects', () => {
  const names = Array.from({ length: 13000 }, (_, index) => Persona.forSession(actor('cultural-collision-probe-' + index)).aliasZh);
  const unique = new Set(names);
  assert.ok(unique.size > 10000, 'the deterministic sample must exceed the old 8,192 possible Chinese aliases');
  assert.equal(new Set(names.map(name => name.slice(0, 2))).size, 256);
  const endings = new Set(names.map(name => name.slice(2)));
  assert.equal(endings.size, 128);
  for (const culturalAnchor of ['青鸾', '烛龙', '白泽', '鲲鹏', '望舒', '天枢', '瑶光', '星槎', '紫毫', '瑶琴', '杜若']) {
    assert.ok(endings.has(culturalAnchor), 'authored cultural vocabulary includes ' + culturalAnchor);
  }
  assert.ok(names.every(name => /^[\u4e00-\u9fff]{4}$/.test(name)), 'four characters keep room nameplates compact');
});

test('simultaneous same-provider sessions stay independently named and malformed input stays decorative', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => actor('parallel-session-' + index));
  assert.equal(new Set(sessions.map(session => Persona.forSession(session).aliasZh)).size, sessions.length);
  assert.equal(new Set(sessions.map(session => Persona.forSession(session).aliasEn)).size, sessions.length);
  assert.deepEqual(Persona.forSession(null), Persona.forSession(undefined));
  assert.deepEqual(Persona.forSession({}), Persona.forSession('not-a-session'));
  assert.equal('activity' in Persona.forSession(sessions[0]), false);
  assert.equal('evidence' in Persona.forSession(sessions[0]), false);
});

test('the browser UMD export works without Electron, Node, providers or timers', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lib', 'agent-persona.js'), 'utf8'), context);
  const browser = context.OfficeAgentPersona;
  assert.equal(browser.version, 2);
  assert.equal(JSON.stringify(browser.forSession(actor('browser-same-id'))), JSON.stringify(Persona.forSession(actor('browser-same-id'))));
  assert.ok(Object.isFrozen(browser));
});
