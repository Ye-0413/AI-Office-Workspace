import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export default async function miniOffice(ctx = {}) {
  const observer = runtime.createObserver('opencode', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
  return { event({ event } = {}) { try { observer.opencode(event, ctx.directory); } catch {} return undefined; } };
}
