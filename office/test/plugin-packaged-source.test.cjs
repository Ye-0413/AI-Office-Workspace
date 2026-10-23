'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { createRequire, wrap } = require('node:module');
const moduleFile = path.resolve(__dirname, '../lib/plugin-integrations.cjs');
const localRequire = createRequire(moduleFile);

// Electron exposes virtual ASAR metadata while openSync returns an extracted
// native file. Reproduce that mismatch without altering process-wide fs APIs.
function fixture(t, { unpacked = false, transformStat, onRead, onOpen } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-plugin-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, unpacked ? 'app-source' : 'app.asar');
  fs.writeFileSync(appRoot, 'native archive identity fixture');
  const native = fs.statSync(appRoot), payloads = new Map(), directories = new Set([appRoot]), reads = [];
  for (const relative of ['hooks/passive-plugins/opencode.mjs', 'hooks/passive-plugins/runtime.cjs', 'hooks/passive-plugins/questions.cjs', 'lib/agent-question-wire.cjs']) {
    const file = path.join(appRoot, relative), source = path.resolve(__dirname, '..', relative);
    payloads.set(file, { relative, source, size: fs.statSync(source).size });
    for (let parent = path.dirname(file); parent.startsWith(appRoot); parent = path.dirname(parent)) directories.add(parent);
  }
  const virtualFs = { ...fs,
    lstatSync(file, ...args) {
      if (directories.has(file)) {
        const entry = { ...native, isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
        return transformStat ? transformStat(path.relative(appRoot, file), entry) : entry;
      }
      const payload = payloads.get(file);
      if (payload) {
        const entry = { ...native, dev: native.dev + 1, ino: native.ino + 100000, nlink: 1, size: payload.size, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
        return transformStat ? transformStat(payload.relative, entry) : entry;
      }
      return fs.lstatSync(file, ...args);
    },
    openSync(file, ...args) { onOpen?.(file, ...args); return fs.openSync(payloads.get(file)?.source || file, ...args); },
    readFileSync(file, ...args) {
      const payload = payloads.get(file);
      if (!payload) return fs.readFileSync(file, ...args);
      reads.push(payload.relative); const bytes = fs.readFileSync(payload.source, ...args);
      return onRead?.({ appRoot, relative: payload.relative, bytes }) ?? bytes;
    }
  };
  const loaded = { exports: {} }, source = fs.readFileSync(moduleFile, 'utf8');
  const requireFixture = name => name === 'node:fs' ? virtualFs : name === 'original-fs' ? fs : localRequire(name);
  new vm.Script(wrap(source), { filename: moduleFile }).runInThisContext()(loaded.exports, requireFixture, loaded, moduleFile, path.dirname(moduleFile));
  const homeDir = path.join(root, 'home'), dataDir = path.join(root, 'data'); fs.mkdirSync(homeDir);
  const options = { provider: 'opencode', hostMajor: 1, appRoot, homeDir, dataDir, electronPath: process.execPath, env: { PATH: '' } };
  const config = path.join(homeDir, '.config/opencode/opencode.json');
  fs.mkdirSync(path.dirname(config), { recursive: true }); fs.writeFileSync(config, '{"plugin":["foreign-plugin"]}\n');
  const target = path.join(path.dirname(config), 'ai-mini-office');
  return { ...loaded.exports, root, appRoot, options, config, target, reads };
}
function preserved(f) {
  assert.equal(fs.existsSync(f.target), false);
  assert.equal(fs.readFileSync(f.config, 'utf8'), '{"plugin":["foreign-plugin"]}\n');
}
test('packaged plugin sources tolerate virtual ASAR inode metadata and install the exact question payload', async t => {
  const f = fixture(t), result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'ok', result.message); assert.equal(f.inspectPlugin(f.options).installed, true);
  for (const [installed, source] of [['questions.cjs', 'hooks/passive-plugins/questions.cjs'], ['question-wire.cjs', 'lib/agent-question-wire.cjs']]) {
    assert.deepEqual(fs.readFileSync(path.join(f.target, installed)), fs.readFileSync(path.resolve(__dirname, '..', source)));
  }
  assert.ok(f.reads.includes('hooks/passive-plugins/questions.cjs'));
  assert.throws(() => f._files.read(path.join(f.appRoot, 'hooks/passive-plugins/questions.cjs')), /identity changed/,
    'generic host/config reads still reject descriptor identity changes');
});
test('non-ASAR plugin sources retain strict descriptor identity checks', async t => {
  const f = fixture(t, { unpacked: true }), result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /identity changed/); preserved(f);
});
test('a native archive changed during a payload read cannot install or alter host config', async t => {
  let changed = false;
  const f = fixture(t, { onRead({ appRoot }) { if (!changed) { changed = true; fs.appendFileSync(appRoot, 'changed'); } } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /archive.*changed/i); preserved(f);
});
test('replacing the archive pathname during a read is rejected even when the open descriptor stays unchanged', async t => {
  let changed = false;
  const f = fixture(t, { onRead({ appRoot }) {
    if (changed) return;
    changed = true; fs.renameSync(appRoot, `${appRoot}.previous`);
    fs.writeFileSync(appRoot, 'native archive identity fixture');
  } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /archive.*changed/i); preserved(f);
});
test('archive metadata changes are rejected even when payload and archive byte counts stay unchanged', async t => {
  let changed = false;
  const f = fixture(t, { onRead({ appRoot }) {
    if (changed) return;
    changed = true; const entry = fs.statSync(appRoot);
    fs.utimesSync(appRoot, entry.atime, new Date(entry.mtimeMs + 10000));
  } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /archive.*changed/i); preserved(f);
});
test('an archive symlink remains rejected without reading payloads or altering host config', async t => {
  const f = fixture(t), outside = path.join(f.root, 'outside'); fs.renameSync(f.appRoot, outside); fs.symlinkSync(outside, f.appRoot);
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(f.reads.length, 0); preserved(f);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'native archive identity fixture');
});
test('a hard-linked native archive cannot supply plugin sources', async t => {
  const f = fixture(t); fs.linkSync(f.appRoot, path.join(f.root, 'archive-alias'));
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(f.reads.length, 0); preserved(f);
});
test('an intermediate virtual source symlink cannot bypass directory validation', async t => {
  const f = fixture(t, { transformStat(relative, entry) { return relative === 'hooks/passive-plugins' ? { ...entry, isSymbolicLink: () => true } : entry; } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(f.reads.length, 0); preserved(f);
});
test('virtual payload byte counts must match their bounded metadata', async t => {
  const f = fixture(t, { onRead: ({ bytes }) => Buffer.concat([bytes, Buffer.from('changed')]) });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /source size changed/i); preserved(f);
});
for (const unsafe of ['symlink', 'directory', 'hard-linked', 'oversized', 'negative-size', 'fractional-size']) test('a virtual payload that is ' + unsafe + ' cannot bypass source safety', async t => {
  const f = fixture(t, { transformStat(relative, entry) {
    if (relative !== 'hooks/passive-plugins/questions.cjs') return entry;
    if (unsafe === 'symlink') return { ...entry, isSymbolicLink: () => true };
    if (unsafe === 'directory') return { ...entry, isFile: () => false, isDirectory: () => true };
    if (unsafe === 'hard-linked') return { ...entry, nlink: 2 };
    return { ...entry, size: unsafe === 'oversized' ? 2 * 1024 * 1024 + 1 : unsafe === 'negative-size' ? -1 : 0.5 };
  } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(f.reads.includes('hooks/passive-plugins/questions.cjs'), false); preserved(f);
});
test('a packaged install still rejects a destination config replaced between lstat and open', async t => {
  let replaced = false;
  const replacement = '{"plugin":["external-replacement"]}\n';
  const f = fixture(t, { onOpen(file, flags) {
    if (replaced || path.basename(file) !== 'opencode.json') return;
    replaced = true; assert.ok(flags & fs.constants.O_NOFOLLOW);
    fs.renameSync(file, `${file}.previous`); fs.writeFileSync(file, replacement);
  } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /identity changed/);
  assert.equal(fs.existsSync(f.target), false); assert.equal(f.reads.length, 0);
  assert.equal(fs.readFileSync(f.config, 'utf8'), replacement);
});
test('a packaged install still refuses a destination config changed to a symlink immediately before open', async t => {
  let replaced = false;
  const f = fixture(t, { onOpen(file, flags) {
    if (replaced || path.basename(file) !== 'opencode.json') return;
    replaced = true; assert.ok(flags & fs.constants.O_NOFOLLOW);
    fs.renameSync(file, `${file}.previous`); fs.symlinkSync(`${file}.previous`, file);
  } });
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(fs.lstatSync(f.config).isSymbolicLink(), true);
  assert.equal(f.reads.length, 0); preserved(f);
});
test('a packaged install preserves a symlinked destination directory', async t => {
  const f = fixture(t), external = path.join(f.root, 'external-plugin');
  fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'foreign.txt'), 'external plugin'); fs.symlinkSync(external, f.target);
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.equal(f.reads.length, 0);
  assert.equal(fs.lstatSync(f.target).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(path.join(external, 'foreign.txt'), 'utf8'), 'external plugin');
  assert.equal(fs.readFileSync(f.config, 'utf8'), '{"plugin":["foreign-plugin"]}\n');
});
test('packaged sources do not bypass unknown OpenCode host-version protection', async t => {
  const f = fixture(t); delete f.options.hostMajor;
  const result = await f.mutatePlugin(f.options, true);
  assert.equal(result.status, 'error'); assert.match(result.message, /version is unknown/);
  assert.equal(f.reads.length, 0); preserved(f);
});
