'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyCodexTool, LIMITS } = require('../lib/codex-tool-activity.cjs');
const { classifyShell, normalizeEvent } = require('../lib/provider-events.cjs');
const classify = (input, name = 'exec') => classifyCodexTool(name, input, { classifyShell });

test('Codex native namespaces and code-mode batches retain the actual tool category', () => {
  assert.equal(classify({cmd:'npm test'}, 'functions.exec_command').activity, 'testing');
  assert.equal(classify('PRIVATE PATCH', 'functions.apply_patch').activity, 'coding');
  for (const [code, expected] of [
    ['text(await tools.apply_patch("PRIVATE PATCH"));', 'coding'],
    ['const result = await tools.exec_command({cmd:"npm test",workdir:"/example"}); text(result);', 'testing'],
    ["text(await tools.exec_command({cmd:'npm run build'}));", 'building'],
    ['text(await tools.exec_command({"cmd":`rg source src`}));', 'searching'],
    ['const r = await Promise.allSettled([tools.exec_command({cmd:"cat README.md"}), tools.apply_patch("PATCH")]);', 'coding'],
    ['text(await tools.exec_command({cmd:"cat README.md"}));', 'reading'],
    ['text(await tools.mcp__custom__design_and_test({}));', 'running'],
  ]) assert.equal(classify(code).activity, expected, code);
  assert.deepEqual(classify('text(await tools.apply_patch("PRIVATE PATCH"));'), {activity:'coding',toolName:'exec → apply_patch',codeMode:true});
});

test('code-mode lexing is bounded and never treats quoted examples, comments, regexps or uncalled functions as operations', () => {
  for (const input of [
    'text("tools.apply_patch(\\"fake\\")");',
    "// await tools.apply_patch('fake')\ntext('hello');",
    "/* tools.apply_patch('fake') */ text('hello');",
    'const expression = /tools.apply_patch("fake")/; text(expression);',
    "const example = `tools.apply_patch('fake')`; text(example);",
    "function unused() { return tools.apply_patch('fake'); } text('hello');",
    "const unused = () => { return tools.apply_patch('fake'); }; text('hello');",
    "const unused = () => tools.apply_patch('fake'); text('hello');",
    'text(await tools.exec_command({cmd:"npm test" + suffix}));',
    'text(await tools.exec_command({cmd:`npm test ${suffix}`}));',
    'text(await tools.exec_command({cmd:"npm test", ...override}));',
    'text(await tools.exec_command({cmd:command}));',
    'text(await tools.exec("tools.apply_patch(\\"fake\\")"));',
    "'unterminated",
    'x'.repeat(LIMITS.source + 1),
  ]) assert.equal(classify(input).activity, 'running', input.slice(0, 100));
  assert.equal(classify('text("{"); text(await tools.apply_patch("PATCH"));').activity, 'coding');
  assert.equal(classify('const r = await tools.exec_command({cmd:"\\u006e\\u0070\\u006d test"});').activity, 'testing');
  assert.equal(classify({code:'await tools.apply_patch("PATCH")'}).activity, 'coding');
});

test('Codex official-hook normalization uses the same categories without matching arbitrary custom tool substrings', () => {
  const base = {session_id:'one',hook_event_name:'PreToolUse',tool_use_id:'call',tool_name:'functions.exec',tool_input:{code:'text(await tools.apply_patch("PRIVATE PATCH"));'}};
  const event = normalizeEvent('codex', base);
  assert.equal(event.activity,'coding'); assert.equal(event.evidence.confidence,'code-mode-derived');
  assert.ok(!JSON.stringify(event).includes('PRIVATE PATCH'));
  for (const [tool_name, tool_input, expected] of [
    ['exec_command',{cmd:'npm test'},'testing'], ['Bash',{command:'cat README.md'},'reading'],
    ['apply_patch',{},'coding'], ['mcp__custom__test_connection',{},'unknown'],
  ]) assert.equal(normalizeEvent('codex',{...base,tool_name,tool_input}).activity,expected);
});
