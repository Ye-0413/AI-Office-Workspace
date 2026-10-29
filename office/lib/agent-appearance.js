/* Original workshop creatures. Selection observes real session ancestry and
 * never changes a provider, an actor identity, or a recorded parent link. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OfficeAgentAppearance = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const catalog = Object.freeze([
    { id: 'folio', labelZh: '纸团', labelEn: 'Folio', roleZh: '写作 · 研究', roleEn: 'Writing · research', descriptionZh: '奶油色折纸四足小兽，带着柔软折痕与层叠纸页。', descriptionEn: 'A cream paper quadruped with soft folds and layered pages.' },
    { id: 'ink', labelZh: '墨豆', labelEn: 'Ink', roleZh: '编码 · 调试', roleEn: 'Coding · debugging', descriptionZh: '深蓝墨液凝成的小生灵，身体柔软，脚边像一汪墨。', descriptionEn: 'A deep blue liquid creature, softly pooled around its feet.' },
    { id: 'moss', labelZh: '苔盒', labelEn: 'Moss', roleZh: '长时任务 · 后台', roleEn: 'Long tasks · background', descriptionZh: '矮敦的陶土小兽，背上长着一层安静的苔藓。', descriptionEn: 'A squat terracotta beast carrying a quiet patch of moss.' },
    { id: 'thread', labelZh: '线团', labelEn: 'Thread', roleZh: '设计 · 创作', roleEn: 'Design · creative work', descriptionZh: '珊瑚色毛线绕成的伙伴，细密纱线保留蓬松的手感。', descriptionEn: 'A coral yarn companion, wound in fine, softly textured strands.' },
    { id: 'glow', labelZh: '灯籽', labelEn: 'Glow', roleZh: '协调 · 提醒', roleEn: 'Coordination · reminders', descriptionZh: '半透明的琥珀种籽，透出温和、微亮的内芯。', descriptionEn: 'A translucent amber seed with a gentle light held inside.' }
  ].map(design => Object.freeze({ ...design, renderer: 'creature', asset: 'workshop-' + design.id + '.png', poseColumns: 3, poseRows: 2, variantIndex: 0, appearanceKey: design.id + ':0' })));
  const IDS = Object.freeze(catalog.map(shape => shape.id));
  const MODES = Object.freeze(['mixed']);
  // Global fixed-body modes cannot satisfy distinct main appearances. All
  // former preferences now follow the family allocator without losing any
  // unrelated saved preference.
  const LEGACY_MODES = Object.freeze(Object.fromEntries(['original', 'orb', 'console', 'sprout', 'kite', 'prism', ...IDS].map(id => [id, 'mixed'])));
  const aliases = Object.freeze({ claude: 'claude-code', 'claude code': 'claude-code', 'cursor-agent': 'cursor', 'cursor agent': 'cursor' });
  const text = value => typeof value === 'string' ? value : '';
  function providerFor(session) {
    const name = text(session && session.provider).trim().toLowerCase();
    return Object.hasOwn(aliases, name) ? aliases[name] : name || 'agent';
  }
  function identityFor(session) {
    if (!session || typeof session !== 'object') return '';
    // Canonical actor IDs already include provider and subagent identity.
    if (text(session.id)) return session.id;
    return text(session.sessionId) ? providerFor(session) + ':' + session.sessionId : '';
  }
  function migrateMode(value) {
    if (typeof value !== 'string') return null;
    if (Object.hasOwn(LEGACY_MODES, value)) return LEGACY_MODES[value];
    return MODES.includes(value) ? value : null;
  }
  function normalizeMode(value) { return migrateMode(value) || 'mixed'; }
  function indexSessions(sessions) {
    if (sessions instanceof Map) return sessions;
    const index = new Map();
    for (const session of Array.isArray(sessions) ? sessions : []) {
      const id = identityFor(session);
      if (id) index.set(id, session);
    }
    return index;
  }
  function parentFor(session) {
    if (text(session && session.parentId)) return session.parentId;
    // Native monitor records may still carry the provider's session ID.
    return text(session && session.parentSessionId) ? providerFor(session) + ':' + session.parentSessionId : '';
  }
  function rootRecord(session, sessions) {
    const bySession = indexSessions(sessions), id = identityFor(session);
    if (!id) return { id: '', session: session || {} };
    const chain = [], seen = new Map();
    let current = session, currentId = id;
    while (true) {
      seen.set(currentId, chain.length);
      chain.push({ id: currentId, session: current });
      const parentId = parentFor(current);
      if (!parentId) return chain[chain.length - 1];
      if (seen.has(parentId)) {
        // Only cycle members select its canonical anchor. A descendant with
        // an earlier name cannot change the shape of the entire cycle.
        return chain.slice(seen.get(parentId)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
      }
      const parent = bySession.get(parentId);
      if (!parent || typeof parent !== 'object') return { id: parentId, session: current, missing: true };
      current = parent;
      currentId = parentId;
    }
  }
  function resolveRoot(session, { sessions } = {}) { return rootRecord(session, sessions).id; }
  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
    return (result ^ (result >>> 16)) >>> 0;
  }
  function forSession(session, { sessions } = {}) {
    const root = rootRecord(session, sessions);
    return catalog[hash(root.id || providerFor(root.session)) % catalog.length];
  }
  function createAllocator({ retentionLimit = 1024 } = {}) {
    const baseCount = catalog.length;
    const limit = Number.isInteger(retentionLimit) && retentionLimit >= baseCount ? retentionLimit : 1024;
    const entries = new Map(), descriptors = new Map(); let active = new Set();
    function update(rootIds) {
      const ids = [...new Set((Array.isArray(rootIds) ? rootIds : []).filter(id => typeof id === 'string' && id.length > 0))].sort();
      const assigned = new Map(), used = new Set(), pending = [];
      for (const id of ids) if (active.has(id)) {
        const index = entries.get(id);
        if (Number.isInteger(index) && !used.has(index)) { assigned.set(id, index); used.add(index); }
        else pending.push(id);
      }
      // Returning families reclaim a free previous companion before a new
      // arrival can take it. Existing visible families always retain priority.
      for (const id of ids) if (!active.has(id) && entries.has(id)) {
        const index = entries.get(id);
        if (!used.has(index)) { assigned.set(id, index); used.add(index); }
        else pending.push(id);
      }
      for (const id of ids) if (!active.has(id) && !entries.has(id)) pending.push(id);
      let row = 0;
      for (const id of pending) {
        const start = entries.has(id) ? entries.get(id) % baseCount : hash(id) % baseCount;
        let slot;
        // Fill the five original materials first, then balanced variant rows.
        // A colour slot can be reused only after its visible owner departs.
        while (slot === undefined) {
          for (let step = 0; step < baseCount; step += 1) {
            const candidate = row * baseCount + (start + step) % baseCount;
            if (!used.has(candidate)) { slot = candidate; break; }
          }
          if (slot === undefined) row += 1;
        }
        assigned.set(id, slot); used.add(slot);
      }
      active = new Set(ids);
      for (const id of ids) { entries.delete(id); entries.set(id, assigned.get(id)); }
      if (entries.size > limit) for (const id of entries.keys()) {
        if (entries.size <= limit) break;
        if (!active.has(id)) entries.delete(id);
      }
      return api;
    }
    // Passive roster/history lookup never reserves a visible slot. The scene
    // owner must update() its complete on-floor root set before making actors.
    function forRoot(rootId) {
      const id = typeof rootId === 'string' && rootId ? rootId : 'unresolved';
      const slot = entries.has(id) ? entries.get(id) : hash(id) % baseCount;
      const base = catalog[slot % baseCount], variantIndex = Math.floor(slot / baseCount);
      if (!variantIndex) return base;
      if (!descriptors.has(slot)) descriptors.set(slot, Object.freeze({ ...base, variantIndex, appearanceKey: base.id + ':' + variantIndex }));
      return descriptors.get(slot);
    }
    function allocatedSession(session, { sessions } = {}) { return forRoot(resolveRoot(session, { sessions })); }
    const api = Object.freeze({ update, forRoot, forSession: allocatedSession, get size() { return entries.size; }, get baseCount() { return baseCount; }, get activeRoots() { return Object.freeze([...active]); } });
    return api;
  }
  return Object.freeze({ catalog, IDS, MODES, LEGACY_MODES, forSession, resolveRoot, normalizeMode, migrateMode, indexSessions, createAllocator });
});
