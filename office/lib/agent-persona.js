/* Decorative harbour personas. Never infer skills, task progress, or provider evidence. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAgentPersona = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Append to these authored pools only when deliberately versioning the mapping.
  // Keeping this separate from Scene.identityName preserves every v1 identity.
  const first = [
    ['海风', 'Seabreeze'], ['潮汐', 'Tidal'], ['渡轮', 'Ferry'], ['灯塔', 'Lighthouse'],
    ['海盐', 'Seasalt'], ['珊瑚', 'Coral'], ['贝壳', 'Seashell'], ['浪花', 'Seafoam'],
    ['白帆', 'Sailcloth'], ['海湾', 'Harbour'], ['涟漪', 'Ripple'], ['礁石', 'Reef'],
    ['银滩', 'Silverbeach'], ['沙洲', 'Sandbar'], ['海蓝', 'Seablue'], ['远航', 'Voyage'],
    ['晨雾', 'Morningmist'], ['曙光', 'Dawn'], ['朝露', 'Dewdrop'], ['晴空', 'Bluesky'],
    ['午阳', 'Sunbeam'], ['暮光', 'Twilight'], ['晚霞', 'Sunset'], ['月湾', 'Moonbay'],
    ['星河', 'Starlight'], ['夜蓝', 'Nightblue'], ['暖雨', 'Warmrain'], ['微云', 'Cloudlet'],
    ['虹彩', 'Rainbow'], ['霜蓝', 'Frostblue'], ['春潮', 'Springtide'], ['秋光', 'Autumn'],
    ['桂花', 'Osmanthus'], ['山茶', 'Camellia'], ['茉莉', 'Jasmine'], ['白兰', 'Magnolia'],
    ['木棉', 'Kapok'], ['榕荫', 'Banyan'], ['青竹', 'Bamboo'], ['银杏', 'Ginkgo'],
    ['蕨叶', 'Fern'], ['松针', 'Pine'], ['枫糖', 'Maple'], ['苔绿', 'Moss'],
    ['紫藤', 'Wisteria'], ['荷香', 'Lotus'], ['柳芽', 'Willow'], ['桃枝', 'Peach'],
    ['普洱', 'Puer'], ['乌龙', 'Oolong'], ['抹茶', 'Matcha'], ['焙茶', 'Hojicha'],
    ['奶茶', 'Milktea'], ['柠茶', 'Lemontea'], ['蜜糖', 'Honey'], ['姜糖', 'Ginger'],
    ['芝麻', 'Sesame'], ['杏仁', 'Almond'], ['可可', 'Cocoa'], ['肉桂', 'Cinnamon'],
    ['薄荷', 'Mint'], ['香草', 'Vanilla'], ['豆蔻', 'Cardamom'], ['橙皮', 'Orangepeel'],
    ['翠玉', 'Jade'], ['琥珀', 'Amber'], ['靛蓝', 'Indigo'], ['赭石', 'Ochre'],
    ['月白', 'Moonwhite'], ['青瓷', 'Celadon'], ['铜光', 'Copper'], ['绒蓝', 'Velvetblue'],
    ['珠光', 'Pearlglow'], ['暖金', 'Warmgold'], ['石墨', 'Graphite'], ['玫粉', 'Rosepink'],
    ['墨绿', 'Evergreen'], ['雪松', 'Cedar'], ['奶白', 'Cream'], ['莓红', 'Berryred'],
    ['山径', 'Hillpath'], ['溪流', 'Brook'], ['石阶', 'Stonestep'], ['竹篱', 'Bamboofence'],
    ['花墟', 'Flowerstall'], ['山岚', 'Hillmist'], ['树影', 'Leafshade'], ['小岛', 'Islet'],
    ['茶寮', 'Teahouse'], ['纸窗', 'Paperwindow'], ['雨巷', 'Rainlane'], ['书页', 'Pageleaf'],
    ['风铃', 'Windchime'], ['石墙', 'Stonewall'], ['瓷瓦', 'Rooftile'], ['木窗', 'Woodframe'],
    ['菠萝', 'Pineapple'], ['椰丝', 'Coconut'], ['芋香', 'Taro'], ['红豆', 'Azuki'],
    ['栗子', 'Chestnut'], ['燕麦', 'Oat'], ['柚子', 'Yuzu'], ['青梅', 'Greenplum'],
    ['桑葚', 'Mulberry'], ['杏桃', 'Apricot'], ['石榴', 'Pomegranate'], ['蓝莓', 'Blueberry'],
    ['荔枝', 'Lychee'], ['龙眼', 'Longan'], ['山楂', 'Hawthorn'], ['金桔', 'Kumquat'],
    ['纸鹤', 'Papercrane'], ['雨点', 'Raindrop'], ['光斑', 'Dapple'], ['轻雪', 'Snowflake'],
    ['流萤', 'Firefly'], ['星砂', 'Starsand'], ['云絮', 'Cloudwisp'], ['虹桥', 'Rainbowbridge'],
    ['晨钟', 'Daybell'], ['萤石', 'Fluorite'], ['风筝', 'Kite'], ['月石', 'Moonstone'],
    ['暖灯', 'Lamplight'], ['棉云', 'Cottoncloud'], ['晚风', 'Eveningbreeze'], ['晴雨', 'Sunshower']
  ];
  const second = [
    ['小獭', 'Otter'], ['小雀', 'Sparrow'], ['小鹭', 'Egret'], ['小鸥', 'Gull'],
    ['小鹿', 'Fawn'], ['小狐', 'Fox'], ['小熊', 'Bear'], ['小兔', 'Bunny'],
    ['小猫', 'Kitten'], ['小鲸', 'Whale'], ['小豚', 'Dolphin'], ['小龟', 'Turtle'],
    ['小蛙', 'Frog'], ['小狸', 'Raccoon'], ['小鸮', 'Owl'], ['小雁', 'Goose'],
    ['小燕', 'Swallow'], ['小鸽', 'Pigeon'], ['小鹬', 'Sandpiper'], ['小鹪', 'Wren'],
    ['小貂', 'Marten'], ['小鼬', 'Ferret'], ['小猬', 'Hedgehog'], ['小鼠', 'Dormouse'],
    ['茶壶', 'Kettle'], ['茶盏', 'Teacup'], ['瓷勺', 'Spoon'], ['糖罐', 'Sugarpot'],
    ['布丁', 'Pudding'], ['奶冻', 'Custard'], ['曲奇', 'Cookie'], ['松饼', 'Waffle'],
    ['小挞', 'Tartlet'], ['汤圆', 'Dumpling'], ['麻薯', 'Mochi'], ['软糖', 'Gumdrop'],
    ['面包', 'Bun'], ['吐司', 'Toast'], ['豆包', 'Beanbun'], ['蛋卷', 'Wafer'],
    ['小灯', 'Lantern'], ['书签', 'Bookmark'], ['纸船', 'Paperboat'], ['邮票', 'Stamp'],
    ['纽扣', 'Button'], ['线团', 'Yarnball'], ['口袋', 'Pocket'], ['围巾', 'Scarf'],
    ['铃铛', 'Bell'], ['小鼓', 'Drum'], ['彩笔', 'Crayon'], ['风车', 'Pinwheel'],
    ['橡果', 'Acorn'], ['松果', 'Pinecone'], ['豆芽', 'Sprout'], ['花苞', 'Bud'],
    ['小菇', 'Mushroom'], ['羽毛', 'Feather'], ['小石', 'Pebble'], ['小舟', 'Skiff'],
    ['贝珠', 'Pearl'], ['小帆', 'Sail'], ['墨点', 'Inkdrop'], ['小窝', 'Nook']
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
    const head = first[hash(key, 0x811c9dc5) % first.length];
    const tail = second[hash(key, 0x9e3779b9) % second.length];
    const trait = traits[hash(key, 0x85ebca6b) % traits.length];
    const greeting = greetings[hash(key, 0xc2b2ae35) % greetings.length];
    const signoff = signoffs[hash(key, 0x27d4eb2f) % signoffs.length];
    return Object.freeze({
      aliasZh: head[0] + tail[0], aliasEn: head[1] + ' ' + tail[1],
      traitZh: trait[0], traitEn: trait[1],
      greetingZh: greeting[0], greetingEn: greeting[1],
      keepsake: keepsakes[hash(key, 0x165667b1) % keepsakes.length],
      signoffZh: signoff[0], signoffEn: signoff[1]
    });
  }

  return Object.freeze({ version: 1, forSession });
});
