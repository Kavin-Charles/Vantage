import * as net from 'net';

export interface DbCheck {
  type: string;
  port: number;
  ok: boolean;
  latency_ms: number;
}

const KNOWN_PORTS: Record<number, string> = {
  5432: 'postgres',
  3306: 'mysql',
  6379: 'redis',
  9000: 'clickhouse',
  27017: 'mongo',
};

function checkPort(port: number, timeoutMs = 3000): Promise<{ ok: boolean; latency_ms: number }> {
  return new Promise(resolve => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.connect(port, '127.0.0.1', () => {
      const latency_ms = Date.now() - start;
      socket.destroy();
      resolve({ ok: true, latency_ms });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ ok: false, latency_ms: Date.now() - start });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, latency_ms: timeoutMs });
    });
  });
}

export async function checkDatabases(): Promise<DbCheck[]> {
  const results: DbCheck[] = [];
  for (const [portStr, type] of Object.entries(KNOWN_PORTS)) {
    const port = parseInt(portStr, 10);
    const result = await checkPort(port);
    if (result.ok) {
      results.push({ type, port, ...result });
    }
  }
  return results;
}
