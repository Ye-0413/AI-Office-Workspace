'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Motion=require('../renderer/clone-motion.js');
function fixture(){
  const animations=[],observers=[];let images=0;
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag;this.dataset={};this.style={};this.children=[];this.attributes={};this.isConnected=true;this.ownerDocument=document;}
    setAttribute(key,value){this.attributes[key]=value;}
    append(child){this.children.push(child);child.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    closest(){return room;}
    animate(frames,options){
      let resolve,reject;const a={target:this,frames,options,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),state:'running',complete(){if(a.state!=='running')return;a.state='finished';resolve();},cancel(){if(a.state!=='running')return;a.state='idle';reject(Error('cancelled'));}};
      animations.push(a);return a;
    }
  }
  const document=new EventTarget();document.hidden=false;
  const media=new EventTarget();media.matches=false;
  document.defaultView={matchMedia:()=>media,MutationObserver:class{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
  document.createElement=tag=>{if(tag==='img')images++;return new Node(tag);};
  const room=new Node('main');document.body=new Node('body');
  const anchor=new Node('div'),body=new Node('span');body.className='real-body';anchor.append(body);
  const truth=()=>JSON.stringify({dataset:anchor.dataset,style:anchor.style,attributes:anchor.attributes,body:{dataset:body.dataset,style:body.style,children:body.children}});
  const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
  return{anchor,body,room,document,media,animations,observers,truth,images:()=>images,flush,advance:async ms=>{for(const a of animations)if(a.options.duration<=ms)a.complete();await flush();},guard:()=>{for(const o of observers)if(!o.disconnected)o.callback();}};
}
for(const [kind,readyAt]of [['split',300],['absorb',680]])test(kind+' exposes the actual finite phase boundary before cleanup without touching a real body',async()=>{
  const f=fixture(),before=f.truth();let ready='pending',finished='pending';
  const effect=Motion.burst({anchor:f.anchor,kind,ownerId:'codex:child',asset:'https://invalid.example/restricted.svg'});
  effect.ready.then(value=>{ready=value;});effect.finished.then(value=>{finished=value;});
  assert.equal(f.anchor.children.length,2);assert.equal(f.images(),0,'clone effects never request a duplicate external avatar');
  assert.ok(f.animations.length>=15,'separate smoke, thread and ground phases share a bounded owner');
  for(const a of f.animations){assert.ok(a.options.duration>0&&a.options.duration<=900);for(const frame of a.frames)assert.deepEqual(Object.keys(frame).filter(k=>!['transform','opacity','offset','easing'].includes(k)),[]);}
  await f.advance(readyAt-1);assert.equal(ready,'pending');assert.equal(finished,'pending');
  await f.advance(readyAt);assert.equal(ready,true);assert.equal(finished,'pending');assert.equal(f.anchor.children.length,2,'the trailing choreography remains until its own endpoint');
  await f.advance(900);assert.equal(await effect.finished,true);assert.equal(f.anchor.children.length,1);assert.equal(f.anchor.children[0],f.body);assert.equal(f.truth(),before);assert.ok(f.observers.every(o=>o.disconnected));
  effect.cancel();assert.equal(await effect.ready,true);assert.equal(await effect.finished,true,'late cancellation cannot change a completed boundary');
});
test('early cancellation settles both promises false, removes only its own overlay and is idempotent',async()=>{
  const f=fixture(),effect=Motion.burst({anchor:f.anchor});effect.cancel();effect.cancel();assert.equal(await effect.ready,false);assert.equal(await effect.finished,false);assert.deepEqual(f.anchor.children,[f.body]);await f.advance(1000);assert.equal(f.anchor.children.length,1);
});
test('sibling clone effects keep independent owners when one is interrupted after ready',async()=>{
  const f=fixture(),one=Motion.burst({anchor:f.anchor,ownerId:'one'}),two=Motion.burst({anchor:f.anchor,kind:'absorb',ownerId:'two'});
  await f.advance(300);assert.equal(await one.ready,true);one.cancel();assert.equal(await one.finished,false);assert.equal(f.anchor.children.length,2);assert.equal(f.anchor.children[1].dataset.ownerId,'two');
  await f.advance(680);assert.equal(await two.ready,true);await f.advance(900);assert.equal(await two.finished,true);assert.deepEqual(f.anchor.children,[f.body]);
});
test('hidden, reduced, low-power and anchor removal cannot leave a suspended clone owner',async()=>{
  for(const change of [f=>{f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));},f=>{f.media.matches=true;f.media.dispatchEvent(new Event('change'));},f=>{f.room.dataset.lowPower='true';f.guard();},f=>{f.anchor.isConnected=false;f.guard();}]){
    const f=fixture(),effect=Motion.burst({anchor:f.anchor});change(f);assert.equal(await effect.ready,false);assert.equal(await effect.finished,false);assert.deepEqual(f.anchor.children,[f.body]);
  }
  for(const options of [{reducedMotion:true},{lowPower:true},{hidden:true}]){const f=fixture(),effect=Motion.burst({anchor:f.anchor,...options});assert.equal(await effect.ready,true);assert.equal(await effect.finished,true);effect.cancel();assert.equal(f.animations.length,0);assert.deepEqual(f.anchor.children,[f.body]);}
});
test('invalid boundaries fail before allocating visual owners',()=>{
  assert.throws(()=>Motion.burst(),/actual scene anchor/);const f=fixture();assert.throws(()=>Motion.burst({anchor:f.anchor,kind:'fake-result'}),/Unknown clone/);assert.deepEqual(f.anchor.children,[f.body]);
});
for(const [kind,readyAt]of [['split',300],['absorb',680]])test('ink '+kind+' buds or merges glossy drops at the existing finite boundary',async()=>{
  const f=fixture();f.anchor.dataset.bodyDesign='ink';const before=f.truth();
  const effect=Motion.burst({anchor:f.anchor,kind,ownerId:'codex:ink-helper'}),overlay=f.anchor.children[1];
  assert.equal(overlay.dataset.creatureEffect,'ink');assert.equal(overlay.dataset.ownerId,'codex:ink-helper');
  assert.equal(overlay.children.filter(part=>part.className==='clone-ink-puddle').length,1);
  const drops=overlay.children.filter(part=>part.className==='clone-ink-drop');assert.equal(drops.length,5);
  assert.equal(overlay.children.some(part=>/smoke|ring|curl|mote/.test(part.className)),false,'the liquid creature never emits the legacy smoke geometry');
  assert.equal(f.images(),0,'the effect draws local liquid without duplicating a creature sprite');
  const boundaries=f.animations.filter(animation=>animation.options.duration===readyAt);assert.equal(boundaries.length,1);assert.equal(boundaries[0].target.className,'clone-ink-core');
  for(const animation of f.animations){
    assert.ok(animation.options.duration>0&&animation.options.duration<=Motion.DURATION);
    for(const frame of animation.frames)assert.deepEqual(Object.keys(frame).filter(key=>!['transform','opacity','offset','easing'].includes(key)),[]);
  }
  const dropMotions=f.animations.filter(animation=>drops.includes(animation.target));
  const position=frame=>Number(frame.transform.match(/translate3d\(([-\d.]+)px/)[1]);
  if(kind==='split'){
    assert.ok(dropMotions.every(animation=>position(animation.frames[0])===0));
    assert.ok(Math.max(...dropMotions.map(animation=>Math.abs(position(animation.frames.at(-1)))))>35,'separation grows outward from the real parent');
  }else{
    assert.ok(Math.max(...dropMotions.map(animation=>Math.abs(position(animation.frames[0]))))>35);
    assert.ok(dropMotions.every(animation=>position(animation.frames.at(-1))===0),'returning drops merge into the parent puddle');
  }
  let ready='pending';effect.ready.then(value=>{ready=value;});
  await f.advance(readyAt-1);assert.equal(ready,'pending');
  await f.advance(readyAt);assert.equal(ready,true);assert.equal(f.anchor.children.length,2);
  await f.advance(900);assert.equal(await effect.finished,true);assert.deepEqual(f.anchor.children,[f.body]);assert.equal(f.truth(),before);
  assert.ok(f.observers.every(observer=>observer.disconnected));
});
test('ink effects stop cleanly on interruption and skip hidden or quiet scenes',async()=>{
  for(const change of [f=>{f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));},f=>{f.media.matches=true;f.media.dispatchEvent(new Event('change'));},f=>{f.room.dataset.lowPower='true';f.guard();},f=>{f.anchor.isConnected=false;f.guard();}]){
    const f=fixture();f.anchor.dataset.bodyDesign='ink';const effect=Motion.burst({anchor:f.anchor});change(f);
    assert.equal(await effect.ready,false);assert.equal(await effect.finished,false);assert.deepEqual(f.anchor.children,[f.body]);effect.cancel();
  }
  for(const options of [{reducedMotion:true},{lowPower:true},{hidden:true}]){
    const f=fixture();f.anchor.dataset.bodyDesign='ink';const effect=Motion.burst({anchor:f.anchor,...options});
    assert.equal(await effect.ready,true);assert.equal(await effect.finished,true);assert.equal(f.animations.length,0);assert.deepEqual(f.anchor.children,[f.body]);
  }
});
