import runtime from './runtime.cjs';
import questions from './questions.cjs';
import { fileURLToPath } from 'node:url';
export default async function miniOffice(ctx = {}) {
  const config=fileURLToPath(new URL('./observer-config.json', import.meta.url));
  const observer = runtime.createObserver('opencode', runtime.sender(config));
  const questionClient=questions.createQuestionClient('opencode',ctx,config);
  return { event({ event } = {}) { try { observer.opencode(event, ctx.directory);questionClient.event(event); } catch {} return undefined; } };
}
