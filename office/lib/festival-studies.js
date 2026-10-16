/* Manual decorative studies. These illustrations do not calculate holiday dates. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeFestivalStudies = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const DEFINITIONS = [
    ['dragonboat','龙舟击楫','Dragon boat rhythm','summer','festival','划一桨龙舟','Row the dragon boat','跟着小鼓点，双桨入水再收回。','Dip and recover the two paddles to a little drum rhythm.','ready|stroke|recover|glide','双桨就位|双桨入水|提桨回收|龙舟向前','Paddles ready|Paddles in the water|Paddles recover|The boat glides'],
    ['tanabata','七夕星桥','Tanabata star bridge','summer','festival','搭起一段星桥','Build a star bridge','把两岸的星点接成一座纸桥。','Join stars on two banks with a little paper bridge.','banks|first-span|second-span|connected','两岸相望|第一段星桥|第二段星桥|星桥相连','Two distant banks|First bridge span|Second bridge span|The bridge connects'],
    ['lanternfest','元宵灯谜','Lantern riddle','winter','festival','展开一张灯谜','Unfold a lantern riddle','展开谜笺，再翻开一枚小小谜底。','Unfold a riddle slip and turn over its little answer.','folded|unfolded|answer|fold-back','谜笺收好|谜笺展开|谜底是月亮|重新折好','The riddle is folded|The slip unfolds|The answer is the moon|Fold the slip again'],
    ['diwali','排灯小径','Diwali lamp path','autumn','festival','点一盏陶灯','Light a clay lamp','陶灯依次亮起，照出一条小路。','Clay lamps light one by one along a little path.','unlit|one|two|three|four|five','陶灯未点|第一盏灯|第二盏灯|第三盏灯|第四盏灯|小径亮起','Lamps at rest|The first lamp|The second lamp|The third lamp|The fourth lamp|The path is lit'],
    ['holi','洒红调色盘','Holi pigment palette','spring','festival','调一勺彩粉','Mix a spoon of pigment','把不同颜色的小勺轻轻拌进调色碗。','Stir small spoons of pigment into a mixing bowl.','bowls|pink|gold|violet|swirl','彩粉分好|添一勺粉红|添一勺金黄|添一勺紫色|彩色旋纹','Separate pigments|A spoon of pink|A spoon of gold|A spoon of violet|A colourful swirl'],
    ['easter','彩蛋花纹坊','Easter egg patterns','spring','festival','配好半枚彩蛋','Match an egg pattern','让两半彩蛋的条纹和圆点对齐。','Align the stripes and dots on two patterned egg halves.','apart|stripes|dots|matched','两半分开|对齐条纹|对齐圆点|花纹配好了','Two separate halves|Align the stripes|Align the dots|The pattern matches'],
    ['valentine','心笺邮匣','Valentine paper letter','winter','festival','折好一封心笺','Fold a paper letter','折起纸笺、合上信封，再盖一枚纸心。','Fold the note, close its envelope and add a paper heart.','letter|folded|closed|sealed','纸笺展开|纸笺折好|合上信封|纸心封好','An open note|The note is folded|The envelope closes|A paper heart seals it'],
    ['stpatrick','三叶草结环','Shamrock wreath','spring','festival','展开一株三叶草','Open a shamrock','三片小叶逐一舒展，绕出一圈青绿细结。','Three little leaves open one by one inside a green ribbon wreath.','folded|first-leaf|second-leaf|wreath','小叶收拢|第一叶展开|第二叶展开|三叶草结环','Folded leaves|The first leaf opens|The second leaf opens|A shamrock in its wreath'],
    ['thanksgiving','秋收分拣台','Harvest sorting table','autumn','festival','收好一份秋实','Sort a little harvest','把玉米、南瓜和苹果放进不同的小筐。','Sort corn, a pumpkin and an apple into little baskets.','table|corn|pumpkin|apple','秋实在桌上|玉米入筐|南瓜入筐|苹果入筐','Harvest on the table|Corn in its basket|Pumpkin in its basket|Apple in its basket'],
    ['carnival','嘉年华羽面','Carnival feather mask','winter','festival','展开羽毛面具','Unfold a feather mask','面具两侧的纸羽依次舒展。','Paper feathers unfold on each side of a mask.','folded|left|right|flourish','纸羽收起|左羽展开|右羽展开|羽冠舒展','Feathers folded|Left feathers open|Right feathers open|The crest opens'],
    ['oktoberfest','椒盐结工坊','Pretzel knot workshop','autumn','festival','编一个椒盐结','Braid a pretzel knot','面绳交叉、翻回，再撒几粒小盐。','Cross the dough rope, fold it back and add a few grains of salt.','rope|cross|fold|salt','一根面绳|交叉两端|翻回成结|撒上小盐','A dough rope|Cross the ends|Fold the knot|Add little salt grains'],
    ['loykrathong','水灯莲台','Loy Krathong lotus light','autumn','festival','展开莲瓣水灯','Open a lotus lantern','莲瓣展开，烛光沿一圈水纹漂移。','Lotus petals open and a candle floats around a ripple.','bud|petals|candle|float','莲瓣合拢|莲瓣展开|点亮小烛|沿水纹漂流','Closed lotus petals|Lotus petals open|A little candle glows|Float along the ripple'],
    ['songkran','泼水涟漪','Songkran water ripples','spring','festival','轻倒一勺清水','Pour a little water','小水勺倾斜，一串水滴落进浅盆。','A little ladle tips a stream of drops into a shallow basin.','filled|tip|pour|ripple','水勺盛好|水勺倾斜|清水落下|涟漪展开','A filled ladle|The ladle tips|Water pours|Ripples spread'],
    ['tulip','郁金香苗圃','Tulip miniature garden','spring','seasonal-study','唤醒一朵郁金香','Open a tulip','依次舒展三株不同形状的花苞。','Open three differently shaped little tulip buds.','buds|pink|yellow|garden','花苞未开|粉花展开|金花展开|小花园盛开','Closed buds|The pink tulip opens|The yellow tulip opens|The little garden opens'],
    ['lavender','薰衣草香笺','Lavender paper sachet','summer','seasonal-study','包一枚薰衣草香笺','Wrap a lavender sachet','收拢花枝、折好纸角，再系一枚细结。','Gather the flower stems, fold the paper and tie a little knot.','sprigs|gather|fold|tie','花枝摊开|花枝收拢|纸角折好|系好细结','Loose flower stems|Gather the stems|Fold the paper|Tie the little knot'],
    ['sunflower','向日葵追光','Sunflower light study','summer','seasonal-study','转动一束日光','Move a little sunbeam','小太阳换个位置，花盘轻轻追随。','The flower follows a little sun as it changes position.','east|high|west|rest','日光在左|日光升高|日光向右|花盘回望','Sunlight on the left|Sunlight rises|Sunlight on the right|The flower looks back'],
    ['rainy','雨滴木琴','Raindrop xylophone','spring','seasonal-study','敲响一滴小雨','Play a raindrop','让一颗雨滴依次触碰长短不同的琴片。','A raindrop touches wooden bars of different lengths.','cloud|long-bar|middle-bar|short-bar','雨滴在云下|轻触长琴片|轻触中琴片|轻触短琴片','A drop under a cloud|Touch the long bar|Touch the middle bar|Touch the short bar'],
    ['snowfall','雪球小工地','Snowball workshop','winter','seasonal-study','滚好一枚雪球','Roll a little snowball','从雪地滚来雪球，叠好雪人的围巾。','Roll a snowball into place and add a little scarf.','snow|roll|stack|scarf','雪球在雪地|滚来一枚雪球|雪球叠好了|围巾系好了','Snowballs in the snow|Roll a little snowball|Stack the snowballs|Add the scarf'],
    ['aurora','极光织带','Aurora ribbon loom','winter','seasonal-study','织一条极光带','Weave an aurora ribbon','拨动三条薄薄的光带，织出不同曲线。','Move three thin ribbons of light into different curves.','low|rising|braided|arch','光带低垂|青光升起|紫光交织|极光成拱','Low ribbons|Green light rises|Violet light weaves|The ribbons form an arch'],
    ['meteor','流星轨道台','Meteor orbit table','summer','seasonal-study','推一颗轨道流星','Guide an orbiting meteor','沿椭圆轨道推进小流星，留下短短星尾。','Guide a little meteor along an oval track with a short tail.','start|upper|far|lower','流星在起点|划过上弧|绕过远端|回到下弧','Meteor at the start|Across the upper arc|Around the far end|Along the lower arc'],
    ['solstice','日影刻度盘','Solstice shadow dial','summer','seasonal-study','拨动一格日影','Turn a shadow dial','手动日影示意，观察影子的长短方向。','A manual shadow illustration explores direction and length.','morning|noon|afternoon|long-shadow','晨影斜长|午影变短|日影向右|长影舒展','A long morning shadow|A shorter noon shadow|An afternoon shadow|A long evening shadow'],
    ['ocean','漂流瓶书桌','Ocean bottle desk','summer','seasonal-study','展开瓶中的纸卷','Unroll a bottle note','拔开软木塞，让小纸卷舒展一张海图。','Lift the cork and unroll a little paper sea chart.','corked|uncork|note|map','瓶塞合好|拔开软木塞|纸卷升起|海图展开','A corked bottle|Lift the cork|Raise the paper roll|Unfold a sea chart'],
    ['bamboo','风竹听雨','Bamboo breeze chimes','summer','seasonal-study','拨动一管风竹','Nudge a bamboo chime','三根竹管错落摆动，纸带接住一阵风。','Three bamboo pipes swing above a little paper ribbon.','rest|left|right|ribbon','风竹静候|左管轻摆|右管回应|纸带随风','Bamboo at rest|The left pipe swings|The right pipe answers|The paper ribbon follows'],
    ['firefly','萤火小径','Firefly path','summer','seasonal-study','点一段萤火路','Light a firefly path','让萤火虫依次停在叶桥和苔石旁。','A firefly pauses beside a leaf bridge and mossy stones.','grass|stone|leaf|home','萤火在草边|停在苔石旁|飞过叶桥|回到小草边','A firefly by the grass|Beside a mossy stone|Across a leaf bridge|Back to the grass'],
    ['sailing','纸帆折叠台','Paper sailboat table','summer','seasonal-study','折出一片纸帆','Fold a paper sail','把方纸折成船身，再展开三角小帆。','Fold a square sheet into a hull and open a triangular sail.','sheet|fold|hull|sail','方纸铺好|对折纸角|船身成形|纸帆展开','A square sheet|Fold the corners|A little hull|The paper sail opens'],
    ['music','齿轮八音匣','Clockwork music box','winter','seasonal-study','摇一圈小音匣','Turn a music box crank','掀开匣盖，摇动齿轮，让小木槌轮流抬起。','Open the lid, turn a gear and lift the little hammers in sequence.','closed|lid|crank|hammers','匣盖合好|掀开匣盖|转动小齿轮|木槌依次抬起','The box is closed|Open the lid|Turn the little gear|The hammers rise'],
    ['bookday','书页藏签','Book and bookmark','spring','festival','翻到一枚藏书签','Find a bookmark','翻过几页小书，留下一枚叶形书签。','Turn a few little pages and place a leaf-shaped bookmark.','closed|page-one|page-two|bookmark','小书合好|翻开第一页|翻到第二页|叶签夹好了','A closed book|Open the first page|Turn the second page|Place a leaf bookmark'],
    ['chess','骑士跳格','Knight move puzzle','autumn','seasonal-study','走一步骑士棋','Move the little knight','骑士按日字跳格，棋盘亮出下一站。','A knight follows L-shaped moves between highlighted squares.','corner|first-jump|second-jump|third-jump','骑士在角落|第一步日字|第二步日字|第三步日字','Knight in the corner|The first L-shaped move|The second L-shaped move|The third L-shaped move'],
    ['dawn','晨光棱镜','Dawn prism','spring','seasonal-study','转动晨光棱镜','Turn the dawn prism','转动三角棱镜，让一束晨光分成彩色光线。','Turn a triangular prism to split a dawn ray into colours.','dark|sunrise|ray|spectrum','棱镜静候|小太阳升起|晨光入镜|彩色光线展开','A prism at rest|A little sunrise|A ray enters the prism|The spectrum opens'],
    ['nightmarket','灯火小夜摊','Lantern night stall','autumn','seasonal-study','挂上一盏小摊灯','Hang a little stall lantern','卷起帘子，再把纸灯挂到小木架上。','Roll up the curtain and hang paper lamps on a little wooden stall.','curtain|open|one-lamp|two-lamps','小帘垂下|卷起小帘|挂好第一灯|挂好第二灯','The curtain is down|Roll up the curtain|Hang the first lamp|Hang the second lamp']
  ];
  const MANUAL_SOURCE=Object.freeze({kind:'manual-art-study',calendar:false});
  const CATALOG = Object.freeze(DEFINITIONS.map(d => Object.freeze({id:d[0],nameZh:d[1],nameEn:d[2],season:d[3],kind:d[4],action:d[0]+'-study',actionZh:d[5],actionEn:d[6],detailZh:d[7],detailEn:d[8],source:MANUAL_SOURCE})));
  const records = new Map(DEFINITIONS.map((d,index) => [d[0], {index, phases:d[9].split('|'),zh:d[10].split('|'),en:d[11].split('|')} ]));
  function definition(id) { const d=records.get(id);if(!d)throw new TypeError('Unknown decorative study');return d; }
  function boundedStep(value, count) { return Number.isSafeInteger(value)&&value>=0 ? value%count : 0; }
  function activate(id, previous={}) {
    const d=definition(id),step=(boundedStep(previous?.step,d.phases.length)+1)%d.phases.length;
    return {step,open:step>0,selection:step,phase:d.phases[step],statusZh:d.zh[step],statusEn:d.en[step]};
  }
  const palette = {ink:'#504b43',paper:'#f6efd8',gold:'#d4a343',rose:'#dc8390',blue:'#88a8ba',green:'#87a482',purple:'#a192b7',clay:'#b77454'};
  function build(id, options={}) {
    const d=definition(id),factory=options.svgNode;
    if(typeof factory!=='function')throw new TypeError('An SVG node factory is required');
    const svg=factory('svg',{viewBox:'0 0 120 110','aria-hidden':'true',focusable:'false','data-study':id,'data-mechanism':id+'-mechanism'});
    const add=(tag,attrs={},parent=svg)=>{const n=factory(tag,attrs);parent.appendChild(n);return n;};
    const g=(name,parent=svg)=>add('g',{'data-part':name},parent);
    const path=(shape,fill=palette.paper,parent=svg,attrs={})=>add('path',{d:shape,fill,stroke:palette.ink,'stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round',...attrs},parent);
    const line=(x1,y1,x2,y2,parent=svg,attrs={})=>add('line',{x1,y1,x2,y2,stroke:palette.ink,'stroke-width':1.5,'stroke-linecap':'round',...attrs},parent);
    const circle=(cx,cy,r,fill=palette.gold,parent=svg,attrs={})=>add('circle',{cx,cy,r,fill,...attrs},parent);
    const ellipse=(cx,cy,rx,ry,fill=palette.paper,parent=svg,attrs={})=>add('ellipse',{cx,cy,rx,ry,fill,...attrs},parent);
    const rect=(x,y,width,height,fill=palette.paper,parent=svg,attrs={})=>add('rect',{x,y,width,height,rx:2,fill,...attrs},parent);
    const label=(content,x,y,parent=svg,attrs={})=>{const n=add('text',{x,y,'text-anchor':'middle','font-size':9,fill:palette.ink,...attrs},parent);n.textContent=content;return n;};
    const primary=g('primary'), shadow=ellipse(60,96,38,4,palette.ink,svg,{opacity:.1});
    // Put the shadow behind the moving objects without relying on a CSS theme.
    if(svg.insertBefore)svg.insertBefore(shadow,primary);
    let initialized=false;const poses=new WeakMap();
    function pose(node, {x=0,y=0,rotate=0,sx=1,sy=1,opacity=1,origin='60px 55px'}={},result={}) {
      const transform=`translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${sx}, ${sy})`;
      const previous=poses.get(node),changed=!previous||previous.transform!==transform||previous.opacity!==opacity||previous.origin!==origin;
      // Independent inner parts interpolate from their current computed position.
      // No loops, timeout callbacks, actor mutation or new animation clock.
      if(node.style){
        // A quiet completion must not retroactively start a transition if the
        // next ordinary update has the same target before the next paint.
        if(changed||result.reducedMotion)node.style.transition=changed&&initialized&&!result.reducedMotion?'transform 520ms cubic-bezier(.23,1,.32,1), opacity 380ms ease':'none';
        node.style.transformBox='view-box';node.style.transformOrigin=origin;
        node.style.transform=transform;node.style.opacity=String(opacity);
      }
      poses.set(node,{transform,opacity,origin});
      node.setAttribute('data-pose',transform);node.setAttribute('opacity',String(opacity));
    }
    const color=(node,fill)=>node.setAttribute('fill',fill);
    let render;
    switch(id) {
      case 'dragonboat': {
        const boat=g('dragon-hull',primary);
        path('M17 72Q57 86 100 66L91 82Q55 96 24 83Z',palette.clay,boat);
        path('M88 69L96 51l11 5-7 9 2 9-14 2',palette.green,boat);circle(100,56,2,palette.ink,boat);
        path('M22 75l-7-13 11 5',palette.gold,boat);circle(56,64,10,palette.rose,boat);ellipse(56,59,10,4,palette.paper,boat);
        const oars=[39,73].map((x,i)=>{const p=g('oar-'+i,boat);line(x,62,x+13,91,p,{'stroke-width':3,stroke:palette.gold});path(`M${x+9} 85l8-3 6 13-7 3Z`,palette.gold,p);return p;});
        const splash=g('paddle-splashes',primary);path('M29 91l-5-4m9 8-3 4m56-9 6-4m-1 8 6 2','none',splash,{stroke:palette.blue,'stroke-width':2});
        render=(s,r)=>{pose(boat,{x:[0,1,3,5][s]},r);oars.forEach((p,i)=>pose(p,{rotate:[0,24,-19,0][s]*(i?-1:1),origin:`${i?73:39}px 62px`},r));pose(splash,{opacity:s===1?1:0,sy:s===1?1:.5},r);};break;
      }
      case 'tanabata': {
        path('M8 83q16-17 28 0v10H8Zm77 0q15-17 28 0v10H85Z',palette.blue,primary);
        path('M44 19Q69 42 48 96','none',primary,{stroke:'#a192b7','stroke-width':12,opacity:.35});
        const star=(x,y,parent)=>path(`M${x} ${y-5}l2 3 4 1-3 3v4l-3-2-4 1 1-4-2-3 4-1Z`,palette.gold,parent);
        star(22,65,primary);star(98,65,primary);line(21,18,21,42,primary);line(99,16,99,40,primary);
        path('M16 29h10v19l-5-3-5 3Z',palette.rose,primary);path('M94 27h10v19l-5-3-5 3Z',palette.green,primary);
        const segments=[0,1,2].map((i)=>{const p=g('bridge-span-'+i,primary);path(`M${30+i*21} ${78-i*4}l22-4v7l-22 4Z`,palette.paper,p);star(40+i*21,70-i*4,p);return p;});
        render=(s,r)=>segments.forEach((p,i)=>pose(p,{opacity:s>i?1:.13,y:s>i?0:7},r));break;
      }
      case 'lanternfest': {
        line(60,12,60,24,primary);ellipse(60,43,30,22,palette.rose,primary,{stroke:palette.ink,'stroke-width':1.5});
        [43,60,77].forEach(x=>path(`M${x} 24q${(60-x)*.5} 19 0 39`,'none',primary,{stroke:palette.paper,opacity:.65}));
        rect(45,20,30,5,palette.gold,primary);rect(45,61,30,5,palette.gold,primary);
        const slip=g('riddle-slip',primary);path('M43 68h34v27H43Z',palette.paper,slip);label('?',60,86,slip,{'font-size':16});
        const answer=g('moon-answer',primary);rect(47,68,26,27,palette.blue,answer);circle(60,80,9,palette.paper,answer);circle(64,77,8,palette.blue,answer);
        render=(s,r)=>{pose(slip,{sy:s===0||s===3?.3:1,origin:'60px 68px'},r);pose(answer,{opacity:s===2?1:0,rotate:s===2?0:-25,y:s===2?0:7},r);};break;
      }
      case 'diwali': {
        path('M12 88Q60 65 108 88','none',primary,{stroke:palette.gold,'stroke-width':2,'stroke-dasharray':'2 4'});
        const flames=[];for(let i=0;i<5;i++){const x=20+i*20,y=80-Math.sin(i*Math.PI/4)*18;path(`M${x-9} ${y}q9 16 18 0Z`,palette.clay,primary);ellipse(x,y,9,3,palette.gold,primary);const p=g('flame-'+i,primary);path(`M${x} ${y-17}q-9 10 0 15 8-5 0-15Z`,'#f0be60',p);path(`M${x} ${y-10}q-3 5 0 7 3-2 0-7Z`,palette.paper,p);flames.push(p);}
        render=(s,r)=>flames.forEach((p,i)=>pose(p,{opacity:s>i?1:0,sy:s>i?1:.15,origin:`${20+i*20}px 80px`},r));break;
      }
      case 'holi': {
        [['#db8193',26,52],['#d9b54e',60,35],['#a08fba',94,52]].forEach(([fill,x,y])=>{ellipse(x,y,13,7,palette.clay,primary);path(`M${x-11} ${y-1}q11-20 22 0Z`,fill,primary);});
        path('M30 73q30 32 60 0Z',palette.paper,primary);ellipse(60,73,30,11,'#e6d8c2',primary);
        const pigment=ellipse(60,73,23,7,palette.rose,primary);
        const swirl=path('M44 73q12-9 29-2t-23 7q-8-4 12-5','none',primary,{stroke:palette.gold,'stroke-width':3});
        const spoon=g('mixing-spoon',primary);line(68,70,91,29,spoon,{'stroke-width':3,stroke:palette.clay});ellipse(68,71,6,3,palette.clay,spoon);
        render=(s,r)=>{color(pigment,['#e6d8c2','#db8193','#e0a56a','#b28eaa','#ba849b'][s]);swirl.setAttribute('stroke',s===3?'#a08fba':palette.gold);pose(swirl,{opacity:s>1?1:0,rotate:s*11},r);pose(spoon,{rotate:[0,-16,17,-11,25][s],origin:'68px 71px'},r);};break;
      }
      case 'easter': {
        const halves=[g('striped-half',primary),g('dotted-half',primary)];
        path('M60 23C43 23 31 49 32 66h56C89 49 77 23 60 23Z',palette.rose,halves[0]);
        path('M32 66c0 30 56 30 56 0l-9 4-9-5-10 5-9-5-10 5Z',palette.blue,halves[1]);
        path('M40 43q20 9 40 0m-45 15q25 10 50 0','none',halves[0],{stroke:palette.paper,'stroke-width':4});
        [43,60,77].forEach((x,i)=>circle(x,78+(i%2?5:0),3,palette.paper,halves[1]));
        path('M16 96l-3-10m5 10 5-13m77 13 4-13m-7 12-3-8','none',primary,{stroke:palette.green,'stroke-width':2});
        path('M53 29q-9 7-12 16','none',halves[0],{stroke:palette.paper,opacity:.55});
        render=(s,r)=>{pose(halves[0],{x:[-8,-2,0,0][s],y:[-6,-4,-1,0][s],rotate:[-14,-5,0,0][s]},r);pose(halves[1],{x:[8,6,2,0][s],y:[5,4,1,0][s],rotate:[12,7,2,0][s]},r);};break;
      }
      case 'valentine': {
        const note=g('paper-note',primary);rect(37,26,46,45,palette.paper,note,{stroke:palette.ink});[39,47,55].forEach(y=>line(45,y,74,y,note,{stroke:palette.rose}));
        path('M24 53h72v38H24Z','#dba3a0',primary);path('M24 91l36-27 36 27M24 53l36 27 36-27','none',primary);
        const flap=g('envelope-flap',primary);path('M24 53l36-24 36 24-36 26Z',palette.rose,flap);
        const seal=g('heart-seal',primary);path('M60 73c-13-13-22 6 0 17 22-11 13-30 0-17Z','#c96d7c',seal);
        render=(s,r)=>{pose(note,{y:s?23:0,sy:s?.55:1,opacity:s<2?1:0},r);pose(flap,{sy:s<2?-1:1,origin:'60px 53px'},r);pose(seal,{opacity:s===3?1:0,sx:s===3?1:.4,sy:s===3?1:.4},r);};break;
      }
      case 'stpatrick': {
        const clover=g('clover',primary);line(60,61,53,94,clover,{stroke:palette.green,'stroke-width':3});
        const leaf=(angle,parent)=>{const p=g('leaf-'+angle,parent);path('M60 62C33 53 37 31 48 36c5-10 23-3 12 26Z',palette.green,p);pose(p,{rotate:angle,origin:'60px 62px'});return p;};
        const leaves=[0,120,240].map(angle=>leaf(angle,clover));
        const wreath=g('green-ribbon-wreath',primary);circle(60,59,32,'none',wreath,{stroke:palette.green,'stroke-width':2,'stroke-dasharray':'3 4'});
        path('M59 90q-19-13-15 2 9 8 15-2 7-14 18-4-3 14-18 4m0 0-9 10m9-10 12 10','none',wreath,{stroke:palette.gold,'stroke-width':2});
        [21,101].forEach(x=>path(`M${x} 73q-8-12-1-14 10 2 1 14Z`,palette.green,primary));
        render=(s,r)=>{leaves.forEach((p,i)=>pose(p,{rotate:i*120,sx:s>i?1:.08,sy:s>i?1:.08,opacity:s>i?1:.15,origin:'60px 62px'},r));pose(wreath,{opacity:s===3?1:0,rotate:s===3?0:-15},r);};break;
      }
      case 'thanksgiving': {
        const produce=[];for(let i=0;i<3;i++){const basket=g('basket-'+i,primary),x=12+i*34;path(`M${x} 77h28l-4 17h-20Z`,palette.clay,basket);[0,1,2].forEach(k=>line(x+7+k*7,79,x+8+k*6,91,basket,{stroke:palette.paper,opacity:.7}));}
        const corn=g('corn',primary);ellipse(26,48,7,14,palette.gold,corn);path('M19 58l-7-13 4 20 16-2 9-18-9 11',palette.green,corn);produce.push(corn);
        const pumpkin=g('pumpkin',primary);ellipse(60,50,14,11,'#d69452',pumpkin);ellipse(60,50,6,11,'#e5ac62',pumpkin);line(60,39,63,33,pumpkin,{stroke:palette.green,'stroke-width':3});produce.push(pumpkin);
        const apple=g('apple',primary);path('M94 43c-18-10-19 20-4 20h8c15 0 13-30-4-20Z',palette.rose,apple);path('M94 43q-2-10 6-10',palette.green,apple);produce.push(apple);
        render=(s,r)=>produce.forEach((p,i)=>pose(p,{y:s>i?34:0,rotate:s>i?(i-1)*5:0},r));break;
      }
      case 'carnival': {
        const feathers=[];[-2,-1,0,1,2].forEach((k,i)=>{const p=g('feather-'+i,primary);path(`M60 60Q${23+k*8} 9 ${52+k*10} ${18+Math.abs(k)*3}Q${82+k*8} 20 60 60Z`,[palette.blue,palette.rose,palette.gold,palette.purple,palette.green][i],p);line(60,60,52+k*10,23+Math.abs(k)*3,p,{stroke:palette.paper});feathers.push(p);});
        path('M22 56q16-14 38-1 22-13 38 1l-7 26-23-1-8-11-8 11-23 1Z',palette.purple,primary);
        path('M33 62q9-6 17 1l-2 7H35Zm37 1q8-7 17-1l-2 8H72Z',palette.paper,primary);circle(60,58,4,palette.gold,primary);
        render=(s,r)=>feathers.forEach((p,i)=>pose(p,{rotate:s===0?(i-2)*-15:s===1&&i>2?(i-2)*-15:s===2&&i<2?(i-2)*-15:0,sy:s===3?1.08:1,origin:'60px 60px'},r));break;
      }
      case 'oktoberfest': {
        const rope=path('M29 43q-12 8-4 24t19 3l32-32q12-10 20 4t-4 24L39 42q-18-8-10 1','none',primary,{stroke:'#c78f53','stroke-width':10});
        const fold=g('pretzel-fold',primary);path('M33 71q-12-24 8-32 17-8 19 13 3-21 20-13 20 8 7 32-7 12-18 0L51 52','none',fold,{stroke:'#d5a164','stroke-width':10});
        const salt=g('salt-grains',primary);[[38,45],[45,72],[73,42],[82,64],[60,63],[32,62]].forEach(([x,y],i)=>rect(x,y,2,3,palette.paper,salt,{transform:`rotate(${i*31} ${x} ${y})`}));
        render=(s,r)=>{pose(rope,{opacity:s<2?1:0,rotate:s===1?17:0},r);pose(fold,{opacity:s>=2?1:0,sy:s>=2?1:.7},r);pose(salt,{opacity:s===3?1:0,y:s===3?0:-10},r);};break;
      }
      case 'loykrathong': {
        [0,1,2].forEach(i=>ellipse(60,86,25+i*11,3+i*3,'none',primary,{stroke:palette.blue,'stroke-width':1,opacity:.5}));
        const lotus=g('lotus-float',primary),petals=[];
        [-2,-1,0,1,2].forEach((k,i)=>{const p=g('lotus-petal-'+i,lotus);path(`M60 78Q${26+k*8} ${49+Math.abs(k)*4} ${50+k*8} ${47+Math.abs(k)*2}Q${81+k*3} 58 60 78Z`,i%2?palette.rose:'#e9b1b0',p);petals.push(p);});
        path('M33 78q27 17 54 0Z',palette.green,lotus);rect(56,47,8,25,palette.paper,lotus);
        const flame=g('lotus-candle-flame',lotus);path('M60 32q-10 12 0 16 9-4 0-16Z',palette.gold,flame);
        render=(s,r)=>{petals.forEach((p,i)=>pose(p,{rotate:s===0?(2-i)*11:0,sy:s===0?.7:1,origin:'60px 78px'},r));pose(flame,{opacity:s>=2?1:0},r);pose(lotus,{x:s===3?8:0,y:s===3?-2:0,rotate:s===3?4:0},r);};break;
      }
      case 'songkran': {
        ellipse(56,86,39,9,palette.blue,primary);path('M17 86q39 24 78 0',palette.paper,primary);
        const ripple=g('water-ripples',primary);[9,19,29].forEach(rx=>ellipse(56,85,rx,rx/5,'none',ripple,{stroke:palette.paper,'stroke-width':1.5}));
        const ladle=g('water-ladle',primary);line(54,46,91,21,ladle,{stroke:palette.clay,'stroke-width':5});path('M29 45q15 23 30 0Z',palette.gold,ladle);ellipse(44,45,15,5,palette.blue,ladle);
        const water=g('pouring-stream',primary);path('M34 55q-3 14 20 27','none',water,{stroke:palette.blue,'stroke-width':3});[0,1,2].forEach(i=>circle(34+i*6,66+i*6,2,palette.blue,water));
        render=(s,r)=>{pose(ladle,{rotate:[0,-17,-38,0][s],origin:'54px 46px'},r);pose(water,{opacity:s===2?1:0,sy:s===2?1:.3},r);pose(ripple,{opacity:s===3?1:.15,sx:s===3?1:.3,sy:s===3?1:.3,origin:'56px 85px'},r);};break;
      }
      case 'tulip': {
        path('M16 91q44-10 88 0v8H16Z','#b5b48e',primary);const petals=[];
        [[32,63,palette.rose],[61,47,palette.gold],[89,59,palette.purple]].forEach(([x,y,fill],i)=>{line(x,y,x,91,primary,{stroke:palette.green,'stroke-width':3});path(`M${x} 83q-20-18-13-13 12 0 13 13m0-4q18-20 14-13-9 1-14 13`,palette.green,primary);const p=g('tulip-'+i,primary);path(`M${x} ${y+5}q-17-4-14-25l9 7 5-10 5 10 9-7q3 21-14 25Z`,fill,p);petals.push(p);});
        render=(s,r)=>petals.forEach((p,i)=>pose(p,{sx:s>i?1:.38,sy:s>i?1:.75,origin:`${[32,61,89][i]}px ${[63,47,59][i]+5}px`},r));break;
      }
      case 'lavender': {
        const flowers=g('lavender-stems',primary);[-1,0,1].forEach((k,i)=>{const x=60+k*15;line(60,83,x,28+Math.abs(k)*6,flowers,{stroke:palette.green,'stroke-width':2});for(let j=0;j<5;j++)ellipse(x+k*j,31+j*5+Math.abs(k)*6,4,2.5,palette.purple,flowers,{transform:`rotate(${k*20} ${x} ${31+j*5})`});});
        const wrap=g('paper-wrap',primary);path('M27 60l33 11 33-11-17 34H44Z',palette.paper,wrap);path('M27 60l33 34 33-34M60 71v23','none',wrap,{stroke:'#c3b48f'});
        const knot=g('sachet-knot',primary);path('M60 83c-29-16-21 10 0 0 23-16 27 12 0 0m0 0-11 13m11-13 12 13','none',knot,{stroke:palette.rose,'stroke-width':3});
        render=(s,r)=>{pose(flowers,{sx:s===0?1:.65,origin:'60px 83px'},r);pose(wrap,{sx:s<2?1.25:1,sy:s<2?.7:1,opacity:s===0?.4:1,origin:'60px 94px'},r);pose(knot,{opacity:s===3?1:0},r);};break;
      }
      case 'sunflower': {
        line(60,58,60,96,primary,{stroke:palette.green,'stroke-width':4});path('M60 85Q29 64 35 80q11 16 25 5m0-9q27-24 25-7-6 14-25 7',palette.green,primary);
        const flower=g('sunflower-head',primary);for(let i=0;i<10;i++)ellipse(60,32,5,12,palette.gold,flower,{transform:`rotate(${i*36} 60 52)`});circle(60,52,13,palette.clay,flower);[[55,47],[64,46],[57,55],[65,56]].forEach(([x,y])=>circle(x,y,1.5,palette.paper,flower));
        const sun=g('moving-sun',primary);circle(28,24,8,palette.gold,sun);[0,1,2,3].forEach(i=>line(28,10,28,13,sun,{stroke:palette.gold,transform:`rotate(${i*90} 28 24)`}));
        render=(s,r)=>{pose(sun,{x:[0,32,65,16][s],y:[7,-7,6,3][s]},r);pose(flower,{rotate:[-21,0,22,-9][s],origin:'60px 58px'},r);};break;
      }
      case 'rainy': {
        path('M23 31q-1-15 15-13 8-17 23-3 19-5 20 10 16 0 15 13H23Z','#d5dfe0',primary);
        [0,1,2,3].forEach(i=>{const x=25+i*22;rect(x,65+i*4,16,31-i*6,[palette.blue,palette.green,palette.gold,palette.rose][i],primary,{stroke:palette.ink});circle(x+8,71+i*4,1.4,palette.ink,primary);});
        const drop=g('raindrop-mallet',primary);path('M35 37q-12 16 0 18 12-2 0-18Z',palette.blue,drop);
        const ring=g('bar-resonance',primary);ellipse(35,68,13,4,'none',ring,{stroke:palette.gold,'stroke-width':2});
        render=(s,r)=>{pose(drop,{x:[0,0,22,44][s],y:[0,16,21,25][s]},r);pose(ring,{opacity:s?1:0,x:Math.max(0,s-1)*22,y:Math.max(0,s-1)*4,sx:s?1:.4},r);};break;
      }
      case 'snowfall': {
        path('M11 94q27-13 50 0 23-10 48 0Z','#e8ece4',primary);circle(61,79,17,'#eff1e6',primary,{stroke:palette.blue});
        const head=g('rolling-snowball',primary);circle(24,85,11,'#eff1e6',head,{stroke:palette.blue});circle(21,83,1.3,palette.ink,head);circle(28,83,1.3,palette.ink,head);path('M24 87l7 1-7 2Z',palette.clay,head);
        const scarf=g('snow-scarf',primary);path('M48 64q13 6 25 0v7H48Z',palette.rose,scarf);path('M67 70h6l-2 16-6-2Z',palette.rose,scarf);
        render=(s,r)=>{pose(head,{x:[0,21,37,37][s],y:[0,-2,-27,-27][s],rotate:[-45,-15,0,0][s],origin:'24px 85px'},r);pose(scarf,{opacity:s===3?1:0,y:s===3?0:-5},r);};break;
      }
      case 'aurora': {
        path('M9 94l18-26 18 16 16-29 24 28 14-14 12 25Z','#88969e',primary);const bands=[];
        ['#83b3a1','#b398c2','#8caac0'].forEach((fill,i)=>bands.push(path(`M12 ${31+i*9}Q32 ${10+i*9} 56 ${30+i*9}T108 ${23+i*9}v9Q80 ${56+i*4} 56 ${40+i*9}T12 ${42+i*9}Z`,fill,primary,{opacity:.72})));
        [[22,20],[98,16],[82,54]].forEach(([x,y])=>circle(x,y,1.4,palette.paper,primary));
        path('M27 68l-2 15 9-7m27-21-4 23 13-9','none',primary,{stroke:palette.paper,opacity:.55});
        path('M13 96l9-12 7 12m65 0 8-13 8 13',palette.ink,primary,{stroke:'none',opacity:.4});
        render=(s,r)=>bands.forEach((p,i)=>pose(p,{rotate:[0,(-1+i)*5,(1-i)*7,(-1+i)*3][s],y:[0,-(i+1)*3,(i%2?4:-7),-4][s],sx:[1,.96,1.03,1][s],opacity:.58+i*.12},r));break;
      }
      case 'meteor': {
        ellipse(60,60,43,24,'none',primary,{stroke:palette.blue,'stroke-width':1.5,transform:'rotate(-18 60 60)'});ellipse(60,60,24,42,'none',primary,{stroke:palette.purple,opacity:.5,transform:'rotate(39 60 60)'});circle(60,60,7,palette.gold,primary);circle(60,60,11,'none',primary,{stroke:palette.gold,opacity:.4});
        path('M72 19v7m-3-4h6m30 51h-7m3-3v6','none',primary,{stroke:palette.gold,opacity:.7});
        circle(39,85,2,palette.purple,primary);
        const star=g('orbit-meteor',primary);path('M24 52l-13 9 13-3m1-6-8 11','none',star,{stroke:palette.paper,'stroke-width':2});path('M27 47l2 4 5 1-4 3 1 5-5-3-4 2 1-5-4-3 6-1Z',palette.gold,star);
        render=(s,r)=>pose(star,{x:[0,37,67,25][s],y:[0,-20,1,27][s],rotate:[0,27,135,218][s],origin:'27px 53px'},r);break;
      }
      case 'solstice': {
        ellipse(60,75,42,18,palette.paper,primary,{stroke:palette.ink,'stroke-width':1.5});for(let i=0;i<9;i++){const a=(i*20-170)*Math.PI/180;line(60+Math.cos(a)*34,75+Math.sin(a)*14,60+Math.cos(a)*39,75+Math.sin(a)*17,primary,{stroke:palette.gold});}
        const cast=g('dial-shadow',primary);path('M60 75l-30-5 31-2Z','#959a9c',cast,{opacity:.65});path('M60 75l3-35 7 33Z',palette.clay,primary);line(63,40,63,74,primary,{stroke:palette.paper});
        const sun=g('dial-sun',primary);circle(25,28,8,palette.gold,sun);
        render=(s,r)=>{pose(cast,{rotate:[0,55,133,177][s],sx:[1,.35,.7,1.2][s],origin:'60px 75px'},r);pose(sun,{x:[0,34,67,75][s],y:[9,-10,1,18][s]},r);};break;
      }
      case 'ocean': {
        path('M20 94q9-8 18 0t18 0 18 0 18 0 18 0','none',primary,{stroke:palette.blue,'stroke-width':2});
        const bottle=g('bottle',primary);path('M46 32h19v18q18 8 15 36-20 11-39 0-4-29 12-36V32Z','#c3d4c5',bottle,{opacity:.85});path('M46 36h21','none',bottle,{stroke:palette.green,'stroke-width':3});
        const cork=g('bottle-cork',primary);rect(49,23,14,13,palette.clay,cork);
        const note=g('bottle-chart',primary);path('M48 51h25v30H48Z',palette.paper,note);path('M52 74l6-8 7 3 4-10','none',note,{stroke:palette.blue});circle(67,56,3,palette.gold,note);path('M51 55h6m-6 4h8','none',note,{stroke:palette.clay});
        render=(s,r)=>{pose(cork,{x:s?18:0,y:s?-14:0,rotate:s?29:0},r);pose(note,{y:s>=2?-24:0,sx:s===3?1.6:.5,sy:s>=2?1:.65,origin:'60px 65px'},r);};break;
      }
      case 'bamboo': {
        line(30,24,91,24,primary,{stroke:palette.clay,'stroke-width':4});path('M60 11l-16 13m16-13 16 13','none',primary);
        const pipes=[37,60,82].map((x,i)=>{line(x,24,x,38,primary);const p=g('bamboo-pipe-'+i,primary);rect(x-5,38,10,35+i*6,palette.green,p,{stroke:palette.ink});line(x-4,43,x+4,43,p,{stroke:palette.paper});line(x-4,65+i*6,x+4,65+i*6,p,{stroke:palette.paper});return p;});
        const ribbon=g('wind-ribbon',primary);line(60,67,60,82,ribbon);path('M53 82h14v19l-7-4-7 4Z',palette.paper,ribbon);
        render=(s,r)=>{pipes.forEach((p,i)=>pose(p,{rotate:[[0,0,0],[-14,5,0],[3,-5,13],[5,-8,5]][s][i],origin:`${[37,60,82][i]}px 38px`},r));pose(ribbon,{rotate:[0,-6,7,-17][s],origin:'60px 67px'},r);};break;
      }
      case 'firefly': {
        path('M13 91q5-13 9-2l4-21 3 22 9-12-4 17m48-2 5-18 3 16 9-24-2 23 10-8',palette.green,primary);
        ellipse(48,83,13,6,'#a7aa8b',primary);path('M55 72q20-26 39-3-23 18-39 3Z',palette.green,primary);path('M58 73l30-4','none',primary,{stroke:palette.paper});
        const gates=[[23,73],[48,71],[80,59],[34,46]].map(([x,y],i)=>circle(x,y,3,palette.gold,primary,{opacity:.18,'data-part':'path-marker-'+i}));
        const bug=g('firefly',primary);ellipse(24,65,8,5,palette.gold,bug,{opacity:.22});ellipse(21,61,5,3,palette.paper,bug);ellipse(29,61,5,3,palette.paper,bug);ellipse(25,66,3,5,palette.ink,bug);circle(25,69,3,palette.gold,bug);
        render=(s,r)=>{pose(bug,{x:[0,24,56,10][s],y:[0,-2,-14,-27][s],rotate:[0,-17,14,-9][s]},r);gates.forEach((p,i)=>p.setAttribute('opacity',i<=s?.9:.18));};break;
      }
      case 'sailing': {
        path('M13 95q10-6 20 0t20 0 20 0 20 0 16 0','none',primary,{stroke:palette.blue,'stroke-width':1.5});
        const sheet=g('paper-sheet',primary);path('M27 33h67v54H27Z',palette.paper,sheet);path('M27 33l67 54M94 33 27 87','none',sheet,{stroke:palette.gold,'stroke-dasharray':'3 3'});
        const hull=g('paper-hull',primary);path('M22 75l39 11 37-11-15 19H39Z',palette.rose,hull);path('M22 75l39-24 37 24-37 11Z',palette.paper,hull);
        const sail=g('paper-sail',primary);line(61,25,61,85,sail,{stroke:palette.clay,'stroke-width':2});path('M59 29L31 71h28Zm5 10 21 31H64Z',palette.paper,sail,{stroke:palette.gold});
        render=(s,r)=>{pose(sheet,{opacity:s<2?1:0,sy:s===1?.55:1,rotate:s===1?-7:0},r);pose(hull,{opacity:s>=2?1:0,sy:s>=2?1:.2,origin:'60px 94px'},r);pose(sail,{opacity:s===3?1:0,sx:s===3?1:.1,origin:'61px 85px'},r);};break;
      }
      case 'music': {
        path('M24 62h65v30H24Z',palette.clay,primary);rect(31,68,51,17,palette.paper,primary);[0,1,2,3,4].forEach(i=>rect(36+i*9,72,5,10,palette.gold,primary));
        const lid=g('music-box-lid',primary);path('M24 62l8-31h57v31Z',palette.paper,lid);path('M33 37h48v18H29Z','#c0b59b',lid);label('♪',58,51,lid,{'font-size':17});
        const crank=g('music-crank',primary);circle(98,70,8,palette.gold,crank,{stroke:palette.ink});line(98,70,108,58,crank,{'stroke-width':3});circle(108,58,3,palette.clay,crank);
        const hammers=[0,1,2].map(i=>{const p=g('wooden-hammer-'+i,primary);line(43+i*13,73,43+i*13,56,p,{stroke:palette.clay,'stroke-width':2});circle(43+i*13,55,3,palette.rose,p);return p;});
        render=(s,r)=>{pose(lid,{sy:s?1:.1,origin:'60px 62px'},r);pose(crank,{rotate:s>=2?135+(s-2)*90:0,origin:'98px 70px'},r);hammers.forEach((p,i)=>pose(p,{rotate:s===3?[-19,11,-29][i]:0,opacity:s?1:0,origin:`${43+i*13}px 73px`},r));};break;
      }
      case 'bookday': {
        path('M17 41q22-9 43 2 20-11 43-2v49q-25-8-43 2-18-10-43-2Z',palette.clay,primary);
        const pages=g('open-book-pages',primary);path('M21 37q21-7 39 7 20-14 39-7v47q-22-7-39 4-18-11-39-4Z',palette.paper,pages);line(60,44,60,88,pages,{stroke:'#c3b48f'});for(let i=0;i<4;i++){path(`M28 ${49+i*7}q13-3 25 2m16-2q13-5 23-3`,'none',pages,{stroke:'#b8ad92','stroke-width':1});}
        const turn=g('turning-page',primary);path('M60 44q20-14 39-7v47q-22-7-39 4Z','#e9dfc2',turn);path('M69 53q9-5 21-4','none',turn,{stroke:palette.gold});
        const mark=g('leaf-bookmark',primary);path('M77 63q-20 0-12 21 20-4 12-21Z',palette.green,mark);path('M65 88l12-21','none',mark,{stroke:palette.paper});path('M71 82v16l5-3 4 3V81Z',palette.rose,mark);
        render=(s,r)=>{pose(pages,{sx:s?1:.18,origin:'60px 80px'},r);pose(turn,{sx:s>=2?-1:1,opacity:s?1:0,origin:'60px 55px'},r);pose(mark,{opacity:s===3?1:0,y:s===3?0:-12},r);};break;
      }
      case 'chess': {
        for(let row=0;row<4;row++)for(let col=0;col<4;col++)rect(22+col*19,20+row*19,19,19,(row+col)%2?'#a9b29b':palette.paper,primary,{rx:0});
        const highlight=rect(22,77,19,19,palette.gold,primary,{opacity:.5,rx:0,'data-part':'knight-target'});
        const knight=g('chess-knight',primary);path('M26 91h13l-2-5q8-8 0-12l-3-7-5 6-4 5 7 2-4 6Z',palette.clay,knight);circle(33,75,1,palette.paper,knight);line(26,92,40,92,knight,{'stroke-width':2});
        render=(s,r)=>{const squares=[[0,3],[1,1],[3,0],[2,2]],target=squares[(s+1)%4];pose(knight,{x:squares[s][0]*19,y:(squares[s][1]-3)*19},r);highlight.setAttribute('x',22+target[0]*19);highlight.setAttribute('y',20+target[1]*19);};break;
      }
      case 'dawn': {
        path('M9 86h102','none',primary,{stroke:palette.blue});const sun=g('rising-sun',primary);circle(24,87,13,palette.gold,sun);
        const prism=g('glass-prism',primary);path('M60 36l25 45H36Z','#bed4d2',prism,{stroke:palette.blue,'fill-opacity':.7});path('M60 36v45m-24 0 24-13 25 13','none',prism,{stroke:palette.paper});
        const input=g('white-light-ray',primary);path('M12 58l44 3','none',input,{stroke:palette.paper,'stroke-width':4});
        const spectrum=g('split-spectrum',primary);['#d58b8b','#d4b35d','#8eb293','#8da7be'].forEach((color,i)=>line(66,62,108,49+i*11,spectrum,{stroke:color,'stroke-width':3}));
        render=(s,r)=>{pose(sun,{y:s?-23:0},r);pose(input,{opacity:s>=2?1:0,sx:s>=2?1:.1,origin:'12px 58px'},r);pose(prism,{rotate:s===3?9:0,origin:'60px 68px'},r);pose(spectrum,{opacity:s===3?1:0,sx:s===3?1:.05,origin:'66px 62px'},r);};break;
      }
      case 'nightmarket': {
        path('M18 90V30h84v60M12 30h96l-8-14H20Z',palette.clay,primary);rect(24,37,72,45,'#e8d9b8',primary);rect(17,84,86,8,palette.gold,primary);
        const curtain=g('stall-curtain',primary);path('M22 31h76v42l-9-5-10 5-10-5-9 5-10-5-9 5-10-5-9 5Z',palette.purple,curtain);
        const lamps=[42,78].map((x,i)=>{const p=g('stall-lantern-'+i,primary);line(x,36,x,45,p);ellipse(x,57,10,13,i?palette.gold:palette.rose,p,{stroke:palette.ink});line(x,70,x,78,p,{stroke:palette.clay,'stroke-width':2});path(`M${x-4} 45q-5 12 0 24m8-24q5 12 0 24`,'none',p,{stroke:palette.paper});return p;});
        render=(s,r)=>{pose(curtain,{sy:s?.16:1,origin:'60px 31px'},r);lamps.forEach((p,i)=>pose(p,{opacity:s>=i+2?1:0,y:s>=i+2?0:-14,rotate:s===3?(i?5:-5):0,origin:`${i?78:42}px 36px`},r));};break;
      }
      default: throw new TypeError('Unknown decorative study');
    }
    function apply(result={}) {
      const step=boundedStep(result.step,d.phases.length);
      render(step,result);svg.setAttribute('data-phase',d.phases[step]);initialized=true;
    }
    apply({step:0,reducedMotion:true});
    return {svg,primary,apply};
  }
  function frames(id,count=41) {
    const {index}=definition(id);
    if(!Number.isInteger(count)||count<2||count>121)throw new RangeError('Frame count must be an integer from 2 to 121');
    return Array.from({length:count},(_,i)=>{
      const p=i/(count-1),a=Math.sin(p*Math.PI)*(1-.12*p),w=Math.sin(p*Math.PI*2),q=Math.sin(p*Math.PI*4)*(1-p);
      let x=0,y=0,r=0,sx=1,sy=1,opacity=1;
      switch(id) {
        case 'dragonboat':x=5*a;y=-1.6*a;r=1.8*w;break;
        case 'tanabata':y=-4*a;sx=1-.04*a;r=1.5*Math.sin(p*Math.PI*3)*(1-p);break;
        case 'lanternfest':r=4.5*q;sy=1-.09*a;y=1.7*a;break;
        case 'diwali':x=1.1*w;y=-2.3*a;sx=1+.018*Math.sin(p*Math.PI*5);sy=1+.026*a;break;
        case 'holi':r=3.5*Math.sin(p*Math.PI*3)*(1-p);x=1.8*w;y=-1.4*a;break;
        case 'easter':x=2.8*w*(1-p);r=4.4*q;sy=1-.03*a;break;
        case 'valentine':y=-3.2*a;r=-2.4*a;sx=1-.03*a;break;
        case 'stpatrick':r=-3.7*Math.sin(p*Math.PI*3)*(1-p);x=2.4*a;y=-.7*a;break;
        case 'thanksgiving':x=-2.6*a;y=-4.2*a;r=2.9*w*(1-p);break;
        case 'carnival':r=5.1*w*(1-p);sx=1-.06*a;sy=1+.025*a;break;
        case 'oktoberfest':r=-4*a;y=-2.8*Math.sin(p*Math.PI*2)*Math.sin(p*Math.PI);sx=1-.04*a;break;
        case 'loykrathong':x=4.2*a;y=-1.8*Math.sin(p*Math.PI*3);r=2.7*w;break;
        case 'songkran':r=-3.2*a;y=2.4*a;x=-1.6*a+.9*w;break;
        case 'tulip':r=2.8*Math.sin(p*Math.PI*3)*(1-p);sy=1-.05*a;y=-1.1*a;break;
        case 'lavender':sx=1-.05*a;r=-2.2*w;y=-2.5*a;break;
        case 'sunflower':r=4.6*Math.sin(p*Math.PI*1.5)*(1-p);x=1.4*a;y=-.8*a;break;
        case 'rainy':y=-3.3*Math.abs(Math.sin(p*Math.PI*3))*(1-p);r=1.8*w;sx=1+.009*a;break;
        case 'snowfall':x=4.3*p*(1-p);r=-3.1*a;y=-1.9*Math.sin(p*Math.PI*2)*(1-p);break;
        case 'aurora':sx=1+.025*w;sy=1+.03*a;x=1.6*Math.sin(p*Math.PI*3)*(1-p);break;
        case 'meteor':r=4.8*a;x=2.2*w;y=-3.8*a;break;
        case 'solstice':r=-2.6*a;sx=1-.02*a;x=1.2*w;break;
        case 'ocean':r=4.1*q;y=-2.9*a;x=-1.3*a;break;
        case 'bamboo':r=3.9*Math.sin(p*Math.PI*3)*(1-p);x=1.7*w;sy=1-.01*a;break;
        case 'firefly':x=3.4*w;y=-3.6*a;r=1.2*Math.sin(p*Math.PI*3);break;
        case 'sailing':x=3*a;r=-3.6*w*(1-p);sy=1-.06*a;break;
        case 'music':r=1.7*Math.sin(p*Math.PI*6)*(1-p);y=-1.3*a;sx=1+.012*a;break;
        case 'bookday':r=-2.9*a;sx=1-.04*a;x=-1.9*w;break;
        case 'chess':x=1.8*Math.sin(p*Math.PI*2);y=-4.7*a;r=1.1*q;break;
        case 'dawn':y=-2.2*a;sx=1-.03*a;r=2.3*w;break;
        case 'nightmarket':r=2.1*q;sy=1-.02*a;x=.9*a;break;
      }
      // A tiny per-study settling arc distinguishes endpoints without a hold.
      // All samples remain bounded; the renderer interpolates by elapsed time.
      y-=Math.sin(p*Math.PI)*(index%3)*.13;
      const f=n=>Number(n.toFixed(5));
      return {offset:p,transform:`translate(${f(x)}px, ${f(y)}px) rotate(${f(r)}deg) scale(${f(sx)}, ${f(sy)})`,opacity};
    });
  }
  return Object.freeze({CATALOG,build,frames,activate});
});
