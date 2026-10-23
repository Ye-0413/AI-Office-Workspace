'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const options=source.slice(source.indexOf('  function nextEntryCandidate('),source.indexOf('  function updateEntranceLane('));
function harness(session={id:'child',parentId:'parent',status:'closed',closed:true,activity:'idle'}){
  const parent={id:'parent',helper:false,entryPending:false,position:{x:43,y:44},session:{id:'parent',status:'active',activity:'planning'}},child={id:'child',helper:true,entryPending:false,position:{x:48.3,y:84},navigation:null,session:{id:'child',parentId:'parent',status:'active',activity:'coding'}};
  const actors=new Map([[parent.id,parent],[child.id,child]]);
  const context={cloneLedger:{parentChain:()=>[]},actors,snapshot:{sessions:[parent.session,session]},deferredPhysicalScale:null,settings:{agentScale:1,sceneVenue:'workshop'},currentPage:{requestedScale:1},seats:new Map(),uniformScale:.4,actorFootprints:new Map(),CLOCK_RESERVED:[],
    Scene:require('../lib/scene-model.js'),hasBodyActivity:s=>s.status==='active'&&s.activity!=='idle',
    destroyed:false,fitting:false,quietSprites:()=>false,trafficWaiters:new Map(),traffic:{state:()=>({queued:0,activeMoves:[]})},
    cloneBusy:a=>['splitting','returning','absorbing'].includes(a.clonePhase),
    cloneAncestor:a=>a===child?actors.get('parent'):null,pinnedDockIds:()=>new Set(),currentPosition:a=>a.position,endpointParent:()=>null,canYieldAtStation:(a,pinned)=>!pinned.has(a.id)};
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(options,context);return{context,parent,child,actors,read:()=>context.sceneOptions()};
}
test('the first genuine closed-helper snapshot protects both actual dock bodies before any return owner has been created',()=>{
  const h=harness(),facts=JSON.stringify(h.context.snapshot),options=h.read();
  assert.deepEqual(Array.from(options.closingDockPairs,pair=>Array.from(pair)),[['child','parent']]);assert.equal(h.child.navigation,null);
  assert.equal(options.immovableIds.has('child'),true);assert.equal(options.immovableIds.has('parent'),true);
  assert.deepEqual(h.parent.position,{x:43,y:44});assert.equal(JSON.stringify(h.context.snapshot),facts,'previewing a finite physical dock never changes observed session facts');
});
test('only an actual visible helper and actual visible ancestor can establish the finite dock pair',()=>{
  for(const mutate of [h=>h.child.entryPending=true,h=>h.parent.entryPending=true,h=>h.child.helper=false,h=>h.actors.delete('parent')]){
    const h=harness();mutate(h);assert.equal(h.read().closingDockPairs.size,0);
  }
  for(const status of ['stale','active']){const h=harness({id:'child',parentId:'parent',status,activity:'unknown'});assert.equal(h.read().closingDockPairs.size,0,'uncertainty or ordinary work is not a closed-helper signal');}
});
test('a real return/absorb owner persists until removal, while fresh work revokes that old proof immediately',()=>{
  for(const kind of ['return','absorb']){
    const h=harness({id:'child',parentId:'parent',status:'idle',activity:'idle'});h.child.navigation={kind,parentId:'parent'};
    assert.deepEqual(Array.from(h.read().closingDockPairs,pair=>Array.from(pair)),[['child','parent']]);
    h.context.snapshot.sessions[1]={id:'child',parentId:'parent',status:'active',activity:'coding'};
    assert.equal(h.read().closingDockPairs.size,0,'resumeActiveActor will cancel the same obsolete return during this reconciliation');
    h.actors.delete('child');assert.equal(h.read().closingDockPairs.size,0,'a removed body cannot retain a model dock owner');
  }
});
