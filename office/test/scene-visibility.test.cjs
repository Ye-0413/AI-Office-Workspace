'use strict';
// Real renderer functions with a controlled DOM boundary. This is not a
// replacement document.hidden property or visibility event in the native app.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js'),Clones=require('../lib/clone-lifecycle.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function production(name){
  const match=new RegExp('^  function '+name+'\\(','m').exec(source);assert.ok(match,'production '+name+' exists');
  const start=match.index,open=source.indexOf(') {',start)+2;assert.ok(open>start,'body boundary '+name);let depth=0,quote='',comment='';
  for(let i=open;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(comment==='line'){if(c==='\n')comment='';continue;}
    if(comment==='block'){if(c==='*'&&next==='/'){comment='';i++;}continue;}
    if(quote){if(c==='\\')i++;else if(c===quote)quote='';continue;}
    if(c==='/'&&next==='/'){comment='line';i++;continue;}if(c==='/'&&next==='*'){comment='block';i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&!--depth)return source.slice(start,i+1);
  }
  assert.fail('bounded production function '+name);
}
function fixture({documentHidden=false,actualQuietClones=false}={}){
  const calls=[],office={dataset:{}},document={hidden:documentHidden};
  const session={id:'codex:visibility-real-identity',provider:'codex',status:'active',activity:'coding',turnId:'observed-one',parentId:'codex:observed-parent',lastEventAt:1700000000000};
  const animation={currentTime:5176,playState:'running'},node={dataset:{},style:{removeProperty(key){delete this[key];},opacity:'1',visibility:'visible',transform:'matrix(1,0,0,1,384,496.8)'},clock:animation};
  const actor={id:session.id,session,node,serial:19,cloneEffects:new Set(),delays:new Set(),bubble:{dataset:{}},position:{x:30,y:69},target:{x:30,y:69,zone:'desk'},wantedAsset:'clawd-static-base.svg',spec:{asset:'clawd-working-typing.svg'},performance:{clock:animation}};
  const actors=new Map([[actor.id,actor]]),context={numberFlip:null,document,office,actors,settings:{},language:'zh',calls,Scene,Clones,
    trafficWaiters:new Map(),traffic:{cancel(){}},currentPosition:row=>({...row.position}),cloneBusy:row=>['splitting','returning','absorbing'].includes(row.clonePhase),endpointParent:()=>null,
    clonePhase:(row,phase)=>{row.clonePhase=phase;row.node.dataset.clonePhase=phase;},
    getComputedStyle:node=>({opacity:node.style.opacity,transform:node.style.transform}),clearTimeout(){},queueTraffic(){},needsOpeningRefresh:()=>false,queueLayoutRefresh(){},
cloneAncestor:()=>null,finishCloneReturn:row=>{calls.push({name:'finishCloneReturn',args:[row]});actors.delete(row.id);},fadeBody:()=>{calls.push({name:'fadeBody',args:[]});}};
  const log=name=>(...args)=>calls.push({name,args});
  Object.assign(context,{usageHistory:{updateStatus:log('usage')},homeTokenUsage:{update:log('tokens')},manualQuestions:{update:log('questions')},setupAssistant:{update:log('setup')},render:log('render'),settleQuietCloneEffects:log('quietClones'),setPose:log('pose'),renderHelperLinks:log('links'),visitor:{tick:log('visitor')},venueStage:{update:log('venue')},festivalStage:{update:log('festival')},themeEnvironment:{update:log('theme')},social:{update:log('social')},stationArrival:{update:log('station')},scenery:{update:log('scenery')},ensureMotionTicker:log('ticker')});
  // This legacy fixture has no finite slot-transfer owner.
  Object.assign(context,{transferOwner:null,transferAvailable:()=>false,transferEligible:()=>new Set(),revokeTransfer:()=>{},queueTransferContinuation:()=>{}});
  vm.createContext(context);
  context.render=()=>{calls.push({name:'render',args:[]});if(actualQuietClones){for(const incoming of api.state().snapshot.sessions){const row=actors.get(incoming.id);if(row){row.session=incoming;api.resumeActiveActor(row);}}}};
  const api=vm.runInContext(`let nativeWindowHidden=false,snapshotReceived=0,snapshot={sessions:[]};\n${['sceneHidden','refreshVisibility','receive',...(actualQuietClones?['settleQuietCloneEffects','hasBodyActivity','resumeActiveActor','cancelAction']:[])].map(production).join('\n')}\nfunction sceneContext(){return {hidden:sceneHidden()};}\nfunction quietSprites(){return sceneHidden();}\n({receive,hidden:sceneHidden,refresh:refreshVisibility,${actualQuietClones?'resumeActiveActor,':''}state:()=>({nativeWindowHidden,snapshotReceived,snapshot})})`,context);
  return {api,session,actor,actors,node,animation,calls,document,office,packet:windowVisibility=>({mode:'live',now:1700000000001,sessions:[session],connections:[],windowVisibility,usageLog:{available:true},setup:{running:false}})};
}
const count=(f,name)=>f.calls.filter(call=>call.name===name).length;

test('the actual scene-hidden predicate is document-hidden OR strict native-hidden evidence',()=>{
  for(const documentHidden of [false,true])for(const nativeHidden of [false,true]){
    const f=fixture({documentHidden});f.api.receive(f.packet({available:true,hidden:nativeHidden}));
    assert.equal(f.api.hidden(),documentHidden||nativeHidden);
  }
});

test('unknown, malformed and legacy host fields clear an old native flag and fall back to the real document state',()=>{
  for(const value of [undefined,null,{}, {available:false,hidden:null},{available:true,hidden:'true'},{available:true,hidden:'false'},{available:true,hidden:1},{available:true,hidden:0}]){
    const f=fixture();f.api.receive(f.packet({available:true,hidden:true}));assert.equal(f.api.hidden(),true);
    f.api.receive(f.packet(value));assert.equal(f.api.hidden(),false);assert.equal(f.api.state().nativeWindowHidden,false);
    assert.equal(count(f,'station'),2,'there is exactly one genuine hide and one fallback restore');
    f.document.hidden=true;assert.equal(f.api.hidden(),true,'document visibility remains independent and authoritative');
  }
});

test('a failed native read retains an explicit last-confirmed boolean without inventing a restore',()=>{
  const f=fixture(),confirmed={available:true,hidden:true,visible:false,minimized:true,appHidden:false};f.api.receive(f.packet(confirmed));
  const retained={available:false,hidden:true,visible:false,minimized:true,appHidden:false};f.api.receive(f.packet(retained));
  assert.equal(f.api.hidden(),true);assert.equal(count(f,'station'),1);assert.equal(f.api.state().snapshot.windowVisibility,retained);
  assert.deepEqual(retained,{available:false,hidden:true,visible:false,minimized:true,appHidden:false});
  f.api.receive(f.packet({available:false,hidden:false}));assert.equal(f.api.hidden(),false,'a last-confirmed visible boolean remains valid evidence too');
});

test('unchanged effective hidden truth and metadata snapshots cannot repeatedly refresh finite decorations or work clocks',()=>{
  const f=fixture();f.api.receive(f.packet({available:true,hidden:true}));
  for(let i=0;i<10;i++)f.api.receive({...f.packet({available:i%2===0,hidden:true}),now:1700000000010+i});
  assert.equal(count(f,'station'),1);assert.equal(count(f,'pose'),1);assert.equal(count(f,'render'),11);
  assert.equal(f.actor.performance.clock,f.animation);assert.equal(f.animation.currentTime,5176);assert.equal(f.animation.playState,'running');
  f.document.hidden=true;f.api.receive(f.packet({available:true,hidden:false}));
  assert.equal(f.api.hidden(),true);assert.equal(count(f,'station'),1,'changing only the masked native flag does not refresh twice');
});

test('host visibility stays separate from observed AI facts and raw metadata survives normal snapshot acceptance',()=>{
  const f=fixture(),before=JSON.stringify(f.session),actorNode=f.node,clock=f.animation;
  const host={available:true,hidden:true,visible:false,minimized:true,appHidden:false},packet={...f.packet(host),activityStats:{today:17},monitor:{running:true}};
  f.api.receive(packet);
  const state=f.api.state();assert.equal(state.snapshot.windowVisibility,host);assert.equal(state.snapshot.sessions[0],f.session);assert.equal(state.snapshot.activityStats,packet.activityStats);assert.equal(state.snapshot.monitor,packet.monitor);
  assert.equal(count(f,'tokens'),1);assert.equal(count(f,'questions'),1);
  assert.equal(f.calls.find(call=>call.name==='tokens').args[0],state.snapshot);
  assert.equal(f.calls.find(call=>call.name==='questions').args[0],state.snapshot);
  assert.equal(JSON.stringify(f.session),before);assert.equal(f.actors.size,1);assert.equal(f.actors.get(f.actor.id),f.actor);assert.equal(f.actor.node,actorNode);assert.equal(f.actor.performance.clock,clock);assert.equal(f.actor.serial,19);
  assert.equal(f.node.style.opacity,'1');assert.equal(f.node.style.visibility,'visible');assert.equal(f.node.style.transform,'matrix(1,0,0,1,384,496.8)');
});

test('the production visibility refresh updates only presentation and restarts the shared ticker only upon visible truth',()=>{
  const f=fixture();f.api.receive(f.packet({available:true,hidden:true}));
  assert.equal(f.office.dataset.hidden,'true');assert.equal(count(f,'ticker'),0);assert.equal(count(f,'scenery'),0);assert.equal(count(f,'station'),1);assert.equal(count(f,'social'),1);
  assert.equal(f.calls.find(call=>call.name==='venue').args[0].hidden,true);
  f.api.receive(f.packet({available:true,hidden:false}));
  assert.equal(f.office.dataset.hidden,'false');assert.equal(count(f,'ticker'),1);assert.equal(count(f,'scenery'),1);assert.equal(count(f,'station'),2);assert.equal(count(f,'social'),2);
  assert.equal(count(f,'pose'),2);assert.equal(f.actors.get(f.actor.id),f.actor);assert.equal(f.node.clock,f.animation);
});

test('a malformed non-session payload cannot change native visibility or create a presentation refresh',()=>{
  const f=fixture();f.api.receive(f.packet({available:true,hidden:true}));const before=f.api.state().snapshot;
  for(const value of [null,{}, {windowVisibility:{hidden:false}},{sessions:'invalid',windowVisibility:{hidden:false}}])f.api.receive(value);
  assert.equal(f.api.hidden(),true);assert.equal(f.api.state().snapshot,before);assert.equal(f.api.state().snapshotReceived,1);assert.equal(count(f,'station'),1);
  assert.equal(count(f,'tokens'),1);assert.equal(count(f,'questions'),1,'invalid packets never reach the question controller');
});


test('a host-hidden snapshot containing fresh same-ID work cannot quiet-absorb the old actor before reconciliation',()=>{
  const f=fixture({actualQuietClones:true});
  f.actor.helper=true;f.actor.departing=true;f.actor.clonePhase='absorbing';f.actor.navigation={kind:'absorb',parentId:'codex:observed-parent',reason:'ended'};
  f.actor.session={...f.session,status:'closed',closed:true,activity:'idle'};
  const fresh={...f.session,turnId:'observed-fresh-work',lastEventAt:f.session.lastEventAt+1};
  f.api.receive({...f.packet({available:true,hidden:true}),sessions:[fresh]});
  assert.equal(count(f,'finishCloneReturn'),0,'the authoritative fresh snapshot must reconcile before any quiet return can remove its old same-ID body');
  assert.equal(f.actors.get(f.actor.id),f.actor);
  assert.equal(f.actor.session,fresh);assert.equal(f.actor.serial,20,'the real old absorption owner is revoked once');
  assert.equal(f.actor.clonePhase,'working');assert.equal(f.actor.navigation,null);assert.equal(f.actor.departing,false);
  assert.equal(f.actor.node,f.node);assert.equal(f.actor.performance.clock,f.animation);assert.equal(f.animation.currentTime,5176);
});
