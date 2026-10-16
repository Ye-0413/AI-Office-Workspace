'use strict';
// Real SVG/WAAPI with synthetic bystanders; never configures providers.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const F=require('../lib/festival-model.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-festival-native-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win;const checks=[],errors=[],samples=[],drawings=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const preview=process.env.MINI_OFFICE_PREVIEW_DIR;
const html=path.join(profile,'fixture.html'),base=pathToFileURL(path.join(__dirname,'../renderer/')).href;
const hasStudies=fs.existsSync(path.join(__dirname,'../lib/festival-studies.js'));
fs.writeFileSync(html,`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' file:; style-src 'self' file:; img-src 'self' file: data:; connect-src 'none'"><base href="${base}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="venue-stage.css"><link rel="stylesheet" href="festival-stage.css">${hasStudies?'<script defer src="../lib/festival-studies.js"></script>':''}<script defer src="../lib/festival-model.js"></script><script defer src="festival-stage.js"></script></head><body><main id="office" class="office"><div id="world-frame" class="world-frame"><div id="world" class="world"><img id="room-art" class="room-art" src="../assets/office-room.jpg" alt="Room"><button id="day-clock" class="day-clock" type="button"><time>18:30</time><time>2026年10月17日 周六</time></button><div id="actors" class="actors"><button id="body-sentinel" type="button">Agent sentinel</button></div></div></div><header class="topbar"><div class="brand">小小工作室</div><div class="venue-chooser"><select class="venue-select"><option>山海工坊</option></select></div><div class="room-switcher"><select><option>Fixture project</option></select></div><div class="top-actions"><button class="language-button">EN</button><button class="icon-button">◷</button><button class="icon-button">⚙</button><button class="icon-button">≡</button></div></header></main></body></html>`);
const guard=setTimeout(()=>{console.error('Festival fixture exceeded 160 seconds');app.exit(1);},160000);
const run=source=>win.webContents.executeJavaScript(source,true);
async function until(source,message,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(await run(source))return;await pause(20);}throw new Error(message+': '+JSON.stringify(await run(`({theme:document.querySelector('.festival-stage')?.dataset.theme,playing:document.querySelector('.festival-widget')?.dataset.playing,feedback:document.querySelector('.festival-feedback')?.textContent,errors:window.scriptErrors})`)));}
async function check(name,fn){try{await fn();checks.push(name);}catch(error){error.message=name+': '+error.message;throw error;}}
async function update(patch){await run(`state={...state,...${JSON.stringify(patch)}};controller.update(state);void 0`);}
async function click(keyboard=false){await run(`document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:${keyboard?0:1}}));void 0`);}
async function capture(name){if(!preview)return;fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('render-process-gone',(_e,details)=>errors.push('renderer gone: '+details.reason));
  await win.loadFile(html);
  await win.webContents.insertCSS('#world-frame{left:0!important;top:0!important;transform-origin:0 0!important;transform:scale(1)!important}#body-sentinel{position:absolute;left:60%;top:70%;width:80px;height:100px;background:#c6a173;border:2px solid #684c37;pointer-events:auto}');
  await run(`window.scriptErrors=[];addEventListener('error',e=>{if(e.message)scriptErrors.push(e.message)});addEventListener('unhandledrejection',e=>scriptErrors.push(String(e.reason)));window.state={theme:'spring',weather:'off',language:'zh',venue:'workshop',now:Date.parse('2026-10-17T10:30:00Z'),reducedMotion:false,lowPower:false,hidden:false};window.selections=[];window.interactions=[];window.sentinel=document.getElementById('body-sentinel');window.actorMutations=[];new MutationObserver(records=>actorMutations.push(...records.map(r=>r.type))).observe(document.getElementById('actors'),{attributes:true,childList:true,subtree:true});window.rejectSettings=false;window.controller=OfficeFestivalStage.create({office:document.getElementById('office'),world:document.getElementById('world'),topbar:document.querySelector('.topbar'),getState:()=>state,onSelectTheme:(id,meta)=>{selections.push({kind:'theme',id,...meta});if(rejectSettings)return Promise.reject(new Error('fixture rejection'))},onSelectWeather:(id,meta)=>selections.push({kind:'weather',id,...meta}),onInteraction:event=>interactions.push(event)});void 0`);
  await check('native disclosure, bilingual selectors and explicit decorative weather',async()=>{
    assert.equal(await run(`document.getElementById('festival-theme-select').options.length`),F.THEMES.length+1);
    assert.equal(await run(`document.getElementById('festival-weather-select').options.length`),4);
    assert.match(await run(`document.querySelector('.festival-disclaimer').textContent`),/不是实时气象/);
    await run(`document.querySelector('.festival-summary').click();void 0`);
    assert.equal(await run(`document.querySelector('.festival-chooser').open`),true);
    await run(`document.querySelector('.festival-chooser').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));void 0`);
    assert.equal(await run(`document.querySelector('.festival-chooser').open`),false);
    assert.equal(await run(`document.activeElement.classList.contains('festival-summary')`),true);
  });
  await check('every authored theme has different SVG geometry and at least 31 actual continuous frames',async()=>{
    for(const theme of F.THEMES){
      await update({theme:theme.id,weather:'off',reducedMotion:false,lowPower:false,hidden:false});
      assert.equal(await run(`document.querySelector('.festival-control').getAttribute('aria-label')`),theme.actionZh);
      const geometry=await run(`(()=>{const svg=document.querySelector('.festival-art');return[...svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line')].map(n=>[n.tagName,...['d','x','y','cx','cy','r','width','height','points','x1','x2','y1','y2'].map(a=>n.getAttribute(a))]).map(a=>a.join('|')).join(';')})()`);
      assert.ok(geometry.length>80,theme.id+' must have authored geometry');drawings.push({id:theme.id,geometry});
      await run(`window.audit={seen:false,done:false,frames:[],start:performance.now()};function sampleFestival(t){const w=document.querySelector('.festival-widget'),p=document.querySelector('.festival-primary');if(w?.dataset.playing==='true'){audit.seen=true;const s=getComputedStyle(p);audit.frames.push({at:t,transform:s.transform,opacity:s.opacity});}else if(audit.seen){audit.done=true;audit.end=t;}if(!audit.done&&t-audit.start<2400)requestAnimationFrame(sampleFestival)}requestAnimationFrame(sampleFestival);document.querySelector('.festival-control').dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));void 0`);
      await until(`audit.done`,'the '+theme.id+' interaction must finish a real presentation');
      const report=await run(`({id:document.querySelector('.festival-stage').dataset.theme,frames:audit.frames.length,elapsed:audit.frames.at(-1).at-audit.frames[0].at,unique:new Set(audit.frames.map(f=>f.transform+'|'+f.opacity)).size,at:audit.frames.map(f=>f.at)})`);
      assert.equal(report.id,theme.id);assert.ok(report.frames>=31,JSON.stringify(report));assert.ok(report.unique>=31,JSON.stringify(report));assert.ok(report.elapsed>=600,JSON.stringify(report));
      assert.ok(report.at.every((at,i)=>!i||at>report.at[i-1]),'samples must come from consecutive actual RAF callbacks');samples.push(report);
      if(F.CORE_THEMES.some(core=>core.id===theme.id))await capture('festival-'+theme.id);
      if(preview){const source=await run(`(()=>{const svg=document.querySelector('.festival-art').cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');return svg.outerHTML})()`);fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,'festival-'+theme.id+'.svg'),source);}
    }
    assert.equal(new Set(drawings.map(item=>item.geometry)).size,F.THEMES.length,'themes must have different authored geometry rather than name or color changes');
  });
  await check('rapid reactivation cancels the prior motion and each quiet mode settles immediately',async()=>{
    await update({theme:'halloween'});await click();await pause(90);await click();
    assert.equal(await run(`document.querySelector('.festival-primary').getAnimations().filter(a=>a.playState==='running').length`),1);
    await update({hidden:true});
    assert.equal(await run(`document.querySelector('.festival-widget').dataset.playing`),'false');
    assert.equal(await run(`document.querySelector('.festival-primary').getAnimations().length`),0);
    for(const patch of [{hidden:false,reducedMotion:true},{reducedMotion:false,lowPower:true}]){await update(patch);await click();assert.equal(await run(`document.querySelector('.festival-widget').dataset.playing`),'false');}
    await update({lowPower:false});await click(true);assert.equal(await run(`document.querySelector('.festival-widget').dataset.playing`),'false');
  });
  await check('snow, rain and off are bounded to the window and pause with reduced motion',async()=>{
    await update({weather:'snow'});assert.equal(await run(`document.querySelector('.festival-weather').dataset.weather`),'snow');assert.equal(await run(`document.querySelectorAll('.festival-weather-particle').length`),18);
    assert.ok(await run(`document.querySelector('.festival-weather').getAnimations({subtree:true}).length>0`));
    await update({reducedMotion:true});assert.equal(await run(`document.querySelector('.festival-weather').getAnimations({subtree:true}).length`),0);
    await update({weather:'rain'});assert.equal(await run(`document.querySelector('.festival-weather').dataset.weather`),'rain');
    await update({weather:'off'});assert.equal(await run(`document.querySelectorAll('.festival-weather-particle').length`),0);
    await update({theme:'winter',weather:'auto'});assert.equal(await run(`document.querySelector('.festival-weather').dataset.weather`),'snow');
  });
  await check('Hong Kong midnight changes auto themes, while manual previews stay explicit',async()=>{
    await update({theme:'auto',weather:'off',now:Date.parse('2026-10-30T15:59:59Z')});assert.equal(await run(`document.querySelector('.festival-stage').dataset.theme`),'autumn');
    await update({now:Date.parse('2026-10-30T16:00:00Z')});assert.equal(await run(`document.querySelector('.festival-stage').dataset.theme`),'halloween');assert.match(await run(`document.querySelector('.festival-date').textContent`),/2026-10-31.*日期自动/);
    await update({theme:'hanami',now:Date.parse('2026-12-25T04:00:00Z')});assert.equal(await run(`document.querySelector('.festival-stage').dataset.mode`),'manual');assert.match(await run(`document.querySelector('.festival-date').textContent`),/手动预览/);
  });
  await check('selectors dispatch once, recover from save failures and localize all visible text',async()=>{
    await run(`(()=>{const s=document.getElementById('festival-theme-select');s.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));s.value='christmas';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await run(`selections.filter(s=>s.kind==='theme').length`),1);assert.equal(await run(`selections[0].source`),'keyboard');
    await run(`rejectSettings=true;document.getElementById('festival-theme-select').value='spring';document.getElementById('festival-theme-select').dispatchEvent(new Event('change',{bubbles:true}));void 0`);await pause(20);assert.match(await run(`document.querySelector('.festival-feedback').textContent`),/未能保存/);
    await run(`rejectSettings=false;void 0`);await update({theme:'qingming',language:'en'});await click(true);
    assert.equal(await run(`document.querySelector('.festival-control').getAttribute('aria-label')`),'Let a paper kite rise');assert.match(await run(`document.querySelector('.festival-feedback').textContent`),/quiet thought/);assert.match(await run(`document.querySelector('.festival-disclaimer').textContent`),/not live conditions/);
    await update({language:'zh'});assert.match(await run(`document.querySelector('.festival-feedback').textContent`),/想念的人/);
  });
  await check('800 by 450 controls and opened panel fit; authored object does not cover the clock',async()=>{
    win.setContentSize(800,450);await pause(100);await win.webContents.insertCSS('#world-frame{left:0!important;top:0!important;transform-origin:0 0!important;transform:scale(.625)!important}');
    await update({theme:'winter',language:'en'});await run(`document.querySelector('.festival-chooser').open=true;void 0`);
    const bounds=await run(`(()=>{const p=document.querySelector('.festival-panel').getBoundingClientRect(),s=document.querySelector('.festival-summary').getBoundingClientRect(),a=document.querySelector('.festival-art').getBoundingClientRect(),c=document.getElementById('day-clock').getBoundingClientRect(),w=document.getElementById('world').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,p:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},s:{left:s.left,right:s.right},world:{left:w.left,right:w.right,top:w.top,bottom:w.bottom},clockHit:a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top}})()`);
    assert.ok(bounds.scroll<=bounds.width,JSON.stringify(bounds));assert.ok(bounds.p.left>=0&&bounds.p.right<=800&&bounds.p.bottom<=450,JSON.stringify(bounds));assert.ok(bounds.s.left>=0&&bounds.s.right<=800,JSON.stringify(bounds));assert.ok(Math.abs(bounds.world.left)<1&&Math.abs(bounds.world.right-800)<1&&Math.abs(bounds.world.top)<1&&Math.abs(bounds.world.bottom-450)<1,JSON.stringify(bounds));assert.equal(bounds.clockHit,false);
    await capture('festival-small-en');await run(`document.querySelector('.festival-chooser').open=false;void 0`);
  });
  await check('switches never touch observed nodes and destruction removes every stage effect/listener',async()=>{
    assert.deepEqual(await run('actorMutations'),[]);assert.equal(await run(`sentinel===document.getElementById('body-sentinel')&&getComputedStyle(sentinel).visibility==='visible'&&Number(getComputedStyle(sentinel).opacity)===1`),true);
    assert.ok(await run(`Number(getComputedStyle(document.querySelector('.festival-stage')).zIndex)<Number(getComputedStyle(document.getElementById('actors')).zIndex)`));
    await update({theme:'summer',reducedMotion:false,language:'zh'});await click();await update({theme:'christmas'});await click();
    await run(`window.detachedTheme=document.getElementById('festival-theme-select');window.beforeDestroy=selections.length;controller.destroy();detachedTheme.value='winter';detachedTheme.dispatchEvent(new Event('change',{bubbles:true}));void 0`);await pause(150);
    assert.equal(await run(`document.querySelectorAll('.festival-stage,.festival-weather,.festival-chooser,.festival-feedback').length`),0);assert.equal(await run(`selections.length===beforeDestroy`),true);assert.deepEqual(await run('actorMutations'),[]);
  });
  await check('dynamic theme names are text, never HTML',async()=>{
    await run(`window.safeModel=OfficeFestivals;window.attack='<img src=x onerror="window.festivalXss=true">';window.OfficeFestivals={...safeModel,getTheme:id=>({...safeModel.getTheme(id),nameZh:attack,actionZh:attack,detailZh:attack})};window.controller=OfficeFestivalStage.create({office:document.getElementById('office'),world:document.getElementById('world'),topbar:document.querySelector('.topbar'),getState:()=>({theme:'spring',weather:'off',language:'zh',reducedMotion:true})});void 0`);
    assert.equal(await run(`document.querySelector('.festival-caption').textContent===attack`),true);assert.equal(await run(`document.querySelectorAll('.festival-control img,.festival-chooser img').length`),0);assert.equal(await run('Boolean(window.festivalXss)'),false);await run(`controller.destroy();OfficeFestivals=safeModel;void 0`);
  });
  errors.push(...await run('scriptErrors'));assert.deepEqual(errors,[]);
  if(preview)fs.writeFileSync(path.join(preview,'festival-native-manifest.json'),JSON.stringify({samples,checks,errors},null,2));
  console.log(JSON.stringify({ok:true,themes:F.THEMES.length,checks,samples,errors,actorMutations:await run('actorMutations')}));
}).catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
