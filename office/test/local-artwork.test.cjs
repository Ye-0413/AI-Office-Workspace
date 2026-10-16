'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { prepareLocalArtwork, validateManifest } = require('../scripts/prepare-local-artwork.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-office-local-art-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'original');
  const assets = path.join(root, 'local-assets');
  fs.mkdirSync(path.join(source, 'assets/svg'), { recursive: true });
  fs.mkdirSync(assets);
  const license = 'Local fixture artwork restrictions\n';
  fs.writeFileSync(path.join(source, 'assets/LICENSE'), license);
  fs.writeFileSync(path.join(assets, 'ORIGINAL-ARTWORK-LICENSE.txt'), license);
  const files = [];
  for (let index = 0; index < 50; index++) {
    const filename = `clawd-fixture-${index}.svg`;
    const bytes = `<svg><!-- fixture ${index} --></svg>`;
    fs.writeFileSync(path.join(source, 'assets/svg', filename), bytes);
    files.push({ source: 'assets/svg/' + filename, destination: 'avatars/' + filename, sha256: hash(bytes) });
  }
  fs.writeFileSync(path.join(source, 'assets/icon.png'), 'fixture icon');
  files.push({ source: 'assets/icon.png', destination: 'icon.png', sha256: hash('fixture icon') });
  const manifest = { version: 1, files };
  const manifestPath = path.join(assets, 'avatars.manifest.json');
  function saveManifest() { fs.writeFileSync(manifestPath, JSON.stringify(manifest)); }
  saveManifest();
  return { source, assets, manifest, saveManifest, run: () => prepareLocalArtwork({ from: source, assetsRoot: assets }) };
}

test('explicit local artwork import verifies all files and a second run changes nothing', t => {
  const f = fixture(t);
  assert.deepEqual(f.run(), { imported: 51, unchanged: 0 });
  const file = path.join(f.assets, f.manifest.files[0].destination);
  const first = fs.statSync(file);
  assert.deepEqual(f.run(), { imported: 0, unchanged: 51 });
  assert.equal(fs.statSync(file).mtimeMs, first.mtimeMs);
  assert.equal(fs.readdirSync(path.join(f.assets, 'avatars')).length, 50);
  assert.deepEqual(fs.readdirSync(f.assets).sort(), ['ORIGINAL-ARTWORK-LICENSE.txt', 'avatars', 'avatars.manifest.json', 'icon.png']);
});

test('a missing or mismatched last source leaves every destination untouched', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, 'assets/icon.png'), 'changed icon');
  assert.throws(f.run, /hash mismatch/);
  assert.equal(fs.existsSync(path.join(f.assets, 'avatars')), false);
  fs.unlinkSync(path.join(f.source, 'assets/icon.png'));
  assert.throws(f.run, { code: 'ENOENT' });
  assert.equal(fs.existsSync(path.join(f.assets, 'avatars')), false);
});

test('local modified artwork is preserved and other missing artwork is not partially installed', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.assets, 'avatars'));
  const file = path.join(f.assets, f.manifest.files[20].destination);
  fs.writeFileSync(file, 'user artwork');
  assert.throws(f.run, /Preserved changed local artwork/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'user artwork');
  assert.equal(fs.readdirSync(path.join(f.assets, 'avatars')).length, 1);
  assert.equal(fs.existsSync(path.join(f.assets, 'icon.png')), false);
});

test('manifest traversal, duplicate destinations, unexpected files and missing icon are rejected', t => {
  const f = fixture(t);
  for (const patch of [
    { source: '../secret.svg' },
    { destination: '../outside.svg' },
    { source: 'assets/svg/clawd-fixture-1.svg', destination: 'avatars/clawd-fixture-1.svg' },
    { sha256: 'invalid' },
  ]) {
    const manifest = structuredClone(f.manifest);
    Object.assign(manifest.files[0], patch);
    assert.throws(() => validateManifest(manifest));
  }
  assert.throws(() => validateManifest({ version: 1, files: f.manifest.files.slice(0, 50) }));
  const missingIcon = structuredClone(f.manifest);
  missingIcon.files[50] = { ...missingIcon.files[0] };
  assert.throws(() => validateManifest(missingIcon));
  assert.equal(fs.existsSync(path.join(f.assets, 'avatars')), false);
});

test('source and destination directory symlinks are rejected without following them', t => {
  const f = fixture(t);
  const svg = path.join(f.source, 'assets/svg');
  fs.renameSync(svg, svg + '-real');
  fs.symlinkSync(svg + '-real', svg, 'dir');
  assert.throws(f.run, /symlinks/);
  fs.unlinkSync(svg); fs.renameSync(svg + '-real', svg);
  fs.symlinkSync(svg, path.join(f.assets, 'avatars'), 'dir');
  assert.throws(f.run, /symlinks/);
  assert.equal(fs.existsSync(path.join(f.assets, 'icon.png')), false);
});

test('the original artwork license must match before any import', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.source, 'assets/LICENSE'), 'different restrictions');
  assert.throws(f.run, /license does not match/);
  assert.equal(fs.existsSync(path.join(f.assets, 'avatars')), false);
});

test('CLI requires an explicit source and never fetches artwork implicitly', () => {
  const script = path.join(__dirname, '../scripts/prepare-local-artwork.cjs');
  for (const args of [[], ['--from'], ['--download'], ['--from', '.', '--force']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
  assert.throws(() => prepareLocalArtwork(), /--from/);
});
