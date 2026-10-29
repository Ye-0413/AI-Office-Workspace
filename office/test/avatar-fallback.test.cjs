'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fallback=require('../renderer/avatar-fallback.js');

function fixture({eyePatchFill,officeHidden}={}){
  const observers=[];
  const calls={styles:0,animations:0,media:0};
  const motionQuery=new EventTarget();motionQuery.matches=false;
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag;this.attrs=new Map();this.children=[];this.dataset={};this.selectors=new Map();this.styles=new Map();this.style={getPropertyValue:key=>this.styles.get(key)||'',setProperty:(key,value)=>this.styles.set(key,value),removeProperty:key=>this.styles.delete(key)};Object.defineProperty(this.style,'opacity',{get:()=>this.styles.get('opacity')||'',set:value=>this.styles.set('opacity',value)});this.classList={add(){},remove(){}};this.animations=[];}
    get id(){return this.getAttribute('id');}set id(value){this.setAttribute('id',value);}
    getAttribute(name){return this.attrs.has(name)?this.attrs.get(name):null;}
    setAttribute(name,value){this.attrs.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(value);}
    removeAttribute(name){this.attrs.delete(name);}
    append(node){this.children.push(node);node.parentNode=this;}
    insertBefore(node,before){const i=this.children.indexOf(before);if(i<0)this.append(node);else{this.children.splice(i,0,node);node.parentNode=this;}}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
    querySelector(selector){return this.selectors.get(selector)||null;}
    querySelectorAll(selector){return selector==='use'?this.uses||[]:[];}
    getAnimations(){calls.animations++;return this.animations;}
  }
  const document={URL:'file:///fixture/index.html',createElementNS:(_,tag)=>{const n=new Node(tag);n.ownerDocument=document;return n;}};
  document.defaultView={getComputedStyle:n=>{calls.styles++;return{opacity:n.style.getPropertyValue('opacity')||'1'};},matchMedia(){calls.media++;return motionQuery;},MutationObserver:class{constructor(callback){this.callback=callback;this.disconnected=false;this.targets=[];observers.push(this);}observe(target,options){this.targets.push({target,options});}disconnect(){this.disconnected=true;}}};
  const make=tag=>document.createElementNS('',tag),actor=make('div'),body=make('span'),image=make('img'),rig=make('svg'),defs=make('defs'),source=make('image'),layer=make('span');
  source.id='original-source';source.setAttribute('href','../assets/capsule.svg');defs.append(source);rig.append(defs);rig.uses=Array.from({length:9},()=>{const n=make('use');n.setAttribute('href','#original-source');rig.append(n);return n;});
  rig.selectors.set('defs image',source);body.selectors.set('img',image);body.selectors.set('.ap-rig',rig);body.selectors.set('.avatar-performance',layer);body.append(image);body.append(layer);image.complete=false;image.naturalWidth=0;
  const eyePatch=eyePatchFill===undefined?null:make('path');
  if(eyePatch){eyePatch.setAttribute('fill',eyePatchFill);rig.selectors.set('.ap-torso > g > path',eyePatch);}
  const office=officeHidden===undefined?null:make('div');if(office){office.dataset.hidden=String(officeHidden);actor.closest=()=>office;}
  return{actor,body,image,rig,defs,source,layer,eyePatch,office,observers,document,calls,motionQuery};
}
const emit=(node,type)=>node.dispatchEvent(new Event(type));

test('pending and failed artwork retain native body without replacing original rig references',()=>{
  const f=fixture(),uses=f.rig.uses.slice(),controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  const native=f.defs.children[1],staticBody=f.body.children[1];
  assert.ok(native.innerHTML.includes('af-shell'));
  assert.equal(staticBody.dataset.active,'true');
  assert.ok(uses.every(use=>use.getAttribute('href')==='#'+native.id));
  emit(f.source,'error');emit(f.image,'error');
  assert.deepEqual(controller.state(),{destroyed:false,bitmap:'failed',rig:'failed',mirrors:0,healing:0});
  assert.deepEqual(f.rig.uses,uses);
  emit(f.source,'load');
  assert.ok(uses.every(use=>use.getAttribute('href')==='#original-source'));
  assert.equal(staticBody.dataset.active,'true','a healthy rig does not conceal the independent failed static bitmap');
  f.image.naturalWidth=100;emit(f.image,'load');assert.equal(staticBody.dataset.active,'false');
  controller.destroy();controller.destroy();
  assert.equal(f.defs.children.length,1);assert.deepEqual(f.body.children,[f.image,f.layer]);assert.equal(f.observers[0].disconnected,true);
  emit(f.source,'error');assert.ok(uses.every(use=>use.getAttribute('href')==='#original-source'));
});

test('a failed replacement remains visible until its new source actually loads',()=>{
  const f=fixture(),controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  emit(f.source,'load');f.image.naturalWidth=100;emit(f.image,'load');
  f.image.complete=false;f.image.naturalWidth=0;
  f.observers[0].callback([{target:f.image,attributeName:'src'},{target:f.source,attributeName:'href'}]);
  assert.equal(controller.state().bitmap,'pending');assert.equal(controller.state().rig,'pending');
  assert.equal(f.body.children[1].dataset.active,'true');
  emit(f.source,'error');controller.sync();assert.equal(controller.state().rig,'failed');
  controller.destroy();assert.ok(f.rig.uses.every(use=>use.getAttribute('href')==='#original-source'));
});

test('native backup follows the bitmap target opacity',()=>{
  const f=fixture();
  const controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image}),staticBody=f.body.children[1];
  f.image.style.setProperty('opacity','.42');f.observers[0].callback([{target:f.image,attributeName:'style'}]);
  assert.equal(staticBody.style.getPropertyValue('opacity'),'.42');
  controller.destroy();
});

test('only a failed trusted local source retries, fenced synchronously and rate limited',()=>{
  const f=fixture(),controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  assert.equal(controller.retry(),false);emit(f.source,'error');
  assert.equal(controller.retry(),false,'no retry within the first three seconds');
  assert.equal(controller.retry(Date.now()+3100),true);
  assert.equal(controller.state().rig,'pending');
  assert.equal(controller.retry(Date.now()+6200),false,'pending resource cannot issue a duplicate request');
  assert.equal(new URL(f.source.getAttribute('href')).protocol,'file:');
  assert.ok(new URL(f.source.getAttribute('href')).searchParams.has('mini-office-art-retry'));
  emit(f.source,'load');assert.equal(controller.retry(Date.now()+9300),false);controller.destroy();
});

test('fallback observes only its resource and presence owners and ignores its own alpha writes',()=>{
  const f=fixture(),controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image}),observer=f.observers[0];
  assert.deepEqual(observer.targets.map(item=>item.target),[f.image,f.source,f.body]);
  assert.ok(observer.targets.every(item=>!item.options.subtree),'joint, prop and backing-use mutations cannot wake resource synchronisation');
  assert.equal(f.calls.styles,1,'initial exact native targets need only the bitmap presence style, not 21 discarded alpha reads');
  const before={...f.calls};
  observer.callback([{target:f.rig.uses[0],attributeName:'href'},{target:f.layer,attributeName:'style'},{target:f.image,attributeName:'style'}]);
  assert.deepEqual(f.calls,before,'native href and our health-alpha style are not independent presence changes');
  f.image.style.setProperty('opacity','.42');observer.callback([{target:f.image,attributeName:'style'}]);
  assert.equal(f.body.children[1].style.getPropertyValue('opacity'),'.42');
  assert.equal(f.calls.media,1,'the motion query is reused for later snapshots');
  controller.destroy();
});

test('hidden and reduced-motion native bodies use exact target alpha without inspecting animation lists',()=>{
  const f=fixture();f.image.style.opacity='.63';f.document.hidden=true;
  const controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  emit(f.source,'error');emit(f.image,'error');controller.sync();
  assert.equal(f.body.children[1].style.getPropertyValue('opacity'),'.63');
  assert.deepEqual(f.calls,{styles:0,animations:0,media:1});
  f.document.hidden=false;f.motionQuery.matches=true;emit(f.motionQuery,'change');
  assert.deepEqual(f.calls,{styles:0,animations:0,media:1});
  controller.destroy();
});

test('a failed console uses the capsule eye surface and restores its original screen fill on healing or teardown',()=>{
  const f=fixture({eyePatchFill:'#f1d5a6'});let fillWrites=0;
  const setAttribute=f.eyePatch.setAttribute.bind(f.eyePatch);f.eyePatch.setAttribute=(name,value)=>{if(name==='fill')fillWrites++;setAttribute(name,value);};
  const controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  assert.equal(f.eyePatch.getAttribute('fill'),'#de886d','pending native artwork uses the backup capsule surface');
  assert.equal(fillWrites,1);
  emit(f.source,'error');controller.sync();controller.sync();assert.equal(fillWrites,1,'unchanged resource mode does not rewrite the patch');
  emit(f.source,'load');assert.equal(f.eyePatch.getAttribute('fill'),'#f1d5a6');assert.equal(fillWrites,2);
  emit(f.source,'load');assert.equal(fillWrites,2,'repeated healthy evidence does not rewrite the restored screen');
  emit(f.source,'error');assert.equal(f.eyePatch.getAttribute('fill'),'#de886d');assert.equal(fillWrites,3);
  controller.destroy();assert.equal(f.eyePatch.getAttribute('fill'),'#f1d5a6');assert.equal(fillWrites,4);
  controller.destroy();assert.equal(fillWrites,4,'teardown restores the original static path only once');
});

test('native window hiding suppresses recovery fades before document visibility catches up',()=>{
  const f=fixture({officeHidden:true});f.image.style.opacity='1';
  assert.notEqual(f.document.hidden,true);
  const controller=Fallback.create({actorNode:f.actor,body:f.body,image:f.image});
  assert.equal(f.observers[0].targets.at(-1).target,f.office);
  emit(f.source,'error');emit(f.image,'error');emit(f.source,'load');
  f.image.naturalWidth=100;emit(f.image,'load');
  assert.deepEqual(f.calls,{styles:0,animations:0,media:1},'native-hidden recovery has exact target alphas and no animation inspection');
  assert.deepEqual(controller.state(),{destroyed:false,bitmap:'healthy',rig:'healthy',mirrors:0,healing:0});
  controller.destroy();
});
