'use strict';
const path = require('node:path');
module.exports = context => {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents/Resources')
    : path.join(context.appOutDir, 'resources');
  const report = require('../lib/release-artwork.cjs').auditArchive(path.join(resources, 'app.asar'));
  console.log('Public artwork audit: ' + JSON.stringify(report));
};
