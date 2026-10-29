'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const Artwork = require('../lib/public-artwork.js');
const Policy = require('../lib/release-artwork.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('public build uses exact original artwork paths and retains scoped upstream notices', () => {
  const pkg = require('../package.json');
  assert.doesNotThrow(() => Policy.assertBuildPolicy(pkg.build));
  for (const bad of ['assets/**/*','assets/avatars/*','assets/icon.png','assets/scenes/rooms/renamed.svg']) {
    assert.throws(() => Policy.assertBuildPolicy({ ...pkg.build, files: [...pkg.build.files, bad] }), /exact public artwork allowlist/);
  }
  assert.equal(Policy.ASSET_FILES.filter(name => name.startsWith('assets/avatars/') && name.endsWith('.png')).length, 5);
  assert.ok(Policy.ASSET_FILES.includes('assets/ORIGINAL-ARTWORK-LICENSE.txt'));
  assert.ok(Policy.ASSET_FILES.includes('assets/WORKSHOP-ARTWORK-NOTICE.md'));
  assert.ok(!Policy.ASSET_FILES.includes('assets/icon.png'));
  const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
  const boundary = html.indexOf('src="../lib/public-artwork.js"');
  assert.ok(boundary > 0);
  for (const script of ['avatar-performance.js','idle-visitor.js','app.js']) assert.ok(html.indexOf('src="'+script+'"') > boundary, script + ' loads after the mandatory public boundary');
  assert.deepEqual(require('../lib/agent-appearance.js').catalog.map(shape => shape.asset).sort(), [...Artwork.ASSETS].sort());
});

test('public resource resolution rejects legacy, traversal, renamed and remote assets without changing real metadata', () => {
  const record = Object.freeze({ id: 'ink', renderer: 'creature', asset: 'clawd-static-base.svg', variantIndex: 3, appearanceKey: 'ink:3', familyId: 'actual-root' });
  const clean = Artwork.design(record);
  assert.equal(clean.asset, 'workshop-ink.png'); assert.equal(clean.renderer, 'creature');
  assert.equal(clean.familyId, record.familyId); assert.equal(clean.appearanceKey, record.appearanceKey);
  for (const name of ['clawd-static-base.svg','../icon.png','https://example.test/art.png','renamed.svg',null]) assert.equal(Artwork.asset(name), 'workshop-folio.png');
  assert.equal(Artwork.design(null), Artwork.DEFAULT);
  assert.equal(Artwork.design({ id: 'clawd', asset: 'clawd-static-base.svg' }), Artwork.DEFAULT);
  const valid = require('../lib/agent-appearance.js').catalog[1];
  assert.equal(Artwork.design(valid), valid, 'trusted live descriptors keep object identity');
});

test('archive audit rejects restricted content even after moving and renaming outside assets', () => {
  const bytes = Buffer.from('restricted fixture artwork'), restrictedHashes = new Set([hash(bytes)]);
  assert.throws(() => Policy.auditEntries(['docs/ordinary-image.png'], () => bytes, { requireOriginal: false, restrictedHashes }), /Restricted artwork content: docs\/ordinary-image.png/);
  assert.throws(() => Policy.auditEntries(['assets/avatars/clawd-renamed.svg'], () => Buffer.from('other'), { requireOriginal: false, restrictedHashes }), /Restricted artwork path/);
  assert.throws(() => Policy.auditEntries(['assets/avatars/workshop-extra.png'], () => Buffer.from('other'), { requireOriginal: false, restrictedHashes }), /Unapproved packaged asset/);
  const report = Policy.auditEntries(Policy.ASSET_FILES, () => Buffer.from('authored fixture'), { restrictedHashes });
  assert.equal(report.originalCharacterCount, 5); assert.equal(report.originalIconCount, 1); assert.equal(report.restrictedAssetCount, 0);
  assert.throws(() => Policy.auditEntries(Policy.ASSET_FILES.slice(1), () => Buffer.from('authored fixture'), { restrictedHashes }), /Missing public asset/);
});

test('actual ASAR traversal finds an upstream file renamed into documentation', async t => {
  const asar = require('@electron/asar'), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'office-artwork-archive-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const source = path.join(scratch, 'source'); fs.mkdirSync(path.join(source, 'docs'), { recursive: true });
  // Local pixels are optional. The test uses the published manifest's digest
  // and only reads an already restored file, never restores or exports it.
  const item = require('../assets/avatars.manifest.json').files.find(file => fs.existsSync(path.join(__dirname, '../assets', file.destination)));
  if (!item) return t.skip('No locally authorized upstream reference artwork is present.');
  fs.copyFileSync(path.join(__dirname, '../assets', item.destination), path.join(source, 'docs', 'innocent-image.dat'));
  const archive = path.join(scratch, 'fixture.asar'); await asar.createPackage(source, archive);
  assert.throws(() => Policy.auditArchive(archive, asar), /Restricted artwork content: docs\/innocent-image.dat/);
});

test('public performance adapter selects a creature for missing or legacy designs', () => {
  const created = [], controller = { update() {}, setDesign(value) { created.push(value); return true; }, destroy() {} };
  const context = vm.createContext({ OfficePublicArtwork: Artwork, OfficeAvatarPerformanceModel: { createClockRegistry: () => ({}) }, OfficeCreaturePerformance: { create: options => { created.push(options.design); return controller; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../renderer/avatar-performance.js'), 'utf8'), context);
  const handle = context.OfficeAvatarPerformance.create({ session: { id: 'actual', parentId: 'actual-parent' } });
  assert.equal(created[0], Artwork.DEFAULT);
  handle.setDesign({ id: 'ink', asset: '../restricted.svg' });
  assert.equal(created[1].asset, 'workshop-ink.png');
  handle.setDesign(null); assert.equal(created[2], Artwork.DEFAULT);
});
