'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Venues = require('../lib/venue-model.js');
const Scene = require('../lib/scene-model.js');

test('the three venue identities retain the original workshop and offer local backgrounds', () => {
  assert.equal(Venues.DEFAULT_VENUE, 'workshop');
  assert.deepEqual(Venues.VENUE_IDS, ['workshop', 'teahouse', 'observatory']);
  assert.deepEqual(Venues.CATALOG.map(item => [item.nameZh, item.nameEn]), [
    ['山海工坊', 'Mountain & Sea Workshop'], ['港湾茶舍', 'Harbour Tea House'], ['星台观测室', 'Starlight Observatory']
  ]);
  assert.equal(Venues.getVenue('workshop').background, '../assets/office-room.jpg');
  for (const item of Venues.CATALOG) {
    assert.match(item.background, /^\.\.\/assets\/(?:scenes\/)?[a-z-]+\.jpg$/);
    assert.ok(item.subtitleZh && item.subtitleEn && item.icon);
  }
  assert.equal(new Set(Venues.CATALOG.map(item => item.background)).size, 3);
});

test('each venue names all existing functional zones without introducing another layout', () => {
  assert.deepEqual(Venues.ZONES, ['library', 'board', 'bench', 'desk', 'sofa', 'archive', 'lobby', 'front', 'exit']);
  for (const item of Venues.CATALOG) {
    assert.deepEqual(Object.keys(item.zoneLabels).sort(), [...Venues.ZONES].sort());
    for (const zone of Venues.ZONES) {
      assert.equal(Venues.zoneLabel(item.id, zone), item.zoneLabels[zone].zh);
      assert.equal(Venues.zoneLabel(item.id, zone, 'en'), item.zoneLabels[zone].en);
      assert.ok(item.zoneLabels[zone].zh && item.zoneLabels[zone].en);
      assert.notEqual(item.zoneLabels[zone].zh, item.zoneLabels[zone].en);
    }
  }
});

test('nine decorative controls have stable unique identities, bilingual labels and bounded positions', () => {
  const controls = Venues.CATALOG.flatMap(item => item.interactions);
  assert.equal(controls.length, 9);
  assert.equal(new Set(controls.map(item => item.id)).size, 9);
  assert.equal(new Set(controls.map(item => item.type)).size, 9, 'each room offers its own three mechanisms');
  for (const venue of Venues.CATALOG) {
    assert.equal(venue.interactions.length, 3);
    for (const control of venue.interactions) {
      assert.equal(control.id, venue.id + '-' + control.type);
      assert.ok(Number.isFinite(control.x) && control.x > 0 && control.x < 100);
      assert.ok(Number.isFinite(control.y) && control.y > 0 && control.y < 100);
      assert.ok(control.labelZh && control.labelEn);
      assert.deepEqual(Object.keys(control).sort(), ['id', 'labelEn', 'labelZh', 'type', 'x', 'y'], 'decorative controls contain no provider command or fabricated session event');
    }
  }
});

test('presentation lookups safely fall back and the shared catalogue cannot be mutated', () => {
  const original = Venues.getVenue('workshop');
  for (const id of [undefined, null, '', 'unknown', '__proto__', {}, 1]) assert.equal(Venues.getVenue(id), original);
  assert.equal(Venues.zoneLabel('unknown', 'desk', 'en'), original.zoneLabels.desk.en);
  assert.equal(Venues.zoneLabel('teahouse', 'unknown', 'en'), '');
  assert.equal(Venues.zoneLabel('teahouse', '__proto__', 'en'), '');
  assert.equal(Venues.zoneLabel('teahouse', 'desk', 'fr'), Venues.zoneLabel('teahouse', 'desk', 'zh'));
  assert.throws(() => Venues.CATALOG.push(original), TypeError);
  assert.throws(() => { original.background = 'https://example.invalid'; }, TypeError);
  assert.throws(() => { original.zoneLabels.desk.en = 'Changed'; }, TypeError);
  assert.throws(() => { original.interactions[0].x = 99; }, TypeError);
  assert.equal(Venues.getVenue('workshop'), original);
});

test('the centred decorative controls leave the real clock and daily count region clear', () => {
  // The renderer reserves at most 90 x 65 world pixels for each wall control.
  for (const item of Venues.CATALOG.flatMap(venue => venue.interactions)) {
    const bounds = { left: item.x * 12.8 - 45, right: item.x * 12.8 + 45, top: item.y * 7.2 - 32.5, bottom: item.y * 7.2 + 32.5 };
    for (const reserved of Scene.CLOCK_RESERVED) assert.equal(bounds.left < reserved.right && bounds.right > reserved.left && bounds.top < reserved.bottom && bounds.bottom > reserved.top, false, item.id + ' must not cover the clock');
  }
});

test('the same pure catalogue loads directly in the sandboxed renderer without Node globals', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/venue-model.js'), 'utf8'), context);
  const browser = context.OfficeVenues;
  assert.equal(JSON.stringify(browser.CATALOG), JSON.stringify(Venues.CATALOG));
  assert.equal(browser.getVenue('observatory').nameEn, 'Starlight Observatory');
  assert.equal(browser.zoneLabel('observatory', 'bench', 'en'), 'Observation bench');
  assert.deepEqual(Object.keys(context), ['OfficeVenues'], 'loading the model adds only its documented API');
});
