'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Scene=require('../lib/scene-model.js'),I18n=require('../lib/i18n-model.js'),Clones=require('../lib/clone-lifecycle.js'),Family=require('../lib/family-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
const metricsVersion=Number(source.match(/const NAMEPLATE_METRICS_VERSION = (\d+)/)?.[1]);assert.ok(Number.isInteger(metricsVersion));
function production(name){const match=new RegExp('^  (?:async )?function '+name+'\\(','m').exec(source);assert.ok(match,'production '+name);const tail=source.slice(match.index+1).search(/\n  (?:async )?function /);assert.ok(tail>=0,'function boundary '+name);return source.slice(match.index,match.index+1+tail);}
function harness(rows=[]){
 const actors=new Map(),probes=[],elements=[],clock={},palette=Family.createPaletteRegistry();palette.update(rows.map(s=>s.parentId||s.id));
 const c={Scene,I18n,Clones,actors,deferredPhysicalScale:null,office:{dataset:{flat:'true',nameplateMode:'full'}},language:'zh',NAMEPLATE_METRICS_VERSION:metricsVersion,actorFootprints:new Map(),footprintCache:new Map(),reflowPending:false,extraRight:0,cancels:0,world:{getBoundingClientRect:()=>({width:1280*(c.frameScale||1)})},snapshot:{sessions:rows},cloneLedger:Clones.createLedger().update(rows),familyGraph:Family.build(rows,{registry:palette}),paletteRegistry:palette,performanceClocks:clock,
  Director:{plan:()=>({label:'coding',phase:'coding'})},displayName:s=>s.alias||'青霄白泽',keepsakeIcon:()=> '✦',tr:v=>I18n.translate(c.language,v),text:(node,v)=>node.textContent=String(v??''),cancelPhysicalRoutes:()=>{c.cancels++;}};
 class Node{
  constructor(tag,cls='',value=''){this.tagName=tag;this.className=cls;this.textContent=value;this.children=[];this.dataset={};this.attributes={};this.parentNode=null;this.listeners=new Map();this.style={setProperty(){},removeProperty(){}};elements.push(this);}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(key,fn){this.listeners.set(key,fn);}
  querySelector(selector){const cls=selector.replace(/^\./,'');for(const child of this.children){if(child.className.split(' ').includes(cls))return child;const found=child.querySelector(selector);if(found)return found;}return null;}
  // Deterministic DOM adapter tests measurement/control flow, not real fonts.
  // Native Chromium must independently certify the authored CSS rectangles.
  getBoundingClientRect(){let r=[0,0,0,0];if(this.className==='character-body')r=[-77,-115,154,129];else if(this.className==='nameplate')r=[-110,24,220,63];else if(this.className==='actor-title')r=[-100,27,180+c.extraRight,25];else if(this.className==='actor-relation')r=[-100,54,196,15];else if(this.className==='actor-keepsake')r=[82,29,21,21];else if(this.className==='family-badge')r=[60,34,20,10];else if(['actor-subline','actor-state','actor-provider'].includes(this.className)&&c.office.dataset.nameplateMode!=='compact')r=[-90,71,180,14];if(r[2]===0&&r[3]===0&&this.className!=='actor')return{left:0,top:0,right:0,bottom:0,width:0,height:0};const f=c.frameScale||1,x=c.offsetX||0,y=c.offsetY||0;return{left:x+r[0]*f,top:y+r[1]*f,right:x+(r[0]+r[2])*f,bottom:y+(r[1]+r[3])*f,width:r[2]*f,height:r[3]*f};}
 }
 c.element=(tag,cls,value)=>new Node(tag,cls,value==null?'':String(value));
 c.actorsLayer=new Node('div','actors');const append=c.actorsLayer.append.bind(c.actorsLayer);c.actorsLayer.append=(node)=>{append(node);if(node.style.cssText)probes.push(node);};
 vm.createContext(c);for(const name of ['hasBodyActivity','nameplateMode','createActorPlate','nameplateRelation','nameplateFamilyBadgeText','measureActorFootprints'])vm.runInContext(production(name),c);
 const actor=session=>({id:session.id,session,spec:Scene.activitySpec(session),helper:Boolean(session.parentId),state:new Node('span','actor-state','coding'),node:new Node('div','actor'),provider:new Node('span','actor-provider'),title:new Node('span','actor-title'),relation:new Node('span','actor-relation'),button:new Node('button','actor-button'),position:{x:40,y:84},target:{x:40,y:84},serial:5});
 return{c,Node,probes,elements,actor,clock};
}
const root={id:'main',provider:'codex',status:'active',activity:'coding',alias:'青霄白泽'};
const child={id:'helper',provider:'codex',status:'active',activity:'planning',parentId:'main',alias:'赤霄烛龙'};
test('density is a cast-count decision independent of solved actor scale',()=>{
 const{c}=harness();for(const scale of [.084,.4,1,1.35]){c.uniformScale=scale;assert.equal(c.nameplateMode(11),'full');assert.equal(c.nameplateMode(12),'compact');assert.equal(c.nameplateMode(100),'compact');}
});
test('one production plate constructor supplies identical ordered core children and reserved keepsake for probes and live actors',()=>{
 const h=harness([root]),p=h.c.createActorPlate(root);assert.deepEqual(p.plate.children.map(n=>n.className),['actor-title','actor-relation','actor-subline','actor-keepsake']);assert.deepEqual(p.subline.children,[p.provider,p.state]);assert.equal(p.keepsake.attributes['aria-hidden'],'true');
 h.c.measureActorFootprints([root]);const ghost=h.probes[0],measured=ghost.querySelector('.nameplate');assert.deepEqual(measured.children.slice(0,4).map(n=>n.className),p.plate.children.map(n=>n.className));assert.equal(measured.querySelector('.actor-keepsake').attributes['aria-hidden'],'true');assert.equal(ghost.dataset.selected,'true');assert.equal(ghost.dataset.hasFamily,'true');assert.equal(ghost.dataset.error,'false');assert.equal(ghost.dataset.attention,'false');assert.equal(ghost.dataset.stale,'false');
});
test('compact root statistics retain both exact ledger counts in each language and helper parent relation remains visible content',()=>{
 const h=harness([root,child]);for(const [language,expected]of [['zh','活跃 1 · 历史 1'],['en','Active 1 · Total 1']]){h.c.language=language;assert.equal(h.c.nameplateRelation(root,null,'compact'),expected);assert.match(h.c.nameplateRelation(child,root,'compact'),/青霄白泽/);}
 h.c.cloneLedger.update([root,{...child,status:'closed'}]);assert.equal(h.c.nameplateRelation(root,null,'compact'),'Active 0 · Total 1');h.c.language='zh';assert.equal(h.c.nameplateRelation(root,null,'compact'),'活跃 0 · 历史 1');assert.equal(h.c.nameplateRelation(root,null,'full'),'分身 0 活跃 · 累计 1');
});
test('measurement cache separates mode, metric revision, language and true family badge without recreating probes for inert metadata',()=>{
 const h=harness([root,child]),c=h.c;c.measureActorFootprints([root]);assert.equal(h.probes.length,1);const constructed=h.elements.length;c.measureActorFootprints([{...root,title:'inert metadata',lastEventAt:999}]);assert.equal(h.probes.length,1);assert.equal(h.elements.length,constructed,'a cache hit does not construct even a detached badge');
 c.office.dataset.nameplateMode='compact';c.measureActorFootprints([root]);assert.equal(h.probes.length,2);assert.equal(h.probes[1].querySelector('.actor-relation').textContent,'活跃 1 · 历史 1');
 c.language='en';c.measureActorFootprints([root]);assert.equal(h.probes.length,3);c.NAMEPLATE_METRICS_VERSION++;c.measureActorFootprints([root]);assert.equal(h.probes.length,4);
 const keys=[...c.footprintCache.keys()].map(JSON.parse);assert.equal(keys[0][0],metricsVersion);assert.equal(keys[0][1],'full');assert.equal(keys[1][1],'compact');assert.equal(keys[2][3],'en');assert.equal(keys[3][0],metricsVersion+1);
 assert.equal(c.cancels,0,'same measured envelopes cannot cancel a real route just because the cache mode changed');
});
test('the probe uses the same sanitized full family code and helper arrow as the actual family renderer',()=>{
 const h=harness([root,child]);h.c.paletteRegistry={forRoot:()=>({badge:'123456789X'})};h.c.office.dataset.nameplateMode='compact';h.c.measureActorFootprints([child]);const badge=h.probes[0].querySelector('.family-badge');assert.equal(badge.textContent,'↳12345678');assert.equal(badge.dataset.helper,'true');assert.equal(badge.attributes['aria-hidden'],'true');assert.equal(JSON.parse([...h.c.footprintCache.keys()][0])[7],'↳12345678');
});
test('actual measured growth remains authoritative and invalidates physical proof instead of forcing a former fit',()=>{
 const h=harness([root]),c=h.c,actor=h.actor(root);c.actors.set(root.id,actor);const position=actor.position,serial=actor.serial;c.measureActorFootprints([root]);const old=c.actorFootprints.get(root.id);
 c.office.dataset.nameplateMode='compact';c.extraRight=90;c.measureActorFootprints([root]);const measured=c.actorFootprints.get(root.id);assert.ok(measured.right>old.right);assert.equal(c.cancels,1);assert.equal(c.reflowPending,true);assert.equal(actor.position,position);assert.equal(actor.serial,serial,'measurement delegates to the original physical cancellation owner');
});
function installLabel(h){const c=h.c;Object.assign(c,{selectedSession:'',cloneBusy:()=>false,trafficWaiters:new Map(),lifecycleCaption:()=>'',transitCaption:()=>assert.fail('no physical route in this label fixture')});vm.runInContext(production('updateActorLabel'),c);}
test('actual label updates preserve full nickname and relationship in tooltip/ARIA while compact count text is current',()=>{
 const h=harness([root,child]);installLabel(h);h.c.office.dataset.nameplateMode='compact';h.c.language='en';const a=h.actor({...root,alias:'Rainbowbridge Hedgehog'});h.c.updateActorLabel(a);
 assert.equal(a.title.textContent,'Rainbowbridge Hedgehog');assert.equal(a.title.title,a.title.textContent);assert.equal(a.relation.textContent,'Active 1 · Total 1');assert.match(a.relation.title,/1 active clones · 1 total/);assert.match(a.button.attributes['aria-label'],/Rainbowbridge Hedgehog/);assert.match(a.button.attributes['aria-label'],/1 active clones · 1 total/);assert.equal(a.node.dataset.activeClones,'1');assert.equal(a.node.dataset.totalClones,'1');
 const helper=h.actor(child);h.c.updateActorLabel(helper);assert.match(helper.relation.textContent,/Helping 青霄白泽/);assert.match(helper.button.attributes['aria-label'],/Helping 青霄白泽/);
});
test('letterboxed compact probes ignore display-none viewport-zero rectangles but still measure visibility-hidden paint',()=>{
 const full=harness([root]),boxed=harness([root]);full.c.office.dataset.nameplateMode=boxed.c.office.dataset.nameplateMode='compact';boxed.c.frameScale=.625;boxed.c.offsetX=120;boxed.c.offsetY=175;
 full.c.measureActorFootprints([root]);boxed.c.measureActorFootprints([root]);assert.deepEqual(plain(boxed.c.actorFootprints.get(root.id)),plain(full.c.actorFootprints.get(root.id)));assert.ok(boxed.c.actorFootprints.get(root.id).top>=115,'the visibility-hidden body remains measurable');assert.ok(boxed.c.actorFootprints.get(root.id).top<200,'a hidden subline at viewport zero cannot inflate a letterboxed world');assert.equal(boxed.probes.length,1);
});
function plain(value){return JSON.parse(JSON.stringify(value));}
function installRender(h){
 const c=h.c,dom=new Map(),noop=()=>{},node=()=>({dataset:{},firstElementChild:{},replaceChildren(){},querySelector(){return this;}}),observations=[];
 Object.assign(c,{currentPage:{},sizeStability:require('../lib/size-stability.js').create({requestedScale:.65}),$:id=>{if(!dom.has(id))dom.set(id,node());return dom.get(id);},Family,attendanceModel:{update:()=>({present:c.snapshot.sessions,retired:[]})},attendance:{present:[]},restedClones:new Set(),selectedProject:'',roomSelectionExplicit:false,rooms:[],page:0,element:node,uniformScale:.4,settings:{agentScale:.65},transferOwner:null,measureActorFootprints:rows=>observations.push({mode:c.office.dataset.nameplateMode,ids:rows.map(s=>s.id)}),finiteExitIds:()=>new Set(),sceneOptions:()=>({}),WalkingLayout:{layoutAllWalking:rows=>({seats:new Map(rows.map(s=>[s.id,{x:40,y:84}])),pathsById:new Map(),uniformScale:.65,pages:1,overflowIds:[]})},reconcileActors:noop,renderConnections:noop,renderRoster:noop,renderInspector:noop,updateSignalSummary:noop,previousAttention:new Set(),refreshQuietPresentation:noop,venueStage:null,festivalStage:null,themeEnvironment:null,social:null,stationArrival:null});
 vm.runInContext(production('render'),c);return observations;
}
test('production fit-all render keeps stable full plate metrics and counts retirees until actual removal',()=>{
 const rows=Array.from({length:11},(_,i)=>({...root,id:'present-'+i})),held={...root,id:'real-retiring'};const h=harness(rows),c=h.c;for(const row of rows)c.actors.set(row.id,h.actor(row));c.actors.set(held.id,h.actor(held));const observations=installRender(h);
 c.render();assert.equal(observations[0].mode,'full');assert.equal(observations[0].ids.length,12);assert.ok(observations[0].ids.includes(held.id));
 c.snapshot.sessions=c.snapshot.sessions.map(s=>({...s,title:'only metadata',lastEventAt:10}));c.render();assert.equal(observations[1].mode,'full');assert.equal(observations[1].ids.length,12,'source absence alone is not physical body removal');
 c.actors.delete(held.id);c.render();assert.equal(observations[2].mode,'full');assert.equal(observations[2].ids.length,11);assert.equal(c.uniformScale,.4,'typography never writes an actor scale');
});
test('cold crowded snapshot keeps the same plate metrics before actor construction or solver output',()=>{
 const rows=Array.from({length:12},(_,i)=>({...root,id:'cold-'+i})),h=harness(rows),observations=installRender(h);assert.equal(h.c.actors.size,0);h.c.render();assert.equal(observations[0].mode,'full');assert.equal(observations[0].ids.length,12);assert.equal(h.c.uniformScale,.4);
});
test('production retiring reconciliation refreshes current ledger counts and language without changing a held ancestor physical owner',()=>{
 const h=harness([root,child]),c=h.c;installLabel(h);c.office.dataset.nameplateMode='compact';const a=h.actor(root),b=h.actor(child);a.holdingFamily=true;a.lastTurnAt=b.lastTurnAt=0;c.actors.set(a.id,a);c.actors.set(b.id,b);c.updateActorLabel(a);assert.equal(a.relation.textContent,'活跃 1 · 历史 1');
 const ended={...child,status:'closed',closed:true,activity:'idle',activeTools:0};c.cloneLedger.update([ended]);c.snapshot.sessions=[ended];const before={position:a.position,target:a.target,node:a.node,serial:a.serial};
 const noop=()=>{};Object.assign(c,{currentPage:{visible:[],seats:new Map([[a.id,a.target],[b.id,b.target]]),uniformScale:.4,layoutMode:'walking'},uniformScale:.4,fitting:false,restedClones:new Set(),queueAdmission:noop,resumeNavigation:noop,queueNavigation:noop,queueTraffic:noop,updateEntranceLane:noop,renderHelperLinks:noop,updateProps:noop,setPose:noop,returnClone:async()=>true,showError:e=>{throw e;},cancelAction:()=>assert.fail('a retained held body must keep its real physical owner')});
 for(const name of ['relatedClones','holdForClones','depart','reconcileActors'])vm.runInContext(production(name),c);
 c.reconcileActors();assert.equal(a.relation.textContent,'活跃 0 · 历史 1');assert.equal(a.node.dataset.activeClones,'0');assert.equal(a.node.dataset.totalClones,'1');c.language='en';c.reconcileActors();assert.equal(a.relation.textContent,'Active 0 · Total 1');assert.match(a.button.attributes['aria-label'],/0 active clones · 1 total/);
 assert.equal(a.position,before.position);assert.equal(a.target,before.target);assert.equal(a.node,before.node);assert.equal(a.serial,before.serial);assert.equal(a.holdingFamily,true);assert.equal(ended.status,'closed');assert.equal(ended.closed,true,'label maintenance never changes observed AI state');
});
