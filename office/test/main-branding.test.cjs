'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the production bootstrap without starting observers or accessing a
// real profile. Model Electron's name-derived default and cached path override.
function bootstrap({ override, cachedUserData } = {}) {
  const calls = [], paths = new Map();
  if (cachedUserData) paths.set('userData', cachedUserData);
  const appData = path.resolve('/isolated/app-support');
  const app = {
    name: 'ai-mini-office',
    setName(name) { this.name = name; calls.push(['name', name]); },
    getPath(name) {
      assert.ok(name === 'appData' || name === 'userData');
      const result = name === 'appData' ? appData : paths.get(name) || path.join(appData, this.name);
      calls.push(['getPath', name, result]);
      return result;
    },
    setPath(name, value) { paths.set(name, value); calls.push(['setPath', name, value]); },
    requestSingleInstanceLock() {
      calls.push(['lock', paths.get('userData')]);
      return false; // Existing instance: no window or observer should start.
    },
    quit() { calls.push(['quit']); },
  };
  const mainFile = path.join(__dirname, '../main.cjs');
  const sandbox = {
    __dirname: path.dirname(mainFile), console,
    process: { env: override === undefined ? {} : { MINI_OFFICE_DATA_DIR: override } },
    require(name) {
      if (name === 'electron') return { app };
      if (name === 'node:path') return path;
      if (name === 'node:fs') return { mkdirSync: (target, options) => calls.push(['mkdir', target, options.mode]) };
      if (name.startsWith('./lib/')) return {};
      throw new Error('Unexpected bootstrap dependency: ' + name);
    },
  };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8'), sandbox, { filename: mainFile });
  return { app, calls, paths, appData };
}

test('renamed app pins the legacy profile and locks the same directory', () => {
  const { app, calls, paths, appData } = bootstrap();
  const legacy = path.join(appData, 'AI Mini Office');
  assert.equal(app.name, 'AI Work Space');
  assert.equal(paths.get('userData'), legacy);
  assert.deepEqual(calls, [
    ['name', 'AI Work Space'], ['getPath', 'appData', appData],
    ['mkdir', legacy, 0o700], ['setPath', 'userData', legacy], ['lock', legacy], ['quit'],
  ]);
});

test('a new-brand profile cached by Electron cannot move storage or the lock scope', () => {
  const cachedUserData = path.resolve('/isolated/app-support/AI Work Space');
  const { paths, calls, appData } = bootstrap({ cachedUserData });
  const legacy = path.join(appData, 'AI Mini Office');
  assert.equal(paths.get('userData'), legacy);
  assert.deepEqual(calls.find(call => call[0] === 'lock'), ['lock', legacy]);
  assert.equal(calls.some(call => call[0] === 'mkdir' && call[1] === cachedUserData), false);
});

test('the existing MINI_OFFICE_DATA_DIR override still controls storage and the instance lock', () => {
  const override = path.join('isolated', 'recording profile');
  const expected = path.resolve(override);
  const { app, calls, paths } = bootstrap({ override });
  assert.equal(app.name, 'AI Work Space');
  assert.equal(paths.get('userData'), expected);
  assert.deepEqual(calls.find(call => call[0] === 'mkdir'), ['mkdir', expected, 0o700]);
  assert.deepEqual(calls.find(call => call[0] === 'lock'), ['lock', expected]);
});
