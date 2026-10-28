'use strict';
// Execute the actual renderer copy paths; these are not native-font proofs.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const I18n=require('../lib/i18n-model.js');
const source=fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8');
function between(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert.ok(start>=0&&end>start,'actual production copy path exists');return source.slice(start,end);}
const copyFunctions=between('  function tr(value)','  function applyLanguage()');
const elementFunction=between('  function element(tag','  function nameplateMode(');
const summaryPath=between('    let summary = roomSessions.length','    const stats = snapshot.activityStats;');
const signalFunction=between('  function updateSignalSummary()','  function actorGeometry(');
function node(id='',className=''){return{id,className,textContent:'',dataset:{},children:[],attributes:{},append(...children){this.children.push(...children);},setAttribute(key,value){this.attributes[key]=value;}};}
function context(language='en'){
 const nodes=new Map([['room-summary',node('room-summary')],['signal-summary',node('signal-summary')],['inspect-title',node('inspect-title')]]);
 const c=vm.createContext({language,I18n,$:id=>nodes.get(id),document:{createElement:()=>node()},actors:new Map(),snapshot:{sessions:[]},office:{dataset:{}},currentPage:{overflowIds:[]},bodyIds:new Set(),deferredPhysicalScale:null,Scene:{timestamp:()=>0,providerName:()=> 'Codex'},timeAgo:()=>'',displayName:()=> 'Fixed alias',fullRelation:'1 active clone · 1 total',spec:{label:'构思方案'}});
 vm.runInContext(copyFunctions+elementFunction+signalFunction,c);c.nodes=nodes;return c;
}
function summary(c,{roots=0,helpers=0,quiet=0,scale=1,requested=1,overflow=0}={}){
 c.currentPage.overflowIds=Array.from({length:overflow},(_,i)=>'waiting-'+i);c.bodyIds=new Set(c.currentPage.overflowIds);
 Object.assign(c,{rootCount:roots,helpers,quiet,roomSessions:Array.from({length:roots+helpers},()=>({})),uniformScale:scale,settings:{agentScale:requested}});
 vm.runInContext('{'+summaryPath+'}',c);return c.nodes.get('room-summary');
}
function titles(c,title){
 c.session={title,provider:'codex'};c.actor={button:node()};c.copy=node();
 for(const prefix of ["    actor.button.setAttribute('aria-label',", "    text($('inspect-title'),", "      copy.append(element('strong',"]){
  const statement=source.split('\n').find(line=>line.startsWith(prefix));assert.ok(statement,'actual renderer title call site exists');vm.runInContext(statement,c);
 }
 return{inspector:c.nodes.get('inspect-title').textContent,roster:c.copy.children[1].textContent,aria:c.actor.button.attributes['aria-label']};
}

test('English room counts and quiet signals retain every identity without a capacity waiting label',()=>{
 const c=context();const n=summary(c,{roots:12,helpers:1,quiet:2,scale:1,requested:1,overflow:9});
 assert.equal(n.textContent,'12 independent tasks · 1 temporary helper · 2 signals not updated');
 assert.equal(n.dataset.baseSummary,n.textContent);assert.doesNotMatch(n.textContent,/\p{Script=Han}/u);
 assert.equal(summary(c,{roots:1,quiet:1}).textContent,'1 independent task · 1 signal not updated');
 assert.equal(summary(c,{helpers:2}).textContent,'0 independent tasks · 2 temporary helpers');
});

test('Chinese, unfitted English and empty room copy keep accurate counts and scale boundaries',()=>{
 const zh=context('zh');assert.equal(summary(zh,{roots:12,helpers:1,quiet:2,scale:1,overflow:9}).textContent,'12 项独立任务 · 1 位临时帮手 · 2 项信号暂未更新');
 assert.equal(summary(zh).textContent,'实时办公室 · 等待任务入驻');
 const en=context();assert.equal(summary(en).textContent,'Live office · Waiting for tasks');
 assert.equal(summary(en,{roots:1,scale:1,requested:1}).textContent,'1 independent task');
 assert.equal(summary(en,{roots:1,scale:.9995,requested:1}).textContent,'1 independent task');
});

test('actual signal-summary refresh derives one queue suffix from the localized base, including after locale changes',()=>{
 const c=context();summary(c,{roots:12,helpers:1,scale:.4});
 c.actors=new Map([['root',{entryPending:false}],['pending-root',{entryPending:true}],['pending-helper',{entryPending:true}]]);
 for(let i=0;i<3;i++)vm.runInContext('updateSignalSummary()',c);
 const base='12 independent tasks · 1 temporary helper';
 assert.equal(c.nodes.get('room-summary').textContent,base+' · 2 entering the room');
 assert.equal(c.nodes.get('room-summary').dataset.baseSummary,base);
 c.actors.clear();vm.runInContext('updateSignalSummary()',c);assert.equal(c.nodes.get('room-summary').textContent,base);
 c.language='zh';summary(c,{roots:1,helpers:1,scale:.65});c.actors.set('pending',{entryPending:true});vm.runInContext('updateSignalSummary()',c);
 assert.equal(c.nodes.get('room-summary').textContent,'1 项独立任务 · 1 位临时帮手 · 1 位正在入场');
});

test('all three actual renderer title paths localize only an absent application placeholder',()=>{
 for(const locale of ['en','zh'])for(const missing of [undefined,null,'']){
  const expected=locale==='en'?'Untitled task':'未命名任务',r=titles(context(locale),missing);
  assert.equal(r.inspector,expected);assert.equal(r.roster,expected);assert.ok(r.aria.includes(' · '+expected+' · '));
 }
});

test('real source titles remain literal even when equal to the placeholder or containing known copy, markup or paths',()=>{
 for(const locale of ['en','zh'])for(const title of ['未命名任务','构思方案','写代码 · {state} <b>测试</b> /Users/example/我的  项目']){
  const r=titles(context(locale),title);assert.equal(r.inspector,title);assert.equal(r.roster,title);assert.ok(r.aria.includes(' · '+title+' · '));
 }
 assert.equal(I18n.translate('en','修改代码 · 用户自定义内容'),'修改代码 · 用户自定义内容','whole-composite literal protection remains strict');
});
