/* Original room-wide seasonal dressing. No actor, session or provider actions. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeThemeEnvironment = api;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';
  // Each row authors a window composition, two architectural groups and an
  // edge habitat. The identity of a room is its geometry, never a hue swap.
  const DEFINITIONS = [
    ['spring','vine|butterfly','trellis|sprout|seedpacket','shelf|watering|flower','grass','grow'],
    ['summer','bamboo|sun','rack|fan|teacup','curtain|shell|wave','reed','breeze'],
    ['autumn','maple|leaf','alcove|leafalbum|acorn','pegboard|leaf|book','leaves','press'],
    ['winter','frost|pine','shelf|snowglobe|candle','arch|pine|snowman','snow','settle'],
    ['halloween','bats|moon','string|bat|paperflag','alcove|pumpkin|candle','pumpkins','light'],
    ['christmas','pine|star','arch|wreath|bell','shelf|gift|pine','gifts','unwrap'],
    ['qingming','willow|kite','rack|kite|willow','trellis|sprout|teacup','moss','fly'],
    ['newyear','stars|wish','string|wish|star','alcove|bell|paperflag','confetti','wish'],
    ['lunarnewyear','lattice|lantern','arch|lantern|knot','pegboard|flower|wish','knots','unfold'],
    ['midautumn','clouds|moon','alcove|mooncake|teacup','arch|rabbit|lantern','clouds','reveal'],
    ['hanami','blossom|butterfly','trellis|blossom|fan','shelf|teacup|leafalbum','petals','bloom'],
    ['midsummer','meadow|sun','arch|wreath|ribbon','rack|flower|knot','flowers','weave'],
    ['dayofdead','marigold|paperflag','string|paperflag|flower','alcove|marigold|candle','marigolds','remember'],
    ['dragonboat','reeds|boat','rack|boat|drum','pegboard|ribbon|wave','ripples','row'],
    ['tanabata','stars|bridge','arch|bridge|star','string|wish|ribbon','starpath','connect'],
    ['lanternfest','lattice|moon','string|lantern|riddle','shelf|riddle|teacup','lanterns','answer'],
    ['diwali','night|lamp','alcove|lamp|flower','arch|lamp|paperflag','lamps','kindle'],
    ['holi','colorcloud|butterfly','rack|pigment|bowl','pegboard|ribbon|flower','pigments','mix'],
    ['easter','meadow|rabbit','trellis|egg|flower','shelf|basket|rabbit','eggs','match'],
    ['valentine','hearts|letter','alcove|letter|heart','string|heart|ribbon','letters','seal'],
    ['stpatrick','shamrock|sun','trellis|shamrock|seedpacket','rack|shamrock|watering','shamrocks','find'],
    ['thanksgiving','harvest|leaf','shelf|corn|basket','alcove|pumpkin|acorn','harvest','sort'],
    ['carnival','ribbons|star','arch|mask|feather','string|ribbon|bell','ribbons','flourish'],
    ['oktoberfest','wheat|sun','rack|pretzel|rope','shelf|basket|corn','wheat','braid'],
    ['loykrathong','lotus|moon','alcove|lotus|candle','shelf|bowl|flower','lotus','float'],
    ['songkran','water|sun','rack|bowl|watering','curtain|wave|flower','water','pour'],
    ['tulip','tulips|butterfly','trellis|tulip|seedpacket','shelf|flower|watering','tulips','open'],
    ['lavender','lavender|cloud','rack|lavender|letter','string|ribbon|knot','lavender','tie'],
    ['sunflower','sunflowers|sun','trellis|sunflower|watering','alcove|sunflower|prism','sunflowers','follow'],
    ['rainy','rain|cloud','string|rainbar|chime','shelf|bowl|teacup','raindrops','play'],
    ['snowfall','snow|pine','rack|snowman|ribbon','alcove|snowglobe|gift','snowballs','roll'],
    ['aurora','aurora|stars','arch|aurora|star','curtain|ribbon|prism','ice','weave-light'],
    ['meteor','orbits|meteor','pegboard|meteor|star','rack|prism|sundial','meteors','orbit'],
    ['solstice','sunpath|sun','alcove|sundial|prism','rack|fan|sunflower','sunmarks','turn-shadow'],
    ['ocean','sea|boat','shelf|bottle|shell','pegboard|wave|letter','shells','unroll'],
    ['bamboo','bamboo|rain','rack|chime|bamboo','curtain|fan|knot','bamboo','answer-wind'],
    ['firefly','fireflies|moon','trellis|firefly|leaf','alcove|sprout|lotus','fireflies','trace'],
    ['sailing','harbour|sail','rack|sail|rope','pegboard|boat|shell','sails','fold'],
    ['music','notes|stars','alcove|music|bell','shelf|drum|chime','notes','wind'],
    ['bookday','pages|leaf','shelf|book|leafalbum','pegboard|letter|clover','pages','bookmark'],
    ['chess','squares|cloud','pegboard|chess|star','alcove|book|sundial','squares','jump'],
    ['dawn','rays|sun','rack|prism|sunflower','curtain|star|bottle','spectrum','split-light'],
    ['nightmarket','lanterns|moon','arch|stall|lantern','string|paperflag|teacup','stalls','raise-lamps']
  ];
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const MOUNTS={trellis:[332,88,1153,88],rack:[334,93,1158,85],alcove:[346,86,1151,91],pegboard:[335,90,1160,84],string:[328,98,1150,97],arch:[343,83,1156,80],shelf:[340,97,1161,94],curtain:[332,91,1153,90]};
  const RECIPES = freeze(DEFINITIONS.map(row => ({ id: row[0], window: row[1].split('|'),
    left: { structure: row[2].split('|')[0], objects: row[2].split('|').slice(1), x: MOUNTS[row[2].split('|')[0]][0], y: MOUNTS[row[2].split('|')[0]][1] },
    right: { structure: row[3].split('|')[0], objects: row[3].split('|').slice(1), x: MOUNTS[row[3].split('|')[0]][2], y: MOUNTS[row[3].split('|')[0]][3] },
    edge: row[4], response: row[5] })));
  const getRecipe = id => RECIPES.find(recipe => recipe.id === id) || RECIPES[0];
  const signature = id => { const r = getRecipe(id); return JSON.stringify([r.window, r.left.structure, r.left.objects, r.right.structure, r.right.objects, r.edge]); };
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = { ink: '#70583d', wood: '#b28b58', paper: '#e6d4ac', green: '#8c9e78', gold: '#d5ad68', red: '#c28a6b', blue: '#8ca9ad', purple: '#a69bab' };
  // Small pixel silhouettes are assembled into architecture, not stretched
  // into a replacement room or sampled from the restricted character art.
  const PATHS = {
    sprout:'M22 51V18M22 35Q3 17 7 35L22 42M22 27Q41 8 38 27L22 34M9 48H37L33 60H13Z',
    seedpacket:'M7 12H39V59H7ZM11 18H35M15 45Q14 29 24 28Q35 36 29 45ZM23 27V20',
    watering:'M7 28H31V54H7ZM31 34L43 21L47 25L32 44M10 28V15H27V28M12 55H32',
    flower:'M23 61V29M23 45L9 35L8 45L23 52M23 39L38 28L37 41Z M17 8H29V16H37V28H29V36H17V28H9V16H17Z',
    fan:'M24 59L2 20L10 10L24 5L38 10L46 20Z M24 59L10 10M24 59V5M24 59L38 10',
    teacup:'M5 27H33V48H5ZM33 30H43V43H33M1 53H39M12 20V11H17V5M25 20V10',
    shell:'M4 47Q0 20 24 13Q48 20 44 47L27 57H21ZM24 16V53M14 20L20 51M35 20L28 51M6 31L18 49M42 31L30 49',
    wave:'M1 28Q11 10 23 28T47 28M1 42Q11 24 23 42T47 42M1 55Q11 37 23 55T47 55',
    leafalbum:'M4 11H41V59H4ZM9 15H36V55H9ZM20 43Q8 24 26 22Q39 39 20 43ZM19 46L28 27',
    leaf:'M23 3L30 16L42 11L37 26L47 32L32 38L27 54L20 40L3 35L15 24L10 12L21 18ZM23 22V62',
    acorn:'M9 25H38V37H9ZM13 37Q10 58 24 62Q39 56 34 37M24 25V12H33',
    snowglobe:'M7 47Q-1 13 24 6Q49 13 41 47ZM12 49H36L42 61H6ZM24 16L12 37H36ZM7 25H11M32 17H36M31 39H35',
    pine:'M24 3L7 24H15L3 43H16L8 55H40L32 43H45L33 24H41ZM22 55V63H28V55',
    candle:'M12 26H35V61H12ZM24 2Q9 20 24 23Q40 20 24 2ZM9 61H39',
    pumpkin:'M5 28Q-2 12 22 14Q48 12 43 28V48Q23 66 5 48ZM23 14V3H34L27 15M14 30L20 24L23 32ZM29 32L33 24L39 30ZM13 42L20 47L25 42L31 47L37 41',
    bat:'M24 24Q12 3 1 12L5 35L14 30L23 43L34 30L43 35L47 12Q34 3 24 24ZM19 25L20 15L25 20L30 15L31 26',
    gift:'M3 29H45V60H3ZM0 20H48V30H0ZM20 20V60H27V20M23 20Q-1 0 11 4L24 19Q47-2 39 4L26 19',
    bell:'M8 43Q10 11 24 11Q39 11 40 43ZM5 44H43M24 11V3M20 48V57H28V48',
    kite:'M24 3L45 26L24 49L3 26ZM24 3V49M3 26H45M24 49L18 55L31 61L21 67',
    willow:'M30 60V7M30 14Q4 12 5 43M29 23Q44 22 43 53M18 18V50M36 28V59M6 27L12 34M40 37L46 44',
    wish:'M14 12H36V53L25 61L14 53ZM25 12V2M19 22H31M19 30H31M19 38H27',
    star:'M24 2L31 20L48 23L35 35L38 54L24 44L10 54L13 35L0 23L17 20Z',
    lantern:'M13 11H35V18H13ZM6 18Q24 7 42 18V45Q24 57 6 45ZM13 45H35V52H13ZM24 52V64M16 19V45M31 19V45',
    knot:'M24 22Q0 0 5 23Q8 43 24 22Q48 0 43 23Q40 43 24 22ZM24 23L11 54L23 46L24 64L27 46L38 54Z',
    moon:'M27 3Q-1 8 4 33Q12 62 40 51Q16 48 14 28Q13 12 27 3Z',
    mooncake:'M4 26L11 18H37L44 26V50L37 58H11L4 50ZM10 31H38V47H10ZM17 35H31V43H17',
    rabbit:'M12 34V8Q13-1 19 9V30M26 31L31 9Q36 2 37 12L33 36M6 53Q0 33 23 31Q46 33 41 53L37 62H10ZM30 40H34',
    blossom:'M21 5H29V18L40 13L45 24L34 30L45 37L38 47L29 41V55H17V42L5 47L0 36L13 29L2 21L10 12L20 18Z',
    ribbon:'M8 5Q45 15 18 29T31 53L26 64M31 5Q-2 15 25 29T12 53L18 64',
    wreath:'M24 4Q49 6 46 32Q43 58 20 58Q-3 53 1 26Q4 4 24 4ZM24 13Q10 13 10 30Q9 47 24 49Q39 46 38 29Q38 14 24 13ZM17 56L11 67M29 56L35 67',
    marigold:'M16 7H31V14H39V24H45V37H38V47H29V54H16V47H6V36H0V24H7V15H16ZM14 21H32V39H14ZM24 54V64',
    paperflag:'M2 5H46V50L39 45L32 51L24 45L16 51L8 45L2 50ZM11 15H19V25H11ZM28 15H36V25H28ZM11 34H37',
    boat:'M0 40H48L39 59H10ZM10 24H37V40H10ZM24 24V4L41 20H24M5 63H43',
    drum:'M3 22Q24 10 45 22V53Q24 65 3 53ZM3 22Q24 34 45 22M5 29L41 50M42 30L6 52M11 6L37 18M37 4L11 18',
    bridge:'M0 57V34Q24 8 48 34V57M0 38Q24 15 48 38M0 48H48M9 32V48M20 26V48M32 28V48M42 35V48',
    riddle:'M7 6H42V59H7ZM13 13H35M13 22H32M19 33Q19 23 28 29Q36 35 24 41V46M23 51H27',
    lamp:'M2 42Q24 65 46 42ZM4 40H44M25 7Q11 25 24 34Q39 25 25 7ZM16 36H32',
    bowl:'M0 34H48Q44 61 24 61Q4 61 0 34ZM5 29H43M15 19V11M30 20V5',
    pigment:'M0 43H46L40 60H7ZM7 43L24 20L40 43M21 19L33 4L38 8L28 24',
    egg:'M24 4Q3 16 5 44Q8 64 25 64Q45 63 44 44Q44 18 24 4ZM8 32H41M7 46H44M14 24H18M29 53H34',
    heart:'M24 60L3 33Q-6 7 13 6Q21 6 24 16Q30 5 39 7Q55 10 45 33Z',
    letter:'M1 18H47V56H1ZM1 18L24 38L47 18M1 56L18 37M47 56L30 37',
    clover:'M24 32Q-2 32 6 13Q15 1 24 22Q32 0 42 13Q49 31 27 32Q46 40 34 51Q23 58 23 36Q16 57 4 45Q-3 33 24 32ZM24 34L18 64',
    corn:'M16 6H29V46H16ZM11 18L2 30L19 60L25 48L44 25L32 16M20 11H26M20 19H26M20 27H26M20 35H26',
    pretzel:'M24 31Q-1-1 1 28Q1 54 24 54Q48 54 47 28Q48-1 24 31L10 51M24 31L38 51M8 27Q10 10 21 31M40 27Q38 10 27 31',
    lotus:'M23 10Q40 23 25 43Q45 9 47 32Q46 51 25 57Q2 52 0 31Q5 13 23 43Q9 24 23 10ZM2 58H46',
    tulip:'M22 29L9 9L4 32Q3 51 24 52Q44 50 43 31L37 9L24 28L23 3ZM24 52V65M24 58L8 48',
    lavender:'M14 62L23 9M23 62L35 9M5 22H19V29H5ZM9 13H23V20H9ZM27 17H41V24H27ZM24 29H38V36H24ZM8 36H21V43H8Z',
    sunflower:'M22 2L29 11L39 6L40 17L49 23L40 30L42 42L30 41L24 51L17 41L5 43L8 31L0 25L9 18L9 6L19 10ZM16 17H32V34H16ZM24 50V65',
    rainbar:'M2 28H11V61H2ZM15 22H24V57H15ZM28 17H37V53H28ZM41 10H49V49H41ZM7 4L11 13L7 18L3 13Z',
    snowman:'M24 7Q8 7 9 23Q9 37 24 37Q41 36 40 22Q39 7 24 7ZM24 35Q0 35 2 55Q23 71 46 55Q48 35 24 35ZM8 29H40V36H8M34 36V49M17 18H20M28 18H31',
    aurora:'M1 12Q15 0 29 12T48 12V21Q35 34 21 21T1 21ZM1 33Q18 19 31 33T48 33V42Q35 54 20 42T1 42ZM4 61L17 46L29 59L38 48L48 61',
    meteor:'M31 15L35 24L46 26L37 33L40 45L30 39L20 45L22 33L13 26L25 24ZM1 4L24 22M0 17L18 28M4 29L15 32',
    sundial:'M1 47Q24 27 47 47Q48 65 24 65Q1 64 1 47ZM24 48L28 10L38 49ZM6 49L14 52M11 40L17 45M28 57V63M35 52L42 55',
    bottle:'M15 17H31V27Q44 33 41 57Q24 69 7 57Q4 34 17 27V17ZM16 4H31V16H16ZM17 33H31V54H17ZM20 39H28M20 45H28',
    chime:'M1 8H47M8 8V20H17V47H8V20M23 8V17H32V57H23V17M39 8V23H47V50H39V23M28 57V64H36',
    firefly:'M24 28Q1 2 5 27L21 34Q-2 42 8 51L22 39Q16 62 26 65Q39 61 31 39Q55 55 48 34L32 31Q55 6 34 24ZM21 32H32V51H21Z',
    sail:'M23 0V48H1L21 8M27 9L46 42H27ZM1 51H48L39 64H10Z',
    music:'M2 29H44V61H2ZM2 29L7 5H44V29ZM10 37H35V53H10ZM44 40H51V27M16 14V24L27 21V10',
    book:'M1 13Q14 5 25 15Q36 4 48 13V57Q36 49 25 59Q13 49 1 57ZM25 15V59M7 22H18M31 23H42M7 33H18M31 34H42',
    chess:'M5 58H43V65H5ZM12 54L17 41L12 35L29 11L38 17L43 39L32 47L35 55ZM26 19H30M7 2H42V7H7',
    prism:'M24 5L47 54H0ZM24 5V54M1 54L24 40L47 54M0 25L18 29M34 29L48 19M35 36L50 37M36 42L47 53',
    stall:'M3 20H45V59H3ZM0 11H48L42 1H7ZM7 24H41V43H7M0 49H48M10 60V65M38 60V65',
    mask:'M0 18Q24 3 48 18L44 44L24 56L4 44ZM8 24L20 21L17 33L7 32ZM29 21L41 24L40 32L31 33M20 43H29',
    feather:'M14 55Q-1 33 12 6Q41 9 34 32L14 55M8 64L30 17M14 45L9 32M20 34L31 28',
    basket:'M3 29H45L40 61H8ZM8 29V16Q24-2 40 16V29M7 39H43M8 49H42M16 30V60M30 30V60',
    rope:'M8 4Q38 0 37 23Q37 45 9 42Q-5 38 2 24Q12 10 26 30Q43 59 9 64M19 16L24 7M29 42L39 49',
    bamboo:'M7 0H16V64H7ZM31 3H41V64H31M7 17H16M7 38H16M31 21H41M31 43H41M16 29L29 17M31 36L20 48',
    cloud:'M2 31Q-2 13 12 16Q20-4 32 13Q47 9 47 31ZM0 39H48M7 48H42',
    sun:'M24 12L36 24L24 36L12 24ZM24 0V8M24 40V49M0 24H8M40 24H48M5 5L11 11M37 37L44 44M5 44L11 37M37 11L44 5'
  };
  PATHS.butterfly='M24 29Q0-5 2 22Q2 39 20 34Q0 39 8 55Q18 64 24 38Q30 64 41 55Q48 40 28 34Q46 38 47 21Q47-5 24 29ZM24 25V48M24 26L17 15M24 26L31 15';
  PATHS.shamrock='M24 32Q7 23 10 9Q15-2 24 12Q33-2 38 9Q43 23 24 32ZM23 33Q7 12 1 28Q-4 46 15 44Q25 43 23 33ZM25 33Q42 12 48 28Q53 46 34 44Q24 43 25 33ZM24 34L19 63';
  Object.freeze(PATHS);
  function create({ office, world, getState = () => ({}) } = {}) {
    if (!office || !world) throw new TypeError('A theme environment needs its real room');
    const document = world.ownerDocument, view = document.defaultView;
    const svg = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (parent) parent.append(n); return n; };
    const div = name => { const n = document.createElement('div'); n.className = name; n.setAttribute('aria-hidden', 'true'); world.append(n); return n; };
    const layer = div('theme-environment'), windowLayer = div('theme-window');
    let state = {}, recipe, destroyed = false, animations = [], serial = 0;
    const records = new Map(), moving = [];
    const quiet = () => Boolean(state.hidden || document.hidden || state.reducedMotion || state.lowPower);
    function cancel() { serial += 1; for (const a of animations) a.cancel(); animations = []; layer.dataset.playing = 'false'; }
    function icon(name, x, y, scale, parent, region) {
      name=({stars:'star',rain:'cloud'})[name]||name;
      const g = svg('g', { transform: 'translate(' + x + ' ' + y + ') scale(' + scale + ')', 'data-silhouette': name, 'data-region': region }, parent);
      const ink=svg('g',{class:'theme-object-state'},g);
      const p = svg('path', { d: PATHS[name] || PATHS.star, fill: COLORS.paper, stroke: COLORS.ink, 'stroke-width': 1.7, 'stroke-linejoin': 'miter', 'fill-rule': 'evenodd' }, ink);
      if (['flower','blossom','heart','ribbon','marigold','pumpkin','gift','pigment'].includes(name)) p.setAttribute('fill', COLORS.red);
      if (['sprout','pine','leaf','willow','wreath','clover','shamrock','bamboo','lotus','tulip','lavender'].includes(name)) p.setAttribute('fill', COLORS.green);
      if (['star','lamp','sun','corn','sunflower','bell','lantern','firefly'].includes(name)) p.setAttribute('fill', COLORS.gold);
      if (['wave','prism','aurora','snowglobe','bottle','cloud'].includes(name)) p.setAttribute('fill', COLORS.blue);
      return g;
    }
    function structure(kind, parent) {
      const d = { shelf: 'M0 60H112V67H0ZM6 5V60M106 5V60M0 3H112', rack: 'M0 0H112M8 0V66M104 0V66M0 66H112M14 9H98',
        trellis: 'M3 66V3H109V66M3 21H109M3 42H109M27 3V66M54 3V66M81 3V66',
        pegboard: 'M0 0H112V67H0ZM10 10H14M30 10H34M50 10H54M70 10H74M90 10H94M10 28H14M50 28H54M90 28H94',
        string: 'M0 3Q56 27 112 3M3 0V11M109 0V11M20 13V23M86 13V23',
        alcove: 'M0 67V11L11 0H101L112 11V67ZM5 63H107M6 12H106',
        arch: 'M0 67V28Q56-23 112 28V67M5 67V29Q56-13 107 29V67',
        curtain: 'M0 0H112V8H0ZM7 8V61L21 53L35 61L49 53L63 61L77 53L91 61L105 53V8M18 9V35M43 9V37M70 9V34M95 9V36' }[kind];
      svg('path', { d, fill: kind === 'alcove' || kind === 'curtain' ? '#bd9e6b33' : 'none', stroke: COLORS.wood, 'stroke-width': 3 }, parent);
    }
    function wall(group, region, parent) {
      const g = svg('g', { transform: 'translate(' + group.x + ' ' + group.y + ')', 'data-region': region, 'data-structure': group.structure }, parent);
      structure(group.structure, g);
      const frame = svg('g', { class: 'theme-response-group', 'data-response-region': region }, g);
      const placements={shelf:[[12,12,.67],[65,4,.72]],rack:[[11,9,.65],[63,14,.61]],trellis:[[13,17,.63],[64,8,.68]],pegboard:[[9,8,.69],[64,12,.65]],
        string:[[9,18,.59],[70,13,.62]],alcove:[[13,10,.68],[65,11,.66]],arch:[[12,15,.65],[64,8,.72]],curtain:[[7,18,.6],[68,13,.61]]}[group.structure];
      group.objects.forEach((name, i) => icon(name, ...placements[i], frame, region));
      moving.push({ node: frame, region });
    }
    function windowArt(parent) {
      const [habitat, detail] = recipe.window;
      const g = svg('g', { 'data-region': 'window', 'data-habitat': habitat }, parent);
      const branch = ['vine','bamboo','maple','pine','willow','blossom','meadow','marigold','reeds','harvest','wheat','tulips','lavender','sunflowers','clover','shamrock'].includes(habitat);
      if (branch) {
        svg('path', { d: 'M-8 331L26 252L17 177L46 96L30 19M25 251L77 200M21 180L-4 129M45 98L91 56', fill: 'none', stroke: COLORS.wood, 'stroke-width': 7 }, g);
        const leaf = ({ maple:'leaf', pine:'pine', willow:'willow', bamboo:'bamboo', blossom:'blossom', marigold:'marigold', reeds:'sprout', wheat:'corn', tulips:'tulip', lavender:'lavender', sunflowers:'sunflower', clover:'clover',shamrock:'shamrock' })[habitat] || 'sprout';
        [[15,190,.8],[37,83,.74],[61,28,.56],[-7,112,.64]].forEach(p => icon(leaf, ...p, g, 'window'));
      } else if (['sea','water','harbour','lotus'].includes(habitat)) {
        for (let i=0;i<5;i++) svg('path',{d:'M-5 '+(210+i*24)+'Q30 '+(195+i*24)+' 65 '+(210+i*24)+'T205 '+(210+i*24),fill:'none',stroke:COLORS.blue,'stroke-width':3,opacity:.55},g);
        if(habitat==='lotus')icon('lotus',100,228,.9,g,'window');
      } else if (['aurora','ribbons','colorcloud'].includes(habitat)) {
        for(let i=0;i<3;i++)svg('path',{d:'M-10 '+(65+i*43)+'Q60 '+(12+i*43)+' 117 '+(67+i*43)+'T210 '+(52+i*43)+'v15Q140 '+(107+i*43)+' 72 '+(60+i*43)+'T-10 '+(82+i*43)+'Z',fill:[COLORS.green,COLORS.purple,COLORS.blue][i],opacity:.55},g);
      } else if(['frost','snow'].includes(habitat)) {
        svg('path',{d:'M0 0H200L182 26L166 6L139 34L112 9L90 31L59 6L31 30L0 10ZM0 330V286L21 301L35 279L47 312L70 295L90 322L122 303L153 323L177 299L200 312V330Z',fill:'#e6e6d5',opacity:.7},g);
        [[20,80],[135,150],[74,225],[168,39]].forEach(([x,y])=>svg('path',{d:'M'+(x-5)+' '+y+'h10m-5-5v10',stroke:'#f1edd3','stroke-width':2},g));
      } else {
        const motifs = { bats:'bat', stars:'star', night:'lamp', hearts:'heart', lattice:'lantern', clouds:'cloud', orbits:'meteor', sunpath:'sun', fireflies:'firefly', notes:'music', pages:'book', squares:'chess', rays:'prism', rain:'cloud', lanterns:'lantern' };
        [[20,28,.66],[119,66,.7],[51,166,.64],[145,235,.56]].forEach(p=>icon(motifs[habitat]||'star',...p,g,'window'));
        if(habitat==='orbits')svg('ellipse',{cx:103,cy:145,rx:92,ry:54,fill:'none',stroke:COLORS.gold,'stroke-width':2,transform:'rotate(-22 103 145)'},g);
        if(habitat==='lattice')svg('path',{d:'M0 57H200M0 163H200M57 0V330M142 0V330',stroke:COLORS.red,'stroke-width':3,opacity:.5},g);
        if(habitat==='squares')for(let i=0;i<6;i++)svg('rect',{x:(i%2)*98,y:Math.floor(i/2)*108,width:98,height:108,fill:COLORS.wood,opacity:i%2?.08:.22},g);
      }
      const sprite = svg('g',{class:'theme-window-response','data-response-region':'window'},parent);
      icon(detail,114,137,.88,sprite,'window'); moving.push({node:sprite,region:'window'});
    }
    function edgeArt(parent) {
      const edge = svg('g',{'data-region':'edge','data-edge':recipe.edge},parent);
      const shape = { grass:'sprout', reed:'bamboo', leaves:'leaf', snow:'pine', pumpkins:'pumpkin', gifts:'gift', moss:'clover', confetti:'star', knots:'knot', clouds:'cloud', petals:'blossom', flowers:'flower', marigolds:'marigold', ripples:'wave', starpath:'star', lanterns:'lantern', lamps:'lamp', pigments:'pigment', eggs:'egg', letters:'letter', clovers:'clover',shamrocks:'shamrock', harvest:'corn', ribbons:'ribbon', wheat:'corn', lotus:'lotus', water:'wave', tulips:'tulip', lavender:'lavender', sunflowers:'sunflower', raindrops:'rainbar', snowballs:'snowman', ice:'prism', meteors:'meteor', sunmarks:'sundial', shells:'shell', bamboo:'bamboo', fireflies:'firefly', sails:'sail', notes:'music', pages:'book', squares:'chess', spectrum:'prism', stalls:'stall' }[recipe.edge];
      [[2,533,.77],[29,609,.65],[1227,499,.75],[1212,605,.8]].forEach((p,i)=>{
        const g=svg('g',{class:'theme-edge-response','data-response-region':'edge-'+i},edge);icon(shape,...p,g,'edge');moving.push({node:g,region:'edge-'+i});
      });
      svg('path',{d:'M0 693h130l-18-8H0ZM1140 694h140v-9h-126Z',fill:COLORS.wood,opacity:.24},edge);
      // A full foreground woven runner makes the motif inhabit the room,
      // rather than stopping at a shelf-sized illustration.
      const runner=svg('g',{'data-region':'runner','data-runner':recipe.edge},parent);
      svg('path',{d:'M128 647H1152L1237 705H43ZM139 653H1141L1209 697H71Z',fill:'#c5ad7b36',stroke:'#c8af7c66','stroke-width':2,'fill-rule':'evenodd'},runner);
      for(let i=0;i<13;i++)icon(shape,111+i*82,655,.28,runner,'runner');
      svg('path',{d:'M138 678H1141M147 682H1134',stroke:COLORS.wood,'stroke-width':1,opacity:.45},runner);
    }
    function canopy(parent){
      const group=svg('g',{'data-region':'canopy'},parent);
      // Independent spans keep the real clock/count surface untouched.
      for(const [left,right]of[[171,446],[853,1271]]){
        svg('path',{d:'M'+left+' 74Q'+((left+right)/2)+' 106 '+right+' 74',fill:'none',stroke:COLORS.wood,'stroke-width':2,opacity:.8},group);
        const items=left<500?recipe.left.objects:recipe.right.objects;
        for(let i=0;i<4;i++){const x=left+18+(right-left-45)*i/3,y=75+Math.sin((i+1)*Math.PI/5)*15;icon(items[i%items.length],x,y,.32,group,'canopy');}
      }
    }
    function paint() {
      cancel(); moving.length=0; layer.replaceChildren();windowLayer.replaceChildren();
      const room=svg('svg',{viewBox:'0 0 1280 720','aria-hidden':'true',class:'theme-dressing'},layer);
      const glass=svg('svg',{viewBox:'0 0 200 330',preserveAspectRatio:'none','aria-hidden':'true'},windowLayer);
      const light=svg('g',{class:'theme-room-light','data-region':'ambient'},room);
      const season=root.OfficeFestivals?.getTheme(recipe.id).season||'spring';
      svg('path',{d:'M0 10L175 0L631 720H0ZM1280 0H1105L765 720H1280Z',fill:({spring:'#bad3a6',summer:'#e5ca8b',autumn:'#d6a17e',winter:'#a3bac7'})[season],opacity:.085},light);
      windowArt(glass);canopy(room);wall(recipe.left,'left-wall',room);wall(recipe.right,'right-wall',room);edgeArt(room);
      // Wood fixtures stay local. The central clock/count surface is empty.
      svg('path',{d:'M174 74H449M851 73H1271',stroke:COLORS.wood,'stroke-width':3,opacity:.55},room);
      layer.dataset.theme=recipe.id;windowLayer.dataset.theme=recipe.id;
      apply(records.get(recipe.id)||0);
    }
    function apply(step) {
      layer.dataset.step=String(step); windowLayer.dataset.step=String(step);
      const even=step%2===0;
      for(const item of moving){item.node.dataset.active=String(!even);item.node.style.setProperty('--theme-response',String(step%4));}
      const lights=layer.querySelectorAll('[data-silhouette="lamp"],[data-silhouette="candle"],[data-silhouette="lantern"],[data-silhouette="firefly"]');
      lights.forEach((n,i)=>{n.style.opacity=step===0?.58:(i+step)%3===0?.7:1;});
      const blooms=layer.querySelectorAll('[data-silhouette="flower"],[data-silhouette="blossom"],[data-silhouette="sprout"],[data-silhouette="tulip"]');
      blooms.forEach((n,i)=>{n.style.opacity=step===0?.64:((i+step)%3===0?.72:1);});
      // State lives in several objects across the room, not merely in the
      // clicked control. Folded paper, growing leaves, lifted clouds and lamps
      // retain their changed arrangement when their finite motion has ended.
      for(const surface of [layer,windowLayer])for(const object of surface.querySelectorAll('[data-silhouette]')){
        const name=object.dataset.silhouette,ink=object.querySelector('.theme-object-state'),phase=step%4;
        if(!ink)continue;
        let x=0,y=0,r=0,sx=1,sy=1;
        if(['flower','blossom','sprout','tulip','lavender','clover','shamrock'].includes(name)){sy=[.78,.9,1,.86][phase];r=[-4,2,0,4][phase];}
        else if(['gift','letter','seedpacket','riddle','fan','sail','book','leafalbum'].includes(name)){sx=[.82,1,.91,.97][phase];sy=name==='letter'?[1,.68,.48,.55][phase]:1;r=[0,-4,3,0][phase];}
        else if(['cloud','butterfly','bat','kite','meteor','firefly','boat'].includes(name)){x=[0,7,14,4][phase];y=[0,-4,-9,-2][phase];r=[0,-6,5,-2][phase];}
        else if(['ribbon','knot','paperflag','chime','bamboo','wreath'].includes(name)){r=[0,-8,7,-3][phase];sx=[1,.94,1.03,.97][phase];}
        else if(name==='sunflower'||name==='prism'||name==='sundial'){r=(name==='sundial'?[0,22,57,92]:[-9,0,11,-4])[phase];}
        else if(name==='chess'){x=[0,7,17,5][phase];y=[0,-12,-5,-15][phase];}
        else if(['lamp','candle','lantern','star','moon'].includes(name)){sy=[.91,1,.96,1.02][phase];y=[0,-2,1,-1][phase];}
        else{x=[0,-3,5,1][phase];y=[0,-2,-5,-1][phase];r=[0,3,-4,1][phase];}
        ink.style.transform='translate('+x+'px,'+y+'px) rotate('+r+'deg) scale('+sx+','+sy+')';
        ink.dataset.phase=String(phase);
      }
    }
    function update(next={}) {
      if(destroyed)return;state={...state,...next};
      const resolved=root.OfficeFestivals?.resolve({theme:state.theme,weather:state.weather,now:state.now});
      const selected=getRecipe(resolved?.theme||state.theme);
      if(!recipe||recipe.id!==selected.id){recipe=selected;paint();}
      const phase=['dawn','morning','afternoon','sunset','night'].includes(state.dayPhase)?state.dayPhase:'afternoon';
      layer.dataset.phase=phase;windowLayer.dataset.phase=phase;
      layer.dataset.quiet=String(quiet());windowLayer.dataset.quiet=String(quiet());
      if(quiet())cancel();
    }
    function trigger(payload={}) {
      if(destroyed)return false;
      const id=payload.theme||String(payload.id||'').replace(/^festival-/,''), selected=recipe?.id;
      if(id&&id!==selected)return false;
      const before=moving.map(item=>{
        const matrix=new view.DOMMatrixReadOnly(view.getComputedStyle(item.node).transform);
        return{x:matrix.m41,y:matrix.m42,rotation:Math.atan2(matrix.m12,matrix.m11)*180/Math.PI,scale:Math.hypot(matrix.m11,matrix.m12)};
      });
      const step=(records.get(selected)||0)+1;records.set(selected,step);cancel();apply(step);
      if(quiet())return true;
      const token=serial;layer.dataset.playing='true';
      // Every response moves the window habitat and both wall groups. The
      // action-specific geometry has independent paths instead of a blanket
      // translate/rotate applied to the complete room or any real character.
      const kind=recipe.response;
      moving.forEach((item,index)=>{
        const frames=Array.from({length:41},(_,i)=>{
          const p=i/40,s=Math.sin(p*Math.PI),settle=Math.sin(p*Math.PI*4)*(1-p);
          let x=0,y=0,r=0,scale=1;
          if(['grow','bloom','open','find'].includes(kind)){y=-s*(index%2?5:9);scale=1+s*(index%2?.035:.08);}
          else if(['breeze','weave','answer-wind','tie','braid'].includes(kind)){x=Math.sin(p*Math.PI*3+index*.7)*(1-p)*s*7;r=settle*(index%2?-5:5);}
          else if(['row','float','pour','unroll','fold'].includes(kind)){x=Math.sin(p*Math.PI*2+index*.35)*s*9;y=-s*(index%3+1)*2;r=s*(index%2?-3:3);}
          else if(['fly','orbit','trace','jump','connect'].includes(kind)){x=s*Math.cos(p*Math.PI*2+index)*13;y=-s*(index%2?7:15);r=settle*4;}
          else if(['light','kindle','raise-lamps','unwrap','unfold','reveal','remember'].includes(kind)){y=-s*(index%2?3:7);scale=1+s*.04;r=Math.sin(p*Math.PI*2)*(1-p)*(index%2?-2:2);}
          else{x=Math.sin(p*Math.PI*2)*(1-p)*(index%2?-4:4);y=-s*(3+index%3);r=settle*(index%2?-3:3);}
          const progress=Math.min(1,p/.24),bridge=1-progress*progress*(3-2*progress),prior=before[index];
          x+=prior.x*bridge;y+=prior.y*bridge;r+=prior.rotation*bridge;scale+=(prior.scale-1)*bridge;
          return{offset:p,transform:'translate('+x.toFixed(4)+'px,'+y.toFixed(4)+'px) rotate('+r.toFixed(4)+'deg) scale('+scale.toFixed(5)+')',opacity:1};
        });
        const a=item.node.animate(frames,{duration:1100,easing:'linear'});animations.push(a);
      });
      Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(destroyed||serial!==token)return;animations=[];layer.dataset.playing='false';});
      return true;
    }
    update(getState());
    return Object.freeze({update,trigger,destroy(){if(destroyed)return;destroyed=true;cancel();layer.remove();windowLayer.remove();records.clear();},state:()=>({destroyed,theme:recipe?.id,step:records.get(recipe?.id)||0,playing:layer.dataset.playing==='true',regions:moving.length})});
  }
  return Object.freeze({RECIPES,SILHOUETTES:PATHS,getRecipe,signature,create});
});
