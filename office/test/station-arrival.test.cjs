'use strict';
// Production controller, real Scene/physical-owner model, and a deterministic
// DOM/WAAPI boundary. These tests do not claim browser rendering or FPS.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js'),Social=require('../lib/social-interactions.js'),Layout=require('../lib/walking-layout.js');
const Venues=require('../lib/venue-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/station-arrival.js'),'utf8');
function fixture({venue='workshop',zone='library',activity,quiet=false}={}) {
  let time=1000,next=0;const raf=new Map(),motions=[];
  const settings={venue,theme:'spring',scale:1,mode:'live',reducedMotion:quiet,lowPower:false,hidden:false,fitting:false};
  const classes=n=>(n.attrs.class || '').split(/\s+/);
  class Node {
    constructor(tag){this.tagName=tag;this.attrs={};this.dataset={};this.style={};this.children=[];this.parentNode=null;this.ownerDocument=document;this.animations=[];this.classList={add:(...values)=>this.attrs.class=[...new Set([...classes(this),...values])].join(' ')};}
    get isConnected(){return this===world||Boolean(this.parentNode?.isConnected);}
    append(node){this.children.push(node);node.parentNode=this;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
    matches(selector){return selector.split(',').some(s=>{const parts=s.trim().split(/\s+/),part=parts.pop(),own=part[0]==='.'?classes(this).includes(part.slice(1)):this.tagName===part;if(!own)return false;if(!parts.length)return true;for(let p=this.parentNode;p;p=p.parentNode)if(p.matches(parts.join(' ')))return true;return false;});}
    querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
    getBoundingClientRect(){this.rectReads=(this.rectReads || 0)+1;return this.box || {left:0,top:0,right:1280,bottom:720,width:1280,height:720};}
    getAnimations({subtree=false}={}){return [...this.animations,...(subtree?this.children.flatMap(n=>n.getAnimations({subtree:true})):[])].filter(m=>m.playState!=='idle'&&m.playState!=='finished');}
    animate(frames,options){const motion=new Animation(this,frames,options);this.animations.push(motion);motions.push(motion);return motion;}
  }
  class Animation {
    constructor(target,frames,options){this.frames=frames;this.options=options;this.effect={target,getTiming:()=>options};this.playState='running';this.pending=false;this.start=time;this.hold=0;this.finished=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});}
    get currentTime(){return this.playState==='running'?time-this.start:this.hold;}
    set currentTime(at){this.hold=at;this.start=time-at;this.pending=false;}
    pause(){this.hold=this.currentTime;this.playState='paused';}
    cancel(){if(this.playState==='idle')return;this.playState='idle';this.reject(Error('cancelled'));}
    opacity(){const u=Math.min(1,this.currentTime/this.options.duration),frames=this.frames.filter(f=>f.opacity!==undefined);if(!frames.length)return null;const points=frames.map((f,i)=>({...f,offset:f.offset ?? i/(frames.length-1)}));let a=points[0],b=points.at(-1);for(let i=1;i<points.length;i++)if(u<=points[i].offset){a=points[i-1];b=points[i];break;}const p=b.offset===a.offset?1:(u-a.offset)/(b.offset-a.offset);return a.opacity+(b.opacity-a.opacity)*Math.max(0,Math.min(1,p));}
    step(){if(this.playState==='running'&&this.currentTime>=this.options.duration){this.hold=this.options.duration;this.playState='finished';this.resolve();}}
  }
  const document={hidden:false,createElementNS:(_ns,tag)=>new Node(tag)};
  const view={performance:{now:()=>time},matchMedia:()=>({matches:false}),DOMMatrixReadOnly:function(transform){const v=/matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number);if(!v)throw Error('invalid transform');Object.assign(this,{m11:v[0],m12:v[1],m41:v[4],m42:v[5]});},getComputedStyle(node){const latest=node.animations.filter(m=>m.playState!=='idle').map(m=>m.opacity()).filter(n=>n!==null).at(-1);return {transform:node.style.transform || 'matrix(1,0,0,1,0,0)',opacity:String(latest ?? node.style.opacity ?? (classes(node).includes('station-arrival')?0:1)),visibility:node.style.visibility || 'visible',display:node.style.display || 'block'};},requestAnimationFrame:cb=>{const id=++next;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id)};
  document.defaultView=view;
  const world=new Node('world'),layer=new Node('layer');world.append(layer);
  const actors=new Map(),ctx={OfficeScene:Scene,OfficeWalkingLayout:Layout,OfficeSocialInteractions:Social};vm.createContext(ctx);vm.runInContext(source,ctx);
  function actor(id='codex:test',z=zone,a=activity){
    const positions={library:{x:19,y:44},board:{x:50,y:44},desk:{x:42,y:70},bench:{x:81,y:44}},position={...positions[z]};
    const node=new Node('actor'),body=new Node('body'),plate=new Node('plate');body.classList.add('character-body');plate.classList.add('nameplate');node.append(body);node.append(plate);world.append(node);
    node.style.transform=`matrix(1,0,0,1,${position.x*12.8},${position.y*7.2})`;
    const b=Scene.actorBounds(position,{uniformScale:1});body.box={left:b.left,right:b.right,top:b.top,bottom:position.y*7.2,width:b.right-b.left,height:position.y*7.2-b.top};plate.box={left:b.left,right:b.right,top:position.y*7.2,bottom:b.bottom,width:b.right-b.left,height:b.bottom-position.y*7.2};
    const row={id,serial:1,session:{id,provider:'codex',status:'active',activity:a || {library:'reading',board:'planning',desk:'coding',bench:'testing'}[z]},node,body,position,target:{...position,zone:z}};actors.set(id,row);return row;
  }
  const original=actor(),api=ctx.OfficeStationArrival.create({layer,world,getActors:()=>actors,getContext:()=>settings});
  const event=(row=original,kind='entry',zoneName=row.target.zone)=>({actor:row,actorId:row.id,serial:row.serial,kind,zone:zoneName,position:{...row.position}});
  function step(ms){time+=ms;for(const motion of motions)motion.step();const callbacks=[...raf.values()];raf.clear();callbacks.forEach(cb=>cb(time));}
  return {api,actor:original,makeActor:actor,actors,event,settings,layer,world,document,motions,view,step,raf,Node,Animation,get time(){return time;},programs:ctx.OfficeStationArrival.PROGRAMS};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const box=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
function roomPart(f,tag,classes,bounds,parent=f.world){const n=new f.Node(tag);n.classList.add(...classes.split(' '));n.box=bounds;parent.append(n);return n;}
function actualReadingEndpoint(f){
  const position={x:10,y:40.9};f.actor.position=position;f.actor.target={...position,zone:'library'};f.actor.node.style.transform=`matrix(1,0,0,1,${position.x*12.8},${position.y*7.2})`;
  const r=Scene.actorBounds(position,{uniformScale:1}),x=position.x*12.8,y=position.y*7.2;
  // Body and wider label are separate real-painted boxes; combining their
  // empty corners would falsely block the shelf before the existing plant.
  f.actor.body.box=box(x-40,y-100,x+40,y);f.actor.node.children[1].box=box(r.left,y,r.right,r.bottom);
}

test('twelve original furniture programs are finite, distinct and do not edit real actor nodes or state',()=>{
  const signatures=new Set();
  for(const venue of ['workshop','teahouse','observatory'])for(const zone of ['library','board','desk','bench']){
    const f=fixture({venue,zone}),snapshot=()=>JSON.stringify({session:f.actor.session,serial:f.actor.serial,position:f.actor.position,target:f.actor.target,style:f.actor.node.style,dataset:f.actor.node.dataset}),before=snapshot(),children=f.actor.node.children.slice();
    assert.equal(f.api.arrive(f.event()),true,venue+'/'+zone);
    const state=f.api.state();assert.equal(state.started,1);assert.equal(state.pending,0);assert.equal(state.active[0].program,f.programs[venue][zone]);
    const cue=f.layer.children[0],serialize=n=>({tag:n.tagName,attrs:Object.fromEntries(Object.entries(n.attrs).filter(([key])=>!key.startsWith('data-'))),children:n.children.map(serialize)});
    signatures.add(JSON.stringify({geometry:serialize(cue),motion:f.motions.map(m=>m.frames)}));
    assert.ok(f.motions.some(m=>new Set(m.frames.map(frame=>frame.transform).filter(Boolean)).size>=2),'every program moves a real authored part');assert.ok(f.motions.every(m=>m.options.duration===1400));
    assert.equal(f.actor.node.children.length,children.length);assert.equal(f.actor.node.children[0],children[0]);
    assert.equal(snapshot(),before,'controller cannot modify the real actor/session');
    f.step(1401);assert.equal(f.api.state().active.length,0);assert.equal(f.raf.size,0);f.api.destroy();
  }
  assert.equal(signatures.size,12);
});

test('old identities, serials, route owners and mismatched actual work endpoints cannot produce cues',()=>{
  for(const change of [
    f=>f.actors.set(f.actor.id,{...f.actor}),
    f=>{f.actor.serial++;},
    f=>{f.actor.motion={};},
    f=>{f.actor.routeReservation={token:2,serial:1};},
    f=>{f.actor.resumeNavigation={kind:'station',target:{x:42,y:70}};},
    f=>{f.actor.pendingStation={seat:{x:42,y:70},due:1200};},
    f=>{f.actor.yielding=true;},
    f=>{f.actor.holdingFamily=true;},
    f=>{f.actor.session.activity='coding';},
    f=>{f.actor.position={x:80,y:80};},
    f=>{f.actor.target={x:21,y:44,zone:'library'};},
    f=>{f.actor.node.style.transform='matrix(1,0,0,1,1,1)';}
  ]){const f=fixture(),e=f.event();change(f);assert.equal(f.api.arrive(e),false);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);}
});

test('only active entry or station work evidence is consumed, including a verified stage seat',()=>{
  for(const kind of ['return','exit','holding','restore','unknown']){const f=fixture();assert.equal(f.api.arrive(f.event(f.actor,kind)),false);}
  for(const value of [{status:'idle'},{status:'stale'},{status:'closed'},{activity:'unknown'},{activity:'waiting-user'},{activity:'error'},{attention:true},{disconnected:true}]){const f=fixture();Object.assign(f.actor.session,value);assert.equal(f.api.arrive(f.event()),false);}
  const f=fixture();assert.equal(f.api.arrive(f.event(f.actor,'station','stage')),true);
});

test('only the current finite joint bridge can delay a cue, bounded to 240ms with no hidden prop or late replay',()=>{
  const f=fixture(),joint=new f.Node('g');joint.classList.add('ap-foot');f.actor.body.append(joint);joint.animate([{transform:'none'},{transform:'none'}],{duration:180}).finished.catch(()=>{});
  assert.equal(f.api.arrive(f.event()),true);assert.equal(f.layer.children.length,0);assert.equal(f.api.state().pending,1);
  f.step(170);assert.equal(f.layer.children.length,0);f.step(15);assert.equal(f.api.state().started,1);
  f.api.destroy();
  const g=fixture(),slow=new g.Node('g');slow.classList.add('ap-arm');g.actor.body.append(slow);const motion=slow.animate([{transform:'none'},{transform:'none'}],{duration:180});motion.finished.catch(()=>{});motion.pause();motion.pending=true;
  assert.equal(g.api.arrive(g.event()),true);g.step(241);assert.equal(g.layer.children.length,0);assert.equal(g.api.state().pending,0);
  motion.pending=false;g.step(500);g.api.update();assert.equal(g.api.state().started,0);assert.equal(g.raf.size,0);
});

test('metadata and same-zone fit serial changes never replay arrival feedback, while real cross-zone work can',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(1500);
  f.actor.serial++;f.actor.session.title='metadata';assert.equal(f.api.arrive(f.event(f.actor,'station')),false);assert.equal(f.api.state().started,1);
  f.actor.serial++;f.actor.session.activity='planning';f.actor.position={x:50,y:44};f.actor.target={...f.actor.position,zone:'board'};f.actor.node.style.transform='matrix(1,0,0,1,640,316.8)';
  assert.equal(f.api.arrive(f.event(f.actor,'station')),true);assert.equal(f.api.state().started,2);
});

test('quiet arrivals are consumed without motion, queued replay, periodic work or user-state mutation',()=>{
  for(const setting of ['reducedMotion','lowPower','hidden','fitting']){
    const f=fixture();f.settings[setting]=true;assert.equal(f.api.arrive(f.event()),false);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
    f.settings[setting]=false;f.api.tick();assert.equal(f.api.state().started,0);
    if(setting!=='fitting')assert.equal(f.api.arrive(f.event()),false,'quiet evidence is never replayed after preferences change');
  }
});

test('activity, exact-owner and scene/scale changes fade from the composed alpha within 160ms, then stop all owned work',()=>{
  for(const change of [f=>{f.actor.session.activity='searching';},f=>{f.actor.serial++;},f=>{f.settings.venue='teahouse';},f=>{f.settings.theme='winter';},f=>{f.settings.artworkKey='workshop/winter';},f=>{f.actor.session.turnId='fresh-turn';},f=>{f.settings.scale=.65;},f=>{f.actor.motion={};}]){
    const f=fixture();f.api.arrive(f.event());f.step(500);const node=f.layer.children[0],alpha=Number(f.view.getComputedStyle(node).opacity),original=f.motions.slice();change(f);f.api.update();
    assert.equal(node.dataset.phase,'fading');const fade=f.motions.at(-1);assert.equal(fade.options.duration,160);assert.equal(fade.frames[0].opacity,alpha);assert.ok(original.filter(m=>m!==original[0]).every(m=>m.playState==='paused'));
    f.step(159);assert.equal(f.layer.children.length,1);f.step(2);assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
  }
});

test('quiet, hidden and destroy immediately revoke only decorative owners and obsolete completions cannot recreate them',async()=>{
  for(const mode of ['lowPower','hidden','destroy']){
    const f=fixture();const external=f.actor.body.animate([{opacity:1},{opacity:1}],{duration:4000});external.finished.catch(()=>{});f.api.arrive(f.event());f.step(300);
    if(mode==='destroy')f.api.destroy();else{f.settings[mode]=true;f.api.update();}
    assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);assert.equal(external.playState,'running');
    f.step(2000);await Promise.resolve();assert.equal(f.layer.children.length,0);assert.equal(f.raf.size,0);
  }
});

test('station/global budgets and full-animation envelopes prevent clutter, clock overlap and occluded props without a queue',()=>{
  const f=fixture();f.api.arrive(f.event());const same=f.makeActor('codex:same');assert.equal(f.api.arrive(f.event(same)),false);assert.equal(f.api.state().pending,0);
  f.step(400);const second=f.makeActor('codex:second','bench');assert.equal(f.api.arrive(f.event(second)),true);f.step(400);const third=f.makeActor('codex:third','desk');assert.equal(f.api.arrive(f.event(third)),false);assert.equal(f.api.state().active.length,2);
  for(const cue of f.api.state().active)assert.ok(!Scene.CLOCK_RESERVED.some(r=>cue.bounds.left<r.right&&cue.bounds.right>r.left&&cue.bounds.top<r.bottom&&cue.bounds.bottom>r.top));
  f.step(2000);assert.equal(f.api.state().active.length,0);assert.equal(f.api.state().pending,0);assert.equal(f.api.state().started,2,'skipped third arrival never flashes later');
  const g=fixture();g.actor.body.box={left:0,top:0,right:1280,bottom:720,width:1280,height:720};assert.equal(g.api.arrive(g.event()),false);assert.equal(g.api.state().reasons.occluded,1);assert.equal(g.raf.size,0);
});


test('current walking areas accept an actual board-left endpoint which the legacy narrow band rejected',()=>{
  const f=fixture({zone:'board'}),p={x:29.05,y:48.2};
  assert.equal(Scene.stationCompatible(p,'board'),false,'the legacy station band is not the current physical layout contract');
  f.actor.position=p;f.actor.target={...p,zone:'stage',workZone:'board',area:'board-left'};f.actor.node.style.transform=`matrix(1,0,0,1,${p.x*12.8},${p.y*7.2})`;
  assert.equal(f.api.arrive(f.event(f.actor,'station','stage')),true);
  const g=fixture({zone:'board'});g.actor.target.workZone='library';assert.equal(g.api.arrive(g.event()),false,'a different target work zone cannot borrow stage permission');
});

test('running is true bench work while waiting-tool never becomes an arrival celebration',()=>{
  const f=fixture({zone:'bench',activity:'running'});assert.equal(f.api.arrive(f.event()),true);
  const g=fixture({zone:'bench',activity:'waiting-tool'});assert.equal(g.api.arrive(g.event()),false);
});

test('old raw reservation metadata is not a real physical lease and title/time heartbeats retain a cue',()=>{
  const f=fixture();f.actor.routeReservation={token:8,serial:0};f.actor.walkTiming={old:true};assert.equal(f.api.arrive(f.event()),true);
  f.step(300);f.actor.session.title='new metadata';f.actor.session.lastEventAt=12345;f.actor.session.turnCompletedAt=999;f.api.update();
  assert.equal(f.api.state().active[0].phase,'playing');assert.equal(f.api.state().started,1);
});


test('two live programs share one RAF and one full-cast geometry snapshot per update',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(400);const other=f.makeActor('codex:second-geometry','bench');assert.equal(f.api.arrive(f.event(other)),true);
  assert.equal(f.raf.size,1,'program count cannot create extra RAF loops');
  const worldReads=f.world.rectReads,bodyReads=[f.actor.body.rectReads,other.body.rectReads];
  f.api.update();assert.equal(f.world.rectReads-worldReads,1);
  assert.equal(f.actor.body.rectReads-bodyReads[0],1);assert.equal(other.body.rectReads-bodyReads[1],1);
  assert.equal(f.raf.size,1);
});

test('a pending bridge loses its exact owner without creating an SVG or a deferred after-effect',()=>{
  const f=fixture(),joint=new f.Node('g');joint.classList.add('ap-foot');f.actor.body.append(joint);joint.animate([{transform:'none'},{transform:'none'}],{duration:180}).finished.catch(()=>{});
  assert.equal(f.api.arrive(f.event()),true);f.actor.serial++;f.step(30);assert.equal(f.api.state().pending,0);assert.equal(f.layer.children.length,0);f.step(2000);assert.equal(f.api.state().started,0);assert.equal(f.raf.size,0);
});

test('the actual spring control composition cannot hide a reading cue behind its plant or captions',()=>{
  for(const venue of ['workshop','teahouse','observatory']){
    const f=fixture({venue});actualReadingEndpoint(f);
    const stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    const control=roomPart(f,'button','festival-control',box(196,58,316,186),stage);
    roomPart(f,'svg','festival-art',box(196,58,316,168),control);
    roomPart(f,'span','festival-caption',box(215,169,297,186),control);
    const venueControl=roomPart(f,'button','venue-control',box(347,110,447,206));
    roomPart(f,'svg','',box(347,110,447,182),venueControl);
    roomPart(f,'span','venue-control-label',box(365,184,430,201),venueControl);
    assert.equal(f.api.arrive(f.event()),true,'a genuinely free library furniture surface should remain usable');
    const cue=f.api.state().active[0];
    // Independent, conservatively expanded whole-motion box. Its lower edge
    // includes the static caption as well as the authored rotating plant.
    assert.ok(!Scene.boundsOverlap(cue.bounds,box(156,10,356,200),3),venue+' must clear the whole existing festival object');
    assert.ok(!Scene.boundsOverlap(cue.bounds,box(323,86,471,206),3),venue+' must clear the existing venue object');
    assert.ok(cue.anchor.x>=180&&cue.anchor.x<=320&&cue.anchor.y>=215&&cue.anchor.y<=260,'fallback stays on the left library furniture, not another zone');
    assert.equal(f.raf.size,1);f.api.destroy();
  }
});

test('visible scene labels and readouts block cues, hidden ancestors do not, and transparent stages never block the room',()=>{
  for(const labelClass of ['festival-caption','venue-control-label','venue-readout','venue-note-text']){
    const f=fixture(),label=roomPart(f,'span',labelClass,box(0,0,1280,720));label.textContent='Visible room control';
    assert.equal(f.api.arrive(f.event()),false,labelClass+' must participate in the actual painted composition');assert.equal(f.api.state().reasons.occluded,1);assert.equal(f.raf.size,0);
  }
  for(const property of ['opacity','display','visibility']){
    const f=fixture(),stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    stage.style[property]=({opacity:'0',display:'none',visibility:'hidden'})[property];roomPart(f,'svg','festival-art',box(0,0,1280,720),stage);
    assert.equal(f.api.arrive(f.event()),true,'hidden parent '+property+' does not invent an occluder');f.api.destroy();
  }
  const f=fixture();roomPart(f,'div','festival-stage',box(0,0,1280,720));roomPart(f,'div','venue-stage',box(0,0,1280,720));
  assert.equal(f.api.arrive(f.event()),true,'transparent inset stage boxes are never obstacles');f.api.destroy();
});

test('new higher scene art interrupts the finite prop from its actual alpha without relocation or later replay',()=>{
  const f=fixture();assert.equal(f.api.arrive(f.event()),true);f.step(400);
  const cue=f.api.state().active[0],node=f.layer.children[0],style={...node.style},alpha=Number(f.view.getComputedStyle(node).opacity);
  roomPart(f,'svg','festival-art',box(cue.bounds.left,cue.bounds.top,cue.bounds.right,cue.bounds.bottom));f.api.update();
  assert.equal(node.dataset.phase,'fading');assert.equal(node.style.left,style.left);assert.equal(node.style.top,style.top);assert.equal(f.motions.at(-1).frames[0].opacity,alpha);
  f.step(161);assert.equal(f.api.state().active.length,0);assert.equal(f.raf.size,0);f.step(3000);assert.equal(f.api.state().started,1);
});

test('all twelve programs retain a safe furniture mount beside the real catalog controls and spring viewport',()=>{
  for(const venue of Venues.CATALOG)for(const zone of ['library','board','desk','bench']){
    const f=fixture({venue:venue.id,zone});
    if(zone==='library')actualReadingEndpoint(f);
    else {const x=f.actor.position.x*12.8,y=f.actor.position.y*7.2;f.actor.body.box=box(x-40,y-100,x+40,y);}
    const stage=roomPart(f,'div','festival-stage',box(0,0,1280,720));
    roomPart(f,'svg','festival-art',box(196,58,316,168),stage);roomPart(f,'span','festival-caption',box(215,169,297,186),stage);
    for(const item of venue.interactions){
      const x=item.x*12.8,y=item.y*7.2,parent=roomPart(f,'button','venue-control',box(x-50,y-48,x+50,y+48));
      const svg=roomPart(f,'svg','',box(x-50,y-48,x+50,y+24),parent);
      if(item.type==='meteor-note')roomPart(f,'path','venue-meteor',box(x-20,y-32,x+20,y-15),svg);
      roomPart(f,'span','venue-control-label',box(x-48,y+26,x+48,y+43),parent);
      roomPart(f,'span','venue-readout',box(x-30,y+9,x+30,y+21),parent);
    }
    assert.equal(f.api.arrive(f.event()),true,venue.id+'/'+zone+' keeps a safe surface in the single-body case');
    assert.equal(f.api.state().active[0].program,f.programs[venue.id][zone]);f.step(700);assert.equal(f.api.state().active[0].phase,'playing');
    f.api.destroy();assert.equal(f.raf.size,0);
  }
});
