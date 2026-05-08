import * as os from 'os';
import * as fs from 'fs';

export interface Metrics {
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  uptime_seconds: number;
  load_avg_1m: number;
  net_in_bytes: number;
  net_out_bytes: number;
}

function getCpuSample() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { user, nice, sys, idle, irq, total: user + nice + sys + idle + irq };
}

let prevCpuSample = getCpuSample();

function getCpuPct(): number {
  const curr = getCpuSample();
  const idleDiff = curr.idle - prevCpuSample.idle;
  const totalDiff = curr.total - prevCpuSample.total;
  prevCpuSample = curr;
  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 100 * 10) / 10;
}

let prevNetIn = 0;
let prevNetOut = 0;

function getNetIO(): { net_in_bytes: number; net_out_bytes: number } {
  try {
    if (process.platform !== 'linux') return { net_in_bytes: 0, net_out_bytes: 0 };
    const raw = fs.readFileSync('/proc/net/dev', 'utf8');
    let totalIn = 0;
    let totalOut = 0;
    for (const line of raw.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10 || (parts[0] ?? '').startsWith('lo')) continue;
      totalIn += parseInt(parts[1] ?? '0', 10) || 0;
      totalOut += parseInt(parts[9] ?? '0', 10) || 0;
    }
    const deltaIn = Math.max(0, totalIn - prevNetIn);
    const deltaOut = Math.max(0, totalOut - prevNetOut);
    prevNetIn = totalIn;
    prevNetOut = totalOut;
    return { net_in_bytes: deltaIn, net_out_bytes: deltaOut };
  } catch {
    return { net_in_bytes: 0, net_out_bytes: 0 };
  }
}

export function collectMetrics(): Metrics {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const loadAvg = os.loadavg();
  const net = getNetIO();

  let disk_pct = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('child_process') as typeof import('child_process');
    const dfOut = execSync('df / --output=pcent 2>/dev/null | tail -1', { encoding: 'utf8' });
    disk_pct = parseInt(dfOut.trim().replace('%', ''), 10) || 0;
  } catch { /* ignore on non-Linux */ }

  return {
    cpu_pct: getCpuPct(),
    mem_pct: Math.round((usedMem / totalMem) * 100 * 10) / 10,
    disk_pct,
    uptime_seconds: Math.floor(os.uptime()),
    load_avg_1m: Math.round((loadAvg[0] ?? 0) * 100) / 100,
    ...net,
  };
}
