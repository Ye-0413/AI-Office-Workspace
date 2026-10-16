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

test('same-provider sessions retain independent identities and reachable compatible seats at every station', () => {
  for (const activity of Object.keys(Scene.SPECS)) {
    const sessions = Array.from({ length: 5 }, (_, index) => task('codex:' + index, activity));
    const first = Scene.pageSessions(sessions, '/projects/mini-office'), seen = new Set();
    for (let index = 0; index < first.pages; index += 1) {
      const page = Scene.pageSessions(sessions, '/projects/mini-office', index);
      assert.equal(page.layoutFits, true, activity);
      const seats = page.seats;
      assert.equal(new Set([...seats.values()].map(seat => seat.x + ':' + seat.y)).size, page.visible.length);
      for (const session of page.visible) {
        seen.add(session.id);
        assert.ok(Scene.stationCompatible(seats.get(session.id), Scene.activitySpec(session).zone), activity);
        for (const other of page.visible) if (session.id !== other.id) assert.equal(Scene.actorsOverlap(seats.get(session.id), {}, seats.get(other.id), {}), false);
      }
      const repeated = Scene.assignSeats([...page.visible].reverse(), seats);
      for (const [id, seat] of seats) assert.deepEqual(repeated.get(id), seat, 'snapshot ordering must preserve valid seats');
    }
    assert.equal(seen.size, 5, activity + ' pagination must retain every actual session');
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
  for (let page = 0; page < Scene.pageSessions(sessions, main.key).pages; page += 1) for (const session of Scene.pageSessions(sessions, main.key, page).visible) all.add(session.id);
  assert.equal(all.size, 11, 'pagination must not lose sessions');
  assert.equal(Scene.pageSessions(sessions, main.key, 100).page, Scene.pageSessions(sessions, main.key).pages - 1);
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
  assert.equal(first.visible.length, first.capacity);
  assert.equal(first.helperOverflow, 0);
  const second = Scene.pageSessions(sessions, '/projects/mini-office', 1, 'overflow');
  assert.equal(second.roots.length, 6);
  assert.ok(second.visible.length <= second.capacity + 3, 'roots and at most three total helpers');
  assert.equal(second.helperOverflow, 1);
  assert.equal(second.hidden, sessions.length - second.visible.length);
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
  const pages = Scene.pageSessions(sessions, Scene.ALL_ROOMS).pages;
  assert.equal(first.length, Scene.pageSessions(sessions, Scene.ALL_ROOMS).capacity);
  const seen = new Set(Array.from({length:pages}, (_, page) => ids(sessions,page)).flat());
  assert.equal(seen.size, sessions.length);
  const next = [...sessions].reverse().map((session, index) => ({ ...session, lastEventAt: 1000 + index, activity: 'coding' }));
  assert.deepEqual(ids(next, 0), first);
  assert.deepEqual(ids(next, 1), second);
  assert.equal(Scene.pageSessions(next, Scene.ALL_ROOMS, 99).page, pages - 1);
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
  assert.deepEqual(first.visible.map(session => session.id), otherRoots.slice(0,first.capacity).map(session => session.id));
  const mainId = first.rootIdsBySession.get(nested.id);
  assert.equal(mainId, head.id);
  const rootIndex = first.roots.findIndex(session => session.id === mainId);
  const selected = Scene.pageSessions(sessions, Scene.ALL_ROOMS, Math.floor(rootIndex / first.capacity), nested.id, options);
  assert.ok(selected.visible.some(session => session.id === nested.id));
  assert.equal(selected.visible.find(session=>session.id===nested.id).parentId, head.id, 'the visible descendant stays a real helper');
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
  for (let page = 0; page < Scene.pageSessions(changed, '/another-room').pages; page += 1) {
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

const CLOCK_RESERVED = Scene.CLOCK_RESERVED;
function assertReadableLayout(page, options) {
  assert.equal(page.layoutFits, true);
  assert.equal(page.seats.size, page.visible.length);
  for (const session of page.visible) {
    const seat = page.seats.get(session.id), actor = { ...options, helper: Boolean(session.parentId), footprint: options.footprints?.get(session.id) };
    assert.ok(Scene.stationCompatible(seat,seat.zone), 'seat must stay at its artwork work area: ' + session.id);
    assert.ok(Scene.legalActorPoint(seat, actor), 'body/tag must fit viewport and avoid reserved display: ' + session.id);
    for (const other of page.visible) if (other.id !== session.id) assert.equal(Scene.actorsOverlap(seat, actor,
      page.seats.get(other.id), { ...options, helper: Boolean(other.parentId), footprint: options.footprints?.get(other.id) }), false, session.id + ' and ' + other.id);
  }
}

test('screen-space envelopes match renderer depth, helper and user scales around anchored feet', () => {
  const point = { x: 50, y: 78 };
  for (const helper of [false, true]) for (const scale of [.65, 1, 1.35]) {
    const expectedScale = (.76 + point.y / 500) * (helper ? .84 : 1) * scale;
    assert.equal(Scene.actorScale(point, { helper, scale }), expectedScale);
    const bounds = Scene.actorBounds(point, { helper, scale }), raw = Scene.ACTOR_FOOTPRINT[helper ? 'helper' : 'root'];
    assert.ok(Math.abs(bounds.left - (640 - raw.left * expectedScale)) < 1e-8);
    assert.ok(Math.abs(bounds.bottom - (561.6 + raw.bottom * expectedScale)) < 1e-8);
    assert.equal(Scene.legalActorPoint({ x: 2, y: 78 }, { helper, scale }), false);
    assert.equal(Scene.legalActorPoint({ x: 42, y: 55 }, { helper, scale }), false, 'furniture feet remain excluded');
  }
  assert.equal(Scene.actorScale(point, { scale: Infinity }), Scene.actorScale(point));
});

test('supported sizes retain readable work areas and every root through adaptive pages', () => {
  const sessions = Array.from({ length: 5 }, (_, index) => task('root-' + index));
  sessions.push(...Array.from({ length: 3 }, (_, index) => task('helper-' + index, 'testing', { parentId: 'root-0' })));
  const original = structuredClone(sessions);
  for (const scale of [.65, .8, 1, 1.15, 1.35]) {
    const options = { scale, reservedRects: CLOCK_RESERVED };
    const page = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', options);
    assert.ok(page.capacity >= 1 && page.capacity <= 5);
    assertReadableLayout(page, options);
    const seen = new Set();
    for (let index = 0; index < page.pages; index += 1) {
      const group = Scene.pageSessions(sessions, Scene.ALL_ROOMS, index, '', options);
      assertReadableLayout(group, options);
      for (const session of group.visible) if (!session.parentId) { seen.add(session.id); assert.ok(group.seats.get(session.id).y >= 69, 'coding never falls back to rear cabinets'); }
    }
    assert.equal(seen.size, 5);
    const helper = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, 'helper-2', options);
    assert.ok(helper.visible.some(session => session.id === 'helper-2'));
    assertReadableLayout(helper, options);
    const repeated = Scene.pageSessions(sessions.slice().reverse(), Scene.ALL_ROOMS, 0, '', { ...options, previousSeats: page.seats });
    assert.deepEqual([...repeated.seats].sort(), [...page.seats].sort(), 'a snapshot must not shuffle valid bodies');
  }
  assert.deepEqual(sessions, original, 'layout never mutates observed state');
});

test('size changes relayout unsafe old envelopes while preserving a selected legal actor when space permits', () => {
  const sessions = Array.from({ length: 5 }, (_, index) => task('main-' + index));
  const first = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', { scale: .65, reservedRects: CLOCK_RESERVED });
  const options = { scale: 1.35, reservedRects: CLOCK_RESERVED, previousSeats: first.seats };
  const enlarged = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, 'main-4', options);
  assertReadableLayout(enlarged, options);
  const selected = Scene.pageSessions(sessions.concat(task('a-new-arrival')), Scene.ALL_ROOMS, 0, 'main-4', {
    scale: 1.35, reservedRects: CLOCK_RESERVED, previousSeats: enlarged.seats,
  });
  assert.ok(selected.visible.some(session => session.id === 'main-4'), 'new ID sorting cannot page away a selected root');
  assert.deepEqual(selected.seats.get('main-4'), enlarged.seats.get('main-4'));
});

test('a smaller visual viewport reduces page capacity while keeping every root and selected helper accessible', () => {
  const sessions = Array.from({ length: 9 }, (_, index) => task('root-' + index));
  sessions.push(...Array.from({ length: 5 }, (_, index) => task('helper-' + index, 'coding', { parentId: 'root-8' })));
  const options = { scale: 1.35, viewport: { left: 12, top: 390, right: 1268, bottom: 662 } };
  const first = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, '', options);
  assert.ok(first.capacity < Scene.CAPACITY);
  assertReadableLayout(first, options);
  const observed = new Set();
  for (let index = 0; index < first.pages; index += 1) {
    const page = Scene.pageSessions(sessions, Scene.ALL_ROOMS, index, '', options);
    assertReadableLayout(page, options);
    for (const session of page.visible) if (!session.parentId) observed.add(session.id);
  }
  assert.equal(observed.size, 9, 'adaptive pages retain all independent sessions');
  const selected = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, 'helper-4', options);
  assert.ok(selected.visible.some(session => session.id === 'helper-4'));
  assert.equal(selected.rootIdsBySession.get('helper-4'), 'root-8');
  assertReadableLayout(selected, options);
});

test('a reserved entrance adapts density without losing roots or selectable helpers', () => {
  const sessions = Array.from({ length: 5 }, (_, index) => task('root-' + index));
  sessions.push(...Array.from({ length: 3 }, (_, index) => task('helper-' + index, 'testing', { parentId: 'root-0' })));
  for (const scale of [.65, 1, 1.35]) {
    const options = { scale, reservedRects: CLOCK_RESERVED.concat(Scene.actorBounds({ x: 87, y: 78 }, { scale })) };
    const page = Scene.pageSessions(sessions, Scene.ALL_ROOMS, 0, 'helper-2', options);
    assert.ok(page.capacity >= 1 && page.capacity <= 5);
    const ids = new Set();
    for (let index = 0; index < page.pages; index += 1) for (const session of Scene.pageSessions(sessions, Scene.ALL_ROOMS, index, '', options).visible) if (!session.parentId) ids.add(session.id);
    assert.equal(ids.size, 5);
    assert.ok(page.visible.some(session => session.id === 'helper-2'));
    assertReadableLayout(page, options);
  }
});

test('measured CSS envelopes share the foot anchor and large coding layouts stay in front of furniture', () => {
  const sessions = Array.from({length:7}, (_, index) => task('measured-' + index));
  const footprint = {left:80,right:80,top:132,bottom:74};
  const footprints = new Map(sessions.map(session => [session.id, footprint]));
  for (const scale of [.65,1,1.35]) {
    const options = {scale,footprints,reservedRects:CLOCK_RESERVED.concat(Scene.actorBounds({x:87,y:78},{scale,footprint}))};
    const seen = new Set();
    const first = Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,'',options);
    assert.equal(first.capacity, scale === 1.35 ? 3 : scale === 1 ? 4 : 5);
    for (let page = 0; page < first.pages; page += 1) {
      const result = Scene.pageSessions(sessions,Scene.ALL_ROOMS,page,'',options);
      assertReadableLayout(result,options);
      for (const session of result.visible) { seen.add(session.id); assert.ok(result.seats.get(session.id).y>=69); }
    }
    assert.equal(seen.size,7);
    const selected = Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,'measured-6',options);
    assert.ok(selected.visible.some(session=>session.id==='measured-6'));
    const point = selected.seats.get('measured-6'), bounds = Scene.actorBounds(point,{scale,footprint});
    assert.ok(Math.abs((bounds.left+bounds.right)/2-point.x*12.8)<1e-7);
    assert.ok(Math.abs(bounds.bottom-point.y*7.2-74*Scene.actorScale(point,{scale}))<1e-7);
  }
});

test('unsafe rear-wall seats from older large-size layouts are repaired without changing observed activity', () => {
  const session=task('old-seat'), old=new Map([[session.id,{x:10,y:41,zone:'desk'}]]);
  const seat=Scene.assignSeats([session],old,{scale:1.35}).get(session.id);
  assert.ok(seat.y>=69);
  assert.equal(seat.zone,'desk');assert.equal(session.activity,'coding');
});

test('crowded reading, building and coding tasks never borrow another artwork station', () => {
  for (const activity of ['reading','planning','building','coding','idle']) for (const scale of [1,1.35]) {
    const sessions=Array.from({length:5},(_,index)=>task(activity+'-'+index,activity));
    const footprints=new Map(sessions.map(session=>[session.id,{left:83,right:83,top:135,bottom:80}]));
    const options={scale,footprints,reservedRects:CLOCK_RESERVED};
    const first=Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,'',options),seen=new Set();
    for(let page=0;page<first.pages;page++) {
      const result=Scene.pageSessions(sessions,Scene.ALL_ROOMS,page,'',options);assertReadableLayout(result,options);
      for(const session of result.visible) {
        seen.add(session.id);const seat=result.seats.get(session.id);
        if(activity==='reading')assert.ok(seat.x<=31.5,'readers must remain by the left bookshelf');
        if(activity==='coding')assert.ok(seat.x>=30&&seat.x<=73,'coders must remain by the central desks');
        if(activity==='building')assert.ok(seat.x>=70,'builders must remain at the right bench');
      }
    }
    assert.equal(seen.size,5,'all observed tasks remain reachable through pages');
  }
});

test('maximum-size planning helpers remain selectable beside their true root in a crowded board family', () => {
  const roots=Array.from({length:8},(_,index)=>task('board-root-'+index,'planning'));
  const helpers=['a','b'].map(id=>task('board-helper-'+id,'planning',{parentId:roots[0].id}));
  const sessions=roots.concat(helpers),footprint={left:95,right:95,top:135,bottom:80};
  const options={scale:1.35,footprints:new Map(sessions.map(session=>[session.id,footprint])),reservedRects:CLOCK_RESERVED.concat(Scene.actorBounds({x:87,y:78},{scale:1.35,footprint}))};
  for(const helper of helpers) {
    const result=Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,helper.id,options);
    assertReadableLayout(result,options);
    assert.ok(result.visible.some(session=>session.id===helper.id));
    assert.ok(result.visible.some(session=>session.id===roots[0].id));
    assert.equal(result.rootIdsBySession.get(helper.id),roots[0].id);
    assert.equal(helper.parentId,roots[0].id);
  }
});

test('normal main arrivals get an entrance-side compatible seat and the reserved door clears the actor gap at every scale', () => {
  const sessions=['coding','testing','reading','coding'].map((activity,index)=>task(['myth-0','myth-1','myth-2','new-arrival'][index],activity));
  const footprint={left:83,right:83,top:135,bottom:77},entry={x:87,y:78};
  for(const scale of [1,1.35]) {
    const options={scale,footprints:new Map(sessions.map(session=>[session.id,footprint])),reservedRects:CLOCK_RESERVED.concat(Scene.actorReservation(entry,{scale,footprint}))};
    const initial=Scene.pageSessions(sessions.slice(0,3),Scene.ALL_ROOMS,0,'',options);
    const result=Scene.pageSessions(sessions,Scene.ALL_ROOMS,0,'myth-0',{...options,entryIds:new Set(['new-arrival']),previousSeats:initial.seats});
    assertReadableLayout(result,options);assert.equal(result.visible.length,4);
    assert.ok(result.seats.get('new-arrival').x>=67,'a newcomer must not be assigned across the existing coder');
    for(const session of result.visible) assert.equal(Scene.actorsOverlap(entry,{scale,footprint},result.seats.get(session.id),{scale,footprint}),false,'reserved entry must match actual traffic clearance');
    if(scale===1)assert.deepEqual(result.seats.get('myth-0'),initial.seats.get('myth-0'),'keep an existing safe seat when feasible');
    else assert.ok(result.seats.get('myth-0').x<60,'the old coder makes space on the left for a larger arrival');
  }
});

test('a protected reflow entrance reserves its actual body for other actors without preventing its own next step', () => {
  const session=task('new-arrival'),point={x:80,y:78},footprint={left:83,right:83,top:135,bottom:77};
  const reservedRects=[Scene.actorReservation(point,{scale:1,footprint,ownerId:session.id})];
  assert.equal(Scene.legalActorPoint(point,{session,footprint,reservedRects}),true);
  assert.equal(Scene.legalActorPoint(point,{session:task('other'),footprint,reservedRects}),false);
  assert.equal(Scene.legalActorPoint(point,{id:session.id,footprint,reservedRects}),true);
});
