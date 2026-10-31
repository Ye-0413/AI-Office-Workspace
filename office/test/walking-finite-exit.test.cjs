'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function fn(name){const start=source.search(new RegExp('  (?:async )?function '+name+'\\('));assert.notEqual(start,-1,'production function '+name);const lineEnd=source.indexOf('\n',start);if(/\}\s*$/.test(source.slice(start,lineEnd)))return source.slice(start,lineEnd);const tail=source.slice(start+1).search(/\n  (?:async )?function /);return tail<0?source.slice(start):source.slice(start,start+1+tail);}
const session=(id,patch={})=>({id,provider:'codex',status:'active',activity:'coding',...patch});
function actor(id,patch={}){return{id,session:session(id),helper:false,entryPending:false,position:{x:30,y:69},serial:7,spec:{stale:false},node:{dataset:{}},...patch};}
function harness(rows=[],present=[]){const actors=new Map(rows.map(a=>[a.id,a])),snapshot={sessions:rows.map(a=>a.session)},jobs=[];let refreshed=0;
 const context={Scene,actors,snapshot,companionRegistry:null,destroyed:false,deferredPhysicalScale:null,document:{hidden:false},nativeWindowHidden:false,currentPage:{visible:present},cloneLedger:{parentChain:id=>{const chain=[],seen=new Set([id]);let s=snapshot.sessions.find(s=>s.id===id)||actors.get(id)?.session;while(s?.parentId&&!seen.has(s.parentId)){const parentId=s.parentId;seen.add(parentId);chain.push(parentId);s=snapshot.sessions.find(s=>s.id===parentId)||actors.get(parentId)?.session;}return chain;}},relatedClones:a=>[...actors.values()].filter(b=>b.helper&&context.cloneLedger.parentChain(b.id).includes(a.id)),pinnedDockIds:()=>new Set(),hasBodyActivity:s=>!Scene.isClosed(s)&&!s.disconnected&&s.status!=='stale'&&['active','waiting'].includes(s.status)&&s.activity!=='idle',queueLayoutRefresh:()=>refreshed++,queueMicrotask:f=>jobs.push(f)};
 // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);vm.runInContext(fn('sceneHidden')+fn('finiteExitIds'),context);return{context,actors,snapshot,jobs,read:()=>Array.from(context.finiteExitIds(present)),refreshes:()=>refreshed};}
test('first retirement layout records only real visible main departures, before depart creates an owner',()=>{
 const absent=actor('absent'),closed=actor('closed',{session:session('closed',{status:'closed'})}),idle=actor('idle',{session:session('idle',{status:'idle',activity:'idle'})}),live=actor('live'),stale=actor('stale',{session:session('stale',{status:'stale',activity:'unknown'})}),unknown=actor('unknown',{session:session('unknown',{status:'active',activity:'unknown'})}),helper=actor('helper',{helper:true,session:session('helper',{parentId:'absent',status:'closed'})}),outside=actor('outside',{entryPending:true,session:session('outside',{status:'closed'})});
 const h=harness([absent,closed,idle,live,stale,unknown,helper,outside],[live.session,unknown.session]);h.snapshot.sessions=h.snapshot.sessions.filter(s=>s.id!=='absent');
 // Keep the helper unrelated: a real descendant must protect its actual main.
 helper.session.parentId='another-main';
 const facts=JSON.stringify(h.snapshot);assert.deepEqual(h.read(),['absent','closed','idle']);assert.equal(closed.navigation,undefined);assert.equal(closed.departing,undefined);assert.equal(JSON.stringify(h.snapshot),facts);
});
test('new observed descendants including a not-yet-created grandchild revoke first-frame exit evidence',()=>{
 const main=actor('main',{session:session('main',{status:'closed'})}),middle=session('middle',{parentId:'main',status:'closed'}),child=session('new-grandchild',{parentId:'middle'}),h=harness([main],[child]);h.snapshot.sessions=[main.session,middle,child];
 assert.equal(h.actors.size,1);assert.deepEqual(h.read(),[],'incoming relationship evidence is checked before makeActor');
 const childBody=actor('old-child',{helper:true,session:session('old-child',{parentId:'main',status:'stale'})});h.actors.set(childBody.id,childBody);h.snapshot.sessions.push(childBody.session);assert.deepEqual(h.context.finiteExitIds([]).size,0,'existing uncertain child also retains its observed ancestor');
});
test('holding and named return docks stay physical; a fresh same-ID body revokes an exit/resume owner',()=>{
 const main=actor('main',{departing:true,navigation:{kind:'exit'},session:session('main',{status:'closed'})}),held=actor('held',{holdingFamily:true,session:session('held',{status:'closed'})}),pinned=actor('pinned',{session:session('pinned',{status:'closed'})}),h=harness([main,held,pinned]);h.context.pinnedDockIds=()=>new Set(['pinned']);
 assert.deepEqual(h.read(),['main']);main.navigation=null;main.resumeNavigation={kind:'exit'};assert.deepEqual(h.read(),['main'],'real exit survives a geometry-owned pause');
 const fresh=session('main');h.snapshot.sessions[0]=fresh;assert.equal(h.context.finiteExitIds([fresh]).has('main'),false);assert.equal(main.resumeNavigation.kind,'exit','classification alone never cancels the owner or changes actor state');
 h.snapshot.sessions[0]=session('main',{status:'closed',parentId:'late-observed-parent'});assert.equal(h.context.finiteExitIds([]).has('main'),false,'a newly observed parent relationship cannot keep borrowing the old main classification');
});
test('scene input receives the exact immutable-by-copy finite set; ordinary isolated calls do not invent exits',()=>{
 const h=harness(),c=h.context;Object.assign(c,{settings:{agentScale:1,sceneVenue:'workshop'},currentPage:{requestedScale:1},seats:new Map(),uniformScale:.4,actorFootprints:new Map(),CLOCK_RESERVED:[],closingDockPairs:()=>new Map(),openingDockPairs:()=>new Map(),currentPosition:a=>a.position,canYieldAtStation:()=>true,endpointParent:()=>null});
 vm.runInContext(fn('sceneOptions'),c);const ids=new Set(['main']),result=c.sceneOptions([],ids);assert.deepEqual(Array.from(result.finiteExitIds),['main']);ids.clear();assert.deepEqual(Array.from(result.finiteExitIds),['main']);assert.equal(c.sceneOptions().finiteExitIds.size,0);
});
test('a pending size preference retains the current physical scale in both allocator bounds until finite clones finish',()=>{
 const h=harness(),c=h.context;
 Object.assign(c,{settings:{agentScale:1.35,sceneVenue:'workshop'},currentPage:{requestedScale:1.35,scaleCeiling:1.35},seats:new Map(),uniformScale:.65,actorFootprints:new Map(),CLOCK_RESERVED:[],closingDockPairs:()=>new Map(),openingDockPairs:()=>new Map(),currentPosition:a=>a.position,canYieldAtStation:()=>true,endpointParent:()=>null});
 vm.runInContext(fn('sceneOptions'),c);
 const normal=c.sceneOptions();assert.equal(normal.requestedScale,1.35);assert.equal(normal.maximumScale,1.35);
 c.deferredPhysicalScale=.65;
 const pending=c.sceneOptions();assert.equal(pending.requestedScale,.65);assert.equal(pending.maximumScale,.65);assert.equal(c.settings.agentScale,1.35,'holding physical geometry must preserve the saved user preference');
 c.deferredPhysicalScale=null;
 const released=c.sceneOptions();assert.equal(released.requestedScale,1.35);assert.equal(released.maximumScale,1.35);
});
test('a newly requested exit waits for its named actual proof; same serial completes only at the real door',async()=>{
 const a=actor('main',{session:session('main',{status:'closed'})}),h=harness([a]),c=h.context;let moved=0,removed=0,arrivals=0,cancels=0;
 Object.assign(c,{currentPage:{visible:[],finiteExitDeferred:true,exitOwnerIds:['main'],exitProof:null},uniformScale:.4,ENTRY_POINT:{x:87,y:78},snapshot:{sessions:[a.session]},relatedClones:()=>[],holdForClones:()=>assert.fail('no child'),cancelAction:b=>{cancels++;return ++b.serial;},text:()=>{},move:async(b,p,s)=>{moved++;assert.equal(p,c.ENTRY_POINT);assert.equal(s,b.serial);b.position={...p};return true;},actualArrival:()=>arrivals++,openDoor:()=>{},removeActor:()=>removed++,showError:e=>{throw e;}});
 vm.runInContext(fn('depart'),c);await c.depart(a);assert.equal(moved,0);assert.equal(cancels,0);assert.equal(a.departing,undefined);assert.equal(a.retireRequested.inactive,false);
 c.currentPage.exitProof={scale:.4,removedIds:['another']};await c.depart(a);assert.equal(moved,0,'a peer proof cannot release this body');
 c.currentPage.exitProof={scale:.35,removedIds:['main']};await c.depart(a);assert.equal(moved,0,'the proven scale must already be the actual shared scale');
 c.currentPage.exitProof={scale:.4,removedIds:['main']};await c.depart(a);assert.equal(moved,1);assert.equal(arrivals,1);assert.equal(removed,1);assert.equal(a.position.x,87);
});
test('late child before first depart holds its real parent even before a child body exists',async()=>{
 const a=actor('main',{session:session('main',{status:'closed'})}),child=session('late',{parentId:'main'}),h=harness([a],[child]),c=h.context;let held=0;
 h.snapshot.sessions.push(child);Object.assign(c,{holdForClones:()=>held++,relatedClones:()=>[],text:()=>{},cancelAction:()=>assert.fail('parent source must stay'),move:()=>assert.fail('must not request ENTRY'),showError:e=>{throw e;}});vm.runInContext(fn('depart'),c);await c.depart(a);assert.equal(held,1);assert.equal(a.retireRequested.inactive,false);
});
test('the last real child removal releases an absent held main through one fresh exit proof without a new snapshot',async()=>{
 const a=actor('main',{holdingFamily:true,retireRequested:{inactive:true}}),h=harness([a]),c=h.context;h.snapshot.sessions=[];assert.deepEqual(h.read(),['main'],'an empty retired hold is finite, not a permanent parking lock');let moved=0;
 Object.assign(c,{currentPage:{visible:[],exitOwnerIds:[]},uniformScale:.4,ENTRY_POINT:{x:87,y:78},relatedClones:()=>[],cancelAction:b=>++b.serial,text:()=>{},move:async()=>{moved++;return true;},actualArrival:()=>{},openDoor:()=>{},removeActor:()=>{},showError:e=>{throw e;},layoutRefreshOwner:null,layoutRefreshRequested:false,clearingActors:false,fitting:false,render:()=>{}});vm.runInContext(fn('depart')+fn('queueLayoutRefresh'),c);await c.depart(a,true);assert.equal(a.holdingFamily,true,'the finite hold remains owned until the new actual proof authorizes exit');assert.equal(moved,0);assert.equal(h.jobs.length,1,'the old page cannot authorize a newly released held body');
 await c.depart(a,true);assert.equal(moved,0,'two release callbacks before the coalesced render cannot bypass proof');assert.equal(h.jobs.length,1,'the same released slot owns only one re-proof');c.currentPage={visible:[],exitOwnerIds:['main'],exitProof:{scale:.4,removedIds:['main']}};await c.depart(a,true);assert.equal(moved,1);assert.equal(a.holdingFamily,false);
});
test('real endpoint re-proves a waiting finite exit at the same scale without requiring a new snapshot',()=>{
 const a=actor('main'),h=harness([a]),c=h.context,refreshes=[];Object.assign(c,{destroyed:false,currentPage:{exitOwnerIds:['retiring'],uniformScale:.4},office:{dispatchEvent:()=>{}},CustomEvent:class{constructor(type,value){this.type=type;this.detail=value.detail;}},currentPosition:b=>b.position,queueLayoutRefresh:force=>refreshes.push(force)});vm.runInContext(fn('actualArrival'),c);c.actualArrival(a,{zone:'desk'},a.serial,'station');assert.deepEqual(refreshes,[true],'a physical endpoint consumes the previous no-route proof even at unchanged scale');c.currentPage.exitOwnerIds=[];c.actualArrival(a,{zone:'desk'},a.serial,'station');assert.deepEqual(refreshes,[true,false],'ordinary endpoint keeps the existing conditional scale check');
});
function arrivalHarness(){
 const a=actor('resized',{session:session('resized',{turnId:'turn-one'}),target:{zone:'desk'}}),h=harness([a]),c=h.context,events=[],refreshes=[];
 Object.assign(c,{office:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,value){this.type=type;this.detail=value.detail;}},currentPosition:b=>({...b.position}),queueLayoutRefresh:force=>refreshes.push(force)});
 vm.runInContext(fn('actualArrival'),c);
 return{...h,actor:a,events,refreshes,arrive:(kind='entry',serial=a.serial)=>c.actualArrival(a,{x:30,y:69,zone:'desk'},serial,kind)};
}
test('preference-only entry and later same-work parking keep their suppression marker while releasing pending layout',()=>{
 for(const kind of ['entry','station']){
  const h=arrivalHarness(),a=h.actor,before=JSON.stringify(a.session),marker={activity:'coding',status:'active',turnId:'turn-one'};a.presentationReentry=marker;
  h.actors.set('pending-clone',actor('pending-clone',{helper:true,entryPending:true}));
  h.arrive(kind);assert.equal(h.events.length,0,'unchanged work must not replay furniture feedback on '+kind);assert.equal(a.presentationReentry,marker,'the first work endpoint retains the already-observed work boundary');
  assert.deepEqual(h.refreshes,[true],'a suppressed decoration must still release the pending clone layout owner');assert.equal(JSON.stringify(a.session),before);
  a.position={x:31,y:69};h.arrive('station');
  assert.equal(h.events.length,0,'a later cosmetic parking move for the same work cannot replay the furniture response');assert.equal(a.presentationReentry,marker);assert.deepEqual(h.refreshes,[true,true]);
  a.session={...a.session,activity:'testing',turnId:'turn-two'};h.arrive('station');
  assert.equal(h.events.length,1,'a later real work change keeps its ordinary response');assert.equal(h.events[0].type,'office:actor-arrival');assert.equal(h.events[0].detail.actorId,a.id);assert.equal(h.events[0].detail.kind,'station');assert.equal(a.presentationReentry,null,'genuinely changed work releases the presentation-only suppression');
  assert.deepEqual(h.refreshes,[true,true,true]);
 }
});
test('work that changes during resize readmission receives its actual first endpoint response',()=>{
 for(const patch of [{activity:'testing'},{status:'waiting'},{turnId:'turn-two'}]){
  const h=arrivalHarness(),a=h.actor;a.presentationReentry={activity:'coding',status:'active',turnId:'turn-one'};a.session={...a.session,...patch};
  h.arrive();assert.equal(h.events.length,1,'changed '+Object.keys(patch)[0]+' is observed work, not a preference-only replay');assert.equal(a.presentationReentry,null);assert.deepEqual(h.refreshes,[false]);
  assert.deepEqual({...h.events[0].detail.position},a.position);assert.equal(h.events[0].detail.serial,a.serial);
 }
});
test('stale, replaced or still-outside arrival callbacks cannot discard a presentation readmission marker',()=>{
 const h=arrivalHarness(),a=h.actor,marker={activity:'coding',status:'active',turnId:'turn-one'};a.presentationReentry=marker;
 h.arrive('entry',a.serial-1);assert.equal(a.presentationReentry,marker);assert.equal(h.events.length,0);assert.equal(h.refreshes.length,0);
 a.entryPending=true;h.arrive();assert.equal(a.presentationReentry,marker);assert.equal(h.refreshes.length,0);
 a.entryPending=false;h.actors.set(a.id,actor(a.id));h.arrive();assert.equal(a.presentationReentry,marker);assert.equal(h.events.length,0);assert.equal(h.refreshes.length,0);
 h.actors.set(a.id,a);h.arrive();assert.equal(a.presentationReentry,marker);assert.equal(h.events.length,0);assert.deepEqual(h.refreshes,[false],'the current actual owner can still complete its suppressed endpoint');
 a.session={...a.session,turnId:'turn-two'};h.arrive('station');assert.equal(a.presentationReentry,null);assert.equal(h.events.length,1);assert.deepEqual(h.refreshes,[false,false]);
});
test('non-work endpoints remain real arrivals while only a genuine work change clears the presentation marker',()=>{
 const h=arrivalHarness(),a=h.actor,marker={activity:'coding',status:'active',turnId:'turn-one'};a.presentationReentry=marker;
 h.arrive('return');assert.equal(h.events.length,1);assert.equal(h.events[0].detail.kind,'return');assert.equal(a.presentationReentry,marker);
 h.arrive('station');assert.equal(h.events.length,1);assert.equal(a.presentationReentry,marker);assert.deepEqual(h.refreshes,[false,false]);
 a.session={...a.session,status:'waiting'};h.arrive('station');assert.equal(h.events.length,2);assert.equal(a.presentationReentry,null);assert.deepEqual(h.refreshes,[false,false,false]);
});
test('readmission clearing preserves original floor and queued semantic markers while pruning ended identities',()=>{
 const retainedMarker={activity:'reading',status:'active',turnId:'earlier-turn'};
 const visible=actor('visible',{session:session('visible',{turnId:'current-turn',title:'PRIVATE TASK CONTENT'})});
 const newPending=actor('new-pending',{entryPending:true});
 const readmitting=actor('readmitting',{entryPending:true,presentationReentry:retainedMarker,session:session('readmitting',{activity:'testing',turnId:'changed-during-entry'})});
 const h=harness([visible,newPending,readmitting]),c=h.context,presentationReentries=new Map([['stale-unrelated',{activity:'idle'}]]),removals=[],revokes=[],effects=[];
 const node={children:[{getAnimations:()=>[{cancel:()=>effects.push('cancel')}]}],replaceChildren(){effects.push('clear');}};
 Object.assign(c,{presentationReentries,clearingActors:false,layoutRefreshOwner:{old:true},layoutRefreshRequested:true,seats:new Map([['old-seat',{}]]),
  removeActor:id=>{assert.equal(c.clearingActors,true);removals.push(id);h.actors.delete(id);},revokeTransfer:(...args)=>revokes.push(args),traffic:{clear:()=>effects.push('traffic')},$:()=>node});
 vm.runInContext(fn('clearActors'),c);c.clearActors({readmission:true});
 assert.deepEqual([...presentationReentries.keys()],['visible','readmitting']);assert.deepEqual({...presentationReentries.get('visible')},{activity:'coding',status:'active',turnId:'current-turn'});
 assert.equal(presentationReentries.get('readmitting'),retainedMarker,'a second preference change preserves the original suppression boundary');assert.doesNotMatch(JSON.stringify([...presentationReentries]),/PRIVATE TASK CONTENT|changed-during-entry/);
 assert.deepEqual(removals,['visible','new-pending','readmitting']);assert.equal(h.actors.size,0);assert.equal(c.seats.size,0);assert.equal(c.clearingActors,false);assert.equal(c.layoutRefreshOwner,null);assert.equal(c.layoutRefreshRequested,false);assert.deepEqual(revokes,[['clear',null,false]]);assert.ok(effects.includes('cancel'));
 const queuedMarker=presentationReentries.get('visible');presentationReentries.set('missing-id',{activity:'coding'});presentationReentries.set('closed-id',{activity:'coding'});h.snapshot.sessions.push(session('closed-id',{status:'closed',closed:true}));
 h.actors.set(readmitting.id,readmitting);c.clearActors({readmission:true});
 assert.equal(h.actors.has('visible'),false,'the previously visible identity is still queued with no current floor body');assert.equal(presentationReentries.get('visible'),queuedMarker,'a second preference change preserves its original pending readmission marker');assert.equal(presentationReentries.get('readmitting'),retainedMarker);assert.equal(presentationReentries.has('missing-id'),false);assert.equal(presentationReentries.has('closed-id'),false,'missing and closed identities cannot retain a presentation lease');
 h.actors.set(visible.id,visible);c.clearActors();assert.equal(presentationReentries.size,0,'ordinary clearing cannot preserve a presentation-only suppression lease');
});
test('a stale exit completion after same-ID recovery cannot emit an arrival, open the door or remove the current owner',async()=>{
 const a=actor('main',{session:session('main',{status:'closed'})}),h=harness([a]),c=h.context;let finish,moved=0,removed=0,arrivals=0,doors=0;
 Object.assign(c,{currentPage:{visible:[],exitOwnerIds:['main'],exitProof:{scale:.4,removedIds:['main']}},uniformScale:.4,ENTRY_POINT:{x:87,y:78},relatedClones:()=>[],cancelAction:b=>++b.serial,text:()=>{},move:()=>{moved++;return new Promise(resolve=>finish=resolve);},actualArrival:()=>arrivals++,openDoor:()=>doors++,removeActor:()=>removed++,showError:e=>{throw e;}});
 vm.runInContext(fn('depart'),c);const pending=c.depart(a);assert.equal(moved,1);const actual={...a.position};a.serial++;a.departing=false;a.navigation=null;a.session=session('main');finish(true);await pending;assert.equal(removed,0);assert.equal(arrivals,0);assert.equal(doors,0);assert.deepEqual(a.position,actual);
});
test('cancelling a real zero-displacement exit forces one proof refresh, while an ordinary label cancel cannot loop',()=>{
 const a=actor('main',{navigation:{kind:'exit'},cloneEffects:new Set(),delays:new Set(),bubble:{dataset:{}},node:{dataset:{},style:{opacity:'1',removeProperty(){}}}}),h=harness([a]),c=h.context;
 Object.assign(c,{trafficWaiters:new Map(),traffic:{cancel:()=>{}},currentPosition:b=>b.position,cloneBusy:()=>false,clonePhase:(b,p)=>b.clonePhase=p,queueTraffic:()=>{},needsOpeningRefresh:()=>false,clearTimeout:()=>{}});vm.runInContext(fn('cancelAction'),c);const facts=JSON.stringify(a.session);c.cancelAction(a);assert.equal(h.refreshes(),1);assert.equal(a.serial,8);assert.equal(a.navigation,null);c.cancelAction(a);assert.equal(h.refreshes(),1);assert.equal(JSON.stringify(a.session),facts);
});
test('a confirmed finite main waiting for its own exit never becomes a temporary yielder, and fresh work revokes that permission lock',()=>{
 const a=actor('main',{retireRequested:{inactive:false}}),h=harness([a]),c=h.context;Object.assign(c,{cloneBusy:()=>false,cancelAction:b=>{b.serial++;b.navigation=null;},needsOpeningRefresh:()=>false});vm.runInContext(fn('canYieldAtStation')+fn('resumeActiveActor'),c);assert.equal(c.canYieldAtStation(a,new Set()),false,'a finite own exit cannot be replaced by temporary/cooperative yield');c.resumeActiveActor(a);assert.equal(a.retireRequested,null);assert.equal(c.canYieldAtStation(a,new Set()),true,'real active recovery restores normal future yield permission');
});
test('the full production render sends first-frame absent/closed exit evidence before reconciliation and excludes a newly observed descendant',()=>{
 const root=actor('retiring',{session:session('retiring',{status:'closed'})}),retained=actor('retained'),h=harness([root,retained],[retained.session]),c=h.context,dom=new Map();let captured,measured,reconciled=0;
 const node=()=>({dataset:{},style:{},textContent:'',firstElementChild:{},replaceChildren(){},querySelector(){return this;}}),noop=()=>{};
 Object.assign(c,{sizeStability:require('../lib/size-stability.js').create(),$:id=>{if(!dom.has(id))dom.set(id,node());return dom.get(id);},office:node(),language:'zh',settings:{agentScale:1,sceneVenue:'workshop'},attendanceModel:{update:()=>({present:[retained.session],retired:['retiring']})},attendance:{present:[]},restedClones:new Set(),cloneLedger:{...c.cloneLedger,update:noop,rootFor:id=>id},Family:{build:()=>({info:new Map(),byId:new Map()})},familyGraph:{info:new Map()},paletteRegistry:{update:noop},measureActorFootprints:sessions=>{measured=sessions.map(s=>s.id);},selectedProject:'',roomSelectionExplicit:false,rooms:[],element:node,actorFootprints:new Map(),CLOCK_RESERVED:[],seats:new Map(),uniformScale:.4,closingDockPairs:()=>new Map(),openingDockPairs:()=>new Map(),canYieldAtStation:()=>true,endpointParent:()=>null,currentPosition:b=>b.position,
  hasFiniteClone:()=>false,cloneAwaitingReturn:()=>false,WalkingLayout:{layoutFullSizeWalking:(sessions,options)=>{captured=options;assert.equal(reconciled,0,'proof precedes depart');return{seats:new Map(),pathsById:new Map(),uniformScale:.4,pages:1};}},reconcileActors:()=>reconciled++,renderConnections:noop,renderRoster:noop,renderInspector:noop,updateSignalSummary:noop,text:noop,tr:value=>value,I18n:require('../lib/i18n-model.js'),previousAttention:new Set(),refreshQuietPresentation:noop,venueStage:null,festivalStage:null,themeEnvironment:null,social:null,stationArrival:null});
 vm.runInContext(fn('nameplateMode')+fn('sceneOptions')+fn('render'),c);c.render();assert.deepEqual(Array.from(captured.finiteExitIds),['retiring']);assert.equal(reconciled,1);assert.deepEqual(Array.from(measured),['retained','retiring'],'a true on-floor exit body needs the current-language full plate measurement too');
 const child=session('late',{parentId:'retiring'});h.snapshot.sessions.push(child);c.attendanceModel.update=()=>({present:[retained.session,child],retired:['retiring']});reconciled=0;c.render();assert.equal(captured.finiteExitIds.size,0);
});
