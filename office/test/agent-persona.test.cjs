'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
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
  const { aliasZh, aliasEn, ...unchangedFields } = Persona.forSession(actor('session-a'));
  assert.notEqual(aliasZh, '无涯夫诸', 'v3 uses a whole mythological proper name, never an epithet plus a name');
  assert.notEqual(aliasEn, 'Rainlane Wren', 'v3 deliberately replaces the old two-word display alias');
  assert.deepEqual(unchangedFields, {
    traitZh: '给每颗小石子编一个故事', traitEn: 'Makes up a story for every pebble',
    greetingZh: '嗨，这个角落听得见风铃。', greetingEn: 'Hi. You can hear the chimes from here.',
    keepsake: 'paperboat',
    signoffZh: '我去收一小口海风。', signoffEn: 'Off to catch a little harbour breeze.'
  }, 'only nickname mappings change; traits, keepsake and dialogue retain their original mapping');
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
  assert.ok(new Set(personas.map(persona => persona.aliasZh)).size >= 80, 'a small authentic-name pool is deliberately finite and may repeat');
  assert.ok(new Set(personas.map(persona => persona.aliasEn)).size >= 150);
  assert.ok(new Set(personas.map(persona => persona.keepsake)).size >= 10);
  assert.ok(new Set(personas.map(persona => persona.traitZh)).size >= 22);
  for (const [index, persona] of personas.entries()) {
    assert.deepEqual(Object.keys(persona).sort(), ['aliasZh', 'aliasEn', 'traitZh', 'traitEn', 'greetingZh', 'greetingEn', 'keepsake', 'signoffZh', 'signoffEn'].sort());
    assert.match(persona.aliasZh, /^[\u4e00-\u9fff]{2,4}$/);
    assert.match(persona.aliasEn, /^[A-Z][a-z]{3,6}$/);
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

test('Chinese v3 is a finite curated pool of direct primary-text names, not generated compounds', () => {
  assert.equal(Persona.version, 3);
  const sources = Persona.nicknameSources;
  assert.ok(Object.isFrozen(sources));
  const entries = sources.flatMap(source => {
    assert.match(source.chapter, /^山海经·/);
    assert.match(source.url, /^https:\/\/zh\.wikisource\.org\/wiki\/山海經\//);
    assert.ok(Object.isFrozen(source) && Object.isFrozen(source.names));
    for (const entry of source.names) {
      assert.ok(Object.isFrozen(entry));
      assert.match(entry.name, /^[\u4e00-\u9fff]{2,4}$/);
      assert.match(entry.original, /^[\u4e00-\u9fff]{2,4}$/);
    }
    return source.names;
  });
  const names = new Set(entries.map(entry => entry.name));
  assert.ok(names.size >= 128 && names.size <= 192, 'authentic curated entries replace the old 32,768 invented compounds');
  assert.equal(names.size, entries.length, 'source groups must not inflate the pool with duplicate aliases');
  for (const anchor of ['诸犍', '烛九阴', '英招', '九凤', '陆吾', '猼訑', '太子长琴', '奢比尸', '夫诸']) assert.ok(names.has(anchor), anchor);
  const anchors = Object.fromEntries(entries.map(entry => [entry.name, entry.original]));
  assert.equal(anchors['烛九阴'], '燭九陰');
  assert.equal(anchors['诸犍'], '諸犍');
  assert.equal(anchors['九凤'], '九鳳');
  const aliases = Array.from({ length: 13000 }, (_, index) => Persona.forSession(actor('cultural-collision-probe-' + index)).aliasZh);
  assert.ok(aliases.every(name => names.has(name)), 'every assigned nickname is one complete curated ancient name');
  assert.equal(new Set(aliases).size, names.size, 'the actual deterministic allocator reaches the entire authored pool');
  assert.ok(new Set(aliases).size < aliases.length, 'decoration never promises globally unique identities');
});

test('English v3 is one short cute science-fiction-style word with a finite bounded vocabulary', () => {
  const aliases = Array.from({ length: 40000 }, (_, index) => Persona.forSession(actor('short-space-name-' + index)).aliasEn);
  const unique = new Set(aliases);
  assert.ok(aliases.every(name => /^[A-Z][a-z]{3,6}$/.test(name)), 'no spaces, hyphens, numbers or private-ID fragments');
  assert.ok(unique.size >= 4000 && unique.size <= 4096, '64 short stems × 64 endings are decorative, not unique IDs');
  for (const example of ['Lumi', 'Pico', 'Nova', 'Zumi', 'Nebu', 'Cosmo', 'Orbit']) assert.ok(unique.has(example), example);
});

test('the entire actual English vocabulary rejects unsuitable complete words without random retries', () => {
  assert.notEqual(Persona.forSession(actor('public-alias-audit-4915')).aliasEn, 'Rape', 'real independently discovered identity must receive the fixed whole-word replacement');
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'agent-persona.js'), 'utf8');
  const footer = 'return Object.freeze({ version: 3, forSession, nicknameSources });';
  assert.equal(source.split(footer).length, 2);
  // Expose the actual local constructor/pools for exhaustive inspection only;
  // no replica naming algorithm and no extra production API are introduced.
  const context = vm.createContext({ module: { exports: {} } });
  vm.runInContext(source.replace(footer, 'return { pool: englishFirst.flatMap(first => englishSecond.map(second => englishAlias(first, second))) };'), context);
  const pool = Array.from(context.module.exports.pool), unsuitable = new Set(['Rape', 'Pedo', 'Kike', 'Paki', 'Dago', 'Mofo', 'Niga', 'Nige', 'Nigi', 'Nigo', 'Nigu', 'Nega', 'Faga', 'Fage', 'Fagi', 'Fago', 'Fagu', 'Fapa', 'Fape', 'Fapi', 'Fapo', 'Fapu', 'Fupa', 'Loli', 'Dope', 'Caca', 'Kaka', 'Pipi', 'Pupu', 'Culo', 'Pene', 'Figa', 'Foda', 'Suka', 'Gago', 'Baka', 'Dike', 'Lame', 'Puke', 'Gore', 'Lice', 'Nude', 'Dupa', 'Lube']);
  assert.equal(pool.length, 4096); assert.equal(new Set(pool).size, 4096);
  assert.ok(pool.every(name => /^[A-Z][a-z]{3,6}$/.test(name) && !unsuitable.has(name)));
  for (const name of ['Lumi', 'Pico', 'Nova', 'Zumi', 'Nebu', 'Cosmo', 'Orbit']) assert.ok(pool.includes(name));
  const original = Persona.forSession(actor('public-alias-audit-4915'));
  assert.deepEqual(Persona.forSession(actor('public-alias-audit-4915', {language:'zh',activity:'error',title:'different'})), original);
});

test('nickname migration preserves every original non-name persona field across 200 complete identities', () => {
  const rows = Array.from({ length: 200 }, (_, index) => {
    const { aliasZh, aliasEn, ...rest } = Persona.forSession({ id: 'unchanged-persona-' + index, provider: index % 2 ? 'codex' : 'claude' });
    return rest;
  });
  // Recorded from production v2 before the nickname-only migration.
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'), 'c4ed7f59a34b8f424a52b00d98f3116baaa020cc4fabaa676c4df0caf4c43ffb');
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
  assert.equal(browser.version, 3);
  assert.equal(JSON.stringify(browser.forSession(actor('browser-same-id'))), JSON.stringify(Persona.forSession(actor('browser-same-id'))));
  assert.ok(Object.isFrozen(browser));
});
