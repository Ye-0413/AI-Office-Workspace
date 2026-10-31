'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const candidates=source.slice(source.indexOf('  function nextEntryCandidate('),source.indexOf('  function closingDockPairs('));
const pins=source.slice(source.indexOf('  function pinnedDockIds('),source.indexOf('  function syncTraffic('));
function harness(){
 const actors=new Map(),parent={id:'root',session:{id:'root',status:'active'},entryPending:false,spec:{}},first={id:'z-first',session:{id:'z-first',parentId:'root',status:'active'},helper:true,entryPending:true,spec:{}},second={id:'a-second',session:{id:'a-second',parentId:'root',status:'active'},helper:true,entryPending:true,spec:{}};
 actors.set(parent.id,parent);const context={actors,attendance:{standby:[]},Scene:{isClosed:s=>s.status==='closed'},cloneLedger:{parentChain:()=>[]},cloneAncestor:a=>actors.get(a.session.parentId),cloneBusy:()=>false,currentPage:{},uniformScale:1,currentPosition:a=>a.position};
 vm.createContext(context);vm.runInContext(candidates+pins,context);return{context,parent,first,second,actors,pairs:incoming=>Array.from(context.openingDockPairs(incoming),pair=>Array.from(pair))};
}
test('a not-yet-created real helper and the actual pump select exactly the same observed parent and insertion-order owner',()=>{
 const h=harness(),incoming=[h.parent.session,h.first.session,h.second.session],before=JSON.stringify(incoming);
 assert.deepEqual(h.pairs(incoming),[['z-first','root']]);assert.equal(h.actors.size,1,'reading imminent real observations never creates a fake body');
 h.actors.set(h.first.id,h.first);h.actors.set(h.second.id,h.second);assert.equal(h.context.nextEntryCandidate().actor,h.first);assert.deepEqual(h.pairs(incoming),[['z-first','root']]);
 h.first.entryPending=false;assert.equal(h.context.nextEntryCandidate().actor,h.second);assert.deepEqual(h.pairs(incoming),[['a-second','root']]);assert.equal(JSON.stringify(incoming),before);
});
test('queued parent navigation waits without a source pin, while an actually staged split owns its finite source until charge completes',()=>{
 const h=harness();h.actors.set(h.first.id,h.first);const incoming=[h.parent.session,h.first.session];
 for(const state of ['pendingStation','motion','navigation','yielding','routeReservation','resumeNavigation']){h.parent[state]={};assert.deepEqual(h.pairs(incoming),[]);assert.equal(h.context.pinnedDockIds().has('root'),false);h.parent[state]=null;}
 h.first.stagedEntry=true;h.first.navigation={kind:'entry',parentId:'root'};h.parent.pendingStation={due:1700};
 assert.deepEqual(h.pairs(incoming),[['z-first','root']]);assert.equal(h.context.pinnedDockIds().has('root'),true);
 h.first.entryPending=false;h.first.stagedEntry=false;h.first.cloneCharge=true;assert.equal(h.context.pinnedDockIds().has('root'),true);
 h.first.cloneCharge=false;assert.equal(h.context.pinnedDockIds().has('root'),false,'the parent can follow its real latest intent after the charge');
});
test('unknown ancestors, a still-entering ancestor and confirmed ended pending work never receive a source exemption',()=>{
 const h=harness();h.actors.set(h.first.id,h.first);const incoming=[h.parent.session,h.first.session];
 h.parent.entryPending=true;assert.deepEqual(h.pairs(incoming),[]);h.parent.entryPending=false;h.actors.delete('root');assert.deepEqual(h.pairs(incoming),[]);
 h.actors.set('root',h.parent);assert.deepEqual(h.pairs([h.parent.session,{...h.first.session,status:'closed'}]),[]);
});

test('admission accepts only its positive current source, exact helper, target and shared geometry',()=>{
 const h=harness(),a=h.first,p=h.parent;p.position={x:29.05,y:48.2};a.target={x:68.5,y:46.1};
 const ready=()=>h.context.openingRouteReady(a,p);h.context.currentPage={openingOwnerId:a.id,openingProof:null};assert.equal(ready(),false,'a named waiting owner is not a route proof');
 const proof={childId:a.id,parentId:p.id,source:{...p.position},target:{...a.target},scale:1};h.context.currentPage.openingProof=proof;assert.equal(ready(),true);
 for(const patch of [{childId:'another'},{parentId:'unknown'},{source:{x:29.06,y:48.2}},{target:{x:68.5,y:46.2}},{scale:.98}]){h.context.currentPage.openingProof={...proof,...patch};assert.equal(ready(),false,JSON.stringify(patch));}
});
