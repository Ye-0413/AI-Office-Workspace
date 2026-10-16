import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export function apply(ctx) {
  const observer = runtime.createObserver('deepseek-harness', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
  for (const name of ['session/created', 'session/event', 'session/disposed']) {
    ctx.on(name, (session, event) => { try { observer.dsh(name, session, event); } catch {} return undefined; });
  }
}
export default apply;
