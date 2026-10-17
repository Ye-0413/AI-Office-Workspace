'use strict';
// Native production page. Synthetic local rollouts exercise real monitor/store;
// the reload phase uses isolated observed rows, not a live provider connection.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createCodexMonitor } = require('../lib/codex-monitor.cjs');
const { createSessionStore } = require('../lib/session-store.cjs');
const Director = require('../lib/animation-director.js');
const { installAudit } = require('./support/walking-native-audit.cjs');
const office = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'office-state-localization-'));
app.setPath('userData', path.join(profile, 'browser')); app.disableHardwareAcceleration();
const checks = [], errors = [], traces = [], events = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let win, monitor, stage = 'startup';
let settings = { language: 'en', agentScale: 1, reducedMotion: false, lowPower: false, idleVisitor: false,
  sceneVenue: 'workshop', sceneTheme: 'spring', sceneWeather: 'off' };
let snapshot = { mode: 'live', now: Date.now(), connections: [], sessions: [] };
const store = createSessionStore();
const normal = { main: 'codex:normal-a', other: 'codex:normal-b', helper: 'codex:normal-a:normal-helper' };
const quote = JSON.stringify;
function bounded(promise, label, ms = 50000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(stage + ': ' + label)), ms); })])
    .finally(() => clearTimeout(timer));
}
const run = source => bounded(win.webContents.executeJavaScript(source, true), 'renderer evaluation', 30000);
async function until(source, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await run(source)) return; await pause(20); }
  throw Error(stage + ': ' + label);
}
function publish(sessions = store.snapshot()) {
  snapshot = { ...snapshot, sessions, now: Date.now() };
  win.webContents.send('office:snapshot', snapshot);
}
function row(type, payload) { return JSON.stringify({ timestamp: new Date().toISOString(), type, payload }); }
const call = (id, cmd) => row('response_item', { type: 'function_call', name: 'exec_command', call_id: id,
  arguments: JSON.stringify({ cmd, private: 'PRIVATE ARGUMENT' }) });
const result = (id, body) => row('response_item', { type: 'function_call_output', call_id: id,
  output: JSON.stringify({ ...body, output: 'PRIVATE RESULT BODY' }) });
function append(file, ...rows) { fs.appendFileSync(file, rows.join('\n') + '\n'); monitor.poll(); publish(); }
function session(id = normal.main) { return store.snapshot().find(s => s.id === id); }
function noTerminals() {
  assert.equal(events.some(e => ['turn-end','interrupted','session-end','subagent-end'].includes(e.event)), false);
  assert.ok(store.snapshot().every(s => !s.closed && s.turnCompletedAt === undefined));
  assert.ok(!JSON.stringify({ events, sessions: store.snapshot() }).includes('PRIVATE'));
}
async function capture(name) {
  const directory = process.env.MINI_OFFICE_STATE_LOCALIZATION_PREVIEW_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name + '.png'), (await win.webContents.capturePage()).toPNG());
}
// Reads original production arrival references only. No actor/path mutation.
function actualSettled(ids) {
  return ids.every(id => {
    const actor = window.crowdActors.get(id), node = document.querySelector('.actor[data-session-id="' + id + '"]');
    if (!actor || actor.node !== node || actor.entryPending || actor.motion || actor.routeReservation || actor.navigation
      || actor.resumeNavigation || actor.pendingStation || actor.yielding || actor.departing || actor.cloneCharge
      || ['splitting','returning','absorbing'].includes(actor.clonePhase)) return false;
    const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return node.dataset.walking !== 'true' && getComputedStyle(node).visibility !== 'hidden'
      && Number(getComputedStyle(node).opacity) === 1 && Math.hypot(m.m41 - actor.target.x * 12.8, m.m42 - actor.target.y * 7.2) < .02
      && !node.getAnimations().some(a => a.pending || a.playState === 'running');
  }) && Number(document.getElementById('office').dataset.entranceQueue) === 0;
}
async function settled(ids) { await until('(' + actualSettled.toString() + ')(' + quote(ids) + ')', 'actual endpoints and all physical owners must drain'); }
async function finiteBodySettled(id) {
  await run(`(async()=>{const body=crowdActors.get(${quote(id)}).body;
    const owners=body.getAnimations({subtree:true}).filter(a=>typeof a.animationName!=='string'&&Number.isFinite(a.effect.getTiming().iterations));
    await Promise.all(owners.map(a=>a.finished));await new Promise(requestAnimationFrame);
    await Promise.all(body.getAnimations({subtree:true}).filter(a=>typeof a.animationName==='string').map(a=>a.ready));})()`);
}
function observeWalkingCancellation(id, frames = 40) {
  const held = window.stateWalkHeld, actor = crowdActors.get(id), bad = [], rows = [];
  return new Promise((resolve, reject) => {
    function tick(now) {
      try {
        const node = document.querySelector('.actor[data-session-id="' + id + '"]'), m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        if (actor !== held.actor || actor.serial !== held.serial || actor.motion !== held.motion
          || !node.getAnimations().includes(held.motion) || held.motion.playState !== 'running') bad.push('original physical owner changed');
        if (node !== held.node || node.querySelector('.character-body') !== held.body || node.querySelector('.ap-rig') !== held.rig
          || node.querySelector('.character-body>img') !== held.image) bad.push('body/rig/image changed');
        if (node.dataset.walking !== 'true' || !held.loops.every(a=>held.body.getAnimations({subtree:true}).includes(a))) bad.push('original gait lost');
        if (actor.session.activity !== 'testing' || actor.session.activeTools !== 1 || actor.session.closed
          || /error|tool-failure|recent-work/.test(node.dataset.phase || '')) bad.push('cancel invented error/recent work or closure');
        rows.push({ at: now, x: m.m41, y: m.m42, serial: actor.serial, progress: held.motion.effect.getComputedTiming().progress,
          phase: node.dataset.phase, gaitTime: held.loops[0].currentTime });
        if (rows.length === frames) resolve({ frames: rows.length, distinctFeet: new Set(rows.map(r=>r.x.toFixed(3)+'/'+r.y.toFixed(3))).size,
          bad: [...new Set(bad)], rows }); else requestAnimationFrame(tick);
      } catch (error) { reject(error); }
    }
    requestAnimationFrame(tick);
  });
}
function observeWorkCancellation(id) {
  const held = window.stateWorkHeld, rows = [], bad = [];
  return new Promise((resolve, reject) => {
    function tick(now) {
      try {
        const actor = crowdActors.get(id), node = actor.node, layer = actor.body.querySelector('.avatar-performance');
        if (node !== held.node || actor.body !== held.body || actor.body.querySelector('.ap-rig') !== held.rig
          || layer.dataset.kind !== held.kind || actor.serial !== held.serial || actor.motion) bad.push('stable work owner changed');
        const live = actor.body.getAnimations({subtree:true});
        if (!held.css.every(o=>live.includes(o.animation)&&o.animation.playState==='running'&&o.animation.currentTime>=o.time)) bad.push('CSS replayed or stopped');
        if (actor.session.activity !== 'testing' || actor.session.activeTools !== 1 || /error|tool-failure|recent-work/.test(node.dataset.phase||'')) bad.push('false state after cancellation');
        rows.push({ at: now, kind: layer.dataset.kind, phase: node.dataset.phase, times: held.css.map(o=>o.animation.currentTime) });
        if (rows.length === 31) resolve({ frames: rows.length, css: held.css.length, advanced: held.css.every(o=>o.animation.currentTime>o.time), bad:[...new Set(bad)], rows });
        else requestAnimationFrame(tick);
      } catch (error) { reject(error); }
    }
    requestAnimationFrame(tick);
  });
}
function denseSettled(count) {
  const nodes = [...document.querySelectorAll('.actor[data-session-id]')];
  return nodes.length === count && Number(document.getElementById('office').dataset.entranceQueue) === 0
    && nodes.every(node=>getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)===1
      && node.dataset.walking!=='true'&&!['queued','waiting-space','yielding'].includes(node.dataset.traffic)
      && !['splitting','returning','absorbing'].includes(node.dataset.clonePhase)
      && !node.getAnimations().some(a=>a.pending||a.playState==='running'));
}
async function language(value) {
  if (settings.language !== value) await run("document.getElementById('language-button').click();void 0");
  await until('document.documentElement.lang===' + quote(value === 'en' ? 'en' : 'zh-CN'), 'actual language control');
}
async function titleCheck(task, expected) {
  await run(`document.querySelector('.actor[data-session-id="${task.id}"] .actor-button').click();void 0`);
  const inspector = await run(`(()=>{const n=document.getElementById('inspect-title');return{text:n.textContent,children:n.childElementCount,
    aria:document.querySelector('.actor[data-session-id="${task.id}"] .actor-button').getAttribute('aria-label')};})()`);
  assert.equal(inspector.text, expected); assert.equal(inspector.children, 0); assert.ok(inspector.aria.includes(expected));
  await run("document.getElementById('roster-button').click();void 0");
  const roster = await run(`(()=>{const name=OfficeAgentPersona.forSession(${quote(task)}).aliasEn;
    const row=[...document.querySelectorAll('.roster-row')].find(n=>n.querySelector('strong').textContent===name),n=row?.querySelector('.roster-task');
    return n?{text:n.textContent,children:n.childElementCount}:null;})()`);
  assert.ok(roster); assert.equal(roster.text, expected); assert.equal(roster.children, 0);
  await run("document.getElementById('roster-dialog').close();void 0");
}
function inspectDense(cast, parentId, helperId) {
  const factor = document.getElementById('world').getBoundingClientRect().width / 1280;
  return cast.map(session=>{
    const node=document.querySelector('.actor[data-session-id="'+session.id+'"]'),held=window.localeOriginals?.get(session.id);
    const m=new DOMMatrixReadOnly(getComputedStyle(node).transform),p=node.querySelector('.nameplate').getBoundingClientRect();
    const persona=OfficeAgentPersona.forSession(session),en=document.documentElement.lang==='en';
    const current=node.querySelector('.actor-title').textContent;
    return {id:session.id,name:current,expected:en?persona.aliasEn:persona.aliasZh,scale:Math.hypot(m.m11,m.m12),x:m.m41,y:m.m42,
      same:!held||node===held.node&&node.querySelector('.character-body')===held.body&&node.querySelector('.ap-rig')===held.rig&&node.querySelector('.character-body>img')===held.image,
      footDrift:held?Math.hypot(m.m41-held.x,m.m42-held.y):0,z:getComputedStyle(node).zIndex,
      plate:[p.width/factor/Math.hypot(m.m11,m.m12),p.height/factor/Math.hypot(m.m11,m.m12)],
      active:node.dataset.activeClones,total:node.dataset.totalClones,relation:node.querySelector('.actor-relation').textContent,
      isParent:session.id===parentId,isHelper:session.id===helperId};
  });
}
function bubbleLocaleObservation(id) {
  const held = window.bubbleLocaleHeld, rows = [];
  let clickedAt = null, owner = null, finished = null, completedAt = null, deadline = null, ended = false;
  return new Promise((resolve, reject) => {
    function fail(error) {
      if (ended) return; ended = true; clearTimeout(deadline);
      reject(Error('locale-only bubble: ' + error.message + ' ' + JSON.stringify({rows,completedAt})));
    }
    function ensure(value, message) { if (!value) throw Error(message); }
    function tick(now) {
      if (ended) return;
      try {
        const actor = stateArrivalActors.get(id), node = document.querySelector('.actor[data-session-id="'+id+'"]');
        const bubble = node.querySelector('.actor-bubble'), alpha = Number(getComputedStyle(bubble).opacity);
        ensure(actor === held.actor && actor.serial === held.serial && node === held.node && actor.body === held.body
          && node.querySelector('.ap-rig') === held.rig && actor.image === held.image && bubble === held.bubble,
          'language change replaced an original body/rig/bubble or changed serial');
        ensure(node.dataset.reaction === 'true' && held.delays.every(delay=>actor.delays.has(delay)),
          'the original greeting reaction/delay owner must remain intact during the finite locale sample');
        rows.push({at:now-held.at,afterClick:clickedAt===null?null:performance.now()-clickedAt,locale:document.documentElement.lang,
          text:bubble.textContent,show:bubble.dataset.show,opacity:alpha,
          owner:owner?{state:owner.playState,time:owner.currentTime,progress:owner.effect.getComputedTiming().progress}:null});
        if (clickedAt === null) {
          ensure(rows.length === 1 && bubble.dataset.show === 'true' && alpha === 1 && bubble.textContent === held.text,
            'first actual RAF must still paint the completed Chinese greeting entrance');
          clickedAt = performance.now();
          document.getElementById('language-button').click();
          // Force only a read of the actual new CSS exit, after the real click.
          const after = Number(getComputedStyle(bubble).opacity);
          const owners = bubble.getAnimations().filter(a=>a.constructor.name==='CSSTransition'&&a.transitionProperty==='opacity');
          ensure(bubble.dataset.show === 'false' && owners.length === 1, 'locale must hide a showing bubble through one actual opacity exit');
          owner = owners[0]; finished = owner.finished;
          const timing = owner.effect.getTiming(), keys = owner.effect.getKeyframes();
          ensure(owner.effect.target === bubble && timing.duration === 160 && timing.iterations === 1
            && keys.length === 2 && Number(keys[0].opacity) === 1 && Number(keys[1].opacity) === 0,
            'capture the original full 160ms visible-to-hidden CSS transition');
          rows.push({at:performance.now()-held.at,afterClick:performance.now()-clickedAt,locale:document.documentElement.lang,
            text:bubble.textContent,show:bubble.dataset.show,opacity:after,clickObservation:true,
            owner:{state:owner.playState,time:owner.currentTime,progress:owner.effect.getComputedTiming().progress,duration:timing.duration}});
          const remaining = 1000 - (performance.now() - clickedAt);
          ensure(remaining > 0, 'stop-to-tail1000ms budget already expired');
          deadline = setTimeout(()=>fail(Error('actual exit plus31RAF exceeded its original1000ms bound')), remaining);
          finished.then(()=>{
            if (ended) return;
            try {
              completedAt = performance.now() - clickedAt;
              ensure(completedAt <= 500 && owner.finished === finished && owner.playState === 'finished',
                'the same CSS owner must finish naturally within500ms; cancellation/replacement cannot pass');
            } catch (error) { fail(error); }
          }, error=>fail(Error('original opacity exit canceled: '+error.message)));
        } else {
          ensure(bubble.dataset.show === 'false', 'locale must not replay the old phrase');
          if (completedAt !== null) ensure(alpha === 0, 'old text must be invisible after actual transition completion');
          if (performance.now()-clickedAt > 500) ensure(completedAt !== null, 'natural completion missed500ms bound');
          const postClickFrames = rows.filter(row=>row.afterClick!==null&&!row.clickObservation).length;
          if (postClickFrames >= 31 && completedAt !== null) {
            ensure(performance.now()-clickedAt <= 1000 && alpha === 0, 'exact final invisible tail within1000ms');
            ended = true; clearTimeout(deadline);
            return resolve({frames:rows.length,postClickFrames,rows,completionElapsedMs:completedAt,
              completionLimitMs:500,totalLimitMs:1000,totalElapsedMs:performance.now()-clickedAt,
              originalTransitionDuration:owner.effect.getTiming().duration,sameGreetingSerial:true,sameDelayOwners:held.delays.length,finalAlpha:alpha});
          }
        }
        requestAnimationFrame(tick);
      } catch (error) { fail(error); }
    }
    requestAnimationFrame(tick);
  });
}
const guard = setTimeout(()=>{console.error('State/localization fixture timed out at '+stage);app.exit(1);},240000);
app.whenReady().then(async()=>{
  for(const[name,fn]of Object.entries({snapshot:()=>snapshot,settings:()=>settings,'set-settings':patch=>(settings={...settings,...patch}),
    displays:()=>[], 'setup-status':()=>({running:false,rows:[],totals:{configured:0,failed:0,pending:0,skipped:0}})}))
    ipcMain.handle('office:'+name,(_, ...args)=>fn(...args));
  ipcMain.on('office:renderer-error',(_,error)=>errors.push(error));
  win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:true,focusable:false,webPreferences:{
    preload:path.join(office,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.on('render-process-gone',(_,details)=>errors.push('renderer gone: '+details.reason));
  win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
    errors.push('unexpected network: '+details.url);callback({cancel:true});});
  await bounded(win.loadFile(path.join(office,'renderer/index.html')),'production page');
  win.webContents.debugger.attach('1.3');
  await bounded(win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]}),'ordinary motion');
  await run('('+installAudit.toString()+')()');

  stage='normal-monitor-cancellation';
  const date=new Date(),dir=path.join(profile,'synthetic-codex','sessions',String(date.getFullYear()),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0'));
  fs.mkdirSync(dir,{recursive:true});
  const file=(id,extra={})=>{const name=path.join(dir,'rollout-'+id+'.jsonl');fs.writeFileSync(name,row('session_meta',{id,session_id:id,cwd:'/fixture/state-localization',source:'vscode',...extra})+'\n');return name;};
  const a=file('normal-a'),b=file('normal-b');
  const child=file('normal-helper',{session_id:'normal-a',parent_thread_id:'normal-a',thread_source:'subagent',source:{subagent:{thread_spawn:{parent_thread_id:'normal-a'}}}});
  monitor=createCodexMonitor({codexHome:path.join(profile,'synthetic-codex'),intervalMs:60000,onEvent:event=>{events.push(event);store.ingest(event);}});monitor.start();
  await run(`crowdAudit.begin('real monitored main entries',${quote([normal.main,normal.other])},[]);void 0`);
  fs.appendFileSync(a,[row('event_msg',{type:'task_started',turn_id:'turn-a'}),call('read-a','cat README.md')].join('\n')+'\n');
  fs.appendFileSync(b,[row('event_msg',{type:'task_started',turn_id:'turn-b'}),call('read-b','cat package.json')].join('\n')+'\n');monitor.poll();publish();
  await until("Number(document.getElementById('office').dataset.entranceQueue)>0",'genuine production admission queue');
  const queue=await run(`(()=>{const ns=[...document.querySelectorAll('.actor[data-session-id]')],q=Number(document.getElementById('office').dataset.entranceQueue);
    return{productionQueue:q,unadmittedDOM:ns.filter(n=>getComputedStyle(n).visibility==='hidden').length,
      summary:document.getElementById('room-summary').textContent};})()`);
  assert.ok(queue.productionQueue>0);assert.equal(queue.productionQueue,queue.unadmittedDOM);
  assert.ok(queue.summary.endsWith(queue.productionQueue+' waiting to enter'));assert.equal(/[\u3400-\u9fff]/.test(queue.summary),false);
  checks.push({name:'English entrance suffix matches production-derived entryPending count and independent unadmitted DOM',...queue});
  await settled([normal.main,normal.other]);
  const entries=await run('crowdAudit.finish()');assert.deepEqual(entries.violations,[]);checks.push(entries);
  await run(`crowdAudit.begin('real helper split and monitored tool cancellation',${quote(Object.values(normal))},[]);void 0`);
  append(child,row('event_msg',{type:'task_started',turn_id:'turn-helper'}),row('response_item',{type:'function_call',name:'update_plan',arguments:'{}',call_id:'helper-plan'}));
  await settled(Object.values(normal));
  const family=await run(`(()=>{const p=crowdActors.get(${quote(normal.main)}),c=crowdActors.get(${quote(normal.helper)});
    window.normalOriginals=new Map([...crowdActors].map(([id,a])=>[id,{node:a.node,body:a.body,rig:a.body.querySelector('.ap-rig'),image:a.image}]));return{
    count:document.querySelectorAll('.actor[data-session-id]').length,roots:[...crowdActors.values()].filter(a=>!a.helper).length,
    origin:c.node.dataset.cloneOrigin,parent:c.session.parentId,active:p.node.dataset.activeClones,total:p.node.dataset.totalClones,
    arrivals:crowdArrivals.filter(e=>e.id===c.id).map(e=>e.kind)};})()`);
  assert.equal(family.count,3);assert.equal(family.roots,2);assert.equal(family.origin,normal.main);assert.equal(family.parent,normal.main);
  assert.equal(family.active,'1');assert.equal(family.total,'1');assert.ok(family.arrivals.includes('entry'));checks.push({name:'two independent real mains and one observed-parent helper',...family});
  append(a,result('read-a',{exit_code:0}),call('test-a','npm test'),call('test-b','npm test'));
  await until(`(()=>{const a=crowdActors.get(${quote(normal.main)}),m=a?.motion;if(!m||m.playState!=='running')return false;
    const p=m.effect.getComputedTiming().progress,first=new DOMMatrixReadOnly(m.effect.getKeyframes()[0].transform),at=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);
    return p>.15&&p<.5&&Math.hypot(at.m41-first.m41,at.m42-first.m42)>=24;})()`,'original functional walk must be 15–50% complete and more than24 world pixels from source');
  const walking=await run(`(()=>{const a=crowdActors.get(${quote(normal.main)}),body=a.body,m=a.motion,keys=m.effect.getKeyframes(),first=new DOMMatrixReadOnly(keys[0].transform),at=new DOMMatrixReadOnly(getComputedStyle(a.node).transform);
    window.stateWalkHeld={actor:a,node:a.node,body,rig:body.querySelector('.ap-rig'),image:a.image,serial:a.serial,motion:m,
      loops:body.getAnimations({subtree:true}).filter(x=>typeof x.animationName!=='string'&&x.effect.getTiming().iterations===Infinity)};
    return{progress:m.effect.getComputedTiming().progress,worldDistance:Math.hypot(at.m41-first.m41,at.m42-first.m42),loops:stateWalkHeld.loops.length,serial:a.serial};})()`);
  assert.ok(walking.loops>=8);
  append(a,result('test-a',{interrupted:true,exit_code:1}));
  assert.equal(session().activity,'testing');assert.equal(session().activeTools,1);
  await until(`crowdActors.get(${quote(normal.main)})?.session.activeTools===1`,'cancellation snapshot reaches the original walking actor');
  const walk=await run('('+observeWalkingCancellation.toString()+')('+quote(normal.main)+')');
  assert.deepEqual(walk.bad,[]);assert.ok(walk.frames>=31&&walk.distinctFeet>=31);traces.push({name:'walking cancellation',...walk});checks.push({name:'mid-route cancellation retains original physical/serial/gait owners',...walking,frames:walk.frames,distinctFeet:walk.distinctFeet});
  await settled(Object.values(normal));await finiteBodySettled(normal.main);
  append(a,call('test-c','npm test'));
  await until(`crowdActors.get(${quote(normal.main)}).session.activeTools===2`,'real second parallel tool at the stable testing station');
  const css=await run(`(()=>{const a=crowdActors.get(${quote(normal.main)}),body=a.body,layer=body.querySelector('.avatar-performance');
    window.stateWorkHeld={node:a.node,body,rig:body.querySelector('.ap-rig'),kind:layer.dataset.kind,serial:a.serial,
      css:body.getAnimations({subtree:true}).filter(x=>typeof x.animationName==='string'&&x.effect.getTiming().iterations===Infinity&&x.playState==='running').map(animation=>({animation,time:animation.currentTime}))};
    return{kind:stateWorkHeld.kind,count:stateWorkHeld.css.length};})()`);
  // Existing performance mapping: observed testing uses the probe animation family.
  assert.equal(css.kind,'probe');assert.ok(css.count>0,'ordinary work phase must expose nonempty actual CSS clocks');
  append(a,result('test-c',{interrupted:true,exit_code:1}));
  await until(`crowdActors.get(${quote(normal.main)}).session.activeTools===1`,'stable cancellation snapshot');
  const work=await run('('+observeWorkCancellation.toString()+')('+quote(normal.main)+')');
  assert.deepEqual(work.bad,[]);assert.equal(work.advanced,true);assert.ok(work.css>0);traces.push({name:'stationary cancellation',...work});checks.push({name:'same nonempty testing CSS objects advance through a parallel cancellation',frames:work.frames,css:work.css});
  append(a,result('test-b',{interrupted:true,exit_code:1}));
  assert.equal(session().activity,'planning');assert.equal(session().activeTools,0);noTerminals();
  for(const id of ['test-a','test-b','test-c'])assert.equal(events.find(e=>e.event==='tool-end'&&e.toolCallId===id)?.outcome,'cancelled');
  assert.equal(Director.observedWork(session(),{now:Date.now()}),null);
  await settled(Object.values(normal));
  const final=await run(`(()=>{const a=crowdActors.get(${quote(normal.main)}),p=a.node;return{same:p===stateWorkHeld.node&&a.body===stateWorkHeld.body&&a.body.querySelector('.ap-rig')===stateWorkHeld.rig,
    allSame:[...normalOriginals].every(([id,o])=>{const a=crowdActors.get(id);return a.node===o.node&&a.body===o.body&&a.body.querySelector('.ap-rig')===o.rig&&a.image===o.image;}),
    activity:a.session.activity,phase:p.dataset.phase,clones:p.dataset.activeClones,total:p.dataset.totalClones,helper:crowdActors.get(${quote(normal.helper)}).node.dataset.clonePhase};})()`);
  assert.equal(final.same,true);assert.equal(final.allSame,true);assert.equal(final.activity,'planning');assert.doesNotMatch(final.phase,/error|tool-failure|recent-work/);assert.equal(final.clones,'1');assert.equal(final.total,'1');assert.equal(final.helper,'working');
  const audit=await run('crowdAudit.finish()');assert.deepEqual(audit.violations,[]);checks.push({name:'last cancellation allows the real planning handoff without ending turn or helper',...final,audit});
  monitor.stop();monitor=null;

  stage='cold-dense-localization';
  const kinds=['reading','planning','coding','testing','idle','unknown'];
  const task=(i,activity,parentId)=>({id:'codex:transfer-'+String(i).padStart(3,'0'),sessionId:'transfer-'+i,provider:'codex',status:'active',activity,parentId,
    activeTools:['idle','unknown'].includes(activity)?0:1,lastEventAt:Date.now(),projectPath:'/fixture/nameplates',events:[],evidence:{source:'hook',confidence:'explicit'}});
  const cast=Array.from({length:12},(_,i)=>task(i,kinds[i%6]));
  cast[1].title='';cast[2].title='未命名任务';cast[3].title='<b>真实标题</b> /tmp/项目/a.js';
  const parent=cast[2],helper=task(12,'planning',parent.id);cast.push(helper);
  settings={...settings,language:'zh',reducedMotion:true};snapshot={...snapshot,now:Date.now(),sessions:cast};
  // Observe genuine cold-start arrivals before app initialization; no API is
  // wrapped, and no business state/event/animation is manufactured.
  await bounded(win.webContents.debugger.sendCommand('Page.enable'),'enable passive arrival observation');
  await bounded(win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:
    "window.stateArrivalActors=new Map();document.addEventListener('office:actor-arrival',event=>{if(event.detail?.actor)stateArrivalActors.set(event.detail.actorId,event.detail.actor);},true);"}),
    'read-only cold actual-arrival listener');
  const reloaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.reload();await bounded(reloaded,'actual production reload');
  await until('('+denseSettled.toString()+')(13)','cold13 real observed bodies');
  assert.equal(await run(`window.stateArrivalActors instanceof Map&&stateArrivalActors.has(${quote(cast[0].id)})
    &&stateArrivalActors.get(${quote(cast[0].id)}).node===document.querySelector('.actor[data-session-id="${cast[0].id}"]')`),
    true,'passive cold capture must retain the actual arrival actor and its exact DOM node');
  await run('('+installAudit.toString()+')()');
  await run(`crowdAudit.begin('cold13 locale and viewport continuity',${quote(cast.map(s=>s.id))},[]);
    window.localeOriginals=new Map([...document.querySelectorAll('.actor[data-session-id]')].map(node=>{const m=new DOMMatrixReadOnly(getComputedStyle(node).transform);return[node.dataset.sessionId,{node,body:node.querySelector('.character-body'),rig:node.querySelector('.ap-rig'),image:node.querySelector('.character-body>img'),x:m.m41,y:m.m42}];}));void 0`);
  const zh=await run('('+inspectDense.toString()+')('+quote(cast)+','+quote(parent.id)+','+quote(helper.id)+')');
  assert.ok(zh.every(r=>r.name===r.expected));
  await language('en');await until('('+denseSettled.toString()+')(13)','English bodies settle without fabricated arrival');
  for(const size of [[1280,720],[800,450],[800,800]]){
    win.setContentSize(...size);
    await until('innerWidth==='+size[0]+'&&innerHeight==='+size[1], 'native viewport dimensions');
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await until('('+denseSettled.toString()+')(13)','actual viewport fit settlement');
    const rows=await run('('+inspectDense.toString()+')('+quote(cast)+','+quote(parent.id)+','+quote(helper.id)+')');
    for(const r of rows){assert.equal(r.same,true);assert.equal(r.z,'10');assert.equal(r.name,r.expected);assert.ok(r.footDrift<.02,'locale/viewport must retain actual world foot: '+r.id);
      assert.ok(r.scale>=.4-.00001,'the existing13 profile must not silently lose its actual .4 fit');assert.ok(Math.abs(r.plate[0]-220)<.2&&Math.abs(r.plate[1]-70)<.2);}
    const p=rows.find(r=>r.isParent),h=rows.find(r=>r.isHelper);
    assert.equal(p.relation,'Active 1 · Total 1');assert.ok(h.relation.includes(p.name));
    const footer=await run("document.getElementById('room-summary').textContent");
    assert.equal(footer,'12 independent tasks · 1 temporary helper · fitted to '+Math.round(rows[0].scale*100)+'% for everyone');
    assert.equal(/[\u3400-\u9fff]/.test(footer),false);
    if(size[1]===800)assert.ok(await run("document.getElementById('world').getBoundingClientRect().top>20"));
    checks.push({name:'cold13 English app copy and original bodies/feet',viewport:size,scale:rows[0].scale,footer,rootRelation:p.relation});
    await capture('thirteen-en-'+size.join('x'));
  }
  await titleCheck(cast[0],'Untitled task');await titleCheck(cast[1],'Untitled task');
  await titleCheck(cast[2],'未命名任务');await titleCheck(cast[3],'<b>真实标题</b> /tmp/项目/a.js');
  checks.push({name:'empty application placeholders translate while literal Chinese title and markup/path source remain exact text'});
  win.setContentSize(1280,720);await until('innerWidth===1280&&innerHeight===720','native room size restoration');
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await until('('+denseSettled.toString()+')(13)','restore room before greeting');
  await language('zh');await until('('+denseSettled.toString()+')(13)','Chinese room before real greeting');
  const greetingId=cast[0].id;
  await run(`(()=>{document.querySelector('.actor[data-session-id="${greetingId}"] .actor-button').click();document.getElementById('greet-agent').click();
    const b=document.querySelector('.actor[data-session-id="${greetingId}"] .actor-bubble');getComputedStyle(b).opacity;
    window.greetingEntrance=b.getAnimations().filter(a=>a.constructor.name==='CSSTransition'&&a.transitionProperty==='opacity');})();void 0`);
  await until(`document.querySelector('.actor[data-session-id="${greetingId}"]').dataset.reaction==='true'`,'actual greeting begins');
  await run('Promise.all(greetingEntrance.map(animation=>animation.finished))');
  await until(`(()=>{const n=document.querySelector('.actor[data-session-id="${greetingId}"]'),b=n.querySelector('.actor-bubble');return n.dataset.reaction==='true'
    &&b.dataset.show==='true'&&Number(getComputedStyle(b).opacity)===1&&!b.getAnimations().some(a=>a.transitionProperty==='opacity'&&(a.pending||a.playState==='running'));})()`,
    'original greeting entrance must complete naturally while the reaction is still active',1500);
  const bubble=await run(`(()=>{const node=document.querySelector('.actor[data-session-id="${greetingId}"]'),b=node.querySelector('.actor-bubble'),a=stateArrivalActors.get(${quote(greetingId)});
    if(!a||a.node!==node)throw Error('cold greeting requires its real production arrival actor reference');
    window.bubbleLocaleHeld={actor:a,serial:a.serial,delays:[...a.delays],node,body:a.body,image:a.image,rig:node.querySelector('.ap-rig'),
      bubble:b,text:b.textContent,at:performance.now()};
    return{text:b.textContent,show:b.dataset.show,opacity:Number(getComputedStyle(b).opacity),serial:a.serial,delayOwners:a.delays.size};})()`);
  assert.ok(/[\u3400-\u9fff]/.test(bubble.text));assert.equal(bubble.show,'true');assert.equal(bubble.opacity,1);assert.ok(bubble.delayOwners>0);
  const bubbleTrace=await run('('+bubbleLocaleObservation.toString()+')('+quote(greetingId)+')');
  assert.ok(bubbleTrace.postClickFrames>=31);assert.equal(bubbleTrace.finalAlpha,0);assert.equal(bubbleTrace.originalTransitionDuration,160);
  assert.ok(bubbleTrace.completionElapsedMs<=500&&bubbleTrace.totalElapsedMs<=1000);
  traces.push({name:'real locale-only showing bubble retirement during an unchanged greeting owner',before:bubble,...bubbleTrace});
  checks.push({name:'locale hides a showing Chinese bubble through its original natural160ms exit;31postRAF retain body/serial/reaction',
    frames:bubbleTrace.postClickFrames,completionElapsedMs:bubbleTrace.completionElapsedMs,totalElapsedMs:bubbleTrace.totalElapsedMs,serial:bubble.serial});
  // The next greeting is a separate legitimate reaction after the first owner
  // really finishes; its cancelAction is not part of the locale-only baseline.
  await until(`document.querySelector('.actor[data-session-id="${greetingId}"]').dataset.reaction==='false'&&${'('+denseSettled.toString()+')(13)'}`,
    'original actual reaction delay must finish before separate English greeting');
  await until("document.documentElement.lang==='en'",'English after locale-only bubble phase');
  await run("document.getElementById('greet-agent').click();void 0");
  const enGreeting=await run(`(()=>{const node=document.querySelector('.actor[data-session-id="${greetingId}"]'),b=node.querySelector('.actor-bubble');return{text:b.textContent,expected:OfficeAgentPersona.forSession(${quote(cast[0])}).greetingEn,show:b.dataset.show};})()`);
  assert.equal(enGreeting.text,enGreeting.expected);assert.equal(enGreeting.show,'true');assert.equal(/[\u3400-\u9fff]/.test(enGreeting.text),false);
  checks.push({name:'a separate real English greeting uses the stable existing persona',...enGreeting});
  const localeAudit=await run('crowdAudit.finish()');assert.deepEqual(localeAudit.violations,[]);checks.push(localeAudit);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,scope:'synthetic-rollout-to-production-state-and-locale',checks,errors}));
}).catch(async error=>{
  console.error(stage,error);process.exitCode=1;
  try{await capture('failure');}catch(_){}
}).finally(()=>{
  const directory=process.env.MINI_OFFICE_STATE_LOCALIZATION_PREVIEW_DIR;
  if(directory){fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({stage,checks,errors,traces,events},null,2));}
  clearTimeout(guard);monitor?.stop();win?.destroy();fs.rmSync(profile,{recursive:true,force:true});app.exit(process.exitCode||0);
});
