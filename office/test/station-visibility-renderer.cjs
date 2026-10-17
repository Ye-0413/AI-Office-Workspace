'use strict';
// Fast production smoke for the real native-window fallback. No fabricated
// Page Visibility property, arrival event, controller call or Animation seek.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createWindowVisibility}=require('../lib/window-visibility.cjs');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-station-visibility-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,visibility,heartbeat,nativeLatency=null;const errors=[],nativeLatencies=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
const settings={language:'zh',agentScale:1,reducedMotion:false,lowPower:false,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off'};
let sessions=[];const current=()=>({mode:'live',now:Date.now(),connections:[],sessions,windowVisibility:visibility?.snapshot()||{available:false,hidden:null}});
const run=code=>win.webContents.executeJavaScript(code,true);
const broadcast=()=>{if(win&&!win.isDestroyed())win.webContents.send('office:snapshot',current());};
async function until(code,label,ms=18000){const end=Date.now()+ms;while(Date.now()<end){if(await run(code))return;await wait(10);}throw Error(label);}
async function pausedWorkClocks(label){
 await until(`(()=>{const s=nativeIdentity,live=s.rig.getAnimations({subtree:true});return s.clocks.length>0&&s.clocks.every(a=>live.includes(a)&&a.playState==='paused'&&Number.isFinite(a.currentTime))})()`,label+' pauses original work CSS clocks',500);
 await run(`void(window.nativeClockHold=nativeIdentity.clocks.map(animation=>({animation,time:animation.currentTime})))`);await wait(90);
 const sample=await run(`nativeClockHold.map(c=>({same:nativeIdentity.rig.getAnimations({subtree:true}).includes(c.animation),paused:c.animation.playState==='paused',drift:Math.abs(c.animation.currentTime-c.time)}))`);
 assert.ok(sample.length>0&&sample.every(c=>c.same&&c.paused&&c.drift<=.2),label+' retains paused original animation objects without drift');
 return{count:sample.length,maxDrift:Math.max(...sample.map(c=>c.drift))};
}
async function restoredIdentity(){return run(`(()=>{const a=document.querySelector('.actor[data-session-id="codex:visibility-main"]'),s=nativeIdentity;return{same:a===s.node&&a.querySelector('.character-body')===s.body&&a.querySelector('.character-body>img')===s.image&&a.querySelector('.ap-rig')===s.rig,program:a.dataset.performanceProgram,oldProgram:s.program,clocks:s.clocks.every(c=>s.rig.getAnimations({subtree:true}).includes(c)&&c.playState==='running'),count:nativeCount,remaining:document.querySelectorAll('.station-arrival').length};})()`);}
const guard=setTimeout(()=>{console.error('Station native visibility smoke exceeded 30 seconds');app.exit(1);},30000);
app.whenReady().then(async()=>{
 for(const[name,fn]of Object.entries({snapshot:current,settings:()=>settings,'set-settings':patch=>Object.assign(settings,patch),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
 ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
 win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 visibility=createWindowVisibility({window:win,watch:true,getAppHidden:process.platform==='darwin'?()=>app.isHidden():undefined,onChange:broadcast});
 for(const event of ['hide','show','minimize','restore'])win.on(event,()=>{if(nativeLatency&&win&&!win.isDestroyed())nativeLatency.events.push({event,afterRequestMs:Date.now()-nativeLatency.requestedAt,visible:win.isVisible(),minimized:win.isMinimized()});});
 win.webContents.on('console-message',detail=>{if(detail.level==='error')errors.push(detail.message);});
 await win.loadFile(path.join(__dirname,'../renderer/index.html'));
 heartbeat=setInterval(broadcast,2000);
 await run(`(()=>{window.nativeCue=null;window.nativeCount=0;const layer=document.getElementById('station-arrivals');new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches('.station-arrival')){nativeCount++;nativeCue={node,start:performance.now(),rows:0};const sample=()=>{if(!nativeCue.node.isConnected)return;nativeCue.rows++;requestAnimationFrame(sample)};requestAnimationFrame(sample);}}).observe(layer,{childList:true});})()`);
 sessions=[{id:'codex:visibility-main',provider:'codex',sessionId:'visibility-main',status:'active',activity:'reading',activeTools:1,lastEventAt:Date.now(),events:[],projectPath:'/fixture/native-visibility'}];broadcast();
 await until(`nativeCue&&nativeCue.rows>=5&&Number(getComputedStyle(nativeCue.node).opacity)>.15`,'a real door walk reaches a visible finite station response');
 await run(`(()=>{const node=document.querySelector('.actor[data-session-id="codex:visibility-main"]'),rig=node.querySelector('.ap-rig');window.nativeIdentity={node,body:node.querySelector('.character-body'),image:node.querySelector('.character-body>img'),rig,clocks:rig.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity&&a.playState==='running'),program:node.dataset.performanceProgram};})()`);
 // A real hide tests cleanup of the still-active response. Minimize has an
 // OS-owned animation, so its independent gate starts at the actual getter.
 nativeLatency={kind:'hide',requestedAt:Date.now(),events:[]};nativeLatencies.push(nativeLatency);win.hide();
 const hideEnd=Date.now()+3000;while(win.isVisible()&&Date.now()<hideEnd)await wait(10);assert.equal(win.isVisible(),false);
 nativeLatency.getterConfirmedAfterMs=Date.now()-nativeLatency.requestedAt;const hideConfirmedAt=Date.now();
 await until(`document.getElementById('office').dataset.hidden==='true'`,'real hidden getter reaches the production renderer',3000);
 nativeLatency.effectiveHiddenAfterMs=Date.now()-nativeLatency.requestedAt;nativeLatency.afterGetterMs=Date.now()-hideConfirmedAt;assert.ok(nativeLatency.afterGetterMs<=500);
 const hidden=await run(`({rawDocumentHidden:document.hidden,effectiveHidden:document.getElementById('office').dataset.hidden,nodeConnected:nativeCue.node.isConnected,count:document.querySelectorAll('.station-arrival').length,age:performance.now()-nativeCue.start})`);
 assert.equal(hidden.count,0);assert.equal(hidden.nodeConnected,false);assert.ok(hidden.age<1400,'native visibility clears the still-active effect before natural finish');
 const evidence=visibility.snapshot();assert.equal(evidence.available,true);assert.equal(evidence.hidden,true);assert.equal(evidence.visible,false);const hideClocks=await pausedWorkClocks('real hide');
 win.showInactive();await until(`document.getElementById('office').dataset.hidden==='false'`,'real show releases hidden native state',3000);await wait(300);
 const restored=await restoredIdentity();assert.equal(restored.same,true);assert.equal(restored.clocks,true);assert.equal(restored.program,restored.oldProgram);assert.equal(restored.count,1);assert.equal(restored.remaining,0);
 nativeLatency={kind:'minimize',requestedAt:Date.now(),events:[]};nativeLatencies.push(nativeLatency);win.minimize();const minimizeEnd=Date.now()+4000;while(!win.isMinimized()&&Date.now()<minimizeEnd)await wait(10);assert.equal(win.isMinimized(),true);
 nativeLatency.getterConfirmedAfterMs=Date.now()-nativeLatency.requestedAt;const minimizeConfirmedAt=Date.now();
 await until(`document.getElementById('office').dataset.hidden==='true'`,'confirmed minimized getter reaches the production renderer',3000);
 nativeLatency.effectiveHiddenAfterMs=Date.now()-nativeLatency.requestedAt;nativeLatency.afterGetterMs=Date.now()-minimizeConfirmedAt;
 assert.ok(nativeLatency.afterGetterMs<=500,'confirmed native minimize reaches effective hidden within500ms');
 const minimized=visibility.snapshot();assert.equal(minimized.available,true);assert.equal(minimized.minimized,true);assert.equal(minimized.hidden,true);const minimizeClocks=await pausedWorkClocks('real minimize');
 win.restore();win.showInactive();await until(`document.getElementById('office').dataset.hidden==='false'`,'real minimized restore releases native hidden state',3000);await wait(300);
 const afterMinimize=await restoredIdentity();assert.equal(afterMinimize.same,true);assert.equal(afterMinimize.clocks,true);assert.equal(afterMinimize.program,afterMinimize.oldProgram);assert.equal(afterMinimize.count,1);assert.equal(afterMinimize.remaining,0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,scope:'actual-native-window-visibility-fallback',nativeHidden:true,nativeMinimized:true,evidence,hidden,hideClocks,restored,minimized,minimizeClocks,afterMinimize,nativeLatencies,errors}));
}).catch(error=>{console.error(error);console.error(JSON.stringify({nativeLatencies,nativeWindow:win&&!win.isDestroyed()?{visible:win.isVisible(),minimized:win.isMinimized()}:null,errors}));process.exitCode=1;}).finally(()=>{clearTimeout(guard);clearInterval(heartbeat);visibility?.dispose();win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
