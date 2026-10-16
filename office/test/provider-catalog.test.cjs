'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const catalog = require('../lib/provider-catalog.cjs');
const { buildCatalog, catalogText, labelsText, syncProviderCatalog } = require('../scripts/sync-provider-catalog.cjs');
const ROOT = path.resolve(__dirname, '../..');
function fixture(t, providers) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-catalog-'));
  fs.mkdirSync(path.join(root, 'agents'));
  const file = path.join(root, 'agents', 'registry.js');
  fs.writeFileSync(file, `module.exports={getAllAgents:()=>${JSON.stringify(providers)}};\n`);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, file };
}
function example(id = 'fixture-agent') {
  return { id, name: 'Fixture Agent', eventSource: 'hook', eventMap: { Stop: 'attention' }, capabilities: { sessionEnd: false, permissionApproval: false } };
}

test('generated providers preserve every upstream registry record and capability', () => {
  const upstream = require(path.join(ROOT, 'agents/registry.js')).getAllAgents();
  assert.deepEqual(catalog.getAllProviders(), JSON.parse(JSON.stringify(upstream)));
  assert.equal(catalog.PROVIDER_IDS.length, new Set(catalog.PROVIDER_IDS).size);
  assert.equal(catalog.getProvider('hermes').name, 'Hermes Agent');
  assert.equal(catalog.getProvider('codex').capabilities.httpHook, false);
  assert.equal(catalog.getProvider('codex').capabilities.permissionApproval, true);
});

test('lookup aliases preserve canonical IDs without guessing unknown providers', () => {
  assert.equal(catalog.normalizeProviderId('cursor'), 'cursor-agent');
  assert.equal(catalog.getProvider('cursor'), catalog.getProvider('cursor-agent'));
  assert.equal(catalog.normalizeProviderId('claude'), 'claude-code');
  for (const value of ['not-installed-tool', '', 'Hermes Agent', '__proto__', null, {}]) {
    assert.equal(catalog.normalizeProviderId(value), null);
    assert.equal(catalog.getProvider(value), null);
  }
});

test('runtime catalog and nested metadata cannot be mutated', () => {
  assert.ok(Object.isFrozen(catalog.CATALOG));
  assert.ok(Object.isFrozen(catalog.PROVIDERS));
  assert.ok(Object.isFrozen(catalog.PROVIDER_IDS));
  assert.throws(() => { catalog.getProvider('hermes').capabilities.permissionApproval = false; }, TypeError);
  assert.throws(() => { catalog.getProvider('codex').eventMap.Stop = 'success'; }, TypeError);
  assert.throws(() => catalog.PROVIDERS.push(example()), TypeError);
});

test('build sync is deterministic and committed artifact is current', () => {
  const generated = buildCatalog();
  assert.deepEqual(generated, catalog.CATALOG);
  assert.equal(catalogText(generated), fs.readFileSync(path.join(__dirname, '../lib/provider-catalog.json'), 'utf8'));
  assert.equal(labelsText(generated), fs.readFileSync(path.join(__dirname, '../lib/provider-labels.js'), 'utf8'));
  assert.equal(catalogText(generated), catalogText(buildCatalog()));
  assert.match(generated.source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(generated.source.files.some((file) => file.path === 'agents/registry.js'));
  assert.ok(generated.source.files.some((file) => file.path === 'agents/hermes.js'));
});

test('check mode detects stale catalog without changing source or destination', (t) => {
  const { root, file } = fixture(t, [example()]);
  const outputPath = path.join(root, 'catalog.json');
  const source = fs.readFileSync(file);
  fs.writeFileSync(outputPath, 'original content\n');
  const result = syncProviderCatalog({ registryRoot: root, outputPath, check: true });
  assert.equal(result.changed, true);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'original content\n');
  assert.deepEqual(fs.readFileSync(file), source);
});

test('sync writes only its generated destination and second sync is unchanged', (t) => {
  const { root, file } = fixture(t, [example()]);
  const outputPath = path.join(root, 'generated', 'catalog.json');
  const before = fs.readFileSync(file);
  assert.equal(syncProviderCatalog({ registryRoot: root, outputPath }).changed, true);
  assert.equal(syncProviderCatalog({ registryRoot: root, outputPath }).changed, false);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(fs.readdirSync(path.dirname(outputPath)), ['catalog.json', 'provider-labels.js']);
  assert.equal(JSON.parse(fs.readFileSync(outputPath)).providers[0].id, 'fixture-agent');
});

test('browser labels expose only names and IDs with CJS and browser compatibility', () => {
  const labels = require('../lib/provider-labels.js');
  assert.deepEqual(labels.getAllProviders(), catalog.PROVIDERS.map(({ id, name }) => ({ id, name })));
  assert.equal(labels.getProvider('cursor').id, 'cursor-agent');
  assert.equal(labels.getProvider('claude').id, 'claude-code');
  assert.equal(labels.getProvider('unknown'), null);
  const vm = require('node:vm');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/provider-labels.js'), 'utf8'), context);
  assert.equal(context.OfficeProviders.getProvider('hermes').name, 'Hermes Agent');
});

test('check mode detects stale browser labels independently of JSON metadata', (t) => {
  const { root } = fixture(t, [example()]);
  const outputPath = path.join(root, 'catalog.json');
  syncProviderCatalog({ registryRoot: root, outputPath });
  const labelsPath = path.join(root, 'provider-labels.js');
  fs.writeFileSync(labelsPath, 'stale\n');
  assert.equal(syncProviderCatalog({ registryRoot: root, outputPath, check: true }).changed, true);
  assert.equal(fs.readFileSync(labelsPath, 'utf8'), 'stale\n');
});

test('fresh build observes edited registry bytes instead of cached exports', (t) => {
  const { root, file } = fixture(t, [example('first-agent')]);
  const first = buildCatalog({ registryRoot: root });
  fs.writeFileSync(file, `module.exports={getAllAgents:()=>${JSON.stringify([example('second-agent')])}};\n`);
  const second = buildCatalog({ registryRoot: root });
  assert.notEqual(first.source.sha256, second.source.sha256);
  assert.equal(second.providers[0].id, 'second-agent');
});

test('sync refuses duplicate IDs and malformed authoritative metadata', (t) => {
  for (const providers of [[example(), example()], [{ ...example(), id: '../bad' }], [{ ...example(), capabilities: { sessionEnd: 'yes' } }]]) {
    const { root } = fixture(t, providers);
    assert.throws(() => buildCatalog({ registryRoot: root }));
  }
});

test('CLI check has no install side effects and rejects unknown arguments', () => {
  const script = path.join(__dirname, '../scripts/sync-provider-catalog.cjs');
  const valid = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /In sync: \d+ provider definitions/);
  const invalid = spawnSync(process.execPath, [script, '--install'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
});
