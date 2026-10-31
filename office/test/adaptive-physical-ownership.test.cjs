'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../renderer/app.js'),'utf8');
function production(name){const start=source.search(new RegExp('^  (?:async )?function '+name+'\\(','m'));assert.ok(start>=0);const tail=source.slice(start+1).search(/\n  (?:async )?function /);return source.slice(start,start+1+tail);}

test('adaptive size changes preserve every finite clone and retirement physical owner',()=>{
 const start=source.indexOf('      const heldPhysicalScale ='),end=source.indexOf('      const options =',start);assert.ok(start>=0&&end>start);
 const c={deferredPhysicalScale:null,uniformScale:1.215,exitingMains:new Set(),finite:false,returning:false,hasFiniteClone:()=>c.finite,cloneAwaitingReturn:()=>c.returning};vm.createContext(c);
 const held=()=>vm.runInContext('{'+source.slice(start,end)+'heldResult=heldPhysicalScale;}',c);
 held();assert.equal(c.heldResult,null,'a free room can evaluate its saved manual preference');
 c.finite=true;held();assert.equal(c.heldResult,1.215,'splitting, returning and absorbing bodies retain the actual shared scale');
 c.finite=false;c.returning=true;held();assert.equal(c.heldResult,1.215,'a just-ended helper is protected before its return owner starts');
 c.returning=false;c.exitingMains.add('old-main');held();assert.equal(c.heldResult,1.215,'a released standby keeps its valid source size until actual removal');
 c.deferredPhysicalScale=1;held();assert.equal(c.heldResult,1,'an explicit existing deferred physical owner remains authoritative');
});

test('a finite clone phase completion retries adaptive fitting without inventing a source event',()=>{
 const actor={clonePhase:'splitting',node:{dataset:{}},session:Object.freeze({id:'helper',parentId:'main',status:'active',activity:'coding'})},refreshes=[];let deferred=0;
 const c={queueDeferredResize:()=>deferred++,queueLayoutRefresh:force=>refreshes.push(force)};vm.createContext(c);vm.runInContext(production('clonePhase'),c);
 c.clonePhase(actor,'working');assert.deepEqual(refreshes,[true]);assert.equal(actor.node.dataset.clonePhase,'working');
 c.clonePhase(actor,'working');assert.deepEqual(refreshes,[true],'ordinary repeated working phases cannot create a refresh loop');
 c.clonePhase(actor,'returning');c.clonePhase(actor,'absorbing');assert.deepEqual(refreshes,[true],'an unfinished return keeps the old scale');
 c.clonePhase(actor,'working');assert.deepEqual(refreshes,[true,true],'actual absorption/cancellation releases the finite hold');assert.equal(deferred,5);assert.equal(actor.session.status,'active');assert.equal(actor.session.activity,'coding');
});
