'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

async function withNativeLock(spec, operation, options = {}) {
  if (process.platform !== 'darwin') throw new Error('KiroCrew observation configuration currently requires the macOS native lock helper');
  if (!spec || typeof operation !== 'function' || !['gateway','directory','store'].every(key => typeof spec[key] === 'string' && path.isAbsolute(spec[key]) && !/[\u0000-\u001f]/.test(spec[key]))) throw new Error('Invalid native lock specification');
  const helper = options.helper || path.join(__dirname, '../assets/helpers/mini-office-flock');
  // Executables in ASAR cannot be passed to spawn. The build explicitly unpacks
  // this one owned helper; paths outside ASAR remain unchanged in development.
  const executable = helper.replace(/\.asar([/\\])/, '.asar.unpacked$1');
  fs.accessSync(executable, fs.constants.X_OK);
  const child = spawn(executable, [spec.gateway, spec.directory, spec.store], {stdio:['pipe','pipe','ignore']});
  let exited = false, settled = false, output = '';
  let readyResolve, readyReject;
  const ready = new Promise((resolve,reject) => { readyResolve=resolve; readyReject=reject; });
  const closed = new Promise(resolve => child.once('close', (code) => {
    exited=true;
    if (!settled) { settled=true; readyReject(new Error(code === 75 ? 'KiroCrew 正在使用配置；请结束网关后重试' : 'KiroCrew 原生配置锁无法取得，未改动')); }
    resolve();
  }));
  child.once('error', error => { if(!settled){settled=true;readyReject(error);} });
  child.stdin.on('error', () => {});
  child.stdout.on('data', data => {
    output += data.toString('utf8');
    if (output === 'READY\n' && !settled) { settled=true; readyResolve(); }
    else if (output.length > 32 && !settled) { settled=true; readyReject(new Error('Native lock handshake is invalid')); child.stdin.end(); }
  });
  const timer=setTimeout(() => { if(!settled){settled=true;readyReject(new Error('KiroCrew 原生配置锁超时，未改动'));child.stdin.end();} }, 3000);
  try {
    await ready;
    if(exited) throw new Error('KiroCrew 原生配置锁已释放，未改动');
    const result=await operation();
    if(exited) throw new Error('KiroCrew 原生配置锁意外释放，请重新检查配置');
    return result;
  } finally {
    clearTimeout(timer);
    child.stdin.end();
    await closed;
  }
}
module.exports={withNativeLock};
