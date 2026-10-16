import runtime from './runtime.cjs';
import { fileURLToPath } from 'node:url';
export default function miniOffice(api: any) {
  const observer = runtime.createObserver('omp', runtime.sender(fileURLToPath(new URL('./observer-config.json', import.meta.url))));
  for (const name of ['session_start', 'session_switch', 'session_branch', 'before_agent_start', 'session_stop', 'agent_end', 'session_before_compact', 'session_compact', 'session_shutdown', 'tool_call', 'tool_result']) {
    api.on(name, (event: any, ctx: any) => { try { observer.pi(name, event, ctx); } catch {} return undefined; });
  }
}
