import * as http from 'http';

type DockerRequestOptions = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
};

function dockerRequest(opts: DockerRequestOptions): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const reqOpts: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      method: opts.method,
      path: opts.path,
      headers: {
        'Content-Type': 'application/json',
        'Host': 'localhost',
      },
    };

    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    if (bodyStr) {
      (reqOpts.headers as Record<string, string>)['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    const req = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function dockerPull(image: string, onLog: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const reqOpts: http.RequestOptions = {
      socketPath: '/var/run/docker.sock',
      method: 'POST',
      path: `/images/create?fromImage=${encodeURIComponent(image)}`,
      headers: { 'Host': 'localhost' },
    };

    const req = http.request(reqOpts, res => {
      let buf = '';
      res.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as { status?: string; progress?: string; error?: string };
            if (obj.error) { reject(new Error(obj.error)); return; }
            if (obj.status) onLog(`  ${obj.status}${obj.progress ? ` ${obj.progress}` : ''}`);
          } catch { /* partial JSON */ }
        }
      });
      res.on('end', resolve);
    });

    req.on('error', reject);
    req.end();
  });
}

export async function dockerComposeUp(composeFile: string, onLog: (line: string) => void): Promise<void> {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['compose', '-f', composeFile, 'up', '-d', '--remove-orphans'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(onLog));
    proc.stderr.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(onLog));

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose up exited with code ${code}`));
    });
  });
}

export async function getServerIp(): Promise<string> {
  try {
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      if (name === 'lo' || name.startsWith('docker') || name.startsWith('br-')) continue;
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch { /* fall through */ }
  return '127.0.0.1';
}
