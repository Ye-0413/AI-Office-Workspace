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

test('automatic room selection exposes all projects while explicit filters survive initial loading', () => {
  const retired = task('old', 'idle', { status: 'idle', projectPath: '/a', projectName: 'A' });
  const active = task('new', 'coding', { projectPath: '/b', projectName: 'B' });
  const rooms = Scene.roomsFor([retired, active]);
  assert.deepEqual(Scene.chooseRoom(rooms, [active]), { key: Scene.ALL_ROOMS, explicit: false });
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/a' }), { key: Scene.ALL_ROOMS, explicit: false });
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/a', explicit: true }), { key: '/a', explicit: true });
  assert.deepEqual(Scene.chooseRoom([], [], { current: '/a', explicit: true }), { key: '/a', explicit: true }, 'the settings/live-snapshot race must preserve the pending saved choice');
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: '/gone', explicit: true }), { key: Scene.ALL_ROOMS, explicit: false }, 'a vanished saved project must not hide available work');
  assert.deepEqual(Scene.chooseRoom(rooms, [retired, active], { current: '/b' }), { key: Scene.ALL_ROOMS, explicit: false });
  assert.deepEqual(Scene.chooseRoom([], []), { key: Scene.ALL_ROOMS, explicit: false });
  assert.deepEqual(Scene.chooseRoom(rooms, [active], { current: Scene.ALL_ROOMS, explicit: true }), { key: Scene.ALL_ROOMS, explicit: true });
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
  assert.deepEqual(page.roots.map(session => session.id), ['a', 'orphan', 'self']);
  assert.equal(new Set(page.visible.map(session => session.id)).size, 5);
  assert.equal(page.rootIdsBySession.get('c'), 'a');
  assert.equal(Scene.pageSessions([...sessions].reverse(), '/projects/mini-office').rootIdsBySession.get('b'), 'a');
});

test('the overview shows independent same-provider roots from different projects without changing project filters', () => {
  const first = task('codex:one', 'reading', { projectPath: '/one', projectName: 'One' });
  const second = task('codex:two', 'testing', { projectPath: '/two', projectName: 'Two' });
  const sessions = [first, second];
  const overview = Scene.pageSessions(sessions, Scene.ALL_ROOMS);
  assert.deepEqual(overview.roots.map(session => session.id), [first.id, second.id]);
  assert.deepEqual(overview.visible.map(session => session.id), [first.id, second.id]);
  assert.deepEqual(Scene.pageSessions(sessions, '/one').visible.map(session => session.id), [first.id]);
  assert.deepEqual(Scene.pageSessions(sessions, '/two').visible.map(session => session.id), [second.id]);
  assert.equal(Scene.inRoom(first, Scene.ALL_ROOMS), true);
  assert.equal(Scene.inRoom(first, '/two'), false);
  assert.equal(Scene.roomsFor(sessions).length, 2, 'source project rooms remain available for deliberate filtering');
  assert.equal(new Set([...Scene.assignSeats(overview.visible).values()].map(seat => seat.x + ':' + seat.y)).size, 2);
});

test('overview root pages remain stable when new activity reorders more than five same-provider sessions', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => task('codex:root-' + index, 'coding', {
    projectPath: index % 2 ? '/one' : '/two', lastEventAt: index + 1,
  }));
  const ids = (input, page) => Scene.pageSessions(input, Scene.ALL_ROOMS, page).visible.map(session => session.id);
  const first = ids(sessions, 0), second = ids(sessions, 1);
  assert.equal(first.length, Scene.CAPACITY);
  assert.equal(second.length, sessions.length - Scene.CAPACITY);
  assert.equal(new Set([...first, ...second]).size, sessions.length);
  const next = [...sessions].reverse().map((session, index) => ({ ...session, lastEventAt: 1000 + index, activity: 'reading' }));
  assert.deepEqual(ids(next, 0), first);
  assert.deepEqual(ids(next, 1), second);
  assert.equal(Scene.pageSessions(next, Scene.ALL_ROOMS, 99).page, 1);
});

test('repeated turns retain one main actor per actual Codex session across project rooms', () => {
  const { createSessionStore } = require('../lib/session-store.cjs');
  const { normalizeEvent } = require('../lib/provider-events.cjs');
  let now = 1000;
  const store = createSessionStore({ now: () => now });
  const emit = (session_id, turn_id, cwd, hook_event_name) => store.ingest(normalizeEvent('codex', {
    session_id, turn_id, cwd, hook_event_name,
  }, { receivedAt: now++, source: 'hook' }));
  emit('one', 'one-first-turn', '/one', 'UserPromptSubmit');
  emit('two', 'two-first-turn', '/two', 'UserPromptSubmit');
  emit('one', 'one-first-turn', '/one', 'Stop');
  emit('one', 'one-second-turn', '/one', 'UserPromptSubmit');
  const sessions = store.snapshot(), page = Scene.pageSessions(sessions, Scene.ALL_ROOMS);
  assert.equal(sessions.length, 2);
  assert.deepEqual(page.roots.map(session => session.id), ['codex:one', 'codex:two']);
  assert.equal(page.visible.filter(session => session.provider === 'codex').length, 2);
  assert.equal(page.roots.find(session => session.sessionId === 'one').turnId, 'one-second-turn');
});

test('absorbed idle helpers cannot consume scene slots needed by observed working helpers', () => {
  const root = task('root');
  const idle = id => task(id, 'idle', { parentId: root.id, status: 'idle', activeTools: 0 });
  const sessions = [root, idle('a'), idle('b'), idle('c'), task('z', 'testing', { parentId: root.id, activeTools: 1 })];
  const page = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', { suppressedIds: new Set(['a', 'b', 'c']) });
  assert.deepEqual(page.visible.map(session => session.id), ['root', 'z']);
  assert.equal(page.helperOverflow, 0, 'absorbed bodies are not reported as hidden working helpers');
  assert.equal(page.rootIdsBySession.get('a'), root.id, 'suppression changes presentation rather than identity or ancestry');
  assert.equal(sessions.length, 5);
});

test('a working descendant of a suppressed parent stays attached to its real root across projects', () => {
  const root = task('root', 'planning', { projectPath: '/root-project' });
  const parent = task('parent', 'idle', { parentId: root.id, status: 'idle', activeTools: 0, projectPath: '/helper-project' });
  const nested = task('nested', 'coding', { parentId: parent.id, projectPath: '/helper-project' });
  const page = Scene.pageSessions([nested, parent, root], Scene.ALL_ROOMS, 0, '', { suppressedIds: new Set([parent.id]) });
  assert.deepEqual(page.roots.map(session => session.id), [root.id]);
  assert.deepEqual(page.visible.map(session => session.id), [root.id, nested.id]);
  assert.equal(page.rootIdsBySession.get(nested.id), root.id);
  assert.equal(page.rootIdsBySession.get(parent.id), root.id);
  assert.equal(nested.parentId, parent.id);
});

test('absorbed orphan bodies after their root closes cannot force other main agents onto a mostly empty second page', () => {
  const closedRoot = task('ended-root', 'idle', { closed: true, status: 'closed' });
  const absorbed = ['a', 'b', 'c'].map(id => task(id, 'idle', {
    parentId: closedRoot.id, status: 'idle', activeTools: 0,
  }));
  const activeRoots = ['z1', 'z2', 'z3'].map(id => task(id, 'coding'));
  // Closed roots are absent from visual attendance; idle child rows retain
  // their grace period even though their bodies were already absorbed.
  const present = [...absorbed, ...activeRoots];
  const page = Scene.pageSessions(present, Scene.ALL_ROOMS, 0, '', {
    suppressedIds: new Set(absorbed.map(session => session.id)),
  });
  assert.equal(page.pages, 1);
  assert.deepEqual(page.roots.map(session => session.id), activeRoots.map(session => session.id));
  assert.deepEqual(page.visible.map(session => session.id), activeRoots.map(session => session.id));
  assert.equal(page.helperOverflow, 0);
  for (const orphan of absorbed) assert.equal(page.rootIdsBySession.get(orphan.id), orphan.id, 'full source ancestry is retained even for a suppressed family');
});

test('a suppressed orphan head keeps a selectable virtual page group for working descendants without drawing a false main agent', () => {
  const head = task('z-absorbed-parent', 'idle', { parentId: 'ended-root', status: 'idle', activeTools: 0 });
  const nested = task('z-working-child', 'testing', { parentId: head.id });
  const otherRoots = Array.from({ length: 5 }, (_, index) => task('main-' + index));
  const sessions = [nested, head, ...otherRoots], options = { suppressedIds: new Set([head.id]) };
  const first = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', options);
  assert.equal(first.pages, 2);
  assert.deepEqual(first.visible.map(session => session.id), otherRoots.map(session => session.id));
  const mainId = first.rootIdsBySession.get(nested.id);
  assert.equal(mainId, head.id);
  const rootIndex = first.roots.findIndex(session => session.id === mainId);
  const selected = Scene.pageSessions(sessions, Scene.ALL_ROOMS, Math.floor(rootIndex / Scene.CAPACITY), nested.id, options);
  assert.deepEqual(selected.visible.map(session => session.id), [nested.id]);
  assert.equal(selected.visible[0].parentId, head.id, 'the visible descendant stays a real helper');
  assert.equal(selected.rootIdsBySession.get(nested.id), head.id);
  assert.equal(selected.visible.some(session => session.id === head.id), false);
  assert.equal(selected.helperOverflow, 0);
});

test('roster page lookup uses the same suppressed family groups as the rendered overview', () => {
  const absorbed = ['a', 'b', 'c'].map(id => task(id, 'idle', { parentId: 'ended-root', status: 'idle', activeTools: 0 }));
  const mains = Array.from({ length: 10 }, (_, index) => task('main-' + index));
  const sessions = [...absorbed, ...mains], options = { suppressedIds: new Set(absorbed.map(session => session.id)) };
  const family = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', options);
  const selectedId = 'main-4', mainId = family.rootIdsBySession.get(selectedId);
  const page = Math.floor(family.roots.findIndex(session => session.id === mainId) / Scene.CAPACITY);
  assert.equal(page, 0);
  const selected = Scene.pageSessions(sessions, Scene.ALL_ROOMS, page, selectedId, options);
  assert.equal(selected.visible.some(session => session.id === selectedId), true);
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
