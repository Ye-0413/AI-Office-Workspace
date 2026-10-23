'use strict';
// Execute real renderer setup, refreshScale and beforeunload registration.
// Deterministic event/DOM boundaries establish synchronous ownership only;
// these assertions do not certify Chromium's rAF/ResizeObserver/paint order.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function between(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert.ok(start>=0&&end>start,'real production source boundary exists');return source.slice(start,end);}
const refresh=between('  function refreshScale()','  function actorTransform(');
const setup=between('  const observer = new ResizeObserver(refreshScale);',"  $('room-art').addEventListener('error'");
const cleanup=between("  window.addEventListener('beforeunload',",'\n})();');
function fixture(){
  const listeners=new Map(),removed=[],observers=[],calls={render:0,routes:0,raf:0,clearedActors:0};
  const frame={style:{transform:''}},office={clientWidth:1280,clientHeight:720,removeEventListener(){}};
  const motion=Object.freeze({currentTime:123.5,playState:'running'}),css=Object.freeze({currentTime:812,playState:'running'});
  const actor=Object.freeze({id:'codex:resize-real-owner',serial:7,position:Object.freeze({x:31,y:69}),target:Object.freeze({x:71,y:44}),motion,body:Object.freeze({}),image:Object.freeze({}),css});
  const actors=new Map([[actor.id,actor]]),seats=new Map([[actor.id,actor.target]]);
  const external=()=>{calls.external=(calls.external||0)+1;};
  const window={
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
    removeEventListener(type,callback){removed.push({type,callback});listeners.get(type)?.delete(callback);},
    dispatch(type){for(const callback of [...(listeners.get(type)||[])])callback({type});}
  };
  window.addEventListener('resize',external);
  class ResizeObserver {
    constructor(callback){this.callback=callback;this.targets=[];this.disconnected=false;observers.push(this);}
    observe(target){this.targets.push(target);}
    disconnect(){this.disconnected=true;this.targets=[];}
    deliver(){if(!this.disconnected)this.callback();}
  }
  const context={Scene,office,$:id=>{assert.equal(id,'world-frame');return frame;},window,ResizeObserver,
    document:{removeEventListener(){}},actors,seats,uniformScale:.4,destroyed:false,
    refreshVisibility(){},onStationArrival(){},usageHistory:null,setupAssistant:null,manualQuestions:{dispose(){calls.questionsDisposed=(calls.questionsDisposed||0)+1;}},
    visitor:{destroy(){}},stationArrival:null,social:null,venueStage:null,festivalStage:null,themeEnvironment:null,
    scenery:{destroy(){}},performanceClocks:{clear(){}},unsubscribe:null,
    clockTimer:0,secondsTimer:0,navigationTimer:0,frameTimer:0,admissionFrame:0,trafficTimer:0,doorTimer:0,
    clearInterval(){},clearTimeout(){},cancelAnimationFrame(){},clearTrafficBlock(){},
    clearActors(){calls.clearedActors++;},render(){calls.render++;throw Error('resize must not render actor layout');},
    cancelPhysicalRoutes(){calls.routes++;throw Error('resize must not cancel physical owners');},
    requestAnimationFrame(){calls.raf++;throw Error('resize must not create an extra RAF loop');}
  };
  const c=vm.createContext(context);vm.runInContext(refresh+setup+cleanup,c);
  assert.equal(observers.length,1);assert.equal(observers[0].callback,c.refreshScale);assert.deepEqual(observers[0].targets,[office]);
  return {c,frame,office,actor,motion,css,actors,seats,window,listeners,removed,observer:observers[0],calls,external};
}
function unchanged(h){
  assert.equal(h.c.actors,h.actors);assert.equal(h.actors.get(h.actor.id),h.actor);assert.equal(h.c.seats,h.seats);
  assert.equal(h.actor.motion,h.motion);assert.equal(h.actor.motion.currentTime,123.5);assert.equal(h.actor.css,h.css);assert.equal(h.actor.css.currentTime,812);
  assert.equal(h.actor.serial,7);assert.deepEqual(h.actor.position,{x:31,y:69});assert.deepEqual(h.actor.target,{x:71,y:44});
  assert.equal(h.c.uniformScale,.4);assert.equal(h.calls.render,0);assert.equal(h.calls.routes,0);assert.equal(h.calls.raf,0);
}

test('real window resize updates only the parent frame synchronously before any ResizeObserver delivery',()=>{
  const h=fixture();assert.equal(h.frame.style.transform,'translate(-50%,-50%) scale(1)');
  // No synthetic RO delivery, RAF, clock seek, render or actor replacement.
  h.office.clientWidth=800;h.office.clientHeight=450;h.window.dispatch('resize');
  assert.equal(h.frame.style.transform,'translate(-50%,-50%) scale(0.625)','viewport centring must not retain the old1x parent fit until a later observer');
  h.office.clientWidth=800;h.office.clientHeight=800;h.window.dispatch('resize');
  assert.equal(h.frame.style.transform,'translate(-50%,-50%) scale(0.625)','letterbox scale still fits the unchanged16:9 world');
  h.office.clientWidth=1280;h.office.clientHeight=720;h.window.dispatch('resize');
  assert.equal(h.frame.style.transform,'translate(-50%,-50%) scale(1)');assert.equal(h.calls.external,3);unchanged(h);
});

test('the same real ResizeObserver remains available for container-only layout changes without a window event',()=>{
  const h=fixture();h.office.clientWidth=640;h.office.clientHeight=720;
  h.observer.deliver();assert.equal(h.frame.style.transform,'translate(-50%,-50%) scale(0.5)');
  assert.equal(h.calls.external,undefined);assert.equal(h.observer.disconnected,false);unchanged(h);
});

test('actual beforeunload removes only the owned window resize callback and disconnects its retained observer',()=>{
  const h=fixture();assert.equal(h.listeners.get('resize').has(h.c.refreshScale),true,'production must own the direct resize listener');
  h.window.dispatch('beforeunload');
  assert.equal(h.c.destroyed,true);assert.equal(h.observer.disconnected,true);assert.equal(h.calls.clearedActors,1);
  assert.equal(h.calls.questionsDisposed,1,'the production-owned question controller is disposed with the renderer');
  assert.equal(h.removed.filter(r=>r.type==='resize'&&r.callback===h.c.refreshScale).length,1,'remove the exact registered production function');
  assert.deepEqual([...h.listeners.get('resize')],[h.external],'an external window listener must remain untouched');
  const before=h.frame.style.transform;h.office.clientWidth=800;h.office.clientHeight=450;
  h.window.dispatch('resize');h.observer.deliver();assert.equal(h.frame.style.transform,before,'disposed geometry listeners cannot late-write the parent frame');
  assert.equal(h.calls.external,1);unchanged(h);
});
