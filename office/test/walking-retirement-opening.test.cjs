'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const resume=source.slice(source.indexOf('  function needsOpeningRefresh('),source.indexOf('  function cancelPhysicalRoutes('));
const refresh=source.slice(source.indexOf('  function queueLayoutRefresh('),source.indexOf('  function placeOutside('));
const request=source.slice(source.indexOf('  function requestStation('),source.indexOf('  function resumeNavigation('));
function harness({body=false,related=true,present=true}={}){
 const rootSession={id:'root',status:'active',activity:'coding'},childSession={id:'observed-new-helper',parentId:related?'root':'another-main',status:'active',activity:'coding'},jobs=[];
 const root={id:'root',helper:false,spec:{stale:false},entryPending:false,departing:true,retireRequested:{inactive:false},holdingFamily:false,session:rootSession,position:{x:30,y:69},target:{x:30,y:69},motion:{preFirstFrame:true},navigation:{kind:'exit'},node:{dataset:{traffic:'moving'}}},actors=new Map([['root',root]]);
 if(body)actors.set(childSession.id,{id:childSession.id,helper:true,entryPending:true,session:childSession});let renders=0,cancels=0;
 const context={actors,snapshot:{sessions:[rootSession,childSession]},currentPage:{uniformScale:1,targetUniformScale:1,visible:present?[rootSession,childSession]:[rootSession]},uniformScale:1,layoutRefreshOwner:null,layoutRefreshRequested:false,clearingActors:false,destroyed:false,fitting:false,
  hasBodyActivity:s=>s.status==='active'&&s.activity!=='idle',Scene:{isClosed:s=>s.status==='closed',distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)},cloneLedger:{parentChain:id=>id===childSession.id?[childSession.parentId]:[]},queueMicrotask:fn=>jobs.push(fn),render:()=>renders++,performance,
  cancelAction:a=>{cancels++;a.motion=null;a.navigation=null;},queueNavigation:()=>assert.fail('no real station journey exists at the unchanged actual foot')};
 vm.createContext(context);vm.runInContext(resume+refresh+request,context);return{context,root,childSession,jobs,renders:()=>renders,cancels:()=>cancels,flush:()=>{while(jobs.length)jobs.shift()();}};
}
test('fresh main revocation before the first exit frame proves an incoming real split even though no actual arrival will occur',()=>{
 const h=harness(),facts=JSON.stringify(h.context.snapshot),foot={...h.root.position};h.context.resumeActiveActor(h.root);h.context.requestStation(h.root,{...foot});
 assert.equal(h.root.motion,null);assert.equal(h.root.navigation,null);assert.deepEqual(h.root.position,foot);assert.equal(h.root.node.dataset.traffic,'arrived');
 assert.equal(h.jobs.length,1,'the real retired owner release must re-prove the pending observed source without a fabricated arrival');h.flush();assert.equal(h.renders(),1);assert.equal(h.cancels(),1);assert.equal(JSON.stringify(h.context.snapshot),facts);
 h.context.resumeActiveActor(h.root);assert.equal(h.jobs.length,0,'ordinary fresh heartbeats cannot repeat a released owner');
});
test('an already materialized pending helper receives the same one-owner refresh, unrelated or nonpresent records do not',()=>{
 const h=harness({body:true});h.context.resumeActiveActor(h.root);assert.equal(h.jobs.length,1);
 for(const options of [{related:false},{present:false}]){const no=harness(options);no.context.resumeActiveActor(no.root);assert.equal(no.jobs.length,0,JSON.stringify(options));}
 const no=harness();no.context.snapshot.sessions[1]={...no.childSession,status:'closed'};no.context.resumeActiveActor(no.root);assert.equal(no.jobs.length,0,'a confirmed ended record cannot create a new split source');
});
