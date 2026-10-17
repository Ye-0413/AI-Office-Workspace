'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../lib/festival-model.js');

test('state endpoints reuse the authored path for both gift directions without mutating it',()=>{
  const authored=F.interactionFrames('christmas'),snapshot=JSON.stringify(authored),opening=F.interactionFrames('christmas',{open:true}),closing=F.interactionFrames('christmas',{open:false});
  assert.deepEqual(opening,authored);assert.equal(closing.length,41);assert.equal(closing[0].transform,authored.at(-1).transform);assert.equal(closing.at(-1).transform,authored[0].transform);assert.equal(closing[0].offset,0);assert.equal(closing.at(-1).offset,1);
  for(let i=0;i<41;i++){assert.equal(closing[i].transform,authored[40-i].transform);assert.equal(closing[i].opacity,authored[40-i].opacity);assert.equal(closing[i].offset,i/40);}
  assert.equal(JSON.stringify(authored),snapshot);assert.ok(new Set(closing.map(f=>f.transform+'|'+f.opacity)).size>=31);
  for(const theme of F.THEMES)if(!['summer','christmas','qingming','lunarnewyear','dayofdead'].includes(theme.id))assert.deepEqual(F.interactionFrames(theme.id,{open:false}),F.interactionFrames(theme.id),theme.id+' must keep its existing authored direction');
});
test('core feedback follows semantic phase rather than a binary open flag and leaves caller state intact',()=>{
  const previous={step:1,open:true,selection:1},before={...previous},blossom=F.activateCore('spring',previous);assert.deepEqual(previous,before);assert.equal(blossom.phase,'blossom');assert.equal(blossom.open,false);assert.match(blossom.statusZh,/花瓣/);assert.match(blossom.statusEn,/Petals/);
  const wrap=F.activateCore('christmas',previous);assert.equal(wrap.phase,'wrapped');assert.match(wrap.statusZh,/合上/);assert.match(wrap.statusEn,/closed/);assert.equal(F.activateCore('christmas',wrap).phase,'unwrapped');
});
const hk=date=>Date.parse(date+'T12:00:00+08:00');
test('manual themes and decorative weather are bounded and bilingual',()=>{
  assert.equal(F.CORE_THEMES.length,13);assert.ok(F.THEMES.length>=13);assert.equal(new Set(F.THEME_IDS).size,F.THEMES.length+1);
  for(const theme of F.THEMES){assert.ok(theme.nameZh&&theme.nameEn&&theme.actionZh&&theme.actionEn);assert.equal(F.resolve({theme:theme.id,weather:'rain',now:hk('2026-07-01')}).theme,theme.id);}
  for(const weather of F.WEATHER_MODES)assert.ok(['snow','rain','off'].includes(F.resolve({weather}).weather));
  assert.equal(F.resolve({theme:'<img>',weather:'hail',now:hk('2026-07-01')}).theme,'summer');
});
test('four calendar seasons use Hong Kong months',()=>{
  for(const [date,season]of [['2026-03-01','spring'],['2026-06-01','summer'],['2026-09-01','autumn'],['2026-12-01','winter']])assert.equal(F.seasonAt(hk(date)),season);
  assert.equal(F.seasonAt(Date.parse('2026-02-28T15:59:59Z')),'winter');assert.equal(F.seasonAt(Date.parse('2026-02-28T16:00:00Z')),'spring');
});
test('official Qingming table has exact dates and no extrapolation',()=>{
  for(const [year,day]of Object.entries(F.QINGMING_DAYS)){assert.equal(F.automaticTheme(hk(year+'-04-0'+day)).id,'qingming');assert.notEqual(F.automaticTheme(hk(year+'-04-0'+(day-1))).id,'qingming');}
  assert.equal(F.automaticTheme(hk('2036-04-04')).id,'spring');assert.equal(F.resolve({theme:'qingming',now:hk('2036-08-01')}).theme,'qingming');
  assert.ok(F.CALENDAR_SOURCES.some(item=>item.url.includes('hko.gov.hk')));
});
test('Chinese lunar dates use Intl calendar parts and exclude intercalary months',()=>{
  assert.deepEqual(F.lunarParts(hk('2026-02-17')),{month:1,day:1,year:2026});
  assert.deepEqual(F.lunarParts(hk('2026-09-25')),{month:8,day:15,year:2026});
  for(const date of ['2026-02-17','2026-02-18','2026-02-19'])assert.equal(F.automaticTheme(hk(date)).id,'lunarnewyear');
  assert.notEqual(F.automaticTheme(hk('2026-02-20')).id,'lunarnewyear');
  for(const date of ['2026-09-24','2026-09-25','2026-09-26'])assert.equal(F.automaticTheme(hk(date)).id,'midautumn');
  assert.notEqual(F.automaticTheme(hk('2026-09-27')).id,'midautumn');
  // 2025 has an intercalary sixth month; no lunar festival is inferred there.
  assert.equal(F.lunarParts(hk('2025-08-01')),null);
});
test('crossing Hong Kong midnight updates the automatic festival',()=>{
  assert.equal(F.resolve({now:Date.parse('2026-10-30T15:59:59Z')}).theme,'autumn');
  assert.equal(F.resolve({now:Date.parse('2026-10-30T16:00:00Z')}).theme,'halloween');
  assert.equal(F.resolve({now:Date.parse('2026-10-31T16:00:00Z')}).theme,'dayofdead');
  assert.equal(F.resolve({now:Date.parse('2026-11-02T16:00:00Z')}).theme,'autumn');
});
test('Midsummer follows the Friday between June 19 and 25 and its Saturday',()=>{
  for(let year=2026;year<=2035;year++){
    const days=[];for(let day=18;day<=27;day++)if(F.automaticTheme(hk(year+'-06-'+String(day).padStart(2,'0'))).id==='midsummer')days.push(day);
    assert.equal(days.length,2);assert.ok(days[0]>=19&&days[0]<=25);assert.equal(days[1],days[0]+1);assert.equal(F.dateParts(hk(year+'-06-'+days[0])).weekday,5);
  }
});
test('decorative windows are explicit; hanami is manual inspiration without a bloom forecast',()=>{
  assert.equal(F.automaticTheme(hk('2026-12-24')).id,'christmas');assert.equal(F.automaticTheme(hk('2026-12-27')).id,'winter');
  assert.equal(F.automaticTheme(hk('2027-01-03')).id,'newyear');assert.equal(F.automaticTheme(hk('2027-01-04')).id,'winter');
  assert.equal(F.resolve({theme:'hanami',now:hk('2026-03-25')}).reason,'manual');assert.match(F.getTheme('hanami').detailEn,/never a bloom forecast/);
  assert.match(F.getTheme('dayofdead').detailEn,/remember/);
});
test('every theme has at least 31 distinct sampled poses over a full second',()=>{
  assert.ok(F.INTERACTION_DURATION>=600);assert.ok(F.INTERACTION_SAMPLES>=31);
  for(const theme of F.THEMES){const frames=F.interactionFrames(theme.id);assert.equal(frames.length,41);assert.equal(frames[0].offset,0);assert.equal(frames.at(-1).offset,1);assert.ok(new Set(frames.map(frame=>frame.transform+'|'+frame.opacity)).size>=31,theme.id);assert.ok(frames.every(frame=>frame.opacity>=0&&frame.opacity<=1));}
});
