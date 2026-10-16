'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {withNativeLock} = require('../lib/native-lock.cjs');
const {mutateSpecial} = require('../lib/special-integrations.cjs');

test('native KiroCrew gateway, directory and store locks exclude another writer without changing lock content', {skip:process.platform!=='darwin'}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-native-lock-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'home','.kiro','crew');
  fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'hooks.json');
  const original=JSON.stringify({hooks:[{id:'foreign',event:'Stop',command:'keep me'}]});
  fs.writeFileSync(file,original,{mode:0o600});
  const spec={directory,gateway:path.join(directory,'gateway.lock'),store:file+'.lock'};
  fs.writeFileSync(spec.gateway,'native owner content');
  const options={provider:'kirocrew',homeDir:path.join(root,'home'),dataDir:path.join(root,'data'),appRoot:path.resolve(__dirname,'..'),electronPath:process.execPath,env:{},withNativeLock};
  await withNativeLock(spec,async()=>{
    await assert.rejects(withNativeLock(spec,()=>assert.fail('a busy lock must not execute the writer')),/正在使用/);
    const blocked=await mutateSpecial(options,true);
    assert.equal(blocked.status,'error');
    assert.equal(fs.readFileSync(file,'utf8'),original);
  });
  assert.equal(fs.readFileSync(spec.gateway,'utf8'),'native owner content');
  const installed=await mutateSpecial(options,true);
  assert.equal(installed.status,'ok',installed.message);
  assert.equal(JSON.parse(fs.readFileSync(file)).hooks.length,5);
  const removed=await mutateSpecial(options,false);
  assert.equal(removed.status,'ok',removed.message);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),JSON.parse(original));
});

test('native lock helper refuses linked gateway files and never enters the write operation', {skip:process.platform!=='darwin'}, async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-linked-lock-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const outside=path.join(directory,'unrelated');
  fs.writeFileSync(outside,'keep');
  const gateway=path.join(directory,'gateway.lock');fs.symlinkSync(outside,gateway);
  await assert.rejects(withNativeLock({directory,gateway,store:path.join(directory,'hooks.json.lock')},()=>assert.fail('linked lock must not enter the writer')),/无法取得/);
  assert.equal(fs.readFileSync(outside,'utf8'),'keep');
});

test('a live native gateway PID blocks mutation even without an advisory lock', {skip:process.platform!=='darwin'}, async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mini-office-live-gateway-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const gateway=path.join(directory,'gateway.lock');
  fs.writeFileSync(gateway,String(process.pid)+'\n');
  await assert.rejects(withNativeLock({directory,gateway,store:path.join(directory,'hooks.json.lock')},()=>assert.fail('an active gateway must retain ownership')),/正在使用/);
  assert.equal(fs.readFileSync(gateway,'utf8'),String(process.pid)+'\n');
});
