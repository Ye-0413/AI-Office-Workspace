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
  const ACTOR_GAP = 12;
  const RESERVED_GAP = 4;
  const ACTOR_VIEWPORT = Object.freeze({ left: 12, top: 72, right: 1268, bottom: 662 });
  const CLOCK_RESERVED = Object.freeze([Object.freeze({ left: 470, top: 65, right: 830, bottom: 175 })]);
  // Local CSS pixels around the actor's feet. This includes the clipped body,
  // all three name-tag lines, its family border and the selected keepsake.
  const ACTOR_FOOTPRINT = Object.freeze({
    root: Object.freeze({ left: 112, right: 120, top: 132, bottom: 78 }),
    helper: Object.freeze({ left: 116, right: 124, top: 132, bottom: 76 }),
  });
  const ZONES = Object.freeze({
    library: { name: '资料书架', x: 19, y: 44, seats: [[19, 44], [30, 46], [7, 44], [30, 70], [15, 83]] },
    board: { name: '构思白板', x: 47, y: 43, seats: [[45, 43], [59, 43], [32, 46.5], [50, 46.5], [69, 46.5]] },
    bench: { name: '构建实验台', x: 81, y: 45, seats: [[81, 45], [94, 45], [69, 44], [71, 69], [92, 82]] },
    desk: { name: '代码工位', x: 48, y: 72, seats: [[42, 70], [60, 72], [28, 81], [77, 83], [49, 86]] },
    sofa: { name: '咖啡休息角', x: 16, y: 79, seats: [[12, 80], [27, 84], [43, 84], [59, 84], [75, 84]] },
    front: { name: '等你回复', x: 49, y: 84, seats: [[45, 84], [60, 85], [30, 85], [75, 85], [15, 86]] },
    archive: { name: '成果架', x: 84, y: 80, seats: [[84, 80], [94, 85], [72, 79], [85, 85], [64, 84]] },
    lobby: { name: '观察位', x: 74, y: 83, seats: [[74, 83], [89, 85], [60, 85], [45, 84], [30, 85]] },
    exit: { name: '工作室门口', x: 92.5, y: 82, seats: [[92.5, 82]] }
  });
  // Foot positions belong to the artwork's actual work areas. A crowded
  // library cannot borrow the build bench merely to keep five bodies visible.
  const STATION_AREAS = Object.freeze({
    library: { x1: 6.5, x2: 31.5, y1: 40.7, y2: 46.5 },
    board: { x1: 32, x2: 69.5, y1: 42.5, y2: 46.5 },
    bench: { x1: 70, x2: 94, y1: 40.7, y2: 46.5 },
    desk: { x1: 30, x2: 73, y1: 69, y2: 82 },
    sofa: { x1: 7, x2: 29, y1: 76, y2: 84 },
    front: { x1: 30, x2: 73, y1: 78, y2: 84 },
    archive: { x1: 75, x2: 94, y1: 76, y2: 84 },
    lobby: { x1: 54, x2: 78, y1: 76, y2: 84 },
    exit: { x1: 84, x2: 94, y1: 76, y2: 84 },
  });
  function stationCompatible(point, zone) {
    const area = STATION_AREAS[zone];
    return Boolean(area && point && point.x >= area.x1 - 1e-7 && point.x <= area.x2 + 1e-7
      && point.y >= area.y1 - 1e-7 && point.y <= area.y2 + 1e-7);
  }

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

  const agentScale = value => Math.max(.65, Math.min(1.35, Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1));
  function actorScale(point, { helper = false, scale = 1 } = {}) {
    return (.76 + finite(point && point.y) / 500) * (helper ? .84 : 1) * agentScale(scale);
  }
  function actorBounds(point, options = {}) {
    const measured = options.footprint;
    const footprint = measured && ['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(measured[key]) && measured[key] >= 0)
      ? measured : options.helper ? ACTOR_FOOTPRINT.helper : ACTOR_FOOTPRINT.root;
    const scale = actorScale(point, options), x = finite(point && point.x) * WORLD.width / 100, y = finite(point && point.y) * WORLD.height / 100;
    const left = x - footprint.left * scale, right = x + footprint.right * scale;
    const top = y - footprint.top * scale, bottom = y + footprint.bottom * scale;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  function actorReservation(point, options = {}) {
    const bounds = actorBounds(point, options), padding = Math.max(0, ACTOR_GAP - RESERVED_GAP);
    return { left: bounds.left - padding, right: bounds.right + padding, top: bounds.top - padding, bottom: bounds.bottom + padding,
      ...(options.ownerId ? { ownerId: options.ownerId } : {}) };
  }
  function boundsOverlap(a, b, gap = ACTOR_GAP) {
    const clearance = Math.max(0, finite(gap));
    return a.left < b.right + clearance - 1e-7 && a.right > b.left - clearance + 1e-7
      && a.top < b.bottom + clearance - 1e-7 && a.bottom > b.top - clearance + 1e-7;
  }
  function actorsOverlap(a, aOptions, b, bOptions, gap = ACTOR_GAP) {
    return boundsOverlap(actorBounds(a, aOptions), actorBounds(b, bOptions), gap);
  }
  function legalActorPoint(point, options = {}) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 5 || point.x > 95 || point.y < 40.7 || point.y > 86) return false;
    if (OBSTACLES.some(rect => inside(point, rect, .6))) return false;
    const bounds = actorBounds(point, options), viewport = options.viewport || ACTOR_VIEWPORT;
    if (bounds.left < viewport.left - 1e-7 || bounds.right > viewport.right + 1e-7 || bounds.top < viewport.top - 1e-7 || bounds.bottom > viewport.bottom + 1e-7) return false;
    return !(options.reservedRects || []).some(rect => rect && (!rect.ownerId || rect.ownerId !== (options.id || options.session?.id))
      && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) && boundsOverlap(bounds, rect, RESERVED_GAP));
  }

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
    let result, pageCapacity = CAPACITY;
    const hasHelpers = room.some(session => !suppressed(session) && rootIdsBySession.get(session.id) !== session.id);
    // Capacity is a property of the available room, never of which page was
    // visited first. Reserve one helper when families exist so roster selection
    // cannot create a different page divisor and skip independent roots.
    while (pageCapacity > 1) {
      let fits = true;
      for (let start = 0; start < roots.length; start += pageCapacity) {
        const heads = roots.slice(start, start + pageCapacity);
        const ids = new Set(heads.map(session => session.id));
        const probe = heads.filter(session => !suppressed(session));
        if (hasHelpers) {
          const helper = room.filter(session => !suppressed(session) && !ids.has(session.id) && ids.has(rootIdsBySession.get(session.id)))
            .sort((a, b) => {
              const bounds = session => actorBounds({ x: 50, y: 78 }, { helper: true, scale: options.scale, footprint: options.footprints?.get(session.id) });
              return bounds(b).width - bounds(a).width || String(a.id).localeCompare(String(b.id));
            })[0];
          if (helper) probe.push(helper);
        }
        if (!assignSeats(probe, new Map(), options).fits) { fits = false; break; }
      }
      if (fits) break;
      pageCapacity -= 1;
    }
    // Reserve the same readable envelopes used by rendering and walking. If a
    // larger scale or overlay reduces space, change pages rather than stack bodies.
    {
      const capacity = pageCapacity;
      const pages = Math.max(1, Math.ceil(roots.length / capacity));
      let current = Math.max(0, Math.min(pages - 1, Math.floor(finite(page))));
      const preferredRoot = rootIdsBySession.get(preferredId);
      const selectedIndex = roots.findIndex(session => session.id === preferredRoot);
      if (selectedIndex >= 0) current = Math.floor(selectedIndex / capacity);
      const pageHeads = roots.slice(current * capacity, (current + 1) * capacity);
      const mains = pageHeads.filter(session => !suppressed(session));
      const rootIds = new Set(pageHeads.map(session => session.id));
      // Keep full ancestry before hiding cached bodies; nested helpers retain
      // their original parent even when that parent is only a virtual group.
      const helpers = room.filter(session => !rootIds.has(session.id) && rootIds.has(rootIdsBySession.get(session.id)) && !suppressed(session));
      helpers.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId) || Number(needsAttention(b)) - Number(needsAttention(a)) || String(a.id).localeCompare(String(b.id)));
      const minimumHelpers = helpers.some(session => session.id === preferredId) ? 1 : 0;
      for (let count = Math.min(3, helpers.length); count >= minimumHelpers; count -= 1) {
        const visible = mains.concat(helpers.slice(0, count));
        const seats = assignSeats(visible, options.previousSeats || new Map(), { ...options, preferredId });
        result = { page: current, pages, roots, rootIdsBySession, visible, capacity, helperCapacity: count, seats,
          helperOverflow: Math.max(0, helpers.length - count), hidden: Math.max(0, room.length - visible.length), layoutFits: seats.fits };
        if (seats.fits) return result;
      }
    }
    // An overlay can occupy the entire room. Keep every source task and page
    // selectable, but explicitly report that no body has safe visual space.
    return { ...result, visible: [], seats: new Map(), hidden: room.length, layoutFits: false };
  }

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return result >>> 0;
  }

  function assignSeats(sessions, previous = new Map(), options = {}) {
    const gap = Number.isFinite(options.gap) ? Math.max(0, options.gap) : ACTOR_GAP;
    const descriptors = sessions.map(session => {
      const old = previous.get(session.id), spec = activitySpec(session);
      const zone = spec.stale && old ? old.zone : spec.zone;
      return { session, old, spec, zone, helper: Boolean(session.parentId), scale: agentScale(options.scale), footprint: options.footprints?.get(session.id), entering: Boolean(options.entryIds?.has(session.id)) };
    }).sort((a, b) => Number(b.entering) - Number(a.entering) || Number(b.session.id === options.preferredId) - Number(a.session.id === options.preferredId)
      || Number(a.helper) - Number(b.helper) || String(a.session.id).localeCompare(String(b.session.id)));
    // A larger body may need another seat in its work area, never a coding
    // station on the back wall. This constraint applies to seats, not walks.
    const foreground = actor => ['desk', 'sofa', 'front', 'archive', 'lobby', 'exit'].includes(actor.zone);
    const safe = (point, actor, placed) => stationCompatible(point, actor.zone)
      && legalActorPoint(point, { ...options, ...actor })
      && !placed.some(other => actorsOverlap(point, actor, other.point, other.actor, gap));
    const finish = placed => {
      const seats = new Map(placed.map(({ actor, point }) => [actor.session.id, {
        x: point.x, y: point.y, zone: actor.zone, depth: .76 + point.y / 500, helper: actor.helper,
        ...(actor.spec.stale ? { stale: true } : {}),
      }]));
      // Map metadata avoids a second, divergent fit check in callers.
      Object.defineProperties(seats, { fits: { value: placed.length === sessions.length }, unplacedIds: {
        value: descriptors.filter(actor => !seats.has(actor.session.id)).map(actor => actor.session.id),
      } });
      return seats;
    };
    const placed = [];
    for (const actor of descriptors) {
      const candidates = ZONES[actor.zone].seats.map(([x, y]) => ({ x, y }));
      const offset = hash(actor.session.id) % Math.min(2, candidates.length);
      if (offset) candidates.push(...candidates.splice(0, offset));
      if (actor.old && (actor.spec.stale || actor.old.zone === actor.zone)) candidates.unshift(actor.old);
      const target = candidates[0];
      const alternatives = [];
      for (const y of [40.7, 41, 42.5, 44, 46, 46.5, 70, 73, 76, 78, 80, 82, 84]) for (let x = 7; x <= 94; x += 3) alternatives.push({ x, y });
      alternatives.sort((a, b) => distance(a, target) - distance(b, target) || a.y - b.y || a.x - b.x);
      const choices = candidates.concat(alternatives);
      if (actor.entering) {
        const entrance = options.entryPoint || { x: 87, y: 78 };
        choices.sort((a, b) => distance(a, entrance) - distance(b, entrance) || b.x - a.x);
        if (actor.old && actor.old.zone === actor.zone) choices.unshift(actor.old);
      }
      const point = choices.find(point => safe(point, actor, placed));
      if (!point) break;
      placed.push({ actor, point });
    }
    if (placed.length === descriptors.length) return finish(placed);

    // Two pedestrian rows give a bounded, deterministic packing fallback. Full
    // rectangles are justified across the viewport; helpers can clear a central
    // clock at the upper row while larger main agents occupy the outer lanes.
    const viewport = options.viewport || ACTOR_VIEWPORT;
    const rows = actors => {
      if (!actors.length) return [[]];
      const entries = actors.map(actor => {
        const y = actor.row === 0 ? (actor.zone === 'board' ? 46.5 : actor.helper ? 42.5 : 43) : 78;
        const bounds = actorBounds({ x: 0, y }, actor);
        return { actor, y, bounds };
      });
      let cursor = viewport.left;
      const result = [];
      for (const entry of entries) {
        const area = STATION_AREAS[entry.actor.zone];
        let left = Math.max(cursor, viewport.left, area.x1 * WORLD.width / 100 + entry.bounds.left);
        // Skip reserved clock/door rectangles while preserving the station's
        // foot range. No borrowing a different artwork zone to finish a row.
        for (let pass = 0; pass <= (options.reservedRects || []).length; pass += 1) {
          const rect = (options.reservedRects || []).find(rect => (!rect.ownerId || rect.ownerId !== entry.actor.session.id)
            && entry.bounds.top < rect.bottom + 4 && entry.bounds.bottom > rect.top - 4
            && left < rect.right + 4 && left + entry.bounds.width > rect.left - 4);
          if (!rect) break;
          left = rect.right + 4;
        }
        let point = { x: (left - entry.bounds.left) * 100 / WORLD.width, y: entry.y };
        // Large board actors clear the clock only in the narrow aisles beside
        // and between desks. Scan legal feet inside this station, never move a
        // planning task into the bookshelf or the build bench to make it fit.
        while (point.x <= area.x2 && !legalActorPoint(point, { ...options, ...entry.actor })) {
          point = { x: point.x + .25, y: entry.y }; left += .25 * WORLD.width / 100;
        }
        if (left + entry.bounds.width > viewport.right + 1e-7 || !stationCompatible(point, entry.actor.zone)) return [];
        result.push({ actor: entry.actor, point }); cursor = left + entry.bounds.width + gap;
      }
      return [result];
    };
    let solution = null;
    const permutations = (remaining, order, split) => {
      if (solution) return;
      if (!remaining.length) {
        const top = rows(order.slice(0, split).map(actor => ({ ...actor, row: 0 })));
        const bottom = rows(order.slice(split).map(actor => ({ ...actor, row: 1 })));
        for (const upper of top) for (const lower of bottom) {
          const candidate = upper.concat(lower), checked = [];
          let valid = true;
          for (const entry of candidate) { if (!safe(entry.point, entry.actor, checked)) { valid = false; break; } checked.push(entry); }
          if (!valid) continue;
          // A deliberate selection is allowed to retain its old position whenever
          // the same complete layout remains legal with that body anchored there.
          const selected = candidate.find(entry => entry.actor.session.id === options.preferredId && entry.actor.old);
          if (selected && safe(selected.actor.old, selected.actor, candidate.filter(entry => entry !== selected))) selected.point = selected.actor.old;
          solution = candidate;
          return;
        }
        return;
      }
      const triedFootprints = new Set();
      for (let index = 0; index < remaining.length; index += 1) {
        // IDs and observed activities do not change an envelope. Equivalent
        // permutations need only one fit check, bounding the eight-body search
        // by root/helper arrangements rather than 8! identical rectangles.
        const actor = remaining[index];
        const footprint = JSON.stringify([actor.helper, actor.zone, actor.entering, actor.footprint || null]);
        if (triedFootprints.has(footprint)) continue;
        triedFootprints.add(footprint);
        permutations(remaining.slice(0, index).concat(remaining.slice(index + 1)), order.concat(remaining[index]), split);
        if (solution) break;
      }
    };
    if (descriptors.length <= 8) {
      const splitOrder = Array.from({ length: descriptors.length + 1 }, (_, index) => index)
        .filter(split => split <= descriptors.filter(actor => !foreground(actor)).length)
        .sort((a, b) => Math.abs(a - descriptors.length / 2) - Math.abs(b - descriptors.length / 2));
      for (const split of splitOrder) { permutations(descriptors, [], split); if (solution) break; }
    }
    return finish(solution || placed);
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

  return { WORLD, CAPACITY, ALL_ROOMS, ZONES, STATION_AREAS, stationCompatible, SPECS, OBSTACLES, ACTOR_GAP, ACTOR_VIEWPORT, CLOCK_RESERVED, ACTOR_FOOTPRINT, actorScale, actorBounds, actorReservation, boundsOverlap, actorsOverlap, legalActorPoint, timestamp, distance, projectKey, inRoom, providerName, identityName, createIdentityRegistry, isClosed, needsAttention, activitySpec, roomsFor, chooseRoom, pageSessions, assignSeats, route, segmentHitsRect, shortTitle };
});
