#!/usr/bin/env node
'use strict';

// Read-only npm archive download: no install, lifecycle scripts, or package code.
// node office/scripts/promo/prepare-readme-tool-icons.cjs [--archive file.tgz]
// Writes only docs/media/tool-icons. All third-party paths remain unchanged;
// the added 72px neutral tile provides contrast in light and dark READMEs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.join(ROOT, 'docs/media/tool-icons');
const REGISTRY = require(path.join(ROOT, 'agents/registry.js')).getAllAgents();
const PACKAGE = '@lobehub/icons-static-svg';
const VERSION = '1.95.0';
const TARBALL = 'https://registry.npmjs.org/@lobehub/icons-static-svg/-/icons-static-svg-1.95.0.tgz';
const INTEGRITY = 'sha512-VSObF66DUVQe0EK3xbIoFcw+Fcia1+bLVFkMsQbmz0zCceMxPmoLImS5VM5SM7zL+/NarZ11/ySNfkekcomIkQ==';
const LICENSE_URL = 'https://raw.githubusercontent.com/lobehub/lobe-icons/53ead06d734cc6c003db5a87860907c4bbadfbc0/LICENSE';
const LICENSE_SHA256 = 'add9d7531d1b21646317a8958e38fc727506fa39d24bdecb44154d943c82753a';
const BRANDS = {
  'claude-code': 'claude-color', 'deepseek-harness': 'deepseek-color',
  codex: 'openai', 'copilot-cli': 'githubcopilot', 'gemini-cli': 'geminicli-color',
  'antigravity-cli': 'antigravity-color', 'cursor-agent': 'cursor',
  codebuddy: 'codebuddy-color', 'kiro-cli': 'kiro-color', 'kimi-cli': 'kimi-color',
  'qwen-code': 'qwen-color', opencode: 'opencode', mimocode: 'xiaomimimo',
  pi: 'pi', openclaw: 'openclaw-color', hermes: 'hermesagent',
  qoder: 'qoder-color', minimax: 'minimax-color',
};
const MONOGRAMS = {
  kirocrew: 'KC', zcode: 'ZC', codewhale: 'CW', omp: 'OM', reasonix: 'RX',
  qoderwork: 'QO', qwenwork: 'QW', workbuddy: 'WB', traecode: 'TC', 'grok-build': 'GB',
};
const hash = (data, algorithm = 'sha256', encoding = 'hex') =>
  crypto.createHash(algorithm).update(data).digest(encoding);
const escape = value => String(value).replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

// Parse regular files in the pinned tarball in memory. Never extract archive
// paths to disk, follow symlinks, or execute any downloaded JavaScript.
function archiveFiles(tgz) {
  const tar = zlib.gunzipSync(tgz), result = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
    const name = field(0, 100), size = Number.parseInt(field(124, 12).trim() || '0', 8);
    const prefix = field(345, 155), fullName = prefix ? `${prefix}/${name}` : name;
    const kind = field(156, 1);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid tar size');
    if ((kind === '0' || kind === '') && !fullName.split('/').includes('..') && !fullName.startsWith('/')) {
      result.set(fullName, tar.subarray(offset + 512, offset + 512 + size));
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return result;
}

function assertSafeSVG(svg) {
  if (/<!|<\?|\bon[a-z]+\s*=|javascript:|@import/i.test(svg)) throw new Error('Active SVG content rejected');
  const allowed = new Set(['svg', 'title', 'path', 'rect', 'text', 'g', 'defs', 'linearGradient',
    'radialGradient', 'stop', 'mask', 'filter', 'feBlend', 'feFlood', 'feGaussianBlur']);
  for (const match of svg.matchAll(/<\/?([\w:-]+)\b/g)) {
    if (!allowed.has(match[1])) throw new Error(`SVG element rejected: ${match[1]}`);
  }
  if (/\b(?:xlink:)?href\s*=/i.test(svg)) throw new Error('SVG links or image requests rejected');
  for (const match of svg.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!/^#[\w.-]+$/.test(match[2])) throw new Error('External SVG URL rejected');
  }
  // Namespace declarations are inert. All other protocol-like values are banned.
  const withoutNamespaces = svg.replace(/\sxmlns(?:\:[\w-]+)?="[^"]*"/g, '');
  if (/(?:https?:|data:|file:|ftp:|\/\/)/i.test(withoutNamespaces)) throw new Error('External SVG resource rejected');
}

function tile(agent, source) {
  let inside;
  if (source) {
    const svg = source.toString('utf8').trim();
    assertSafeSVG(svg);
    if (!/^<svg\b/.test(svg) || !/<\/svg>$/.test(svg)) throw new Error('Unexpected upstream SVG document');
    // Only the source viewport's size/position changes. Brand paths, gradients,
    // masks, and fill definitions are retained byte-for-byte.
    inside = svg.replace(/^<svg\b([^>]*)>/, (_, attributes) =>
      '<svg x="12" y="12" width="48" height="48"' + attributes
        .replace(/\s(?:height|width|style|xmlns)="[^"]*"/g, '') + '>');
  } else {
    inside = `<text x="36" y="37" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="-1" fill="#43534c">${MONOGRAMS[agent.id]}</text>`;
  }
  const title = source ? `${agent.name} · Lobe Icons` : `${agent.name} · neutral letter marker, not an official logo`;
  const backplate = agent.id === 'kimi-cli' ? '<rect x="12" y="12" width="48" height="48" rx="9" fill="#101419"/>' : '';
  const result = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="${escape(title)}" color="#202923"><title>${escape(title)}</title><rect x="0.5" y="0.5" width="71" height="71" rx="15" fill="#f6f7f5" stroke="#dce1db"/>${backplate}${inside}</svg>\n`;
  assertSafeSVG(result);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--archive')) throw new Error('Usage: prepare-readme-tool-icons.cjs [--archive file.tgz]');
  const known = [...Object.keys(BRANDS), ...Object.keys(MONOGRAMS)].sort();
  if (known.length !== 28 || JSON.stringify(known) !== JSON.stringify(REGISTRY.map(a => a.id).sort())) throw new Error('Icon mapping must match all 28 registry IDs');
  const tgz = args.length ? await fs.readFile(args[1]) : await download(TARBALL);
  if (`sha512-${hash(tgz, 'sha512', 'base64')}` !== INTEGRITY) throw new Error('npm archive integrity mismatch');
  const files = archiveFiles(tgz), metadata = JSON.parse(files.get('package/package.json').toString('utf8'));
  if (metadata.name !== PACKAGE || metadata.version !== VERSION || metadata.license !== 'MIT') throw new Error('Unexpected package identity or license');
  const license = await download(LICENSE_URL);
  if (hash(license) !== LICENSE_SHA256) throw new Error('Pinned upstream MIT license checksum mismatch');
  const outputs = [], icons = [];
  for (const agent of REGISTRY) {
    const slug = BRANDS[agent.id], archivePath = slug ? `package/icons/${slug}.svg` : null;
    const source = archivePath ? files.get(archivePath) : null;
    if (slug && !source) throw new Error(`Missing upstream icon: ${slug}`);
    const data = tile(agent, source), iconPath = `${agent.id}.svg`;
    outputs.push([iconPath, data]);
    icons.push({ id: agent.id, name: agent.name, icon: iconPath, width: 72, height: 72,
      sha256: hash(data), bytes: Buffer.byteLength(data), fallback: !source,
      license: source ? 'MIT' : 'AGPL-3.0-only', wrapperLicense: 'AGPL-3.0-only',
      source: source ? {
        name: 'Lobe Icons', package: PACKAGE, version: VERSION,
        url: `https://unpkg.com/${PACKAGE}@${VERSION}/icons/${slug}.svg`,
        archivePath, sha256: hash(source), licenseUrl: LICENSE_URL,
        treatment: 'Original SVG geometry preserved inside a neutral tile; monochrome currentColor set to #202923.' + (agent.id === 'kimi-cli' ? ' A dark inset backplate provides contrast for the original white Kimi mark.' : ''),
      } : {
        name: 'AI Work Space neutral letter marker', monogram: MONOGRAMS[agent.id],
        url: '../../../office/scripts/promo/prepare-readme-tool-icons.cjs',
        reason: 'No unambiguous licensed product mark selected. This letter marker is not an official logo.',
      },
    });
  }
  const manifest = { schemaVersion: 1, registry: '../../../agents/registry.js', count: icons.length,
    brandCount: icons.filter(i => !i.fallback).length, fallbackCount: icons.filter(i => i.fallback).length,
    package: { name: PACKAGE, version: VERSION, tarball: TARBALL, integrity: INTEGRITY,
      sha256: hash(tgz), license: 'MIT', licenseUrl: LICENSE_URL, licenseSHA256: LICENSE_SHA256 },
    icons };
  const readme = `# README tool icons\n\n28 self-contained, 72×72 SVG tiles matching [the provider registry](../../../agents/registry.js). Display at 36×36 pixels in the README. The light neutral tile keeps both monochrome and colored marks legible on light and dark pages.\n\n18 brand marks come from [Lobe Icons](https://github.com/lobehub/lobe-icons), pinned to \`${PACKAGE}@${VERSION}\` under the [MIT license](LICENSE-Lobe-Icons.txt). Original icon paths, gradients, masks, and colors are retained; only the display viewport and neutral tile are added. The original white Kimi mark also has a dark inset backplate for contrast. Package integrity, original source URLs, source hashes, and output hashes are recorded in [manifest.json](manifest.json).\n\nThe remaining 10 tiles are project-authored neutral letter markers, explicitly marked \`fallback: true\`. They are not official product logos. The wrappers and letter markers are available under the [project AGPL-3.0-only license](../../../LICENSE). These documentation icons do not restore or redistribute restricted upstream avatars or mascots. Brand names and marks belong to their respective owners; their use identifies supported tools and does not imply affiliation or endorsement.\n\nRebuild from the repository root:\n\n\`\`\`sh\nnode office/scripts/promo/prepare-readme-tool-icons.cjs\n\`\`\`\n\nThe script downloads the pinned public SVG archive and license, verifies checksums, and reads image data only; it never installs or executes the npm package. SVG validation rejects scripts, event handlers, foreign objects, links, external resources, and unsupported elements.\n\n中文：品牌图标来自固定版本的 MIT 许可 Lobe Icons，并保留许可证与来源记录。缺少明确品牌来源的 10 个工具使用自绘中性字母标识，不冒充官方 Logo；这些图标仅用于说明接入工具，不涉及恢复上游受限角色。\n`;
  await fs.mkdir(OUT, { recursive: true });
  for (const [name, data] of outputs) await fs.writeFile(path.join(OUT, name), data);
  await fs.writeFile(path.join(OUT, 'LICENSE-Lobe-Icons.txt'), license);
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(OUT, 'README.md'), readme);
  console.log(JSON.stringify({ output: 'docs/media/tool-icons', total: icons.length,
    licensedBrandMarks: manifest.brandCount, neutralLetterMarkers: manifest.fallbackCount,
    bytes: outputs.reduce((sum, [, data]) => sum + Buffer.byteLength(data), 0),
    archiveIntegrityVerified: true, licenseIntegrityVerified: true, safeSVGValidationPassed: true }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
