'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {isDeepStrictEqual}=require('node:util');
const {execFileSync}=require('node:child_process');
const asar=require('@electron/asar');
const appPath=path.resolve(process.argv[2]||path.join(__dirname,'../../dist-mini-office/mac-arm64/AI Mini Office.app'));
const plist=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(appPath,'Contents/Info.plist')],{encoding:'utf8'}));
if(plist.CFBundleIdentifier!=='local.ai-mini-office')throw new Error('Incorrect application identity');
const executable=path.join(appPath,'Contents/MacOS',plist.CFBundleExecutable);fs.accessSync(executable,fs.constants.X_OK);
const archive=path.join(appPath,'Contents/Resources/app.asar');
function matchesSource(name){
  const source=fs.readFileSync(path.join(__dirname,'..',name)),built=asar.extractFile(archive,name);
  if(name==='node_modules/@iarna/toml/package.json'){
    const expected=JSON.parse(source),actual=JSON.parse(built);
    // electron-builder strips only these non-runtime package metadata fields.
    for(const key of ['scripts','keywords','bugs'])delete expected[key];
    return isDeepStrictEqual(actual,expected);
  }
  if(name!=='assets/helpers/mini-office-flock')return built.equals(source);
  // App signing replaces the helper's ad-hoc signature. Compare executable
  // bytes with signatures removed from disposable copies, then verify the
  // shipped helper's own signature below.
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-native-compare-'));
  try{const copies=[source,built].map((bytes,index)=>{const file=path.join(scratch,String(index));fs.writeFileSync(file,bytes);execFileSync('/usr/bin/codesign',['--remove-signature',file]);return fs.readFileSync(file);});return copies[0].equals(copies[1]);}
  finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
const files=new Set(asar.listPackage(archive));
for(const entry of files)if(/^\/lib\/demo(?:-vignettes)?\.cjs$/.test(entry))throw new Error('Synthetic session runtime must not ship: '+entry);
const required=['main.cjs','preload.cjs','renderer/index.html','renderer/app.js','renderer/style.css','lib/scene-model.js','lib/family-model.js','lib/visitor-model.js','lib/visitor-dialogue.js','renderer/idle-visitor.js','lib/codex-tool-activity.cjs','lib/attendance-model.js','lib/animation-director.js','lib/i18n-model.js','lib/provider-events.cjs','lib/session-store.cjs','lib/codex-monitor.cjs','lib/observer-bridge.cjs','lib/settings.cjs','lib/agent-persona.js','lib/day-cycle.js','lib/observation-health.cjs','lib/avatar-performance-model.js','lib/clone-lifecycle.js','renderer/clone-motion.js','renderer/clone-motion.css','renderer/avatar-performance.js','renderer/avatar-performance.css','renderer/day-scenery.js','hooks/observe.cjs','src/claude-hook-operations.js','assets/office-room.jpg','assets/avatars/clawd-working-typing.svg','assets/avatars/clawd-mini-crabwalk.svg','assets/ORIGINAL-ARTWORK-LICENSE.txt','LICENSE','UPSTREAM-NOTICE.md','README.md','docs/goal-evidence.md'];
for(const name of required){if(!files.has('/'+name))throw new Error('Missing packaged file: '+name);if(!matchesSource(name))throw new Error('Packaged file differs from current source: '+name);}
const integrations=['lib/provider-catalog.cjs','lib/provider-catalog.json','lib/provider-labels.js','lib/upstream-adapter.cjs','lib/upstream-integrations.cjs','lib/special-integrations.cjs','lib/plugin-integrations.cjs','lib/plugin-jsonc.cjs','lib/hermes-observer.cjs','lib/native-lock.cjs','hooks/hermes-plugin/plugin.yaml','hooks/hermes-plugin/__init__.py','assets/helpers/mini-office-flock','native/mini-office-flock.c','node_modules/@iarna/toml/toml.js','docs/upstream-compatibility.md'];
for(const name of integrations){if(!files.has('/'+name))throw new Error('Missing integration runtime: '+name);if(!matchesSource(name))throw new Error('Packaged integration differs from source: '+name);}
required.push(...integrations);
const nativeHelper=path.join(appPath,'Contents/Resources/app.asar.unpacked/assets/helpers/mini-office-flock');
fs.accessSync(nativeHelper,fs.constants.X_OK);
execFileSync('/usr/bin/codesign',['--verify','--strict',nativeHelper]);
const nativeCommands=execFileSync('/usr/bin/otool',['-l',nativeHelper],{encoding:'utf8'});
const minimum=/\bminos\s+(\d+)(?:\.\d+)*/.exec(nativeCommands);
if(!minimum||Number(minimum[1])>13)throw new Error('Packaged helper does not support macOS 13');
let sourceFilesCompared=0;
for(const entry of files){const name=entry.replace(/^\//,'');if(name==='package.json')continue;const source=path.join(__dirname,'..',name);if(!fs.statSync(source).isFile())continue;if(!matchesSource(name))throw new Error('Packaged file differs from current source: '+name);sourceFilesCompared++;}
const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());const sourcePkg=require('../package.json');if(pkg.main!=='main.cjs'||pkg.name!==sourcePkg.name||pkg.version!==sourcePkg.version)throw new Error('Incorrect startup identity');
const architecture=execFileSync('/usr/bin/lipo',['-archs',executable],{encoding:'utf8'}).trim();
if(!architecture.split(/\s+/).includes('arm64'))throw new Error('Native Apple Silicon executable missing');
console.log(JSON.stringify({application:appPath,version:pkg.version,architecture,requiredFiles:required.length,packagedFiles:files.size,sourceFilesCompared,nativeHelperExecutableMatchesSource:true,nativeHelperMinimumMacOS:minimum[0].replace(/^minos\s+/,''),selfContained:true},null,2));
