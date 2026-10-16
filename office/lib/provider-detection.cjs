'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { normalizeProviderId } = require('./provider-catalog.cjs');
const COMMANDS = Object.freeze({ codex: ['codex'], 'claude-code': ['claude'], 'cursor-agent': ['cursor', 'agent'], 'gemini-cli': ['gemini'], 'antigravity-cli': ['agy'] });
const CONFIGS = Object.freeze({ 'gemini-cli': ['.gemini', 'settings.json'], 'antigravity-cli': ['.gemini', 'config', 'hooks.json'] });
function executable(file) {
  try { if (!fs.statSync(file).isFile()) return false; fs.accessSync(file, fs.constants.X_OK); return true; } catch { return false; }
}
function regularConfig(file, platform) {
  let current = path.parse(file).root;
  try {
    for (const part of path.dirname(file).slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part); const entry = fs.lstatSync(current);
      const aliases = platform === 'darwin' ? { '/var': '/private/var', '/tmp': '/private/tmp', '/etc': '/private/etc' } : {};
      if (entry.isSymbolicLink() && aliases[current] && fs.realpathSync(current) === aliases[current]) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) return false;
    }
    const entry = fs.lstatSync(file); return entry.isFile() && !entry.isSymbolicLink();
  } catch { return false; }
}

// Small, read-only corrections to bridge detection. Never run a CLI, inspect its
// output, read configuration contents, or recursively scan version directories.
function enrichConnections(connections, { homeDir = os.homedir(), env = process.env, platform = process.platform } = {}) {
  if (!Array.isArray(connections) || typeof homeDir !== 'string' || !path.isAbsolute(homeDir) || !env || typeof env !== 'object' || typeof platform !== 'string') throw new TypeError('Provider detection requires connections and an absolute home');
  const inherited = typeof env.PATH === 'string' ? env.PATH.split(platform === 'win32' ? ';' : path.delimiter).filter(directory => path.isAbsolute(directory) && !/[\u0000-\u001f\u007f]/.test(directory)) : [];
  const directories = [...new Set([...inherited, path.join(homeDir, '.local', 'bin'), path.join(homeDir, 'bin'), ...(platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : platform === 'win32' ? [] : ['/usr/local/bin'])])];
  return connections.map(connection => {
    if (!connection || typeof connection !== 'object') return connection;
    const provider = normalizeProviderId(connection.provider), names = COMMANDS[provider];
    if (!names) return { ...connection };
    const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
    const cli = directories.some(directory => names.some(name => suffixes.some(suffix => executable(path.join(directory, name + suffix)))));
    const parts = CONFIGS[provider], config = parts && regularConfig(path.join(homeDir, ...parts), platform);
    if (parts) return { ...connection, available: Boolean(cli || config), detectionDetail: cli ? 'Detected the provider’s executable CLI.' : config ? 'Detected the provider’s own regular configuration file.' : 'No provider-specific CLI or configuration file detected; a shared parent directory is insufficient.' };
    return { ...connection, available: connection.available === true || cli,
      detectionDetail: cli ? 'Detected an executable in PATH or a standard local CLI directory.' : connection.available === true ? 'Preserved existing CLI or application detection.' : 'No executable found in PATH or standard local CLI directories.' };
  });
}
module.exports = { enrichConnections };
