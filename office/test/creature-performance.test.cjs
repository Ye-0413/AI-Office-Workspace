'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Creature=require('../renderer/creature-performance.js'),Model=require('../lib/avatar-performance-model.js');
const design=id=>({id,renderer:'creature',asset:'workshop-'+id+'.png',poseColumns:3,poseRows:2});
const observed=(activity='coding',extra={})=>({id:'codex:real-creature',provider:'codex',status:'active',activity,...extra});
test('creature texture selection accepts only the canonical original sheet for its validated species',()=>{
  const f=fixture('ink');
  for(const asset of ['clawd-static-base.svg','../icon.png','https://example.test/other.png']){
    f.controller.setDesign({...design('ink'),asset});
    assert.equal(f.source.getAttribute('href'),'../assets/avatars/workshop-ink.png');
  }
  f.controller.setDesign({...design('missing'),asset:'clawd-static-base.svg'});
  assert.equal(f.source.getAttribute('href'),'../assets/avatars/workshop-folio.png');
  f.controller.destroy();
});
function fixture(id='folio',api=Creature,originalFilter=''){
  let writes=0;const animations=[],nodes=[],samples=[];
  const document=new EventTarget();document.URL='file:///fixture/renderer/index.html';document.hidden=false;
  const media=new EventTarget();media.matches=false;
  class Node extends EventTarget{
    constructor(tag){super();this.tagName=tag;this.ownerDocument=document;this.attrs=new Map();this.children=[];this.dataset={};const values=new Map();
      this.style={getPropertyValue:key=>values.get(key)||'',setProperty:(key,value)=>{writes++;values.set(key,String(value));},removeProperty:key=>{writes++;values.delete(key);}};
      this.classList={contains:key=>(this.getAttribute('class')||'').split(' ').includes(key),add:key=>{if(!this.classList.contains(key))this.setAttribute('class',((this.getAttribute('class')||'')+' '+key).trim());},remove:key=>{if(this.classList.contains(key))this.setAttribute('class',(this.getAttribute('class')||'').split(' ').filter(x=>x!==key).join(' '));}};nodes.push(this);}
    get id(){return this.getAttribute('id');}set id(value){this.setAttribute('id',value);}
    get src(){return this.getAttribute('src')||'';}set src(value){this.setAttribute('src',value);}
    getAttribute(name){return this.attrs.has(name)?this.attrs.get(name):null;}
    setAttribute(name,value){writes++;this.attrs.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(value);}
    removeAttribute(name){writes++;this.attrs.delete(name);}
    append(node){writes++;this.children.push(node);node.parentNode=this;}
    remove(){writes++;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    querySelectorAll(selector){const result=[];const match=n=>selector.startsWith('.')?n.classList.contains(selector.slice(1)):n.tagName===selector;function walk(n){for(const child of n.children){if(match(child))result.push(child);walk(child);}}walk(this);return result;}
    getAnimations(){return animations.filter(a=>a.playState!=='idle');}
    animate(frames,timing){return motion(this,{frames,timing});}
  }
  document.createElement=tag=>new Node(tag);document.createElementNS=(_,tag)=>new Node(tag);
  document.defaultView={matchMedia:()=>media,getComputedStyle:node=>({opacity:node.style.getPropertyValue('opacity')||'1',transform:node.style.getPropertyValue('transform')||'none'})};
  function motion(target,{name,frames=[],timing={}}={}){let reject,time=42;const value={effect:{target,getKeyframes:()=>frames,getTiming:()=>timing},animationName:name,playState:'running',pending:false,pauses:0,plays:0,finished:new Promise((_,no)=>{reject=no;}),
    get currentTime(){return time;},set currentTime(value){time=value;this.pending=false;},pause(){this.pauses++;this.playState='paused';this.pending=true;},play(){this.plays++;this.playState='running';},cancel(){if(this.playState!=='idle'){this.playState='idle';reject(Error('cancelled'));}}};value.finished.catch(()=>{});animations.push(value);return value;}
  const actor=new Node('div'),body=new Node('span'),image=new Node('img');body.append(image);image.complete=false;image.naturalWidth=0;
  if(originalFilter)actor.style.setProperty('--creature-color-filter',originalFilter);
  const registry=Model.createClockRegistry({limit:4}),clockRegistry={open(session){const lease=registry.open(session);return{release:lease.release,sample(kind,options){const elapsed=lease.sample(kind,options);samples.push({kind,...options,elapsed});return elapsed;}};}};
  const controller=api.create({actorNode:actor,body,image,session:observed(),clockRegistry,design:design(id)});
  const layer=body.querySelector('.creature-performance'),source=layer.querySelector('image');
  return{controller,actor,body,image,layer,source,document,media,animations,nodes,samples,motion,writes:()=>writes};
}
const emit=(node,name)=>node.dispatchEvent(new Event(name));
function activityFixture(){
  const calls={updates:[],cues:[],destroyed:0};
  const context={OfficeAvatarPerformanceModel:Model,OfficeCreatureActivity:{create(){return{update(value){calls.updates.push({...value});calls.onUpdate?.(value);},cue(kind){calls.cues.push(kind);return kind==='tool-success';},destroy(){calls.destroyed++;}};}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/creature-performance.js'),'utf8'),context);
  return{api:context.OfficeCreaturePerformance,calls};
}

test('six painted poses use real state evidence, with explicit turn completion required',()=>{
  assert.equal(Creature.poseFor(observed('unknown')),'idle');
  assert.equal(Creature.poseFor(observed('coding')),'working');
  assert.equal(Creature.poseFor(observed('planning')),'thinking');
  assert.equal(Creature.poseFor(observed('idle',{status:'idle'})),'resting');
  assert.equal(Creature.poseFor(observed('error')),'attention');
  assert.equal(Creature.poseFor(observed('idle',{status:'closed',closed:true})),'resting','closing a session is not proof that a turn completed');
  assert.equal(Creature.poseFor(observed('idle',{status:'idle',turnCompletedAt:1000})),'completed');
  assert.equal(Creature.poseFor(observed('coding',{turnCompletedAt:1000})),'working','old completion metadata cannot overwrite current work');
  assert.equal(Creature.poseFor(observed('idle',{status:'stale',turnCompletedAt:1000})),'resting');
  for(const activity of ['reading','searching','coding','designing','testing','building','running','waiting-user','waiting-tool'])assert.equal(Creature.sourcePoseFor(observed(activity)),0,activity+' uses the neutral base for its real dynamic props');
  assert.equal(Creature.sourcePoseFor(observed('planning')),2);assert.equal(Creature.sourcePoseFor(observed('error')),4);
  assert.equal(Creature.sourcePoseFor(observed('error'),{},'moss'),0,'an error breaks the root mechanism rather than making healthy moss wilt');
});

test('one clipped cell is selected without changing the source, painted parts or observed identity',()=>{
  const f=fixture(),parts=f.layer.querySelectorAll('use'),source=f.source;
  for(const [value,index]of[[observed('coding'),0],[observed('planning'),2],[observed('error'),4],[observed('idle',{status:'idle'}),3],[observed('idle',{status:'idle',turnCompletedAt:1000}),5]]){
    const truth=JSON.stringify(value),plan=f.controller.update(value,{now:index*100});
    assert.equal(plan.poseIndex,index);assert.equal(f.layer.dataset.poseIndex,String(index));
    assert.equal(Number(source.getAttribute('x')),37.5-index%3*80);
    assert.equal(source.getAttribute('width'),'240');assert.equal(source.getAttribute('height'),'160');
    assert.deepEqual(f.layer.querySelectorAll('use'),parts);assert.equal(f.source,source);assert.equal(JSON.stringify(value),truth);
  }
  f.controller.destroy();
});

test('metadata and identical designs make no sprite, style or presence writes',()=>{
  const f=fixture();f.controller.update(observed('coding'),{now:0});const before=f.writes();
  for(let index=1;index<=50;index++)f.controller.update(observed('coding',{title:'metadata '+index}),{now:index*100});
  assert.equal(f.writes(),before);assert.equal(f.controller.setDesign({...design('folio')}),false);assert.equal(f.writes(),before);
  const source=f.source,parts=f.layer.querySelectorAll('use');assert.equal(f.controller.setDesign(design('ink')),true);
  assert.equal(f.source,source);assert.deepEqual(f.layer.querySelectorAll('use'),parts);assert.equal(f.layer.dataset.creature,'ink');f.controller.destroy();
});

test('base materials keep their painted colors and overflow palettes avoid a repeating color cycle',()=>{
  for(const id of ['folio','ink','moss','thread','glow']){
    assert.equal(Creature.variantPalette(id,0).filter,'none');
    const palettes=Array.from({length:256},(_,index)=>Creature.variantPalette(id,index+1));
    assert.equal(new Set(palettes.map(value=>value.filter)).size,256,id+' has no short exact filter cycle');
    for(const value of palettes){assert.equal(value.filter,Creature.variantPalette(id,value.index).filter);assert.ok(value.hue>=0&&value.hue<360);}
    assert.notEqual(palettes[0].filter,palettes[30].filter,'the former 30-variant boundary does not repeat');
    assert.equal(Creature.variantPalette(id,-1).filter,'none');
  }
  assert.match(Creature.variantPalette('folio',1).filter,/sepia\(0\.8\) saturate\(2\.1\)/,'cream paper gets chroma before hue rotation');
});

test('variant-only changes preserve the source, resource health, body parts and running clocks',()=>{
  const f=fixture('folio'),source=f.source,parts=f.layer.querySelectorAll('use');emit(source,'load');
  f.controller.update(observed('coding'),{now:0});const css=f.motion(f.layer,{name:'cp-paper-open-left'}),at=css.currentTime;
  const overflow={...design('folio'),appearanceKey:'folio:1',variantIndex:1};
  assert.equal(f.controller.setDesign(overflow),true);
  assert.equal(f.source,source);assert.deepEqual(f.layer.querySelectorAll('use'),parts);assert.equal(f.layer.dataset.artState,'healthy');
  assert.equal(source.getAttribute('href'),'../assets/avatars/workshop-folio.png');
  assert.equal(f.layer.dataset.colorVariant,'1');assert.equal(f.layer.dataset.appearanceKey,'folio:1');
  assert.equal(f.actor.style.getPropertyValue('--creature-color-filter'),Creature.variantPalette('folio',1).filter);
  assert.equal(css.currentTime,at);assert.equal(css.playState,'running');assert.equal(css.pauses,0);assert.equal(css.plays,0);
  const before=f.writes();assert.equal(f.controller.setDesign({...overflow}),false);
  for(let index=1;index<=20;index++){
    const value=observed('coding',{title:'unchanged identity '+index}),truth=JSON.stringify(value);
    const plan=f.controller.update(value,{now:index*100});assert.equal(plan.appearanceKey,'folio:1');assert.equal(plan.variantIndex,1);assert.equal(JSON.stringify(value),truth);
  }
  assert.equal(f.writes(),before,'metadata snapshots neither recolor nor restart a healthy atlas');
  f.controller.destroy();assert.equal(f.actor.style.getPropertyValue('--creature-color-filter'),'');
});

test('a family shares one texture filter, including props and ink droplets, while neutral and labels stay outside it',()=>{
  const descriptor={...design('ink'),appearanceKey:'ink:2',variantIndex:2},root=fixture('ink'),helper=fixture('ink',Creature,'contrast(1.02)');
  root.controller.setDesign(descriptor);helper.controller.setDesign(descriptor);
  assert.equal(root.actor.style.getPropertyValue('--creature-color-filter'),helper.actor.style.getPropertyValue('--creature-color-filter'));
  const css=fs.readFileSync(path.join(__dirname,'../renderer/creature-performance.css'),'utf8');
  assert.match(css,/\.creature-performance \.cp-art,\s*\.creature-performance \.cp-activity\s*\{\s*filter:var\(--creature-color-filter,none\)/);
  assert.match(css,/\[data-creature-design="ink"\]\s*:is\(\.clone-ink-puddle,\.clone-ink-core,\.clone-ink-drop\)\s*\{\s*filter:var\(--creature-color-filter,none\)/);
  assert.doesNotMatch(css,/\.cp-neutral[^{}]*\{[^}]*filter:/);
  assert.doesNotMatch(css,/(?:nameplate|family-badge)[^{}]*\{[^}]*filter:/);
  root.controller.destroy();helper.controller.destroy();assert.equal(helper.actor.style.getPropertyValue('--creature-color-filter'),'contrast(1.02)');
});

test('changing only a color after a retry keeps the recovered URL and resource lease',()=>{
  const f=fixture('moss');emit(f.source,'error');assert.equal(f.controller.retry(Date.now()+3100),true);emit(f.source,'load');
  const href=f.source.getAttribute('href'),descriptor={...design('moss'),appearanceKey:'moss:1',variantIndex:1};
  assert.match(href,/mini-office-creature-retry=/);assert.equal(f.controller.setDesign(descriptor),true);
  assert.equal(f.source.getAttribute('href'),href);assert.equal(f.layer.dataset.artState,'healthy');
  f.controller.destroy();
});

test('repeated hidden snapshots retain and synchronously pause the same CSS owners, excluding resource animation',()=>{
  const f=fixture('ink');emit(f.source,'load');f.controller.update(observed(),{now:0});const css=f.motion(f.layer,{name:'cp-ink-pool'}),independent=f.motion(f.source),at=css.currentTime;
  f.controller.update(observed(),{now:100,hidden:true});f.controller.update(observed(),{now:10000,hidden:true});
  assert.equal(f.layer.dataset.animate,'true');assert.equal(css.playState,'paused');assert.equal(css.currentTime,at);assert.equal(css.pauses,1);assert.equal(independent.pauses,0);
  assert.ok(f.samples.slice(-2).every(sample=>sample.visible===false));assert.equal(f.samples.at(-1).elapsed,100);
  f.controller.update(observed(),{now:20000});assert.equal(css.playState,'running');assert.equal(css.currentTime,at);assert.equal(css.plays,1);assert.equal(f.samples.at(-1).elapsed,100);
  f.controller.update(observed(),{now:20016});assert.equal(f.samples.at(-1).elapsed,116);f.controller.destroy();
});

test('distance samples own existing stride clocks and old route owners cannot rewind a replacement',()=>{
  const f=fixture('moss'),loops=[f.motion(f.layer,{name:'cp-walk-grounded'}),f.motion(f.layer,{name:'cp-walk-left'}),f.motion(f.layer,{name:'cp-walk-right'})],owner={};
  f.controller.update(observed(),{now:0,walking:true});assert.equal(f.controller.locomotion({owner,distanceWorld:0,speedWorld:0}),true);
  f.controller.locomotion({owner,distanceWorld:96,speedWorld:100});assert.ok(loops.every(a=>a.currentTime===300&&a.playState==='paused'));
  assert.equal(f.controller.locomotion(null,owner),true);assert.equal(f.controller.locomotion({owner,distanceWorld:200,speedWorld:100}),false);
  const replacement={};f.controller.locomotion({owner:replacement,distanceWorld:0,speedWorld:0});f.controller.locomotion({owner:replacement,distanceWorld:96,speedWorld:100});assert.ok(loops.every(a=>a.currentTime===600));
  f.controller.update(observed(),{now:1000,walking:false});assert.equal(f.controller.locomotion({owner:replacement,distanceWorld:300,speedWorld:100}),false);f.controller.destroy();
});

test('a walking material change keeps the distance phase without reviving a replaced body stride',()=>{
  const f=fixture('ink'),old=f.motion(f.layer,{name:'cp-walk-body'}),foot=f.motion(f.layer,{name:'cp-walk-left'}),owner={};
  f.controller.update(observed(),{now:0,walking:true});f.controller.locomotion({owner,distanceWorld:0,speedWorld:0});f.controller.locomotion({owner,distanceWorld:96,speedWorld:100});
  assert.equal(old.currentTime,300);old.cancel();const replacement=f.motion(f.layer,{name:'cp-walk-grounded'});
  f.controller.setDesign(design('moss'));f.controller.locomotion({owner,distanceWorld:192,speedWorld:100});
  assert.equal(old.playState,'idle');assert.equal(old.currentTime,300);assert.equal(replacement.currentTime,600);assert.equal(foot.currentTime,600);
  f.controller.destroy();
});

test('a request gets one finite material response, suppressed quiet episodes do not replay on resume',()=>{
  const f=fixture('glow');emit(f.source,'load');f.controller.update(observed(),{now:0});
  const waiting=observed('waiting-user');f.controller.update(waiting,{now:100});assert.equal(f.animations.length,1);
  for(let index=0;index<20;index++)f.controller.update(waiting,{now:200+index});assert.equal(f.animations.length,1);
  f.controller.update(observed(),{now:300});f.controller.update(waiting,{now:400,reducedMotion:true});assert.equal(f.layer.dataset.animate,'false');assert.equal(f.animations.length,1);
  f.controller.update(waiting,{now:500});assert.equal(f.animations.length,1,'a suppressed reminder is not queued for later');
  f.controller.destroy();assert.equal(f.controller.cue('wave'),false);
});

test('a local atlas failure shows an independent neutral body and retries only on a later state refresh',()=>{
  const f=fixture();f.controller.update(observed(),{now:0});const neutral=f.layer.querySelector('.cp-neutral'),art=f.layer.querySelector('.cp-art');
  assert.equal(f.body.dataset.rigHealth,'pending');assert.equal(neutral.style.getPropertyValue('opacity'),'1');
  emit(f.source,'error');assert.equal(f.layer.dataset.artState,'failed');assert.equal(art.style.getPropertyValue('opacity'),'0');
  assert.equal(f.controller.retry(),false);assert.equal(f.controller.retry(Date.now()+3100),true);assert.equal(f.layer.dataset.artState,'pending');
  assert.equal(f.controller.retry(Date.now()+6200),false,'pending retry is fenced');assert.match(f.source.getAttribute('href'),/mini-office-creature-retry=/);
  emit(f.source,'load');assert.equal(f.body.dataset.rigHealth,'healthy');assert.equal(neutral.style.getPropertyValue('opacity'),'0');assert.equal(art.style.getPropertyValue('opacity'),'1');
  f.controller.destroy();emit(f.source,'error');assert.equal(f.controller.plan,null);
});

test('activity clocks share hidden pause ownership and health refresh cannot cancel their animate selector',()=>{
  const {api,calls}=activityFixture(),f=fixture('folio',api);f.controller.update(observed('reading'),{now:0});
  const css=f.motion(f.layer,{name:'cp-act-page'});f.controller.update(observed('reading'),{now:100,hidden:true});
  let recovered;calls.onUpdate=value=>{if(value.healthy&&value.hidden&&!recovered)recovered=f.motion(f.layer,{name:'cp-act-recovered-page'});};
  f.controller.update(observed('reading'),{now:200,hidden:true});emit(f.source,'load');
  assert.equal(css.pauses,1);assert.equal(css.playState,'paused');assert.equal(calls.updates.at(-1).animate,true);assert.equal(calls.updates.at(-1).hidden,true);
  assert.equal(recovered.playState,'paused');assert.equal(recovered.pauses,1,'an async image recovery pauses any newly created work clocks immediately');
  f.controller.update(observed('reading'),{now:300});assert.equal(css.plays,1);assert.equal(calls.updates.at(-1).activity,'reading');
  assert.equal(recovered.plays,1);
  f.controller.destroy();assert.equal(calls.destroyed,1);
});

test('tool-success cues baseline history, deduplicate reordered evidence and consume suppressed results without claiming completion',()=>{
  const {api,calls}=activityFixture(),f=fixture('ink',api);emit(f.source,'load');
  const result=(eventId,at,outcome='success')=>({eventId,event:'tool-end',at,outcome,toolCallId:'call-'+eventId});
  const old=result('old',100),first=result('new',200),failure=result('fail',210,'error'),unknown=result('unknown',220,undefined);
  f.controller.update(observed('coding',{events:[old],lastEventAt:100}),{now:100});assert.deepEqual(calls.cues,[],'the initial event window is history');
  let plan=f.controller.update(observed('coding',{events:[old,first],lastEventAt:200}),{now:200});assert.deepEqual(calls.cues,['tool-success']);
  assert.equal(plan.pose,'working');assert.equal(plan.poseIndex,0,'a tool result does not finish the task');
  f.controller.update(observed('coding',{events:[first,old],lastEventAt:200}),{now:201});
  unknown.outcome=undefined;f.controller.update(observed('coding',{events:[first,failure,unknown],lastEventAt:220}),{now:220});
  f.controller.update(observed('coding',{events:[result('late-history',205),unknown],lastEventAt:220}),{now:221});
  assert.deepEqual(calls.cues,['tool-success'],'duplicates, failures, unknown outcomes and older backfill produce no result cue');
  const next=result('fresh',230);f.controller.update(observed('coding',{events:[next],lastEventAt:230}),{now:230});assert.equal(calls.cues.length,2);
  for(const [at,options]of[[240,{reducedMotion:true}],[250,{hidden:true}],[260,{walking:true}]]){
    const event=result('suppressed-'+at,at),value=observed('coding',{events:[event],lastEventAt:at});
    f.controller.update(value,{now:at,...options});f.controller.update(value,{now:at+1});
  }
  assert.equal(calls.cues.length,2,'hidden, quiet and walking results are consumed without delayed replay');
  plan=f.controller.update(observed('idle',{status:'idle',turnCompletedAt:300,events:[next],lastEventAt:300}),{now:300});
  assert.equal(plan.pose,'completed');assert.equal(plan.poseIndex,5);assert.equal(calls.cues.length,2,'turn completion alone is not another tool result');
  f.controller.update(observed('coding',{id:'codex:new-creature',events:[result('other-history',400)],lastEventAt:400}),{now:400});
  assert.equal(calls.cues.length,2,'a different real identity establishes its own history baseline');f.controller.destroy();
});

test('resource failure and native hiding share a pause lease so neither recovery can resume the other owner',()=>{
  const f=fixture('ink');emit(f.source,'load');f.controller.update(observed(),{now:0});
  const css=f.motion(f.layer,{name:'cp-ink-pool'});emit(f.source,'error');assert.equal(css.playState,'paused');assert.equal(css.pauses,1);
  f.controller.update(observed(),{now:100,hidden:true});emit(f.source,'load');assert.equal(css.playState,'paused');assert.equal(css.plays,0);
  f.controller.update(observed(),{now:200});assert.equal(css.playState,'running');assert.equal(css.plays,1);
  emit(f.source,'error');assert.equal(css.pauses,2);emit(f.source,'load');assert.equal(css.plays,2);f.controller.destroy();
});

test('stale, completed, reaction and physical walking states stow observed tools instead of showing old active props',()=>{
  const {api,calls}=activityFixture(),f=fixture('folio',api);emit(f.source,'load');
  f.controller.update(observed('coding'),{now:0});assert.equal(calls.updates.at(-1).activity,'coding');
  for(const [session,options]of[[observed('coding',{status:'stale'}),{}],[observed('idle',{status:'idle',turnCompletedAt:50}),{}],[observed('coding'),{walking:true}],[observed('coding'),{reaction:true}]]){
    f.controller.update(session,{now:100,...options});assert.equal(calls.updates.at(-1).activity,'');
  }
  f.controller.update(observed('waiting-tool'),{now:200});assert.equal(calls.updates.at(-1).activity,'waiting-tool');f.controller.destroy();
});

test('creature playback creates no renderer timer and keys only transforms and opacity',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../renderer/creature-performance.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../renderer/creature-performance.css'),'utf8');
  assert.doesNotMatch(source,/\b(?:requestAnimationFrame|setTimeout|setInterval)\s*\(/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  for(const name of ['paper-open-left','ink-pool','moss-settle','thread-unwind','glow-warmth'])assert.ok(css.includes('@keyframes cp-'+name));
  for(const line of css.split('\n').filter(line=>line.startsWith('@keyframes')))assert.doesNotMatch(line,/(?:^|[;{])(?:width|height|left|top|margin|padding):/);
});

test('lifecycle suppression takes priority over retained attention, including resource recovery',()=>{
  const {api,calls}=activityFixture(),f=fixture('folio',api);emit(f.source,'load');
  for(const [value,options] of [[observed('coding',{attention:true,status:'stale'}),{}],[observed('error',{attention:true,closed:true}),{}],[observed('coding',{attention:true}),{departing:true}],[observed('coding',{attention:true}),{reaction:true}],[observed('coding',{attention:true}),{walking:true}]]){
    f.controller.update(observed('coding'),{now:90});
    f.controller.update(value,{now:100,...options});
    assert.equal(calls.updates.at(-1).activity,'');assert.equal(calls.updates.at(-1).attention,false);
    emit(f.source,'error');emit(f.source,'load');
    assert.equal(calls.updates.at(-1).activity,'');assert.equal(calls.updates.at(-1).attention,false);
    assert.equal(calls.cues.filter(kind=>kind==='attention').length,0,'suppressed requests cannot pulse once either');
  }
  f.controller.update(observed('error',{attention:true}),{now:150});
  assert.equal(calls.updates.at(-1).activity,'error');
  assert.equal(calls.cues.filter(kind=>kind==='attention').length,0,'an error is not a request for a user response');
  f.controller.update(observed('unknown',{attention:true}),{now:200});
  assert.equal(calls.updates.at(-1).activity,'waiting-user','current explicit attention can request a response without a classified tool');
  assert.equal(calls.cues.filter(kind=>kind==='attention').length,1);
  f.controller.destroy();
});
