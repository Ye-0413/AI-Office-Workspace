/* What real observed history has earned: keepsakes on the shelf, room
 * decorations and a growth stage. Everything is a pure function of lifetime
 * usage counts, so the ledger can always be rebuilt from the usage log. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeProgression = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  // Same order and icons as the persona keepsakes shown on nameplates.
  const KEEPSAKES = Object.freeze([
    ['teacup', '♨', '茶杯', 'Teacup'], ['paperboat', '⛵', '纸船', 'Paper boat'], ['bookmark', '▤', '书签', 'Bookmark'],
    ['lantern', '✧', '灯笼', 'Lantern'], ['leaf', '❧', '叶子', 'Leaf'], ['pebble', '◇', '卵石', 'Pebble'],
    ['bell', '♧', '铃铛', 'Bell'], ['pencil', '✎', '铅笔', 'Pencil'], ['shell', '⌁', '贝壳', 'Shell'],
    ['star', '✦', '星星', 'Star'], ['acorn', '♧', '橡果', 'Acorn'], ['ribbon', '⋈', '缎带', 'Ribbon']
  ].map(([id, icon, zh, en]) => Object.freeze({ id, icon, zh, en })));
  const DECORATIONS = Object.freeze([
    { id: 'fern', stat: 'turns', need: 10, zh: '蕨叶盆栽', en: 'Fern pot', hintZh: '完成 10 轮', hintEn: '10 completed turns' },
    { id: 'lamp', stat: 'toolCalls', need: 100, zh: '暖光台灯', en: 'Warm lamp', hintZh: '100 次工具调用', hintEn: '100 tool calls' },
    { id: 'trophy', stat: 'checksPassed', need: 10, zh: '通过奖杯', en: 'Pass trophy', hintZh: '10 次测试或构建通过', hintEn: '10 passed tests or builds' },
    { id: 'bunting', stat: 'days', need: 5, zh: '五日彩旗', en: 'Five-day bunting', hintZh: '5 个有观察记录的日子', hintEn: '5 observed days' },
    { id: 'clock', stat: 'activeHours', need: 10, zh: '十小时座钟', en: 'Ten-hour clock', hintZh: '10 小时观测工作', hintEn: '10 hours of observed work' }
  ].map(Object.freeze));
  const GROWTH = Object.freeze([0, 25, 100, 400]);

  const whole = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
  function stats(input = {}) {
    return {
      turns: whole(input.turns), toolCalls: whole(input.toolCalls), checksPassed: whole(input.checksPassed),
      days: whole(input.days), activeHours: Math.floor(whole(input.activeMs) / 3600000),
      keepsakes: [...new Set(Array.isArray(input.keepsakes) ? input.keepsakes : [])].filter(id => KEEPSAKES.some(item => item.id === id))
    };
  }
  function growth(turns) {
    let stage = 0;
    for (let index = 0; index < GROWTH.length; index++) if (turns >= GROWTH[index]) stage = index;
    return stage;
  }
  function evaluate(input) {
    const value = stats(input);
    return {
      keepsakes: KEEPSAKES.filter(item => value.keepsakes.includes(item.id)).map(item => item.id),
      decorations: DECORATIONS.filter(item => value[item.stat] >= item.need).map(item => item.id),
      growth: growth(value.turns),
      progress: Object.fromEntries(DECORATIONS.map(item => [item.id, Math.min(1, value[item.stat] / item.need)])),
      nextGrowth: GROWTH[growth(value.turns) + 1] ?? null,
      turns: value.turns
    };
  }

  return Object.freeze({ KEEPSAKES, DECORATIONS, GROWTH, evaluate, growth });
});
