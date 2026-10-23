'use strict';

const ROLLOUT_HEALTHY = '本地 rollout 只读观察中';
const ROLLOUT_ERROR_PREFIX = '本地 rollout 只读观察异常：';

// A running poll timer is not proof that its source can be read. Hooks and the
// native rollout observer are independent: either healthy source can observe.
function mergeObservationHealth(connection, monitorStatus, sessions = []) {
  const nativeSource=monitorStatus?.sources?.find(source=>source.provider===connection.provider&&source.activity);
  if (connection.provider !== 'codex'&&!nativeSource) return connection;
  if(nativeSource){
    const monitorError=nativeSource.error||null;
    const observing=Boolean(monitorStatus.running&&nativeSource.available&&!monitorError);
    const times=sessions.filter(session=>session.provider===connection.provider).map(session=>session.lastEventAt).filter(Number.isFinite);
    return{...connection,watching:Boolean(connection.watching||observing),lastEventAt:Math.max(connection.lastEventAt||0,...times),monitorError,
      detail:[connection.detail,monitorError?'本机会话日志只读观察异常：'+monitorError:observing?'本机会话日志只读观察中':''].filter(Boolean).join(' · ')};
  }
  const monitorError = typeof monitorStatus?.error === 'string' && monitorStatus.error
    ? monitorStatus.error : null;
  const rolloutWatching = Boolean(monitorStatus?.running && !monitorError);
  const observedAt = sessions.filter(session => session.provider === 'codex')
    .map(session => session.lastEventAt).filter(at => Number.isFinite(at) && at >= 0);
  const connectionAt = Number.isFinite(connection.lastEventAt) && connection.lastEventAt >= 0
    ? connection.lastEventAt : 0;
  const sourceDetail = monitorError ? ROLLOUT_ERROR_PREFIX + monitorError
    : rolloutWatching ? ROLLOUT_HEALTHY : '';
  return {
    ...connection,
    watching: Boolean(connection.watching || rolloutWatching),
    lastEventAt: Math.max(connectionAt, ...observedAt),
    detail: [connection.detail, sourceDetail].filter(Boolean).join(' · '),
    monitorError,
  };
}

module.exports = { mergeObservationHealth, ROLLOUT_HEALTHY, ROLLOUT_ERROR_PREFIX };
