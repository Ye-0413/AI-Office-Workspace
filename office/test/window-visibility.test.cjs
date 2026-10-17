'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWindowVisibility}=require('../lib/window-visibility.cjs');

function fixture({visible=true,minimized=false,appHidden=false,withApp=true,unavailable=false,onChange,watch=false}={}) {
  const window=new EventEmitter(),raw={visible,minimized,appHidden,unavailable},calls=[],reads={window:0,app:0};
  window.isVisible=()=>{reads.window++;if(raw.unavailable)throw Error('native object unavailable');return raw.visible;};
  window.isMinimized=()=>{reads.window++;if(raw.unavailable)throw Error('native object unavailable');return raw.minimized;};
  const getAppHidden=()=>{reads.app++;if(raw.unavailable)throw Error('application unavailable');return raw.appHidden;};
  const api=createWindowVisibility({window,...(withApp?{getAppHidden}:{}),watch,onChange:value=>{calls.push(value);return onChange?.(value);}});
  return {window,raw,calls,reads,api};
}

test('real native predicates cover hide, minimize and app hide without a document mock',()=>{
  for(const patch of [{visible:false},{minimized:true},{appHidden:true}]){
    const f=fixture();assert.deepEqual(f.api.snapshot(),{available:true,hidden:false,visible:true,minimized:false,appHidden:false});
    Object.assign(f.raw,patch);assert.equal(f.api.refresh().hidden,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,true);
    Object.assign(f.raw,{visible:true,minimized:false,appHidden:false});assert.equal(f.api.refresh().hidden,false);assert.equal(f.calls.length,2);
    f.api.dispose();
  }
});

test('snapshot rereads missed native events but never notifies or consumes a refresh change',()=>{
  const f=fixture();assert.equal(f.calls.length,0);
  f.raw.minimized=true;
  assert.equal(f.api.snapshot().hidden,true);assert.equal(f.calls.length,0,'the existing snapshot poll is read-only');
  f.api.refresh();assert.equal(f.calls.length,1);f.api.refresh();assert.equal(f.calls.length,1);
  f.raw.minimized=false;assert.equal(f.api.snapshot().hidden,false);assert.equal(f.calls.length,1);
  f.api.refresh();assert.equal(f.calls.length,2);f.api.dispose();
});

test('window events read actual predicates rather than trusting the event name',()=>{
  const f=fixture();
  f.window.emit('hide');f.window.emit('minimize');assert.equal(f.calls.length,0,'a name alone is not new visibility evidence');
  f.raw.visible=false;f.window.emit('show');assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,true);
  f.raw.visible=true;f.window.emit('restore');assert.equal(f.calls.length,2);assert.equal(f.calls[1].hidden,false);f.api.dispose();
});

test('all listeners are exact owned handlers and cleanup is idempotent',()=>{
  const window=new EventEmitter(),foreign=()=>{};const events=['show','hide','minimize','restore','closed'];
  window.isVisible=()=>true;window.isMinimized=()=>false;
  for(const event of events)window.on(event,foreign);
  let notifications=0;const api=createWindowVisibility({window,onChange:()=>notifications++});
  for(const event of events)assert.equal(window.listenerCount(event),2);
  api.dispose();api.dispose();
  for(const event of events){assert.deepEqual(window.listeners(event),[foreign]);window.emit(event);}
  assert.equal(notifications,0);
});

test('unknown initial reads fall back honestly and later confirmation can notify',()=>{
  const f=fixture({unavailable:true});assert.deepEqual(f.api.snapshot(),{available:false,hidden:null,visible:null,minimized:null,appHidden:null});
  assert.equal(f.calls.length,0);f.api.refresh();assert.equal(f.calls.length,0);
  f.raw.unavailable=false;f.raw.minimized=true;
  assert.equal(f.api.refresh().hidden,true);assert.equal(f.api.snapshot().available,true);assert.equal(f.calls.length,1);f.api.dispose();
});

test('an exception retains last trustworthy hidden and its original evidence without reporting a new change',()=>{
  const f=fixture({minimized:true});
  f.raw.unavailable=true;f.raw.minimized=false;
  assert.deepEqual(f.api.refresh(),{available:false,hidden:true,visible:true,minimized:true,appHidden:false});assert.equal(f.calls.length,0);
  f.raw.unavailable=false;assert.equal(f.api.refresh().hidden,false);assert.equal(f.calls.length,1);f.api.dispose();
  const shown=fixture();shown.raw.unavailable=true;assert.equal(shown.api.snapshot().hidden,false,'an error is not proof that a visible window became hidden');shown.api.dispose();
});

test('truthy or incomplete native values are not fabricated into boolean evidence',()=>{
  for(const [field,value]of [['visible',1],['minimized',undefined],['appHidden',null],['appHidden','false']]){
    const f=fixture();f.raw[field]=value;assert.equal(f.api.refresh().available,false);assert.equal(f.api.snapshot().hidden,false);assert.equal(f.calls.length,0);f.api.dispose();
  }
  const noApp=fixture({withApp:false});assert.deepEqual(noApp.api.snapshot(),{available:true,hidden:false,visible:true,minimized:false,appHidden:null});noApp.api.dispose();
});

test('onChange can poll snapshot and reenter refresh without recursive notifications',()=>{
  let api;const f=fixture({onChange:value=>{assert.equal(api.snapshot().hidden,value.hidden);assert.equal(api.refresh().hidden,value.hidden);value.hidden='mutated';}});api=f.api;
  f.raw.visible=false;f.api.refresh();assert.equal(f.calls.length,1);assert.equal(f.api.snapshot().hidden,true,'callback gets a detached snapshot');f.api.dispose();
});

test('throwing or rejecting notifications do not escape the observer',async()=>{
  const throwing=fixture({onChange:()=>{throw Error('notification failed');}});throwing.raw.visible=false;assert.doesNotThrow(()=>throwing.api.refresh());throwing.api.dispose();
  const rejecting=fixture({onChange:()=>Promise.reject(Error('async notification failed'))});rejecting.raw.visible=false;rejecting.api.refresh();await new Promise(resolve=>setImmediate(resolve));rejecting.api.dispose();
});

test('closed cleans all owned listeners and later calls neither read nor notify',()=>{
  const f=fixture();f.raw.visible=false;f.window.emit('closed');assert.equal(f.calls.length,1);
  for(const event of ['show','hide','minimize','restore','closed'])assert.equal(f.window.listenerCount(event),0);
  const reads={...f.reads};f.raw.visible=true;f.api.snapshot();f.api.refresh();f.api.dispose();f.window.emit('show');assert.deepEqual(f.reads,reads);assert.equal(f.calls.length,1);
});

test('invalid setup rejects before any native subscriptions',()=>{
  assert.throws(()=>createWindowVisibility(),TypeError);
  const f=fixture();f.api.dispose();
  assert.throws(()=>createWindowVisibility({window:f.window,getAppHidden:true}),TypeError);
  assert.throws(()=>createWindowVisibility({window:f.window,onChange:null}),TypeError);
  assert.equal(f.window.listenerCount('hide'),0);
});

test('an early native minimize event settles only after a later real predicate confirms it',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const f=fixture();f.window.emit('minimize');
  assert.equal(f.api.snapshot().hidden,false);assert.equal(f.calls.length,0,'event intent alone cannot hide the room');
  t.mock.timers.tick(49);assert.equal(f.calls.length,0);
  f.raw.minimized=true;t.mock.timers.tick(1);
  assert.equal(f.calls.length,1,'the bounded native settlement observes the lagging predicate without a new event or 2s heartbeat');assert.equal(f.calls[0].hidden,true);
  const reads={...f.reads};t.mock.timers.tick(5000);assert.deepEqual(f.reads,reads,'a confirmed event leaves no polling owner');f.api.dispose();
});

test('a snapshot during settlement does not consume its eventual confirmed notification',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const f=fixture();f.window.emit('hide');f.raw.visible=false;
  assert.equal(f.api.snapshot().hidden,true);assert.equal(f.calls.length,0);
  t.mock.timers.tick(50);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,true);f.api.dispose();
});

test('a reverse native event cancels the obsolete direction instead of confirming its later stale predicate',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const f=fixture();f.window.emit('minimize');t.mock.timers.tick(20);f.window.emit('restore');
  const reads={...f.reads};f.raw.minimized=true;t.mock.timers.tick(5000);
  assert.deepEqual(f.reads,reads,'the superseded minimize owner is gone after a confirmed restore');assert.equal(f.calls.length,0);
  assert.equal(f.api.snapshot().hidden,true,'independent polling still reads the real current state, without inventing it from an event');f.api.dispose();
});

test('unconfirmed native direction retries finitely and repeated same-direction events do not extend the budget',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const f=fixture(),initial=f.reads.window;f.window.emit('hide');
  t.mock.timers.tick(50);assert.ok(f.reads.window>initial+2,'there was a genuine native confirmation retry');
  for(let at=100;at<=3500;at+=50){if(at<3000)f.window.emit('hide');t.mock.timers.tick(50);}
  assert.equal(f.calls.length,0);assert.equal(f.api.snapshot().hidden,false);
  const reads={...f.reads};t.mock.timers.tick(100000);assert.deepEqual(f.reads,reads,'failed settlement is not a permanent poller');
  assert.ok(reads.window<500,'one finite event owner cannot create unbounded parallel confirmation work');f.api.dispose();
});

test('unavailable reads preserve trustworthy hidden and cannot confirm an event until native recovery',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const f=fixture({minimized:true});f.raw.unavailable=true;f.window.emit('restore');t.mock.timers.tick(50);
  assert.equal(f.api.snapshot().hidden,true);assert.equal(f.api.snapshot().available,false);assert.equal(f.calls.length,0);
  f.raw.unavailable=false;f.raw.minimized=false;t.mock.timers.tick(50);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,false);f.api.dispose();
});

test('dispose and closed cancel an unsettled native owner before it can read or notify again',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  for(const close of [f=>f.api.dispose(),f=>f.window.emit('closed')]){
    const f=fixture();f.window.emit('minimize');close(f);const reads={...f.reads};f.raw.minimized=true;
    t.mock.timers.tick(5000);assert.deepEqual(f.reads,reads);assert.equal(f.calls.length,0);
    for(const event of ['show','hide','minimize','restore','closed'])assert.equal(f.window.listenerCount(event),0);
  }
});

test('a callback-driven reverse event owns the new confirmation and cannot resurrect the outgoing retry',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let f;f=fixture({onChange:value=>{if(value.hidden){f.raw.visible=true;f.window.emit('show');}}});
  f.raw.visible=false;f.window.emit('hide');assert.deepEqual(f.calls.map(value=>value.hidden),[true,false]);
  const reads={...f.reads};t.mock.timers.tick(5000);assert.deepEqual(f.reads,reads);assert.equal(f.api.snapshot().hidden,false);f.api.dispose();
});

test('native settlement has one timer owner and a late canceled callback cannot steal its replacement',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  const set=global.setTimeout,clear=global.clearTimeout,pending=new Set(),callbacks=[];let peak=0;
  global.setTimeout=(callback,delay,...args)=>{
    let handle;handle=set(()=>{pending.delete(handle);callback(...args);},delay);
    pending.add(handle);callbacks.push(callback);peak=Math.max(peak,pending.size);return handle;
  };
  global.clearTimeout=handle=>{pending.delete(handle);clear(handle);};
  let f;
  try {
    f=fixture();f.window.emit('minimize');assert.equal(pending.size,1);const stale=callbacks[0];
    for(let i=0;i<10;i++)f.window.emit('hide');assert.equal(pending.size,1,'same direction cannot start competing timers');
    f.raw.visible=false;f.window.emit('restore');assert.equal(pending.size,1,'reverse intent replaces, rather than adds to, the native confirmation');
    const reads={...f.reads};stale();assert.deepEqual(f.reads,reads,'late canceled code cannot read or alter the replacement owner');assert.equal(pending.size,1);
    f.raw.visible=true;t.mock.timers.tick(50);assert.deepEqual(f.calls.map(value=>value.hidden),[true,false]);assert.equal(pending.size,0);assert.equal(peak,1);
    f.raw.visible=false;f.window.emit('hide');assert.equal(pending.size,0,'already confirmed evidence does not create a retry');
  } finally {f?.api.dispose();global.setTimeout=set;global.clearTimeout=clear;}
});

test('opt-in native health watch detects a missing hide event within250ms and ignores unchanged evidence',t=>{
  t.mock.timers.enable({apis:['setInterval','Date'],now:0});
  const f=fixture({watch:true});f.raw.visible=false;
  t.mock.timers.tick(249);assert.equal(f.calls.length,0);
  t.mock.timers.tick(1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,true);
  t.mock.timers.tick(2000);assert.equal(f.calls.length,1,'health reads do not rebroadcast unchanged snapshots');
  f.raw.visible=true;t.mock.timers.tick(250);assert.equal(f.calls.length,2);assert.equal(f.calls[1].hidden,false);f.api.dispose();
});

test('a health snapshot cannot swallow the missing-event notification, and default construction does not poll',t=>{
  t.mock.timers.enable({apis:['setInterval','Date'],now:0});
  const f=fixture({watch:true}),passive=fixture(),passiveReads={...passive.reads};f.raw.minimized=true;
  assert.equal(f.api.snapshot().hidden,true);assert.equal(f.calls.length,0);
  t.mock.timers.tick(250);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,true);
  assert.deepEqual(passive.reads,passiveReads,'watch remains explicitly opt-in');f.api.dispose();passive.api.dispose();
});

test('health read failure retains known state and confirms recovery without manufacturing visibility',t=>{
  t.mock.timers.enable({apis:['setInterval','Date'],now:0});
  const f=fixture({watch:true,minimized:true});f.raw.unavailable=true;f.raw.minimized=false;
  t.mock.timers.tick(500);assert.equal(f.api.snapshot().available,false);assert.equal(f.api.snapshot().hidden,true);assert.equal(f.calls.length,0);
  f.raw.unavailable=false;t.mock.timers.tick(250);assert.equal(f.calls.length,1);assert.equal(f.calls[0].hidden,false);f.api.dispose();
});

test('exact health interval cleanup covers dispose, closed and a late callback without replacing external intervals',t=>{
  t.mock.timers.enable({apis:['setInterval','Date'],now:0});
  const set=global.setInterval,clear=global.clearInterval,owned=new Set(),callbacks=[];let unrefs=0;
  global.setInterval=(callback,delay,...args)=>{
    const raw=set(callback,delay,...args),handle={raw,unref(){unrefs++;}};owned.add(handle);callbacks.push(callback);return handle;
  };
  global.clearInterval=handle=>{owned.delete(handle);clear(handle?.raw??handle);};
  let external=0;const externalTimer=set(()=>external++,100);
  try {
    for(const close of [f=>f.api.dispose(),f=>f.window.emit('closed')]){
      const f=fixture({watch:true});assert.equal(owned.size,1,'one window health owner');const stale=callbacks.at(-1);
      close(f);f.api.dispose();assert.equal(owned.size,0);const reads={...f.reads};f.raw.visible=false;
      stale();t.mock.timers.tick(1000);assert.deepEqual(f.reads,reads);assert.equal(f.calls.length,0);
    }
    assert.equal(unrefs,2);assert.ok(external>=2,'unrelated timers are not cleared');
  } finally {clear(externalTimer);global.setInterval=set;global.clearInterval=clear;}
});

test('watch accepts only an explicit boolean and rejects before creating native listeners',()=>{
  for(const watch of [null,0,1,'true',{},[]]){
    const f=fixture();f.api.dispose();assert.throws(()=>createWindowVisibility({window:f.window,watch}),TypeError);assert.equal(f.window.listenerCount('hide'),0);
  }
});
