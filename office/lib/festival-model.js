/* Decorative calendar: Hong Kong dates, never a weather service or forecast. */
(function (root, factory) {
  'use strict';
  let studies=root.OfficeFestivalStudies;
  if(typeof module==='object'&&module.exports){try{studies=require('./festival-studies.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
  const api = factory(studies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeFestivals = api;
})(typeof globalThis === 'object' ? globalThis : this, function (studies) {
  'use strict';
  const TIME_ZONE = 'Asia/Hong_Kong';
  const DEFAULT_THEME = 'auto', DEFAULT_WEATHER = 'auto';
  const INTERACTION_DURATION = 1000, INTERACTION_SAMPLES = 41;
  // Official date tables, deliberately bounded rather than an approximate
  // solar-term calculation. Outside these years Qingming remains manual.
  const QINGMING_DAYS = Object.freeze({2026:5,2027:5,2028:4,2029:4,2030:5,2031:5,2032:4,2033:4,2034:5,2035:5});
  const CALENDAR_SOURCES = Object.freeze([
    Object.freeze({id:'hko',url:'https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/{year}e.pdf',years:Object.freeze([2026,2027,2028,2030,2031,2032,2033,2034,2035])}),
    Object.freeze({id:'hko-2029',url:'https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2029.pdf',years:Object.freeze([2029])}),
    Object.freeze({id:'midsummer',url:'https://skansen.se/se-och-gora/hogtider-traditioner/midsommar/'}),
    Object.freeze({id:'dayofdead',url:'https://ich.unesco.org/en/RL/dia-de-muertos-the-indigenous-festivity-dedicated-to-the-dead-00054'})
  ]);
  const CORE_THEMES = Object.freeze([
    {id:'spring',nameZh:'春日新芽',nameEn:'Spring shoots',season:'spring',action:'spring-sprout',actionZh:'浇一滴春水',actionEn:'Water a spring shoot',detailZh:'让一株小芽舒展叶片。',detailEn:'A small shoot opens its leaves.'},
    {id:'summer',nameZh:'夏日清风',nameEn:'Summer breeze',season:'summer',action:'summer-fan',actionZh:'展开竹扇',actionEn:'Unfold a bamboo fan',detailZh:'竹骨展开，借一阵清凉。',detailEn:'Bamboo ribs unfold for a little cool air.'},
    {id:'autumn',nameZh:'秋日拾叶',nameEn:'Autumn leaf album',season:'autumn',action:'autumn-leaf',actionZh:'收下一片秋叶',actionEn:'Keep an autumn leaf',detailZh:'一片枫叶落进小小叶笺。',detailEn:'A maple leaf settles into a little album.'},
    {id:'winter',nameZh:'冬日雪瓶',nameEn:'Winter snow globe',season:'winter',action:'winter-snowglobe',actionZh:'轻摇雪景瓶',actionEn:'Shake the snow globe',detailZh:'雪花在玻璃里慢慢安静下来。',detailEn:'Snowflakes settle softly inside the glass.'},
    {id:'halloween',nameZh:'万圣南瓜夜',nameEn:'Halloween lantern',season:'autumn',action:'halloween-lantern',actionZh:'点亮南瓜灯',actionEn:'Light the pumpkin lantern',detailZh:'掀开小盖，点亮一个友善的笑脸。',detailEn:'Lift the lid and light a friendly smile.'},
    {id:'christmas',nameZh:'圣诞暖灯',nameEn:'Christmas lights',season:'winter',action:'christmas-gift',actionZh:'打开树下礼盒',actionEn:'Open the gift under the tree',detailZh:'礼盒打开，树上的木灯次第亮起。',detailEn:'A gift opens and the little tree lights up.'},
    {id:'qingming',nameZh:'清明纸鸢',nameEn:'Qingming kite',season:'spring',action:'qingming-kite',actionZh:'放起一只纸鸢',actionEn:'Let a paper kite rise',detailZh:'新绿与纸鸢，安静记起想念的人。',detailEn:'Fresh green and a paper kite, with a quiet thought for those we miss.'},
    {id:'newyear',nameZh:'新年心愿',nameEn:'New Year wishes',season:'winter',action:'newyear-wish',actionZh:'挂一枚新年愿签',actionEn:'Hang a New Year wish',detailZh:'小小愿签挂好，金色纸花散开。',detailEn:'A wish is hung and golden paper stars open.'},
    {id:'lunarnewyear',nameZh:'新春灯结',nameEn:'Lunar New Year lantern',season:'winter',action:'lunarnewyear-lantern',actionZh:'展开新春灯笼',actionEn:'Unfold the New Year lantern',detailZh:'红灯舒展，金结轻轻晃动。',detailEn:'A red lantern unfolds above a little golden knot.'},
    {id:'midautumn',nameZh:'中秋望月',nameEn:'Mid-Autumn moon',season:'autumn',action:'midautumn-moon',actionZh:'拨开云边望月',actionEn:'Part the clouds for the moon',detailZh:'云边让开，月兔和圆月相逢。',detailEn:'Clouds part for a round moon and its little rabbit.'},
    {id:'hanami',nameZh:'花见樱枝',nameEn:'Hanami blossom branch',season:'spring',action:'hanami-petals',actionZh:'轻触一枝春樱',actionEn:'Wake a blossom branch',detailZh:'三四月的赏花灵感；不是任何地方的花期预报。',detailEn:'Inspired by blossom viewing in March and April; never a bloom forecast.'},
    {id:'midsummer',nameZh:'仲夏花环',nameEn:'Midsummer wreath',season:'summer',action:'midsummer-ribbons',actionZh:'织起仲夏彩带',actionEn:'Weave Midsummer ribbons',detailZh:'花环下，两条彩带交织成新的图案。',detailEn:'Two ribbons weave a new pattern beneath a flower wreath.'},
    {id:'dayofdead',nameZh:'亡灵节花忆',nameEn:'Día de Muertos remembrance',season:'autumn',action:'dayofdead-marigold',actionZh:'展开万寿菊剪纸',actionEn:'Unfold the marigold paper',detailZh:'万寿菊、剪纸和暖烛，温柔纪念所爱的人。',detailEn:'Marigolds, paper and warm candles remember the people we love.'}
  ].map(item=>Object.freeze({...item,kind:['spring','summer','autumn','winter','hanami'].includes(item.id)?'seasonal-study':'festival',source:['qingming','lunarnewyear','midautumn'].includes(item.id)?CALENDAR_SOURCES[0].url:item.id==='midsummer'?CALENDAR_SOURCES[2].url:item.id==='dayofdead'?CALENDAR_SOURCES[3].url:null})));
  const THEMES=Object.freeze(CORE_THEMES.concat((studies?.CATALOG||[]).map(item=>Object.freeze({...item}))));
  const THEME_IDS = Object.freeze(['auto',...THEMES.map(item=>item.id)]);
  const WEATHER_MODES = Object.freeze(['auto','off','rain','snow']);
  const hkFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  let lunarFormatter;
  try { lunarFormatter=new Intl.DateTimeFormat('en-u-ca-chinese',{timeZone:TIME_ZONE,year:'numeric',month:'numeric',day:'numeric'}); }
  catch (_) { lunarFormatter=null; }
  function timestamp(value){const parsed=value instanceof Date?value.getTime():typeof value==='string'?Date.parse(value):Number(value);return Number.isFinite(parsed)?parsed:Date.now();}
  function dateParts(now=Date.now()){
    const at=timestamp(now),parts=Object.fromEntries(hkFormatter.formatToParts(at).map(part=>[part.type,part.value]));
    const year=Number(parts.year),month=Number(parts.month),day=Number(parts.day);
    return {year,month,day,dateIso:parts.year+'-'+parts.month+'-'+parts.day,weekday:new Date(Date.UTC(year,month-1,day)).getUTCDay(),at};
  }
  function lunarParts(now=Date.now()){
    if(!lunarFormatter)return null;
    try{
      const parts=Object.fromEntries(lunarFormatter.formatToParts(timestamp(now)).map(part=>[part.type,part.value]));
      // Intl uses e.g. "6bis" for an intercalary month. Never treat that as 6.
      if(!/^(?:[1-9]|1[0-2])$/.test(parts.month||'')||!/^(?:[1-9]|[12][0-9]|30)$/.test(parts.day||''))return null;
      return {month:Number(parts.month),day:Number(parts.day),year:Number(parts.relatedYear)||null};
    }catch(_){return null;}
  }
  function seasonAt(now=Date.now()){
    const {month}=dateParts(now);return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';
  }
  function getTheme(id='spring'){return THEMES.find(item=>item.id===id)||THEMES[0];}
  function automaticTheme(now=Date.now()){
    const date=dateParts(now),lunar=lunarParts(now),{year,month,day}=date;
    if(lunar?.month===1&&lunar.day<=3)return {id:'lunarnewyear',reason:'festival',window:'lunar-1-1..3'};
    if(lunar?.month===8&&lunar.day>=14&&lunar.day<=16)return {id:'midautumn',reason:'festival',window:'lunar-8-14..16'};
    if(month===4&&QINGMING_DAYS[year]===day)return {id:'qingming',reason:'festival',window:'qingming-exact'};
    if(month===1&&day<=3)return {id:'newyear',reason:'festival',window:'january-1..3'};
    if(month===10&&day===31)return {id:'halloween',reason:'festival',window:'october-31'};
    if(month===11&&day<=2)return {id:'dayofdead',reason:'festival',window:'november-1..2'};
    if(month===12&&day>=24&&day<=26)return {id:'christmas',reason:'festival',window:'december-24..26'};
    if(month===6){const friday=19+(5-new Date(Date.UTC(year,5,19)).getUTCDay()+7)%7;if(day===friday||day===friday+1)return {id:'midsummer',reason:'festival',window:'june-friday-19..25-and-saturday'};}
    // Hanami is a manual inspiration theme, not a global flowering calendar.
    return {id:seasonAt(now),reason:'season',window:'calendar-season'};
  }
  function resolve(options={}){
    const now=timestamp(options.now===undefined?Date.now():options.now),date=dateParts(now),selected=THEME_IDS.includes(options.theme)?options.theme:DEFAULT_THEME;
    const automatic=selected==='auto'?automaticTheme(now):{id:selected,reason:'manual',window:'manual-preview'};
    const theme=getTheme(automatic.id),weatherMode=WEATHER_MODES.includes(options.weather)?options.weather:DEFAULT_WEATHER;
    const weather=weatherMode==='auto'?(theme.season==='winter'?'snow':theme.season==='spring'?'rain':'off'):weatherMode;
    return {theme:theme.id,season:theme.season,kind:theme.kind,source:theme.source,weather,weatherMode,selected,mode:selected==='auto'?'auto':'manual',reason:automatic.reason,window:automatic.window,dateIso:date.dateIso,timeZone:TIME_ZONE,now};
  }
  function interactionFrames(id){
    if(!CORE_THEMES.some(item=>item.id===id)&&typeof studies?.frames==='function')return studies.frames(id,INTERACTION_SAMPLES);
    return Array.from({length:INTERACTION_SAMPLES},(_,index)=>{
      const p=index/(INTERACTION_SAMPLES-1),wave=Math.sin(p*Math.PI*4)*(1-p),lift=Math.sin(p*Math.PI);
      let transform='translate(0px,0px)',opacity=1;
      if(id==='spring')transform=`translate(0px,${(10*(1-p)).toFixed(3)}px) scale(${(.94+.06*p).toFixed(4)})`;
      else if(id==='summer')transform=`rotate(${(-18*(1-p)+wave*5).toFixed(3)}deg) scaleX(${(.4+.6*p).toFixed(4)})`;
      else if(id==='autumn')transform=`translate(${(Math.sin(p*Math.PI*3)*7*(1-p)).toFixed(3)}px,${(-19+26*p).toFixed(3)}px) rotate(${(-22+48*p+wave*9).toFixed(3)}deg)`;
      else if(id==='winter')transform=`rotate(${(wave*8).toFixed(3)}deg) translateY(${(-lift*2).toFixed(3)}px)`;
      else if(id==='halloween')transform=`translate(${(p*1.2).toFixed(3)}px,${(-lift*13).toFixed(3)}px) rotate(${(-lift*11).toFixed(3)}deg)`;
      else if(id==='christmas')transform=`translate(${-4*p}px,${(-lift*18-7*p).toFixed(3)}px) rotate(${(-lift*16-9*p).toFixed(3)}deg)`;
      else if(id==='qingming')transform=`translate(${(Math.sin(p*Math.PI*2)*5*(1-p)).toFixed(3)}px,${(-18*p).toFixed(3)}px) rotate(${(wave*6).toFixed(3)}deg)`;
      else if(id==='newyear'){transform=`rotate(${(24*p).toFixed(3)}deg) scale(${(.94+.18*p).toFixed(4)})`;opacity=Math.min(1,p*7,(1-p)*7);}
      else if(id==='lunarnewyear'){
        const unfold=Math.min(1,p/.55),tail=p<.55?0:(p-.55)/.45;
        transform=`translateY(${(2*(1-unfold)).toFixed(3)}px) rotate(${(Math.sin(tail*Math.PI*2)*3*(1-tail)).toFixed(3)}deg) scale(${(.68+.32*unfold).toFixed(4)},${(.92+.08*unfold).toFixed(4)})`;
      }
      else if(id==='midautumn')transform=`translate(${(12*(1-p)).toFixed(3)}px,${(6*(1-p)-lift*5).toFixed(3)}px)`;
      else if(id==='hanami')transform=`rotate(${(wave*5).toFixed(3)}deg) scale(${(.94+.06*p).toFixed(4)})`;
      else if(id==='midsummer')transform=`translateX(${(Math.sin(p*Math.PI*3)*5*(1-p)).toFixed(3)}px) rotate(${(wave*7).toFixed(3)}deg)`;
      else if(id==='dayofdead')transform=`translate(${(-4*(1-p)).toFixed(3)}px,${(2*(1-p)).toFixed(3)}px) rotate(${(-lift*1.2).toFixed(3)}deg) scaleX(${(.72+.28*p).toFixed(4)})`;
      return {offset:p,transform,opacity};
    });
  }
  return Object.freeze({TIME_ZONE,DEFAULT_THEME,DEFAULT_WEATHER,CORE_THEMES,THEMES,THEME_IDS,WEATHER_MODES,QINGMING_DAYS,CALENDAR_SOURCES,INTERACTION_DURATION,INTERACTION_SAMPLES,dateParts,lunarParts,seasonAt,getTheme,automaticTheme,resolve,interactionFrames});
});
