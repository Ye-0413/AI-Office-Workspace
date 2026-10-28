'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Rooms=require('../lib/room-designs.js'),Venues=require('../lib/venue-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/venue-stage.js'),'utf8');
const application=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));

// Only DOM/image-decoder boundaries are simulated. The complete production
// venue controller, room resolver and Hong Kong calendar execute unchanged.
// Native composition and full-cast bounds are covered by room-designs-renderer.
function fixture(initial={}){
  const pending=[],commits=[],selections=[],images=[];
  let controller,canCommit=true,failMain=false;
  class Node{
    constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.style={};this.dataset={};this.attributes={};this.listeners=new Map();this.className='';this.textContent='';this.naturalWidth=0;}
    append(...nodes){for(const n of nodes){n.remove();n.parentNode=this;this.children.push(n);}}
    prepend(...nodes){for(const n of nodes){n.remove();n.parentNode=this;}this.children.unshift(...nodes);}
    insertBefore(node,before){const i=this.children.indexOf(before);if(i<0)this.append(node);else{node.remove();node.parentNode=this;this.children.splice(i,0,node);}}
    after(node){if(!this.parentNode)return;const parent=this.parentNode;node.remove();node.parentNode=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
    remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
    replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
    all(){return this.children.flatMap(n=>[n,...n.all()]);}
    querySelector(selector){return this.all().find(n=>selector.startsWith('.')?n.className.split(' ').includes(selector.slice(1)):selector.startsWith('#')?n.id===selector.slice(1):n.tagName===selector)||null;}
    setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    removeAttribute(k){delete this.attributes[k];}
    get src(){return this.getAttribute('src')||'';}set src(value){this.setAttribute('src',value);}
    get options(){return this.children;}
    addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}
    removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}
    dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event);}
    decode(){if(this===art){this.naturalWidth=1672;return failMain?Promise.reject(Error('main decode failed')):Promise.resolve();}return new Promise((resolve,reject)=>pending.push({node:this,path:this.src,resolve:()=>{this.naturalWidth=1672;resolve();},reject:()=>reject(Error('decode failed'))}));}
    animate(){assert.fail('incompatible full room layouts must never crossfade');}
  }
  const document=new Node('document'),office=new Node('main'),world=new Node('div'),topbar=new Node('header'),actions=new Node('div');
  actions.className='top-actions';topbar.append(actions);office.append(world,topbar);document.append(office);
  const art=new Node('img');art.id='room-art';art.src='../assets/office-room.jpg';art.setAttribute('alt','Original room');world.append(art);
  const actors=new Node('div'),sentinel=new Node('button');actors.id='actors';sentinel.id='observed-agent';sentinel.session={id:'cursor:actual',parentId:'codex:actual'};actors.append(sentinel);world.append(actors);
  const state={venue:'workshop',roomDesign:'rain-courtyard',language:'en',reducedMotion:false,lowPower:false,hidden:false,now:'2026-10-28T04:00:00Z',...initial};
  document.createElement=tag=>{const n=new Node(tag);if(tag==='img')images.push(n);return n;};
  document.createElementNS=(_ns,tag)=>new Node(tag);
  const context=vm.createContext({window:{OfficeVenues:Venues,OfficeRoomDesigns:Rooms},document,getComputedStyle:n=>({opacity:n.style.opacity??'1',transform:'none'})});
  vm.runInContext(source,context);
  controller=context.window.OfficeVenueStage.create({office,world,topbar,getState:()=>state,
    onSelectRoom:(id,meta)=>{selections.push({id,...meta});state.roomDesign=id;controller.update(state);},
    onCommitArtwork:artwork=>{if(!canCommit)return false;commits.push(artwork);office.dataset.roomDesign=artwork.layout?.id;return true;}});
  const query=selector=>office.querySelector(selector);
  return{state,office,world,art,actors,sentinel,controller,pending,commits,selections,images,query,
    allowCommit:value=>{canCommit=value;},failMain:value=>{failMain=value;},
    update(patch){Object.assign(state,patch);controller.update(patch);},
    async decode(id,{reject=false}={}){const index=pending.findIndex(p=>p.path===Rooms.get(id).background);assert.ok(index>=0,'pending room '+id);const item=pending.splice(index,1)[0];item[reject?'reject':'resolve']();await flush();},
    async ready(){while(pending.length){pending.shift().resolve();await flush();}},
    select(id,keyboard=false){const select=query('.venue-select');select.dispatchEvent({type:keyboard?'keydown':'pointerdown'});select.value=id;select.dispatchEvent({type:'change'});},
    painted(){return art.dataset.artworkKey;},geometry(){return office.dataset.roomDesign;},phase(){return query('.venue-stage')?.dataset.artState;}
  };
}

test('live daily rotation changes at Hong Kong midnight after decoding, with no session DOM replacement',async()=>{
  const before='2026-10-28T15:59:59.999Z',after='2026-10-28T16:00:00.000Z';
  const h=fixture({roomDesign:'daily',now:before});await h.ready();
  const first=Rooms.resolve({now:before}),next=Rooms.resolve({now:after});assert.notEqual(first.id,next.id);
  assert.equal(h.painted(),first.key);assert.equal(h.geometry(),first.id);const count=h.commits.length;
  h.controller.refreshArtwork(after);assert.equal(h.phase(),'loading');assert.equal(h.geometry(),first.id);assert.equal(h.painted(),first.key);
  await h.decode(next.id);assert.equal(h.geometry(),next.id);assert.equal(h.painted(),next.key);assert.equal(h.commits.length,count+1);
  h.controller.refreshArtwork('2026-10-29T15:00:00Z');await flush();assert.equal(h.pending.length,0);assert.equal(h.commits.length,count+1);
  assert.equal(h.actors.children[0],h.sentinel);assert.deepEqual(h.sentinel.session,{id:'cursor:actual',parentId:'codex:actual'});
  assert.equal(h.state.roomDesign,'daily','automatic resolution never writes a manual preference');
});

test('holiday takeover and ordinary-day restoration use the current date when returning from hidden',async()=>{
  const h=fixture({roomDesign:'daily',now:'2026-10-30T15:59:59Z'});await h.ready();const ordinary=h.geometry();
  h.update({hidden:true});h.state.now='2026-10-30T16:00:00Z';h.update({hidden:false,now:h.state.now});
  assert.equal(h.geometry(),ordinary);await h.decode('halloween');assert.equal(h.geometry(),'halloween');assert.equal(h.painted(),'room:halloween');
  h.controller.refreshArtwork('2026-11-03T04:00:00Z');const next=Rooms.resolve({now:'2026-11-03T04:00:00Z'});await h.decode(next.id);
  assert.equal(h.geometry(),next.id);assert.equal(next.mode,'daily');assert.equal(h.state.roomDesign,'daily');
});

test('manual choice survives holiday dates, heartbeat and controller restart; selecting Daily resumes the calendar',async()=>{
  const now='2026-12-25T04:00:00Z',h=fixture({roomDesign:'orbital-bridge',now});await h.ready();
  h.controller.refreshArtwork('2026-12-26T04:00:00Z');await flush();assert.equal(h.pending.length,0);assert.equal(h.geometry(),'orbital-bridge');
  h.controller.destroy();const restored=fixture({...h.state,now});await restored.ready();assert.equal(restored.geometry(),'orbital-bridge');
  restored.select('daily',true);await restored.decode('christmas');assert.equal(restored.geometry(),'christmas');assert.equal(restored.state.roomDesign,'daily');
  assert.deepEqual(restored.selections.map(plain),[{id:'daily',source:'keyboard'}]);
  restored.update({language:'zh'});assert.equal(restored.query('.venue-select').value,'daily');assert.match(restored.query('.venue-select').options[0].textContent,/每日新房间/);
});

for(const roomDesign of ['loykrathong','legacy'])test(`Daily option advertises the automatic Hong Kong room during ${roomDesign} selection and date changes`,async()=>{
  const before='2026-10-29T15:59:59.999Z',after='2026-10-29T16:00:00.000Z',holiday='2026-12-25T04:00:00Z';
  const h=fixture({roomDesign,now:before});await h.ready();
  const select=h.query('.venue-select'),daily=select.options.find(option=>option.value==='daily');
  const selected=select.options.find(option=>option.value===select.value),selectedValue=select.value,selectedLabel=selected.textContent;
  const painted=h.painted(),geometry=h.geometry(),commits=h.commits.length;
  const first=Rooms.resolve({selection:'daily',now:before}),next=Rooms.resolve({selection:'daily',now:after});
  assert.equal(first.id,'glasshouse');assert.notEqual(first.id,next.id);
  assert.equal(daily.textContent,'Daily room · '+first.room.nameEn);
  h.controller.refreshArtwork(after);await flush();assert.equal(daily.textContent,'Daily room · '+next.room.nameEn);
  h.controller.refreshArtwork(holiday);await flush();assert.equal(daily.textContent,'Daily room · '+Rooms.get('christmas').nameEn);
  assert.equal(select.value,selectedValue);assert.equal(selected.textContent,selectedLabel);assert.equal(h.state.roomDesign,roomDesign);
  assert.equal(h.painted(),painted);assert.equal(h.geometry(),geometry);assert.equal(h.commits.length,commits);assert.equal(h.pending.length,0,'only the automatic option caption changes');
  h.update({language:'zh'});assert.equal(daily.textContent,'每日新房间 · '+Rooms.get('christmas').nameZh);
  const manual=Rooms.get(roomDesign)||Venues.getVenue(selectedValue);assert.equal(selected.textContent,manual.icon+' '+manual.nameZh);assert.equal(select.value,selectedValue);
});

test('a finite physical owner defers the whole swap and refresh retries the same decoded choice later',async()=>{
  const h=fixture();await h.ready();h.allowCommit(false);const before=h.commits.length;
  h.update({roomDesign:'orbital-bridge'});await h.decode('orbital-bridge');
  assert.equal(h.phase(),'pending');assert.equal(h.geometry(),'rain-courtyard');assert.equal(h.painted(),'room:rain-courtyard');assert.equal(h.commits.length,before);
  assert.equal(h.world.all().filter(n=>n.className==='venue-art-buffer').length,0);
  h.allowCommit(true);h.controller.refreshArtwork(h.state.now);await h.decode('orbital-bridge');assert.equal(h.phase(),'ready');assert.equal(h.geometry(),'orbital-bridge');assert.equal(h.painted(),'room:orbital-bridge');
});

test('late decodes from superseded rooms cannot change geometry or overwrite the newest painting',async()=>{
  const h=fixture();await h.ready();h.update({roomDesign:'orbital-bridge'});h.update({roomDesign:'glasshouse'});
  await h.decode('glasshouse');const count=h.commits.length;await h.decode('orbital-bridge');
  assert.equal(h.commits.length,count);assert.equal(h.geometry(),'glasshouse');assert.equal(h.painted(),'room:glasshouse');assert.equal(h.phase(),'ready');
});

test('failed predecode retains old floor and picture; a later choice can recover',async()=>{
  const h=fixture();await h.ready();const count=h.commits.length;
  h.update({roomDesign:'orbital-bridge'});await h.decode('orbital-bridge',{reject:true});
  assert.equal(h.phase(),'error');assert.equal(h.commits.length,count);assert.equal(h.geometry(),'rain-courtyard');assert.equal(h.painted(),'room:rain-courtyard');
  assert.equal(h.query('.venue-select').getAttribute('aria-busy'),'false');assert.match(h.query('.venue-feedback').textContent,/could not load/);
  h.update({roomDesign:'grand-library'});await h.decode('grand-library');assert.equal(h.geometry(),'grand-library');assert.equal(h.painted(),'room:grand-library');assert.equal(h.phase(),'ready');
});

test('main image decode failure keeps the already decoded matching floor visible until recovery',async()=>{
  const h=fixture();await h.ready();h.failMain(true);h.update({roomDesign:'orbital-bridge'});await h.decode('orbital-bridge');
  assert.equal(h.phase(),'error');assert.equal(h.geometry(),'orbital-bridge');
  const buffer=h.world.all().find(n=>n.className==='venue-art-buffer');assert.ok(buffer);assert.equal(buffer.dataset.artworkKey,'room:orbital-bridge');assert.equal(buffer.style.opacity,'1');
  h.failMain(false);h.update({roomDesign:'glasshouse'});await h.decode('glasshouse');assert.equal(h.geometry(),'glasshouse');assert.equal(h.painted(),'room:glasshouse');assert.equal(h.world.all().some(n=>n.className==='venue-art-buffer'),false);
});

test('destroy cancels a pending decoder and rejects its late completion',async()=>{
  const h=fixture();await h.ready();h.update({roomDesign:'orbital-bridge'});const count=h.commits.length;h.controller.destroy();await h.decode('orbital-bridge');
  assert.equal(h.commits.length,count);assert.equal(h.query('.venue-stage'),null);assert.equal(h.query('.venue-select'),null);assert.equal(h.art.src,'../assets/office-room.jpg');assert.equal(h.art.getAttribute('alt'),'Original room');
  assert.equal(h.actors.children[0],h.sentinel);
});

function production(name){const start=application.indexOf('  function '+name+'(');assert.ok(start>=0);const end=application.slice(start+1).search(/\n  (?:async )?function /);return application.slice(start,end<0?application.length:start+1+end);}
function relocation(){
  const sessions=[{id:'codex:real',activity:'reading',status:'active',turnId:'turn-actual'},{id:'cursor:helper',activity:'planning',status:'active',parentId:'codex:real'}];
  const actors=new Map(sessions.map((session,i)=>[session.id,{id:session.id,session,position:{x:20+i*20,y:65},node:{dataset:{},style:{}},image:{},performance:{clock:492.4},workSince:123456,helper:Boolean(session.parentId)}]));
  const room=Rooms.get('orbital-bridge'),seats=new Map(sessions.map((s,i)=>[s.id,{x:40+i*15,y:70,zone:i?'board':'library'}]));
  const fitted={seats,uniformScale:.8,entryPoint:{x:48,y:78},visible:sessions},calls=[],frames=[];
  const base={},nextScene={},layout={layoutAllWalking:cast=>{calls.push(['fit',...cast.map(s=>s.id)]);return fitted;}};
  const c={activeRoom:Rooms.get('rain-courtyard'),actors,BaseScene:base,BaseWalkingLayout:{forScene:scene=>{assert.equal(scene,nextScene);return layout;}},Scene:base,WalkingLayout:{},traffic:{},settings:{agentScale:1.25},actorFootprints:new Map(),CLOCK_RESERVED:[],office:{dataset:{}},destroyed:false,finite:false,returning:false,
    hasFiniteClone:()=>c.finite,cloneAwaitingReturn:()=>c.returning,window:{OfficeRoomDesigns:{createScene:(scene,r)=>{assert.equal(scene,base);assert.equal(r,room);return nextScene;}}},
    cancelPhysicalRoutes:()=>calls.push(['cancel-routes']),makeTraffic:()=>({fresh:true}),actorTransform:(p,helper)=>JSON.stringify({p,helper}),updateRoomSigns:()=>calls.push(['signs']),visitor:{tick:()=>calls.push(['visitor'])},render:()=>calls.push(['render']),requestAnimationFrame:fn=>frames.push(fn)};
  vm.createContext(c);vm.runInContext(production('commitRoomArtwork'),c);return{c,room,actors,seats,fitted,calls,frames,commit:()=>c.commitRoomArtwork({layout:room})};
}

test('actual room relocation keeps observed objects, source facts, parentage and work clocks while replacing geometry',()=>{
  const h=relocation(),before=[...h.actors.values()].map(a=>({actor:a,node:a.node,image:a.image,performance:a.performance,session:a.session,facts:JSON.stringify(a.session),clock:a.performance.clock,workSince:a.workSince}));
  assert.equal(h.commit(),true);assert.equal(h.c.activeRoom,h.room);assert.equal(h.c.currentPage,h.fitted);assert.equal(h.c.uniformScale,.8);assert.equal(h.c.office.dataset.roomChanging,'true');
  for(const row of before){const a=h.actors.get(row.actor.id);assert.equal(a,row.actor);assert.equal(a.node,row.node);assert.equal(a.image,row.image);assert.equal(a.performance,row.performance);assert.equal(a.session,row.session);assert.equal(JSON.stringify(a.session),row.facts);assert.equal(a.performance.clock,row.clock);assert.equal(a.workSince,row.workSince);assert.deepEqual(plain(a.position),h.seats.get(a.id));assert.equal(a.target,h.seats.get(a.id));}
  assert.deepEqual(h.calls,[['fit','codex:real','cursor:helper'],['cancel-routes'],['signs'],['visitor'],['render']]);
  assert.equal(h.frames.length,1);h.frames.shift()();assert.equal(h.c.office.dataset.roomChanging,undefined);
  const count=h.calls.length;assert.equal(h.commit(),true);assert.equal(h.calls.length,count,'same geometry does not re-fit or restart bodies');
});

test('actual room relocation waits for active journeys, entry, departure and clone return owners without mutations',()=>{
  const changes=[h=>h.c.finite=true,h=>h.c.returning=true,...['motion','entryPending','departing'].map(key=>h=>h.actors.values().next().value[key]=true)];
  for(const change of changes){const h=relocation();change(h);const positions=[...h.actors.values()].map(a=>JSON.stringify(a.position));assert.equal(h.commit(),false);assert.equal(h.calls.length,0);assert.deepEqual([...h.actors.values()].map(a=>JSON.stringify(a.position)),positions);assert.equal(h.c.office.dataset.roomDesign,undefined);}
});
