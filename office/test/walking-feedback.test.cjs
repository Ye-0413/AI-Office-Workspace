'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Scene=require('../lib/scene-model.js'),Director=require('../lib/animation-director.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),finishSource=source.slice(source.indexOf('  function finishAtStation('),source.indexOf('  function actualArrival('));
function setup(previous,session={id:'codex:feedback',provider:'codex',status:'active',activity:'coding'}){
  const now=200000,cleared=[],captions=[],poses=[];
  const actor={id:session.id,session,spec:Scene.activitySpec(session),node:{dataset:{}},bubble:{dataset:{show:'true'}},bubbleTimer:31,lastPhase:previous,lastChatter:now-200,currentAsset:'existing',state:{},position:{x:20,y:44}};
  const context={Scene,Director,language:'zh',Date:{now:()=>now},cloneBusy:()=>false,setPose:(...args)=>poses.push(args),clearTimeout:id=>cleared.push(id),say:(_actor,caption)=>captions.push(caption),quietSprites:()=>false,addEffect:()=>{},text:(node,value)=>{node.textContent=value;},selectedSession:'',renderInspector:()=>{},updateProps:()=>{}};
  vm.createContext(context);vm.runInContext(finishSource,context);return{actor,cleared,captions,poses,finish:()=>context.finishAtStation(actor)};
}
test('fresh work dismisses an obsolete safety/uncertain bubble even within the chatter throttle without inventing a replacement',()=>{
  for(const previous of ['stale','waiting-user/reminder','error/sigh','unknown','closed']){
    const h=setup(previous);h.finish();assert.deepEqual(h.cleared,[31],previous);assert.equal(h.actor.bubble.dataset.show,'false',previous);assert.equal(h.captions.length,0,'a cleared reminder does not pretend a new observed event occurred');
  }
});
test('same-phase metadata preserves its bubble deadline and never requests a bitmap/rig replay',()=>{
  const session={id:'codex:feedback',provider:'codex',status:'active',activity:'coding'},plan=Director.plan(session,{now:200000,language:'zh'}),h=setup(plan.phase,session);
  h.finish();h.actor.session={...session,title:'ordinary metadata',lastEventAt:200000};h.finish();assert.deepEqual(h.cleared,[]);assert.deepEqual(h.captions,[]);assert.equal(h.actor.bubble.dataset.show,'true');assert.equal(h.poses.length,2);assert.ok(h.poses.every(args=>args[2]===false));
});
test('real attention still wins over a changed coding activity so its required-input reminder is retained',()=>{
  const session={id:'codex:feedback',provider:'codex',status:'active',activity:'coding',attention:true},h=setup('waiting-user/reminder',session);h.finish();assert.deepEqual(h.cleared,[]);assert.equal(h.actor.bubble.dataset.show,'true');assert.ok(h.actor.lastPhase.startsWith('waiting-user/'));
});
