'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Play=require('../renderer/companion-play.js');

function fixture(context={}){
  const document=new EventTarget();
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag;this.ownerDocument=document;this.children=[];this.dataset={};this.attrs={};this.style={transform:'translate(300px,400px)'};this.className='';this.parentNode=null;this.animations=[];}
    setAttribute(name,value){this.attrs[name]=String(value);}
    append(node){this.children.push(node);node.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    closest(selector){let node=this;while(node){if(selector==='.actor[data-session-id]'&&node.dataset.sessionId)return node;node=node.parentNode;}return null;}
    getBoundingClientRect(){return{left:280,width:40,top:300,height:100};}
    animate(frames,timing){const value={frames,timing,finished:Promise.resolve()};this.animations.push(value);return value;}
  }
  document.createElement=tag=>new Node(tag);
  const office=new Node('div'),actors=new Map(),cues=[];
  const add=(id,extra={})=>{
    const node=new Node('div');node.dataset.sessionId=id;node.dataset.reaction='false';const button=new Node('button');node.append(button);office.append(node);
    const actor={id,node,button,session:{id,status:'active',activity:'coding',events:[]},position:{x:300,y:400},target:{x:300,y:400},performance:{cue(kind,options){cues.push([id,kind,options?.direction??null]);return true;}},...extra};
    actors.set(id,actor);return actor;
  };
  let time=0;const state={hidden:false,reducedMotion:false,lowPower:false,...context};
  const play=Play.create({office,getActors:()=>actors,getContext:()=>state,now:()=>time});
  const pointer=(type,target,extra={})=>{const event=new Event(type,{bubbles:false});Object.assign(event,{clientX:0,buttons:0,pointerType:'mouse',relatedTarget:null,...extra});Object.defineProperty(event,'target',{value:target});office.dispatchEvent(event);};
  return{play,office,actors,cues,add,pointer,state,tick:ms=>{time+=ms;}};
}
const frozen=actor=>JSON.stringify({session:actor.session,position:actor.position,target:actor.target,dataset:actor.node.dataset,transform:actor.node.style.transform});

test('a hover glance looks toward the pointer once per gap and never moves the body',()=>{
  const f=fixture(),a=f.add('codex:a'),before=frozen(a);
  f.pointer('pointerover',a.button,{clientX:250});
  assert.deepEqual(f.cues,[['codex:a','glance',-1]]);
  f.pointer('pointerover',a.button,{clientX:350});f.tick(Play.GLANCE_GAP_MS-1);f.pointer('pointerover',a.button,{clientX:350});
  assert.equal(f.cues.length,1,'repeated hovers inside the gap stay still');
  f.tick(1);f.pointer('pointerover',a.button,{clientX:350});
  assert.deepEqual(f.cues.at(-1),['codex:a','glance',1]);
  assert.equal(frozen(a),before);f.play.destroy();
});

test('slow strokes pet a companion with a greet and a heart, then the heart is removed',async()=>{
  const f=fixture(),a=f.add('codex:a'),before=frozen(a);
  for(const x of [300,310,300,310,300]){f.tick(100);f.pointer('pointermove',a.button,{clientX:x});}
  assert.deepEqual(f.cues.map(cue=>cue[1]),['greet']);
  const heart=a.node.children.find(child=>child.className==='companion-heart');assert.ok(heart);assert.equal(heart.attrs['aria-hidden'],'true');
  await Promise.resolve();await Promise.resolve();
  assert.equal(a.node.children.some(child=>child.className==='companion-heart'),false);
  for(const x of [310,300,310,300]){f.tick(10);f.pointer('pointermove',a.button,{clientX:x,buttons:1});}
  assert.equal(f.cues.length,1,'a pressed drag is not petting');
  assert.equal(frozen(a),before);f.play.destroy();
});

test('the yarn ball draws a look from free companions only',()=>{
  const f=fixture(),free=f.add('codex:free'),walking=f.add('codex:walk',{motion:{}}),leaving=f.add('codex:leave',{departing:true}),greeting=f.add('codex:greet');
  greeting.node.dataset.reaction='true';const before=[free,walking,leaving,greeting].map(frozen);
  f.toy=f.office.children.find(child=>child.className==='companion-toy');assert.ok(f.toy);assert.equal(f.toy.attrs['aria-label'],'毛线球：点一下，大家会看过来');
  assert.equal(f.play.toss(),1);assert.deepEqual(f.cues.map(cue=>cue[0]),['codex:free']);
  assert.equal(f.play.toss(),0,'a second toss inside its gap is ignored');
  assert.deepEqual([free,walking,leaving,greeting].map(frozen),before);
  f.play.destroy();assert.equal(f.office.children.includes(f.toy),false);
});

for(const quiet of ['hidden','reducedMotion','lowPower'])test('play is silent while '+quiet,()=>{
  const f=fixture({[quiet]:true}),a=f.add('codex:a');
  f.pointer('pointerover',a.button,{clientX:250});
  for(const x of [300,310,300,310,300]){f.tick(100);f.pointer('pointermove',a.button,{clientX:x});}
  f.play.toss();
  assert.deepEqual(f.cues,[]);assert.equal(a.node.children.length,1);
  const toy=f.office.children.find(child=>child.className==='companion-toy');assert.equal(toy.animations.length,0);
  f.play.destroy();
});
