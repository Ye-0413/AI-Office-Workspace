'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Artwork = require('./public-artwork.js');
// Content fingerprints prevent relabeled upstream artwork from entering a release.
const RESTRICTED_HASHES = new Set(require('./restricted-artwork-hashes.json'));
const pixelAtlases = Artwork.ASSETS.map(name => 'assets/avatars/' + name);
const paintedAtlases = Artwork.PAINTED_ASSETS.map(name => 'assets/avatars/' + name);

function stripPaths(directory, { strips }) {
  return Object.entries(strips).flatMap(([species, entries]) =>
    Object.keys(entries).map(activity => 'assets/avatars/' + directory + '/' + species + '/' + activity + '.png'));
}

const ASSET_FILES = Object.freeze([
  'assets/studio-icon.png', 'assets/office-room.jpg',
  'assets/ORIGINAL-ARTWORK-LICENSE.txt', 'assets/WORKSHOP-ARTWORK-NOTICE.md',
  'assets/avatars/workshop-prompts.json',
  ...pixelAtlases, ...paintedAtlases,
  ...Artwork.IDS.map(id => 'assets/avatars/pixel-emotes-' + id + '.png'),
  // Registered keyframe strips, one exact path per species/activity.
  ...stripPaths('frames', require('../renderer/creature-frame-manifest.js')),
  ...stripPaths('painted-frames', require('../renderer/painted-creature-frame-manifest.js')),
  'assets/helpers/mini-office-flock', 'assets/scenes/generation.json',
  'assets/scenes/teahouse.jpg', 'assets/scenes/observatory.jpg',
  'assets/scenes/themes/generation.json',
  ...require('./scene-artwork.js').CATALOG.map(item => 'assets/scenes/themes/' + item.id + '.jpg'),
  'assets/scenes/rooms/generation.json',
  ...require('./room-designs.js').CATALOG.map(item => 'assets/scenes/rooms/' + item.id + '.png'),
  // Original pixel decorations earned through the unlock ledger.
  ...require('./progression-model.js').DECORATIONS.map(item => 'assets/decorations/' + item.id + '.svg'),
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
  let originalCharacterCount = 0, paintedCharacterCount = 0, restrictedAssetCount = 0;
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
    if (pixelAtlases.includes(name)) originalCharacterCount++;
    if (paintedAtlases.includes(name)) paintedCharacterCount++;
  }
  if (requireOriginal) for (const name of ASSET_FILES) if (!files.includes(name)) failures.push('Missing public asset: ' + name);
  if (failures.length) throw new Error(failures.join('\n'));
  return { originalCharacterCount, paintedCharacterCount, originalIconCount: files.includes('assets/studio-icon.png') ? 1 : 0, restrictedAssetCount, artworkFilesScanned: files.length };
}
function auditArchive(archive, asar = require('@electron/asar'), options) {
  const names = asar.listPackage(archive).map(normalize).filter(name => !asar.statFile(archive, name).files);
  return auditEntries(names, name => asar.extractFile(archive, name), options);
}
function preflight(root = path.join(__dirname, '..')) {
  assertBuildPolicy(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).build);
  return auditEntries(ASSET_FILES, name => fs.readFileSync(path.join(root, name)));
}
module.exports = Object.freeze({ ASSET_FILES, assertBuildPolicy, auditEntries, auditArchive, preflight });
