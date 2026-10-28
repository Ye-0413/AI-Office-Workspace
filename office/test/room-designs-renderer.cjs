'use strict';
// Real production page and decoded room art, with an isolated profile.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fileURLToPath,pathToFileURL}=require('node:url');
const Rooms=require('../lib/room-designs.js');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-room-designs-'));
app.setPath('userData',profile);app.disableHardwareAcceleration();
let win,settings={language:'en',agentScale:1.25,roomDesign:'rain-courtyard',sceneVenue:'workshop',sceneTheme:'auto',
  sceneWeather:'off',sceneTime:'afternoon',idleVisitor:false,reducedMotion:false,lowPower:false};
let snapshot={mode:'live',now:Date.now(),sessions:[],connections:[]};
const errors=[],reports=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
const task=(id,activity,parentId)=>({id,sessionId:id,provider:id.includes('cursor')?'cursor':'codex',parentId,
  status:'active',activity,activeTools:1,lastEventAt:Date.now(),events:[]});
function send(sessions){snapshot={...snapshot,now:Date.now(),sessions};win.webContents.send('office:snapshot',snapshot);}
async function until(code,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){if(errors.length)throw Error(errors.join('\n'));if(await run(code))return;await wait(30);}throw Error(label+': '+JSON.stringify(await run(`({office:{...document.getElementById('office').dataset},art:{...document.getElementById('room-art').dataset},error:document.getElementById('error-message').textContent,actors:[...document.querySelectorAll('.actor')].map(n=>({...n.dataset}))})`)));}
const actors=`[...document.querySelectorAll('.actor[data-session-id]')]`;
const visible=n=>`${actors}.length===${n}&&${actors}.every(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase))`;
async function choose(id){
  await run(`(()=>{const select=document.getElementById('venue-select');select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(`document.getElementById('room-art').dataset.artworkKey===${JSON.stringify('room:'+id)}&&document.getElementById('office').dataset.roomDesign===${JSON.stringify(id)}`,'room art and geometry commit together: '+id);
  assert.equal(await run(`(()=>{const room=OfficeRoomDesigns.get(${JSON.stringify(id)}),language=document.documentElement.lang==='en'?'en':'zh';return document.getElementById('venue-select').selectedOptions[0].textContent.includes(language==='en'?room.nameEn:room.nameZh)&&[...document.querySelectorAll('[data-zone-label]')].every(n=>n.textContent===OfficeRoomDesigns.zoneLabel(room.id,n.dataset.zoneLabel,language));})()`),true,'room names and furniture signs follow the current language');
  assert.equal(await run(`(()=>{const language=document.documentElement.lang==='en'?'en':'zh',daily=OfficeRoomDesigns.resolve({selection:'daily',now:Date.now()}).room;return [...document.getElementById('venue-select').options].find(n=>n.value==='daily').textContent.includes(language==='en'?daily.nameEn:daily.nameZh);})()`),true,'Daily advertises the automatic calendar room while the manual room stays selected');
}
function audit(){
  const world=document.getElementById('world').getBoundingClientRect(),fx=1280/world.width,fy=720/world.height;
  const room=OfficeRoomDesigns.get(document.getElementById('office').dataset.roomDesign);
  const rows=[...document.querySelectorAll('.actor[data-session-id]')].map(node=>{
    const m=new DOMMatrixReadOnly(getComputedStyle(node).transform),point={x:m.m41/12.8,y:m.m42/7.2};
    const parts=['.character-body','.nameplate'].map(selector=>node.querySelector(selector).getBoundingClientRect());
    return{id:node.dataset.sessionId,point,bounds:{left:Math.min(...parts.map(r=>r.left)),right:Math.max(...parts.map(r=>r.right)),top:Math.min(...parts.map(r=>r.top)),bottom:Math.max(...parts.map(r=>r.bottom))}};
  });
  return{room:room.id,count:rows.length,
    // CSS pixel matrices round fractional percentage anchors; tolerate only
    // that numerical noise (less than one thousandth of a world pixel).
    legal:rows.every(r=>r.point.x>=room.floor.x1-1e-5&&r.point.x<=room.floor.x2+1e-5&&r.point.y>=room.floor.y1-1e-5&&r.point.y<=room.floor.y2+1e-5&&!room.obstacles.some(o=>r.point.x>o.x1-.8+1e-5&&r.point.x<o.x2+.8-1e-5&&r.point.y>o.y1-.8+1e-5&&r.point.y<o.y2+.8-1e-5)),
    inside:rows.every(({bounds:b})=>b.left>=world.left-.5&&b.right<=world.right+.5&&b.top>=world.top-.5&&b.bottom<=world.bottom+.5),
    overlaps:rows.some((a,i)=>rows.slice(i+1).some(b=>a.bounds.left<b.bounds.right-.5&&a.bounds.right>b.bounds.left+.5&&a.bounds.top<b.bounds.bottom-.5&&a.bounds.bottom>b.bounds.top+.5)),
    positions:rows.map(r=>[r.id,Number(r.point.x.toFixed(4)),Number(r.point.y.toFixed(4))])};
}
const guard=setTimeout(()=>{console.error('Room design fixture exceeded 180 seconds');app.exit(1);},180000);
app.whenReady().then(async()=>{
  for(const [name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_,...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,
    webPreferences:{preload:path.join(__dirname,'../preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  // Reuse only an explicitly supplied local artwork directory for visual QA.
  // It is neither prepared, copied into this checkout nor ever published.
  const artwork=process.env.MINI_OFFICE_TEST_ARTWORK_ROOT&&path.resolve(process.env.MINI_OFFICE_TEST_ARTWORK_ROOT);
  win.webContents.session.webRequest.onBeforeRequest({urls:['file:///*','http://*/*','https://*/*']},(request,done)=>{
    if(/^https?:/.test(request.url)){errors.push('Unexpected network request');done({cancel:true});return;}
    const file=fileURLToPath(request.url);
    if(artwork&&file.startsWith(path.resolve(__dirname,'../assets/avatars')+path.sep)){
      const target=path.join(artwork,path.basename(file));if(fs.existsSync(target)){done({redirectURL:pathToFileURL(target).href});return;}
    }
    done({});
  });
  await win.loadFile(path.join(__dirname,'../renderer/index.html'));
  await until(`document.getElementById('room-art').dataset.artworkKey==='room:rain-courtyard'`,'first complete room decodes');
  await run(`window.roomArrivals=[];document.getElementById('office').addEventListener('office:actor-arrival',e=>roomArrivals.push({id:e.detail.actorId,kind:e.detail.kind}));void 0`);
  const main=task('codex:room-main','reading'),child=task('cursor:room-helper','planning',main.id);
  send([main,child]);await until(visible(2),'observed main and child finish real entry');
  await run(`window.roomBodies=new Map(${actors}.map(n=>[n.dataset.sessionId,{node:n,body:n.querySelector('.character-body'),image:n.querySelector('.character-body>img'),rig:n.querySelector('.ap-rig'),name:n.querySelector('.actor-title').textContent}]));void 0`);
  for(const room of Rooms.CATALOG){
    const before=await run('roomArrivals.length');
    await run(`window.roomClockSample=${actors}.map(n=>{const rig=n.querySelector('.ap-rig');return{node:n,rig,program:n.dataset.performanceProgram,clocks:rig.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'&&a.effect.getTiming().iterations===Infinity).map(a=>({animation:a,time:a.currentTime}))};});void 0`);
    await choose(room.id);await until(visible(2),'both identities survive '+room.id);
    const result=await run('('+audit.toString()+')()');assert.equal(result.legal,true,JSON.stringify(result));assert.equal(result.inside,true);assert.equal(result.overlaps,false);
    assert.equal(await run(`${actors}.every(n=>{const old=roomBodies.get(n.dataset.sessionId);return old.node===n&&old.body===n.querySelector('.character-body')&&old.image===n.querySelector('.character-body>img')&&old.rig===n.querySelector('.ap-rig')&&old.name===n.querySelector('.actor-title').textContent;})`),true,'room changes preserve every actual body and name');
    assert.equal(await run('roomArrivals.length'),before,'geometry cannot fabricate work arrivals');
    assert.equal(await run(`roomClockSample.every(row=>row.program!==row.node.dataset.performanceProgram||row.clocks.length>0&&row.clocks.every(c=>row.rig.getAnimations({subtree:true}).includes(c.animation)&&c.animation.currentTime>=c.time-.2))`),true,'scenery changes retain the running original CSS work clocks');
    assert.equal(settings.agentScale,1.25);reports.push(result);
  }
  await run(`(()=>{const n=document.getElementById('setting-reducedMotion');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await run(`document.getElementById('language-button').click()`);
  await until(`document.documentElement.lang==='zh-CN'`,'the dense full-catalog run uses Chinese labels');
  const crowd=[main,child,...Array.from({length:98},(_,i)=>task('codex:room-crowd-'+i,['reading','planning','testing','coding'][i%4]))];
  send(crowd);await until(visible(100),'all one hundred identities enter',60000);
  for(const room of Rooms.CATALOG){
    await choose(room.id);await until(visible(100),'all one hundred remain visible in '+room.id);
    const result=await run('('+audit.toString()+')()');assert.equal(result.legal,true,JSON.stringify(result));assert.equal(result.inside,true);assert.equal(result.overlaps,false);
    assert.equal(await run(`document.getElementById('office').dataset.overflowCount`),'0');
    assert.equal(settings.agentScale,1.25);reports.push({...result,positions:undefined});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,rooms:Rooms.CATALOG.length,normalMotion:2,dense:100,bodyIdentitiesPreserved:true,reports,errors}));
}).catch(async error=>{console.error(error);process.exitCode=1;
  try{fs.writeFileSync('/tmp/mini-office-room-designs-failure.png',(await win.webContents.capturePage()).toPNG());}catch(_){}
}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
