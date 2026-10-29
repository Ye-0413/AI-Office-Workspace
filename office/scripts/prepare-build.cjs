'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');
execFileSync(process.execPath, [path.join(__dirname, 'sync-provider-catalog.cjs')], {stdio:'inherit'});
execFileSync(process.execPath, [path.join(__dirname, 'build-native.cjs'), ...process.argv.slice(2)], {stdio:'inherit'});
require('../lib/release-artwork.cjs').preflight();
