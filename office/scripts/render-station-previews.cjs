'use strict';
// Public, original furniture glyphs, through the unchanged production controller.
// Run with Electron. Each sampled frame gets fresh finite decorative owners:
// no document clock replacement, actor movement, private draw call or room art.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict'), {createHash} = require('node:crypto');
const {pathToFileURL, fileURLToPath} = require('node:url'), {execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '../..');
const SETTINGS = Object.freeze({fps:48, frames:72, width:1000, height:720, minimumDistinctFrames:31});
const SOURCES = Object.freeze([
  'office/lib/scene-model.js', 'office/lib/scene-traffic.js', 'office/lib/walking-layout.js',
  'office/lib/social-interactions.js', 'office/renderer/station-arrival.js',
  'office/renderer/station-arrival.css', 'office/scripts/render-station-previews.cjs'
]);
const GROUPS = Object.freeze([
  Object.freeze({venue:'workshop',label:'工坊 · 到站小响应',english:'Workshop',cards:Object.freeze([
    Object.freeze({zone:'library',label:'翻开手绘笔记',program:'field-book'}),
    Object.freeze({zone:'board',label:'接上图纸线索',program:'blueprint-links'}),
    Object.freeze({zone:'desk',label:'转动电路卷轴',program:'circuit-spool'}),
    Object.freeze({zone:'bench',label:'校准小仪表',program:'bench-dial'})])}),
  Object.freeze({venue:'teahouse',label:'茶室 · 到站小响应',english:'Teahouse',cards:Object.freeze([
    Object.freeze({zone:'library',label:'展开茶笺',program:'tea-scroll'}),
    Object.freeze({zone:'board',label:'折好一张小札',program:'folded-note'}),
    Object.freeze({zone:'desk',label:'滤下一滴清茶',program:'tea-filter'}),
    Object.freeze({zone:'bench',label:'看看茶温',program:'tea-thermometer'})])}),
  Object.freeze({venue:'observatory',label:'观星室 · 到站小响应',english:'Observatory',cards:Object.freeze([
    Object.freeze({zone:'library',label:'翻阅星图',program:'star-atlas'}),
    Object.freeze({zone:'board',label:'连成一段星座',program:'constellation'}),
    Object.freeze({zone:'desk',label:'轻转浑仪',program:'armillary'}),
    Object.freeze({zone:'bench',label:'调节镜片光圈',program:'lens-iris'})])})
]);

function samplingTiming(productionProgramDurationMs) {
  const durationMs=SETTINGS.frames*1000/SETTINGS.fps;
  assert.ok(Number.isFinite(productionProgramDurationMs) && productionProgramDurationMs>0 && productionProgramDurationMs<=durationMs);
  const firstStoppedFrame=Math.ceil(productionProgramDurationMs*SETTINGS.fps/1000);
  const firstStoppedFrameMs=firstStoppedFrame*1000/SETTINGS.fps;
  return {fps:SETTINGS.fps,frames:SETTINGS.frames,durationMs,productionProgramDurationMs,
    nominalStillTailMs:durationMs-productionProgramDurationMs,firstStoppedFrame,firstStoppedFrameMs,
    encodedStillTailMs:Math.max(0,durationMs-firstStoppedFrameMs)};
}

// This function is embedded verbatim in the native page and independently
// exercised by Node contract tests. The only authored art is in the actual
// station-arrival module; this adapter supplies mounted synthetic endpoints.
function previewRuntime(config) {
  const fixtures = [], view = window, zones = {library:'reading',board:'planning',desk:'coding',bench:'testing'};
  const positions = {library:{x:19,y:44},board:{x:50,y:44},desk:{x:42,y:70},bench:{x:81,y:44}};
  const truth = actor => JSON.stringify({id:actor.id,serial:actor.serial,session:actor.session,position:actor.position,target:actor.target,html:actor.node.outerHTML});
  const check = (condition, message) => { if (!condition) throw Error(message); };
  for (const definition of config.cards) {
    const card = document.getElementById('card-'+definition.zone), world = card.querySelector('.preview-world'), layer = card.querySelector('.preview-props');
    const node = document.createElement('div'), body = document.createElement('span');
    node.className = 'preview-evidence'; body.className = 'character-body'; node.append(body); world.append(node);
    const position = {...positions[definition.zone]};
    node.style.transform = 'translate('+(position.x*12.8)+'px,'+(position.y*7.2)+'px) scale(1)';
    const id = 'public-station:'+config.venue+':'+definition.zone;
    const actor = {id,serial:1,node,body,session:{id,provider:'codex',status:'active',activity:zones[definition.zone],turnId:'original-offline-preview'},position,target:{...position,zone:definition.zone}};
    const actors = new Map([[id,actor]]);
    const context = {venue:config.venue,theme:'spring',artworkKey:'original-offline-glyphs',mode:'live',scale:1,fitting:false,hidden:false,reducedMotion:false,lowPower:false};
    fixtures.push({definition,card,world,layer,actor,actors,context,truth:truth(actor),api:null});
  }
  async function frame(elapsedMs) {
    check(Number.isFinite(elapsedMs) && elapsedMs>=0 && elapsedMs<1500, 'Invalid public preview elapsed time');
    check(!document.hidden, 'Public preview needs an actually visible document');
    check(!view.matchMedia('(prefers-reduced-motion: reduce)').matches, 'Native preview must explicitly enable normal motion');
    check(!document.querySelector('img,image,use'), 'Public glyph preview contains an external image element');
    const owned = [], reports = [];
    for (const fixture of fixtures) {
      // A finished finite owner is never rewound or resurrected. A new actual
      // controller/ledger accepts this independent offline endpoint sample.
      fixture.api?.destroy();
      check(truth(fixture.actor)===fixture.truth, 'A public cue changed its mounted actor evidence');
      const api = fixture.api = OfficeStationArrival.create({layer:fixture.layer,world:fixture.world,getActors:()=>fixture.actors,getContext:()=>fixture.context});
      const actor = fixture.actor;
      check(api.arrive({actor,actorId:actor.id,serial:actor.serial,kind:'station',zone:fixture.definition.zone,position:{...actor.position}}), 'Production station controller rejected '+fixture.definition.program);
      const active = api.state().active;
      check(active.length===1 && active[0].program===fixture.definition.program && active[0].phase==='playing', 'Wrong production furniture program');
      const prop = fixture.layer.querySelector('.station-arrival');
      check(prop && prop.dataset.ownerId===actor.id && Number(prop.dataset.ownerSerial)===actor.serial, 'Prop lost its actual fixture owner');
      const motions = prop.getAnimations({subtree:true});
      check(motions.length>=2 && motions.every(motion=>motion.effect.getTiming().iterations===1 && motion.effect.getTiming().duration===OfficeStationArrival.DURATION && prop.contains(motion.effect.target)), 'Exporter can only seek this new finite decorative owner');
      for (const motion of motions) { motion.pause(); motion.currentTime = Math.min(elapsedMs, OfficeStationArrival.DURATION); }
      owned.push(...motions);
      const anchor = active[0].anchor, zoom = 2.6;
      fixture.world.style.transform = 'translate('+(470/2-anchor.x*zoom)+'px,'+(215/2-anchor.y*zoom)+'px) scale('+zoom+')';
      reports.push({program:active[0].program,zone:fixture.definition.zone,ownerId:actor.id,serial:actor.serial,anchor,motions:motions.length});
    }
    await Promise.all(owned.map(motion=>motion.ready));
    await new Promise(resolve=>requestAnimationFrame(resolve));
    for (const fixture of fixtures) {
      check(truth(fixture.actor)===fixture.truth, 'Decorative sampling changed an actor or its identity');
      check(fixture.api.state().active.length===1, 'A slow screenshot lost its fresh finite prop owner');
      check(!fixture.actor.node.getAnimations({subtree:true}).length, 'Public exporter must not create or drive actor animations');
    }
    check(!document.querySelector('img,image,use'), 'An original prop added an image reference');
    return reports.map((report,index)=> {
      const box=fixtures[index].card.querySelector('.preview-clip').getBoundingClientRect();
      return {...report,crop:{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),height:Math.round(box.height)}};
    });
  }
  function destroy() { for (const fixture of fixtures) { fixture.api?.destroy();fixture.api=null; } }
  return Object.freeze({frame,destroy});
}

function markup(group) {
  const url = relative => pathToFileURL(path.join(repo,relative)).href;
  const scripts = SOURCES.filter(file=>file.endsWith('.js') && !file.includes('/scripts/'));
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="${url('office/renderer/station-arrival.css')}"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1000px;height:720px;overflow:hidden;background:#eee9df;color:#344f54;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{height:94px;padding:19px 25px}h1{margin:0;font-size:25px}header p{margin:7px 0;font-size:13px;color:#6b7770}.grid{display:grid;grid-template-columns:470px 470px;gap:20px;padding:0 20px}.card{height:270px;border:1px solid #c8bdab;border-radius:10px;background:#e5dbc8;overflow:hidden}.preview-clip{position:relative;width:470px;height:215px;overflow:hidden;background:radial-gradient(ellipse at center,#f0e8d6,#dbd1be)}.preview-world{position:absolute;left:0;top:0;width:1280px;height:720px;transform-origin:0 0}.preview-props{position:absolute;inset:0}.preview-evidence{position:absolute;left:0;top:0;width:0;height:0;opacity:1;visibility:visible}.preview-evidence .character-body{position:absolute;left:-6px;top:-16px;width:12px;height:16px;background:transparent}.title{height:55px;padding:7px 15px;border-top:1px solid #c8bdab;background:#f4eedf;font-size:16px}.title small{display:block;margin-top:3px;color:#6b7770;font-size:11px}footer{position:absolute;bottom:14px;left:20px;right:20px;text-align:center;font-size:12px;color:#6b7770}
  </style></head><body><header><h1>${group.label}</h1><p>${group.english} · 原创机关 · 独立到站道具采样</p></header><main class="grid">${group.cards.map(card=>`<section class="card" id="card-${card.zone}"><div class="preview-clip"><div class="preview-world"><div class="preview-props"></div></div></div><div class="title">${card.label}<small>${card.program}</small></div></section>`).join('')}</main><footer>离线机关图鉴 · 真实到站模块／原创 SVG · 不演示房间导航或身体接触</footer>${scripts.map(file=>`<script src="${url(file)}"></script>`).join('')}<script>window.preview=(${previewRuntime.toString()})(${JSON.stringify(group)});</script></body></html>`;
}

async function main() {
  const {app,BrowserWindow} = require('electron');
  const out = path.join(repo,'docs/animations/stations'), scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-public-stations-'));
  app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
  let win, blocked=0;const errors=[], assets=[];
  const sha = value => createHash('sha256').update(value).digest('hex');
  const guard=setTimeout(()=>{console.error('Public station export timed out');app.exit(1);},180000);
  try {
    execFileSync('ffmpeg',['-version'],{stdio:'ignore'});
    await app.whenReady();fs.mkdirSync(out,{recursive:true});
    win=new BrowserWindow({width:SETTINGS.width,height:SETTINGS.height,useContentSize:true,enableLargerThanScreen:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
    let allowed=new Set(SOURCES.map(file=>path.join(repo,file)));
    win.webContents.session.webRequest.onBeforeRequest({urls:['file:///*','http://*/*','https://*/*']},(details,callback)=> {
      let permitted=false;try { permitted=details.url.startsWith('file:') && allowed.has(fileURLToPath(details.url)); } catch (_) {}
      if(!permitted)blocked++;callback({cancel:!permitted});
    });
    const run=code=>win.webContents.executeJavaScript(code,true);
    for(const group of GROUPS) {
      const page=path.join(scratch,group.venue+'.html');fs.writeFileSync(page,markup(group));allowed.add(page);
      await win.loadFile(page);
      if(!win.webContents.debugger.isAttached())win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      assert.equal(await run('document.hidden'),false,'sample real native glyphs in a visible document');
      const dir=path.join(scratch,group.venue);fs.mkdirSync(dir);
      const programs=new Map(group.cards.map(card=>[card.program,{definition:card,hashes:new Set(),owners:new Set(),motions:0,anchor:null}]));
      const gridHashes=new Set();
      for(let frame=0;frame<SETTINGS.frames;frame++) {
        const reports=await run('preview.frame('+frame*1000/SETTINGS.fps+')');
        assert.equal(reports.length,4);
        const image=await win.webContents.capturePage(), png=image.toPNG();
        assert.deepEqual(image.getSize(),{width:SETTINGS.width,height:SETTINGS.height});gridHashes.add(sha(png));
        fs.writeFileSync(path.join(dir,'frame-'+String(frame).padStart(3,'0')+'.png'),png);
        for(const report of reports) {
          const program=programs.get(report.program);assert.ok(program,'native controller returned an unexpected program');
          assert.ok(report.motions>=2);program.motions=report.motions;program.anchor=report.anchor;program.owners.add(report.ownerId+'/'+report.serial);
          program.hashes.add(sha(image.crop(report.crop).toPNG()));
        }
      }
      const certificates=[...programs].map(([program,value])=> {
        assert.ok(value.hashes.size>=SETTINGS.minimumDistinctFrames,program+' needs at least31 different actual PNG crops');
        assert.equal(value.owners.size,1,'offline samples retain the same mounted endpoint identity');
        return {program,zone:value.definition.zone,label:value.definition.label,sampledFrames:SETTINGS.frames,distinctPngFrames:value.hashes.size,finiteDecorativeAnimations:value.motions,anchor:value.anchor,mountedEndpointIdentityUnchanged:true};
      });
      const target=path.join(out,group.venue+'.gif');
      execFileSync('ffmpeg',['-v','error','-framerate',String(SETTINGS.fps),'-i',path.join(dir,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0','-y',target],{stdio:'pipe'});
      const bytes=fs.statSync(target).size;assert.ok(bytes<5*1024*1024);
      assets.push({file:group.venue+'.gif',venue:group.venue,label:group.label,width:SETTINGS.width,height:SETTINGS.height,frames:SETTINGS.frames,fps:SETTINGS.fps,durationMs:SETTINGS.frames*1000/SETTINGS.fps,productionProgramDurationMs:await run('OfficeStationArrival.DURATION'),distinctPngFrames:gridHashes.size,bytes,sha256:sha(fs.readFileSync(target)),programs:certificates});
      await run('preview.destroy()');fs.rmSync(dir,{recursive:true,force:true});console.log(JSON.stringify({generated:group.venue,...assets.at(-1)}));
    }
    assert.deepEqual(errors,[]);assert.equal(blocked,0,'public exporter attempted an unlisted resource');
    assert.ok(assets.every(asset=>asset.productionProgramDurationMs===assets[0].productionProgramDurationMs));
    fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:require('../package.json').version,scope:'Twelve original furniture glyph programs through the actual OfficeStationArrival controller, presented as independent offline endpoint fixtures. Transparent mounted synthetic actor geometry and active synthetic sessions only; no provider connection, room navigation, body contact or IK is demonstrated or certified.',sampling:{...samplingTiming(assets[0].productionProgramDurationMs),method:'Each elapsed frame creates a fresh finite production decorative owner on an unchanged mounted endpoint. Only that owner\'s finite WAAPI animations are paused and sought; its original SVG/program is not modified. No document.timeline or performance clock replacement. The authored transparent endpoint begins at productionProgramDurationMs; nominal and encoded still tails are reported separately on the sampling frame grid.',continuousRoomPlaybackCertified:false,continuousOwnerLifetimeCertified:false},sourceHashes:Object.fromEntries(SOURCES.map(file=>[file,sha(fs.readFileSync(path.join(repo,file)))])),assets,restrictedImageElements:0,unlistedResourceRequests:blocked},null,2)+'\n');
    console.log(JSON.stringify({ok:true,files:assets.length,programs:assets.reduce((sum,asset)=>sum+asset.programs.length,0),errors}));
  } catch(error) {console.error(error);process.exitCode=1;}
  finally {clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);}
}

module.exports=Object.freeze({SETTINGS,SOURCES,GROUPS,samplingTiming,previewRuntime,markup});
// Electron's default-app loader may own require.main instead of this script.
// Its explicit application argv still identifies a direct launch; imports must
// remain inert in both plain Node and another Electron entry point.
if(require.main===module || process.versions.electron && process.argv.slice(1).filter(arg=>typeof arg==='string'&&!arg.startsWith('-')).slice(0,1).some(arg=>path.resolve(arg)===__filename))main().catch(error=>{console.error(error);process.exitCode=1;});
