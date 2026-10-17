'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('../lib/festival-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/festival-stage.js'),'utf8');

// DOM/WAAPI boundaries only. The complete production controller is executed;
// this does not certify native rendering, easing samples, or elapsed frames.
class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.listeners=new Map();this.className='';this.textContent='';this.effects=[];this.parentNode=null;this.computed=null;}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
 prepend(...nodes){for(const n of nodes)n.parentNode=this;this.children.unshift(...nodes);}
 replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 get classList(){return{add:name=>{if(!this.className.split(' ').includes(name))this.className+=(this.className?' ':'')+name;},contains:name=>this.className.split(' ').includes(name)};}
 get options(){return this.children;}
 addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}
 removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}
 dispatchEvent(event){event.target??=this;for(const fn of this.listeners.get(event.type)||[])fn(event);}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 querySelector(selector){return this.all().find(n=>selector[0]==='.'?n.classList.contains(selector.slice(1)):n.tagName===selector)||null;}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
 focus(){this.focused=true;}
 animate(frames,options){let resolve;const effect={frames,options,currentTime:173,playState:'running',cancelled:false,finished:new Promise(r=>{resolve=r;}),cancel(){this.cancelled=true;this.playState='idle';},complete(){resolve();}};this.effects.push(effect);return effect;}
}
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
class Matrix{
 constructor(text){let m=[1,0,0,1,0,0];if(text&&text!=='none')for(const match of text.matchAll(/(matrix|translateX|translateY|translate|rotate|scaleX|scaleY|scale)\(([^)]+)\)/g)){const [name,args]=[match[1],match[2].split(/[, ]+/).map(parseFloat)];let n=[1,0,0,1,0,0];if(name==='matrix')n=args;else if(name.startsWith('translate')){n[4]=name==='translateY'?0:args[0];n[5]=name==='translateX'?0:name==='translateY'?args[0]:(args[1]||0);}else if(name==='rotate'){const a=args[0]*Math.PI/180;n=[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];}else{n[0]=name==='scaleY'?1:args[0];n[3]=name==='scaleX'?1:(args[1]??args[0]);}m=multiply(m,n);}['a','b','c','d','e','f'].forEach((k,i)=>{this[k]=m[i];});}
}
function fixture(initial={}){
 const document=new Node('document'),office=new Node('main'),world=new Node('div'),topbar=new Node('header'),actions=new Node('div');actions.className='top-actions';topbar.append(actions);office.append(world,topbar);document.append(office);
 const events=[],state={theme:'christmas',weather:'off',language:'en',reducedMotion:true,lowPower:false,hidden:false,venue:'workshop',...initial};
 const c=vm.createContext({window:{OfficeFestivals:F},document,DOMMatrixReadOnly:Matrix,getComputedStyle:n=>n.computed||{transform:n.style.transform||'none',opacity:n.style.opacity??'1'}});
 document.createElement=tag=>new Node(tag);document.createElementNS=(_ns,tag)=>new Node(tag);vm.runInContext(source,c);
 const controller=c.window.OfficeFestivalStage.create({office,world,topbar,getState:()=>state,onInteraction:e=>events.push(e)});
 return{controller,office,world,events,state,query:s=>office.querySelector(s),click(detail=0){this.query('.festival-control').dispatchEvent({type:'click',detail});},update(patch){Object.assign(state,patch);controller.update(patch);},phase(){return this.query('.festival-widget').dataset.state;},feedback(){return this.query('.festival-feedback').textContent;},primary(){return this.query('.festival-primary');},part(name){return office.all().find(n=>n.attributes['data-part']===name);}};
}
function matrix(n){return new Matrix(n.style.transform);}
function sameMatrix(a,b){for(const key of ['a','b','c','d','e','f'])assert.ok(Math.abs(a[key]-b[key])<1e-6,key+': '+a[key]+' != '+b[key]);}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('Christmas opening and closing commit different real lid endpoints and matching lights',()=>{
 const h=fixture(),rest=matrix(h.primary());h.click();assert.equal(h.phase(),'unwrapped');const opened=matrix(h.primary());assert.ok(opened.f<-6);assert.equal(h.part('tree-lights').style.opacity,'1');
 h.click();assert.equal(h.phase(),'wrapped');sameMatrix(matrix(h.primary()),rest);assert.equal(h.part('tree-lights').style.opacity,'.2');assert.match(h.feedback(),/closed|wrapped/i);
});
test('saved open and closed gifts restore their own physical endpoint without another interaction',()=>{
 const h=fixture();const rest=matrix(h.primary());h.click();const open=matrix(h.primary());h.update({theme:'summer'});h.update({theme:'christmas'});sameMatrix(matrix(h.primary()),open);h.click();h.update({theme:'winter'});h.update({theme:'christmas'});sameMatrix(matrix(h.primary()),rest);assert.equal(h.phase(),'wrapped');assert.equal(h.events.length,2);assert.equal(h.part('tree-lights').style.opacity,'.2');
});
for(const theme of F.CORE_THEMES)test(theme.id+' exposes distinct bilingual feedback for each core phase',()=>{
 const h=fixture({theme:theme.id}),count=['spring','newyear','hanami'].includes(theme.id)?3:2,seen=[];
 for(let i=0;i<count;i++){h.click();const en=h.feedback(),phase=h.phase(),stepEvents=h.events.length;h.update({language:'zh'});const zh=h.feedback();assert.match(zh,/[\u3400-\u9fff]/);assert.match(en,/[A-Za-z]/);assert.notEqual(en,theme.detailEn,phase+' must report the selected mechanism state');assert.notEqual(zh,theme.detailZh);assert.equal(h.phase(),phase);assert.equal(h.events.length,stepEvents);seen.push({en,zh,phase});h.update({language:'en'});assert.equal(h.feedback(),en);}
 assert.equal(new Set(seen.map(s=>s.en)).size,count);assert.equal(new Set(seen.map(s=>s.zh)).size,count);assert.equal(new Set(seen.map(s=>s.phase)).size,count);const first=seen[0];h.click();assert.equal(h.phase(),first.phase);assert.equal(h.feedback(),first.en);
});
test('locale and same-state heartbeat preserve the current finite owner and do not emit another action',()=>{
 const h=fixture({reducedMotion:false});h.click(1);const primary=h.primary(),effect=primary.effects.at(-1);effect.currentTime=487;const text=h.feedback();h.update({language:'zh'});assert.notEqual(h.feedback(),text);h.update({language:'en'});h.update({venue:'teahouse'});assert.equal(primary.effects.at(-1),effect);assert.equal(effect.currentTime,487);assert.equal(effect.cancelled,false);assert.equal(h.events.length,1);assert.equal(h.feedback(),text);
});
test('rapid reverse starts from actual computed lid pose and superseded completion cannot commit',async()=>{
 const h=fixture({reducedMotion:false});h.click(1);const primary=h.primary(),first=primary.effects.at(-1),actual='matrix(.99,-.04,.04,.99,-2.3,-11.7)';primary.computed={transform:actual,opacity:'.72'};h.click(1);const close=primary.effects.at(-1);sameMatrix(new Matrix(close.frames[0].transform),new Matrix(actual));assert.equal(close.frames[0].opacity,.72);assert.equal(first.cancelled,true);const expectedLast=new Matrix(F.interactionFrames('christmas')[0].transform);sameMatrix(new Matrix(close.frames.at(-1).transform),expectedLast);
 first.complete();await flush();assert.equal(h.query('.festival-widget').dataset.playing,'true');assert.equal(h.phase(),'wrapped');assert.equal(close.cancelled,false);primary.computed=null;close.complete();await flush();sameMatrix(matrix(primary),expectedLast);assert.equal(h.query('.festival-widget').dataset.playing,'false');assert.match(h.feedback(),/closed|wrapped/i);
});
test('quiet completion and normal restoration settle the declared target without retroactive playback',async()=>{
 for(const quiet of ['hidden','reducedMotion','lowPower']){const h=fixture({reducedMotion:false});h.click(1);const old=h.primary().effects.at(-1);h.click(1);const current=h.primary().effects.at(-1);h.update({[quiet]:true});sameMatrix(matrix(h.primary()),new Matrix(F.interactionFrames('christmas')[0].transform));assert.equal(current.cancelled,true);const count=h.primary().effects.length;h.update({[quiet]:false});assert.equal(h.primary().effects.length,count);old.complete();current.complete();await flush();assert.equal(h.query('.festival-widget').dataset.playing,'false');assert.equal(h.phase(),'wrapped');}
});
test('theme replacement and destruction reject late old-art writes and action callbacks',async()=>{
 const h=fixture({reducedMotion:false});h.click(1);const old=h.primary(),effect=old.effects.at(-1);h.update({theme:'spring'});const next=h.primary(),before=next.style.transform;effect.complete();await flush();assert.equal(next.style.transform,before);assert.equal(h.feedback(),'');assert.equal(h.events.length,1);h.click(1);const running=next.effects.at(-1),button=h.query('.festival-control');h.controller.destroy();running.complete();button.dispatchEvent({type:'click',detail:1});await flush();assert.equal(h.query('.festival-stage'),null);assert.equal(h.events.length,2);assert.equal(running.cancelled,true);
});
