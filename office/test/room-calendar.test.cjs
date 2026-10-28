'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Calendar=require('../lib/room-calendar.js');
const at=date=>date+'T12:00:00+08:00';
// HK Gazette 2026/2027 and the regional sources shipped in the calendar.
const dates={
  '2026-01-01':'newyear','2026-02-14':'valentine','2026-02-17':'lunarnewyear',
  '2026-03-03':'lanternfest','2026-03-04':'holi','2026-03-17':'stpatrick',
  '2026-04-03':'easter','2026-04-05':'qingming',
  '2026-04-06':'qingming','2026-04-07':'easter','2026-04-13':'songkran','2026-04-23':'bookday',
  '2026-05-01':'labourday','2026-05-24':'buddha','2026-05-25':'buddha',
  '2026-06-19':'dragonboat','2026-06-20':'midsummer','2026-07-01':'hksar',
  '2026-07-07':'tanabata','2026-09-19':'oktoberfest','2026-09-25':'midautumn',
  '2026-09-26':'midautumn','2026-10-01':'nationalday','2026-10-18':'chungyeung',
  '2026-10-19':'chungyeung','2026-10-31':'halloween','2026-11-01':'dayofdead',
  '2026-11-08':'diwali','2026-11-24':'loykrathong','2026-11-26':'thanksgiving',
  '2026-12-25':'christmas','2027-02-09':'lunarnewyear','2027-03-23':'holi',
  '2027-03-26':'easter','2027-04-05':'qingming','2027-05-13':'buddha',
  '2027-06-09':'dragonboat','2027-09-16':'midautumn','2027-10-08':'chungyeung',
  '2027-10-29':'diwali','2027-12-27':'christmas'
};
for(const [date,id]of Object.entries(dates))test(`${date} chooses its ${id} room occasion`,()=>{
  const result=Calendar.resolve(at(date));assert.equal(result.event,id);assert.equal(result.dateIso,date);
  assert.equal(result.timeZone,'Asia/Hong_Kong');
});
test('every catalogued occasion can actually win calendar selection',()=>{
  const seen=new Set();
  for(let day=0;day<3*366;day++){
    const r=Calendar.resolve(Date.UTC(2026,0,1+day,4));if(r.event)seen.add(r.event);
  }
  // In 2026 Shrove Tuesday coincides with Lunar New Year; HK takes priority.
  for(const id of Calendar.EVENT_IDS)assert.ok(seen.has(id),id);
  assert.equal(Calendar.resolve(at('2027-02-09')).event,'lunarnewyear');
  assert.equal(Calendar.resolve(at('2028-02-29')).event,'carnival');
});
test('unpublished moving dates are never copied into a later year',()=>{
  assert.equal(Calendar.resolve(at('2028-11-08')).event,null);
  assert.equal(Calendar.resolve(at('2027-11-24')).event,null);
  assert.ok(Calendar.DATED[2026].loykrathong);assert.equal(Calendar.DATED[2027].loykrathong,undefined);
});
test('ordinary dates have no invented festival and Hong Kong midnight owns the boundary',()=>{
  assert.equal(Calendar.resolve(at('2026-10-28')).event,null);
  assert.equal(Calendar.resolve('2026-10-30T15:59:59.999Z').event,null);
  assert.equal(Calendar.resolve('2026-10-30T16:00:00.000Z').event,'halloween');
});
test('Gregorian Easter matches published HK dates and stays a Sunday through 2199',()=>{
  assert.deepEqual(Calendar.easter(2026),{month:4,day:5});assert.deepEqual(Calendar.easter(2027),{month:3,day:28});
  for(let year=1900;year<=2199;year++){
    const {month,day}=Calendar.easter(year);assert.equal(new Date(Date.UTC(year,month-1,day)).getUTCDay(),0);
    assert.ok(month===3&&day>=22||month===4&&day<=25);
  }
});
test('daily shuffle is stable across restarts, changes at HK midnight and uses every room without adjacent repeats',()=>{
  const ids=['courtyard','orbit','library','glasshouse','coast','undersea'],original=ids.slice();
  for(let seed=0;seed<12;seed++){
    let previous=null;
    for(let block=3200;block<3230;block++){
      const visited=new Set();
      for(let i=0;i<ids.length;i++){
        const now=(block*ids.length+i)*86400000+4*3600000;
        const choice=Calendar.dailyChoice(ids,now,seed);
        assert.notEqual(choice,previous);assert.equal(choice,Calendar.dailyChoice(ids,now+3600000,seed));
        visited.add(choice);previous=choice;
      }
      assert.equal(visited.size,ids.length);
    }
  }
  assert.deepEqual(ids,original);
  const last='2026-10-28T15:59:59.999Z',next='2026-10-28T16:00:00.000Z';
  assert.notEqual(Calendar.dailyChoice(ids,last,'a'),Calendar.dailyChoice(ids,next,'a'));
});
test('empty, one-room and two-room catalogs are bounded and deterministic',()=>{
  assert.equal(Calendar.dailyChoice([],0),null);assert.equal(Calendar.dailyChoice(['a','a'],0),'a');
  assert.notEqual(Calendar.dailyChoice(['a','b'],-86400000),Calendar.dailyChoice(['a','b'],0));
});
