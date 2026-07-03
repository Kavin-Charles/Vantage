import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isValidVersion, rewriteEnvVersion } from './lib';

const PORT = 9500;
const INSTALL_DIR = process.env['VENCORE_COMPOSE_DIR'] ?? '/vencore';
const SECRET = process.env['UPDATER_SECRET'];
// Host-side path of the install dir; needed so the self-update helper
// container can bind-mount it. Written to .env by the installer.
const HOST_INSTALL_DIR = process.env['VENCORE_INSTALL_DIR'];

type State = 'idle' | 'pulling' | 'recreating' | 'error';

let state: State = 'idle';
let targetVersion: string | null = null;
let startedAt: string | null = null;
const log: string[] = [];

function pushLog(chunk: string): void {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) log.push(trimmed);
  }
  while (log.length > 50) log.shift();
}

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    pushLog(`$ ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      cwd: INSTALL_DIR,
      env: { ...process.env, ...extraEnv },
    });
    child.stdout.on('data', d => pushLog(String(d)));
    child.stderr.on('data', d => pushLog(String(d)));
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} exited with code ${code}`)),
    );
  });
}

async function runUpdate(version: string): Promise<void> {
  try {
    state = 'pulling';
    targetVersion = version;
    startedAt = new Date().toISOString();

    // Pull before switch — a failed pull leaves the running stack untouched.
    // VENCORE_VERSION in the process env overrides the .env value for compose.
    await run('docker', ['compose', 'pull', 'web', 'api', 'worker'], { VENCORE_VERSION: version });

    const envPath = join(INSTALL_DIR, '.env');
    writeFileSync(envPath, rewriteEnvVersion(readFileSync(envPath, 'utf8'), version));

    state = 'recreating';
    await run('docker', ['compose', 'up', '-d', 'web', 'api', 'worker']);

    if (HOST_INSTALL_DIR) {
      // Recreating this container from within kills the compose process
      // mid-flight, so a detached helper container does it instead.
      await run('docker', [
        'run', '-d', '--rm',
        '-v', '/var/run/docker.sock:/var/run/docker.sock',
        '-v', `${HOST_INSTALL_DIR}:/vencore`,
        '-w', '/vencore',
        'docker:cli',
        'docker', 'compose', 'up', '-d', 'updater',
      ]);
    } else {
      pushLog('VENCORE_INSTALL_DIR not set — skipping updater self-update');
    }

    state = 'idle';
    pushLog(`update to ${version} complete`);
  } catch (err) {
    state = 'error';
    pushLog(err instanceof Error ? err.message : String(err));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += String(c); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  void (async () => {
    if (!SECRET || req.headers['x-updater-secret'] !== SECRET) {
      return send(res, 401, { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid updater secret' } });
    }

    if (req.method === 'GET' && req.url === '/status') {
      return send(res, 200, { data: { state, targetVersion, startedAt, log }, error: null });
    }

    if (req.method === 'POST' && req.url === '/update') {
      if (state === 'pulling' || state === 'recreating') {
        return send(res, 409, { data: null, error: { code: 'UPDATE_IN_PROGRESS', message: 'An update is already running' } });
      }
      let version: unknown;
      try {
        version = (JSON.parse(await readBody(req)) as { version?: unknown }).version;
      } catch {
        return send(res, 400, { data: null, error: { code: 'INVALID_INPUT', message: 'Body must be JSON' } });
      }
      if (typeof version !== 'string' || !isValidVersion(version)) {
        return send(res, 400, { data: null, error: { code: 'INVALID_INPUT', message: 'version must be x.y.z' } });
      }
      void runUpdate(version);
      return send(res, 202, { data: { started: true, targetVersion: version }, error: null });
    }

    return send(res, 404, { data: null, error: { code: 'NOT_FOUND', message: 'Not found' } });
  })().catch(() => {
    send(res, 500, { data: null, error: { code: 'INTERNAL', message: 'Internal error' } });
  });
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'updater listening', port: PORT }));
});
