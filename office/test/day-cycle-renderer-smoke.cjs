'use strict';
// Local Electron fixtures: no live hooks, AI tools or external requests.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-day-renderer-'));
app.setPath('userData',dir);app.disableHardwareAcceleration();
let settings={sceneTime:'auto',idleVisitor:false,language:'zh'};
const errors=[];let win;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  const handlers={snapshot:()=>({mode:'live',sessions:[],connections:[],demo:{running:false}}),settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]};
  for(const [name,fn] of Object.entries(handlers))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));await wait(200);
  const run=s=>win.webContents.executeJavaScript(s,true);
  // Freeze only this fixture renderer's clock. Never change the host timezone
  // or system date, and let the production one-second refresh cross midnight.
  await run(`window.dayFixtureRealNow=Date.now;window.dayFixtureNow=Date.parse('2026-10-16T15:59:59Z');void(Date.now=()=>window.dayFixtureNow)`);
  const capture=async name=>{if(process.env.MINI_OFFICE_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_PREVIEW_DIR,name+'.png'),(await win.webContents.capturePage()).toPNG());}};
  await run(`document.getElementById('window-scenery').hidden=true`);await capture('original-window');await run(`document.getElementById('window-scenery').hidden=false`);
  for(const phase of ['dawn','morning','afternoon','sunset','night']){
    await run(`document.getElementById('setting-sceneTime').value='${phase}';document.getElementById('setting-sceneTime').dispatchEvent(new Event('change',{bubbles:true}))`);await wait(320);
    const state=await run(`({phase:document.getElementById('office').dataset.dayPhase,preview:document.getElementById('office').dataset.timePreview,clock:document.getElementById('hk-clock').textContent,date:document.getElementById('hk-date').textContent,dateTime:document.getElementById('hk-date').dateTime,views:document.querySelectorAll('.harbour-view[data-visible="true"]').length,sessions:document.querySelectorAll('.actor').length,error:!document.getElementById('error-message').hidden})`);
    assert.equal(state.phase,phase);assert.equal(state.preview,'true');assert.equal(state.clock,'23:59');assert.equal(state.date,'2026年10月16日 星期五');assert.equal(state.dateTime,'2026-10-16');assert.equal(state.views,1);assert.equal(await run(`document.getElementById('day-clock').closest('#world')!==null`),true);assert.ok(await run(`parseFloat(getComputedStyle(document.getElementById('hk-clock')).fontSize)>=50`));assert.equal(state.sessions,0);assert.equal(state.error,false);assert.equal(settings.sceneTime,phase);
    await capture('hong-kong-'+phase);
  }
  await run(`window.dayFixtureNow+=1000`);await wait(1200);
  assert.equal(await run(`document.getElementById('hk-clock').textContent`),'00:00');
  assert.equal(await run(`document.getElementById('hk-date').textContent`),'2026年10月17日 星期六');
  assert.equal(await run(`document.getElementById('hk-date').dateTime`),'2026-10-17');
  assert.equal(await run(`document.getElementById('office').dataset.dayPhase`),'night');
  assert.equal(await run(`document.getElementById('office').dataset.timePreview`),'true');
  await run(`document.getElementById('day-clock').click()`);assert.equal(await run(`document.activeElement.id`),'setting-sceneTime');
  await run(`document.getElementById('day-reset').click()`);await wait(200);assert.equal(settings.sceneTime,'auto');assert.equal(await run(`document.activeElement.id`),'setting-sceneTime');assert.equal(await run(`document.getElementById('day-reset').hidden`),true);
  await run(`document.getElementById('settings-dialog').close();document.getElementById('language-button').click()`);await wait(100);assert.match(await run(`document.getElementById('day-clock').getAttribute('aria-label')`),/^Hong Kong time /);
  assert.equal(await run(`document.getElementById('hk-date').textContent`),'Sat, 17 Oct 2026');
  assert.equal(await run(`document.getElementById('hk-date').dateTime`),'2026-10-17');
  assert.match(await run(`document.getElementById('day-clock').getAttribute('aria-label')`),/Sat, 17 Oct 2026/);
  await run(`document.getElementById('settings-button').click();document.getElementById('setting-reducedMotion').click();document.getElementById('settings-dialog').close()`);await wait(100);
  assert.equal(await run(`getComputedStyle(document.querySelector('.harbour-ferry')).animationPlayState`),'paused');
  for(const size of [[960,540],[1280,720]]){
    win.setContentSize(...size);await wait(100);
    for(const language of ['en','zh']){
      if(settings.language!==language){await run(`document.getElementById('language-button').click()`);await wait(80);}
      for(const phase of ['dawn','morning','afternoon','sunset','night']){
        await run(`document.getElementById('setting-sceneTime').value='${phase}';document.getElementById('setting-sceneTime').dispatchEvent(new Event('change',{bubbles:true}))`);await wait(50);
        const bounds=await run(`(()=>{const clock=document.getElementById('day-clock'),r=clock.getBoundingClientRect(),label=clock.querySelector('.clock-label > span:first-child').getBoundingClientRect(),status=clock.querySelector('.clock-status').getBoundingClientRect(),date=document.getElementById('hk-date').getBoundingClientRect(),digital=document.getElementById('hk-clock').getBoundingClientRect(),stats=document.getElementById('activity-stats').getBoundingClientRect(),world=document.getElementById('world').getBoundingClientRect(),reserved=OfficeScene.CLOCK_RESERVED[0];const contained=[clock,document.getElementById('activity-stats'),clock.querySelector('.clock-feet')].every(n=>{const b=n.getBoundingClientRect();return (b.left-world.left)*1280/world.width>=reserved.left-.1&&(b.right-world.left)*1280/world.width<=reserved.right+.1&&(b.top-world.top)*720/world.height>=reserved.top-.1&&(b.bottom-world.top)*720/world.height<=reserved.bottom+.1;});return{inWindow:r.left>=0&&r.right<=innerWidth,headerFits:status.left>=label.right+1&&status.right<=r.right-1,dateFits:date.left>=r.left&&date.right<=r.right&&date.top>=digital.bottom-.5&&date.bottom<=r.bottom-1,aligned:Math.abs(stats.top-r.top)<.5&&Math.abs(stats.bottom-r.bottom)<.5,contained,font:parseFloat(getComputedStyle(document.getElementById('hk-clock')).fontSize)};})()`);
        assert.deepEqual(bounds,{inWindow:true,headerFits:true,dateFits:true,aligned:true,contained:true,font:56},JSON.stringify({size,language,phase,bounds}));
      }
    }
  }
  await run(`void(Date.now=window.dayFixtureRealNow)`);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,phases:5,checks:['real clock and full date during preview','Hong Kong midnight updates date and weekday through the one-second timer','semantic local date independent of UTC','time select persistence','one active crossfade surface','no synthetic actors','keyboard focus','reset to now','bilingual date and labels','reduced motion','all preview labels and full dates fit both window sizes','clock and statistics fit the shared collision reservation'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{win?.destroy();fs.rmSync(dir,{recursive:true,force:true});app.exit(process.exitCode||0);});
