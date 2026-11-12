'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAttendance } = require('../lib/attendance-model.js');

const MIN = 60000;
function setup(options = {}) {
  let clock = 1_000_000;
  const model = createAttendance({ keepIdle: true, now: () => clock, ...options });
  const session = (status, extra = {}) => ({ id: 'codex:main', status, activity: status === 'idle' ? 'idle' : 'coding',
    lastEventAt: clock, events: [{ event: status === 'idle' ? 'turn-end' : 'tool-start', at: clock }], ...extra });
  return { model, session, advance: ms => { clock += ms; }, now: () => clock };
}

test('a finished main dozes on standby, then walks out after ten quiet minutes', () => {
  const h = setup();
  h.model.update([h.session('active')]);
  const done = h.session('idle');
  let result = h.model.update([done]);
  assert.deepEqual(result.standby, ['codex:main']);
  h.advance(9 * MIN); result = h.model.update([done]);
  assert.deepEqual(result.standby, ['codex:main'], 'still dozing before the limit');
  h.advance(MIN + 1000); result = h.model.update([done]);
  assert.deepEqual(result.leaving, ['codex:main']);
  assert.equal(h.model.state('codex:main').reason, 'standby-released');
  assert.equal(h.model.state('codex:main').releaseCause, 'quiet');
  h.advance(MIN); result = h.model.update([done]);
  assert.deepEqual(result.present, [], 'repeated idle snapshots do not bring it back');
  result = h.model.update([h.session('active')]);
  assert.deepEqual(result.entering, ['codex:main'], 'fresh real work restores the same identity');
});

test('the standby limit can be disabled, and new work still releases a dozing main', () => {
  const h = setup({ standbyMs: Infinity });
  h.model.update([h.session('active')]);
  const done = h.session('idle');
  h.model.update([done]);
  h.advance(120 * MIN);
  assert.deepEqual(h.model.update([done]).standby, ['codex:main']);
  const other = { id: 'codex:other', status: 'active', activity: 'coding', lastEventAt: h.now(), events: [{ event: 'tool-start', at: h.now() }] };
  const result = h.model.update([done, other]);
  assert.ok(result.leaving.includes('codex:main'));
  assert.equal(h.model.state('codex:main').releaseCause, 'new-work');
});
