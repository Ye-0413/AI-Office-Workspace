/* Shared, deterministic scene rules. No Electron, DOM, timers or event inference. */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./provider-labels.js') : root.OfficeProviders);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeScene = api;
})(typeof globalThis === 'object' ? globalThis : this, function (Providers) {
  'use strict';

  const WORLD = Object.freeze({ width: 1280, height: 720 });
  const CAPACITY = 5;
  const ALL_ROOMS = '__office_all_projects__';
  const ZONES = Object.freeze({
    library: { name: '资料书架', x: 19, y: 44, seats: [[19, 44], [30, 46], [7, 44], [30, 70], [15, 83]] },
    board: { name: '构思白板', x: 47, y: 43, seats: [[45, 43], [59, 43], [31, 44], [72, 44], [30, 70]] },
    bench: { name: '构建实验台', x: 81, y: 45, seats: [[81, 45], [94, 45], [69, 44], [71, 69], [92, 82]] },
    desk: { name: '代码工位', x: 48, y: 72, seats: [[42, 70], [60, 72], [28, 81], [77, 83], [49, 86]] },
    sofa: { name: '咖啡休息角', x: 16, y: 79, seats: [[12, 80], [27, 84], [43, 84], [59, 84], [75, 84]] },
    front: { name: '等你回复', x: 49, y: 84, seats: [[45, 84], [60, 85], [30, 85], [75, 85], [15, 86]] },
    archive: { name: '成果架', x: 84, y: 80, seats: [[84, 80], [94, 85], [72, 79], [85, 85], [64, 84]] },
    lobby: { name: '观察位', x: 74, y: 83, seats: [[74, 83], [89, 85], [60, 85], [45, 84], [30, 85]] },
    exit: { name: '工作室门口', x: 92.5, y: 82, seats: [[92.5, 82]] }
  });

  const SPECS = Object.freeze({
    reading: { zone: 'library', label: '读代码', verb: '查阅资料', asset: 'clawd-idle-reading.svg', prop: 'book' },
    searching: { zone: 'library', label: '查找线索', verb: '检索文件与资料', asset: 'clawd-idle-reading.svg', prop: 'search' },
    planning: { zone: 'board', label: '构思方案', verb: '梳理下一步', asset: 'clawd-working-thinking.svg', prop: 'note' },
    coding: { zone: 'desk', label: '写代码', verb: '修改项目文件', asset: 'clawd-working-typing.svg', prop: 'code' },
    designing: { zone: 'board', label: '设计中', verb: '推敲设计', asset: 'clawd-designing.svg', prop: 'paint' },
    building: { zone: 'bench', label: '构建中', verb: '等待构建结果', asset: 'clawd-working-building.svg', prop: 'build' },
    testing: { zone: 'bench', label: '测一测', verb: '执行测试', asset: 'clawd-working-debugger.svg', prop: 'test' },
    running: { zone: 'bench', label: '运行工具', verb: '执行命令', asset: 'clawd-working-building.svg', prop: 'run' },
    'waiting-user': { zone: 'front', label: '等你回复', verb: '请回到原工具处理', asset: 'clawd-notification.svg', prop: 'attention' },
    'waiting-tool': { zone: 'bench', label: '工具运行中', verb: '等待工具返回', asset: 'clawd-working-thinking.svg', prop: 'wait' },
    idle: { zone: 'sofa', label: '这一轮已歇下', verb: '会话仍在，等待下一项工作', asset: 'clawd-coffee-hand.svg', prop: 'coffee' },
    error: { zone: 'bench', label: '遇到问题', verb: '请查看原工具的错误', asset: 'clawd-error.svg', prop: 'error' },
    unknown: { zone: 'lobby', label: '观察中', verb: '尚无可识别的工作事件', asset: 'clawd-static-base.svg', prop: 'none' }
  });

  // Furniture footprints, in percent of the world. Feet and routes stay outside.
  const OBSTACLES = Object.freeze([
    { x1: 14, y1: 7, x2: 28, y2: 31 },
    { x1: 36, y1: 8, x2: 64, y2: 30 },
    { x1: 70, y1: 9, x2: 98, y2: 40 },
    { x1: 1, y1: 49, x2: 28, y2: 73 },
    { x1: 33, y1: 47, x2: 49, y2: 65 },
    { x1: 51, y1: 47, x2: 68, y2: 68 },
    { x1: 78, y1: 49, x2: 98, y2: 75 }
  ]);

  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const timestamp = (value) => typeof value === 'number' ? value : (Date.parse(value) || 0);
  const distance = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * WORLD.height / WORLD.width);
  const projectKey = (session) => String(session.projectPath || session.projectName || '__unassigned__');
  const inRoom = (session, roomKey) => roomKey === ALL_ROOMS || projectKey(session) === roomKey;
  const isClosed = (session) => session.closed === true || session.status === 'closed';
  const needsAttention = (session) => !isClosed(session) && (session.attention === true || session.activity === 'waiting-user' || session.activity === 'error');

  function providerName(provider) {
    const id = String(provider || '').toLowerCase();
    return ({ codex: 'Codex', cursor: 'Cursor', claude: 'Claude Code', 'claude-code': 'Claude Code', 'claude code': 'Claude Code' })[id] || (Providers && Providers.getProvider(id) || {}).name || String(provider || 'Agent');
  }

  const NAME_FIRST = Object.freeze(('Amber Apricot Ash Aspen Aster Auburn Aurora Autumn Bamboo Basil Bay Beech Birch Bloom Bluebell Blueberry Bramble Briar Brook Buttercup Cacao Camellia Cedar Celadon Chamomile Cherry Chestnut Cinnamon Clementine Cloud Clover Cobalt Cocoa Copper Coral Cosmos Cotton Daisy Dawn Dew Dove Dune Elm Ember Evergreen Fern Fig Finch Flax Flora Forest Foxglove Frost Garden Ginger Ginkgo Golden Hazel Heather Honey Hyacinth Indigo Iris Ivy Jade Jasmine Juniper Laurel Lavender Leaf Lemon Lilac Lily Linden Lotus Lumen Luna Magnolia Maple Marigold Meadow Mint Mist Moss Mulberry Myrtle Nectar Nutmeg Oak Ochre Olive Opal Orchid Peach Pear Pebble Peony Petal Pine Plum Poppy Primrose Rain Reed River Robin Rose Rosemary Rowan Ruby Saffron Sage Sakura Sandal Seafoam Sequoia Silver Snow Sorrel Spruce Star Stone Summer Sunbeam Sunny Tangerine Tea Thistle Thyme Twilight Vanilla Velvet Violet Willow Wisteria Woodland').split(' '));
  const NAME_SECOND = Object.freeze(('Pip Mochi Wren Acorn Almond Badger Bagel Bean Bear Bell Berry Biscuit Blossom Bluejay Bobbin Bonbon Bunny Bunting Button Cake Candle Caramel Chai Charm Chiffon Chip Chirp Chive Cloudlet Cobble Comet Cookie Cosy Crayon Cricket Crisp Crumb Crumble Cub Cupcake Custard Doodle Dovelet Dreamlet Dumpling Fable Fawn Feather Finch Firefly Flake Flannel Fleece Flicker Floret Fluff Flutter Fox Freckle Froth Fudge Glimmer Glow Gumdrop Hamster Hearth Hedgehog Hopper Huckle Hug Kettle Kit Kitten Kiwi Koala Lantern Lark Locket Lullaby Macaron Mallow Marble Marmot Marmalade Marshmallow Meringue Milk Minty Moonlet Morsel Muffin Nibble Nook Nori Nougat Nutlet Otter Owl Pansy Patch Peanut Pearl Pebble Penguin Petal Pickle Pigeon Pillow Pinecone Plumlet Pocket Pollen Pompom Poppy Puff Pudding Pumpkin Quill Rabbit Robin Roll Ruffle Scone Seedling Shell Shimmer Skipper Sleepy Soot Sparrow Sprig Sprinkle Sprite Sprout Squirrel Starlet Stitch Sugar Sundae Swallow Sweetpea Tadpole Taffy Teacup Thimble Toast Toffee Truffle Tumble Twig Twinkle Velvet Waffle Walrus Whisper Wicket Wisp Wombat Wool Wrenlet Yarrow Yuzu Zinnia').split(' '));

  function identityProvider(provider) {
    const value = String(provider || '').trim().toLowerCase();
    return ['claude', 'claude-code', 'claude code'].includes(value) ? 'claude-code' : value || 'agent';
  }

  function identityParts(session) {
    const value = session && typeof session === 'object' ? session : {};
    const id = String(value.id || value.sessionId || '');
    const provider = identityProvider(value.provider);
    return { id, provider, key: JSON.stringify([provider, id]) };
  }

  function identityHash(value, salt) {
    let result = salt;
    // Include every UTF-16 code unit, including both halves of non-BMP IDs.
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);
    result = Math.imul(result ^ (result >>> 13), 0xc2b2ae35);
    return (result ^ (result >>> 16)) >>> 0;
  }

  function identityName(session) {
    const { key } = identityParts(session);
    return NAME_FIRST[identityHash(key, 0x811c9dc5) % NAME_FIRST.length] + ' ' + NAME_SECOND[identityHash(key, 0x9e3779b9) % NAME_SECOND.length];
  }

  function createIdentityRegistry({ maxEntries = 2048 } = {}) {
    const capacity = Math.min(2048, Math.max(1, Math.floor(Number(maxEntries)) || 2048));
    const entries = new Map();
    let active = new Set();
    let clock = 0;
    function trim() {
      if (entries.size <= capacity) return;
      const candidates = [...entries.values()].sort((a, b) => Number(active.has(a.key)) - Number(active.has(b.key)) || a.seen - b.seen || a.key.localeCompare(b.key));
      for (const entry of candidates) {
        if (entries.size <= capacity) break;
        entries.delete(entry.key);
        active.delete(entry.key);
      }
    }
    function remember(session) {
      const parts = identityParts(session);
      if (!parts.id) return null;
      let entry = entries.get(parts.key);
      if (!entry) { entry = { ...parts, name: identityName(session), seen: 0 }; entries.set(parts.key, entry); }
      entry.seen = ++clock;
      return entry;
    }
    function register(sessions) {
      if (!Array.isArray(sessions)) return;
      const unique = new Map();
      active = new Set();
      for (const session of sessions) {
        if (!session || typeof session !== 'object') continue;
        const parts = identityParts(session);
        if (!parts.id) continue;
        unique.set(parts.key, session);
        if (!isClosed(session)) active.add(parts.key);
      }
      for (const key of [...unique.keys()].sort()) remember(unique.get(key));
      trim();
    }
    function get(session) {
      const entry = remember(session);
      const name = entry ? entry.name : identityName(session);
      trim();
      return name;
    }
    function getParentName(session) {
      if (!session || !session.parentId) return null;
      const { id, provider } = identityParts(session);
      const parentId = String(session.parentId);
      if (parentId === id) return null;
      const sameProvider = entries.get(JSON.stringify([provider, parentId]));
      if (sameProvider) return sameProvider.name;
      const matches = [...entries.values()].filter(entry => entry.id === parentId);
      return matches.length === 1 ? matches[0].name : null;
    }
    // Cached identities may be discarded, but names are pure: eviction never renames a task.
    return Object.freeze({ register, get, getParentName, get size() { return entries.size; } });
  }

  function activitySpec(session) {
    if (session.disconnected || session.status === 'stale') {
      return { zone: 'lobby', label: '信号暂未更新', verb: '保留最后观察位置，不推测工作进度', asset: 'clawd-static-base.svg', prop: 'none', stale: true };
    }
    if (isClosed(session)) return { zone: 'archive', label: '会话已结束', verb: '归档并离开房间', asset: 'clawd-working-carrying.svg', prop: 'archive', closed: true };
    // Attention is an explicit upstream signal. Do not turn ordinary quiet into sleep.
    if (session.attention && session.activity !== 'error') return SPECS['waiting-user'];
    return SPECS[session.activity] || SPECS.unknown;
  }

  function roomsFor(sessions) {
    const map = new Map();
    for (const session of sessions.filter((item) => !isClosed(item))) {
      const key = projectKey(session);
      if (!map.has(key)) map.set(key, { key, name: session.projectName || (session.projectPath ? String(session.projectPath).split(/[\\/]/).filter(Boolean).pop() : '未分类项目'), count: 0, roots: 0, helpers: 0, attention: 0, sessions: [] });
      const room = map.get(key);
      room.count += 1;
      room.sessions.push(session);
      if (session.parentId) room.helpers += 1;
      else room.roots += 1;
      if (needsAttention(session)) room.attention += 1;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
  }

  // The unfiltered overview exposes independent sessions across projects.
  // A deliberate project filter survives the settings/live-snapshot race.
  function chooseRoom(rooms, present, { current = '', explicit = false } = {}) {
    const keys = new Set(rooms.map(room => room.key));
    if (explicit && current && (current === ALL_ROOMS || !rooms.length || keys.has(current))) return { key: current, explicit: true };
    return { key: ALL_ROOMS, explicit: false };
  }

  // A whole observed family shares its root's page, including nested helpers.
  // A malformed cycle gets one deterministic representative instead of making
  // every participant disappear. All walks are bounded by the observed rows.
  function familyRoots(sessions) {
    const byId = new Map(sessions.map(session => [session.id, session]));
    const result = new Map();
    for (const session of sessions) {
      const chain = [], positions = new Map();
      let cursor = session.id, rootId;
      while (byId.has(cursor)) {
        if (result.has(cursor)) { rootId = result.get(cursor); break; }
        if (positions.has(cursor)) {
          rootId = chain.slice(positions.get(cursor)).sort()[0];
          break;
        }
        positions.set(cursor, chain.length); chain.push(cursor);
        const parentId = byId.get(cursor).parentId;
        if (!parentId || !byId.has(parentId)) { rootId = cursor; break; }
        cursor = parentId;
      }
      for (const id of chain) result.set(id, rootId);
    }
    return result;
  }

  function pageSessions(sessions, roomKey, page = 0, preferredId = '', options = {}) {
    const room = sessions.filter((session) => inRoom(session, roomKey) && !isClosed(session));
    const rootIdsBySession = familyRoots(room);
    const suppressedIds = options && options.suppressedIds;
    const suppressed = session => Boolean(suppressedIds && typeof suppressedIds.has === 'function' && suppressedIds.has(session.id));
    const eligibleFamilies = new Set(room.filter(session => !suppressed(session)).map(session => rootIdsBySession.get(session.id)));
    // An orphan helper remains observable as its own task until its parent appears.
    // Store snapshots are ordered by last activity; a heartbeat must not move
    // an independent root to another page or hide a different same-provider root.
    // A suppressed orphan may still anchor a working descendant's page group,
    // but an entirely absorbed family must not consume an empty root slot.
    const roots = room.filter(session => rootIdsBySession.get(session.id) === session.id && eligibleFamilies.has(session.id))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const pages = Math.max(1, Math.ceil(roots.length / CAPACITY));
    const current = Math.max(0, Math.min(pages - 1, finite(page)));
    const pageHeads = roots.slice(current * CAPACITY, (current + 1) * CAPACITY);
    const visible = pageHeads.filter(session => !suppressed(session));
    const rootIds = new Set(pageHeads.map((session) => session.id));
    // Preserve full ancestry before suppressing absorbed idle bodies. Removing
    // a cached parent earlier would promote its working descendant to a root.
    const helpers = room.filter(session => !rootIds.has(session.id) && rootIds.has(rootIdsBySession.get(session.id))
      && !suppressed(session));
    helpers.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId) || Number(needsAttention(b)) - Number(needsAttention(a)) || String(a.id).localeCompare(String(b.id)));
    // Three temporary helpers fit while retaining normal-size readable main tasks.
    const shownHelpers = helpers.slice(0, 3);
    return { page: current, pages, roots, rootIdsBySession, visible: visible.concat(shownHelpers), helperOverflow: Math.max(0, helpers.length - shownHelpers.length), hidden: Math.max(0, room.length - visible.length - shownHelpers.length) };
  }

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return result >>> 0;
  }

  function assignSeats(sessions, previous = new Map()) {
    const result = new Map();
    const occupied = [];
    const ordered = sessions.slice().sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
    for (const session of ordered) {
      const spec = activitySpec(session);
      const old = previous.get(session.id);
      if (spec.stale && old) {
        result.set(session.id, { ...old, stale: true });
        occupied.push(old);
        continue;
      }
      let candidates = ZONES[spec.zone].seats.map(([x, y]) => ({ x, y }));
      if (session.parentId && result.has(session.parentId)) {
        const parent = result.get(session.parentId);
        // Helpers may work at their own furniture; when sharing a station they stand beside it.
        if (parent.zone === spec.zone) candidates = [{ x: parent.x + 8, y: parent.y - 3 }, { x: parent.x - 8, y: parent.y - 3 }, ...candidates];
      }
      const starting = hash(session.id) % Math.min(2, candidates.length);
      if (starting) candidates = candidates.slice(starting).concat(candidates.slice(0, starting));
      if (old && old.zone === spec.zone) candidates.unshift({ x: old.x, y: old.y });
      const legal = (point) => point.x >= 5 && point.x <= 95 && point.y >= 40 && point.y <= 86 && !OBSTACLES.some((rect) => inside(point, rect, .6));
      const score = (point) => occupied.reduce((minimum, other) => Math.min(minimum, distance(point, other)), 100);
      let point = candidates.find((candidate) => legal(candidate) && score(candidate) >= (session.parentId ? 6 : 10));
      if (!point) point = candidates.filter(legal).sort((a, b) => score(b) - score(a))[0] || { x: 49, y: 84 };
      const seat = { ...point, zone: spec.zone, depth: .76 + point.y / 500, helper: Boolean(session.parentId) };
      occupied.push(seat);
      result.set(session.id, seat);
    }
    return result;
  }

  function inside(point, rect, margin = 0) {
    return point.x > rect.x1 - margin && point.x < rect.x2 + margin && point.y > rect.y1 - margin && point.y < rect.y2 + margin;
  }

  function segmentHitsRect(a, b, rect, margin = 1) {
    const expanded = { x1: rect.x1 - margin, x2: rect.x2 + margin, y1: rect.y1 - margin, y2: rect.y2 + margin };
    let enter = 0;
    let exit = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - expanded.x1], [dx, expanded.x2 - a.x], [-dy, a.y - expanded.y1], [dy, expanded.y2 - a.y]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else if (p < 0) enter = Math.max(enter, q / p);
      else exit = Math.min(exit, q / p);
      if (enter > exit) return false;
    }
    return true;
  }

  function route(start, target) {
    const from = { x: finite(start.x, 98), y: finite(start.y, 86) };
    const to = { x: finite(target.x, 49), y: finite(target.y, 84) };
    const blocked = (a, b) => OBSTACLES.some((rect) => segmentHitsRect(a, b, rect, .8));
    if (!blocked(from, to)) return [from, to];
    const nodes = [from, to];
    for (const rect of OBSTACLES) {
      for (const [x, y] of [[rect.x1 - 1, rect.y1 - 1], [rect.x2 + 1, rect.y1 - 1], [rect.x1 - 1, rect.y2 + 1], [rect.x2 + 1, rect.y2 + 1]]) {
        const point = { x, y };
        if (x > 3 && x < 98 && y >= 39 && y <= 87 && !OBSTACLES.some((other) => inside(point, other, .8))) nodes.push(point);
      }
    }
    const costs = nodes.map(() => Infinity);
    const prev = nodes.map(() => -1);
    const visited = new Set();
    costs[0] = 0;
    while (visited.size < nodes.length) {
      let at = -1;
      for (let index = 0; index < nodes.length; index += 1) if (!visited.has(index) && (at < 0 || costs[index] < costs[at])) at = index;
      if (at < 0 || !Number.isFinite(costs[at])) break;
      if (at === 1) {
        const path = [];
        for (let index = 1; index >= 0; index = prev[index]) path.unshift(nodes[index]);
        return path;
      }
      visited.add(at);
      for (let index = 0; index < nodes.length; index += 1) {
        if (visited.has(index) || blocked(nodes[at], nodes[index])) continue;
        const cost = costs[at] + distance(nodes[at], nodes[index]);
        if (cost < costs[index]) { costs[index] = cost; prev[index] = at; }
      }
    }
    // Never walk through a table if a malformed target lands inside furniture.
    return [from];
  }

  function shortTitle(session, length = 9) {
    const title = String(session.title || session.summary || '未命名任务').replace(/\s+/g, ' ').trim();
    const chars = Array.from(title);
    return chars.length > length ? chars.slice(0, length).join('') + '…' : title;
  }

  return { WORLD, CAPACITY, ALL_ROOMS, ZONES, SPECS, OBSTACLES, timestamp, distance, projectKey, inRoom, providerName, identityName, createIdentityRegistry, isClosed, needsAttention, activitySpec, roomsFor, chooseRoom, pageSessions, assignSeats, route, segmentHitsRect, shortTitle };
});
