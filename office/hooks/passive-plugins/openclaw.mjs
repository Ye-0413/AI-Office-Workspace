import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export default {
  id: 'ai-mini-office',
  name: 'AI Mini Office',
  register(api) {
    const observer = runtime.createObserver('openclaw', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
    for (const name of ['session_start', 'before_tool_call', 'after_tool_call', 'before_compaction', 'after_compaction', 'session_end', 'before_agent_start', 'agent_end']) {
      // Later hosts may remove a hook or gate it behind conversation access.
      // Retain passive observation without changing that grant or losing the
      // remaining metadata/tool hooks when one registration is unavailable.
      try { api.on(name, (event, ctx) => { try { observer.openclaw(name, event, ctx); } catch {} return undefined; }); }
      catch { api.logger?.warn?.('AI Mini Office observation hook unavailable: ' + name); }
    }
  },
};
