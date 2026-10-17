'use strict';
// Native, isolated pair-animation fixture. No provider config or messages.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'office-social-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
const office=path.resolve(__dirname,'..'),url=file=>pathToFileURL(path.join(office,file)).href;
let win;const errors=[],checks=[];const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=code=>win.webContents.executeJavaScript(code,true);
const guard=setTimeout(()=>{console.error('Social fixture timed out');app.exit(1);},60000);
// New context cases use elapsed native RAF, not the atlas's deliberate seeks.
function observeContextExit(patch){
  const original=document.querySelector('.agent-social-vignette'),part=original.querySelector('.social-prop'),actors=fixtureActors.slice();
  const nodes=actors.map(a=>({node:a.node,body:a.body,html:a.node.outerHTML,session:JSON.stringify(a.session),serial:a.serial,position:JSON.stringify(a.position),animations:a.body.getAnimations()}));
  const pre=[],post=[],owned=original.getAnimations({subtree:true}),token=social.state().active.token;
  let held=null,clickedAt=null,finishedAt=null,finishError=null,fade=null,denied=null,deadline;
  return new Promise((resolve,reject)=>{
    const fail=error=>{clearTimeout(deadline);reject(error);};
    deadline=setTimeout(()=>fail(Error('actual context exit exceeded bounded2000ms observation')),2000);
    function sample(now){
      try{
        const same=actors.every((a,i)=>a===fixtureActors[i]&&a.node===nodes[i].node&&a.body===nodes[i].body&&a.node.outerHTML===nodes[i].html&&JSON.stringify(a.session)===nodes[i].session&&a.serial===nodes[i].serial&&JSON.stringify(a.position)===nodes[i].position&&nodes[i].animations.every(m=>a.body.getAnimations().includes(m)));
        if(!same)throw Error('a visual context change altered an original actor/body/clock/fact');
        if(clickedAt===null){
          pre.push({at:now,pose:getComputedStyle(part).transform});
          if(pre.length===31){
            held={pose:getComputedStyle(part).transform,alpha:Number(getComputedStyle(original).opacity),times:owned.map(a=>a.currentTime)};
            clickedAt=performance.now();Object.assign(fixtureContext,patch);social.update();
            if(social.state().active!==null||social.state().exiting?.token!==token||!original.isConnected)throw Error('visual context must immediately release active while retaining its original outgoing SVG');
            if(owned.some((m,i)=>m.playState!=='paused'||Math.abs(m.currentTime-held.times[i])>.001))throw Error('only the actual original decorative clocks must freeze');
            fade=original.getAnimations().find(a=>a.effect.target===original&&a.effect.getTiming().duration===160);
            if(!fade)throw Error('original160ms exit owner missing');
            fade.finished.then(()=>finishedAt=performance.now()-clickedAt,error=>{finishError=String(error);});
            const before=JSON.stringify(social.state());denied=social.trigger({kind:'paperplane-nod'});
            if(denied!==false||JSON.stringify(social.state())!==before)throw Error('outgoing owner consumed a competing plan or cooldown');
          }
        }else{
          const alpha=original.isConnected?Number(getComputedStyle(original).opacity):0;
          const pose=original.isConnected?getComputedStyle(part).transform:null;
          if(original.isConnected&&pose!==held.pose)throw Error('the outgoing context prop rewound/advanced from its captured pose');
          if(finishError)throw Error('the original context exit was canceled: '+finishError);
          post.push({elapsed:performance.now()-clickedAt,connected:original.isConnected,alpha,pose});
          if(post.length===2){const before=social.state().exiting?.token;fixtureContext.now=Date.now();social.update();if(social.state().exiting?.token!==before)throw Error('clock heartbeat replaced an outgoing owner');}
          if(performance.now()-clickedAt>500&&finishedAt===null)throw Error('the original160ms owner failed to finish naturally within500ms');
          if(post.length>=31&&finishedAt!==null){
            if(original.isConnected||document.querySelector('.agent-social-vignette')||social.state().active||social.state().exiting)throw Error('old context replayed or failed to clean up');
            if(performance.now()-clickedAt>1000)throw Error('context31RAF tail exceeded1000ms');
            clearTimeout(deadline);return resolve({patch,preFrames:pre.length,distinctPoses:new Set(pre.map(r=>r.pose)).size,postFrames:post.length,held,rows:post,finishedAt,totalElapsedMs:performance.now()-clickedAt,denied,sameActors:true,ownedDuration:fade.effect.getTiming().duration});
          }
        }
        requestAnimationFrame(sample);
      }catch(error){fail(error);}
    }
    requestAnimationFrame(sample);
  });
}
app.whenReady().then(async()=>{
  const fixture=path.join(profile,'fixture.html');
  fs.writeFileSync(fixture,`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${url('renderer/agent-social.css')}"><style>html,body{margin:0;width:100%;height:100%;background:#233137}#world{width:1280px;height:720px;position:relative;background:linear-gradient(#314952,#4e5946)}.actor{position:absolute;width:154px;height:129px;--family-color:#c78c68}.body{width:154px;height:129px;position:relative}.torso{position:absolute;left:44px;top:56px;width:65px;height:45px;background:#c78c68;border:2px solid #302a26;border-radius:12px}.eye{position:absolute;top:68px;width:6px;height:10px;border-radius:3px;background:#273235}.eye.l{left:62px}.eye.r{left:88px}.foot{position:absolute;top:102px;left:50px;width:50px;height:8px;border-radius:4px;background:#8f674e}.tag{position:absolute;top:127px;left:28px;background:#ead9b9;padding:5px 12px;border-radius:5px;font:12px sans-serif;color:#564830}#a{left:280px;top:290px}#b{left:650px;top:285px;--family-color:#7b9d9c}#b .torso{background:#7b9d9c}</style><div id="world"><div class="actor" id="a"><div class="body"><div class="torso"></div><i class="eye l"></i><i class="eye r"></i><i class="foot"></i></div><span class="tag">Fixture A</span></div><div class="actor" id="b"><div class="body"><div class="torso"></div><i class="eye l"></i><i class="eye r"></i><i class="foot"></i></div><span class="tag">Fixture B</span></div><div id="social"></div></div><script src="${url('lib/social-interactions.js')}"></script><script src="${url('renderer/agent-social.js')}"></script><script>window.fixtureTime=1000;Date.now=()=>fixtureTime;window.fixtureContext={venue:'workshop',language:'zh',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};window.fixtureActors=['a','b'].map((id,index)=>({id:'codex:'+id,node:document.getElementById(id),body:document.querySelector('#'+id+' .body'),session:{id:'codex:'+id,provider:'codex',status:'active',activity:index?'reading':'coding',turnId:'one',...(index?{parentId:'codex:a'}:{})},entryPending:false,clonePhase:'',position:{x:index?57:27,y:58},serial:19}));window.fixtureTruth=JSON.stringify(fixtureActors.map(a=>({session:a.session,serial:a.serial,position:a.position,html:a.node.outerHTML})));window.originalAnimations=fixtureActors.map(a=>a.body.animate([{opacity:.999},{opacity:1}],{duration:12000,iterations:Infinity}));window.social=OfficeAgentSocial.create({layer:document.getElementById('social'),world:document.getElementById('world'),getActors:()=>fixtureActors,getContext:()=>fixtureContext});</script>`);
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_e,...args)=>{const detail=args[0];if(typeof detail==='object'&&detail.level==='error')errors.push(detail.message);});
  await win.loadFile(fixture);await wait(60);
  assert.equal(await run('document.hidden'),false,'native fixture must render a visible scene');
  const catalog=await run('Object.entries(OfficeSocialInteractions.CATALOG).flatMap(([venue,items])=>items.map(item=>({venue,...item})))');
  const signatures=new Set(),pictures=new Set();
  for(const definition of catalog){
    await run(`fixtureTime+=60000;fixtureContext.venue=${JSON.stringify(definition.venue)};social.update();void 0`);
    assert.equal(await run(`social.trigger({kind:${JSON.stringify(definition.id)}})`),true,definition.id);
    assert.equal(await run('social.trigger()'),false,'active interaction is single-flight');
    const report=await run(`(()=>{const v=document.querySelector('.agent-social-vignette');window.socialAnimations=v.getAnimations({subtree:true});for(const a of socialAnimations)a.pause();const samples=new Set();for(let sample=0;sample<31;sample++){for(const a of socialAnimations)a.currentTime=a.effect.getTiming().duration*(.18+sample*.64/30);samples.add(JSON.stringify([...v.querySelectorAll('.social-hand,.social-prop,.social-reaction,.social-star-line')].map(n=>({transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity}))));}for(const a of socialAnimations)a.currentTime=a.effect.getTiming().duration*.46;return{samples:samples.size,kind:v.dataset.socialKind,hands:[...v.querySelectorAll('.social-hand')].map(n=>n.dataset.part),caption:v.querySelector('.social-caption text').textContent,signature:JSON.stringify([...v.querySelectorAll('[data-prop],.social-star-line,.social-meteor,.social-reaction')].map(n=>({tag:n.tagName,prop:n.dataset.prop,markup:n.innerHTML,frames:n.getAnimations().flatMap(a=>a.effect.getKeyframes())}))),animations:socialAnimations.length,bothAnimated:[...v.querySelectorAll('.social-hand')].every(n=>n.getAnimations().length>0),captionPosition:v.querySelector('.social-caption').getBoundingClientRect().x};})()`);
    assert.equal(report.kind,definition.id);assert.equal(report.samples,31,'31 elapsed samples must contain continuously changing native poses/props');assert.deepEqual(report.hands.sort(),['receiver','sender']);assert.equal(report.bothAnimated,true);assert.ok(report.animations>=5);assert.match(report.caption,/工作室小互动/);assert.ok(report.captionPosition>100,'caption stays by its pair');signatures.add(report.signature);
    await wait(36);const first=(await win.webContents.capturePage()).toPNG();pictures.add(createHash('sha256').update(first).digest('hex'));if(process.env.MINI_OFFICE_SOCIAL_PREVIEW_DIR){fs.mkdirSync(process.env.MINI_OFFICE_SOCIAL_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.MINI_OFFICE_SOCIAL_PREVIEW_DIR,definition.id+'.png'),first);}
    const before=await run(`JSON.stringify([...document.querySelectorAll('.social-hand')].map(n=>getComputedStyle(n).transform))`);
    await run(`for(const a of socialAnimations)a.currentTime=a.effect.getTiming().duration*.74;void 0`);
    const after=await run(`JSON.stringify([...document.querySelectorAll('.social-hand')].map(n=>getComputedStyle(n).transform))`);assert.notEqual(after,before,'both endpoints have real changing native gesture transforms');
    assert.equal(await run(`JSON.stringify(fixtureActors.map(a=>({session:a.session,serial:a.serial,position:a.position,html:a.node.outerHTML})))===fixtureTruth`),true,'social animation must not mutate actual actors or facts');
    assert.equal(await run(`fixtureActors.every((a,i)=>a.body.getAnimations().includes(originalAnimations[i]))`),true,'original pose animation identities survive');
    checks.push({kind:definition.id,animations:report.animations,duration:definition.duration,elapsedSamples:report.samples});
    await run(`fixtureContext.hidden=true;social.update();fixtureContext.hidden=false;void 0`);assert.equal(await run(`document.querySelectorAll('.agent-social-vignette').length`),0);
  }
  assert.equal(signatures.size,9,'all nine actual SVG/keyframe compositions differ');assert.equal(pictures.size,9,'all nine native rendered moments differ');
  // Actual interruption, without seeking the finite exit. An old SVG is held
  // at its composed prop pose while the real body clocks continue untouched.
  await run(`fixtureTime+=60000;fixtureContext={venue:'workshop',language:'zh',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};social.update();void 0`);
  assert.equal(await run(`social.trigger({kind:'blueprint-pass'})`),true);await wait(620);
  const exitReport=await run(`new Promise(resolve=>{const old=document.querySelector('.agent-social-vignette'),part=old.querySelector('.social-prop'),before=getComputedStyle(part).transform,beforeAlpha=Number(getComputedStyle(old).opacity),clocks=originalAnimations.map(a=>a.currentTime),started=performance.now(),rows=[];fixtureActors[0].session.activity='testing';social.update();const immediate={connected:old.isConnected,pose:getComputedStyle(part).transform,alpha:Number(getComputedStyle(old).opacity),active:social.state().active,exiting:social.state().exiting};const denied=social.trigger({kind:'tea-toast'}),afterDenied=social.state();function sample(now){rows.push({elapsed:now-started,connected:old.isConnected,alpha:old.isConnected?Number(getComputedStyle(old).opacity):0,pose:old.isConnected?getComputedStyle(part).transform:null});if(now-started<230)requestAnimationFrame(sample);else resolve({before,beforeAlpha,immediate,denied,afterDenied,rows,clocksContinued:originalAnimations.every((a,i)=>a.currentTime>clocks[i]+80),sameClocks:fixtureActors.every((a,i)=>a.body.getAnimations().includes(originalAnimations[i])),remaining:document.querySelectorAll('.agent-social-vignette').length});}requestAnimationFrame(sample);})`);
  assert.equal(exitReport.immediate.connected,true,'a visible original prop may not disappear at a real activity interruption');
  assert.equal(exitReport.immediate.pose,exitReport.before,'the actual decorative pose is held before exit');assert.ok(Math.abs(exitReport.immediate.alpha-exitReport.beforeAlpha)<.001);
  assert.equal(exitReport.immediate.active,null);assert.ok(exitReport.immediate.exiting);assert.equal(exitReport.denied,false,'no competing social plan or queued replay during the finite outgoing owner');assert.equal(exitReport.afterDenied.active,null);
  const visibleExit=exitReport.rows.filter(r=>r.connected&&r.alpha>0);assert.ok(visibleExit.length>=3,'several real fading frames remain visible');
  assert.ok(visibleExit.every(r=>r.pose===exitReport.before),'paused prop geometry never rewinds or advances');assert.ok(visibleExit.some(r=>r.alpha<.9)&&visibleExit.some(r=>r.alpha>0&&r.alpha<.5),'real alpha crosses multiple fade levels');
  assert.ok(exitReport.rows.find(r=>!r.connected)?.elapsed<=210,'finite exit clears within its160ms animation and native scheduling tolerance');assert.equal(exitReport.remaining,0);assert.equal(exitReport.clocksContinued,true);assert.equal(exitReport.sameClocks,true);
  checks.push({kind:'actual-activity-interruption',frames:exitReport.rows.length,visibleExitFrames:visibleExit.length,removedAt:exitReport.rows.find(r=>!r.connected).elapsed});
  await run(`fixtureActors[0].session.activity='coding';void 0`);

  for(const patch of [{language:'en'},{resolvedTheme:'winter'},{artworkKey:'workshop:spring-v2'}]){
    await run(`fixtureTime+=60000;fixtureContext={venue:'workshop',language:'zh',theme:'auto',resolvedTheme:'spring',artworkKey:'workshop:spring',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};social.update();void 0`);
    assert.equal(await run(`social.trigger({kind:'blueprint-pass'})`),true);await wait(620);
    const report=await run('('+observeContextExit.toString()+')('+JSON.stringify(patch)+')');
    assert.equal(report.preFrames,31);assert.equal(report.distinctPoses,31);assert.ok(report.postFrames>=31);assert.ok(report.finishedAt<=500&&report.totalElapsedMs<=1000);
    assert.equal(report.sameActors,true);assert.equal(report.ownedDuration,160);const visible=report.rows.filter(r=>r.connected&&r.alpha>0);
    assert.ok(visible.length>=3&&visible.some(r=>r.alpha<.9)&&visible.some(r=>r.alpha<.5),'a context change must retain several real alpha levels of the original pose');
    checks.push({kind:'actual-visual-context-interruption',patch,preFrames:report.preFrames,distinctPoses:report.distinctPoses,postFrames:report.postFrames,finishedAt:report.finishedAt,totalElapsedMs:report.totalElapsedMs});
  }
  // Actual world geometry supplies the local candidates. Bodies stay at their
  // fixture feet: no real movement or work/lifecycle facts are manufactured.
  await run(`fixtureTime+=60000;fixtureContext={venue:'workshop',language:'en',theme:'spring',artworkKey:'workshop:spring',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};
    window.localActors=[82,93].map((x,i)=>{const node=document.getElementById('a').cloneNode(true);node.id='local-'+i;node.style.cssText='left:'+(x*12.8-154*.65*.5)+'px;top:'+(44*7.2-129*.65*.7)+'px;transform:scale(.65);transform-origin:0 0';document.getElementById('world').append(node);return{id:'local:'+i,node,body:node.querySelector('.body'),serial:7,position:{x,y:44},session:{id:'local:'+i,provider:'codex',status:'active',activity:'testing',turnId:'observed-local'}}});
    fixtureActors.push(...localActors);social.update();void 0`);
  assert.equal(await run(`social.trigger({venue:'workshop',type:'circuit',point:{x:82,y:30},source:'keyboard'})`),true);
  assert.deepEqual((await run('social.state().active.ids')).sort(),['local:0','local:1']);
  const localReport=await run(`new Promise(resolve=>{const ids=social.state().active.ids,original=document.querySelector('.agent-social-vignette'),part=original.querySelector('.social-prop'),rows=[],before=JSON.stringify(localActors.map(a=>({session:a.session,serial:a.serial,position:a.position,html:a.node.outerHTML})));function frame(now){rows.push({at:now,pose:getComputedStyle(part).transform});if(rows.length<40)requestAnimationFrame(frame);else resolve({ids,frames:rows.length,distinctPoses:new Set(rows.map(r=>r.pose)).size,same:before===JSON.stringify(localActors.map(a=>({session:a.session,serial:a.serial,position:a.position,html:a.node.outerHTML}))),one:document.querySelectorAll('.agent-social-vignette').length===1});}requestAnimationFrame(frame);})`);
  assert.ok(localReport.frames>=31&&localReport.distinctPoses>=31);assert.equal(localReport.same,true);assert.equal(localReport.one,true);checks.push({kind:'manual-control-selects-actual-local-bench-pair',...localReport});
  await run(`fixtureContext.hidden=true;social.update();localActors.forEach(a=>a.node.remove());fixtureActors=fixtureActors.filter(a=>!a.id.startsWith('local:'));fixtureContext.hidden=false;fixtureTime+=60000;void 0`);
  const noLocal=await run(`(()=>{const before=JSON.stringify(social.state()),accepted=social.trigger({type:'circuit',point:{x:82,y:30}});return{accepted,unchanged:before===JSON.stringify(social.state()),nodes:document.querySelectorAll('.agent-social-vignette').length};})()`);
  assert.equal(noLocal.accepted,false);assert.equal(noLocal.unchanged,true);assert.equal(noLocal.nodes,0);checks.push({kind:'manual-no-local-pair-keeps-empty-and-does-not-consume-scheduler',...noLocal});

  for(const patch of [{venue:'teahouse'},{hidden:true},{reducedMotion:true},{lowPower:true}]){
    await run(`fixtureTime+=60000;fixtureContext={venue:'workshop',language:'en',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};social.update();void 0`);
    assert.equal(await run('social.trigger()'),true);await run(`Object.assign(fixtureContext,${JSON.stringify(patch)});social.update();void 0`);assert.equal(await run('social.state().active'),null);if(patch.venue)await wait(210);assert.equal(await run(`document.querySelectorAll('.agent-social-vignette').length`),0);
  }
  for(const mutation of ["fixtureActors[0].session.activity='testing'","fixtureActors[0].node.style.left='300px'","fixtureActors[0].motion={}","fixtureActors[0].entryPending=true","fixtureActors.pop()"]){
    await run(`fixtureTime+=60000;fixtureContext={venue:'workshop',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};fixtureActors[0].session.activity='coding';fixtureActors[0].node.style.left='280px';fixtureActors[0].motion=null;fixtureActors[0].entryPending=false;social.update();void 0`);
    assert.equal(await run('social.trigger()'),true);await run(mutation+';social.update();void 0');assert.equal(await run('social.state().active'),null);await wait(210);assert.equal(await run(`document.querySelectorAll('.agent-social-vignette').length`),0);
  }
  await run(`fixtureContext={venue:'workshop',language:'zh',hidden:false,reducedMotion:false,lowPower:false,mode:'live'};for(const n of document.querySelectorAll('#a,#b'))n.style.display='none';window.geometryReads=0;fixtureActors=Array.from({length:100},(_,i)=>{const node=document.createElement('div');node.className='actor';node.style.cssText='left:'+(55+(i%13)*91)+'px;top:'+(112+Math.floor(i/13)*67)+'px;transform:scale(.35);transform-origin:0 0';node.innerHTML='<div class="body"><div class="torso"></div></div>';document.getElementById('world').append(node);const body=node.firstElementChild,get=body.getBoundingClientRect.bind(body);body.getBoundingClientRect=()=>{geometryReads++;return get()};return{id:'crowd:'+i,node,body,session:{id:'crowd:'+i,provider:'codex',status:'active',activity:'coding'},entryPending:false,clonePhase:''}});fixtureTime+=60000;void 0`);
  assert.equal(await run('social.trigger()'),true);await run('geometryReads=0;void 0');await wait(50);
  const crowd=await run(`({actors:fixtureActors.length,nodes:document.querySelector('.agent-social-vignette').querySelectorAll('*').length,reads:geometryReads,participants:social.state().active.ids.length})`);
  assert.equal(crowd.actors,100);assert.equal(crowd.participants,2);assert.ok(crowd.nodes<80);assert.ok(crowd.reads<40,'active frame guard reads the pair, not the whole cast');
  await run(`fixtureContext.hidden=true;social.update();fixtureActors=[];fixtureContext.hidden=false;fixtureTime+=60000;void 0`);assert.equal(await run('social.trigger()'),false);await run('social.tick();social.destroy();social.destroy();void 0');await wait(80);assert.equal(await run(`document.querySelectorAll('.agent-social-vignette').length`),0);
  assert.equal(await run(`getComputedStyle(document.getElementById('social')).pointerEvents`),'none');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,choreographies:checks,distinctNativeFrames:pictures.size,finiteExit:checks.find(c=>c.kind==='actual-activity-interruption'),checks:['real dual gestures and original props','scene/activity/motion/resize/removal/quiet interruption','no actor or session mutation','no original animation replacement','single-flight and empty-room guard','finite cleanup and no pointer interception'],errors}));
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(guard);win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);});
