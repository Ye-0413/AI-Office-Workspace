'use strict';

// Inspect the *submitted* Codex tool invocation. Never execute code, expand a
// shell command, or retain its arguments. Code-mode wraps real calls in exec;
// a small bounded lexer keeps strings/comments from masquerading as calls.
const LIMITS = Object.freeze({ source: 256 * 1024, tokens: 16000, calls: 64 });
const SIMPLE = Object.freeze({ apply_patch: 'coding', write_file: 'coding', edit_file: 'coding',
  read_file: 'reading', view_file: 'reading', view_image: 'reading',
  list_dir: 'searching', list_directory: 'searching', glob: 'searching', grep: 'searching',
  update_plan: 'planning', spawn_agent: 'planning', followup_task: 'planning', send_message: 'planning',
  web_search: 'searching', 'web.run': 'searching', web__run: 'searching',
  wait: 'waiting-tool', wait_agent: 'waiting-tool', write_stdin: 'waiting-tool', request_user_input: 'waiting-user' });
const PRIORITY = ['coding', 'testing', 'building', 'waiting-user', 'running', 'reading', 'searching', 'planning', 'waiting-tool'];
const nameOf = name => typeof name === 'string' ? name.replace(/^(?:functions\.|functions__|collaboration\.)/, '') : '';
function tokensOf(source) {
  if (typeof source !== 'string' || source.length > LIMITS.source) return null;
  const tokens = [];
  let index = 0;
  while (index < source.length && tokens.length < LIMITS.tokens) {
    const c = source[index];
    if (/\s/.test(c)) { index += 1; continue; }
    if (source.startsWith('//', index)) { const end = source.indexOf('\n', index + 2); index = end < 0 ? source.length : end + 1; continue; }
    if (source.startsWith('/*', index)) { const end = source.indexOf('*/', index + 2); if (end < 0) return null; index = end + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let value = '', literal = true, ended = false;
      index += 1;
      while (index < source.length) {
        const current = source[index++];
        if (current === quote) { ended = true; break; }
        if (quote === '`' && current === '$' && source[index] === '{') literal = false;
        if (current !== '\\') { value += current; continue; }
        if (index >= source.length) return null;
        const escaped = source[index++];
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
        if (escaped === 'u' || escaped === 'x') {
          const width = escaped === 'u' ? 4 : 2, hex = source.slice(index, index + width);
          if (!new RegExp('^[0-9a-f]{' + width + '}$', 'i').test(hex)) literal = false;
          else { value += String.fromCharCode(parseInt(hex, 16)); index += width; }
        } else if (escaped === '\n') { /* JS line continuation. */ }
        else value += Object.hasOwn(escapes, escaped) ? escapes[escaped] : escaped;
      }
      if (!ended) return null;
      tokens.push({ value: literal ? value : '', type: literal ? 'string' : 'dynamic' }); continue;
    }
    // A regexp is opaque, including its character classes. Division stays a
    // punctuation token. This avoids finding fake calls in /tools.foo(...)/.
    if (c === '/' && (!tokens.length || ['=', '(', '[', '{', ':', ',', ';', '!', '?', 'return', '=>'].includes(tokens.at(-1).value))) {
      index += 1; let characterClass = false, ended = false;
      while (index < source.length) {
        const current = source[index++];
        if (current === '\\') { index += 1; continue; }
        if (current === '[') characterClass = true;
        if (current === ']') characterClass = false;
        if (current === '/' && !characterClass) { ended = true; break; }
        if (current === '\n') return null;
      }
      if (!ended) return null;
      while (/[a-z]/i.test(source[index] || '') && index < source.length) index += 1;
      tokens.push({ value: '', type: 'opaque' }); continue;
    }
    const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index));
    if (word) { tokens.push({ value: word[0], type: 'word' }); index += word[0].length; continue; }
    if (source.startsWith('=>', index)) { tokens.push({ value: '=>', type: 'punctuation' }); index += 2; continue; }
    tokens.push({ value: c, type: 'punctuation' }); index += 1;
  }
  return index === source.length ? tokens : null;
}
function literalInput(tokens, start) {
  if (tokens[start]?.value !== '{') return {};
  let depth = 0, result = {};
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (depth === 1 && token.type === 'punctuation' && token.value === '.' && tokens[index + 1]?.value === '.') return {};
    if (token.type === 'punctuation' && ['{', '[', '('].includes(token.value)) depth += 1;
    if (token.type === 'punctuation' && ['}', ']', ')'].includes(token.value)) { depth -= 1; if (!depth) break; }
    if (depth === 1 && ['cmd', 'command'].includes(token.value) && tokens[index + 1]?.value === ':') {
      const after = tokens[index + 3];
      if (tokens[index + 2]?.type !== 'string' || after?.type !== 'punctuation' || ![',', '}'].includes(after.value)) return {};
      result = { [token.value]: tokens[index + 2].value };
    }
  }
  return result;
}
function classifyCodexTool(name, input, { classifyShell = () => ({ activity: 'running' }), fallback = 'running' } = {}) {
  const tool = nameOf(name);
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (['exec_command', 'shell_command', 'shell', 'Bash'].includes(tool)) return { activity: classifyShell(args.cmd || args.command).activity, toolName: name };
  if (Object.hasOwn(SIMPLE, tool)) return { activity: SIMPLE[tool], toolName: name };
  if (tool !== 'exec') return { activity: fallback, toolName: name };
  const source = typeof input === 'string' ? input : args.code || args.input;
  const tokens = tokensOf(source);
  if (!tokens) return { activity: fallback, toolName: name };
  const calls = [];
  let functionDepth = 0, depth = 0, pendingFunction = false;
  for (let index = 0; index < tokens.length && calls.length < LIMITS.calls; index += 1) {
    const token = tokens[index];
    if (token.type !== 'string' && ['function', '=>'].includes(token.value)) pendingFunction = true;
    if (token.type === 'punctuation' && token.value === '{') { depth += 1; if (pendingFunction && !functionDepth) { functionDepth = depth; pendingFunction = false; } }
    if (token.type === 'punctuation' && token.value === '}') { if (functionDepth === depth) functionDepth = 0; depth -= 1; }
    if (token.type === 'punctuation' && token.value === ';') pendingFunction = false;
    if (functionDepth || pendingFunction || token.type !== 'word' || token.value !== 'tools' || tokens[index - 1]?.value === '.') continue;
    if (tokens[index + 1]?.value !== '.' || tokens[index + 2]?.type !== 'word' || tokens[index + 3]?.value !== '(') continue;
    const nestedName = tokens[index + 2].value;
    if (nestedName === 'exec') continue; // Never recurse through arbitrary code.
    const nested = classifyCodexTool(nestedName, literalInput(tokens, index + 4), { classifyShell, fallback });
    calls.push(nested);
  }
  if (!calls.length) return { activity: fallback, toolName: name };
  calls.sort((a, b) => PRIORITY.indexOf(a.activity) - PRIORITY.indexOf(b.activity));
  const chosen = calls[0];
  return { activity: chosen.activity, toolName: 'exec → ' + chosen.toolName, codeMode: true };
}

module.exports = { classifyCodexTool, LIMITS };
