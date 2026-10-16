'use strict';
// Small JSONC reader/editor for registration arrays. It rejects duplicate keys
// and edits exact owned elements while retaining every other byte/comment.
function parse(source) {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  function skip() { for (;;) { while (/\s/.test(source[i] || '') && i < source.length) i++; if (source.slice(i, i + 2) === '//') { i = source.indexOf('\n', i); if (i < 0) i = source.length; } else if (source.slice(i, i + 2) === '/*') { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('Unterminated JSONC comment'); i = end + 2; } else break; } }
  function value(depth = 0) {
    if (depth > 64) throw new Error('Config nesting exceeds limit'); skip(); const start = i, ch = source[i];
    if (ch === '"') { i++; for (;;) { if (i >= source.length) throw new Error('Unterminated config string'); const next = source[i++]; if (next === '\\') i++; else if (next === '"') break; } return { start, end: i, value: JSON.parse(source.slice(start, i)) }; }
    if (ch === '{' || ch === '[') {
      const array = ch === '[', items = [], keys = new Set(), result = array ? [] : Object.create(null); i++; skip();
      const endChar = array ? ']' : '}';
      while (source[i] !== endChar) {
        let key, keyNode;
        if (!array) { keyNode = value(depth + 1); key = keyNode.value; if (typeof key !== 'string' || keys.has(key)) throw new Error('Duplicate or invalid config key'); keys.add(key); skip(); if (source[i++] !== ':') throw new Error('Invalid config object'); }
        const child = value(depth + 1), item = { ...child, key, keyStart: keyNode?.start }; items.push(item);
        if (array) result.push(child.value); else Object.defineProperty(result, key, { value: child.value, enumerable: true, writable: true, configurable: true });
        skip(); if (source[i] === ',') { item.comma = i++; skip(); } else if (source[i] !== endChar) throw new Error('Invalid config separator');
        if (i >= source.length) throw new Error('Unterminated config');
      }
      i++; return { start, end: i, value: result, items, array };
    }
    const match = source.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) throw new Error('Invalid config value'); i += match[0].length; return { start, end: i, value: JSON.parse(match[0]) };
  }
  const root = value(); skip(); if (i !== source.length || !root.value || Array.isArray(root.value) || typeof root.value !== 'object') throw new Error('Config must be one object'); return root;
}
function updateArray(source, key, entry, install) {
  for (;;) {
    const root = parse(source), node = root.items.find(item => item.key === key);
    if (!node) {
      if (!install) return source;
      const last = root.items.at(-1), addition = `${JSON.stringify(key)}: [${JSON.stringify(entry)}]`;
      if (!last) return source.slice(0, root.end - 1) + `\n  ${addition}\n` + source.slice(root.end - 1);
      const pos = last.comma === undefined ? last.end : last.comma + 1;
      return source.slice(0, pos) + (last.comma === undefined ? ',' : '') + `\n  ${addition}` + (last.comma === undefined ? '' : ',') + source.slice(pos);
    }
    if (!node.array) throw new Error(`Config ${key} must be an array`);
    const index = node.items.findIndex(item => item.value === entry);
    if (install) {
      if (index >= 0) return source;
      const last = node.items.at(-1), pos = last ? last.comma === undefined ? last.end : last.comma + 1 : node.end - 1;
      return source.slice(0, pos) + (last && last.comma === undefined ? ',' : '') + `\n    ${JSON.stringify(entry)}` + (last?.comma === undefined ? '' : ',') + source.slice(pos);
    }
    if (index < 0) return source;
    const item = node.items[index], comma = item.comma ?? node.items[index - 1]?.comma;
    const edits = [[item.start, item.end], ...(comma === undefined ? [] : [[comma, comma + 1]])].sort((a, b) => b[0] - a[0]);
    for (const [start, end] of edits) source = source.slice(0, start) + source.slice(end);
  }
}
module.exports = { parse, updateArray };
