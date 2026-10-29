'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Read the bundle's executable so an explicit path can also verify an older
// release, while the default follows the current product display name.
function resolvePackagedApp(input) {
  const productName = require('../package.json').build.productName;
  const appPath = path.resolve(input || path.join(__dirname, '../../dist-mini-office/mac-arm64', productName + '.app'));
  const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Contents/Info.plist')], { encoding: 'utf8' }));
  const name = plist.CFBundleExecutable;
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || path.basename(name) !== name) throw new Error('Invalid application executable');
  return { appPath, plist, executable: path.join(appPath, 'Contents/MacOS', name), archive: path.join(appPath, 'Contents/Resources/app.asar') };
}

module.exports = { resolvePackagedApp };
