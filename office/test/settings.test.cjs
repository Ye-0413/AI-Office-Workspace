'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSettings}=require('../lib/settings.cjs');
test('preferences persist only recognized presentation settings',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const s=createSettings(dir);assert.equal(s.get().rain,false);s.set({rain:true,selectedProject:'/Demo/office',displayId:23});const restored=createSettings(dir);assert.equal(restored.get().rain,true);assert.equal(restored.get().displayId,23);assert.throws(()=>s.set({approvalMode:'always'}));assert.throws(()=>s.set({night:'yes'}));assert.throws(()=>s.set({selectedProject:'x'.repeat(3000)}));const exported=s.get();exported.rain=false;assert.equal(s.get().rain,true);});
test('invalid existing configuration is preserved, symbolic links cannot be written through',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'settings.json');fs.writeFileSync(file,'invalid JSON');assert.equal(createSettings(dir).get().rain,false);assert.equal(fs.readFileSync(file,'utf8'),'invalid JSON');fs.unlinkSync(file);const foreign=path.join(dir,'foreign');fs.writeFileSync(foreign,'leave this alone');fs.symlinkSync(foreign,file);const s=createSettings(dir);assert.throws(()=>s.set({rain:true}),/symbolic/);assert.equal(fs.readFileSync(foreign,'utf8'),'leave this alone');});
test('language changes persist and existing preferences migrate to Chinese by default',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-language-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({night:true}));const s=createSettings(dir);assert.equal(s.get().night,true);assert.equal(s.get().language,'zh');s.set({language:'en'});assert.equal(createSettings(dir).get().language,'en');assert.throws(()=>s.set({language:'fr'}),/language/);});
test('existing preferences gain an optional idle visitor and persist an opt-out',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-visitor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({rain:true,language:'en'}));const settings=createSettings(dir);assert.equal(settings.get().idleVisitor,true);assert.equal(settings.get().rain,true);settings.set({idleVisitor:false});assert.equal(createSettings(dir).get().idleVisitor,false);assert.equal(createSettings(dir).get().language,'en');assert.throws(()=>settings.set({idleVisitor:'yes'}),/idleVisitor/);});

test('Hong Kong time is automatic by default and each preview persists', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-day-cycle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = createSettings(dir);
  assert.equal(settings.get().sceneTime, 'auto');
  for (const sceneTime of ['dawn', 'morning', 'afternoon', 'sunset', 'night', 'auto']) {
    settings.set({ sceneTime });
    assert.equal(createSettings(dir).get().sceneTime, sceneTime);
  }
  for (const sceneTime of ['midnight', 'Europe/London', '', null, true, 12, {}]) assert.throws(() => settings.set({ sceneTime }), /scene time/);
  assert.equal(settings.get().sceneTime, 'auto', 'an invalid patch leaves the current presentation intact');
});

test('legacy evening light migrates without overriding an explicit time mode or rewriting saved preferences', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-day-migrate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'settings.json');
  for (const [saved, expected] of [
    [{ night: true, rain: true, language: 'en' }, 'night'],
    [{ night: false, rain: true }, 'auto'],
    [{ night: true, sceneTime: 'auto' }, 'auto'],
    [{ night: true, sceneTime: 'morning' }, 'morning']
  ]) {
    const original = JSON.stringify(saved);
    fs.writeFileSync(filename, original);
    const settings = createSettings(dir);
    assert.equal(settings.get().sceneTime, expected);
    assert.equal(settings.get().night, saved.night);
    assert.equal(fs.readFileSync(filename, 'utf8'), original, 'migration is read-only until a preference is changed');
    settings.set({ lowPower: true });
    assert.equal(createSettings(dir).get().sceneTime, expected);
    assert.equal(createSettings(dir).get().lowPower, true);
    if (saved.rain) assert.equal(settings.get().rain, true);
    if (saved.language) assert.equal(settings.get().language, saved.language);
  }
});

test('harbour display names persist without changing the original session identity', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-names-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = createSettings(dir);
  assert.equal(settings.get().nameStyle, 'classic');
  settings.set({ nameStyle: 'harbour' });
  assert.equal(createSettings(dir).get().nameStyle, 'harbour');
  for (const nameStyle of ['custom', '', true, null, {}]) assert.throws(() => settings.set({nameStyle}), /name style/);
  assert.equal(settings.get().nameStyle, 'harbour');
});
