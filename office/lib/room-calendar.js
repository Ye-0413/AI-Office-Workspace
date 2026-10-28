/* Local room occasions, using Hong Kong civil dates. Never AI evidence. */
(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./festival-model.js'):root.OfficeFestivals);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.OfficeRoomCalendar=api;
})(typeof globalThis==='object'?globalThis:this,function(Festivals){
  'use strict';
  const DAY=86400000;
  const SOURCES=Object.freeze({
    hongkong2026:'https://www.info.gov.hk/gia/general/202505/16/P2025051300353p.htm',
    hongkong2027:'https://www.info.gov.hk/gia/general/202605/15/P2026051400300.htm',
    lunar:'https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/{year}e.pdf',
    easter:'https://aa.usno.navy.mil/faq/easter',
    india2026:'https://www.cdaguwahati.gov.in/pages/holidaylist2026.aspx',
    india2027:'https://www.hcilondon.gov.in/page/list-of-the-holidays/',
    loykrathong2026:'https://thailand.go.th/public/issue-focus-detail/loy-krathong-burning-candles-and-playing-with-fire-festival-in-sukhothai',
    oktoberfest2026:'https://www.munich.travel/en/pois/markets-festivals/oktoberfest',
    oktoberfest2027:'https://www.oktoberfest.de/en',
    midsummer:'https://skansen.se/se-och-gora/hogtider-traditioner/midsommar/',
    bookday:'https://www.unesco.org/en/days/world-book-and-copyright'
  });
  // Regional observances are deliberately explicit. Unpublished years never
  // borrow last year's moving dates; their rooms remain manually available.
  const DATED=Object.freeze({
    2026:Object.freeze({holi:'03-04',diwali:'11-08',loykrathong:'11-24',oktoberfest:'09-19'}),
    2027:Object.freeze({holi:'03-23',diwali:'10-29',oktoberfest:'09-18'})
  });
  const HK_SUBSTITUTIONS=Object.freeze({
    '2026-04-06':'qingming','2026-04-07':'easter','2026-05-25':'buddha',
    '2026-10-19':'chungyeung','2027-02-09':'lunarnewyear','2027-12-27':'christmas'
  });
  const FIXED=Object.freeze({
    '02-14':'valentine','03-17':'stpatrick','04-23':'bookday','05-01':'labourday',
    '07-01':'hksar','07-07':'tanabata','10-01':'nationalday','10-31':'halloween'
  });
  const EVENT_IDS=Object.freeze(['newyear','lunarnewyear','lanternfest','valentine','holi','stpatrick',
    'carnival','easter','qingming','songkran','bookday','labourday','buddha','dragonboat','midsummer',
    'hksar','tanabata','midautumn','oktoberfest','nationalday','chungyeung','halloween',
    'dayofdead','diwali','loykrathong','thanksgiving','christmas']);
  const pad=value=>String(value).padStart(2,'0');
  function easter(year){
    // Gregorian computus, integer divisions; the date is ecclesiastical,
    // never an estimate from an astronomical full moon.
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
    const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    const n=h+l-7*m+114;
    return {month:Math.floor(n/31),day:n%31+1};
  }
  function resolve(now=Date.now()){
    const date=Festivals.dateParts(now),lunar=Festivals.lunarParts(now);
    const {year,month,day,dateIso}=date,md=pad(month)+'-'+pad(day);
    const result=(id,source,window='day')=>Object.freeze({event:id,dateIso,timeZone:Festivals.TIME_ZONE,source,window});
    if(HK_SUBSTITUTIONS[dateIso])return result(HK_SUBSTITUTIONS[dateIso],SOURCES['hongkong'+year],'published-substitute');
    if(lunar?.month===1&&lunar.day<=3)return result('lunarnewyear',SOURCES.lunar,'lunar-1-1..3');
    if(lunar?.month===1&&lunar.day===15)return result('lanternfest',SOURCES.lunar,'lunar-1-15');
    if(lunar?.month===4&&lunar.day===8)return result('buddha',SOURCES.lunar,'lunar-4-8');
    if(lunar?.month===5&&lunar.day===5)return result('dragonboat',SOURCES.lunar,'lunar-5-5');
    if(lunar?.month===8&&lunar.day>=14&&lunar.day<=16)return result('midautumn',SOURCES.lunar,'lunar-8-14..16');
    if(lunar?.month===9&&lunar.day===9)return result('chungyeung',SOURCES.lunar,'lunar-9-9');
    if(month===4&&Festivals.QINGMING_DAYS[year]===day)return result('qingming',SOURCES.lunar,'published-solar-term');
    if(month===1&&day<=3)return result('newyear',null,'january-1..3');
    if(month===12&&day>=24&&day<=26)return result('christmas',null,'december-24..26');
    if(month===11&&day<=2)return result('dayofdead',null,'november-1..2');
    if(FIXED[md])return result(FIXED[md],md==='04-23'?SOURCES.bookday:null);
    const at=Date.UTC(year,month-1,day),ed=easter(year),easterAt=Date.UTC(year,ed.month-1,ed.day);
    if(at>=easterAt-2*DAY&&at<=easterAt+DAY)return result('easter',SOURCES.easter,'good-friday..easter-monday');
    if(at===easterAt-47*DAY)return result('carnival',SOURCES.easter,'shrove-tuesday');
    if(month===4&&day>=13&&day<=15)return result('songkran',null,'april-13..15');
    if(month===6){
      const friday=19+(5-new Date(Date.UTC(year,5,19)).getUTCDay()+7)%7;
      if(day===friday||day===friday+1)return result('midsummer',SOURCES.midsummer,'midsummer-eve-and-day');
    }
    if(month===11&&date.weekday===4&&day>=22&&day<=28)return result('thanksgiving',null,'us-fourth-thursday');
    for(const [id,value]of Object.entries(DATED[year]||{}))if(value===md)
      return result(id,SOURCES[(id==='holi'||id==='diwali'?'india':id)+year],'verified-regional-date');
    return result(null,null,'ordinary-day');
  }
  function hash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
  function dailyChoice(ids,now=Date.now(),seed='office'){
    const choices=[...new Set(ids)];if(!choices.length)return null;if(choices.length===1)return choices[0];
    const {year,month,day}=Festivals.dateParts(now),ordinal=Math.floor(Date.UTC(year,month-1,day)/DAY);
    const block=Math.floor(ordinal/choices.length),index=((ordinal%choices.length)+choices.length)%choices.length;
    function shuffle(at){
      const rows=choices.slice();let state=hash(String(seed)+':'+at)||1;
      for(let i=rows.length-1;i>0;i--){state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
      return rows;
    }
    const current=shuffle(block),previous=shuffle(block-1);
    // Swapping only the first two preserves the previous block's last item
    // for N>=3, so the boundary rule has no recursive calendar dependency.
    if(choices.length>=3&&current[0]===previous.at(-1))[current[0],current[1]]=[current[1],current[0]];
    if(choices.length===2)return choices[((ordinal+(hash(seed)%2))%2+2)%2];
    return current[index];
  }
  return Object.freeze({SOURCES,DATED,HK_SUBSTITUTIONS,EVENT_IDS,easter,resolve,dailyChoice});
});
