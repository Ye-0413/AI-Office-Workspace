'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const DayCycle = require('../lib/day-cycle.js');
const hongKong = time => Date.parse('2026-10-16T' + time + '+08:00');
const COLORS = ['skyTop', 'skyBottom', 'water', 'skyline'];
const OPACITIES = ['windowGlow', 'sunOpacity', 'moonOpacity', 'roomShade', 'lamplight', 'starsOpacity'];
const NUMBERS = [...OPACITIES, 'sunX', 'sunY'];

test('the Hong Kong clock and phase do not inherit the machine timezone', () => {
  const milliseconds = Date.parse('2026-10-15T23:30:00Z');
  assert.equal(DayCycle.TIME_ZONE, 'Asia/Hong_Kong');
  assert.equal(DayCycle.at(milliseconds).clock, '07:30');
  assert.equal(DayCycle.at(milliseconds).phase, 'morning');
  assert.equal(DayCycle.at(milliseconds).dateIso, '2026-10-16');
  assert.equal(DayCycle.at(milliseconds).dateZh, '2026年10月16日 星期五');
  assert.equal(DayCycle.at(milliseconds).dateEn, 'Fri, 16 Oct 2026');
  const script = `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.resolve(__dirname, '../lib/day-cycle.js'))}).at(${milliseconds})))`;
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), DayCycle.at(milliseconds));
  }
});

test('Hong Kong midnight advances the full date and weekday before the UTC calendar day changes', () => {
  const before = DayCycle.at('2026-10-16T15:59:59.999Z');
  const after = DayCycle.at('2026-10-16T16:00:00Z');
  assert.equal(before.clock, '23:59');
  assert.equal(before.dateIso, '2026-10-16');
  assert.equal(before.dateZh, '2026年10月16日 星期五');
  assert.equal(after.clock, '00:00');
  assert.equal(after.dateIso, '2026-10-17');
  assert.equal(after.dateZh, '2026年10月17日 星期六');
  assert.equal(after.dateEn, 'Sat, 17 Oct 2026');
  const leapDay = DayCycle.at('2028-02-28T16:00:00Z');
  assert.equal(leapDay.dateIso, '2028-02-29');
  assert.equal(leapDay.dateZh, '2028年2月29日 星期二');
  assert.equal(leapDay.dateEn, 'Tue, 29 Feb 2028');
  const newYear = DayCycle.at('2026-12-31T16:00:00Z');
  assert.equal(newYear.dateIso, '2027-01-01');
  assert.equal(newYear.dateEn, 'Fri, 1 Jan 2027');
});

test('all five phases change at their documented local boundaries', () => {
  const boundaries = [
    ['04:59:59', 'night'], ['05:00:00', 'dawn'], ['06:59:59', 'dawn'],
    ['07:00:00', 'morning'], ['11:59:59', 'morning'], ['12:00:00', 'afternoon'],
    ['16:59:59', 'afternoon'], ['17:00:00', 'sunset'], ['18:59:59', 'sunset'],
    ['19:00:00', 'night'], ['23:59:59', 'night'], ['00:00:00', 'night']
  ];
  for (const [time, phase] of boundaries) {
    const scene = DayCycle.at(hongKong(time));
    assert.equal(scene.phase, phase, time);
    assert.equal(scene.night, phase === 'night');
    assert.ok(scene.labelZh && scene.labelEn && scene.labelZh !== scene.labelEn);
    assert.equal(scene.preview, false);
  }
});

test('color and lighting interpolation has no jump at phase boundaries or midnight', () => {
  for (const time of ['00:00:00', '05:00:00', '06:00:00', '07:00:00', '09:00:00', '12:00:00', '14:00:00', '17:00:00', '18:00:00', '19:00:00', '20:00:00']) {
    const boundary = hongKong(time), before = DayCycle.at(boundary - 1), after = DayCycle.at(boundary + 1);
    for (const key of COLORS) {
      for (const offset of [1, 3, 5]) assert.ok(Math.abs(parseInt(before[key].slice(offset, offset + 2), 16) - parseInt(after[key].slice(offset, offset + 2), 16)) <= 1, time + ' ' + key);
    }
    for (const key of NUMBERS) assert.ok(Math.abs(before[key] - after[key]) < .001, time + ' ' + key);
  }
  const morning = DayCycle.at(hongKong('09:00:00'));
  const afternoon = DayCycle.at(hongKong('14:00:00'));
  const sunset = DayCycle.at(hongKong('18:00:00'));
  const night = DayCycle.at(hongKong('22:00:00'));
  assert.notEqual(morning.skyTop, afternoon.skyTop);
  assert.notEqual(afternoon.skyBottom, sunset.skyBottom);
  assert.ok(night.roomShade > afternoon.roomShade && night.lamplight > afternoon.lamplight);
  assert.ok(night.windowGlow > afternoon.windowGlow && night.starsOpacity > afternoon.starsOpacity);
  assert.equal(night.sunOpacity, 0);
  assert.equal(afternoon.moonOpacity, 0);
});

test('manual previews keep the actual Hong Kong clock while freezing decorative time', () => {
  for (const sceneTime of DayCycle.MODES.filter(mode => mode !== 'auto')) {
    const early = DayCycle.at(hongKong('00:15:00'), { sceneTime });
    const late = DayCycle.at(hongKong('13:45:00'), { sceneTime });
    assert.equal(early.phase, sceneTime);
    assert.equal(early.preview, true);
    assert.equal(early.clock, '00:15');
    assert.equal(late.clock, '13:45');
    assert.equal(early.dateIso, '2026-10-16');
    assert.equal(early.dateZh, '2026年10月16日 星期五');
    const nextDay = DayCycle.at('2026-10-16T16:01:00Z', { sceneTime });
    assert.equal(nextDay.clock, '00:01');
    assert.equal(nextDay.dateIso, '2026-10-17');
    assert.equal(nextDay.dateEn, 'Sat, 17 Oct 2026');
    assert.equal(nextDay.phase, sceneTime);
    for (const key of [...COLORS, ...NUMBERS]) assert.equal(early[key], late[key], sceneTime + ' ' + key);
    for (const key of [...COLORS, ...NUMBERS]) assert.equal(early[key], nextDay[key], sceneTime + ' must freeze only decorative time: ' + key);
  }
  assert.equal(DayCycle.at(hongKong('12:00:00'), { night: true }).phase, 'night');
  assert.equal(DayCycle.at(hongKong('12:00:00'), { night: true, sceneTime: 'auto' }).phase, 'afternoon');
  assert.equal(DayCycle.at(hongKong('12:00:00'), { sceneTime: 'unexpected' }).preview, false);
});

test('scene outputs stay finite and bounded through a whole day without mutating input', () => {
  const options = Object.freeze({ sceneTime: 'auto', night: false });
  for (let minute = 0; minute < 1440; minute += 7) {
    const scene = DayCycle.at(hongKong('00:00:00') + minute * 60000, options);
    for (const key of COLORS) assert.match(scene[key], /^#[a-f0-9]{6}$/);
    for (const key of OPACITIES) assert.ok(Number.isFinite(scene[key]) && scene[key] >= 0 && scene[key] <= 1, key);
    for (const key of ['sunX', 'sunY']) assert.ok(scene[key] >= 0 && scene[key] <= 100, key);
  }
  const timestamp = hongKong('08:00:00');
  assert.deepEqual(DayCycle.at(new Date(timestamp)), DayCycle.at(timestamp));
  assert.deepEqual(DayCycle.at('2026-10-16T08:00:00+08:00'), DayCycle.at(timestamp));
  assert.deepEqual(DayCycle.at(timestamp, null), DayCycle.at(timestamp));
  for (const invalid of [undefined, null, NaN, Infinity, '', 'not a date', {}, new Date(NaN), 1e30]) assert.throws(() => DayCycle.at(invalid), /valid timestamp/);
  assert.ok(Object.isFrozen(DayCycle) && Object.isFrozen(DayCycle.MODES));
});

test('the browser module exposes only a pure OfficeDayCycle API without DOM or timers', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/day-cycle.js'), 'utf8'), context, { timeout: 1000 });
  assert.deepEqual(Object.keys(context), ['OfficeDayCycle']);
  assert.equal(context.OfficeDayCycle.at(hongKong('18:00:00')).phase, 'sunset');
  assert.equal(context.OfficeDayCycle.at(hongKong('18:00:00')).clock, '18:00');
});
