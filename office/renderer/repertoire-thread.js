/* A yarn creature describes observed work through bounded, tactile gestures.
 * Recipes are data: the shared owner controls every clock and interruption. */
(function (root, factory) {
  'use strict';
  const pack = factory();
  if (typeof module === 'object' && module.exports) module.exports = pack;
  else (root.OfficeCreatureRepertoires ||= {}).thread = pack;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const states = Object.fromEntries(['reading', 'searching', 'planning', 'coding', 'designing', 'testing', 'building', 'running', 'waiting-tool', 'waiting-user', 'error'].map(state => [state, []]));
  const C = { base: 'var(--ca-base)', shade: 'var(--ca-shade)', edge: 'var(--ca-edge)', light: 'var(--ca-light)' };
  const p = (d, fill = 'none', width = 1.2, extra = '') => `<path d="${d}" fill="${fill}" stroke-width="${width}" ${extra}/>`;
  const box = (x, y, w, h, r = 1, fill = C.light) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
  const ring = (x, y, r, fill = 'none') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
  // The outer SVG anchor never animates. Only its inner data-motion group does.
  const part = (name, x, y, art) => `<g transform="translate(${x} ${y})"><g class="cv-thread-part" data-motion="${name}">${art}</g></g>`;
  const hand = (name, x, y) => part(name, x, y, p('M-2.5 -4.5C-7 -2 -4 5 0 3.5C6 1 2.5 -4 -.8 -.8C-3 2.5 3.3 4.3 4.2 0', 'none', 2.1) + p('M-4 -2Q-2 -5 0 -3', 'none', .65, `stroke="${C.light}"`));
  const spool = (name, x, y, size = 1) => part(name, x, y, `<g transform="scale(${size})">${box(-6, -8, 12, 16, 2, C.shade)}${p('M-7 -8H7M-7 8H7M-5 -5L5 -2M-5 -1L5 2M-5 3L5 6', 'none', 1.6)}${ring(0, 0, 1.6, C.light)}</g>`);
  const needle = (name, x, y) => part(name, x, y, p('M-1 10L-1 -9Q0 -14 1 -9L1 10Z', C.light, .7) + p('M0 -9V-6', 'none', .6));
  const wheel = (name, x, y, r = 8) => part(name, x, y, ring(0, 0, r, C.base) + ring(0, 0, 1.8, C.shade) + p(`M0 -${r}V${r}M-${r} 0H${r}M-${r * .7} -${r * .7}L${r * .7} ${r * .7}M-${r * .7} ${r * .7}L${r * .7} -${r * .7}`, 'none', .8));
  const swatch = (name, x, y, w = 18, h = 14) => part(name, x, y, box(-w / 2, -h / 2, w, h, 1, C.base) + p(`M-${w / 2 - 2} -4H${w / 2 - 2}M-${w / 2 - 2} 0H${w / 2 - 2}M-${w / 2 - 2} 4H${w / 2 - 2}M-4 -${h / 2}V${h / 2}M1 -${h / 2}V${h / 2}M6 -${h / 2}V${h / 2}`, 'none', .7));
  const knot = (name, x, y) => part(name, x, y, p('M-8 1C-13 -9 8 -12 9 -3C11 7 -10 11 -8 1C-7 -7 11 -7 7 4C2 13 -8 -8 -2 -7C7 -6 -6 12 -7 4', 'none', 2.5) + p('M-7 -3Q-2 -8 3 -5', 'none', .75, `stroke="${C.light}"`));
  const strand = (name, x, y, d, width = 1.8) => part(name, x, y, p(d, 'none', width));
  const chart = (name, x, y, d) => part(name, x, y, box(-14, -10, 28, 20, 1, C.light) + p('M-10 -6H10M-10 -2H10M-10 2H10M-10 6H10M-6 -8V8M0 -8V8M6 -8V8', 'none', .45) + p(d, 'none', 1.3));
  const move = (name, steps, origin = 'center center', easing = 'organic') => ({ part: name, origin, easing, keyframes: [{ offset: 0, transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 }, ...steps.map(([offset, transform, opacity = 1]) => ({ offset, transform, opacity })), { offset: 1, transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 }] });
  const glow = (name, steps, initial = .5) => ({ part: name, origin: 'center center', easing: 'settle', keyframes: [{ offset: 0, transform: 'none', opacity: initial }, ...steps.map(([offset, opacity]) => ({ offset, transform: 'none', opacity })), { offset: 1, transform: 'none', opacity: initial }] });
  function add(state, slug, labelZh, labelEn, descriptionZh, beats, artwork, tracks, duration = 3400) {
    if (state === 'coding') {
      // A persistent input surface keeps every code variant legible as input,
      // while the upper row carrier changes how that input is handled.
      artwork += part('input-pad',0,8,p('M-21 -3H21L24 3H-24Z',C.light)+p('M-16 -1H16M-7 -2L-8 2M0 -2V2M7 -2L8 2','none',.65))
        + part('input-left',-7,2,p('M-1 -2C-5 -3 -5 4 -1 4C3 4 3 -1 0 0','none',1.8))
        + part('input-right',7,2,p('M1 -2C5 -3 5 4 1 4C-3 4 -3 -1 0 0','none',1.8));
      tracks = tracks.concat(move('input-left',[[.12,'translate(0px,-1px)'],[.2,'translate(0px,2px)'],[.28,'translate(0px,-1px)'],[.36,'translate(1px,2px)'],[.44,'translate(0px,-1px)'],[.52,'translate(-1px,2px)'],[.63,'translate(0px,-1px)'],[.72,'translate(0px,2px)'],[.84,'translate(0px,-1px)']]),move('input-right',[[.2,'translate(0px,-1px)'],[.28,'translate(0px,2px)'],[.36,'translate(0px,-1px)'],[.44,'translate(-1px,2px)'],[.52,'translate(0px,-1px)'],[.6,'translate(1px,2px)'],[.72,'translate(0px,-1px)'],[.8,'translate(0px,2px)'],[.89,'translate(0px,-1px)']]));
      descriptionZh += '两只短线指同时在下方输入垫持续交替敲入。';
      beats = beats.concat('双线指持续交替敲入输入垫');
    }
    // Thoughts live above the face; design work sits low on a shallow surface.
    // Anchors inside these material wrappers remain separate from WAAPI parts.
    const placement = state === 'planning' ? ' transform="translate(0 -22) scale(.5)"' : state === 'designing' ? ' transform="translate(0 5) scale(.8 .55)"' : '';
    states[state].push({ id: 'thread-' + state + '-' + slug, labelZh, labelEn, descriptionZh, beats, duration,
      markup: `<g class="cv-thread cv-${state}-${slug}"${placement} fill="${C.base}" stroke="${C.edge}" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round">${artwork}</g>`, tracks });
  }

  // READING: follow real marks, turn or compare their material carrier.
  add('reading', 'knitted-pages', '翻看针织册', 'Turn a knitted book', '线环手按住书脊，另一端翻过一页编织图，再沿行阅读。', ['压住书脊', '捏住右页', '翻页到左侧', '沿新行停读'],
    part('book', 0, -4, p('M-20 -10Q-9 -13 0 -8Q10 -13 20 -10V10Q9 7 0 11Q-10 7 -20 10Z', C.light) + p('M0 -8V11M-15 -5H-5M-15 0H-5M5 -5H15M5 0H15', 'none', .7)) + part('page', 1, -4, p('M0 -8Q10 -13 19 -10V10Q9 7 0 11Z', C.base) + p('M4 -4H14M4 1H14', 'none', .7)) + hand('turn', 22, 1) + strand('cursor', -14, -8, 'M0 0H7', 1.4),
    [move('turn', [[.14,'translate(-2px,-3px)'],[.35,'translate(-15px,-5px) rotate(-15deg)'],[.56,'translate(-16px,-2px)'],[.76,'translate(0px,0px)']]), move('page', [[.14,'scaleX(.98)'],[.35,'scaleX(.16)'],[.55,'scaleX(.98)'],[.8,'scaleX(1)']], 'left center'), move('cursor', [[.18,'translate(5px,0px)'],[.6,'translate(0px,5px)'],[.8,'translate(6px,5px)']])], 3800);
  add('reading', 'stitch-chart', '逐格读针谱', 'Read a stitch grid', '一根线头按列检查针谱，拐到下一行后停留。', ['抬起线头', '逐格横移', '换到下一行', '松弛停读'],
    chart('grid', 0, -7, 'M-10 -6L-6 -2L0 -6L6 -2L10 -6M-10 2L-6 6L0 2L6 6L10 2') + strand('pointer', -12, -12, 'M-4 7Q-5 0 0 0L4 0') + hand('support', 20, 3),
    [move('pointer', [[.13,'translate(0px,-1px)'],[.3,'translate(8px,0px)'],[.45,'translate(16px,0px)'],[.56,'translate(0px,8px)'],[.74,'translate(14px,8px)'],[.87,'translate(0px,8px)']]), move('support', [[.1,'translate(-1px,-1px)'],[.75,'translate(-1px,-1px)'],[.88,'translate(0px,0px)']])], 3600);
  add('reading', 'pattern-scroll', '展读花样卷', 'Unroll a pattern', '先展开软布卷的中段，再沿花样读完并收回松边。', ['握住卷轴', '展出中段', '沿花样移动', '收回松边'],
    part('scroll', 0, -5, box(-17,-9,34,19,2,C.light) + p('M-10 -4Q-5 -10 0 -4T10 -4M-10 3Q-5 -3 0 3T10 3', 'none', 1.1)) + spool('left-roll', -20,-5,.65) + spool('right-roll',20,-5,.65) + strand('reader',-12,-5,'M0 0H5',1.6),
    [move('scroll', [[.18,'scaleX(.9)'],[.35,'scaleX(1.07)'],[.76,'scaleX(1.07)'],[.9,'scaleX(.98)']]),move('right-roll',[[.18,'translate(-2px,0px) rotate(-8deg)'],[.35,'translate(2px,0px) rotate(14deg)'],[.76,'translate(2px,0px) rotate(14deg)']]),move('reader',[[.34,'translate(0px,0px)'],[.55,'translate(18px,0px)'],[.65,'translate(18px,6px)'],[.8,'translate(0px,6px)']])],4000);
  add('reading', 'fibre-swatch', '辨认织纹', 'Read a fibre swatch', '把织物抬起，指腹顺着经纬各扫一次，再放平。', ['托起织片', '顺经线触读', '横过纬线', '放平织片'],
    swatch('cloth',0,-6,30,20) + hand('feel',-18,-2) + strand('edge',14,4,'M0 -7V1Q2 5 5 2',1.4),
    [move('cloth',[[.18,'translate(0px,-3px) rotate(-3deg)'],[.64,'translate(0px,-3px) rotate(-3deg)'],[.84,'translate(0px,0px)']]),move('feel',[[.17,'translate(3px,-5px)'],[.35,'translate(3px,-12px)'],[.48,'translate(3px,-5px)'],[.66,'translate(21px,-5px)'],[.83,'translate(0px,0px)']]),move('edge',[[.25,'rotate(8deg)'],[.64,'rotate(8deg)'],[.84,'rotate(0deg)']], 'top center')],3500);
  add('reading', 'ribbon-bookmark', '循书签回读', 'Return to a ribbon marker', '轻拉书签找回段落，按住页角，再回读标记附近。', ['捏住书签', '轻拉定位', '压住页角', '回读标记'],
    part('card',0,-7,box(-17,-11,34,23,1,C.light)+p('M-12 -6H12M-12 -1H12M-12 4H8','none',.7)) + strand('bookmark',-7,-16,'M0 0V25L3 22L6 25V0',1.6) + hand('pull',-12,7) + strand('scan',0,-12,'M0 0H6',1.5),
    [move('bookmark',[[.16,'translate(0px,1px)'],[.3,'translate(0px,4px)'],[.48,'translate(0px,4px)'],[.7,'translate(0px,0px)']]),move('pull',[[.16,'translate(2px,-1px)'],[.3,'translate(2px,2px)'],[.48,'translate(2px,2px)'],[.76,'translate(0px,0px)']]),move('scan',[[.4,'translate(-8px,0px)'],[.62,'translate(6px,0px)'],[.77,'translate(-6px,5px)']])],3300);
  add('reading', 'braid-legend', '对照辫纹图例', 'Compare a braid legend', '分别举起两种辫纹，靠近图例比较交叠顺序。', ['展开图例', '举左边辫纹', '举右边辫纹', '并排对照'],
    part('legend',0,-20,box(-13,-7,26,13,1,C.light)+p('M-9 -3L-3 3L3 -3L9 3M-9 3L-3 -3L3 3L9 -3','none',1)) + strand('braid-a',-13,1,'M-5 -8L5 6M5 -8L-5 6M0 -9V7',2) + strand('braid-b',13,1,'M-6 -7Q4 -7 5 0T-5 7M5 -7Q-5 -7 -5 0T5 7',2) + hand('hold',0,6),
    [move('braid-a',[[.18,'translate(2px,-5px) rotate(8deg)'],[.42,'translate(2px,-5px) rotate(8deg)'],[.65,'translate(4px,-3px)']]),move('braid-b',[[.4,'translate(-2px,-5px) rotate(-8deg)'],[.65,'translate(-4px,-3px)'],[.82,'translate(-4px,-3px)']]),move('hold',[[.15,'translate(0px,-1px)'],[.82,'translate(0px,-1px)']])],3900);
  add('reading', 'margin-notes', '掀角看旁注', 'Lift a corner to read notes', '卷起纸角露出下面的小注，读完后把角轻轻放回。', ['托住主卡', '挑起卷角', '露出旁注', '把角放回'],
    part('note',12,-10,box(-8,-8,16,16,1,C.base)+p('M-5 -4H5M-5 0H5M-5 4H1','none',.7)) + part('sheet',-4,-7,box(-17,-11,33,23,1,C.light)+p('M-12 -6H8M-12 -1H8M-12 4H1','none',.7)) + part('corner',10,-12,p('M-8 -6H8V10Z',C.base)) + hand('lift',22,-2),
    [move('corner',[[.18,'rotate(-5deg)'],[.4,'rotate(-55deg) scaleX(.55)'],[.7,'rotate(-55deg) scaleX(.55)'],[.9,'rotate(-3deg)']], 'left top'),move('lift',[[.15,'translate(-3px,-2px)'],[.38,'translate(-5px,-8px) rotate(-12deg)'],[.7,'translate(-5px,-8px) rotate(-12deg)']]),glow('note',[[.28,.5],[.4,1],[.76,1],[.92,.5]],.5)],3700);
  add('reading', 'loop-index', '沿线圈目录读', 'Follow a loop index', '把目录环滑到当前页，再顺着连线读向正文。', ['靠近目录环', '滑环定位', '沿连线阅读', '环停在页侧'],
    part('pages',3,-5,box(-18,-12,32,24,1,C.light)+p('M-10 -7H9M-10 -2H9M-10 3H9M-10 8H4','none',.7)) + strand('binding',-19,-6,'M0 -12V13',1.8) + part('index',-19,-13,ring(0,0,3,C.base)) + strand('read-end',-13,-10,'M-4 0Q0 -3 4 0',1.5),
    [move('index',[[.16,'translate(0px,1px)'],[.4,'translate(0px,10px)'],[.7,'translate(0px,10px)'],[.88,'translate(0px,0px)']]),move('read-end',[[.28,'translate(0px,5px)'],[.48,'translate(12px,5px)'],[.66,'translate(20px,5px)'],[.82,'translate(0px,5px)']])],3200);
  add('reading', 'foldout-map', '展开线路折页', 'Read a folded route map', '把两翼折页摊开，线头沿路线经过三个节点后停住。', ['按住中缝', '展开两翼', '循线路读图', '收拢软边'],
    part('centre',0,-6,box(-6,-11,12,22,0,C.light)+p('M0 -8V7','none',1)) + part('wing-left',-6,-6,box(-13,-11,13,22,0,C.base)+p('M-10 6L-7 -4L0 -2','none',1.3)) + part('wing-right',6,-6,box(0,-11,13,22,0,C.base)+p('M0 -2L7 -7L10 5','none',1.3)) + part('reader',-14,0,ring(0,0,2,C.light)),
    [move('wing-left',[[.18,'scaleX(.7)'],[.35,'scaleX(1)'],[.78,'scaleX(1)']], 'right center'),move('wing-right',[[.18,'scaleX(.7)'],[.35,'scaleX(1)'],[.78,'scaleX(1)']], 'left center'),move('reader',[[.33,'translate(0px,0px)'],[.46,'translate(7px,-10px)'],[.58,'translate(14px,-8px)'],[.72,'translate(21px,-13px)'],[.85,'translate(24px,-1px)']])],4100);
  add('reading', 'sample-flipbook', '翻读线样卡', 'Browse yarn sample cards', '依次挑起不同孔位的线样卡，让卡片回落后再读下一张。', ['分开卡片', '抬起短线样', '换读长线样', '叠回卡架'],
    part('rack',0,4,p('M-23 5H23M-20 5V-17M20 5V-17','none',1.4)) + part('short-card',-10,-6,box(-7,-10,14,18,1,C.light)+ring(0,-6,1.5)+p('M-4 -1Q0 -6 4 -1Q0 5 -4 0','none',1.7)) + part('long-card',9,-6,box(-7,-10,14,18,1,C.base)+ring(0,-6,1.5)+p('M-4 -2Q0 -8 4 -2T-4 5','none',1.7)) + hand('reader',21,1),
    [move('short-card',[[.2,'translate(-2px,-4px) rotate(-8deg)'],[.38,'translate(-2px,-4px) rotate(-8deg)'],[.5,'translate(0px,0px)']]),move('long-card',[[.48,'translate(2px,-5px) rotate(8deg)'],[.73,'translate(2px,-5px) rotate(8deg)'],[.88,'translate(0px,0px)']]),move('reader',[[.16,'translate(-20px,-6px)'],[.4,'translate(-20px,-6px)'],[.51,'translate(-4px,-7px)'],[.75,'translate(-4px,-7px)']])],3800);

  // SEARCHING: different physical indexes are inspected, never fake results.
  add('searching','basket-sort','翻找线篮','Search a yarn basket','线端拨开篮中线圈，抬起中间一束查看后放回。',['拨开左束','探入线篮','抬起中束','放回并停看'],
    part('basket',0,3,p('M-23 -5H23L17 9H-17Z',C.shade)+p('M-17 -3L-11 7M-7 -3L-3 7M3 -3L7 7M13 -3L17 7','none',.6))+part('loop-a',-13,-4,ring(0,0,6,C.base)+ring(0,0,3))+part('loop-b',0,-5,ring(0,0,7,C.base)+p('M-4 -4L4 4M-4 0L2 6','none',.8))+part('loop-c',13,-4,ring(0,0,5,C.light))+hand('search',22,-1),
    [move('loop-a',[[.18,'translate(-3px,1px) rotate(-12deg)'],[.65,'translate(-3px,1px) rotate(-12deg)']]),move('loop-b',[[.3,'translate(0px,-1px)'],[.5,'translate(0px,-9px)'],[.66,'translate(0px,-9px)'],[.83,'translate(0px,0px)']]),move('search',[[.15,'translate(-6px,-5px)'],[.35,'translate(-19px,-5px)'],[.52,'translate(-19px,-12px)'],[.69,'translate(-19px,-12px)']])],3600);
  add('searching','tag-fan','扇开线签','Fan through thread tags','把挂在环上的线签扇开，逐张点看标签后收拢。',['扣住挂环','扇开三张线签','逐张点看','收拢线签'],
    ring(0,-25,4,C.light)+part('tag-left',0,-21,p('M-4 0H4L7 21H-7Z',C.base)+p('M-3 11H3M-3 15H2','none',.7))+part('tag-mid',0,-21,p('M-4 0H4L6 23H-6Z',C.light)+p('M-2 12H2M-2 17H3','none',.7))+part('tag-right',0,-21,p('M-4 0H4L8 20H-8Z',C.shade)+p('M-3 10H3M-3 14H3','none',.7))+hand('tap',22,2),
    [move('tag-left',[[.23,'rotate(35deg)'],[.76,'rotate(35deg)']], 'top center'),move('tag-right',[[.23,'rotate(-35deg)'],[.76,'rotate(-35deg)']], 'top center'),move('tap',[[.3,'translate(-30px,-6px)'],[.45,'translate(-22px,-4px)'],[.62,'translate(-12px,-7px)'],[.8,'translate(0px,0px)']])],3400);
  add('searching','peg-wall','逐钉找线','Inspect a pegboard','沿横排挂钉检查三束线，单独抬起最右束看背面。',['扫过挂钉','检查左束','抬起右束','挂回原钉'],
    part('board',0,-9,box(-25,-13,50,28,2,C.light)+p('M-18 -8V-5M0 -8V-5M18 -8V-5','none',2))+strand('left-hank',-18,-8,'M0 0C-7 0 -6 17 0 17C6 17 7 0 0 0',2)+strand('middle-hank',0,-8,'M0 0C-6 0 -5 14 0 14C5 14 6 0 0 0',2)+strand('right-hank',18,-8,'M0 0C-7 0 -6 18 0 18C6 18 7 0 0 0',2)+hand('probe',-23,3),
    [move('probe',[[.16,'translate(4px,-8px)'],[.37,'translate(22px,-8px)'],[.58,'translate(40px,-8px)'],[.76,'translate(40px,-10px)']]),move('right-hank',[[.58,'translate(0px,-1px)'],[.72,'translate(0px,-5px) rotate(12deg)'],[.84,'translate(0px,-5px) rotate(12deg)']])],3900);
  add('searching','shuttle-drawer','拉开梭子抽屉','Search a shuttle drawer','拉出浅抽屉，在不同形状的梭子之间触摸寻找，再推回。',['抓住抽屉环','拉出浅抽屉','摸过两种梭子','推回抽屉'],
    part('cabinet',0,-10,box(-23,-10,46,22,2,C.shade))+part('drawer',0,-5,box(-22,-7,44,17,1,C.base)+ring(0,6,2,C.light)+p('M-16 -1Q-10 -8 -4 -1Q-10 4 -16 -1M5 -4H16V2H5Z','none',1.1))+hand('search',21,4),
    [move('drawer',[[.15,'translate(0px,1px)'],[.34,'translate(0px,4px)'],[.74,'translate(0px,4px)'],[.9,'translate(0px,0px)']]),move('search',[[.14,'translate(-20px,1px)'],[.36,'translate(-20px,4px)'],[.5,'translate(-30px,-2px)'],[.65,'translate(-9px,-2px)'],[.82,'translate(-20px,1px)']])],3700);
  add('searching','reel-label','转向看轴签','Read a reel label','把线轴倾斜到标签可见的位置，线端绕到背侧查看再放正。',['托稳线轴','倾斜露签','绕到背侧查看','放正线轴'],
    spool('reel',0,-6,1.15)+part('label',6,-7,box(-3,-6,7,12,1,C.light)+p('M-1 -3H2M-1 0H2M-1 3H1','none',.6))+hand('turner',-15,0)+strand('probe',15,-9,'M-1 8Q-7 1 0 -3L5 -2',1.8),
    [move('reel',[[.2,'rotate(-12deg)'],[.65,'rotate(-12deg)'],[.85,'rotate(0deg)']]),move('label',[[.2,'translate(2px,-1px) rotate(-12deg)'],[.65,'translate(2px,-1px) rotate(-12deg)']]),move('probe',[[.35,'translate(3px,-2px) rotate(12deg)'],[.55,'translate(-4px,-5px) rotate(-16deg)'],[.76,'translate(0px,0px)']]),move('turner',[[.2,'translate(2px,-2px)'],[.65,'translate(2px,-2px)']])],3300);
  add('searching','sample-pocket','探查样片袋','Search sample pockets','掀起两只软袋袋口，把探线伸入不同深度后抽回。',['掀左袋口','探入左袋','换探右袋','线端收回'],
    part('pockets',0,-3,p('M-23 -13H-3V10H-23ZM3 -13H23V10H3Z',C.base)+p('M-23 -13Q-13 -4 -3 -13M3 -13Q13 -4 23 -13','none',1.1))+part('flap',-13,-16,p('M-10 0H10L0 9Z',C.light))+strand('probe',-13,-20,'M-4 -3Q1 -6 4 -1L0 8',2)+hand('hold',24,5),
    [move('flap',[[.16,'rotate(-35deg)'],[.38,'rotate(-35deg)'],[.52,'rotate(0deg)']], 'top center'),move('probe',[[.2,'translate(0px,4px)'],[.34,'translate(0px,12px)'],[.46,'translate(0px,0px)'],[.58,'translate(26px,0px)'],[.73,'translate(26px,10px)'],[.85,'translate(26px,0px)']])],4000);
  add('searching','colour-folio','比对线色册','Browse a colour folio','把线束样本移过三个布色窗，逐处停看后回到册边。',['托住色册','移到第一窗','跨过其余色窗','退回册边'],
    part('folio',0,-7,box(-24,-12,48,25,1,C.light)+box(-19,-7,9,12,1,C.base)+box(-4,-7,9,12,1,C.shade)+p('M11 -7H20V5H11Z',C.base,.8)+p('M12 -6L19 4M12 -2L16 4','none',.55))+strand('sample',-16,-4,'M-4 -6C4 -10 6 4 0 6C-7 8 -8 -3 -4 -6',2.1)+hand('hold',23,6),
    [move('sample',[[.16,'translate(1px,0px)'],[.35,'translate(15px,0px)'],[.52,'translate(15px,0px)'],[.69,'translate(30px,0px)'],[.83,'translate(30px,0px)']])],3500);
  add('searching','under-coil','找线圈底部','Look beneath a coil','把外圈轻抬成拱，探线在底部扫过，再让外圈落回。',['托住外圈','抬成小拱','探看圈底','轻放外圈'],
    part('base',0,4,p('M-24 6Q0 10 24 6','none',1.3))+part('coil',0,-5,p('M-17 3C-26 -11 23 -16 20 0C18 15 -19 11 -17 3C-15 -5 17 -10 14 1C12 8 -10 7 -10 1', 'none',2.2))+hand('lift',-23,1)+strand('probe',18,5,'M0 0Q-8 -6 -15 -1',1.8),
    [move('coil',[[.2,'translate(0px,-5px) rotate(-4deg)'],[.68,'translate(0px,-5px) rotate(-4deg)'],[.86,'translate(0px,0px)']]),move('lift',[[.2,'translate(3px,-5px)'],[.68,'translate(3px,-5px)']]),move('probe',[[.33,'translate(-3px,-2px)'],[.52,'translate(-15px,-2px)'],[.7,'translate(0px,0px)']])],3700);
  add('searching','pattern-tabs','拨查折叠索引','Search folded pattern tabs','顺次拨动高低不同的索引页，让探线停在中间凹口。',['拨左索引','拨高索引','停在中间凹口','索引归位'],
    part('tab-a',-16,-6,p('M-7 -9H0L2 -5H7V13H-7Z',C.base)+p('M-4 0H4M-4 4H2','none',.7))+part('tab-b',0,-10,p('M-7 -9H0L2 -5H7V17H-7Z',C.light)+p('M-4 1H4M-4 5H3','none',.7))+part('tab-c',16,-4,p('M-7 -9H0L2 -5H7V11H-7Z',C.shade))+strand('probe',-18,-19,'M-3 5Q-4 -2 2 -1',1.9),
    [move('tab-a',[[.17,'translate(0px,-3px) rotate(-5deg)'],[.34,'translate(0px,-3px) rotate(-5deg)'],[.48,'translate(0px,0px)']]),move('tab-b',[[.4,'translate(0px,-3px)'],[.68,'translate(0px,-3px)']]),move('probe',[[.18,'translate(0px,0px)'],[.41,'translate(18px,-2px)'],[.7,'translate(18px,1px)'],[.85,'translate(0px,0px)']])],3200);
  add('searching','strand-trace','追查线的去向','Trace a strand through loops','沿交错的三只圈追踪一根线，依次抬起遮挡的线桥再放回。',['找到起端','抬起首个线桥','沿线追到末端','放回线桥'],
    part('loops',0,-7,ring(-15,0,7)+ring(0,0,7)+ring(15,0,7))+strand('route',0,-7,'M-25 6Q-15 -12 -7 0T10 0T25 -5',2)+strand('bridge',-9,-10,'M-5 6Q0 -5 5 6',2.3)+part('pointer',-24,0,ring(0,0,2,C.light)),
    [move('bridge',[[.28,'translate(0px,-4px)'],[.66,'translate(0px,-4px)']]),move('pointer',[[.16,'translate(3px,-4px)'],[.35,'translate(13px,-9px)'],[.5,'translate(24px,-3px)'],[.67,'translate(37px,-8px)'],[.83,'translate(46px,-5px)']])],4100);

  // PLANNING: arrange alternatives and relationships without claiming progress.
  add('planning','pin-route','用线排路线','Lay a route between pins','在软板上的三只钉之间试摆线段，留出末端的选择空间。',['碰触起点钉','试接中间点','拉向末端钉','留线停想'],
    part('board',0,-9,box(-25,-16,50,31,2,C.light)+ring(-17,5,2,C.shade)+ring(0,-7,2,C.shade)+ring(17,5,2,C.shade))+strand('route-a',-17,-4,'M0 0Q8 -15 17 -12',1.8)+strand('route-b',0,-16,'M0 0Q15 0 17 12',1.8)+hand('plan',-23,2),
    [move('route-a',[[.2,'rotate(-7deg)'],[.4,'rotate(0deg)'],[.8,'rotate(0deg)']], 'left bottom'),move('route-b',[[.35,'rotate(12deg)'],[.58,'rotate(0deg)'],[.8,'rotate(0deg)']], 'left top'),move('plan',[[.16,'translate(6px,-6px)'],[.37,'translate(23px,-17px)'],[.58,'translate(40px,-6px)'],[.78,'translate(37px,-3px)']])],4000);
  add('planning','milestone-coils','摆放线圈阶段','Arrange milestone coils','把大小不同的三只线圈排出先后，反复比较中间位置。',['拉开线圈','移出中间圈','比较间距','保留间隙'],
    part('baseline',0,6,p('M-26 0H26','none',.8))+part('small',-18,-1,ring(0,0,4,C.light))+part('medium',0,-5,ring(0,0,7,C.base)+ring(0,0,3))+part('large',18,-9,ring(0,0,9,C.shade)+ring(0,0,5))+hand('arrange',-23,-1),
    [move('small',[[.2,'translate(2px,0px)'],[.75,'translate(2px,0px)']]),move('medium',[[.3,'translate(-5px,-4px)'],[.48,'translate(3px,-4px)'],[.68,'translate(0px,0px)']]),move('arrange',[[.17,'translate(5px,-4px)'],[.37,'translate(20px,-8px)'],[.55,'translate(26px,-8px)'],[.78,'translate(0px,0px)']])],3500);
  add('planning','branch-braid','试分两条辫路','Explore a braided fork','线端从一个起点分向两只环，分别探看，再停在分叉处。',['整理起线','试向上支路','试向下支路','回到分叉停想'],
    strand('fork',-22,-7,'M0 0H17Q28 -17 42 -13M17 0Q28 17 42 13',2)+ring(20,-20,4,C.light)+ring(20,6,4,C.base)+part('choice',-5,-7,ring(0,0,2.4,C.light))+hand('anchor',-24,3),
    [move('choice',[[.16,'translate(0px,0px)'],[.36,'translate(22px,-13px)'],[.5,'translate(0px,0px)'],[.7,'translate(22px,13px)'],[.86,'translate(0px,0px)']]),move('anchor',[[.15,'translate(0px,-2px)'],[.85,'translate(0px,-2px)']])],3800);
  add('planning','measure-span','估量线段跨度','Estimate a span','在刻度带上分开两只线环，比较跨度后把松端折回。',['展开刻度带','分开两只线环','比较跨度','折回松端'],
    part('tape',0,-4,box(-26,-5,52,10,1,C.light)+p('M-20 -5V-1M-14 -5V2M-8 -5V-1M-2 -5V2M4 -5V-1M10 -5V2M16 -5V-1M22 -5V2','none',.6))+part('left-stop',-13,-7,ring(0,0,4))+part('right-stop',6,-7,ring(0,0,4))+strand('fold',23,3,'M0 -6Q7 0 0 6L-6 4',1.8),
    [move('left-stop',[[.2,'translate(-5px,0px)'],[.66,'translate(-5px,0px)']]),move('right-stop',[[.3,'translate(8px,0px)'],[.66,'translate(8px,0px)']]),move('fold',[[.62,'rotate(18deg)'],[.82,'rotate(-5deg)']], 'top center')],3400);
  add('planning','dependency-rings','套环想依赖','Arrange dependency rings','先把一只环靠近另两只，试过两种套接位置后保持分离。',['举起中央环','靠近左环','靠近右环','保持分离比较'],
    part('left',-17,-8,ring(0,0,7,C.base))+part('right',17,-8,ring(0,0,7,C.light))+part('link',0,-22,ring(0,0,6))+strand('loose',0,0,'M-18 4Q0 11 18 4',1.6)+hand('lift',0,-29),
    [move('link',[[.18,'translate(0px,2px)'],[.36,'translate(-10px,9px) rotate(-15deg)'],[.55,'translate(10px,9px) rotate(15deg)'],[.75,'translate(0px,5px)']]),move('lift',[[.18,'translate(0px,2px)'],[.36,'translate(-10px,9px)'],[.55,'translate(10px,9px)'],[.75,'translate(0px,5px)']])],3900);
  add('planning','strip-sequence','排列针段顺序','Order stitch segments','把三段不同针法的软条错位排放，再拉齐起始边比较。',['分开软条','调整中段先后','拉齐起始边','停看排列'],
    part('strip-a',-9,-20,box(-15,-3,30,6,1,C.base)+p('M-11 0L-7 -2L-3 2L1 -2L5 2L9 -2','none',.6))+part('strip-b',4,-10,box(-15,-3,30,6,1,C.light)+p('M-10 -2V2M-5 -2V2M0 -2V2M5 -2V2M10 -2V2','none',.6))+part('strip-c',-4,0,box(-15,-3,30,6,1,C.shade)+p('M-11 0H11','none',1.2))+hand('align',22,4),
    [move('strip-b',[[.24,'translate(-7px,0px)'],[.48,'translate(-12px,0px)'],[.74,'translate(-12px,0px)']]),move('strip-c',[[.38,'translate(-5px,0px)'],[.74,'translate(-5px,0px)']]),move('align',[[.2,'translate(-1px,-13px)'],[.42,'translate(-8px,-13px)'],[.62,'translate(-8px,-3px)'],[.8,'translate(0px,0px)']])],3600);
  add('planning','patch-layout','试排布片','Plan a patch layout','在空框内轮流摆三片不同形状的针织布，不缝合它们。',['留出空框','摆入方片','试放三角与圆片','拉开观察'],
    part('frame',0,-7,p('M-25 -16H25V17H-25Z','none',1.2))+part('square',-14,-12,box(-7,-6,14,12,1,C.base))+part('triangle',13,-13,p('M0 -8L9 7H-9Z',C.light))+part('round',2,2,ring(0,0,6,C.shade))+hand('arrange',23,4),
    [move('square',[[.18,'translate(4px,3px) rotate(-5deg)'],[.66,'translate(4px,3px) rotate(-5deg)']]),move('triangle',[[.35,'translate(-4px,2px) rotate(10deg)'],[.66,'translate(-4px,2px) rotate(10deg)']]),move('round',[[.5,'translate(0px,-2px)'],[.75,'translate(0px,-2px)']]),move('arrange',[[.2,'translate(-29px,-12px)'],[.38,'translate(-13px,-13px)'],[.55,'translate(-21px,-2px)'],[.82,'translate(0px,0px)']])],4100);
  add('planning','slack-model','用松线试形','Model with a slack strand','把松线围在两只钉外，试出一个宽环与一个窄环的关系。',['扣住两只钉','抬起松线中段','试宽窄两环','松手留形'],
    part('pins',0,-7,ring(-16,0,2,C.light)+ring(16,0,2,C.light))+strand('wide-loop',-12,-5,'M-4 -2C-18 -22 17 -23 17 -6C17 7 -2 9 -4 -2',2)+strand('narrow-loop',11,-7,'M5 0C-5 -16 -12 -13 -10 -1C-9 9 5 10 5 0',1.8)+hand('shape',0,-24),
    [move('wide-loop',[[.22,'scaleX(.9) rotate(-4deg)'],[.55,'scaleX(1.06) rotate(2deg)'],[.8,'scaleX(1)']]),move('narrow-loop',[[.35,'translate(2px,-2px) scaleX(.85)'],[.62,'translate(2px,-2px) scaleX(.85)']]),move('shape',[[.2,'translate(-6px,-2px)'],[.45,'translate(6px,-1px)'],[.72,'translate(0px,3px)']])],3800);
  add('planning','layer-overlay','叠看花样层','Compare pattern layers','把透明感的网格片移到针谱上，对照位置后错开留出视线。',['抬起网格层','移到针谱上','停看交点','错开网格层'],
    chart('base-chart',-5,-7,'M-10 4L-3 -5L4 4L10 -5')+part('overlay',8,-14,box(-14,-10,28,20,1,'none')+p('M-10 -6H10M-10 0H10M-10 6H10M-6 -8V8M0 -8V8M6 -8V8','none',.6))+hand('slide',23,-4),
    [move('overlay',[[.18,'translate(0px,-2px)'],[.42,'translate(-12px,5px)'],[.7,'translate(-12px,5px)'],[.88,'translate(-3px,0px)']]),move('slide',[[.18,'translate(0px,-2px)'],[.42,'translate(-12px,5px)'],[.7,'translate(-12px,5px)']])],3500);
  add('planning','spool-balance','比较两轴余量','Compare two spool reserves','把两只线轴放在软杆两侧，压低一侧再回到中间估量。',['托住软杆','压低左侧','比较右侧余量','回中间停想'],
    part('stand',0,5,p('M-8 6L0 -7L8 6Z',C.shade))+part('beam',0,-5,p('M-22 0H22','none',2))+spool('left-spool',-18,-12,.65)+spool('right-spool',18,-12,.8)+hand('balance',-23,2),
    [move('beam',[[.23,'rotate(-7deg)'],[.47,'rotate(6deg)'],[.72,'rotate(0deg)']]),move('left-spool',[[.23,'translate(0px,2px)'],[.47,'translate(0px,-2px)'],[.72,'translate(0px,0px)']]),move('right-spool',[[.23,'translate(0px,-2px)'],[.47,'translate(0px,2px)'],[.72,'translate(0px,0px)']]),move('balance',[[.2,'translate(1px,-3px)'],[.5,'translate(1px,-3px)']])],3700);

  // CODING: construction of structured stitches, distinct from test and run.
  add('coding','soft-keyboard','线环敲键','Type with looped hands','两只线环手交替落在不同键区，松线随抬手回弹。',['抬起左线环','交替接触键区','双手离键停想','松线回落'],
    part('keys',0,4,p('M-23 -4H23L27 6H-27Z',C.light)+p('M-18 -1H18M-21 3H21M-12 -3L-13 4M-4 -3L-4 4M4 -3L4 4M12 -3L13 4','none',.65))+hand('left',-12,-1)+hand('right',12,-1)+strand('tail',-21,4,'M0 -6Q-8 -1 -3 5L4 4',1.6),
    [move('left',[[.12,'translate(0px,-2px)'],[.22,'translate(1px,2px)'],[.32,'translate(0px,-1px)'],[.44,'translate(2px,2px)'],[.63,'translate(0px,-4px)'],[.78,'translate(0px,-4px)']]),move('right',[[.22,'translate(0px,-2px)'],[.33,'translate(-1px,2px)'],[.44,'translate(0px,-1px)'],[.54,'translate(-2px,2px)'],[.66,'translate(0px,-3px)'],[.8,'translate(0px,-3px)']]),move('tail',[[.25,'rotate(-8deg)'],[.5,'rotate(7deg)'],[.8,'rotate(0deg)']], 'top center')],3000);
  add('coding','ribbon-input','穿送代码带','Feed a stitched ribbon','捏住带孔软条，推进一段，停住对齐孔位，再回收松端。',['夹住软条','推进一段','对齐孔位','松端折回'],
    part('slot',0,-5,box(-17,-7,34,16,2,C.shade)+p('M-12 0H12','none',2))+part('ribbon',0,-9,box(-6,-19,12,33,1,C.light)+p('M-3 -15H3M-3 -10H1M-3 -5H3M-3 0H0M-3 5H3','none',.8)+ring(-4,-15,.6)+ring(4,-15,.6))+hand('feed',12,-17)+strand('return',0,7,'M-5 -1Q-5 6 5 4L11 1',1.8),
    [move('ribbon',[[.18,'translate(0px,1px)'],[.38,'translate(0px,5px)'],[.65,'translate(0px,5px)'],[.86,'translate(0px,0px)']]),move('feed',[[.17,'translate(-3px,-1px)'],[.38,'translate(-3px,3px)'],[.65,'translate(-3px,3px)']]),move('return',[[.4,'rotate(8deg)'],[.69,'rotate(8deg)'],[.87,'rotate(0deg)']], 'left top')],3400);
  add('coding','paired-needles','双针交接','Interleave paired needles','两根针先交叉挑线，再分开拉出新的一段织纹。',['一针压低','另一针穿过线环','双针分开','新织纹停留'],
    swatch('work',0,4,24,12)+needle('left-needle',-7,-11)+needle('right-needle',7,-11)+strand('loop',0,-4,'M-12 0Q0 -12 12 0Q1 6 -12 0',2)+hand('hold',-22,2),
    [move('left-needle',[[.15,'rotate(18deg)'],[.35,'translate(3px,1px) rotate(28deg)'],[.6,'translate(-2px,-2px) rotate(8deg)'],[.8,'rotate(0deg)']], 'bottom center'),move('right-needle',[[.28,'rotate(-18deg)'],[.46,'translate(-3px,-2px) rotate(-28deg)'],[.63,'translate(2px,-3px) rotate(-8deg)']], 'bottom center'),move('loop',[[.35,'scaleX(.85) translateY(-2px)'],[.63,'scaleX(1.08)'],[.8,'scaleX(1)']])],3700);
  add('coding','logic-loom','交织逻辑网','Weave a logic grid','梭子交替经过竖线两侧，压条落下整理刚织的一行。',['抬开经线','梭子穿过','压条整理一行','梭子回到边侧'],
    part('loom',0,-7,p('M-24 -18V18M24 -18V18M-24 -17H24M-24 17H24M-16 -17V17M-8 -17V17M0 -17V17M8 -17V17M16 -17V17','none',1))+part('shuttle',-17,-8,p('M-7 0Q0 -6 7 0Q0 6 -7 0Z',C.base)+ring(0,0,1,C.light))+part('beater',0,-17,p('M-22 0H22M-16 0V5M-8 0V5M0 0V5M8 0V5M16 0V5','none',1.5))+strand('weft',0,1,'M-22 0Q-10 -3 0 0T22 0',1.8),
    [move('shuttle',[[.15,'translate(0px,-2px)'],[.42,'translate(34px,-2px)'],[.57,'translate(34px,4px)'],[.82,'translate(0px,4px)']]),move('beater',[[.43,'translate(0px,0px)'],[.56,'translate(0px,10px)'],[.7,'translate(0px,0px)']]),move('weft',[[.46,'translate(0px,2px)'],[.7,'translate(0px,2px)']])],4000);
  add('coding','function-wrap','绕钉构成线环','Wrap a reusable loop','把线头绕过方钉，拉出一个可重复穿过的松环再停住。',['托起线头','绕过方钉','拉出松环','保持入口'],
    part('peg',0,-10,box(-6,-9,12,18,2,C.light))+strand('wrap',0,-8,'M-20 12Q-15 -14 0 -13Q17 -12 15 2Q13 12 -4 8Q-12 5 -7 -2',2)+hand('end',-21,3)+part('gate',13,-2,ring(0,0,4,'none')),
    [move('end',[[.18,'translate(3px,-8px)'],[.38,'translate(20px,-20px)'],[.57,'translate(36px,-8px)'],[.75,'translate(30px,0px)']]),move('wrap',[[.28,'scaleX(.93)'],[.57,'scaleX(1.05)'],[.78,'scaleX(1)']]),move('gate',[[.56,'translate(1px,0px) scale(.94)'],[.8,'translate(1px,0px) scale(.94)']])],3800);
  add('coding','nested-frames','内层输入框','Enter a nested input frame','把小输入框送入外层行框，线端沿内框定位后退回。',['扶住外层行框','送入小输入框','沿内框定位','退回线端'],
    part('outer',0,-8,p('M-24 -15H24V17H-24Z','none',2))+part('inner',0,-8,p('M-10 -7H10V9H-10Z','none',1.6))+part('cursor',-12,-15,ring(0,0,2,C.light))+hand('steady',-25,3),
    [move('inner',[[.2,'translate(0px,-3px) scale(.95)'],[.4,'translate(0px,0px)'],[.78,'translate(0px,0px)']]),move('cursor',[[.36,'translate(2px,0px)'],[.5,'translate(22px,0px)'],[.64,'translate(22px,16px)'],[.78,'translate(2px,16px)']]),move('steady',[[.18,'translate(1px,-2px)'],[.8,'translate(1px,-2px)']])],3600);
  add('coding','stitch-edit','穿改一行针目','Edit a row of stitches','用钩针挑起一行中间的线桥，重新穿过邻近针目再放松。',['定位中间针目','钩起线桥','穿过相邻针目','放松当前行'],
    swatch('patch',0,-3,38,20)+part('hook',-2,-20,p('M0 12V-7Q0 -12 5 -10Q8 -8 3 -6','none',1.8))+strand('bridge',-2,-5,'M-8 0Q0 -7 8 0',2.2)+hand('feed',21,2),
    [move('hook',[[.16,'translate(0px,2px) rotate(-6deg)'],[.34,'translate(0px,7px)'],[.5,'translate(5px,0px) rotate(18deg)'],[.72,'translate(8px,5px) rotate(10deg)'],[.87,'translate(0px,0px)']]),move('bridge',[[.37,'translate(0px,-4px) scaleX(.9)'],[.58,'translate(5px,-2px)'],[.8,'translate(0px,0px)']]),move('feed',[[.35,'translate(-2px,-2px)'],[.65,'translate(-2px,-2px)']])],3500);
  add('coding','branch-join','支路输入接续','Interleave branch input','两条输入行先分开，在行夹附近交替送入，保留可见的交接处。',['分开两条输入行','先送上行','再送下行','停在交接处'],
    strand('top',-23,-17,'M0 0Q12 0 23 10L41 10',2)+strand('bottom',-23,3,'M0 0Q12 0 23 -10L41 -10',2)+part('clip',4,-7,p('M-4 -8H4V8H-4Z',C.light)+p('M-2 -4H2M-2 0H2M-2 4H2','none',.7))+hand('top-hand',-23,-16)+hand('bottom-hand',-23,4),
    [move('top',[[.17,'translate(0px,-2px)'],[.38,'translate(3px,1px)'],[.68,'translate(3px,1px)']]),move('bottom',[[.33,'translate(0px,2px)'],[.56,'translate(3px,-1px)'],[.76,'translate(3px,-1px)']]),move('top-hand',[[.17,'translate(0px,-2px)'],[.38,'translate(3px,1px)'],[.68,'translate(3px,1px)']]),move('bottom-hand',[[.33,'translate(0px,2px)'],[.56,'translate(3px,-1px)'],[.76,'translate(3px,-1px)']])],3700);
  add('coding','delimiter-clamps','调整成对线夹','Set paired delimiters','把左右两只弯夹靠向线束，压住边界后抬开一点重新对齐。',['分开两只弯夹','靠向线束边缘','轻压边界','抬开重新对齐'],
    strand('bundle',0,-6,'M-10 -6H10M-12 0H12M-10 6H10',1.8)+part('left-clip',-19,-6,p('M5 -12H-2Q-6 0 -2 12H5','none',2.2))+part('right-clip',19,-6,p('M-5 -12H2Q6 0 2 12H-5','none',2.2))+hand('left-grip',-24,3)+hand('right-grip',24,3),
    [move('left-clip',[[.2,'translate(4px,0px)'],[.46,'translate(4px,0px)'],[.62,'translate(2px,-2px)'],[.8,'translate(4px,0px)']]),move('right-clip',[[.27,'translate(-4px,0px)'],[.46,'translate(-4px,0px)'],[.62,'translate(-2px,-2px)'],[.8,'translate(-4px,0px)']]),move('left-grip',[[.2,'translate(3px,-1px)'],[.8,'translate(3px,-1px)']]),move('right-grip',[[.27,'translate(-3px,-1px)'],[.8,'translate(-3px,-1px)']])],3200);
  add('coding','bundle-order','整理输入行束','Order input rows','把三根输入行线送入行梳，再沿一侧拉齐，留在行梳中停顿。',['分开输入行','压入行梳','沿一侧拉齐','留在行梳停想'],
    part('comb',0,-5,p('M-23 7H23M-20 7V-8M-12 7V-8M-4 7V-8M4 7V-8M12 7V-8M20 7V-8','none',1.5))+strand('strand-a',0,-12,'M-22 -1Q-4 -5 22 -1',1.6)+strand('strand-b',0,-6,'M-22 0Q4 5 22 0',1.6)+strand('strand-c',0,0,'M-22 1Q-3 -4 22 1',1.6)+hand('pull',23,2),
    [move('strand-a',[[.2,'translate(0px,2px)'],[.55,'translate(2px,2px)'],[.8,'translate(2px,2px)']]),move('strand-b',[[.3,'translate(0px,-1px)'],[.55,'translate(2px,-1px)'],[.8,'translate(2px,-1px)']]),move('strand-c',[[.39,'translate(0px,-2px)'],[.55,'translate(2px,-2px)'],[.8,'translate(2px,-2px)']]),move('pull',[[.5,'translate(2px,-2px)'],[.79,'translate(2px,-2px)']])],3300);

  // DESIGNING: form a visible contour, texture or edge with real yarn tools.
  add('designing','contour-board','用线描轮廓','Shape a yarn contour','线头沿软板上弯曲的外框推移，调整上缘再停看轮廓。',['扶住软板','沿左缘推线','调整上缘弧度','退开看轮廓'],
    part('board',0,-9,box(-25,-17,50,34,2,C.light))+strand('outline',0,-8,'M-18 8C-24 -15 15 -25 19 -3C23 16 -9 18 -18 8',2.2)+hand('shape',-22,0)+part('pin',13,-20,ring(0,0,1.8,C.shade)),
    [move('shape',[[.16,'translate(1px,-4px)'],[.36,'translate(8px,-17px)'],[.58,'translate(30px,-20px)'],[.8,'translate(40px,-3px)']]),move('outline',[[.38,'scaleX(.96) scaleY(1.03)'],[.66,'scaleX(1.02) scaleY(.98)'],[.84,'scaleX(1) scaleY(1)']]),move('pin',[[.53,'translate(1px,-1px)'],[.7,'translate(1px,-1px)']])],3900);
  add('designing','rosette-fan','摆出线瓣纹','Arrange a yarn rosette','把三只长环围向中心，小针压住交点，再松开外缘。',['展开长线环','围向中心','压住交点','松开外缘'],
    part('petal-a',0,-10,p('M0 6C-16 1 -15 -19 -4 -15C4 -11 0 6 0 6','none',2))+part('petal-b',0,-10,p('M0 6C0 -18 18 -20 15 -7C13 1 0 6 0 6','none',2))+part('petal-c',0,-10,p('M0 6C18 0 22 14 9 15C1 16 0 6 0 6','none',2))+part('pin',0,-4,ring(0,0,2.5,C.light))+needle('press',0,-18),
    [move('petal-a',[[.2,'rotate(9deg)'],[.65,'rotate(9deg)']], 'bottom right'),move('petal-b',[[.32,'rotate(-9deg)'],[.65,'rotate(-9deg)']], 'bottom left'),move('petal-c',[[.43,'rotate(-8deg)'],[.7,'rotate(-8deg)']], 'top left'),move('press',[[.5,'translate(0px,4px)'],[.65,'translate(0px,4px)'],[.82,'translate(0px,0px)']])],3700);
  add('designing','cable-pattern','交错辫纹样','Design a cable pattern','用双钩把两束线交错一次，压平交点并留出松弛弧。',['挑起左线束','换到右线束上方','压平交点','保留松弧'],
    part('ground',0,-7,box(-24,-14,48,28,2,C.light))+strand('left-cable',0,-7,'M-18 -8C0 -10 -2 10 18 8',2.8)+strand('right-cable',0,-7,'M18 -8C0 -10 2 10 -18 8',2.8)+part('hook',-10,-19,p('M0 9V-3Q1 -9 6 -6Q9 -3 4 -2','none',1.5))+hand('press',12,2),
    [move('left-cable',[[.22,'translate(0px,-2px) rotate(3deg)'],[.48,'translate(1px,-1px)'],[.76,'translate(0px,0px)']]),move('right-cable',[[.39,'translate(0px,2px) rotate(-3deg)'],[.64,'translate(0px,0px)']]),move('hook',[[.18,'translate(-4px,4px)'],[.4,'translate(12px,0px) rotate(18deg)'],[.68,'translate(19px,5px)']]),move('press',[[.6,'translate(-8px,-2px)'],[.77,'translate(-8px,-2px)']])],3600);
  add('designing','fringe-comb','梳出流苏边','Shape a fringed edge','梳齿从散线末端穿过，再横向整理出不等长的边缘。',['压住织边','梳齿接近散线','穿过线端','横移整理边缘'],
    swatch('cloth',0,-20,38,12)+strand('fringe',0,-6,'M-17 -8V9M-10 -8V6M-3 -8V11M4 -8V8M11 -8V5M18 -8V10',1.7)+part('comb',0,2,p('M-21 6H21M-17 6V-5M-10 6V-5M-3 6V-5M4 6V-5M11 6V-5M18 6V-5','none',1.4))+hand('steady',-24,-18),
    [move('comb',[[.18,'translate(0px,-5px)'],[.43,'translate(0px,3px)'],[.6,'translate(2px,3px)'],[.82,'translate(-2px,1px)']]),move('fringe',[[.3,'scaleX(.97)'],[.55,'scaleX(1.03)'],[.8,'scaleX(1)']]),move('steady',[[.12,'translate(1px,1px)'],[.8,'translate(1px,1px)']])],3400);
  add('designing','pompom-sculpt','修整绒球轮廓','Shape a pompom silhouette','把线圈轻抬旋看，双弯片在外侧比量轮廓，保持完整绒球。',['托起绒球','转看侧边','双弯片比量外缘','放回托座'],
    part('pompom',0,-10,p('M-13 1L-15 -5L-9 -8L-7 -15L0 -12L6 -16L9 -9L15 -7L12 0L15 5L7 8L2 12L-3 8L-10 10L-10 4Z',C.base)+p('M-9 -4L7 5M-5 -10L4 8M-11 2L9 -5','none',.8))+part('left-curve',-21,-8,p('M3 -11Q-5 0 3 11','none',1.8))+part('right-curve',21,-8,p('M-3 -11Q5 0 -3 11','none',1.8))+part('stand',0,8,p('M-14 1Q0 -4 14 1','none',1.4)),
    [move('pompom',[[.2,'translate(0px,-2px) rotate(-9deg)'],[.48,'translate(0px,-2px) rotate(9deg)'],[.76,'translate(0px,0px)']]),move('left-curve',[[.4,'translate(2px,0px)'],[.65,'translate(2px,0px)']]),move('right-curve',[[.4,'translate(-2px,0px)'],[.65,'translate(-2px,0px)']])],3800);
  add('designing','woven-tile','试织方形纹样','Try a woven tile pattern','把斜线片叠在方形底纹上，用钩针沿两个相邻边整理。',['摆正方形底纹','叠上斜线片','整理上边与右边','提针看纹样'],
    swatch('base',-2,-8,32,26)+part('diagonal',-2,-8,p('M-14 3L-3 -11M-13 10L7 -11M-4 11L13 -9M5 11L14 -1','none',1.6))+part('hook',-16,-24,p('M0 8V-2Q0 -7 4 -5Q6 -3 3 -2','none',1.5))+hand('hold',-23,4),
    [move('diagonal',[[.2,'translate(1px,-2px)'],[.4,'translate(0px,0px)'],[.8,'translate(0px,0px)']]),move('hook',[[.22,'translate(3px,1px)'],[.45,'translate(26px,1px) rotate(10deg)'],[.7,'translate(29px,20px) rotate(25deg)'],[.87,'translate(25px,-2px)']]),move('hold',[[.2,'translate(1px,-1px)'],[.8,'translate(1px,-1px)']])],4000);
  add('designing','curve-tension','拉线试曲率','Tune a tension curve','两端轻拉悬线，中间钩针改变弧高，再恢复宽松曲线。',['固定两端','钩住曲线中段','改变弧高','恢复宽松曲线'],
    part('pins',0,-10,ring(-22,0,2,C.light)+ring(22,0,2,C.light))+strand('curve',0,-10,'M-22 0Q0 29 22 0',2.2)+part('hook',0,-9,p('M0 -13V4Q0 9 5 7Q8 5 3 4','none',1.5))+hand('left-end',-24,-10)+hand('right-end',24,-10),
    [move('curve',[[.26,'scaleY(.7)'],[.52,'scaleY(.48)'],[.72,'scaleY(.8)']], 'top center'),move('hook',[[.24,'translate(0px,3px)'],[.52,'translate(0px,-1px)'],[.73,'translate(0px,4px)']]),move('left-end',[[.25,'translate(-1px,0px)'],[.62,'translate(-1px,0px)']]),move('right-end',[[.25,'translate(1px,0px)'],[.62,'translate(1px,0px)']])],3500);
  add('designing','stencil-loop','沿镂空板绕线','Trace a loop stencil','线端沿三角镂空板内侧绕行，在尖角停顿后回到开口。',['扶住镂空板','沿第一边绕行','转过上尖角','回到开口停看'],
    part('stencil',0,-8,p('M-24 16L0 -24L24 16ZM-12 9H12L0 -11Z',C.light,1))+strand('inner-loop',0,-8,'M-12 9L0 -11L12 9H-12',1.8)+part('end',-12,1,ring(0,0,2,C.base))+hand('hold',-24,3),
    [move('end',[[.18,'translate(2px,-3px)'],[.4,'translate(12px,-20px)'],[.56,'translate(12px,-20px)'],[.76,'translate(24px,0px)'],[.88,'translate(12px,0px)']]),move('inner-loop',[[.3,'scale(.97)'],[.8,'scale(.97)']]),move('hold',[[.15,'translate(1px,-1px)'],[.82,'translate(1px,-1px)']])],3900);
  add('designing','scallop-edge','绕出波浪织边','Lay a scalloped border','钩针沿三个弧形织边逐个挑起，整条织边保持连贯。',['托住织边','挑起首个弧','沿其余弧移动','把钩针退开'],
    swatch('cloth',0,-15,42,14)+strand('scallops',0,-5,'M-21 0Q-14 16 -7 0Q0 16 7 0Q14 16 21 0',2)+part('hook',-20,-7,p('M0 -7V4Q0 9 4 7Q6 5 3 4','none',1.5))+hand('hold',23,-12),
    [move('hook',[[.14,'translate(0px,2px)'],[.3,'translate(7px,-1px) rotate(8deg)'],[.49,'translate(21px,2px)'],[.68,'translate(35px,-1px) rotate(8deg)'],[.85,'translate(36px,-6px)']]),move('scallops',[[.3,'scaleY(.9)'],[.68,'scaleY(1.05)'],[.85,'scaleY(1)']], 'top center')],3600);
  add('designing','spiral-emblem','盘线试徽形','Compose a spiral emblem','把一根线盘成开放螺旋，外端靠近中心比较，再退开留白。',['托住螺旋底部','推近外端','比较中心留白','外端退开'],
    part('disc',0,-9,ring(0,0,19,C.light))+strand('spiral',0,-9,'M17 7C-21 23 -27 -22 4 -17C28 -13 10 15 -4 7C-14 1 -1 -11 5 -4C10 2 1 5 0 1',2)+hand('tip',22,0)+part('centre',1,-8,ring(0,0,1.5,C.shade)),
    [move('spiral',[[.26,'rotate(-5deg) scale(.97)'],[.55,'rotate(4deg) scale(1.02)'],[.8,'rotate(0deg) scale(1)']]),move('tip',[[.22,'translate(-3px,1px)'],[.5,'translate(-8px,-3px) rotate(-12deg)'],[.75,'translate(-2px,1px)']]),glow('centre',[[.35,.8],[.68,.8]],.5)],3700);

  // TESTING: repeat a measurement or strain, never imply a successful result.
  add('testing','tension-gate','拉线过张力门','Probe a tension gate','把一段线轻拉经过两只固定环，释放张力，再重复查看。',['握住松线','轻拉过固定环','保持张力观察','释放回松线'],
    part('gate',0,-8,ring(-10,0,6)+ring(10,0,6)+p('M-17 13H17M-10 6V13M10 6V13','none',1.1))+strand('sample',0,-8,'M-25 2Q0 13 25 2',2)+hand('left',-24,-4)+hand('right',24,-4),
    [move('sample',[[.25,'scaleY(.5)'],[.56,'scaleY(.5)'],[.78,'scaleY(1)']], 'top center'),move('left',[[.25,'translate(-1px,-2px)'],[.56,'translate(-1px,-2px)']]),move('right',[[.25,'translate(1px,-2px)'],[.56,'translate(1px,-2px)']])],3500);
  add('testing','ring-gauge','穿过线径环规','Check a loop gauge','把同一段线样依次靠近大小不同的环口，经过后退回起侧。',['举起线样','靠近小环','移向大环','退回起侧'],
    part('gauges',0,-8,ring(-14,0,4)+ring(1,0,7)+ring(18,0,9)+p('M-19 13H27M-14 4V13M1 7V13M18 9V13','none',1))+strand('sample',-23,-7,'M-3 -8Q5 -8 5 0Q5 8 -3 8',2)+hand('guide',-23,4),
    [move('sample',[[.2,'translate(5px,0px) rotate(10deg)'],[.4,'translate(17px,0px) rotate(0deg)'],[.63,'translate(35px,0px) rotate(-8deg)'],[.81,'translate(17px,0px)']]),move('guide',[[.2,'translate(5px,-1px)'],[.4,'translate(17px,-1px)'],[.63,'translate(35px,-1px)'],[.81,'translate(17px,-1px)']])],3900);
  add('testing','seam-flex','反复弯折织缝','Flex a stitched seam','两片布沿中央接缝弯折，短暂停住后展开检查线桥。',['夹住两片布','沿接缝合拢','保持弯折观察','展开检查线桥'],
    part('left-cloth',-2,-8,box(-21,-12,21,24,1,C.base)+p('M-17 -7H-4M-17 -1H-4M-17 5H-4','none',.7))+part('right-cloth',2,-8,box(0,-12,21,24,1,C.light)+p('M4 -7H17M4 -1H17M4 5H17','none',.7))+strand('seam',0,-8,'M-3 -10L3 -6L-3 -2L3 2L-3 6L3 10',1.7)+hand('grip',24,3),
    [move('left-cloth',[[.24,'scaleX(.72) rotate(-5deg)'],[.55,'scaleX(.72) rotate(-5deg)'],[.8,'scaleX(1)']], 'right center'),move('right-cloth',[[.24,'scaleX(.72) rotate(5deg)'],[.55,'scaleX(.72) rotate(5deg)'],[.8,'scaleX(1)']], 'left center'),move('grip',[[.24,'translate(-4px,-2px)'],[.55,'translate(-4px,-2px)']])],3600);
  add('testing','snag-probe','钩针探织孔','Probe a stitch opening','钩针靠近网孔，伸入再原路抽出，织孔不被改成通过标记。',['对准网孔','伸入孔口','轻移检查边缘','原路抽出'],
    part('mesh',0,-9,box(-20,-15,40,29,1,C.light)+p('M-16 -8L16 8M-16 0L8 12M-8 -12L16 0M-16 8L16 -8M-8 12L16 -12M-16 0L8 -12','none',1.1))+part('hook',0,-23,p('M0 -7V8Q1 13 5 10Q7 7 3 6','none',1.8))+hand('hold',-24,1),
    [move('hook',[[.17,'translate(0px,2px)'],[.36,'translate(0px,10px)'],[.52,'translate(2px,10px) rotate(5deg)'],[.67,'translate(-2px,10px) rotate(-5deg)'],[.85,'translate(0px,0px)']]),move('mesh',[[.4,'scaleX(.98) scaleY(1.02)'],[.7,'scaleX(1) scaleY(1)']])],3400);
  add('testing','caliper-fibre','开合卡尺量线','Measure a yarn bundle','两只弯尺靠向粗线束，保持开口读数，再分开重新定位。',['分开弯尺','靠近线束两侧','保持开口比量','分开重新定位'],
    strand('bundle',0,-8,'M-3 -18V17M0 -18V17M3 -18V17',2)+part('jaw-left',-13,-10,p('M-7 -12H7V12H-7M7 0H12','none',1.6))+part('jaw-right',13,-10,p('M7 -12H-7V12H7M-7 0H-12','none',1.6))+part('scale',0,8,p('M-22 0H22M-14 -2V2M-7 -2V2M0 -2V2M7 -2V2M14 -2V2','none',.8)),
    [move('jaw-left',[[.22,'translate(4px,0px)'],[.6,'translate(4px,0px)'],[.8,'translate(0px,-1px)']]),move('jaw-right',[[.3,'translate(-4px,0px)'],[.6,'translate(-4px,0px)'],[.8,'translate(0px,-1px)']])],3300);
  add('testing','rub-sample','轻擦织片表面','Inspect a rubbing sample','软垫在织物上来回摩擦两次，抬开后线端触摸同一处。',['压住织片','软垫来回轻擦','抬开软垫','触摸检查表面'],
    swatch('cloth',0,-6,42,25)+part('pad',-11,-11,box(-6,-4,12,8,3,C.shade)+p('M-3 -2L3 2M-3 1L0 3','none',.7))+hand('feel',22,1),
    [move('pad',[[.15,'translate(0px,2px)'],[.3,'translate(20px,2px)'],[.44,'translate(0px,2px)'],[.58,'translate(20px,2px)'],[.74,'translate(22px,-5px)']]),move('feel',[[.65,'translate(-12px,-6px)'],[.78,'translate(-20px,-6px)'],[.9,'translate(-20px,-6px)']])],3800);
  add('testing','repeat-spacing','比量重复针距','Compare repeated stitch spacing','滑动带双叉的量具，在连续的三组针距上分别停留。',['对齐首组针目','滑到中间组','滑到末组','回看首组'],
    strand('row',0,-5,'M-24 0Q-20 -13 -16 0Q-12 -13 -8 0Q-4 -13 0 0Q4 -13 8 0Q12 -13 16 0Q20 -13 24 0',1.9)+part('gauge',-16,-14,p('M-7 -8H7M-7 -8V8M7 -8V8M-3 -8V-5M3 -8V-5','none',1.4))+hand('guide',-22,-8),
    [move('gauge',[[.2,'translate(0px,1px)'],[.42,'translate(16px,1px)'],[.64,'translate(32px,1px)'],[.84,'translate(0px,1px)']]),move('guide',[[.2,'translate(0px,1px)'],[.42,'translate(16px,1px)'],[.64,'translate(32px,1px)'],[.84,'translate(0px,1px)']])],3500);
  add('testing','mesh-stretch','斜拉网片观察','Inspect a stretched mesh','夹住网片的对角，缓缓施力后保持观察，再释放回原形。',['夹住两只对角','缓缓斜拉','保持网孔形态','释放张力'],
    part('mesh',0,-8,p('M-17 0L0 -19L17 0L0 19ZM-10 0L0 -11L10 0L0 11ZM-17 0H17M0 -19V19','none',1.5))+hand('upper',-16,-24)+hand('lower',16,7)+part('pins',0,-8,ring(-17,0,1.5,C.light)+ring(17,0,1.5,C.light)),
    [move('mesh',[[.3,'scaleX(.88) scaleY(1.08) rotate(-4deg)'],[.6,'scaleX(.88) scaleY(1.08) rotate(-4deg)'],[.85,'scaleX(1) scaleY(1)']]),move('upper',[[.3,'translate(-1px,-1px)'],[.6,'translate(-1px,-1px)']]),move('lower',[[.3,'translate(1px,1px)'],[.6,'translate(1px,1px)']])],4000);
  add('testing','knot-load','轻载试线结','Inspect a loaded knot','给已有线结两端轻微张力，结保持完整不解开，随后放松。',['抓住结的两端','施加轻载','保持结形观察','放松两端'],
    knot('sample-knot',0,-8)+strand('left-end',-9,-8,'M0 0Q-8 4 -17 0',2)+strand('right-end',9,-8,'M0 0Q8 -4 17 0',2)+hand('left',-24,-5)+hand('right',24,-11),
    [move('left-end',[[.28,'scaleX(1.04) scaleY(.6)'],[.6,'scaleX(1.04) scaleY(.6)'],[.84,'scaleX(1) scaleY(1)']], 'right center'),move('right-end',[[.28,'scaleX(1.04) scaleY(.6)'],[.6,'scaleX(1.04) scaleY(.6)'],[.84,'scaleX(1) scaleY(1)']], 'left center'),move('left',[[.28,'translate(-1px,-1px)'],[.6,'translate(-1px,-1px)']]),move('right',[[.28,'translate(1px,1px)'],[.6,'translate(1px,1px)']])],3700);
  add('testing','loop-clearance','线圈过梭间隙','Probe shuttle clearance','将梭子尖端送入竖立线圈，停看间隙后原路抽回。',['扶正竖立线圈','送入梭子尖端','停看环内间隙','原路抽回'],
    part('loop',1,-9,p('M0 -17C-12 -17 -12 17 0 17C12 17 12 -17 0 -17Z','none',2.3))+part('shuttle',-19,-9,p('M-8 0Q0 -6 12 0Q0 6 -8 0Z',C.light)+ring(-1,0,1.3,C.shade))+hand('hold',12,5)+part('stand',1,9,p('M-9 0H9','none',1.4)),
    [move('shuttle',[[.2,'translate(3px,0px)'],[.44,'translate(15px,0px)'],[.65,'translate(15px,0px)'],[.86,'translate(0px,0px)']]),move('hold',[[.18,'translate(-1px,-2px)'],[.78,'translate(-1px,-2px)']])],3400);

  // BUILDING: several separate pieces are brought into structural contact.
  add('building','corner-frame','组装软框角','Assemble a soft frame corner','一根横梁与一根立梁靠向角夹，线端绕住接触位置后松手。',['抬起横梁','立梁靠向角夹','线端包住接点','松手保留结构'],
    part('horizontal',-10,-13,box(-14,-3,28,6,1,C.base)+p('M-10 0H10','none',.6))+part('vertical',12,-4,box(-3,-14,6,28,1,C.shade))+part('corner',9,-10,p('M-6 -6H6V6H0V0H-6Z',C.light))+strand('binding',9,-10,'M-7 0Q0 -10 7 0Q0 10 -7 0',1.7)+hand('join',-23,3),
    [move('horizontal',[[.2,'translate(4px,0px)'],[.75,'translate(4px,0px)']]),move('vertical',[[.35,'translate(-3px,-3px)'],[.75,'translate(-3px,-3px)']]),move('binding',[[.43,'scale(.9) rotate(12deg)'],[.65,'scale(.9) rotate(12deg)']]),move('join',[[.2,'translate(9px,-11px)'],[.45,'translate(29px,-14px)'],[.7,'translate(29px,-14px)']])],3800);
  add('building','woven-wall','加装编织墙片','Fit a woven wall panel','把编织墙片插到两根立柱之间，再用压条固定上缘。',['扶住两根立柱','墙片送入柱间','压条接触上缘','退开线环手'],
    part('posts',0,-7,p('M-22 -22V19M22 -22V19M-26 19H26','none',2.5))+swatch('panel',0,-7,34,27)+part('cap',0,-25,box(-23,-2,46,4,1,C.light))+hand('fit',23,3),
    [move('panel',[[.18,'translate(0px,-4px)'],[.4,'translate(0px,2px)'],[.77,'translate(0px,2px)']]),move('cap',[[.4,'translate(0px,0px)'],[.6,'translate(0px,5px)'],[.78,'translate(0px,5px)']]),move('fit',[[.2,'translate(-3px,-5px)'],[.48,'translate(-3px,-5px)'],[.7,'translate(0px,0px)']])],4000);
  add('building','coil-tower','叠放线圈柱','Stack a coil column','把两只软线圈叠到已有底圈上，轻压上圈使接触面贴合。',['扶住底圈','送入中圈','叠上小圈','轻压接触面'],
    part('base-coil',0,6,p('M-18 0Q0 -9 18 0Q0 9 -18 0','none',3))+part('middle-coil',-10,-6,p('M-14 0Q0 -7 14 0Q0 7 -14 0','none',3))+part('top-coil',10,-20,p('M-10 0Q0 -5 10 0Q0 5 -10 0','none',3))+hand('press',0,-30),
    [move('middle-coil',[[.22,'translate(10px,3px)'],[.75,'translate(10px,3px)']]),move('top-coil',[[.38,'translate(-10px,9px)'],[.75,'translate(-10px,9px)']]),move('press',[[.45,'translate(0px,5px)'],[.6,'translate(0px,9px)'],[.75,'translate(0px,7px)']])],3600);
  add('building','arched-bridge','搭起线拱桥','Assemble a yarn arch bridge','两只桥脚先靠近底座，拱形织带落到脚顶，再压住两端。',['摆正桥脚','织带落向脚顶','先压一端','再压另一端'],
    part('base',0,9,p('M-27 0H27','none',1.4))+part('foot-left',-19,1,box(-4,-9,8,17,1,C.shade))+part('foot-right',19,1,box(-4,-9,8,17,1,C.shade))+strand('arch',0,-9,'M-20 0Q0 -31 20 0',4)+hand('press',-22,-7),
    [move('foot-left',[[.18,'translate(2px,0px)'],[.78,'translate(2px,0px)']]),move('foot-right',[[.27,'translate(-2px,0px)'],[.78,'translate(-2px,0px)']]),move('arch',[[.38,'translate(0px,3px)'],[.75,'translate(0px,3px)']]),move('press',[[.42,'translate(4px,2px)'],[.57,'translate(4px,3px)'],[.72,'translate(40px,3px)'],[.86,'translate(40px,0px)']])],4100);
  add('building','basket-rim','编接篮口','Assemble a basket rim','把椭圆边圈压到交叉篮条上，梭子从两根立条间穿过加固。',['扶住交叉篮条','边圈压向篮口','梭子穿过立条','线端靠边停住'],
    part('ribs',0,-5,p('M-21 -8Q-16 12 0 14Q16 12 21 -8M-11 -12Q-9 15 -2 14M11 -12Q9 15 2 14','none',2))+part('rim',0,-19,p('M-23 0Q0 -10 23 0Q0 10 -23 0','none',2.5))+part('shuttle',-17,-2,p('M-6 0Q0 -5 8 0Q0 5 -6 0Z',C.light))+hand('hold',24,3),
    [move('rim',[[.25,'translate(0px,4px)'],[.78,'translate(0px,4px)']]),move('shuttle',[[.36,'translate(2px,0px)'],[.64,'translate(32px,0px)'],[.8,'translate(32px,-3px)']]),move('hold',[[.23,'translate(-1px,-2px)'],[.78,'translate(-1px,-2px)']])],3900);
  add('building','rung-ladder','接上梯形横档','Fit a ladder rung','把一根横档送到两条侧绳之间，分别系住两端但不展示完成结果。',['分开两条侧绳','送入横档','包住左接点','包住右接点'],
    strand('sides',0,-8,'M-17 -22V20M17 -22V20M-17 -13H17M-17 12H17',2.2)+part('rung',0,-4,box(-17,-2,34,4,1,C.light))+strand('tie-left',-17,-4,'M-4 -3Q5 -7 5 0Q5 7 -4 3',1.7)+strand('tie-right',17,-4,'M4 -3Q-5 -7 -5 0Q-5 7 4 3',1.7)+hand('tie',-24,1),
    [move('rung',[[.2,'translate(0px,-3px) rotate(-4deg)'],[.4,'translate(0px,0px)'],[.8,'translate(0px,0px)']]),move('tie-left',[[.44,'scale(.88) rotate(15deg)'],[.72,'scale(.88) rotate(15deg)']]),move('tie-right',[[.64,'scale(.88) rotate(-15deg)'],[.82,'scale(.88) rotate(-15deg)']]),move('tie',[[.35,'translate(7px,-5px)'],[.53,'translate(7px,-5px)'],[.68,'translate(39px,-5px)'],[.83,'translate(39px,-5px)']])],4000);
  add('building','tension-canopy','撑起织物顶篷','Fit a tensioned canopy','软布片先搭向中柱，两侧支线再靠向固定点形成支撑。',['托高织物','搭向中柱','拉开两侧支线','保持支撑形态'],
    part('pole',0,-8,p('M0 -23V19M-7 19H7','none',2))+part('canopy',0,-21,p('M-22 13L0 -10L22 13Q0 6 -22 13Z',C.base)+p('M0 -10V9','none',.8))+strand('left-guy',-20,-6,'M0 0L-6 15',1.7)+strand('right-guy',20,-6,'M0 0L6 15',1.7)+hand('lift',-22,-12),
    [move('canopy',[[.24,'translate(0px,-2px)'],[.43,'translate(0px,0px)'],[.8,'translate(0px,0px)']]),move('left-guy',[[.46,'rotate(-9deg)'],[.75,'rotate(-9deg)']], 'top center'),move('right-guy',[[.58,'rotate(9deg)'],[.8,'rotate(9deg)']], 'top center'),move('lift',[[.2,'translate(2px,-5px)'],[.43,'translate(2px,-3px)'],[.75,'translate(0px,0px)']])],3700);
  add('building','braid-cable','汇成三股软索','Assemble a braided cable','三根独立线束交替靠向中央夹具，形成有层次的交叉结构。',['分开三根线束','送左束到中央','送右束到中央','压住交叉结构'],
    part('clamp',0,-23,box(-9,-5,18,10,1,C.shade))+strand('left',-13,-4,'M0 -15Q-12 0 9 14',2.5)+strand('centre',0,-4,'M0 -15Q8 0 -2 14',2.5)+strand('right',13,-4,'M0 -15Q12 0 -9 14',2.5)+hand('press',0,6),
    [move('left',[[.25,'translate(3px,0px) rotate(-4deg)'],[.75,'translate(3px,0px) rotate(-4deg)']]),move('right',[[.43,'translate(-3px,0px) rotate(4deg)'],[.75,'translate(-3px,0px) rotate(4deg)']]),move('centre',[[.52,'translate(0px,-1px)'],[.76,'translate(0px,-1px)']]),move('press',[[.58,'translate(0px,-3px)'],[.77,'translate(0px,-3px)']])],3600);
  add('building','spool-rack','装入线轴架','Fit a spool into a rack','把线轴举到空槽上方，压入托架，再把支杆对齐。',['举起待装线轴','移到空槽上方','压向托架','对齐侧支杆'],
    part('rack',0,-3,p('M-25 13V-17H25V13M-25 7H25M0 -17V7','none',2))+spool('fixed',-13,-6,.7)+spool('incoming',16,-20,.7)+part('brace',25,-3,p('M0 -13L-10 13','none',2))+hand('lift',20,-18),
    [move('incoming',[[.18,'translate(-2px,-2px)'],[.42,'translate(-3px,12px)'],[.76,'translate(-3px,12px)']]),move('lift',[[.18,'translate(-2px,-2px)'],[.42,'translate(-3px,12px)'],[.62,'translate(0px,8px)']]),move('brace',[[.6,'rotate(-8deg)'],[.8,'rotate(-8deg)']], 'top center')],3800);
  add('building','soft-joint','夹合两片织件','Join two woven components','两片厚织件从两侧靠近，中央小带压住接缝，再松开夹手。',['两片织件靠近','中央带落向接缝','压住接触面','夹手退开'],
    swatch('left-piece',-15,-8,18,23)+swatch('right-piece',15,-8,18,23)+part('joint-band',0,-19,box(-4,-6,8,26,2,C.light)+p('M-3 -2H3M-3 4H3M-3 10H3','none',.7))+hand('left-hand',-24,3)+hand('right-hand',24,3),
    [move('left-piece',[[.23,'translate(5px,0px)'],[.76,'translate(5px,0px)']]),move('right-piece',[[.23,'translate(-5px,0px)'],[.76,'translate(-5px,0px)']]),move('joint-band',[[.4,'translate(0px,3px)'],[.7,'translate(0px,3px)']]),move('left-hand',[[.23,'translate(4px,-1px)'],[.65,'translate(4px,-1px)'],[.82,'translate(0px,0px)']]),move('right-hand',[[.23,'translate(-4px,-1px)'],[.65,'translate(-4px,-1px)'],[.82,'translate(0px,0px)']])],3500);

  // RUNNING: established mechanisms cycle regularly; hands do not re-start them.
  add('running','loom-carriage','织机梭车往复','Run a loom carriage','已运转的梭车按固定路径往返，压条在每次换向后落下。',['梭车向右运行','压条落下','梭车向左返回','压条复位'],
    part('loom',0,-9,p('M-25 -18V18M25 -18V18M-25 -18H25M-18 -17V17M-9 -17V17M0 -17V17M9 -17V17M18 -17V17','none',1.1))+part('carriage',-18,-5,box(-5,-4,10,8,2,C.shade)+ring(0,0,1.5,C.light))+part('beater',0,-19,p('M-23 0H23M-18 0V5M-9 0V5M0 0V5M9 0V5M18 0V5','none',1.5))+hand('rest',25,7),
    [move('carriage',[[.22,'translate(36px,0px)'],[.28,'translate(36px,0px)'],[.72,'translate(0px,0px)'],[.78,'translate(0px,0px)']], 'center center','move'),move('beater',[[.22,'translate(0px,0px)'],[.35,'translate(0px,9px)'],[.45,'translate(0px,0px)'],[.72,'translate(0px,0px)'],[.85,'translate(0px,9px)'],[.95,'translate(0px,0px)']])],3200);
  add('running','traverse-winder','绕线导头往复','Run a traverse winder','绕线导头沿长线轴稳定往返，软带随导头轻微变紧再松开。',['导头移向右端','软带保持张力','导头返回左端','软带回到松弧'],
    part('reel',0,-10,box(-23,-9,46,18,3,C.base)+p('M-19 -7L-11 7M-11 -7L-3 7M-3 -7L5 7M5 -7L13 7M13 -7L21 7','none',1.2)+p('M-25 -10V10M25 -10V10','none',2))+part('guide',-18,-24,ring(0,0,3,C.light)+p('M0 -3V-7','none',1.2))+strand('feed',-18,-19,'M0 -2Q4 7 1 11',1.8)+hand('rest',-24,6),
    [move('guide',[[.45,'translate(36px,0px)'],[.5,'translate(36px,0px)'],[.95,'translate(0px,0px)']], 'center center','linear'),move('feed',[[.45,'translate(36px,0px) scaleY(.94)'],[.5,'translate(36px,0px) scaleY(.94)'],[.95,'translate(0px,0px)']], 'top center','linear')],3000);
  add('running','braid-shuttles','编索机交替穿梭','Run alternating braid shuttles','两只带线梭沿上下两条通道交错往返，中央线束保持原位。',['上梭向右','下梭向左','两梭换层','沿原路继续循环'],
    part('rails',0,-9,p('M-24 -8H24M-24 8H24M-24 -12V12M24 -12V12','none',1.2))+strand('braid',0,-9,'M-20 -4Q-8 8 0 -4T20 -4M-20 4Q-8 -8 0 4T20 4',1.8)+part('upper',-19,-17,box(-4,-3,8,6,2,C.light))+part('lower',19,-1,box(-4,-3,8,6,2,C.shade)),
    [move('upper',[[.4,'translate(38px,0px)'],[.5,'translate(38px,4px)'],[.9,'translate(0px,4px)']], 'center center','move'),move('lower',[[.4,'translate(-38px,0px)'],[.5,'translate(-38px,-4px)'],[.9,'translate(0px,-4px)']], 'center center','move')],3400);
  add('running','oval-carrier','线环载子循轨','Run an oval loop carrier','小载子沿封闭椭圆轨道循环运行，线圈从两只导环之间经过。',['经过上侧导环','绕到轨道右侧','经过下侧导环','绕回轨道左侧'],
    part('track',0,-10,p('M-21 0C-21 -17 21 -17 21 0C21 17 -21 17 -21 0Z','none',1.3)+ring(0,-12,3,C.light)+ring(0,12,3,C.light))+part('carrier',-21,-10,p('M-4 -3H4V3H-4Z',C.base)+ring(0,0,1,C.light))+strand('feed',-23,7,'M0 0Q-6 -9 2 -16',1.8),
    [move('carrier',[[.125,'translate(6px,-9px) rotate(20deg)'],[.25,'translate(21px,-12px) rotate(0deg)'],[.375,'translate(36px,-9px) rotate(-20deg)'],[.5,'translate(42px,0px) rotate(0deg)'],[.625,'translate(36px,9px) rotate(20deg)'],[.75,'translate(21px,12px) rotate(0deg)'],[.875,'translate(6px,9px) rotate(-20deg)']], 'center center','linear')],3600);
  add('running','knitting-bed','针床规律起落','Run a knitting needle bed','两排针床错相起落，织片留在中间，表现已持续运行的编织机构。',['前排针升起','后排针接替','前排针回落','后排针回落'],
    part('bed',0,3,p('M-25 -4H25V7H-25Z',C.shade))+part('front',0,-5,p('M-21 8V-9M-9 8V-9M3 8V-9M15 8V-9','none',2))+part('back',0,-11,p('M-15 8V-9M-3 8V-9M9 8V-9M21 8V-9','none',2))+swatch('fabric',0,4,35,10)+hand('rest',-25,5),
    [move('front',[[.18,'translate(0px,-4px)'],[.38,'translate(0px,-4px)'],[.58,'translate(0px,0px)'],[.8,'translate(0px,0px)']], 'center center','move'),move('back',[[.18,'translate(0px,0px)'],[.4,'translate(0px,-4px)'],[.62,'translate(0px,-4px)'],[.84,'translate(0px,0px)']], 'center center','move')],2800);
  add('running','treadle-link','脚踏连杆循环','Run a treadle linkage','软踏板与连杆按固定节奏往复，导轮保持小幅均匀摆动。',['踏板压低','连杆向前','踏板抬回','连杆返回'],
    part('frame',0,-7,p('M-23 17L-15 -17H15L23 17M-24 17H24','none',1.5))+wheel('guide-wheel',0,-15,10)+part('rod',0,-2,p('M0 -7L-13 9','none',2))+part('pedal',-8,8,p('M-14 0H14','none',2.2))+hand('rest',23,4),
    [move('pedal',[[.25,'rotate(8deg)'],[.5,'rotate(0deg)'],[.75,'rotate(-8deg)']], 'center center','move'),move('rod',[[.25,'translate(2px,1px) rotate(5deg)'],[.5,'translate(0px,0px)'],[.75,'translate(-2px,-1px) rotate(-5deg)']], 'top center','move'),move('guide-wheel',[[.25,'rotate(22deg)'],[.5,'rotate(0deg)'],[.75,'rotate(-22deg)']], 'center center','move')],3000);
  add('running','loop-chain','链环机规律交接','Run a loop chain mechanism','两只钩杆交替穿过中央线环，重复交接而不出现完成提示。',['左钩穿入线环','右钩接替','左钩退回','右钩退回'],
    part('housing',0,-12,box(-25,-14,50,29,3,C.light)+p('M-19 0H19','none',.8))+part('left-hook',-17,-12,p('M-7 0H5Q12 0 8 -5Q5 -8 3 -3','none',2))+part('right-hook',17,-8,p('M7 0H-5Q-12 0 -8 5Q-5 8 -3 3','none',2))+strand('loop',0,-10,'M0 -9C-9 -8 -8 9 0 9C8 9 9 -8 0 -9',1.8),
    [move('left-hook',[[.2,'translate(6px,0px)'],[.4,'translate(6px,0px)'],[.6,'translate(0px,0px)'],[.8,'translate(0px,0px)']], 'center center','move'),move('right-hook',[[.2,'translate(0px,0px)'],[.4,'translate(-6px,0px)'],[.6,'translate(-6px,0px)'],[.8,'translate(0px,0px)']], 'center center','move'),move('loop',[[.25,'rotate(-8deg) scaleX(.92)'],[.5,'rotate(0deg)'],[.75,'rotate(8deg) scaleX(.92)']], 'center center','organic')],3200);
  add('running','takeup-rocker','收线摆臂往复','Run a take-up rocker','摆臂在两只固定导环之间规律摆动，松线随摆臂收放。',['摆臂靠近左导环','线弧收紧','摆臂转向右导环','线弧松回'],
    part('guides',0,-8,ring(-21,-9,3,C.light)+ring(21,-9,3,C.light)+p('M-25 17H25','none',1.2))+part('arm',0,-2,p('M0 9V-18','none',2.2)+ring(0,-18,3,C.base))+strand('slack',0,-10,'M-21 -7Q0 15 21 -7',1.8)+part('pivot',0,7,ring(0,0,3,C.shade)),
    [move('arm',[[.25,'rotate(-22deg)'],[.5,'rotate(0deg)'],[.75,'rotate(22deg)']], 'bottom center','move'),move('slack',[[.25,'scaleY(.85)'],[.5,'scaleY(1)'],[.75,'scaleY(.85)']], 'top center','move')],3400);
  add('running','bobbin-transfer','双梭芯规律交接','Run paired bobbin transfers','两只梭芯在各自短槽内交错移动，夹片在中点开合。',['左梭芯进入中段','夹片抬开','右梭芯接替','夹片落回'],
    part('slots',0,-9,p('M-26 -8H-2V8H-26ZM2 -8H26V8H2Z','none',1.2))+spool('left',-19,-9,.55)+spool('right',19,-9,.55)+part('clasp',0,-18,p('M-3 0H3V17H-3Z',C.light))+hand('rest',-24,5),
    [move('left',[[.23,'translate(10px,0px)'],[.45,'translate(10px,0px)'],[.7,'translate(0px,0px)']], 'center center','move'),move('right',[[.23,'translate(0px,0px)'],[.48,'translate(-10px,0px)'],[.7,'translate(-10px,0px)'],[.92,'translate(0px,0px)']], 'center center','move'),move('clasp',[[.2,'translate(0px,-3px)'],[.53,'translate(0px,-3px)'],[.73,'translate(0px,0px)']])],3100);
  add('running','weft-return','纬线载子闭环','Run a weft return carrier','载子沿矩形回程架连续移动，前段送线、后段沿回程槽返回。',['沿上槽送线','载子下降换槽','沿下槽返回','载子升回上槽'],
    part('frame',0,-10,p('M-23 -10H23V10H-23Z','none',1.5))+part('carrier',-21,-18,p('M-5 0L0 -4L5 0L0 4Z',C.base))+strand('row',0,-10,'M-20 0Q-10 -4 0 0T20 0',1.8)+hand('rest',25,5),
    [move('carrier',[[.35,'translate(42px,0px)'],[.5,'translate(42px,16px)'],[.85,'translate(0px,16px)']], 'center center','linear'),move('row',[[.35,'scaleY(.85)'],[.5,'scaleY(1)'],[.85,'scaleY(.85)']], 'center center','organic')],3800);

  // WAITING FOR A TOOL: reels, needles and shuttles are genuinely stopped.
  add('waiting-tool','parked-spool','线轴停在托座','A spool rests in its cradle','线轴停在托座上，线环手靠在侧边，只有松线末端缓缓落稳。',['线轴保持停止','线环手靠住托座','松端稍微下垂','保持安静等待'],
    part('cradle',0,4,p('M-18 -6Q-15 8 0 8Q15 8 18 -6M-20 9H20','none',1.8))+spool('stopped-spool',0,-8,1.1)+strand('loose-end',9,-4,'M0 0Q17 0 15 11Q13 17 5 14',1.8)+hand('rest',-21,3),
    [move('loose-end',[[.62,'translate(0px,0px)'],[.72,'translate(.4px,.6px) rotate(1deg)'],[.89,'translate(.4px,.6px) rotate(1deg)']]),move('rest',[[.7,'translate(.3px,.3px)'],[.88,'translate(.3px,.3px)']])],8000);
  add('waiting-tool','parked-loom','梭子搁在织机边','A loom shuttle stays parked','梭子搁在经线外侧，压条抬起不运作，线端搭在机框上。',['梭子停在机框外','压条保持抬起','线端靠向框边','保持停止等待'],
    part('loom',0,-7,p('M-22 -20V19M22 -20V19M-22 -20H22M-15 -19V18M-5 -19V18M5 -19V18M15 -19V18','none',1.1))+part('parked-shuttle',-21,5,p('M-7 0Q0 -6 7 0Q0 6 -7 0Z',C.light))+spool('stopped-spool',19,-23,.45)+strand('resting-thread',-18,-7,'M0 0Q-11 4 -4 15L5 13',1.7)+part('raised-bar',0,-23,p('M-20 0H20','none',2)),
    [move('resting-thread',[[.58,'rotate(0deg)'],[.69,'rotate(-1.5deg) translateY(.4px)'],[.9,'rotate(-1.5deg) translateY(.4px)']], 'top center')],7600);
  add('waiting-tool','bobbin-tray','梭芯留在浅盘','Bobbins remain in a tray','三只梭芯静置在浅盘，掌中的线尾只轻轻松开一小段。',['梭芯留在槽内','手指保持松握','线尾松开少许','浅盘保持静止'],
    part('tray',0,4,p('M-26 -5H26L22 7H-22Z',C.shade)+p('M-9 -5V6M9 -5V6','none',.8))+spool('stopped-spool',-17,-7,.65)+spool('middle-bobbin',0,-5,.55)+spool('right-bobbin',17,-7,.65)+hand('loose-grip',23,2)+strand('tail',21,-2,'M0 0Q-5 8 -12 7',1.7),
    [move('loose-grip',[[.61,'rotate(0deg)'],[.72,'rotate(2deg)'],[.89,'rotate(2deg)']]),move('tail',[[.65,'translate(0px,0px)'],[.77,'translate(-.5px,.4px)'],[.91,'translate(-.5px,.4px)']])],8200);
  add('waiting-tool','slack-pulley','松线挂在导轮下','A slack line hangs below a pulley','导轮固定不转，宽松线弧悬在下面，线端靠近支脚休息。',['导轮保持停止','线弧悬在导轮下','线端靠近支脚','保持宽松等待'],
    part('stand',0,-8,p('M-16 18V-18H16V18M-21 18H21','none',1.7))+wheel('stopped-wheel',0,-20,8)+spool('stopped-spool',-18,-2,.5)+strand('slack',0,-10,'M-8 -10Q-20 22 4 16Q21 12 8 -10',1.8)+strand('end',13,5,'M0 -2Q6 6 12 2',1.8),
    [move('end',[[.6,'translate(0px,0px)'],[.74,'translate(.4px,.3px) rotate(-1deg)'],[.9,'translate(.4px,.3px) rotate(-1deg)']], 'left center')],7800);
  add('waiting-tool','needle-bed-pause','针床停在抬起位','A needle bed waits raised','针排保持抬起，未继续落针；一只线环手静靠织片边。',['针排保持抬起','织片留在针床','手指靠住织片边','继续安静等待'],
    part('bed',0,4,box(-25,-4,50,11,1,C.shade))+part('stopped-needles',0,-10,p('M-18 12V-14M-9 12V-14M0 12V-14M9 12V-14M18 12V-14','none',1.8))+swatch('cloth',0,4,34,11)+spool('stopped-spool',23,-17,.42)+hand('rest',-23,3)+strand('slack',-18,-8,'M0 -4Q-9 7 0 13',1.6),
    [move('rest',[[.67,'translate(0px,0px)'],[.77,'translate(.5px,-.2px) rotate(1deg)'],[.9,'translate(.5px,-.2px) rotate(1deg)']])],7400);
  add('waiting-tool','pattern-drum','花样滚筒停转','A pattern drum stays stopped','带孔滚筒停在当前孔位，线端搭在指示杆旁，不再推进。',['滚筒停在孔位','指示杆保持原位','线尾落向杆侧','保持当前孔位'],
    part('drum',0,-10,box(-19,-12,38,24,6,C.base)+p('M-12 -8V8M-4 -8V8M4 -8V8M12 -8V8','none',.6)+ring(-8,-4,1.1,C.light)+ring(0,4,1.1,C.light)+ring(8,-4,1.1,C.light))+part('pointer',0,5,p('M-3 3L0 -6L3 3Z',C.light))+spool('stopped-spool',-23,-21,.4)+strand('tail',18,0,'M0 0Q12 0 9 8Q5 13 0 8',1.7),
    [move('tail',[[.59,'translate(0px,0px)'],[.73,'translate(.3px,.5px)'],[.89,'translate(.3px,.5px)']])],8600);
  add('waiting-tool','winder-guide-rest','绕线导头停在边侧','A winder guide waits at the edge','长线轴和导头都保持停止，线环手靠在导头旁等待。',['长线轴保持停止','导头留在左端','线环手靠近导头','松线保持下垂'],
    part('stopped-spool',0,-10,box(-23,-9,46,18,3,C.base)+p('M-17 -7L-9 7M-9 -7L-1 7M-1 -7L7 7M7 -7L15 7M-25 -11V11M25 -11V11','none',1.1))+part('guide',-18,-25,ring(0,0,3,C.light))+strand('feed',-18,-19,'M0 -3Q-9 6 -4 17',1.8)+hand('rest',-24,-5),
    [move('rest',[[.64,'translate(0px,0px)'],[.75,'translate(.4px,-.4px)'],[.9,'translate(.4px,-.4px)']]),move('feed',[[.72,'rotate(1deg)'],[.89,'rotate(1deg)']], 'top center')],8000);
  add('waiting-tool','fibre-vat-pause','线束停在处理槽边','A fibre hank waits beside a vat','线束挂在槽边，没有浸入或翻搅；末端停在槽沿等待。',['线束挂在槽边','槽中没有搅动','末端靠住槽沿','保持等待处理'],
    part('vat',0,0,p('M-22 -12H22L17 11H-17Z',C.shade)+p('M-20 -7H20','none',1.1))+strand('hank',-13,-19,'M0 -7C-11 -7 -11 14 0 14C11 14 11 -7 0 -7M0 -7V14',2)+spool('stopped-spool',20,-23,.45)+strand('end',11,-11,'M0 -3Q-2 6 7 8L12 5',1.8)+hand('rest',23,3),
    [move('end',[[.62,'translate(0px,0px)'],[.76,'translate(-.4px,.3px) rotate(1deg)'],[.91,'translate(-.4px,.3px) rotate(1deg)']], 'top left')],8400);
  add('waiting-tool','shuttle-dock','梭子停在泊位','A shuttle rests in a dock','梭子停在托槽而非工作轨道，松线绕过托槽边缘静止。',['梭子留在托槽','线轴保持停止','线尾贴近托槽边','继续静止等待'],
    part('dock',0,4,p('M-25 -5V7H25V-5M-18 7V10M18 7V10','none',1.8))+part('shuttle',0,-4,p('M-22 0Q0 -19 22 0Q0 15 -22 0Z',C.base)+p('M-10 0H10','none',1.1))+spool('stopped-spool',0,-5,.45)+strand('tail',19,-3,'M0 0Q12 3 6 12L0 10',1.7)+hand('rest',-24,2),
    [move('tail',[[.66,'rotate(0deg)'],[.78,'rotate(1.5deg)'],[.91,'rotate(1.5deg)']], 'top left')],7700);
  add('waiting-tool','hooked-loop-hold','钩针停在线环中','A crochet hook holds still','钩针留在尚未继续的线环中，线尾保持松弛，手指只调整握持。',['钩针停在线环内','线轴保持停止','手指微调松握','线环保持原形'],
    part('hook',5,-14,p('M0 -18V11Q0 18 7 14Q12 10 5 7','none',2))+strand('held-loop',5,-3,'M0 -8C-10 -8 -10 9 0 9C10 9 10 -8 0 -8',2)+spool('stopped-spool',-17,-9,.8)+strand('tail',0,3,'M-8 -2Q-11 7 -20 6',1.7)+hand('grip',13,-8),
    [move('grip',[[.65,'rotate(0deg)'],[.75,'rotate(-2deg) translateX(.3px)'],[.9,'rotate(-2deg) translateX(.3px)']])],8100);

  // WAITING FOR A USER: a visible offered end is held, never worked or pulled.
  add('waiting-user','single-end','托住一根线头','Hold out a single end','掌中的线头朝前保持可接取姿态，身体和后方线轴都不工作。',['掌心托住线头','线头轻轻朝前','保持可接取位置','手腕回到松持'],
    spool('source',-19,-13,.7)+strand('offered',-8,-1,'M-8 -8Q0 -14 9 -7L23 -2',2)+hand('palm',14,1)+part('tip',21,-3,p('M-3 -1L3 -3M-3 -1L3 1','none',1.6)),
    [move('palm',[[.65,'translate(0px,0px)'],[.75,'translate(.5px,-.4px) rotate(-1deg)'],[.9,'translate(.5px,-.4px) rotate(-1deg)']]),glow('tip',[[.4,.8],[.8,.8]],.65)],8000);
  add('waiting-user','forked-ends','并托两条候选线','Hold two candidate ends','两只掌心托着分叉线端，保持两种选择并列，不替用户选择。',['分叉线端并列','左掌保持托起','右掌轻微转向前','两条线都保持开放'],
    strand('fork',-22,-7,'M0 0H15Q22 -13 36 -10M15 0Q22 13 36 10',2)+hand('upper-palm',17,-14)+hand('lower-palm',17,5)+part('tips',22,-6,p('M-3 -12L3 -10M-3 12L3 10','none',1.6))+ring(-22,-7,3,C.light),
    [move('upper-palm',[[.62,'rotate(0deg)'],[.75,'rotate(-1.5deg)'],[.9,'rotate(-1.5deg)']]),move('lower-palm',[[.67,'rotate(0deg)'],[.79,'rotate(1.5deg)'],[.92,'rotate(1.5deg)']])],8500);
  add('waiting-user','pattern-card-offer','托着花样卡等确认','Hold a pattern card for review','花样卡在双手之间朝前，一根线端停在卡侧，等待用户查看。',['双手托住花样卡','卡面保持朝前','线端停在卡侧','保持等待查看'],
    chart('offered-card',0,-10,'M-9 5L-3 -5L3 5L9 -5')+hand('left-palm',-21,0)+hand('right-palm',21,0)+strand('offered-end',17,-4,'M0 0Q10 2 7 11L2 10',1.8),
    [move('left-palm',[[.68,'translate(0px,0px)'],[.78,'translate(.3px,-.3px)'],[.91,'translate(.3px,-.3px)']]),move('right-palm',[[.68,'translate(0px,0px)'],[.78,'translate(-.3px,-.3px)'],[.91,'translate(-.3px,-.3px)']]),move('offered-end',[[.72,'rotate(1deg)'],[.9,'rotate(1deg)']], 'top center')],7800);
  add('waiting-user','choice-clips','捧着三只线夹','Offer three thread clips','三只不同形状的线夹并排陈列，手中的松端停在它们下方。',['线夹并排陈列','松端停在夹子下方','掌心稍转向前','保留全部选择'],
    part('clips',0,-13,p('M-23 -5H-11V7H-23ZM-5 7L1 -6L7 7Z',C.light)+ring(19,1,6,C.base))+strand('offered-end',0,2,'M-22 2Q-7 -7 8 0L22 2',2)+hand('palm',0,5)+part('tray',0,9,p('M-27 0H27','none',1.2)),
    [move('palm',[[.6,'rotate(0deg)'],[.74,'rotate(-1deg) translateY(-.3px)'],[.91,'rotate(-1deg) translateY(-.3px)']]),move('offered-end',[[.7,'translate(0px,-.3px)'],[.9,'translate(0px,-.3px)']])],8300);
  add('waiting-user','bow-ends','保留蝴蝶结两端','Hold two unjoined bow ends','两只开放的环停在两侧，松开的末端向前，尚未拉紧成结。',['保持两侧开放环','末端朝前托起','手指松握停留','保持未拉紧状态'],
    strand('left-loop',-10,-9,'M8 4C-17 -18 -20 11 -2 11Q4 11 8 4',2.1)+strand('right-loop',10,-9,'M-8 4C17 -18 20 11 2 11Q-4 11 -8 4',2.1)+strand('ends',0,-4,'M-2 0L-9 13M2 0L9 13',1.9)+hand('left-palm',-20,3)+hand('right-palm',20,3),
    [move('left-palm',[[.65,'translate(0px,0px)'],[.77,'translate(-.3px,.2px)'],[.91,'translate(-.3px,.2px)']]),move('right-palm',[[.65,'translate(0px,0px)'],[.77,'translate(.3px,.2px)'],[.91,'translate(.3px,.2px)']])],8700);
  add('waiting-user','seam-gap-offer','捧着未接合缝隙','Hold an open seam for review','两片织物之间留有清楚的缝隙，两根线端停在缝侧等待决定。',['托住分开的布片','保留中央缝隙','线端朝向前方','保持未接合状态'],
    swatch('left-cloth',-16,-9,18,22)+swatch('right-cloth',16,-9,18,22)+strand('left-end',-7,-3,'M0 0Q7 -10 7 -1',1.8)+strand('right-end',7,2,'M0 0Q-7 10 -7 1',1.8)+hand('left-palm',-24,4)+hand('right-palm',24,4),
    [move('left-end',[[.63,'rotate(0deg)'],[.75,'rotate(1.5deg)'],[.91,'rotate(1.5deg)']], 'left center'),move('right-end',[[.63,'rotate(0deg)'],[.75,'rotate(-1.5deg)'],[.91,'rotate(-1.5deg)']], 'right center')],8200);
  add('waiting-user','measure-end-offer','托着量带末端','Offer a measuring tape end','刻度带展开在掌心，末端停在可取的位置，没有继续测量。',['展开刻度带','掌心托住末端','保持末端可接取','保持当前长度'],
    part('tape',0,-9,box(-23,-5,46,10,1,C.light)+p('M-18 -5V0M-12 -5V2M-6 -5V0M0 -5V2M6 -5V0M12 -5V2M18 -5V0','none',.7))+part('tape-end',23,-9,p('M-2 -6H2V6H-2Z',C.shade))+hand('palm',20,2)+strand('slack',-23,-5,'M0 0Q-4 12 10 12',1.8),
    [move('palm',[[.67,'translate(0px,0px)'],[.79,'translate(.3px,-.4px)'],[.91,'translate(.3px,-.4px)']]),move('slack',[[.7,'rotate(1deg)'],[.9,'rotate(1deg)']], 'top left')],7600);
  add('waiting-user','needle-eye-offer','举着针眼与松线','Hold a needle eye and a loose end','针眼与线头保持分离并朝前，不在等待状态替用户穿针。',['举起针眼','线头停在针眼旁','掌心维持松握','保持尚未穿入'],
    needle('needle',9,-9)+strand('offered-end',-20,-7,'M0 10Q2 -15 18 -10L22 -6',1.9)+hand('needle-palm',16,3)+hand('thread-palm',-19,4)+part('eye-light',9,-17,p('M0 -1V2','none',.7)),
    [move('needle-palm',[[.64,'rotate(0deg)'],[.76,'rotate(-1deg)'],[.9,'rotate(-1deg)']]),move('thread-palm',[[.69,'translate(0px,0px)'],[.81,'translate(.3px,-.2px)'],[.92,'translate(.3px,-.2px)']]),glow('eye-light',[[.45,.8],[.8,.8]],.6)],8400);
  add('waiting-user','weave-edge-offer','托起织边待指示','Hold up a woven edge','织片的开放边沿朝前，松线停在边缘环口，等待下一步指示。',['托起开放织边','边沿朝向前方','线端留在环口外','保持等待指示'],
    swatch('cloth',0,-13,36,22)+strand('open-edge',0,0,'M-18 -2Q-14 7 -10 -2Q-6 7 -2 -2Q2 7 6 -2Q10 7 14 -2L18 2',1.9)+hand('left-palm',-23,0)+hand('right-palm',23,0)+strand('loose-tip',18,0,'M0 2Q9 4 7 10',1.8),
    [move('loose-tip',[[.64,'rotate(0deg)'],[.77,'rotate(1.5deg)'],[.92,'rotate(1.5deg)']], 'top left'),move('right-palm',[[.72,'translate(-.3px,-.3px)'],[.9,'translate(-.3px,-.3px)']])],8000);
  add('waiting-user','joining-ring-offer','捧住连接环等回应','Hold a joining ring for a reply','空连接环托在一只掌心，另一只手提供松端，两者保持距离。',['掌心托住空环','另一只手托住松端','两者保持距离','等待用户回应'],
    part('offered-ring',11,-10,ring(0,0,8)+ring(0,0,5))+strand('offered-end',-22,-9,'M0 0Q9 -13 20 1',2)+hand('ring-palm',15,3)+hand('end-palm',-16,2)+part('tip',-2,-8,ring(0,0,1.2,C.base)),
    [move('ring-palm',[[.67,'rotate(0deg)'],[.8,'rotate(-1deg) translateY(-.2px)'],[.92,'rotate(-1deg) translateY(-.2px)']]),move('end-palm',[[.62,'rotate(0deg)'],[.75,'rotate(1deg)'],[.9,'rotate(1deg)']])],8600);

  // ERROR: the blockage persists. A tiny strain is stopped by it, never repaired.
  add('error','locked-knot','线结卡住松端','A knot blocks the loose end','中央线结保持收紧，两端的小幅张力被线结挡住，没有自行解开。',['线结保持卡住','左端轻微受力','张力停在线结处','保持受阻状态'],
    knot('blocked-knot',0,-8)+strand('left-end',-9,-8,'M0 0Q-9 5 -18 0',2)+strand('right-end',9,-8,'M0 0Q9 -5 18 0',2)+hand('stopped-grip',-23,-3),
    [move('left-end',[[.64,'translate(0px,0px)'],[.71,'scaleX(1.02) scaleY(.94)'],[.9,'scaleX(1.02) scaleY(.94)']], 'right center'),move('stopped-grip',[[.66,'translate(-.4px,0px)'],[.9,'translate(-.4px,0px)']])],8000);
  add('error','jammed-spool','线轴被结卡住','A knot jams a spool','线结卡在线轴出口与固定针之间，线轴不转，松端只轻触出口后停住。',['线轴保持停止','出口线结保持堵住','松端轻触出口','继续保持卡住'],
    spool('stopped-spool',-12,-8,1.15)+part('pin',9,-9,p('M0 -17V17','none',2)+ring(0,-17,2,C.light))+knot('jam',7,-7)+strand('tail',15,-6,'M0 0Q13 0 10 13L3 12',1.8)+hand('rest',-24,3),
    [move('tail',[[.65,'rotate(0deg)'],[.72,'rotate(-1deg) translateX(-.3px)'],[.91,'rotate(-1deg) translateX(-.3px)']], 'top left')],8400);
  add('error','crossed-warp','经线交叉堵住','Crossed warp blocks a shuttle','两组经线在中央交叉成结，梭子停在交叉处外侧，不穿过阻塞。',['经线保持交叉','梭子停在结外','握梭手轻微松开','阻塞保持原状'],
    part('frame',0,-8,p('M-23 -22V20M23 -22V20M-23 -22H23','none',1.5))+strand('crossed',0,-8,'M-16 -20L8 17M-6 -20L17 17M16 -20L-8 17M6 -20L-17 17',1.7)+knot('jam',0,-7)+part('stopped-shuttle',-22,0,p('M-6 0Q0 -5 9 0Q0 5 -6 0Z',C.light))+hand('grip',-23,5),
    [move('grip',[[.67,'rotate(0deg)'],[.76,'rotate(1.5deg)'],[.91,'rotate(1.5deg)']])],8200);
  add('error','trapped-hook','钩针困在线结中','A hook remains trapped in a knot','钩尖困在紧结内部，手柄微微受力后停住，线结始终不解开。',['钩尖困在线结内','手柄轻微受力','阻力让手柄停住','线结保持锁住'],
    knot('jam',0,-5)+part('hook',0,-19,p('M0 -18V10Q0 17 7 13Q11 9 5 7','none',2))+strand('tail',6,0,'M0 0Q15 11 20 4',1.8)+hand('handle-grip',7,-24),
    [move('handle-grip',[[.65,'translate(0px,0px)'],[.72,'translate(0px,-.4px) rotate(-1deg)'],[.9,'translate(0px,-.4px) rotate(-1deg)']]),move('hook',[[.7,'rotate(-.5deg)'],[.91,'rotate(-.5deg)']], 'bottom center')],7800);
  add('error','tension-snag','绷线被毛结挂住','A fibre snag blocks tension','长线段被导环旁的毛结挂住，远端轻拉后保持受阻，没有继续通过。',['毛结挂在导环旁','远端产生轻微张力','毛结挡住移动','保持受阻等待'],
    part('guide',-3,-9,ring(0,0,8)+p('M0 8V20M-10 20H10','none',1.2))+knot('snag',7,-9)+strand('left',-24,-9,'M0 0Q10 -3 18 0',1.8)+strand('right',16,-9,'M0 0L11 4',1.8)+hand('grip',24,-2),
    [move('right',[[.66,'translate(0px,0px)'],[.74,'scaleY(.94) rotate(-1deg)'],[.9,'scaleY(.94) rotate(-1deg)']], 'left center'),move('grip',[[.7,'translate(.3px,-.2px)'],[.91,'translate(.3px,-.2px)']])],8600);
  add('error','tangled-shuttle','梭子绕上线团','A shuttle is tangled in yarn','梭子被几条交错松线绕住，外端轻轻下垂，梭子保持不能运行。',['梭子停在缠线中','交错线圈保持原位','外端轻轻下垂','保持无法运行'],
    part('stopped-shuttle',0,-9,p('M-23 0Q0 -20 23 0Q0 18 -23 0Z',C.light))+strand('tangle',0,-9,'M-15 -7C-24 10 21 14 15 -8C10 -23 -14 12 -4 12C12 13 -13 -24 -15 -7M-20 3L22 -3',2.2)+strand('end',20,-6,'M0 0Q12 8 3 16',1.8)+hand('rest',-23,4),
    [move('end',[[.63,'translate(0px,0px)'],[.76,'translate(.3px,.5px) rotate(1deg)'],[.92,'translate(.3px,.5px) rotate(1deg)']], 'top left')],8800);
  add('error','cinched-bobbin','紧结勒住梭芯','A tight knot cinches a bobbin','束结箍住梭芯中段，梭芯固定在架上，线环手松开后停靠架边。',['束结勒住梭芯','梭芯保持固定','手指松开少许','手停在架边'],
    part('rack',0,1,p('M-20 -16V10H20V-16M-24 10H24','none',1.5))+spool('stopped-bobbin',0,-10,1.2)+strand('cinch',0,-10,'M-9 0Q0 -9 9 0Q0 9 -9 0M-8 -2L8 2',2.4)+knot('block',10,-8)+hand('rest',-23,2),
    [move('rest',[[.64,'rotate(0deg)'],[.75,'rotate(2deg) translateY(.3px)'],[.9,'rotate(2deg) translateY(.3px)']])],8100);
  add('error','buckled-stitches','针目挤在线阶上','Stitches bunch on a ladder','几只针目挤在同一横档，线梯无法继续推进，松端轻碰横档后停住。',['挤住的针目保持原位','线梯不再推进','松端轻碰横档','保持堵塞'],
    part('ladder',0,-8,p('M-16 -23V20M16 -23V20M-16 -15H16M-16 -3H16M-16 9H16','none',1.6))+strand('bunch',0,-12,'M-11 -1C-17 -12 1 -14 -2 -2C-5 9 -17 3 -11 -1M-1 -1C-7 -12 11 -14 8 -2C5 9 -7 3 -1 -1M9 -1C3 -12 21 -14 18 -2C15 9 3 3 9 -1',2)+strand('tail',-17,3,'M0 0Q-13 -3 -9 8L-2 7',1.8)+hand('rest',23,4),
    [move('tail',[[.63,'rotate(0deg)'],[.72,'rotate(-1deg) translateY(-.3px)'],[.9,'rotate(-1deg) translateY(-.3px)']], 'top right')],8300);
  add('error','blocked-eye','针眼被结堵住','A knot blocks a needle eye','针眼外侧的结挡住线头，针与结都不前进，持线手保持松握。',['结堵在针眼外','针保持原位','持线手微微松握','线头保持未穿过'],
    needle('needle',6,-9)+knot('block',1,-22)+strand('incoming',-22,-20,'M0 0Q6 -9 14 -3',1.8)+strand('loose-end',-8,-15,'M0 0Q-11 8 -6 20',1.8)+hand('thread-grip',-21,-15),
    [move('thread-grip',[[.65,'rotate(0deg)'],[.75,'rotate(1.5deg)'],[.92,'rotate(1.5deg)']]),move('loose-end',[[.72,'translate(-.3px,.3px)'],[.91,'translate(-.3px,.3px)']])],7900);
  add('error','braid-clamp-block','辫结卡在线夹前','A braid knot blocks a clamp','粗辫在夹具入口前打结，夹具与线结保持堵塞，另一端只显出轻微受力。',['线结卡在夹口前','夹具保持不动','远端轻微受力','保持无法推进'],
    part('clamp',14,-9,p('M-5 -14H8V14H-5M-5 -7H2M-5 7H2','none',2.2))+strand('braid',-16,-8,'M-10 -5L6 5L16 -5M-10 5L6 -5L16 5M-10 0H16',2)+knot('block',4,-8)+hand('end-grip',-24,-3)+strand('loose-tip',18,5,'M0 0Q7 7 9 0',1.8),
    [move('end-grip',[[.65,'translate(0px,0px)'],[.72,'translate(-.4px,0px) rotate(-1deg)'],[.9,'translate(-.4px,0px) rotate(-1deg)']]),move('loose-tip',[[.74,'rotate(1deg)'],[.91,'rotate(1deg)']], 'top left')],8500);

  for (const recipes of Object.values(states)) {
    for (const recipe of recipes) {
      Object.freeze(recipe.beats);
      for (const track of recipe.tracks) { track.keyframes.forEach(Object.freeze); Object.freeze(track.keyframes); Object.freeze(track); }
      Object.freeze(recipe.tracks); Object.freeze(recipe);
    }
    Object.freeze(recipes);
  }
  return Object.freeze({ species: 'thread', states: Object.freeze(states) });
});
