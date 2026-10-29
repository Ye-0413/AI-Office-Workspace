'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Artwork = require('./public-artwork.js');
const restrictedManifest = require('../assets/avatars.manifest.json');
const RESTRICTED_HASHES = new Set(restrictedManifest.files.map(file => file.sha256));
const ASSET_FILES = Object.freeze([
  'assets/studio-icon.png', 'assets/office-room.jpg',
  'assets/ORIGINAL-ARTWORK-LICENSE.txt', 'assets/WORKSHOP-ARTWORK-NOTICE.md',
  'assets/avatars.manifest.json', 'assets/avatars/workshop-prompts.json',
  ...Artwork.ASSETS.map(name => 'assets/avatars/' + name),
  'assets/helpers/mini-office-flock', 'assets/scenes/generation.json',
  'assets/scenes/teahouse.jpg', 'assets/scenes/observatory.jpg',
  'assets/scenes/themes/generation.json',
  ...require('./scene-artwork.js').CATALOG.map(item => 'assets/scenes/themes/' + item.id + '.jpg'),
  'assets/scenes/rooms/generation.json',
  ...require('./room-designs.js').CATALOG.map(item => 'assets/scenes/rooms/' + item.id + '.png'),
].sort());
const allowedAssets = new Set(ASSET_FILES);
const normalize = name => name.replaceAll('\\', '/').replace(/^\/+/, '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function assertBuildPolicy(build) {
  const assets = (build.files || []).filter(file => typeof file === 'string' && file.replace(/^!/, '').startsWith('assets/')).sort();
  if (JSON.stringify(assets) !== JSON.stringify(ASSET_FILES)) throw new Error('Build assets must use the exact public artwork allowlist.');
  if (build.mac?.icon !== 'assets/studio-icon.png') throw new Error('The public application must use its original studio icon.');
  if (build.beforePack !== 'scripts/before-pack.cjs' || build.afterPack !== 'scripts/after-pack.cjs') throw new Error('Public artwork build audits must remain enabled.');
}
function auditEntries(names, read, { requireOriginal = true, restrictedHashes = RESTRICTED_HASHES } = {}) {
  const files = [...new Set(names.map(normalize))];
  let originalCharacterCount = 0, restrictedAssetCount = 0;
  const failures = [];
  for (const name of files) {
    if (name.startsWith('assets/') && !allowedAssets.has(name)) failures.push('Unapproved packaged asset: ' + name);
    if (/(^|\/)clawd-[^/]*\.(svg|png|gif|webp|jpe?g)$/i.test(name) || name === 'assets/icon.png') {
      restrictedAssetCount++; failures.push('Restricted artwork path: ' + name);
    }
    // Every file is hashed, including resources renamed or moved out of assets.
    if (restrictedHashes.has(hash(read(name)))) {
      restrictedAssetCount++; failures.push('Restricted artwork content: ' + name);
    }
    if (Artwork.ASSETS.some(asset => name === 'assets/avatars/' + asset)) originalCharacterCount++;
  }
  if (requireOriginal) for (const name of ASSET_FILES) if (!files.includes(name)) failures.push('Missing public asset: ' + name);
  if (failures.length) throw new Error(failures.join('\n'));
  return { originalCharacterCount, originalIconCount: files.includes('assets/studio-icon.png') ? 1 : 0, restrictedAssetCount, artworkFilesScanned: files.length };
}
function auditArchive(archive, asar = require('@electron/asar')) {
  const names = asar.listPackage(archive).map(normalize).filter(name => !asar.statFile(archive, name).files);
  return auditEntries(names, name => asar.extractFile(archive, name));
}
function preflight(root = path.join(__dirname, '..')) {
  assertBuildPolicy(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).build);
  return auditEntries(ASSET_FILES, name => fs.readFileSync(path.join(root, name)));
}
module.exports = Object.freeze({ ASSET_FILES, assertBuildPolicy, auditEntries, auditArchive, preflight });
