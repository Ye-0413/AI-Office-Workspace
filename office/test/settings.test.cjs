'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createSettings}=require('../lib/settings.cjs');
test('preferences persist only recognized presentation settings',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const s=createSettings(dir);assert.equal(s.get().rain,false);s.set({rain:true,selectedProject:'/Demo/office',displayId:23});const restored=createSettings(dir);assert.equal(restored.get().rain,true);assert.equal(restored.get().displayId,23);assert.throws(()=>s.set({approvalMode:'always'}));assert.throws(()=>s.set({night:'yes'}));assert.throws(()=>s.set({selectedProject:'x'.repeat(3000)}));const exported=s.get();exported.rain=false;assert.equal(s.get().rain,true);});
test('agent size migrates to 100%, persists valid bounds and rejects invalid values atomically',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-scale-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({rain:true,language:'en'}));
  const settings=createSettings(dir);assert.equal(settings.get().agentScale,1);assert.equal(settings.get().rain,true);
  for(const agentScale of [.65,.85,1,1.15,1.35]){settings.set({agentScale});assert.equal(createSettings(dir).get().agentScale,agentScale);}
  for(const agentScale of [0,.64,1.36,NaN,Infinity,'1',null,{},true])assert.throws(()=>settings.set({agentScale}),/scale/);
  assert.equal(settings.get().agentScale,1.35);assert.equal(settings.get().language,'en');
});
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

test('existing preferences gain the workshop without rewriting the file and venue choices persist independently', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-venue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'settings.json');
  const original = JSON.stringify({ rain: true, language: 'en', agentScale: 1.35, sceneTime: 'sunset', nameStyle: 'harbour' });
  fs.writeFileSync(filename, original);
  const settings = createSettings(dir);
  assert.equal(settings.get().sceneVenue, 'workshop');
  assert.equal(fs.readFileSync(filename, 'utf8'), original, 'migration remains read-only');
  for (const sceneVenue of ['teahouse', 'observatory', 'workshop']) {
    settings.set({ sceneVenue });
    const restored = createSettings(dir).get();
    assert.equal(restored.sceneVenue, sceneVenue);
    assert.equal(restored.agentScale, 1.35);
    assert.equal(restored.sceneTime, 'sunset');
    assert.equal(restored.language, 'en');
    assert.equal(restored.nameStyle, 'harbour');
    assert.equal(restored.rain, true);
  }
});

test('invalid venue patches leave both in-memory preferences and the saved file unchanged', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-venue-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const settings = createSettings(dir);
  settings.set({ sceneVenue: 'teahouse', rain: true });
  const filename = path.join(dir, 'settings.json');
  const original = fs.readFileSync(filename, 'utf8');
  for (const sceneVenue of ['Workshop', 'unknown', '../assets/other.jpg', '', null, true, 1, {}, ['teahouse']]) {
    assert.throws(() => settings.set({ sceneVenue, rain: false }), /scene venue/);
    assert.equal(settings.get().sceneVenue, 'teahouse');
    assert.equal(settings.get().rain, true);
    assert.equal(fs.readFileSync(filename, 'utf8'), original);
  }
});

test('seasonal scenes and weather migrate read-only, persist, and reject invalid compound patches atomically', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-settings-festivals-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'settings.json'),original=JSON.stringify({rain:true,language:'en'});fs.writeFileSync(file,original);
  const settings=createSettings(dir);assert.equal(settings.get().sceneTheme,'auto');assert.equal(settings.get().sceneWeather,'rain');assert.equal(fs.readFileSync(file,'utf8'),original);
  const festivals=require('../lib/festival-model.js');
  for(const sceneTheme of festivals.THEME_IDS){settings.set({sceneTheme});assert.equal(createSettings(dir).get().sceneTheme,sceneTheme);}
  for(const sceneWeather of festivals.WEATHER_MODES){settings.set({sceneWeather});assert.equal(createSettings(dir).get().sceneWeather,sceneWeather);}
  const before=fs.readFileSync(file,'utf8');
  for(const invalid of ['',null,true,'../other.svg',{},['halloween']]){
    assert.throws(()=>settings.set({sceneTheme:invalid,sceneWeather:'snow'}),/scene theme/);assert.equal(fs.readFileSync(file,'utf8'),before);
    assert.throws(()=>settings.set({sceneWeather:invalid,sceneTheme:'christmas'}),/scene weather/);assert.equal(fs.readFileSync(file,'utf8'),before);
  }
});
