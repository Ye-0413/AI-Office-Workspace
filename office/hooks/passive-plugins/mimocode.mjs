import runtime from './runtime.cjs';
import questions from './questions.cjs';
import { fileURLToPath } from 'node:url';
export default async function miniOffice(ctx = {}) {
  const config=fileURLToPath(new URL('./observer-config.json', import.meta.url));
  const observer = runtime.createObserver('mimocode', runtime.sender(config));
  const questionClient=questions.createQuestionClient('mimocode',ctx,config);
  return { event({ event } = {}) { try { observer.opencode(event, ctx.directory);questionClient.event(event); } catch {} return undefined; } };
}
