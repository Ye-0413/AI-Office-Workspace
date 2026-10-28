'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Rooms=require('../lib/room-designs.js'),Scene=require('../lib/scene-model.js'),Walking=require('../lib/walking-layout.js');
const Calendar=require('../lib/room-calendar.js'),HolidayRooms=require('../lib/room-holiday-designs.js');
const {build}=require('../scripts/sync-room-designs.cjs');
const {createSettings}=require('../lib/settings.cjs');
const os=require('node:os');
const metadata=require('../assets/scenes/rooms/generation.json');
const cast=n=>Array.from({length:n},(_,i)=>({id:'real-agent-'+i,provider:i%2?'cursor':'codex',status:'active',
  activity:['reading','planning','testing','coding','idle','unknown'][i%6],...(i%5===1?{parentId:'real-agent-'+(i-1)}:{})}));
test('room catalog delivers different architecture, furniture placement, floor geometry and original artwork',()=>{
  assert.deepEqual(Rooms.DAILY_IDS.slice().sort(),['rain-courtyard','orbital-bridge','grand-library','glasshouse','coastal-atelier','undersea-lab'].sort());
  assert.equal(Calendar.EVENT_IDS.length,27);
  assert.equal(Rooms.CATALOG.length,6+Calendar.EVENT_IDS.length);
  assert.equal(new Set(Rooms.IDS).size,Rooms.CATALOG.length);
  assert.deepEqual(metadata.images.map(r=>r.id).sort(),Rooms.IDS.slice().sort(),'every selected painting has exactly one delivered room');
  assert.equal(new Set(Rooms.CATALOG.map(r=>r.architecture)).size,Rooms.CATALOG.length);
  assert.equal(new Set(Rooms.CATALOG.map(r=>JSON.stringify(r.furniture))).size,Rooms.CATALOG.length);
  assert.equal(new Set(metadata.images.map(r=>r.sha256)).size,metadata.images.length);
  for(const room of Rooms.CATALOG){
    const record=metadata.images.find(row=>row.id===room.id);assert.ok(record,room.id);
    assert.equal(record.file,room.id+'.png');assert.equal(room.background,'../assets/scenes/rooms/'+record.file);
    const file=path.join(__dirname,'../assets/scenes/rooms',record.file),bytes=fs.readFileSync(file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),record.sha256);
    assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(bytes.readUInt32BE(16),record.width);assert.equal(bytes.readUInt32BE(20),record.height);
    assert.ok(record.prompt.includes('No ')||record.prompt.includes('no '));
    assert.ok(record.width/record.height>1.7&&record.width/record.height<1.85);
  }
});
test('every Hong Kong and international calendar occasion has its own complete holiday room',()=>{
  const holidays=Rooms.CATALOG.filter(room=>room.kind==='holiday');
  assert.deepEqual(holidays.map(room=>room.event).sort(),Calendar.EVENT_IDS.slice().sort());
  for(const event of Calendar.EVENT_IDS){
    const matching=holidays.filter(room=>room.event===event);assert.equal(matching.length,1,event);
    const room=matching[0];assert.equal(room.id,event);assert.ok(room.nameZh&&room.nameEn&&room.architecture);
    assert.equal(room.key,'room:'+event);assert.ok(metadata.images.some(row=>row.id===event),event+' original painting');
    for(const zone of ['library','board','bench','desk','sofa','archive','front','lobby','exit'])assert.ok(room.areas[zone]?.length,event+' '+zone);
  }
});
test('the shipped browser holiday catalog exactly matches the reviewed JSON profiles',()=>{
  const expected=build();assert.equal(expected.rows.length,Calendar.EVENT_IDS.length);
  assert.deepEqual(HolidayRooms,expected.rows);
  assert.equal(fs.readFileSync(path.join(__dirname,'../lib/room-holiday-designs.js'),'utf8'),expected.source,'run sync-room-designs.cjs after profile edits');
});
for(const room of Rooms.CATALOG){
  const scene=Rooms.createScene(Scene,room),walking=Walking.forScene(scene);
  test(`${room.id}: each work area connects to this room's own entrance`,()=>{
    assert.equal(Rooms.createScene(Scene,room),scene);assert.equal(Walking.forScene(scene),walking);
    assert.notEqual(scene.OBSTACLES,Scene.OBSTACLES);assert.deepEqual(walking.ENTRY_POINT,room.entry);
    for(const [id,areas]of Object.entries(room.areas)){
      const points=areas.flatMap(a=>Array.from({length:25},(_,i)=>({x:a.x1+(a.x2-a.x1)*(i%5)/4,y:a.y1+(a.y2-a.y1)*Math.floor(i/5)/4})));
      assert.ok(points.some(p=>walking.legalPoint(p,{uniformScale:.05})&&walking.route(room.entry,p,{uniformScale:.05}).length>1),id);
    }
  });
  for(const passThrough of [false,true])for(const n of [0,1,6,24,100])test(`${room.id}: ${passThrough?'pass-through':'collision-managed'} routing fits all ${n} real identities with complete envelopes and no capacity overflow`,()=>{
    const input=cast(n),before=JSON.stringify(input),page=walking.layoutAllWalking(input,{requestedScale:1.25,passThrough});
    assert.equal(JSON.stringify(input),before);assert.equal(page.seats.size,n);assert.equal(page.visible.length,n);
    assert.deepEqual(page.overflowIds,[]);assert.equal(page.pages,1);assert.ok(page.uniformScale>0&&page.uniformScale<=1.25);assert.equal(page.requestedScale,1.25);
    const byId=new Map(input.map(s=>[s.id,s]));
    for(const row of page.visible){assert.equal(row,byId.get(row.id));assert.equal(page.rootIdsBySession.get(row.id),row.parentId||row.id);}
    for(const [id,p]of page.seats){
      const own={uniformScale:page.uniformScale,helper:Boolean(byId.get(id).parentId)};assert.ok(walking.legalPoint(p,own));
      for(const [other,q]of page.seats)if(id!==other)assert.equal(scene.actorsOverlap(p,own,q,{uniformScale:page.uniformScale,helper:Boolean(byId.get(other).parentId)},page.gap),false);
    }
    if(n===1)assert.ok(page.uniformScale>=.65,'a single observed identity retains a readable body');
  });
}
test('room selection defaults to daily rotation, persists manual choices and preserves legacy preferences',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-room-preferences-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'settings.json'),original=JSON.stringify({language:'en',agentScale:1.25,sceneVenue:'teahouse'});fs.writeFileSync(file,original);
  const settings=createSettings(dir);assert.equal(settings.get().roomDesign,'daily');assert.equal(fs.readFileSync(file,'utf8'),original);
  for(const roomDesign of ['daily','legacy',...Rooms.IDS]){settings.set({roomDesign});assert.equal(createSettings(dir).get().roomDesign,roomDesign);}
  assert.equal(settings.get().sceneVenue,'teahouse');assert.equal(settings.get().agentScale,1.25);
  for(const roomDesign of [null,true,{},'missing-room'])assert.throws(()=>settings.set({roomDesign}),/room design/);
});
test('every 2026/2027 calendar day selects its complete priority holiday room or ordinary daily room',()=>{
  const seen=new Set();let holidayDays=0;
  for(let now=Date.UTC(2026,0,1,4);now<Date.UTC(2028,0,1,4);now+=86400000){
    const occasion=Calendar.resolve(now),automatic=Rooms.resolve({now});assert.equal(automatic.dateIso,occasion.dateIso);
    if(occasion.event){
      seen.add(occasion.event);holidayDays++;assert.equal(automatic.id,occasion.event,occasion.dateIso);assert.equal(automatic.mode,'holiday');assert.equal(automatic.event,occasion.event);
      assert.equal(automatic.room.event,occasion.event);assert.equal(automatic.room.kind,'holiday');
      assert.equal(automatic.key,'room:'+occasion.event);assert.equal(automatic.background,Rooms.get(occasion.event).background);
    }else{
      assert.equal(automatic.mode,'daily');assert.equal(automatic.event,null);assert.equal(automatic.id,Calendar.dailyChoice(Rooms.DAILY_IDS,now));assert.ok(Rooms.DAILY_IDS.includes(automatic.id));
    }
    const manual=Rooms.resolve({now,selection:'orbital-bridge'});assert.equal(manual.id,'orbital-bridge');assert.equal(manual.mode,'manual');assert.equal(manual.event,null);
  }
  assert.ok(holidayDays>80,'the sweep covers multi-day holidays and substitute dates');
  // Both 2026 and 2027 Shrove Tuesdays coincide with a higher-priority Hong
  // Kong Lunar New Year date. Its independently reachable 2028 date completes
  // the integration coverage without changing that calendar priority.
  const carnival=Rooms.resolve({now:'2028-02-29T12:00:00+08:00'});assert.equal(carnival.id,'carnival');assert.equal(carnival.mode,'holiday');seen.add(carnival.event);
  assert.deepEqual([...seen].sort(),Calendar.EVENT_IDS.slice().sort());
});
test('coincident observances keep Hong Kong priority and every room remains an explicit manual override',()=>{
  for(const [date,id]of [['2026-02-17','lunarnewyear'],['2027-02-09','lunarnewyear'],['2026-04-05','qingming'],['2026-06-19','dragonboat']]){
    const automatic=Rooms.resolve({now:date+'T12:00:00+08:00'});assert.equal(automatic.id,id);assert.equal(automatic.mode,'holiday');
  }
  for(const id of Rooms.IDS){const manual=Rooms.resolve({now:'2026-12-25T12:00:00+08:00',selection:id});assert.equal(manual.id,id);assert.equal(manual.mode,'manual');assert.equal(manual.event,null);assert.equal(manual.background,Rooms.get(id).background);}
});
