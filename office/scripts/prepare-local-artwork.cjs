#!/usr/bin/env node
'use strict';

// Explicit local import only. Restricted upstream artwork stays out of Git.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const DEFAULT_ASSETS = path.resolve(__dirname, '../assets');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function regularPath(root, relative, allowMissing = false) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') ||
      relative.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(relative)) {
    throw new Error('Artwork paths must be safe relative paths');
  }
  const parts = relative.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT' && allowMissing) return null; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Artwork symlinks are not supported: ${relative}`);
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      throw new Error(`Artwork path is not a regular ${i < parts.length - 1 ? 'directory' : 'file'}: ${relative}`);
    }
  }
  return current;
}

function validateManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== 51) {
    throw new Error('Artwork manifest must contain the 50 original SVGs and one icon');
  }
  const destinations = new Set();
  let icons = 0;
  for (const entry of manifest.files) {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('Invalid artwork hash');
    const svg = typeof entry.source === 'string' && /^assets\/svg\/clawd-[a-z0-9-]+\.svg$/.test(entry.source);
    if (svg) {
      if (entry.destination !== 'avatars/' + path.posix.basename(entry.source)) throw new Error('Invalid artwork destination');
    } else if (entry.source === 'assets/icon.png' && entry.destination === 'icon.png') icons++;
    else throw new Error('Unexpected artwork source');
    if (destinations.has(entry.destination)) throw new Error('Duplicate artwork destination');
    destinations.add(entry.destination);
  }
  if (icons !== 1) throw new Error('Artwork manifest must contain exactly one icon');
  return manifest.files;
}

function prepareLocalArtwork({ from, assetsRoot = DEFAULT_ASSETS, manifestPath } = {}) {
  if (typeof from !== 'string' || !from.trim()) throw new Error('Specify a local original project with --from <path>');
  const sourceRoot = fs.realpathSync(path.resolve(from));
  const targetRoot = fs.realpathSync(path.resolve(assetsRoot));
  if (!fs.statSync(sourceRoot).isDirectory()) throw new Error('The original project path must be a directory');
  const manifest = JSON.parse(fs.readFileSync(manifestPath || path.join(targetRoot, 'avatars.manifest.json'), 'utf8'));
  const entries = validateManifest(manifest);
  const sourceLicense = fs.readFileSync(regularPath(sourceRoot, 'assets/LICENSE'));
  const expectedLicense = fs.readFileSync(regularPath(targetRoot, 'ORIGINAL-ARTWORK-LICENSE.txt'));
  if (!sourceLicense.equals(expectedLicense)) throw new Error('Original artwork license does not match this source snapshot');

  // Validate every source and existing destination before creating any files.
  const pending = [];
  for (const entry of entries) {
    const bytes = fs.readFileSync(regularPath(sourceRoot, entry.source));
    if (hash(bytes) !== entry.sha256) throw new Error(`Artwork hash mismatch: ${entry.source}`);
    const existing = regularPath(targetRoot, entry.destination, true);
    if (existing) {
      if (!fs.readFileSync(existing).equals(bytes)) throw new Error(`Preserved changed local artwork: ${entry.destination}`);
    } else pending.push({ ...entry, bytes });
  }
  if (!pending.length) return { imported: 0, unchanged: entries.length };

  const staging = fs.mkdtempSync(path.join(targetRoot, '.local-artwork-'));
  const created = [];
  let createdAvatars = false;
  try {
    fs.mkdirSync(path.join(staging, 'avatars'));
    for (const entry of pending) fs.writeFileSync(path.join(staging, entry.destination), entry.bytes, { flag: 'wx', mode: 0o644 });
    const avatars = path.join(targetRoot, 'avatars');
    try { fs.mkdirSync(avatars); createdAvatars = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    // Recheck the directory after staging; links publish each completed file
    // exclusively, so a concurrent process cannot have its file overwritten.
    const avatarStat = fs.lstatSync(avatars);
    if (avatarStat.isSymbolicLink() || !avatarStat.isDirectory()) throw new Error('Artwork destination must be a real directory');
    for (const entry of pending) {
      const destination = path.join(targetRoot, entry.destination);
      fs.linkSync(path.join(staging, entry.destination), destination);
      created.push(destination);
    }
    return { imported: pending.length, unchanged: entries.length - pending.length };
  } catch (error) {
    for (const destination of created.reverse()) fs.unlinkSync(destination);
    if (createdAvatars) fs.rmdirSync(path.join(targetRoot, 'avatars'));
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--from') throw new Error('Usage: node scripts/prepare-local-artwork.cjs --from <local-original-project>');
    const result = prepareLocalArtwork({ from: args[1] });
    process.stdout.write(`Local artwork ready: ${result.imported} imported, ${result.unchanged} unchanged. Artwork remains subject to its original license.\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { prepareLocalArtwork, validateManifest };
