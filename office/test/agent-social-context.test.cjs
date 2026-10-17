'use strict';
// Run the complete production controller with a deterministic DOM/WAAPI edge.
// These are ownership/selection tests, not browser pixel or easing evidence.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Social=require('../lib/social-interactions.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/agent-social.js'),'utf8');
function fixture(){
  let time=1000,next=0;const raf=new Map(),motions=[];
  const settings={venue:'workshop',language:'zh',theme:'auto',resolvedTheme:'spring',artworkKey:'workshop:spring',mode:'live',hidden:false,reducedMotion:false,lowPower:false};
  const classes=n=>(n.attrs.class||'').split(/\s+/);
  class Node{
    constructor(tag){this.tagName=tag;this.attrs={};this.dataset={};this.style={};this.children=[];this.parentNode=null;this.ownerDocument=document;this.animations=[];this.classList={add:(...v)=>this.attrs.class=[...new Set([...classes(this),...v])].join(' ')};}
    get isConnected(){return this===world||Boolean(this.parentNode?.isConnected);}
    append(n){this.children.push(n);n.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
    setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
    querySelectorAll(selector){return this.children.flatMap(n=>[...(selector.split(',').some(s=>s.trim()[0]==='.'?classes(n).includes(s.trim().slice(1)):n.tagName===s.trim())?[n]:[]),...n.querySelectorAll(selector)]);}
    getBoundingClientRect(){return this.box||{left:0,top:0,width:1280,height:720,right:1280,bottom:720};}
    animate(frames,options){const m=new Animation(this,frames,options);this.animations.push(m);motions.push(m);return m;}
    getAnimations({subtree=false}={}){return [...this.animations,...(subtree?this.children.flatMap(n=>n.getAnimations({subtree:true})):[])].filter(a=>a.playState!=='idle'&&a.playState!=='finished');}
  }
  class Animation{
    constructor(target,frames,options){this.effect={target,getTiming:()=>options};this.frames=frames;this.options=options;this.playState='running';this.pending=false;this.start=time;this.hold=0;this.finished=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});}
    get currentTime(){return this.playState==='running'?time-this.start:this.hold;}
    set currentTime(v){this.hold=v;this.start=time-v;}
    pause(){this.hold=this.currentTime;this.playState='paused';}
    cancel(){if(this.playState==='idle')return;this.playState='idle';this.reject(Error('cancelled'));}
    step(){if(this.playState==='running'&&this.options.iterations!==Infinity&&this.currentTime>=this.options.duration){this.hold=this.options.duration;this.playState='finished';this.resolve();}}
    alpha(){const f=this.frames.filter(f=>f.opacity!==undefined);if(!f.length)return null;const p=Math.min(1,Math.max(0,this.currentTime/this.options.duration));return f[0].opacity+(f.at(-1).opacity-f[0].opacity)*p;}
  }
  const document={hidden:false,createElementNS:(_ns,tag)=>new Node(tag)};
  const view={getComputedStyle(n){return {opacity:String(n.animations.filter(a=>a.playState!=='idle').map(a=>a.alpha()).filter(x=>x!==null).at(-1)??n.style.opacity??1),display:n.style.display||'block',visibility:n.style.visibility||'visible',getPropertyValue:()=> '#c78c68'};},requestAnimationFrame:cb=>{const id=++next;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id)};
  document.defaultView=view;
  const world=new Node('world');world.clientWidth=1280;world.clientHeight=720;const layer=new Node('layer');world.append(layer);
  const actors=[];function actor(id,x,y,parentId){const node=new Node('actor'),body=new Node('body');world.append(node);node.append(body);body.box={left:x*12.8-77,top:y*7.2-90,width:154,height:129};const a={id,node,body,serial:7,position:{x,y},session:{id,provider:'codex',activity:'coding',status:'active',turnId:'observed',...(parentId?{parentId}:{})}};actors.push(a);return a;}
  const a=actor('near-a',82,44),b=actor('near-b',93,44),work=a.body.animate([{opacity:1},{opacity:1}],{duration:12000,iterations:Infinity});work.animationName='observed-work';work.finished.catch(()=>{});
  const ctx={OfficeSocialInteractions:{...Social,createScheduler:()=>Social.createScheduler({now:()=>time,random:()=>0})},OfficeFestivals:{resolve:value=>({theme:value.resolvedTheme||'spring'})}};vm.createContext(ctx);vm.runInContext(source,ctx);
  const api=ctx.OfficeAgentSocial.create({layer,world,getActors:()=>actors,getContext:()=>({...settings,now:time})});
  async function step(ms){time+=ms;motions.forEach(m=>m.step());const callbacks=[...raf.values()];raf.clear();callbacks.forEach(fn=>fn(time));await Promise.resolve();await Promise.resolve();await Promise.resolve();}
  return {api,settings,actors,actor,a,b,work,layer,world,document,motions,raf,step,get time(){return time;}};
}
const state=value=>JSON.parse(JSON.stringify(value));

test('real controller forwards percentage control points into local selection without writing actor state',()=>{
  const f=fixture();f.actor('far-parent',8,44);f.actor('far-child',12,44,'far-parent');
  const before=f.actors.map(a=>({session:structuredClone(a.session),serial:a.serial,position:{...a.position},node:a.node,body:a.body}));
  assert.equal(f.api.trigger({type:'circuit',point:{x:82,y:30},source:'keyboard'}),true);assert.deepEqual(state(f.api.state().active.ids).sort(),['near-a','near-b']);
  f.actors.forEach((a,i)=>{assert.deepEqual(a.session,before[i].session);assert.equal(a.serial,before[i].serial);assert.deepEqual(a.position,before[i].position);assert.equal(a.node,before[i].node);assert.equal(a.body,before[i].body);});f.api.destroy();
});

test('visual language/theme/artwork changes use one original160ms frozen-pose exit with no replay or body-clock ownership',async()=>{
  for(const patch of [{language:'en'},{resolvedTheme:'winter'},{artworkKey:'workshop:spring-v2'},{artworkKey:''}]){
    const f=fixture();assert.equal(f.api.trigger({kind:'blueprint-pass'}),true);await f.step(620);
    const original=f.layer.children[0],owned=original.getAnimations({subtree:true}),times=owned.map(a=>a.currentTime),workAt=f.work.currentTime,token=f.api.state().active.token;
    Object.assign(f.settings,patch);f.api.update();
    assert.equal(f.api.state().active,null);assert.equal(f.api.state().exiting.token,token);assert.equal(f.layer.children[0],original);
    owned.forEach((a,i)=>{assert.equal(a.playState,'paused');assert.equal(a.currentTime,times[i]);});assert.equal(f.work.playState,'running');
    const fade=f.motions.at(-1);assert.equal(fade.effect.target,original);assert.equal(fade.options.duration,160);assert.equal(fade.options.easing,'cubic-bezier(.23,1,.32,1)');
    const stateBefore=f.api.state();assert.equal(f.api.trigger({kind:'paperplane-nod'}),false);assert.deepEqual(f.api.state(),stateBefore,'outgoing cannot consume another scheduler start');
    await f.step(80);f.api.update();assert.equal(f.layer.children.length,1);assert.ok(fade.alpha()>0&&fade.alpha()<1);owned.forEach((a,i)=>assert.equal(a.currentTime,times[i]));assert.ok(f.work.currentTime>workAt);
    await f.step(81);assert.equal(f.layer.children.length,0);assert.equal(f.api.state().exiting,null);assert.equal(f.raf.size,0);f.api.update();assert.equal(f.layer.children.length,0,'context updates never replay the old invitation');f.api.destroy();
  }
});

test('scalar-equivalent context and ordinary clock heartbeats keep the same decorative and real work objects',async()=>{
  const f=fixture();assert.equal(f.api.trigger({kind:'blueprint-pass'}),true);const original=f.layer.children[0],owned=original.getAnimations({subtree:true}),token=f.api.state().active.token;
  for(let i=0;i<4;i++){await f.step(250);Object.assign(f.settings,{theme:'spring',dayPhase:'night',now:Date.now(),language:'zh'});f.api.update();assert.equal(f.api.state().active.token,token);assert.equal(f.api.state().exiting,null);assert.equal(f.layer.children[0],original);owned.forEach(a=>assert.equal(a.playState,'running'));}
  assert.equal(f.work.playState,'running');f.api.destroy();
});

test('quiet or destroy removes an outgoing context owner immediately and late completion cannot restore it',async()=>{
  for(const end of ['quiet','destroy']){
    const f=fixture();f.api.trigger({kind:'blueprint-pass'});await f.step(620);f.settings.language='en';f.api.update();assert.ok(f.api.state().exiting);
    if(end==='quiet'){f.settings.hidden=true;f.api.update();}else f.api.destroy();
    assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);await f.step(200);assert.equal(f.layer.children.length,0);assert.equal(f.work.playState,'running');f.api.destroy();
  }
});

test('the existing RAF guard also retires changed context without an explicit update, and a reversal cannot restart its tail',async()=>{
  const f=fixture();f.api.trigger({kind:'blueprint-pass'});await f.step(620);f.settings.language='en';await f.step(1);
  assert.equal(f.api.state().active,null);const token=f.api.state().exiting.token,fade=f.motions.at(-1),before=fade.currentTime;
  f.settings.language='zh';f.api.update();assert.equal(f.api.state().exiting.token,token);assert.equal(f.motions.at(-1),fade);assert.equal(fade.currentTime,before);
  await f.step(161);assert.equal(f.layer.children.length,0);assert.equal(f.api.state().exiting,null);assert.equal(f.raf.size,0);
  await f.step(1000);assert.equal(f.api.trigger({kind:'paperplane-nod'}),true);const next=f.layer.children[0],newToken=f.api.state().active.token;
  await f.step(1);assert.equal(f.layer.children[0],next);assert.ok(newToken>token);assert.equal(f.api.state().active.token,newToken);f.api.destroy();
});

test('actual artwork confirmation is a visual change while rawauto resolving to the same scalar theme is not',async()=>{
  const f=fixture();f.settings.artworkKey='';delete f.settings.resolvedTheme;
  f.api.trigger({kind:'blueprint-pass'});await f.step(620);const original=f.layer.children[0],token=f.api.state().active.token;
  f.settings.theme='spring';f.api.update();assert.equal(f.api.state().active.token,token);assert.equal(f.layer.children[0],original);
  f.settings.artworkKey='workshop:spring';f.api.update();assert.equal(f.api.state().active,null);assert.equal(f.api.state().exiting.token,token);f.api.destroy();
});
