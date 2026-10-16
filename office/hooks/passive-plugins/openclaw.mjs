import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export default {
  id: 'ai-mini-office',
  name: 'AI Mini Office',
  register(api) {
    const observer = runtime.createObserver('openclaw', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
    for (const name of ['session_start', 'model_call_started', 'before_tool_call', 'after_tool_call', 'before_compaction', 'after_compaction', 'model_call_ended', 'session_end']) {
      api.on(name, (event, ctx) => { try { observer.openclaw(name, event, ctx); } catch {} return undefined; });
    }
  },
};
