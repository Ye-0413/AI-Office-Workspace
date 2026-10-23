'use strict';
// Real production CSS/WAAPI bridge boundaries and ownership; no provider connection.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'office-gait-'));
app.setPath('userData',path.join(scratch,'profile'));app.disableHardwareAcceleration();
let win;const errors=[],checks=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=source=>win.webContents.executeJavaScript(source,true);
const guard=setTimeout(()=>{console.error('Native gait fixture timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
  const renderer=pathToFileURL(path.resolve(__dirname,'../renderer')).href+'/';
  fs.writeFileSync(path.join(scratch,'fixture.html'),`<!doctype html><html><head><base href="${renderer}"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="avatar-performance.css"><link rel="stylesheet" href="avatar-fallback.css"><link rel="stylesheet" href="family-appearance.css"><style>body{background:#665745}.actor{transform:translate(520px,460px) scale(2);z-index:10}.fixture-floor{position:absolute;left:100px;right:100px;top:580px;border-top:1px solid #bba274}.actor-button{pointer-events:none}</style></head><body><div class="fixture-floor"></div><div class="actor" id="walker"><button class="actor-button"><span class="character-body"><img data-asset="clawd-static-base.svg" src="../assets/avatars/clawd-static-base.svg"></span><span class="nameplate"><strong>踏云行者</strong><small>主 Agent · 活跃 0 · 累计 0</small></span></button><span class="actor-prop" data-carry="false">≡</span></div><script src="../lib/avatar-performance-model.js"></script><script src="avatar-performance.js"></script><script src="avatar-fallback.js"></script><script src="../lib/family-model.js"></script><script src="family-appearance.js"></script><script>window.actor=document.getElementById('walker');window.body=actor.querySelector('.character-body');window.image=body.querySelector('img');window.session={id:'codex:gait',provider:'codex',status:'active',activity:'coding',activeTools:1};window.truth=JSON.stringify(session);window.clocks=OfficeAvatarPerformanceModel.createClockRegistry({limit:4});window.controller=OfficeAvatarPerformance.create({actorNode:actor,body,session,clockRegistry:clocks});window.fallback=OfficeAvatarFallback.create({actorNode:actor,body,image});window.palette=OfficeFamily.createPaletteRegistry();palette.update([session.id]);window.family=OfficeFamilyAppearance.create({actorNode:actor,body,image});family.update({rootId:session.id,appearance:palette.forRoot(session.id)});controller.update(session,{now:0});window.sample=()=>({rig:Number(getComputedStyle(body.querySelector('.avatar-performance')).opacity),bitmap:Number(getComputedStyle(image).opacity),joints:[...body.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]}),feet:[...body.querySelectorAll('.ap-foot')].map(n=>{const m=new DOMMatrixReadOnly(getComputedStyle(n).transform);return[m.a,m.b,m.c,m.d,m.e,m.f]})});</script></body></html>`);
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,...args)=>{const detail=args[0];if(typeof detail==='object'&&detail.level==='error')errors.push(detail.message);});
  await win.loadFile(path.join(scratch,'fixture.html'));
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await wait(300);
  assert.equal(await run('document.hidden'),false);
  await run(`window.rig=body.querySelector('.ap-rig');window.prop=body.querySelector('.ap-props-back').firstElementChild;window.cssClocks=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string');for(const a of cssClocks)a.currentTime=5276;window.originalProgram=controller.plan.program;void 0`);
  await wait(30);

  const cases=await run(`(()=>{const out=[];for(const activity of ['planning','coding','testing']){const seen=new Set();for(let i=0;i<300&&seen.size<(activity==='planning'?8:4);i++){const s={...session,id:'codex:bridge-'+activity+'-'+i,activity};const p=OfficeAvatarPerformanceModel.plan(s,{});if(!seen.has(p.program)){seen.add(p.program);out.push({session:s,program:p.program})}}}return out})()`);
  assert.equal(cases.length,16,'eight planning, four coding and four testing programs must be exercised');
  const results=[];
  for(let i=0;i<cases.length;i++){
    const c=cases[i];await run(`window.session=${JSON.stringify(c.session)};controller.update(session,{now:${10000+i*10000}});void 0`);await wait(230);
    await run(`for(const a of body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'))a.currentTime=${1000+(i%3)*2000};actor.dataset.walking='true';controller.update(session,{now:${10100+i*10000},walking:true});void 0`);await wait(210);
    const r=await run(`new Promise(resolve=>{
      const nodes=[...body.querySelectorAll('.ap-upper,.ap-eyes,.ap-arm,.ap-foot')],points=nodes.map(n=>n.classList.contains('ap-arm-left')?[45,90]:n.classList.contains('ap-arm-right')?[110,90]:n.classList.contains('ap-foot')?[77,115]:[77,87]);
      const take=()=>nodes.map((n,j)=>{const p=new DOMPoint(...points[j]).matrixTransform(n.getScreenCTM());return{x:p.x/2,y:p.y/2}});
      const css=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string'),held=new Map(css.map(a=>[a,a.currentTime])),violations=[],boundaries=[];
      const started=performance.now();let frames=0,last={at:started,points:take(),bridge:true},endJump=null,maxStep=0;
      actor.dataset.walking='false';controller.update(session,{now:${10200+i*10000}});
      const jointBridges=body.getAnimations({subtree:true}).filter(a=>a.constructor.name==='Animation'&&nodes.includes(a.effect.target)&&a.effect.getTiming().duration===180);
      for(const motion of jointBridges){
        const node=motion.effect.target,index=nodes.indexOf(node),target=motion.effect.getKeyframes().at(-1).transform;
        motion.finished.then(()=>{
          // Observe the actual completion before the aggregate bridge owner
          // resumes work clocks. Adjacent RAF samples can include legitimate
          // resumed work motion and are only interval diagnostics below.
          const expected=new DOMPoint(...points[index]).matrixTransform(new DOMMatrixReadOnly(target));
          const actual=new DOMPoint(...points[index]).matrixTransform(new DOMMatrixReadOnly(getComputedStyle(node).transform));
          boundaries.push({joint:node.getAttribute('class'),at:performance.now()-started,px:Math.hypot(actual.x-expected.x,actual.y-expected.y),clocksHeld:css.every(a=>a.playState==='paused'),clockDrift:Math.max(0,...css.map(a=>Math.abs(a.currentTime-held.get(a))))});
        },()=>violations.push('joint bridge cancelled before its completion boundary'));
      }
      function tick(now){
        frames++;
        const current=take(),bridge=body.getAnimations({subtree:true}).some(a=>a.constructor.name==='Animation'&&nodes.includes(a.effect.target)&&a.effect.getTiming().duration===180),step=Math.max(...current.map((p,j)=>Math.hypot(p.x-last.points[j].x,p.y-last.points[j].y)));
        maxStep=Math.max(maxStep,step);
        if(bridge&&css.some(a=>a.playState!=='paused'||Math.abs(a.currentTime-held.get(a))>.2))violations.push('work CSS advanced behind static bridge target');
        if(last.bridge&&!bridge&&!endJump)endJump={dt:now-last.at,px:step,at:now-started};
        last={at:now,points:current,bridge};
        if(now-started<620)requestAnimationFrame(tick);
        else resolve({frames,endJump,maxStep,violations,boundaries,jointBridgeCount:jointBridges.length,clocksRestored:css.every(a=>a.playState==='running'&&body.getAnimations({subtree:true}).includes(a))});
      }
      requestAnimationFrame(tick);
    })`);
    assert.deepEqual(r.violations,[],c.program);assert.equal(r.clocksRestored,true,c.program);assert.ok(r.endJump,c.program+' must cross an actual finite joint bridge boundary');assert.ok(r.frames>=31,c.program+' needs at least 31 real RAF samples');
    assert.ok(r.jointBridgeCount>0&&r.boundaries.length===r.jointBridgeCount,c.program+' must observe every actual joint completion: '+JSON.stringify(r));
    assert.ok(r.boundaries.every(boundary=>boundary.px<.15&&boundary.clocksHeld&&boundary.clockDrift<=.2),c.program+' must expose the CSS pose at the same phase as its bridge endpoint: '+JSON.stringify(r));results.push({program:c.program,...r});
  }
  await run(`actor.dataset.walking='true';controller.update(session,{now:200000,walking:true});void 0`);await wait(220);
  await run(`actor.dataset.walking='false';controller.update(session,{now:200100});void 0`);await wait(20);
  await run(`actor.dataset.walking='true';controller.update(session,{now:200120,walking:true});void 0`);await wait(250);
  assert.equal(await run(`body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string').every(a=>a.playState==='paused')&&actor.dataset.locomotion==='true'`),true,'a cancelled old bridge cannot resume work clocks during a new walk');
  await run(`actor.dataset.walking='false';controller.update(session,{now:200400});void 0`);await wait(20);
  await run(`controller.update(session,{now:200420,reducedMotion:true});void 0`);await wait(230);
  assert.equal(await run(`body.getAnimations({subtree:true}).length===0`),true,'quiet teardown cannot be resurrected by an obsolete bridge finish');
  await run(`controller.update(session,{now:200700});void 0`);await wait(30);
  await run(`controller.destroy();fallback.destroy();family.destroy();void 0`);await wait(220);
  assert.equal(await run(`body.getAnimations({subtree:true}).length===0&&body.querySelector('.avatar-performance')===null`),true,'destroy invalidates every finite clock owner');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,results,errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(scratch,{recursive:true,force:true});app.exit(process.exitCode||0);});
