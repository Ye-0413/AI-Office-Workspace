'use strict';
// Real production update/freeze/thaw with a CSS-selector/WAAPI boundary. This
// checks ownership and elapsed credit, not native pixels or interpolation.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Model=require('../lib/avatar-performance-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/avatar-performance.js'),'utf8');
const helpers=source.slice(source.indexOf('    function releaseBridgeClocks('),source.indexOf('\n    let gait = null;'));
const update=source.slice(source.indexOf('    function update(value = session,'),source.indexOf('    // A single shared media listener'));
const session={id:'codex:hidden-clock-fixture',provider:'codex',status:'active',activity:'reading',turnId:'real-turn'};
function style(){const m=new Map();return{getPropertyValue:k=>m.get(k)?.value||'',getPropertyPriority:k=>m.get(k)?.priority||'',setProperty(k,value,priority=''){m.set(k,{value:String(value),priority});},removeProperty:k=>m.delete(k)};}
function fixture({registry=true,initialState='running',bridge=false}={}){
  const motions=[],samples=[],classes=new Set(['has-avatar-performance']);let installed=true;
  function motion(target,{name,state='running'}={}){
    let time=1200,reject;const value={effect:{target,getTiming:()=>({duration:180,iterations:name?Infinity:1})},animationName:name,playState:state,pending:false,plays:0,pauses:0,
      get currentTime(){return time;},set currentTime(at){time=at;this.pending=false;},finished:new Promise((_,no)=>reject=no),
      pause(){this.pauses++;this.playState='paused';this.pending=true;},play(){this.plays++;this.playState='running';},
      cancel(){if(this.playState==='idle')return;this.playState='idle';reject(Error('cancelled'));},
      advance(ms){if(this.pending){time+=ms;this.pending=false;}else if(this.playState==='running')time+=ms;}};
    // This boundary eagerly creates finished promises, unlike lazily accessed
    // native CSSAnimation.finished. Observe cancellation without test leaks.
    value.finished.catch(()=>{});motions.push(value);return value;
  }
  const joint={style:style()},back={style:style(),childNodes:[],querySelectorAll:()=>[]},front={style:style(),childNodes:[],querySelectorAll:()=>[],append(){}};
  for(const node of [joint,back,front])node.animate=()=>motion(node);
  const css=motion(joint,{name:'actual-authored-work',state:initialState}),bitmap={style:style()},health=motion(bitmap);
  const dataset=new Proxy({animate:'true',kind:'folio',program:Model.plan(session).program},{set(target,key,value){target[key]=value;if(key==='animate'&&value==='false'){installed=false;css.cancel();}return true;}});
  const layer={dataset,style:style(),hidden:false,getAnimations:()=>motions.filter(m=>m.playState!=='idle'&&(!m.animationName||installed)),animate:()=>motion(layer),remove(){this.removed=true;}};
  bitmap.animate=()=>motion(bitmap);bitmap.style.setProperty('opacity','0');layer.style.setProperty('opacity','1');
  const svg={querySelectorAll:()=>[joint,back,front]},actorNode={dataset:{performance:'folio',performanceProgram:Model.plan(session).program}},body={classList:{remove:k=>classes.delete(k),add:k=>classes.add(k),toggle(k,on){on?classes.add(k):classes.delete(k);}}};
  const registrySource=Model.createClockRegistry();
  const clockRegistry=registry?{open(value){const lease=registrySource.open(value);return{sample(kind,options){samples.push({kind,...options});return lease.sample(kind,options);},release:lease.release};}}:undefined;
  const context={Model,clockRegistry,layer,view:{getComputedStyle:n=>({transform:n.style.getPropertyValue('transform')||'matrix(1,0,0,1,2,3)',opacity:n.style.getPropertyValue('opacity')||'1'})},bitmap,svg,back,front,transit:{contains:()=>false},actorNode,body,session,Map,Set,Promise};
  vm.createContext(context);
  const api=vm.runInContext(`
    let destroyed=false,clockIdentity='',lastNow=null,clockLease=null,systemMotion=null,inheritedOptions={};
    let last=Model.plan(session),visual=last,presence='active',presenceSerial=0,ghost=null,gait=null;
    let hiddenWork=false;
    const visibleClocks=new Map(),bridges=new Set(),transients=new Set(),fades=new Set(),paused=new Map();
    let bridgeClockOwner=null,frozen=[];const originalBitmapOpacity='';
    const joints=()=>[svg.querySelectorAll()[0]],WORK_SCENES={},PROPS={},EXTRA={};
    function startGait(){gait={realPhysicalOwner:true};}
    function stopGait(){gait=null;return [];}
    ${helpers}
    ${update}
    ({update,destroy,hold:holdBridgeClocks,bridge:()=>animate(joints()[0],[{opacity:0},{opacity:1}]),
      state:()=>({hiddenWork,last,visual,paused:paused.size,frozen:frozen.length,localElapsed:visibleClocks.get('folio')||0,gait})})
  `,context);
  api.update(session,{now:0});if(bridge){api.hold();api.bridge();}
  return{api,css,health,layer,back,front,actorNode,bitmap,samples,context,classes,motions,
    advance(ms){for(const motion of motions)motion.advance(ms);},installed:()=>installed};
}

test('hidden standing work retains its original selector, CSSAnimation, props and exact paused phase',()=>{
  const f=fixture(),original=f.css,program=f.layer.dataset.program,before=f.css.currentTime;
  const result=f.api.update(session,{now:100,hidden:true});
  assert.equal(result.active,false);assert.equal(result.reason,'hidden');
  assert.equal(f.layer.dataset.animate,'true','hidden alone must not cancel the original CSS name');
  assert.equal(f.layer.hidden,false);assert.equal(f.layer.dataset.program,program);assert.ok(f.layer.getAnimations().includes(original));
  assert.equal(f.css.playState,'paused');assert.equal(f.css.pending,false);f.advance(10000);assert.equal(f.css.currentTime,before);
  assert.equal(f.health.pauses,0,'resource healing has an independent owner');
  f.api.update({...session,title:'metadata while hidden'},{now:100000,hidden:true});assert.equal(f.css.pauses,1,'metadata does not take another pause lease');
  f.api.update(session,{now:200000});assert.equal(f.layer.getAnimations().includes(original),true);assert.equal(f.css.playState,'running');assert.equal(f.css.currentTime,before);
  f.advance(16);assert.equal(f.css.currentTime,before+16);assert.equal(f.back,f.context.back);assert.equal(f.front,f.context.front);f.api.destroy();
});

test('the real shared registry receives hidden visible:false and never credits the hidden interval',()=>{
  const f=fixture();f.api.update(session,{now:100,hidden:true});f.api.update(session,{now:100000,hidden:true});
  assert.deepEqual(f.samples.slice(-2).map(s=>[s.kind,s.visible]),[['folio',false],['folio',false]]);
  const restored=f.api.update(session,{now:200000});assert.equal(restored.program,Model.plan(session,{visibleElapsed:100}).program);
  assert.equal(f.api.update(session,{now:200016}).program,Model.plan(session,{visibleElapsed:116}).program);f.api.destroy();
});

test('local work credit without a shared registry also excludes hidden time',()=>{
  const f=fixture({registry:false});f.api.update(session,{now:100,hidden:true});f.api.update(session,{now:100000,hidden:true});
  f.api.update(session,{now:200000});assert.equal(f.api.state().localElapsed,100);f.api.update(session,{now:200016});assert.equal(f.api.state().localElapsed,116);f.api.destroy();
});

test('an independently paused CSS owner stays paused after hiding and a finite bridge retains its clock lease',()=>{
  const paused=fixture({initialState:'paused'});paused.api.update(session,{now:100,hidden:true});paused.api.update(session,{now:200000});assert.equal(paused.css.plays,0);assert.equal(paused.css.playState,'paused');paused.api.destroy();
  const f=fixture({bridge:true}),bridge=f.motions.find(m=>!m.animationName&&m!==f.health);f.api.update(session,{now:100,hidden:true});
  assert.equal(bridge.playState,'paused');f.api.update(session,{now:200000});assert.equal(bridge.playState,'running');assert.equal(f.css.playState,'paused','only the existing bridge owner may release its CSS target');f.api.destroy();
});

test('a real hidden work/kind or identity change releases the old standing owner without resuming obsolete clocks',()=>{
  for(const change of [{...session,activity:'planning'},{...session,id:'codex:another-observed-identity'}]){
    const f=fixture();f.api.update(session,{now:100,hidden:true});f.api.update(change,{now:150,hidden:true});
    assert.equal(f.layer.dataset.animate,'false');assert.equal(f.css.plays,0);assert.equal(f.layer.getAnimations().includes(f.css),false);f.api.destroy();
  }
});

test('walking, lifecycle, reduced motion and low power keep the existing immediate safety path',()=>{
  for(const patch of [{walking:true},{departing:true},{stale:true},{reaction:true},{reducedMotion:true},{lowPower:true}]){
    const f=fixture();f.api.update(session,{now:100,hidden:true});f.api.update(session,{now:200,hidden:true,...patch});
    assert.equal(f.layer.dataset.animate,'false',JSON.stringify(patch));assert.equal(f.layer.hidden,true);assert.equal(f.css.plays,0);f.api.destroy();
  }
  for(const state of [{...session,status:'closed'},{...session,status:'stale'},{...session,activity:'unknown'}]){
    const f=fixture();f.api.update(session,{now:100,hidden:true});f.api.update(state,{now:200,hidden:true});assert.equal(f.layer.dataset.animate,'false');assert.equal(f.css.plays,0);f.api.destroy();
  }
});

test('destroy after a hidden pause cannot revive work clocks or retain a frozen style lease',async()=>{
  const f=fixture();f.api.update(session,{now:100,hidden:true});f.api.destroy();f.api.destroy();
  for(let i=0;i<6;i++)await Promise.resolve();f.advance(1000);
  assert.equal(f.layer.removed,true);assert.equal(f.css.plays,0);assert.equal(f.api.state().frozen,0);assert.equal(f.health.pauses,0);
});
