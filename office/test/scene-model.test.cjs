'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Scene = require('../lib/scene-model.js');

const task = (id, activity = 'coding', patch = {}) => ({ id, sessionId: id, provider: 'codex', title: id, activity, status: 'active', projectPath: '/projects/mini-office', projectName: 'Mini Office', ...patch });

test('each observed activity has a physical station; quiet and stale never mean sleeping', () => {
  const expected = { reading: 'library', searching: 'library', planning: 'board', designing: 'board', coding: 'desk', building: 'bench', testing: 'bench', running: 'bench', 'waiting-tool': 'bench', 'waiting-user': 'front', idle: 'sofa', error: 'bench', unknown: 'lobby' };
  for (const [activity, zone] of Object.entries(expected)) {
    const spec = Scene.activitySpec(task('a', activity));
    assert.equal(spec.zone, zone, activity);
    assert.doesNotMatch(spec.asset, /sleep|collapse|doze/);
  }
  const unknown = Scene.activitySpec(task('a', 'unsupported-future-event', { lastEventAt: 1 }));
  assert.equal(unknown.zone, 'lobby');
  const stale = Scene.activitySpec(task('a', 'coding', { status: 'stale' }));
  assert.equal(stale.stale, true);
  assert.equal(stale.label, '信号暂未更新');
});

test('five concurrent sessions of the same provider retain independent identities and seats', () => {
  for (const activity of Object.keys(Scene.SPECS)) {
    const sessions = Array.from({ length: 5 }, (_, index) => task('codex:' + index, activity));
    const page = Scene.pageSessions(sessions, '/projects/mini-office');
    assert.equal(page.visible.length, 5);
    const seats = Scene.assignSeats(page.visible);
    assert.equal(new Set([...seats.values()].map((seat) => seat.x + ':' + seat.y)).size, 5, activity);
    for (const [id, seat] of seats) for (const [otherId, other] of seats) {
      if (id !== otherId) assert.ok(Scene.distance(seat, other) >= 9.9, activity + ' ' + id + ' and ' + otherId + ' would overlap');
    }
    const repeated = Scene.assignSeats([...page.visible].reverse(), seats);
    for (const [id, seat] of seats) assert.deepEqual(repeated.get(id), seat, 'snapshot reordering must not make characters shuffle');
  }
});

test('every station pair has a continuous route that avoids all furniture footprints', () => {
  const points = Object.values(Scene.ZONES).flatMap((zone) => zone.seats.map(([x, y]) => ({ x, y })));
  for (const from of points) for (const to of points) {
    const path = Scene.route(from, to);
    assert.ok(path.length >= 2, 'missing route ' + JSON.stringify({ from, to }));
    assert.deepEqual(path[0], from);
    assert.deepEqual(path.at(-1), to);
    for (let index = 1; index < path.length; index += 1) {
      for (const obstacle of Scene.OBSTACLES) assert.equal(Scene.segmentHitsRect(path[index - 1], path[index], obstacle, .79), false, 'route crosses furniture ' + JSON.stringify({ from, to, obstacle, path }));
    }
  }
});

test('a target accidentally inside a table does not produce a walk through it', () => {
  const start = { x: 45, y: 84 };
  const path = Scene.route(start, { x: 42, y: 57 });
  assert.deepEqual(path, [start]);
});

test('project rooms and overflow retain all attention counts', () => {
  const sessions = Array.from({ length: 11 }, (_, index) => task('task:' + index, index === 10 ? 'waiting-user' : 'coding'));
  sessions.push(task('other', 'error', { projectPath: '/projects/website', projectName: 'Website', attention: true }));
  const rooms = Scene.roomsFor(sessions);
  const main = rooms.find((room) => room.key === '/projects/mini-office');
  const website = rooms.find((room) => room.key === '/projects/website');
  assert.equal(main.count, 11);
  assert.equal(main.attention, 1);
  assert.equal(website.attention, 1);
  const all = new Set();
  for (let page = 0; page < 3; page += 1) for (const session of Scene.pageSessions(sessions, main.key, page).visible) all.add(session.id);
  assert.equal(all.size, 11, 'pagination must not lose sessions');
  assert.equal(Scene.pageSessions(sessions, main.key, 100).page, 2);
  assert.equal(Scene.pageSessions(sessions, main.key, -10).page, 0);
});

test('helpers attach to visible parents, attention takes priority, and a selected overflow helper becomes visible', () => {
  const sessions = [task('parent')];
  for (let index = 0; index < 7; index += 1) sessions.push(task('helper:' + index, index === 6 ? 'waiting-user' : 'reading', { parentId: 'parent' }));
  const normal = Scene.pageSessions(sessions, '/projects/mini-office');
  assert.equal(normal.roots.length, 1);
  assert.equal(normal.helperOverflow, 4);
  assert.ok(normal.visible.some((session) => session.id === 'helper:6'));
  const selected = Scene.pageSessions(sessions, '/projects/mini-office', 0, 'helper:5');
  assert.ok(selected.visible.some((session) => session.id === 'helper:5'));
  assert.ok(selected.visible.some((session) => session.id === 'helper:6'));
  const rooms = Scene.roomsFor(sessions);
  assert.equal(rooms[0].helpers, 7);
  assert.equal(rooms[0].attention, 1);
});

test('a stale session preserves its last place and does not wander to a new inferred state', () => {
  const active = task('main', 'coding');
  const previous = Scene.assignSeats([active]);
  const stale = task('main', 'unknown', { disconnected: true });
  const result = Scene.assignSeats([stale], previous);
  assert.equal(result.get('main').x, previous.get('main').x);
  assert.equal(result.get('main').y, previous.get('main').y);
  assert.equal(result.get('main').zone, 'desk');
  assert.equal(result.get('main').stale, true);
});

test('completed turns keep their source session open; visual attendance controls whether they stay in the room', () => {
  const completed = task('session', 'idle', { status: 'idle', turnCompletedAt: 1000 });
  assert.equal(Scene.isClosed(completed), false);
  assert.equal(Scene.roomsFor([completed])[0].count, 1);
  assert.equal(Scene.pageSessions([completed], '/projects/mini-office').visible.length, 1);
  const closed = { ...completed, status: 'closed', closed: true };
  assert.equal(Scene.roomsFor([closed]).length, 0);
  assert.equal(Scene.pageSessions([closed], '/projects/mini-office').visible.length, 0);
  assert.equal(Scene.activitySpec(closed).zone, 'archive');
});

test('an orphan child stays visible instead of disappearing until its parent arrives', () => {
  const orphan = task('child', 'testing', { parentId: 'not-yet-observed' });
  const page = Scene.pageSessions([orphan], '/projects/mini-office');
  assert.equal(page.roots.length, 1);
  assert.equal(page.visible[0].id, 'child');
});

test('automatic room selection follows observed occupants while explicit room choices survive idle history and initial loading', () => {
  const retired = task('old', 'idle', { status: 'idle', projectPath: '/a', projectName: 'A' });
  const active = task('new', 'coding', { projectPath: '/b', projectName: 'B' });
  const rooms = Scene.roomsFor([retired, active]);
  assert.deepEqual(Scene.chooseRoom(rooms, [active]), { key: '/b', explicit: false });
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/a' }), { key: '/b', explicit: false });
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/a', explicit: true }), { key: '/a', explicit: true });
  assert.deepEqual(Scene.chooseRoom([], [], { current: '/a', explicit: true }), { key: '/a', explicit: true }, 'the settings/live-snapshot race must preserve the pending saved choice');
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/gone', explicit: true }), { key: '/b', explicit: false }, 'a vanished saved project must not hide available work');
  assert.deepEqual(Scene.chooseRoom(rooms, [retired, active], { current: '/b' }), { key: '/b', explicit: false }, 'new arrivals elsewhere must not shuffle an occupied automatic room');
});

test('nested helper families stay on their root page and a selected descendant participates in helper overflow', () => {
  const roots = Array.from({ length: 6 }, (_, index) => task('root:' + index));
  const sessions = [...roots, task('child', 'coding', { parentId: 'root:5' }), task('grandchild', 'testing', { parentId: 'child' }), task('great-grandchild', 'reading', { parentId: 'grandchild' }), task('overflow', 'reading', { parentId: 'great-grandchild' })];
  const first = Scene.pageSessions(sessions, '/projects/mini-office');
  assert.equal(first.visible.length, 5);
  assert.equal(first.helperOverflow, 0);
  const second = Scene.pageSessions(sessions, '/projects/mini-office', 1, 'overflow');
  assert.equal(second.roots.length, 6);
  assert.equal(second.visible.length, 4, 'one root and at most three total helpers');
  assert.equal(second.helperOverflow, 1);
  assert.equal(second.hidden, 6, 'five roots on another page plus one overflow helper');
  assert.ok(second.visible.some(session => session.id === 'overflow'));
  assert.equal(second.rootIdsBySession.get('overflow'), 'root:5');
  assert.equal(second.rootIdsBySession.get('grandchild'), 'root:5');
});

test('cyclic and orphaned parent links retain a deterministic visible family without unbounded traversal', () => {
  const sessions = [task('b', 'coding', { parentId: 'a' }), task('a', 'coding', { parentId: 'b' }), task('c', 'reading', { parentId: 'a' }), task('self', 'planning', { parentId: 'self' }), task('orphan', 'testing', { parentId: 'missing' })];
  const page = Scene.pageSessions(sessions, '/projects/mini-office');
  assert.deepEqual(page.roots.map(session => session.id), ['a', 'self', 'orphan']);
  assert.equal(new Set(page.visible.map(session => session.id)).size, 5);
  assert.equal(page.rootIdsBySession.get('c'), 'a');
  assert.equal(Scene.pageSessions([...sessions].reverse(), '/projects/mini-office').rootIdsBySession.get('b'), 'a');
});

test('cozy identity names depend on the complete provider and actor ID, never task descriptions or activity', () => {
  const session = task('session-a', 'reading', { title: '修复登录', summary: 'private task description', projectPath: '/one' });
  const name = Scene.identityName(session);
  assert.equal(name, 'Olive Hedgehog', 'the v1 ID-to-name mapping must survive registry rebuilds and releases');
  assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(Scene.identityName({ ...session, title: '完全不同的任务', summary: 'another description', activity: 'error', status: 'closed', closed: true, projectPath: '/two', parentId: 'a-parent' }), name);
  assert.notEqual(Scene.identityName({ ...session, id: 'session-b' }), name);
  assert.notEqual(Scene.identityName({ ...session, provider: 'cursor' }), name);
  assert.notEqual(Scene.identityName(task('prefix-a:same-last-four-1234')), Scene.identityName(task('prefix-b:same-last-four-1234')), 'the complete identity matters, not its last four characters');
  assert.equal(Scene.identityName({ provider: 'codex', sessionId: 'session-a' }), name, 'sessionId is a fallback only when actor ID is absent');
});

test('identity names canonicalize Claude provider aliases and do not include raw IDs or mutable helper markers', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const names = ['claude', 'claude-code', 'Claude Code'].map(provider => Scene.identityName({ id, provider }));
  assert.equal(new Set(names).size, 1);
  assert.match(names[0], /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(names[0].includes(id), false);
  const child = task('child-actor', 'testing', { parentId: 'parent-actor', subagentId: 'helper' });
  assert.equal(Scene.identityName(child), Scene.identityName({ ...child, parentId: undefined, subagentId: undefined }));
  assert.notEqual(Scene.identityName(task('full-id-🌲')), Scene.identityName(task('full-id-🌳')), 'all code units of a non-BMP ID must be included');
});

test('identity registry names stay fixed across snapshots, activities, project rooms, pagination and new instances', () => {
  const sessions = Array.from({ length: 12 }, (_, index) => task('task:' + index, index % 2 ? 'coding' : 'reading', { projectPath: index < 8 ? '/one' : '/two' }));
  const registry = Scene.createIdentityRegistry();
  registry.register(sessions);
  const names = new Map(sessions.map(session => [session.id, registry.get(session)]));
  const changed = sessions.slice().reverse().map(session => ({ ...session, activity: 'waiting-user', title: 'a new title', projectPath: '/another-room' }));
  registry.register(changed);
  for (let page = 0; page < 3; page += 1) {
    for (const session of Scene.pageSessions(changed, '/another-room', page).visible) assert.equal(registry.get(session), names.get(session.id));
  }
  registry.register([]);
  registry.register(changed);
  const rebuilt = Scene.createIdentityRegistry();
  rebuilt.register(changed);
  for (const session of sessions) {
    assert.equal(registry.get(session), names.get(session.id), 'leaving and returning must retain the same nickname');
    assert.equal(rebuilt.get(session), names.get(session.id), 'a new process/registry must derive the same nickname');
  }
});

test('orphan helpers retain their nickname when a parent arrives and expose the parent name separately', () => {
  const child = task('orphan-helper', 'testing', { parentId: 'parent-later' });
  const parent = task('parent-later', 'coding');
  const registry = Scene.createIdentityRegistry();
  registry.register([child]);
  const childName = registry.get(child);
  assert.equal(registry.getParentName(child), null);
  registry.register([parent, child]);
  assert.equal(registry.get(child), childName);
  assert.equal(registry.getParentName(child), registry.get(parent));
  assert.equal(registry.getParentName(parent), null);
  assert.equal(registry.getParentName({ ...child, parentId: child.id }), null, 'a malformed self-reference is not a parent');
});

test('bounded identity caching evicts inactive entries first and eviction never changes a nickname', () => {
  const registry = Scene.createIdentityRegistry({ maxEntries: 3 });
  const parent = task('still-active');
  const old = task('old-closed', 'idle', { closed: true, status: 'closed' });
  registry.register([parent, old]);
  const oldName = registry.get(old);
  for (let index = 0; index < 20; index += 1) registry.register([parent, task('archived:' + index, 'idle', { closed: true, status: 'closed' })]);
  assert.equal(registry.size, 3);
  assert.equal(registry.getParentName(task('child', 'reading', { parentId: parent.id })), Scene.identityName(parent), 'the current active parent stays cached ahead of closed history');
  assert.equal(registry.get(old), oldName, 'an evicted nickname is regenerated exactly from the ID');
  assert.equal(registry.size, 3);
});

test('identity registries are bounded to 2048 entries and live/demo instances cannot affect each other', () => {
  const live = Scene.createIdentityRegistry({ maxEntries: 100000 });
  const demo = Scene.createIdentityRegistry();
  const sessions = Array.from({ length: 2100 }, (_, index) => task('historical:' + index, 'idle', { closed: true, status: 'closed' }));
  live.register(sessions);
  assert.equal(live.size, 2048);
  assert.equal(demo.size, 0);
  const current = task('live-task');
  const name = live.get(current);
  demo.register([task('demo-task'), { ...current, title: 'demo metadata must not influence a real identity' }]);
  assert.equal(live.get(current), name);
  assert.equal(demo.get(current), name, 'same identity derives the same name even across independent registries');
});
