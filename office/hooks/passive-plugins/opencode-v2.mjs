import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export default {
  id: 'ai-mini-office',
  setup(ctx = {}) {
    const controller = new AbortController();
    const observer = runtime.createObserver('opencode', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
    if (typeof ctx.event?.subscribe === 'function') void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (controller.signal.aborted) break;
        try { observer.opencode(event, undefined, true); } catch {}
      }
    })().catch(() => {});
    return () => controller.abort();
  },
};
