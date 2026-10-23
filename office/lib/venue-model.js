/* Decorative room identities. No agent state, actions, timers or layout changes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeVenues = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_VENUE = 'workshop';
  const ZONES = Object.freeze(['library', 'board', 'bench', 'desk', 'sofa', 'archive', 'lobby', 'front', 'exit']);
  function venue(value) {
    const zoneLabels = Object.freeze(Object.fromEntries(Object.entries(value.zoneLabels).map(([id, labels]) => [id, Object.freeze({ zh: labels[0], en: labels[1] })])));
    const interactions = Object.freeze(value.interactions.map(item => Object.freeze({ ...item, id: value.id + '-' + item.type })));
    return Object.freeze({ ...value, zoneLabels, interactions });
  }
  const CATALOG = Object.freeze([
    venue({
      id: 'workshop', nameZh: '山海工坊', nameEn: 'Mountain & Sea Workshop',
      subtitleZh: '把思路铺开，让小小灵感慢慢成形。',
      subtitleEn: 'Room for ideas to unfold and little inventions to take shape.',
      background: '../assets/office-room.jpg', icon: '⚙',
      zoneLabels: {
        library: ['书架旁', 'Library'], board: ['蓝图板前', 'Blueprint board'],
        bench: ['实验台', 'Test bench'], desk: ['工坊工作台', 'Workshop desks'],
        sofa: ['休憩沙发', 'Lounge'], archive: ['图纸档案柜', 'Drawing archive'],
        lobby: ['工坊门厅', 'Workshop lobby'], front: ['协作台', 'Help desk'], exit: ['工坊入口', 'Workshop doorway']
      },
      interactions: [
        { type: 'blueprint', x: 24, y: 22, labelZh: '翻开蓝图', labelEn: 'Unroll a blueprint' },
        { type: 'circuit', x: 84, y: 20, labelZh: '拨动线路开关', labelEn: 'Flip the circuit switch' },
        { type: 'bell', x: 70, y: 21, labelZh: '轻敲铜铃', labelEn: 'Ring the brass bell' }
      ]
    }),
    venue({
      id: 'teahouse', nameZh: '港湾茶舍', nameEn: 'Harbour Tea House',
      subtitleZh: '一盏茶的工夫，听港湾轻轻回响。',
      subtitleEn: 'A quiet cup of tea beside the soft sounds of the harbour.',
      background: '../assets/scenes/teahouse.jpg', icon: '♨',
      zoneLabels: {
        library: ['茶书架旁', 'Tea library'], board: ['留笺墙前', 'Note wall'],
        bench: ['温茶实验台', 'Tea test counter'], desk: ['茶席工位', 'Tea tables'],
        sofa: ['竹榻', 'Bamboo lounge'], archive: ['茶卷档案柜', 'Tea archive'],
        lobby: ['茶舍门厅', 'Tea house lobby'], front: ['问茶席', 'Help table'], exit: ['竹帘入口', 'Bamboo doorway']
      },
      interactions: [
        { type: 'tea', x: 12, y: 58, labelZh: '温一壶茶', labelEn: 'Warm a pot of tea' },
        { type: 'windchime', x: 7, y: 22, labelZh: '轻拨风铃', labelEn: 'Nudge the wind chime' },
        { type: 'note', x: 24, y: 22, labelZh: '展开港湾留笺', labelEn: 'Unfold a harbour note' }
      ]
    }),
    venue({
      id: 'observatory', nameZh: '星台观测室', nameEn: 'Starlight Observatory',
      subtitleZh: '沿着星图，把好奇心带向更远的地方。',
      subtitleEn: 'Follow the star charts and let curiosity travel a little further.',
      background: '../assets/scenes/observatory.jpg', icon: '✧',
      zoneLabels: {
        library: ['星图书架旁', 'Star chart library'], board: ['星图板前', 'Star chart board'],
        bench: ['观测实验台', 'Observation bench'], desk: ['观测工位', 'Observation desks'],
        sofa: ['夜航休憩席', 'Night watch lounge'], archive: ['观测档案柜', 'Observation archive'],
        lobby: ['星台门厅', 'Observatory lobby'], front: ['联络台', 'Help counter'], exit: ['星台入口', 'Observatory doorway']
      },
      interactions: [
        { type: 'starmap', x: 24, y: 22, labelZh: '转动星图', labelEn: 'Turn the star chart' },
        { type: 'telescope', x: 84, y: 20, labelZh: '望向远方', labelEn: 'Look through the telescope' },
        { type: 'meteor-note', x: 70, y: 21, labelZh: '展开流星笺', labelEn: 'Unfold a meteor note' }
      ]
    })
  ]);
  const VENUE_IDS = Object.freeze(CATALOG.map(item => item.id));
  function getVenue(id = DEFAULT_VENUE) {
    return CATALOG.find(item => item.id === id) || CATALOG[0];
  }
  function zoneLabel(venueId, zone, language = 'zh') {
    const labels = getVenue(venueId).zoneLabels[zone];
    return labels ? labels[language === 'en' ? 'en' : 'zh'] || '' : '';
  }

  return Object.freeze({ DEFAULT_VENUE, VENUE_IDS, ZONES, CATALOG, getVenue, zoneLabel });
});
