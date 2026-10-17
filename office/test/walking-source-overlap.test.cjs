'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Scene=require('../lib/scene-model.js'),Traffic=require('../lib/scene-traffic.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const move=source.slice(source.indexOf('  async function move('),source.indexOf('  async function animateWalk('));
function setup(){
  const geometry={uniformScale:1,footprint:{left:35,right:35,top:45,bottom:25}};
  const root={id:'root',serial:1,helper:false,node:{dataset:{}},position:{x:20,y:60},...geometry},child={id:'child',helper:true,genuine:true,position:{x:20,y:60},...geometry};
  const actors=new Map([[root.id,root],[child.id,child]]),requests=[];
  const context={Scene,currentPage:{gap:12},actors,trafficWaiters:new Map(),syncTraffic:()=>{},cloneAncestor:()=>root,cloneBusy:()=>false,endpointParent:actor=>actor===child&&child.genuine?root:null,actorGeometry:actor=>({uniformScale:actor.uniformScale,footprint:actor.footprint}),currentPosition:actor=>actor.position,reduced:()=>false,document:{hidden:false},transitCaption:()=>{},pumpTraffic:()=>{},traffic:{request:(id,target,options)=>{requests.push({id,target,options});return true;}}};
  vm.createContext(context);vm.runInContext(move,context);return{context,root,child,actors,requests,geometry};
}
test('a main can physically leave a genuine interrupted clone endpoint without granting any destination coincidence',()=>{
  const h=setup(),target={x:80,y:60};void h.context.move(h.root,target,h.root.serial);
  assert.deepEqual(Array.from(h.requests[0].options.overlapIds),[h.child.id]);
  const traffic=Traffic.createCoordinator({gap:12,obstacles:[],bounds:Scene.actorBounds,legalPoint:()=>true,route:(from,to)=>[from,to]});
  traffic.sync([h.root,h.child]);traffic.request(h.root.id,target,h.requests[0].options);const result=traffic.nextAny();
  assert.equal(result.kind,'move');assert.deepEqual(result.path[0],h.root.position);assert.deepEqual(result.target,target);
  const other=setup();void other.context.move(other.root,{...other.child.position},other.root.serial);
  assert.deepEqual(Array.from(other.requests[0].options.overlapIds),[],'an ordinary main destination inside its child must never inherit clone-absorption privileges');
});
test('ancestry alone, a separated child, or an unrelated identity cannot grant a reverse source exemption',()=>{
  for(const condition of ['no-evidence','separated']){
    const h=setup();if(condition==='no-evidence')h.child.genuine=false;else{h.child.genuine=false;h.child.position={x:45,y:80};}
    void h.context.move(h.root,{x:80,y:60},h.root.serial);assert.deepEqual(Array.from(h.requests[0].options.overlapIds),[],condition);
  }
});
