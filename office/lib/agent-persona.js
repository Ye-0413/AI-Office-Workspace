/* Decorative cultural personas. Never infer skills, task progress, or provider evidence. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAgentPersona = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // v3 deliberately changes nickname mapping only. Each Chinese name below is
  // a whole attested mythological name, never a generated epithet/object pair.
  // Primary ancient text: 山海經, as transcribed at the chapter URLs. The right
  // side of "display|original" records only a simplified-character spelling;
  // names without a bar retain the source spelling. No runtime network access.
  // The pools are finite decoration, not actor IDs or uniqueness guarantees.
  function mythSource(chapter, entries) {
    return Object.freeze({
      chapter: '山海经·' + chapter,
      url: 'https://zh.wikisource.org/wiki/山海經/' + chapter,
      names: Object.freeze(entries.split(' ').map(entry => {
        const [name, original = name] = entry.split('|');
        return Object.freeze({ name, original });
      }))
    });
  }
  const nicknameSources = Object.freeze([
    mythSource('南山經', '狌狌 鹿蜀 旋龟|旋龜 猼訑 灌灌 赤鱬 狸力|貍力 长右|長右 猾褢 蛊雕|蠱雕 瞿如 虎蛟 凤皇|鳳皇'),
    mythSource('西山經', '羬羊 葱聋|蔥聾 肥遗|肥遺 鸾鸟|鸞鳥 凫徯|鳧徯 朱厌|朱厭 罗罗|羅羅 举父|舉父 蛮蛮|蠻蠻 英招 陆吾|陸吾 土蝼|土螻 钦原|欽原 长乘|長乘 胜遇 毕方|畢方 天狗 江疑 耆童 帝江 蓐收 红光|紅光 当扈|當扈 冉遗|冉遺 穷奇|窮奇 蠃鱼|蠃魚 文鳐|文鰩 槐鬼离仑|槐鬼離侖'),
    mythSource('北山經', '水马|水馬 何罗|何羅 孟槐 鳛鳛|鰼鰼 耳鼠 孟极|孟極 幽鴳 足訾 诸犍|諸犍 白鵺 那父 竦斯 窫窳 诸怀|諸懷 狍鸮|狍鴞 居暨 天马|天馬 鶌鶋 飞鼠|飛鼠 领胡|領胡 象蛇 酸与|酸與 精卫|精衛 女娃'),
    mythSource('東山經', '从从|從從 狪狪 軨軨 犰狳 朱獳 獙獙 蠪姪 峳峳 絜钩|絜鉤 妴胡 鮯鮯'),
    mythSource('中山經', '朏朏 鸣蛇|鳴蛇 化蛇 蠪蛭 马腹|馬腹 熏池 夫诸|夫諸 武罗|武羅 泰逢'),
    mythSource('大荒東經', '少昊 颛顼|顓頊 羲和 帝俊 晏龙|晏龍 司幽 天吴|天吳 折丹 禺京 奢比尸 应龙|應龍 蚩尤 王亥'),
    mythSource('大荒西經', '石夷 叔均 后稷 老童 祝融 太子长琴|太子長琴 巫咸 巫即 巫朌 巫彭 巫姑 巫真 巫礼|巫禮 巫抵 巫谢|巫謝 巫罗|巫羅 大鵹 少鵹 青鸟|青鳥 弇兹|弇茲 常羲 屏蓬 天犬 西王母 吴回 灵恝|靈恝 鱼妇|魚婦'),
    mythSource('大荒北經', '蜚蛭 琴虫|琴蟲 禺强|禺彊 九凤|九鳳 强良|彊良 夸父 相繇 风伯|風伯 雨师|雨師 苗龙|苗龍 融吾 弄明 烛九阴|燭九陰 女魃'),
    mythSource('海內經', '嫘祖 昌意 韩流|韓流 柏子高 素女 延维|延維 禺号|禺號 奚仲 吉光 义均|義均 听訞|聽訞 炎居 戏器|戲器 术器|術器 后土 噎鸣|噎鳴')
  ]);
  const chineseNames = Object.freeze(nicknameSources.flatMap(source => source.names.map(entry => entry.name)));
  // Independently authored short English sound units: 64 × 64 = 4,096
  // four/five-letter, single-word space-pet aliases (e.g. Lumi, Cosmo, Orbit).
  const englishFirst = Object.freeze('ba be bi bo bu ca ce ci co cu da de di do du fa fe fi fo fu ga ge gi go gu ka ke ki ko ku la le li lo lu ma me mi mo mu na ne ni no nu pa pe pi po pu ra re ri ro ru sa se si so su zu or el ax'.split(' '));
  const englishSecond = Object.freeze('ba be bi bo bu ca ce ci co cu da de di do du fa fe fi fo fu ga ge gi go gu ka ke ki ko ku la le li lo lu ma me mi mo mu na ne ni no nu pa pe pi po pu ra re ri ro ru sa se si so su va bit smo pix'.split(' '));
  // Sound units occasionally spell an unsuitable complete English word.
  // Curated one-to-one replacements keep all 4,096 outputs short and unique;
  // no RNG/retry or work/identity field is consulted when avoiding them.
  const englishReplacements = Object.freeze({
    Rape: 'Ravo', Pedo: 'Pexi', Kike: 'Kivo', Paki: 'Paxi', Dago: 'Daxo',
    Mofo: 'Moxi', Niga: 'Nixi', Nige: 'Nixe', Nigi: 'Nixo', Nigo: 'Nixu', Nigu: 'Niza', Nega: 'Nexi',
    Faga: 'Faxi', Fage: 'Faxe', Fagi: 'Faxo', Fago: 'Faxu', Fagu: 'Faza',
    Fapa: 'Fayo', Fape: 'Faya', Fapi: 'Faye', Fapo: 'Fayi', Fapu: 'Fayu',
    Fupa: 'Fuxi', Loli: 'Loxi', Dope: 'Doxi', Caca: 'Caxi', Kaka: 'Kaxi',
    Pipi: 'Pixi', Pupu: 'Puxi', Culo: 'Cuxi', Pene: 'Pexu', Figa: 'Fixi', Foda: 'Foxi',
    Suka: 'Suxi', Gago: 'Gaxi', Baka: 'Baxi', Dike: 'Dixi', Lame: 'Laxi',
    Puke: 'Puxo', Gore: 'Goxi', Lice: 'Lixi', Nude: 'Nuxi', Dupa: 'Duxi', Lube: 'Luxi'
  });
  function englishAlias(first, second) {
    const name = first[0].toUpperCase() + first.slice(1) + second;
    return Object.hasOwn(englishReplacements, name) ? englishReplacements[name] : name;
  }
  const traits = [
    ['把书签夹得很整齐', 'Keeps every bookmark in a neat row'],
    ['喜欢听渡轮轻轻靠岸', 'Likes the soft sound of a ferry arriving'],
    ['总给茶杯留一个小垫子', 'Always finds a little coaster for a cup'],
    ['收集云朵奇怪的形状', 'Collects curious cloud shapes'],
    ['喜欢窗边的一格阳光', 'Has a favourite patch of window sunlight'],
    ['会替铅笔排好队', 'Lines up pencils as a tiny parade'],
    ['把散步叫作灵感巡逻', 'Calls a stroll an inspiration patrol'],
    ['记得每一盆植物的位置', 'Remembers where every plant lives'],
    ['偏爱叮一声的小铃铛', 'Has a soft spot for little bells'],
    ['爱给便签画圆圆的角', 'Likes rounding the corners of sticky notes'],
    ['总能发现最小的彩虹', 'Spots even the smallest rainbow'],
    ['喜欢刚刚翻过的一页书', 'Likes the sound of a freshly turned page'],
    ['用杯垫记录下午的长度', 'Measures an afternoon in cup coasters'],
    ['把晚霞看作今日的信封', 'Sees the sunset as today’s envelope'],
    ['给每颗小石子编一个故事', 'Makes up a story for every pebble'],
    ['喜欢比别人早一点开小灯', 'Likes switching on a little lamp early'],
    ['觉得雨点也有自己的节拍', 'Thinks raindrops each have their own rhythm'],
    ['在风里辨认一丝茶香', 'Finds a trace of tea in the breeze'],
    ['喜欢书架上那一点留白', 'Likes a little empty space on a bookshelf'],
    ['对纸船的航线很有兴趣', 'Takes a keen interest in paperboat routes'],
    ['愿意替一朵花守住安静', 'Keeps a quiet moment for a flower'],
    ['给每支彩笔一个靠窗位', 'Finds a window seat for every crayon'],
    ['喜欢留住最后一格暖光', 'Likes saving the last square of warm light'],
    ['相信好点子可以慢慢发芽', 'Believes a good idea can sprout slowly']
  ];
  const greetings = [
    ['嗨，给你留了一个靠窗位。', 'Hi, I saved you a window seat.'],
    ['来得正好，茶香刚到。', 'Right on time. The tea smells lovely.'],
    ['你好，今天的云很有想法。', 'Hello! The clouds have ideas today.'],
    ['小灯亮着，随时欢迎你来。', 'The little lamp is on. Come by any time.'],
    ['嗨，借你一点海风。', 'Hi! Have a little harbour breeze.'],
    ['你好，一起看一眼窗外吧。', 'Hello. Shall we peek out of the window?'],
    ['刚好有一张空白便签给你。', 'There is a fresh sticky note for you.'],
    ['嗨，这个角落听得见风铃。', 'Hi. You can hear the chimes from here.'],
    ['你好，书签替你守着这一页。', 'Hello. The bookmark saved your page.'],
    ['欢迎来坐，杯垫已经摆好。', 'Take a seat. Your coaster is ready.'],
    ['嗨，今天也给好奇心留点位置。', 'Hi! There is room for curiosity today.'],
    ['先打个招呼，再看看小风景。', 'A little hello, then a little view.']
  ];
  const signoffs = [
    ['回头见，小灯替我留着。', 'See you soon. Leave my little lamp on.'],
    ['下次见，书签还在这一页。', 'See you next time. I left a bookmark here.'],
    ['我去收一小口海风。', 'Off to catch a little harbour breeze.'],
    ['回头见，茶杯放回老位置。', 'See you soon. My cup goes in its usual spot.'],
    ['让好点子在便签上歇一会。', 'Let the ideas rest on their sticky notes.'],
    ['等会见，我去看看云的形状。', 'Back soon. I am checking the cloud shapes.'],
    ['今天的暖光，分你一半。', 'Half of today’s warm light is yours.'],
    ['下回再一起听雨点打拍子。', 'Let us listen to the raindrop rhythm again.'],
    ['我把窗边位留给下一阵风。', 'I saved the window seat for the next breeze.'],
    ['回头见，风铃知道回来的路。', 'See you soon. The chimes know the way back.'],
    ['把这一页轻轻合上就好。', 'Just close this page gently.'],
    ['下次见，给你留一颗小星星。', 'See you next time. I saved you a little star.']
  ];
  // Stable symbolic tokens let the renderer choose an authored decorative prop.
  const keepsakes = Object.freeze(['teacup', 'paperboat', 'bookmark', 'lantern', 'leaf', 'pebble', 'bell', 'pencil', 'shell', 'star', 'acorn', 'ribbon']);
  const providerAliases = Object.freeze({ claude: 'claude-code', 'claude code': 'claude-code', 'cursor-agent': 'cursor', 'cursor agent': 'cursor' });

  function canonicalProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    return Object.hasOwn(providerAliases, provider) ? providerAliases[provider] : provider || 'agent';
  }

  function hash(value, salt) {
    let result = salt;
    // Index UTF-16 code units so distinct emoji IDs retain both surrogate halves.
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);
    result = Math.imul(result ^ (result >>> 13), 0xc2b2ae35);
    return (result ^ (result >>> 16)) >>> 0;
  }

  function forSession(session) {
    const value = session && typeof session === 'object' ? session : {};
    const key = JSON.stringify([canonicalProvider(value.provider), String(value.id || value.sessionId || '')]);
    const headHash = hash(key, 0x811c9dc5), tailHash = hash(key, 0x9e3779b9);
    const chineseName = chineseNames[headHash % chineseNames.length];
    const englishHead = englishFirst[headHash % englishFirst.length];
    const englishTail = englishSecond[tailHash % englishSecond.length];
    const trait = traits[hash(key, 0x85ebca6b) % traits.length];
    const greeting = greetings[hash(key, 0xc2b2ae35) % greetings.length];
    const signoff = signoffs[hash(key, 0x27d4eb2f) % signoffs.length];
    return Object.freeze({
      aliasZh: chineseName, aliasEn: englishAlias(englishHead, englishTail),
      traitZh: trait[0], traitEn: trait[1],
      greetingZh: greeting[0], greetingEn: greeting[1],
      keepsake: keepsakes[hash(key, 0x165667b1) % keepsakes.length],
      signoffZh: signoff[0], signoffEn: signoff[1]
    });
  }

  return Object.freeze({ version: 3, forSession, nicknameSources });
});
