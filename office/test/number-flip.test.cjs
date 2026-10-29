'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Flip=require('../renderer/number-flip.js');
function fixture(){
  const motions=[],context={};let failAnimation=false;
  const document={createElement:()=>new Node(),defaultView:{getComputedStyle:()=>({font:'650 22px sans-serif',getPropertyValue:name=>name==='--ease-out'?'cubic-bezier(.23,1,.32,1)':'cubic-bezier(.77,0,.175,1)'})}};
  class Node{
    constructor(){this.ownerDocument=document;this.children=[];this.parentNode=null;this.dataset={};this.attributes={};this.style={};this.classList={add(){}};this.value='';}
    get textContent(){return this.value+this.children.map(child=>child.textContent).join('');}
    set textContent(value){this.replaceChildren();this.value=String(value);}
    replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.value='';for(const child of children)this.append(child);}
    append(child){this.children.push(child);child.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null;}
    setAttribute(name,value){this.attributes[name]=value;}
    animate(frames,timing){
      if(failAnimation)throw Error('fixture animation unavailable');
      let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b;});
      const motion={frames,timing,finished,cancelled:false,finish:resolve,cancel(){this.cancelled=true;reject(Error('cancelled'));}};
      motions.push(motion);return motion;
    }
  }
  return{node:new Node(),motions,context,flip:Flip.create({getContext:()=>context}),fail:()=>failAnimation=true};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('numeric changes flip once, expose the latest value immediately and coalesce bursts without extending the cycle',async()=>{
  const f=fixture();f.flip.update(f.node,'—');f.flip.update(f.node,'12');assert.equal(f.motions.length,0);
  f.flip.update(f.node,'13');assert.equal(f.node.textContent,'13');assert.equal(f.motions.length,2);
  const previous=f.node.children[1];assert.equal(previous.dataset.number,'12');assert.equal(previous.attributes['aria-hidden'],'true');assert.equal(previous.textContent,'');
  const cycle=[...f.motions];f.flip.update(f.node,'13');f.flip.update(f.node,'14');f.flip.update(f.node,'15');
  assert.equal(f.node.textContent,'15');assert.equal(f.motions.length,2);assert.equal(f.node.children[1],previous);
  assert.equal(cycle[1].timing.duration+cycle[1].timing.delay,200);
  cycle.forEach(motion=>motion.finish());await flush();
  assert.equal(f.node.textContent,'15');assert.equal(f.node.children.length,1);assert.equal(f.node.dataset.flipping,undefined);
  f.flip.update(f.node,'16');assert.equal(f.motions.length,4,'a subsequent distinct update receives a fresh bounded cycle');
  f.flip.destroy();await flush();
});
test('reduced motion, low power and hidden state stop in-flight flips immediately and never replay skipped updates',async()=>{
  for(const key of ['reducedMotion','lowPower','hidden']){
    const f=fixture();f.flip.update(f.node,'1M');f.flip.update(f.node,'2M');const first=[...f.motions];
    f.context[key]=true;f.flip.sync();assert.ok(first.every(m=>m.cancelled));assert.equal(f.node.children.length,1);
    f.flip.update(f.node,'3M');assert.equal(f.node.textContent,'3M');assert.equal(f.motions.length,2);
    f.context[key]=false;f.flip.update(f.node,'3M');assert.equal(f.motions.length,2);
    f.flip.update(f.node,'4M');assert.equal(f.motions.length,4);
    await flush();assert.equal(f.node.dataset.flipping,'true','late cancellation from the old cycle cannot clear its successor');
    f.flip.destroy();assert.equal(f.node.children.length,1);await flush();
  }
});
test('unavailable values cancel motion and first recovered values do not animate loading as a numeric update',async()=>{
  const f=fixture();f.flip.update(f.node,'99');f.flip.update(f.node,'100');f.flip.update(f.node,'—');
  assert.equal(f.node.textContent,'—');assert.ok(f.motions.every(m=>m.cancelled));
  f.flip.update(f.node,'101');assert.equal(f.motions.length,2);assert.equal(f.node.textContent,'101');await flush();
  f.flip.destroy();
});
test('missing browser animation support leaves an accurate static value and no stale overlay',()=>{
  const f=fixture();f.flip.update(f.node,'1');f.fail();f.flip.update(f.node,'2');
  assert.equal(f.node.textContent,'2');assert.equal(f.node.children.length,1);assert.equal(f.node.dataset.flipping,undefined);
  f.flip.destroy();
});
test('the number module has no DOM, timers, Electron or Node side effects at load',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/number-flip.js'),'utf8'),context);
  assert.deepEqual(Object.keys(context),['OfficeNumberFlip']);
  const node={textContent:''};context.OfficeNumberFlip.create().update(node,'42');assert.equal(node.textContent,'42');
});
