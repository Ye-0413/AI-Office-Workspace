/* Decorative cultural personas. Never infer skills, task progress, or provider evidence. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAgentPersona = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Pool changes deliberately version the nickname mapping. Scene.identityName
  // and the separate English mapping retain every original identity.
  // Chinese v2 is independently authored: 256 epithets × 128 mythic,
  // celestial and classical objects = 32,768 four-character combinations.
  // English v1 stays independent and retains its original natural aliases.
  // A nickname is decorative; real IDs, family ancestry and work evidence win.
  const chineseFirst = Object.freeze([
    '青霄 赤霄 紫霄 碧落 云阙 云岫 云岚 云霄 流云 霁云 凌云 天游 扶摇 乘风 御风 追风 玄风 清风 朔风 回风 霁风 长风 太初 太虚 太清 上清 玉清 澄空 净空 霄汉 云汉 霞举',
    '流光 扶光 曦光 晨光 玄光 灵光 明光 曜光 凝光 霞光 霜光 星芒 映雪 流霞 晴岚 朝霞 暮霞 丹霞 碧霞 紫霞 烟霞 烟岚 霜华 雪霁 霁色 清晖 银辉 皓辉 朗照 澄辉 虹霓 逸光',
    '玄墨 玄青 玄素 玄苍 玄玉 玄羽 玄渊 玄霜 青冥 青玄 青岚 青芜 青璇 青璧 青萝 青岑 丹青 丹霄 丹枫 丹砂 丹羽 丹阙 丹华 丹心 朱墨 朱华 朱颜 朱晖 素月 素雪 素锦 素心',
    '昆仑 蓬莱 瀛洲 方丈 岱舆 员峤 瑶台 琼楼 玉京 玉阙 紫府 碧城 灵台 灵墟 灵岩 灵境 空山 远岫 苍梧 沧海 扶桑 汤谷 若木 建木 归墟 弱水 流沙 赤水 青丘 云梦 梦泽 沧溟',
    '兰亭 墨池 墨韵 墨香 墨华 墨羽 墨染 墨痕 锦书 锦瑟 锦云 锦绣 书海 书林 书山 砚边 松烟 徽墨 龙文 凤章 龙章 鸿文 华章 逸兴 雅韵 古意 清音 余音 希声 琴心 剑气 剑影',
    '凌霜 傲雪 映月 揽月 踏月 逐日 追日 观星 问天 问道 望远 乘云 御剑 横空 破晓 凌波 临渊 听澜 听雨 听松 听风 观澜 见山 寻幽 探微 怀瑾 握瑜 含章 藏锋 凝霜 流火 飞羽',
    '清和 清微 清远 清越 清漪 清泠 清晏 清寂 澄明 澄心 澄怀 澄江 澄霄 静渊 静岚 静川 静玄 宁渊 宁川 宁霄 逸尘 逸云 逸风 逸舟 无尘 无垢 无涯 无相 逍遥 自在 抱朴 归真',
    '春泽 春晖 春晏 春山 夏木 夏云 秋水 秋岚 秋澄 秋鸿 冬藏 冬青 寒江 寒烟 寒星 寒玉 夕照 晚照 晓霁 晓岚 月华 月影 月照 月隐 星澜 星野 星霭 星垂 天青 天启 天极 天纵'
  ].join(' ').split(' '));
  const chineseSecond = Object.freeze([
    '青鸾 烛龙 白泽 麒麟 玄武 朱雀 应龙 黄龙 苍龙 螭龙 螣蛇 鲲鹏 重明 毕方 九尾 陆吾',
    '英招 开明 乘黄 夫诸 天禄 辟邪 獬豸 貔貅 狻猊 狴犴 螭吻 嘲风 蒲牢 囚牛 赑屃 睚眦',
    '望舒 羲和 常羲 嫦娥 女娲 伏羲 夸父 精卫 句芒 蓐收 祝融 共工 后土 飞廉 屏翳 河伯',
    '天枢 天璇 天玑 天权 玉衡 开阳 瑶光 北辰 太微 紫微 天市 文昌 天钺 天魁 参商 南斗',
    '长庚 启明 岁星 荧惑 镇星 辰星 太白 太阴 斗柄 星槎 星舟 星盘 星图 星罗 辰宿 璇玑',
    '云笺 素笺 锦笺 玉笺 青简 竹简 金简 玉简 松砚 龙砚 凤砚 古砚 霜毫 紫毫 玉笔 银钩',
    '瑶琴 古琴 鸣琴 七弦 长笛 洞箫 玉箫 陶埙 笙歌 编钟 霓裳 流觞 龙泉 干将 莫邪 承影',
    '青锋 玉璧 玉璜 玉璋 琼枝 瑶华 琼英 嘉木 芳洲 汀兰 杜若 蘅芜 玉珩 碧玺 灵犀 天章'
  ].join(' ').split(' '));
  const englishFirst = [
    'Seabreeze', 'Tidal', 'Ferry', 'Lighthouse', 'Seasalt', 'Coral', 'Seashell', 'Seafoam',
    'Sailcloth', 'Harbour', 'Ripple', 'Reef', 'Silverbeach', 'Sandbar', 'Seablue', 'Voyage',
    'Morningmist', 'Dawn', 'Dewdrop', 'Bluesky', 'Sunbeam', 'Twilight', 'Sunset', 'Moonbay',
    'Starlight', 'Nightblue', 'Warmrain', 'Cloudlet', 'Rainbow', 'Frostblue', 'Springtide', 'Autumn',
    'Osmanthus', 'Camellia', 'Jasmine', 'Magnolia', 'Kapok', 'Banyan', 'Bamboo', 'Ginkgo',
    'Fern', 'Pine', 'Maple', 'Moss', 'Wisteria', 'Lotus', 'Willow', 'Peach',
    'Puer', 'Oolong', 'Matcha', 'Hojicha', 'Milktea', 'Lemontea', 'Honey', 'Ginger',
    'Sesame', 'Almond', 'Cocoa', 'Cinnamon', 'Mint', 'Vanilla', 'Cardamom', 'Orangepeel',
    'Jade', 'Amber', 'Indigo', 'Ochre', 'Moonwhite', 'Celadon', 'Copper', 'Velvetblue',
    'Pearlglow', 'Warmgold', 'Graphite', 'Rosepink', 'Evergreen', 'Cedar', 'Cream', 'Berryred',
    'Hillpath', 'Brook', 'Stonestep', 'Bamboofence', 'Flowerstall', 'Hillmist', 'Leafshade', 'Islet',
    'Teahouse', 'Paperwindow', 'Rainlane', 'Pageleaf', 'Windchime', 'Stonewall', 'Rooftile', 'Woodframe',
    'Pineapple', 'Coconut', 'Taro', 'Azuki', 'Chestnut', 'Oat', 'Yuzu', 'Greenplum',
    'Mulberry', 'Apricot', 'Pomegranate', 'Blueberry', 'Lychee', 'Longan', 'Hawthorn', 'Kumquat',
    'Papercrane', 'Raindrop', 'Dapple', 'Snowflake', 'Firefly', 'Starsand', 'Cloudwisp', 'Rainbowbridge',
    'Daybell', 'Fluorite', 'Kite', 'Moonstone', 'Lamplight', 'Cottoncloud', 'Eveningbreeze', 'Sunshower'
  ];
  const englishSecond = [
    'Otter', 'Sparrow', 'Egret', 'Gull', 'Fawn', 'Fox', 'Bear', 'Bunny',
    'Kitten', 'Whale', 'Dolphin', 'Turtle', 'Frog', 'Raccoon', 'Owl', 'Goose',
    'Swallow', 'Pigeon', 'Sandpiper', 'Wren', 'Marten', 'Ferret', 'Hedgehog', 'Dormouse',
    'Kettle', 'Teacup', 'Spoon', 'Sugarpot', 'Pudding', 'Custard', 'Cookie', 'Waffle',
    'Tartlet', 'Dumpling', 'Mochi', 'Gumdrop', 'Bun', 'Toast', 'Beanbun', 'Wafer',
    'Lantern', 'Bookmark', 'Paperboat', 'Stamp', 'Button', 'Yarnball', 'Pocket', 'Scarf',
    'Bell', 'Drum', 'Crayon', 'Pinwheel', 'Acorn', 'Pinecone', 'Sprout', 'Bud',
    'Mushroom', 'Feather', 'Pebble', 'Skiff', 'Pearl', 'Sail', 'Inkdrop', 'Nook'
  ];
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
    const chineseHead = chineseFirst[headHash % chineseFirst.length];
    const chineseTail = chineseSecond[tailHash % chineseSecond.length];
    const englishHead = englishFirst[headHash % englishFirst.length];
    const englishTail = englishSecond[tailHash % englishSecond.length];
    const trait = traits[hash(key, 0x85ebca6b) % traits.length];
    const greeting = greetings[hash(key, 0xc2b2ae35) % greetings.length];
    const signoff = signoffs[hash(key, 0x27d4eb2f) % signoffs.length];
    return Object.freeze({
      aliasZh: chineseHead + chineseTail, aliasEn: englishHead + ' ' + englishTail,
      traitZh: trait[0], traitEn: trait[1],
      greetingZh: greeting[0], greetingEn: greeting[1],
      keepsake: keepsakes[hash(key, 0x165667b1) % keepsakes.length],
      signoffZh: signoff[0], signoffEn: signoff[1]
    });
  }

  return Object.freeze({ version: 2, forSession });
});
