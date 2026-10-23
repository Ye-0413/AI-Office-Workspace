'use strict';
// Native production-page and articulated-art QA. All observations and settings
// belong to this disposable profile; the fixture never talks to providers.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const Model=require('../lib/avatar-performance-model.js');
const root=path.resolve(__dirname,'..'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-readability-'));
const preview=process.env.MINI_OFFICE_READABILITY_PREVIEW_DIR;
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-color-profile','srgb');
let win,blockArtwork=false,stage='cold-start',captureSerial=0;const checks=[],errors=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// The 1x macOS compositor converted rgb(91,35,170) to (84,38,164).
// Allow a bounded profile conversion, but keep every possible swatch farther
// apart than two tolerance radii so an older capture can never certify a new one.
const captureTolerance=16,capturePalette=[[160,64,64],[64,160,64],[64,64,160],[160,160,64],[160,64,160],[64,160,160]],captures=[];
for(let i=0;i<capturePalette.length;i++)for(const color of capturePalette.slice(i+1)){
  const distance=Math.max(...color.map((channel,k)=>Math.abs(channel-capturePalette[i][k])));
  assert.ok(distance>=80&&distance>2*captureTolerance,'capture swatches must have disjoint acceptance regions');
}
let settings={language:'zh',agentScale:1.35,reducedMotion:true,idleVisitor:false,sceneVenue:'workshop',sceneTheme:'spring',sceneWeather:'off'};
const task=(id,activity,extra={})=>({id:'codex:'+id,sessionId:id,provider:'codex',status:'active',activity,activeTools:1,lastEventAt:Date.now(),projectPath:'/fixture/readability',events:[],evidence:{source:'hook',confidence:'explicit'},...extra});
const cast=[task('root-plan','planning'),task('root-code','coding'),task('helper-code','coding',{parentId:'codex:root-plan'}),task('helper-test','testing',{parentId:'codex:root-code'})];
let snapshot={mode:'live',sessions:cast,connections:[],now:Date.now()};
const run=code=>win.webContents.executeJavaScript(code,true);
const nodes=`[...document.querySelectorAll('.actor[data-session-id]')]`;
const settled=`${nodes}.length===4&&${nodes}.every(n=>getComputedStyle(n).visibility!=='hidden'&&Number(getComputedStyle(n).opacity)>.99&&n.dataset.traffic==='arrived'&&n.dataset.walking!=='true'&&!['splitting','returning','absorbing'].includes(n.dataset.clonePhase)&&!n.getAnimations().some(a=>a.pending||a.playState==='running'))`;
async function until(code,label,limit=30000){const end=Date.now()+limit;while(Date.now()<end){if(await run(code))return;await pause(25);}throw Error(stage+': '+label);}
async function capture(name){
  if(!preview)return;
  // capturePage can return a previous compositor frame even after two RAFs.
  // A unique opaque corner swatch proves this artifact includes the current
  // style/DOM commit; it occupies a four-CSS-pixel square in the saved image.
  const color=capturePalette[captureSerial++];assert.ok(color,'each capture needs an unused, separated swatch');
  const viewport=await run(`(()=>{let m=document.getElementById('readability-paint-swatch');if(!m){m=document.createElement('div');m.id='readability-paint-swatch';m.setAttribute('aria-hidden','true');document.body.append(m);}m.style.cssText='position:fixed;left:8px;top:8px;width:4px;height:4px;z-index:2147483647;pointer-events:none;background:rgb(${color.join(',')})';return{width:innerWidth,height:innerHeight}})()`);
  const started=Date.now(),end=started+5000;let frame,last;
  while(Date.now()<end){
    frame=await win.webContents.capturePage();const size=frame.getSize(),bitmap=frame.toBitmap(),x=Math.floor(10*size.width/viewport.width),y=Math.floor(10*size.height/viewport.height),at=(y*size.width+x)*4;
    last={size,viewport,bytes:bitmap.length,scales:frame.getScaleFactors(),pixel:[...bitmap.subarray(at,at+4)]};
    if([color[2],color[1],color[0]].every((channel,k)=>Math.abs(bitmap[at+k]-channel)<=captureTolerance)&&bitmap[at+3]===255){fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,name+'.png'),frame.toPNG());captures.push({name,color,pixelBGRA:last.pixel,tolerance:captureTolerance,elapsedMs:Date.now()-started,size:last.size});return;}
    await run(`new Promise(r=>requestAnimationFrame(r))`);
  }
  fs.mkdirSync(preview,{recursive:true});fs.writeFileSync(path.join(preview,name+'-unverified.png'),frame.toPNG());
  throw Error(stage+': screenshot did not present its current paint swatch for '+name+' '+JSON.stringify(last));
}
const reportPage=`(()=>{const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};const rows=${nodes}.map(n=>{const body=n.querySelector('.character-body'),svg=n.querySelector('.ap-rig'),m=new DOMMatrixReadOnly(getComputedStyle(n).transform),unit=m.a*document.getElementById('world').getBoundingClientRect().width/1280;const points=[[50,70],[105,70],[50,105],[105,105]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(svg.getScreenCTM()));const foot=new DOMPoint(77.5,115).matrixTransform(svg.getScreenCTM()),native=n.querySelector('.avatar-native-fallback'),nf=new DOMPoint(77.5,115).matrixTransform(native.getScreenCTM());return{nativeFoot:{x:nf.x,y:nf.y},nativeScale:new DOMMatrixReadOnly(getComputedStyle(native).transform).a,id:n.dataset.sessionId,parent:n.dataset.parentId,helper:n.dataset.helper,unit,z:getComputedStyle(n).zIndex,body:rect(body),plate:rect(n.querySelector('.nameplate')),foot:{x:foot.x,y:foot.y},head:{width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))},titleFont:parseFloat(getComputedStyle(n.querySelector('.actor-title')).fontSize),relationFont:parseFloat(getComputedStyle(n.querySelector('.actor-relation')).fontSize),sublineFont:parseFloat(getComputedStyle(n.querySelector('.actor-subline')).fontSize),providerFont:parseFloat(getComputedStyle(n.querySelector('.actor-provider')).fontSize),title:n.querySelector('.actor-title').textContent,aria:n.querySelector('.actor-button').getAttribute('aria-label'),parts:[...n.querySelector('.nameplate').children].filter(p=>getComputedStyle(p).display!=='none').map(rect)};});return rows})()`;
function auditPage(rows){
  assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.unit.toFixed(6))).size,1,'parents and helpers keep one physical scale');
  const boxes=[];
  for(const r of rows){
    assert.equal(r.z,'10');assert.ok(r.aria.includes(r.title),'full nickname stays accessible');
    assert.ok(Math.abs(r.plate.width/r.unit-220)<.15);assert.ok(Math.abs(r.plate.height/r.unit-63)<.15);
    assert.ok(Math.abs((r.plate.bottom-r.foot.y)/r.unit-87)<.15,'paper bottom keeps the existing floor-relative envelope');
    for(const p of r.parts)assert.ok(p.left>=r.plate.left-.35*r.unit&&p.right<=r.plate.right+.35*r.unit&&p.top>=r.plate.top-.35*r.unit&&p.bottom<=r.plate.bottom+.35*r.unit,'every visible plate child stays inside the paper');
    boxes.push({id:r.id,left:Math.min(r.body.left,r.plate.left),right:Math.max(r.body.right,r.plate.right),top:Math.min(r.body.top,r.plate.top),bottom:Math.max(r.body.bottom,r.plate.bottom)});
  }
  const overlap=(a,b)=>a.left<b.right-.6&&a.right>b.left+.6&&a.top<b.bottom-.6&&a.bottom>b.top+.6;
  assert.equal(overlap(boxes[0],{...boxes[0],id:'negative-control'}),true,'same detector rejects coincident actual envelopes');
  for(let i=0;i<boxes.length;i++){const a=boxes[i];assert.ok(a.left>=0&&a.top>=0&&a.right<=1280&&a.bottom<=720);for(const b of boxes.slice(i+1))assert.equal(overlap(a,b),false,'complete actor envelopes cannot overlap');}
}
function atlasEntries(){return Object.entries(Model.KINDS).flatMap(([activity,kind])=>Model.PROGRAMS[kind].map(program=>{for(let seed=0;seed<1000;seed++){const session={id:'readability:'+program+':'+seed,provider:'codex',activity,status:'active'};if(Model.plan(session).program===program)return{session,program};}throw Error('No deterministic seed for '+program);}));}
// Conservative native SVG bounds: clip each bitmap use to its actual joint,
// include transformed strokes, and retain props only when visibly composed.
// This deliberately does not use getBBox on an unclipped source image.
function readArtBounds(body){
  const svg=body.querySelector('.ap-rig'),origin=body.getBoundingClientRect();
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const node of svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,use')){
    if(node.closest('defs'))continue;
    let parent=node,shown=true;while(parent&&parent!==svg){const s=getComputedStyle(parent);if(s.display==='none'||Number(s.opacity)<.01){shown=false;break;}parent=parent.parentElement;}if(!shown)continue;
    let box=node.getBBox();const clip=node.getAttribute('clip-path');if(clip){const match=clip.match(/#([^)]*)/),shape=match&&document.getElementById(match[1])?.firstElementChild;if(shape)box=shape.getBBox();}
    if(!box.width&&!box.height)continue;
    const matrix=node.getScreenCTM(),style=getComputedStyle(node),radius=style.stroke==='none'?0:parseFloat(style.strokeWidth)/2;
    const stroke=style.vectorEffect==='non-scaling-stroke'?radius:radius*Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d));
    const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
    bounds.left=Math.min(bounds.left,Math.min(...points.map(p=>p.x))-stroke-origin.left);bounds.right=Math.max(bounds.right,Math.max(...points.map(p=>p.x))+stroke-origin.left);
    bounds.top=Math.min(bounds.top,Math.min(...points.map(p=>p.y))-stroke-origin.top);bounds.bottom=Math.max(bounds.bottom,Math.max(...points.map(p=>p.y))+stroke-origin.top);
  }
  return bounds;
}
async function auditAtlas(){
  stage='all-programs';const renderer=pathToFileURL(path.join(root,'renderer')).href+'/',entries=atlasEntries();
  assert.equal(entries.length,88);
  const html=`<!doctype html><html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="avatar-fallback.css"><link rel="stylesheet" href="family-appearance.css"><style>html,body{overflow:auto;height:auto;min-height:100%;background:#483b31}.fixture{position:relative;display:inline-block;width:230px;height:210px;vertical-align:top}.fixture .actor-button{left:27px;top:0}.fixture .label{position:absolute;left:4px;bottom:5px;color:#ead9b2;font-size:10px}.fixture .actor-prop{left:193.25px;top:69.75px}.fixture[data-locomotion="true"] .actor-prop[data-carry="true"]{left:193.25px;top:69.75px}</style></head><body><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script src="avatar-fallback.js"></script><script src="../lib/family-model.js"></script><script src="family-appearance.js"></script><script>window.items=[];window.readArtBounds=${readArtBounds.toString()};const palette=OfficeFamily.createPaletteRegistry();palette.update(['atlas-family']);for(const entry of ${JSON.stringify(entries)}){const actor=document.createElement('div');actor.className='actor fixture';const button=document.createElement('button');button.className='actor-button';const body=document.createElement('span');body.className='character-body';const image=document.createElement('img');image.dataset.asset='clawd-static-base.svg';image.src='../assets/avatars/clawd-static-base.svg';body.append(image);button.append(body);actor.append(button);const label=document.createElement('span');label.className='label';label.textContent=entry.program;actor.append(label);const note=document.createElement('span');note.className='actor-prop';note.dataset.carry='false';note.textContent='≡';actor.append(note);document.body.append(actor);const controller=OfficeAvatarPerformance.create({actorNode:actor,body,session:entry.session});controller.update(entry.session,{now:0});const fallback=OfficeAvatarFallback.create({actorNode:actor,body,image});const family=OfficeFamilyAppearance.create({actorNode:actor,body,image});family.update({rootId:'atlas-family',appearance:palette.forRoot('atlas-family')});items.push({...entry,actor,body,image,controller,fallback,family});}</script></body></html>`;
  const file=path.join(scratch,'atlas.html');fs.writeFileSync(file,html);await win.loadFile(file);
  await until(`items.length===88&&items.every(i=>i.image.naturalWidth>0&&i.body.dataset.rigHealth==='healthy')`,'all authorized local art must be loaded');
  await until(`items.every(i=>!i.body.getAnimations({subtree:true}).some(a=>a.effect.getTiming().iterations!==Infinity&&(a.pending||a.playState==='running')))`,'initial physical bridges must release the original work clocks');
  const report=await run(`(async()=>{const clocks=document.getAnimations();clocks.forEach(a=>a.pause());await Promise.all(clocks.map(a=>a.ready));const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity},violations=[],grips=[];for(let step=0;step<=40;step++){const phase=step/40;for(const a of clocks){const t=a.effect.getTiming();if(t.iterations===Infinity)a.currentTime=Number(t.delay)+Number(t.duration)*(Math.ceil(Math.max(0,-Number(t.delay))/Number(t.duration))+phase);}await new Promise(r=>requestAnimationFrame(r));for(const item of items){const b=readArtBounds(item.body);bounds.left=Math.min(bounds.left,b.left);bounds.right=Math.max(bounds.right,b.right);bounds.top=Math.min(bounds.top,b.top);bounds.bottom=Math.max(bounds.bottom,b.bottom);if(b.left<-33||b.right>187||b.top<0||b.bottom>=139)violations.push({program:item.program,phase,b});for(const side of ['left','right'])for(const prop of item.body.querySelectorAll('.ap-held-'+side)){const hand=item.body.querySelector('.ap-arm-'+side);if(getComputedStyle(prop).transform!==getComputedStyle(hand).transform||getComputedStyle(prop).transformOrigin!==getComputedStyle(hand).transformOrigin)grips.push({program:item.program,phase,side});}}}window.atlasClocks=clocks;return{programs:items.length,phases:41,bounds,violations,grips}})()`);
  assert.deepEqual(report.violations,[],'all actual enlarged joints and stroked props stay inside the unchanged allocated width and above paper');assert.deepEqual(report.grips,[],'held objects retain each actual wrist transform and pivot');
  checks.push({name:'all 88 enlarged native performances retain safe paint and hand contact',...report});await capture('all-programs-first-page');
  // Compare the visible static-image and rig transforms here. The real failed
  // production page above independently checks the active native SVG; a hidden
  // SVG intentionally has no screen CTM or computed transform in Chromium.
  const anchors=await run(`(()=>{const item=items[0],b=item.body.getBoundingClientRect(),s=getComputedStyle(item.image),m=new DOMMatrixReadOnly(s.transform),o=s.transformOrigin.split(' ').map(parseFloat),p=new DOMPoint(37.5-o[0],75-o[1]).matrixTransform(m);const image={x:b.left+parseFloat(s.left)+o[0]+p.x,y:b.top+parseFloat(s.top)+o[1]+p.y};const rig=new DOMPoint(77.5,115).matrixTransform(item.body.querySelector('.ap-rig').getScreenCTM());return{image,rig:{x:rig.x,y:rig.y},scales:[item.image,item.body.querySelector('.ap-rig')].map(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).a)}})()`);
  assert.ok(Math.hypot(anchors.image.x-anchors.rig.x,anchors.image.y-anchors.rig.y)<.001,'static and articulated feet share the same actual pixel '+JSON.stringify(anchors));assert.deepEqual(anchors.scales,[1.5,1.5]);checks.push({name:'static and rig share the same 1.5 scale and physical feet',anchors});
  // Exercise the real gait owner; do not seek or replace any walking clock.
  await run(`const item=items[0];item.actor.querySelector('.actor-prop').dataset.carry='true';item.actor.dataset.walking='true';item.controller.update(item.session,{now:50,walking:true});void 0`);
  await until(`items[0].actor.dataset.locomotion==='true'&&!items[0].body.getAnimations({subtree:true}).some(a=>a.effect.getTiming().iterations!==Infinity&&(a.pending||a.playState==='running'))`,'real stride takeover must finish');
  const gait=await run(`new Promise((resolve,reject)=>{const item=items[0],frames=[],started=performance.now();function tick(){const b=readArtBounds(item.body),w=new DOMPoint(110,90).matrixTransform(item.body.querySelector('.ap-arm-right').getScreenCTM()),n=item.actor.querySelector('.actor-prop').getBoundingClientRect();frames.push({bounds:b,wrist:{x:w.x,y:w.y},note:{left:n.left,right:n.right,top:n.top,bottom:n.bottom},phase:item.actor.dataset.locomotionPhase,feet:[...item.body.querySelectorAll('.ap-foot')].map(n=>getComputedStyle(n).transform)});if(performance.now()-started>4000)return reject(Error('31 real gait RAF samples exceeded 4s'));if(frames.length===31)resolve(frames);else requestAnimationFrame(tick);}requestAnimationFrame(tick)})`);
  assert.ok(new Set(gait.map(f=>JSON.stringify(f.feet))).size>1,'the real foot joints actually advance');for(const f of gait){assert.ok(f.bounds.left>=-33&&f.bounds.right<=187&&f.bounds.top>=0&&f.bounds.bottom<139,'real gait and its retained work props remain in the same envelope');assert.ok(f.wrist.x>=f.note.left&&f.wrist.x<=f.note.right&&f.wrist.y>=f.note.top&&f.wrist.y<=f.note.bottom,'enlarged carried paper remains at the enlarged actual wrist');}checks.push({name:'31 actual gait frames preserve enlarged paper contact, bounds and moving original feet',frames:gait.length});
}
const guard=setTimeout(()=>{console.error('Readability fixture timed out at '+stage);app.exit(1);},120000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),displays:()=>[]}))ipcMain.handle('office:'+name,(_, ...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:blockArtwork&&/\/assets\/avatars\//.test(details.url)}));
  await win.loadFile(path.join(root,'renderer/index.html'));await until(settled,'four actual observed parents and helpers must settle');
  // Re-create the former presentation only, on the same real actor nodes and
  // allocator result. The unchanged paper bottom makes the comparison fair.
  const beforeStyles='.actor .character-body{--avatar-presentation-scale:1}.office[data-flat="true"] .actor .nameplate,.office[data-flat="true"] .actor[data-helper="true"] .nameplate{top:132px;height:70px;grid-template-rows:24px 16px 13px;padding:4px 8px 5px}.office[data-flat="true"] .actor .actor-title,.office[data-flat="true"] .actor[data-helper="true"] .actor-title{font-size:16px;line-height:20px}.office[data-flat="true"] .actor .actor-relation{font-size:11px;line-height:16px}.office[data-flat="true"] .actor .actor-subline,.office[data-flat="true"] .actor[data-helper="true"] .actor-subline{font-size:11px;line-height:13px}.office[data-flat="true"] .actor .actor-provider{font-size:10px}';
  const beforeCSS=await win.webContents.insertCSS(beforeStyles.replace(/([;}])/g,'!important$1'));
  await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);const before=await run(reportPage);await capture('four-families-before');await win.webContents.removeInsertedCSS(beforeCSS);await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
  const after=await run(reportPage);if(preview)fs.writeFileSync(path.join(preview,'comparison.json'),JSON.stringify({before,after},null,2));auditPage(after);await capture('four-families-after-zh');
  for(const r of after){const old=before.find(o=>o.id===r.id);assert.ok(Math.abs(r.head.width/old.head.width-1.5)<.001&&Math.abs(r.head.height/old.head.height-1.5)<.001,'actual painted head grows 50 percent in both dimensions');assert.equal(r.titleFont/old.titleFont,1.5);assert.equal(r.unit,old.unit);assert.ok(Math.hypot(r.foot.x-old.foot.x,r.foot.y-old.foot.y)<.001,'enlargement never moves the physical feet');assert.ok(Math.abs(r.plate.bottom-old.plate.bottom)<.001,'complete reserved envelope remains the same');}
  checks.push({name:'four observed actors from two real parent families grow 50 percent at the same fitted scale',before,after});
  await run(`window.originals=new Map(${nodes}.map(n=>[n.dataset.sessionId,{node:n,body:n.querySelector('.character-body'),rig:n.querySelector('.ap-rig'),image:n.querySelector('.character-body>img'),transform:n.style.transform}]));void 0`);
  await run(`document.getElementById('language-button').click();void 0`);await until(`document.documentElement.lang==='en'&&${settled}`,'English real labels must settle');auditPage(await run(reportPage));await capture('four-families-after-en');
  await run(`const q=document.getElementById('setting-reducedMotion');q.checked=false;q.dispatchEvent(new Event('change',{bubbles:true}));void 0`);
  await until(`${nodes}.some(n=>n.querySelector('.character-body').getAnimations({subtree:true}).some(a=>a.effect.getTiming().iterations===Infinity&&a.playState==='running'))&&${nodes}.every(n=>!n.querySelector('.character-body').getAnimations({subtree:true}).some(a=>a.effect.getTiming().iterations!==Infinity&&(a.pending||a.playState==='running')))`,'normal work must expose nonempty original running clocks');
  await run(`window.workClocks=${nodes}.flatMap(n=>n.querySelector('.character-body').getAnimations({subtree:true})).filter(a=>a.effect.getTiming().iterations===Infinity&&a.playState==='running').map(animation=>({animation,time:animation.currentTime}));void 0`);
  for(let i=0;i<3;i++){snapshot={...snapshot,sessions:cast.map(s=>({...s,title:'Metadata '+i,lastEventAt:Date.now()})),now:Date.now()};win.webContents.send('office:snapshot',snapshot);await run(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);}
  assert.equal(await run(`[...originals].every(([id,o])=>{const n=${nodes}.find(n=>n.dataset.sessionId===id);return n===o.node&&n.querySelector('.character-body')===o.body&&n.querySelector('.ap-rig')===o.rig&&n.querySelector('.character-body>img')===o.image&&n.style.transform===o.transform})&&workClocks.length>0&&workClocks.every(o=>o.animation.playState==='running'&&o.animation.currentTime>o.time&&o.animation.effect.target.getAnimations().includes(o.animation))`),true,'heartbeats retain actual identities and advance the same work clocks');
  checks.push({name:'English, reduced-motion and normal work preserve parents, physical feet, exact nodes and nonempty original heartbeat clocks'});
  stage='native-art-failure';settings={...settings,reducedMotion:true};blockArtwork=true;await win.webContents.session.clearCache();await win.loadFile(path.join(root,'renderer/index.html'));await until(`${settled}&&${nodes}.every(n=>n.querySelector('.character-body').dataset.rigHealth==='failed'&&n.querySelector('.character-body').dataset.bitmapHealth==='failed')`,'actual resource failure must use the native bodies');const failed=await run(reportPage);auditPage(failed);for(const r of failed){assert.equal(r.nativeScale,1.5);assert.ok(Math.hypot(r.nativeFoot.x-r.foot.x,r.nativeFoot.y-r.foot.y)<.001,'actual failed-resource native body keeps the articulated physical feet');}await capture('four-families-native-fallback');checks.push({name:'real double artwork failure retains the same readable native four-body layout, 1.5 scale and physical feet',failed});
  blockArtwork=false;await auditAtlas();assert.deepEqual(errors,[]);
  if(preview)fs.writeFileSync(path.join(preview,'readability-report.json'),JSON.stringify({ok:true,checks,captures,errors},null,2));console.log(JSON.stringify({ok:true,checks,captures,errors}));
}).catch(error=>{console.error(stage,error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
