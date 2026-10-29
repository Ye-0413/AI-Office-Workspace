'use strict';
// Explicit connection actions only. Inspection is read-only; plugins report
// activity. Supported native questions accept only explicit manual replies;
// approval/permission handlers remain owned by the host.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const jsonc = require('./plugin-jsonc.cjs');
const OWNER = 'ai-mini-office-passive-plugin-v1';
const PROVIDERS = ['deepseek-harness', 'opencode', 'mimocode', 'pi', 'omp', 'openclaw'];
const ID = 'ai-mini-office', DSH_PACKAGE = '@ai-mini-office/dsh-observer';
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; return null; } }
function absolute(file) { if (typeof file !== 'string' || !path.isAbsolute(file) || /[\u0000-\u001f]/.test(file) || file.split(path.sep).includes('..')) throw new Error('Plugin path must be an explicit absolute path'); return file; }
function directory(dir, create = false) {
  const resolved = absolute(dir), aliases = process.platform === 'darwin' ? { '/tmp': '/private/tmp', '/var': '/private/var', '/etc': '/private/etc' } : {};
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part); let entry = stat(current);
    if (!entry && create) { fs.mkdirSync(current, { mode: 0o700 }); entry = stat(current); }
    if (!entry) continue;
    if (entry.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Plugin path contains an untrusted directory or symlink; preserved');
  }
}
function read(file, missing = false) {
  directory(path.dirname(file)); const entry = stat(file);
  if (!entry && missing) return null;
  if (!entry || !entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > 2 * 1024 * 1024) throw new Error('Plugin/config file cannot be safely confirmed; preserved');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try { const opened = fs.fstatSync(fd); if (opened.ino !== entry.ino || opened.dev !== entry.dev || opened.size > 2 * 1024 * 1024) throw new Error('Plugin/config identity changed'); return fs.readFileSync(fd); }
  finally { fs.closeSync(fd); }
}
function readSource(appRoot, relative) {
  absolute(appRoot);
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) throw new Error('Plugin source must remain inside its application root');
  const file = path.join(appRoot, relative);
  if (path.extname(appRoot) !== '.asar') return read(file);
  // ASAR lstat describes a virtual entry; openSync can expose an extracted
  // native file with a different inode. Verify the native archive instead,
  // while keeping the strict descriptor checks for every user-owned path.
  const native = require('original-fs');
  directory(path.dirname(appRoot));
  const archive = native.lstatSync(appRoot);
  if (!archive.isFile() || archive.isSymbolicLink() || archive.nlink !== 1) throw new Error('Packaged plugin archive cannot be safely confirmed');
  const fd = native.openSync(appRoot, native.constants.O_RDONLY | (native.constants.O_NOFOLLOW || 0));
  const unchanged = entry => entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1
    && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => entry[key] === archive[key]);
  const check = () => {
    if (!unchanged(native.fstatSync(fd)) || !unchanged(native.lstatSync(appRoot))) throw new Error('Packaged plugin archive identity changed');
  };
  try {
    check(); directory(path.dirname(file));
    const entry = stat(file);
    if (!entry || !entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 2 * 1024 * 1024) throw new Error('Packaged plugin source cannot be safely confirmed');
    const bytes = fs.readFileSync(file);
    check();
    if (!Buffer.isBuffer(bytes) || bytes.length !== entry.size || bytes.length > 2 * 1024 * 1024) throw new Error('Packaged plugin source size changed');
    return bytes;
  } finally { native.closeSync(fd); }
}
function owned(target) {
  directory(target); if (!stat(target)) return null;
  const record = JSON.parse(read(path.join(target, '.mini-office-owned.json')));
  if (record.owner !== OWNER || record.version !== 1 || !object(record.files)) throw new Error('Existing plugin is not owned by AI Work Space; preserved');
  const names = Object.keys(record.files);
  if (names.length < 2 || names.some(name => !/^[a-z0-9][a-z0-9.-]*$/i.test(name))) throw new Error('Invalid plugin ownership manifest; preserved');
  for (const name of names) if (sha(read(path.join(target, name))) !== record.files[name]) throw new Error('Plugin was changed outside AI Work Space; preserved');
  if (fs.readdirSync(target).some(name => !names.includes(name) && name !== '.mini-office-owned.json')) throw new Error('Plugin contains external files; preserved');
  return record;
}
function program(provider, options) {
  const command = provider === 'deepseek-harness' ? 'dsh' : provider;
  return (options.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, command)).find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } });
}
function profile(env) {
  const raw = env.OMP_PROFILE !== undefined ? env.OMP_PROFILE : env.PI_PROFILE;
  return typeof raw === 'string' && raw !== 'default' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(raw) && !raw.endsWith('.') ? raw : null;
}
function targets(options) {
  const { provider, homeDir, env } = options; absolute(homeDir);
  if (!PROVIDERS.includes(provider)) throw new Error('Unsupported passive plugin provider');
  if (provider === 'pi') return [{ target: path.join(absolute(env.PI_CODING_AGENT_DIR || path.join(homeDir, '.pi', 'agent')), 'extensions', ID), source: 'pi.ts', entry: 'index.ts' }];
  if (provider === 'omp') {
    const root = path.join(homeDir, env.PI_CONFIG_DIR || '.omp'), active = profile(env);
    const legacy = typeof env.PI_PROFILE === 'string' ? path.join(root, 'profiles', env.PI_PROFILE, 'agent') : null;
    const override = env.PI_CODING_AGENT_DIR && env.PI_CODING_AGENT_DIR !== legacy ? env.PI_CODING_AGENT_DIR : null;
    const agent = active ? path.join(root, 'profiles', active, 'agent') : override || path.join(root, 'agent');
    return [{ target: path.join(absolute(agent), 'extensions', ID), source: 'omp.ts', entry: 'index.ts' }];
  }
  if (provider === 'openclaw') {
    const root = absolute(env.OPENCLAW_STATE_DIR || path.join(homeDir, '.openclaw'));
    return [{ target: path.join(root, 'extensions', ID), source: 'openclaw.mjs', entry: 'index.mjs', config: absolute(env.OPENCLAW_CONFIG_PATH || path.join(root, 'openclaw.json')), kind: 'openclaw' }];
  }
  if (provider === 'deepseek-harness') {
    const root = absolute(env.DSH_HOME || path.join(homeDir, '.dsh'));
    return ['web', 'desktop'].map(name => ({ target: path.join(root, 'profiles', name, 'node_modules', '@ai-mini-office', 'dsh-observer'), source: 'deepseek-harness.mjs', entry: 'index.mjs', config: path.join(root, 'profiles', name, 'package.json'), kind: 'dsh' })).filter(target => stat(target.config));
  }
  const root = absolute(env[provider === 'opencode' ? 'OPENCODE_CONFIG_DIR' : 'MIMOCODE_CONFIG_DIR'] || path.join(env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), provider));
  const candidates = [`${provider}.jsonc`, `${provider}.json`, 'config.json'].map(name => path.join(root, name));
  const configs = candidates.flatMap(file => { const raw = read(file, true); return raw ? [{ file, raw: raw.toString('utf8'), parsed: jsonc.parse(raw.toString('utf8')).value }] : []; });
  const prior = owned(path.join(root, ID));
  let major = options.hostMajor || prior?.hostMajor;
  if (provider === 'mimocode') major = 1;
  if (!major && configs.some(c => Array.isArray(c.parsed.plugins))) major = 2;
  const key = major >= 2 ? 'plugins' : 'plugin';
  const effective = configs.find(c => Object.hasOwn(c.parsed, key));
  return [{ target: path.join(root, ID), source: major >= 2 ? 'opencode-v2.mjs' : `${provider}.mjs`, entry: 'index.mjs', config: effective?.file || configs[0]?.file || path.join(root, provider === 'mimocode' ? 'mimocode.jsonc' : 'opencode.json'), candidates, kind: 'opencode', key, hostMajor: major }];
}
function configValue(target, before, install, hadOwned) {
  const source = before?.toString('utf8') || '{}\n', parsed = jsonc.parse(source).value;
  if (target.kind === 'opencode') return jsonc.updateArray(source, target.key, target.target, install);
  if (target.kind === 'openclaw') {
    if (JSON.stringify(parsed).includes('"$include"') || JSON.stringify(parsed).includes('"include"')) throw new Error('OpenClaw config includes other files; preserved');
    if (parsed.plugins !== undefined && !object(parsed.plugins)) throw new Error('OpenClaw plugins must be an object');
    const plugins = parsed.plugins || (parsed.plugins = {});
    if (plugins.enabled === false) throw new Error('OpenClaw plugins are disabled by the user; preserved');
    if (plugins.allow !== undefined && !Array.isArray(plugins.allow)) throw new Error('OpenClaw plugin allowlist must be an array');
    if (plugins.allow?.includes(ID) && !hadOwned) throw new Error('OpenClaw same-name allowlist entry is externally owned; preserved');
    if (plugins.load !== undefined && !object(plugins.load) || plugins.entries !== undefined && !object(plugins.entries)) throw new Error('OpenClaw plugin shape is ambiguous; preserved');
    const load = plugins.load || (plugins.load = {}), entries = plugins.entries || (plugins.entries = {});
    if (load.paths !== undefined && !Array.isArray(load.paths)) throw new Error('OpenClaw plugin paths must be an array');
    const expected = { enabled: true, hooks: { allowConversationAccess: false } };
    if (Object.hasOwn(entries, ID) && (!hadOwned || JSON.stringify(entries[ID]) !== JSON.stringify(expected))) throw new Error('OpenClaw same-name registration is externally owned/changed; preserved');
    load.paths = (load.paths || []).filter(item => item !== target.target);
    if (plugins.allow) { plugins.allow = plugins.allow.filter(item => item !== ID); if (install) plugins.allow.push(ID); }
    if (install) { load.paths.push(target.target); entries[ID] = expected; } else delete entries[ID];
    return JSON.stringify(parsed, null, 2) + '\n';
  }
  if (target.kind === 'dsh') {
    if (!before || !object(parsed.dsh?.profile) || !Array.isArray(parsed.dsh.profile.bundles)) throw new Error('Initialize the DeepSeek Harness profile first; preserved');
    if (parsed.dependencies !== undefined && !object(parsed.dependencies)) throw new Error('DSH dependencies must be an object');
    const deps = parsed.dependencies || (parsed.dependencies = {}), spec = `file:${target.target}`;
    if (Object.hasOwn(deps, DSH_PACKAGE) && (!hadOwned || deps[DSH_PACKAGE] !== spec)) throw new Error('DSH same-name dependency is externally owned/changed; preserved');
    parsed.dsh.profile.bundles = parsed.dsh.profile.bundles.filter(item => item !== DSH_PACKAGE);
    if (install) { deps[DSH_PACKAGE] = spec; parsed.dsh.profile.bundles.push(DSH_PACKAGE); } else delete deps[DSH_PACKAGE];
    return JSON.stringify(parsed, null, 2) + '\n';
  }
  return null;
}
function registration(target, manifest) {
  if (!manifest) return false;
  if (!target.config) return true;
  const raw = read(target.config, true); if (!raw) return false;
  const value = jsonc.parse(raw.toString('utf8')).value;
  if (target.kind === 'opencode') return value[target.key]?.includes(target.target) === true;
  if (target.kind === 'openclaw') return value.plugins?.load?.paths?.includes(target.target) && value.plugins?.entries?.[ID]?.enabled === true;
  return value.dependencies?.[DSH_PACKAGE] === `file:${target.target}` && value.dsh?.profile?.bundles?.includes(DSH_PACKAGE);
}
function configPlans(target, before, install) {
  if (!target.config) return [];
  if (target.kind !== 'opencode') {
    const bytes = read(target.config, true);
    return [{ file: target.config, before: bytes, next: configValue(target, bytes, install, Boolean(before)) }];
  }
  // All global candidates participate. A lower-priority owned registration
  // must not resurrect after the effective higher-priority config is removed.
  return [...new Set([...target.candidates, target.config])].flatMap(file => {
    const bytes = read(file, true);
    if (!bytes && (!install || file !== target.config)) return [];
    const source = bytes?.toString('utf8') || '{}\n', value = jsonc.parse(source).value;
    let next = source;
    for (const key of ['plugin', 'plugins']) {
      if (!Array.isArray(value[key])) continue;
      if (value[key].includes(target.target) && !before) throw new Error('Same-path plugin registration has no verified owner; preserved');
      next = jsonc.updateArray(next, key, target.target, false);
    }
    if (install && file === target.config) next = jsonc.updateArray(next, target.key, target.target, true);
    return [{ file, before: bytes, next }];
  });
}
function inspectPlugin(options) {
  try {
    const list = targets(options), records = list.map(target => ({ target, manifest: owned(target.target) }));
    const installed = records.length > 0 && records.every(({ target, manifest }) => registration(target, manifest));
    const available = Boolean(program(options.provider, options)) || list.some(target => stat(path.dirname(target.config || path.dirname(target.target))));
    return { available, installed, provisioned: records.some(record => record.manifest), targetPaths: list.map(target => target.target), detail: installed ? 'Passive plugin installed; start a new host session to load it. Actual events confirm the connection.' : list.length ? 'Connect installs an owned passive activity plugin; existing plugins and approvals are preserved.' : 'Initialize the host profile before connecting.' };
  } catch (error) { return { available: Boolean(program(options.provider, options)), installed: false, detail: error.message }; }
}
function values(options, target) {
  for (const key of ['appRoot', 'dataDir', 'electronPath']) absolute(options[key]);
  const result = { [target.entry]: readSource(options.appRoot, path.join('hooks', 'passive-plugins', target.source)), 'runtime.cjs': readSource(options.appRoot, path.join('hooks', 'passive-plugins', 'runtime.cjs')), 'observer-config.json': Buffer.from(JSON.stringify({ owner: OWNER, provider: options.provider, dataDir: options.dataDir, electronPath: options.electronPath, observer: path.join(options.appRoot, 'hooks', 'observe.cjs') })) };
  if(['opencode','mimocode'].includes(options.provider)&&target.source!=='opencode-v2.mjs'){
    result['questions.cjs']=readSource(options.appRoot,path.join('hooks','passive-plugins','questions.cjs'));
    result['question-wire.cjs']=readSource(options.appRoot,path.join('lib','agent-question-wire.cjs'));
  }
  const pkg = { name: options.provider === 'deepseek-harness' ? DSH_PACKAGE : ID, version: '1.0.0', private: true, type: 'module', main: `./${target.entry}`, exports: { '.': `./${target.entry}` } };
  if (options.provider === 'openclaw') {
    pkg.openclaw = { extensions: ['./index.mjs'] };
    result['openclaw.plugin.json'] = Buffer.from(JSON.stringify({ id: ID, name: 'AI Work Space', activation: { onStartup: true }, configSchema: { type: 'object', additionalProperties: false, properties: {} } }));
  }
  if (options.provider === 'deepseek-harness') {
    pkg.dsh = { bundle: { patch: './cordis.patch.yml' } };
    result['cordis.patch.yml'] = Buffer.from('- insert:\n    - id: ai-mini-office\n      name: "@ai-mini-office/dsh-observer"\n      config: {}\n');
  }
  result['package.json'] = Buffer.from(JSON.stringify(pkg)); return result;
}
function writeConfig(file, before, next) {
  if (next === null || before?.toString('utf8') === next) return;
  directory(path.dirname(file), true);
  const current = read(file, true);
  if (sha(current || '') !== sha(before || '')) throw new Error('Host config changed while preparing; preserved');
  if (before) fs.writeFileSync(`${file}.mini-office-backup-${randomUUID()}`, before, { flag: 'wx', mode: 0o600 });
  const temp = path.join(path.dirname(file), `.mini-office-config-${randomUUID()}`);
  try { fs.writeFileSync(temp, next, { flag: 'wx', mode: 0o600 }); if (sha(read(file, true) || '') !== sha(before || '')) throw new Error('Host config changed before commit; preserved'); fs.renameSync(temp, file); }
  finally { if (stat(temp)) fs.unlinkSync(temp); }
}
async function mutatePlugin(options, install) {
  let lock, lockFd; const results = [];
  try {
    let normalized = options;
    if (install && options.provider === 'opencode' && !options.hostMajor) {
      const existing = targets(options)[0];
      const command = program('opencode', options);
      if (command) {
        // Explicit Connect only; --version never starts an AI task or service.
        const output = (options.execFileSync || execFileSync)(command, ['--version'], { env: options.env, encoding: 'utf8', timeout: 2500, maxBuffer: 16384 });
        const match = String(output).match(/(?:^|[^\w.])v?(\d+)\.\d+\.\d+/);
        if (!match) throw new Error('OpenCode version could not be confirmed; config preserved');
        normalized = { ...options, hostMajor: Number(match[1]) };
      } else if (!existing.hostMajor) throw new Error('OpenCode version is unknown; install its CLI before connecting');
    }
    const list = targets(normalized); if (!list.length) throw new Error('Initialize the host profile before connecting');
    directory(options.dataDir, true); lock = path.join(options.dataDir, `.passive-${options.provider}.lock`);
    lockFd = fs.openSync(lock, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0), 0o600);
    // Validate every target/config before making the first change.
    const prepared = list.map(target => { const before = owned(target.target); return { target, before, configs: configPlans(target, before, install), files: install ? values(options, target) : null }; });
    for (const { target, before, configs, files } of prepared) {
      if (!install && !before) { results.push({ target: target.target, installed: false }); continue; }
      directory(path.dirname(target.target), true);
      let staged, backup;
      try {
        if (install) {
          staged = path.join(path.dirname(target.target), `.mini-office-stage-${randomUUID()}`); fs.mkdirSync(staged, { mode: 0o700 });
          const manifest = { owner: OWNER, version: 1, provider: options.provider, ...(target.hostMajor ? { hostMajor: target.hostMajor } : {}), files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha(bytes)])) };
          for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(staged, name), bytes, { flag: 'wx', mode: 0o600 });
          fs.writeFileSync(path.join(staged, '.mini-office-owned.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 });
        }
        if (JSON.stringify(owned(target.target)) !== JSON.stringify(before)) throw new Error('Plugin ownership changed before commit; preserved');
        if (before) { backup = path.join(path.dirname(target.target), `.mini-office-backup-${randomUUID()}`); fs.renameSync(target.target, backup); }
        if (install) { fs.renameSync(staged, target.target); staged = null; }
        const committed = [];
        try { for (const edit of configs) { writeConfig(edit.file, edit.before, edit.next); committed.push(edit); } }
        catch (error) {
          for (const edit of committed.reverse()) {
            // Roll back only bytes still exactly equal to this operation's
            // write. Any external change is retained for explicit review.
            if (sha(read(edit.file, true) || '') !== sha(edit.next)) continue;
            if (edit.before) writeConfig(edit.file, Buffer.from(edit.next), edit.before.toString('utf8'));
            else fs.unlinkSync(edit.file);
          }
          if (install) fs.rmSync(target.target, { recursive: true });
          if (backup) { fs.renameSync(backup, target.target); backup = null; } throw error;
        }
        if (backup) { fs.rmSync(backup, { recursive: true }); backup = null; }
        results.push({ target: target.target, installed: install });
      } catch (error) {
        if (backup && stat(backup) && !stat(target.target)) { fs.renameSync(backup, target.target); backup = null; }
        throw error;
      } finally { if (staged && stat(staged)) fs.rmSync(staged, { recursive: true }); }
    }
    return { status: 'ok', provider: options.provider, installed: install, targets: results, detail: install ? inspectPlugin(normalized).detail : 'Removed only AI Work Space owned plugin files and registrations.' };
  } catch (error) { return { status: 'error', provider: options.provider, installed: inspectPlugin(options).installed, targets: results, message: error.code === 'EEXIST' ? 'Another plugin operation is in progress; retry later.' : error.message }; }
  finally { if (lockFd !== undefined) try { const identity = fs.fstatSync(lockFd); fs.closeSync(lockFd); const current = stat(lock); if (current && current.ino === identity.ino && current.dev === identity.dev && !current.isSymbolicLink()) fs.unlinkSync(lock); } catch {} }
}
module.exports = { OWNER, PROVIDERS, inspectPlugin, mutatePlugin, _files: { directory, read, writeConfig, stat, absolute } };
