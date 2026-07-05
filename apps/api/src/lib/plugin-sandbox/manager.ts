/**
 * Plugin sandbox manager.
 * Spawns one child process per (pluginId, workspaceId) pair.
 * All bridge calls route through IPC to the parent, which executes them with full auth context.
 */
import { fork, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginPermission, PluginManifest } from '@vencore/plugin-types';
import { dispatchBridgeCall, pluginEventBus } from '@vencore/plugin-runtime';
import { logger } from '../logger';

// Resolve runner script path — works for both tsx (dev) and compiled (prod)
function getRunnerPath(): string {
  // Production: compiled to dist/
  const distRunner = path.join(__dirname, 'runner.js');
  if (fs.existsSync(distRunner)) return distRunner;
  // Development: use source directly with tsx (must be in PATH or resolved via require)
  return path.join(__dirname, 'runner.ts');
}

function isUsingTsx(): boolean {
  return process.execArgv.some((a) => a.includes('tsx')) ||
    !fs.existsSync(path.join(__dirname, 'runner.js'));
}

interface SandboxEntry {
  child: ChildProcess;
  router: Router | null;
  pendingHttpRequests: Map<string, { resolve: (r: unknown) => void; reject: (e: unknown) => void }>;
  pluginId: string;
  workspaceId: string;
  busSubscriptions: Array<{ event: string; handler: (payload: unknown) => void | Promise<void> }>;
}

let httpRequestIdCounter = 0;
const sandboxes = new Map<string, SandboxEntry>();
const routerCache = new Map<string, Router>();

function sandboxKey(pluginId: string, workspaceId: string): string {
  return `${pluginId}:${workspaceId}`;
}

function unsubscribeBus(entry: SandboxEntry): void {
  const bus = pluginEventBus.forWorkspace(entry.workspaceId);
  for (const sub of entry.busSubscriptions) {
    bus.off(sub.event, sub.handler);
  }
  entry.busSubscriptions = [];
}

export function spawnPluginSandbox(
  pluginId: string,
  workspaceId: string,
  bundlePath: string,
  dataAccess: readonly PluginPermission[],
  tables: string[],
  db: Kysely<Database>,
  listens: readonly string[] = [],
  manifest?: PluginManifest,
): void {
  const key = sandboxKey(pluginId, workspaceId);

  // Kill existing sandbox for this plugin+workspace
  const existing = sandboxes.get(key);
  if (existing) {
    unsubscribeBus(existing);
    existing.child.kill('SIGTERM');
    sandboxes.delete(key);
    routerCache.delete(key);
  }

  const runnerPath = getRunnerPath();
  // Use tsx's unified registration (`--import tsx`) rather than the ESM-only
  // loader. On Node 23+ the ESM-only loader plus the runner's require() of the
  // CJS plugin bundle trips ERR_REQUIRE_CYCLE_MODULE; the unified hook installs
  // both CJS + ESM handling and avoids it. Prod (compiled runner.js) skips tsx.
  const execArgs: string[] = isUsingTsx()
    ? ['--import', 'tsx']
    : [];

  const child = fork(runnerPath, [], {
    execArgv: execArgs,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: {
      // Deliberately pass NO env vars to the sandbox — plugins have no env access
      NODE_ENV: process.env['NODE_ENV'] ?? 'production',
    },
  });

  const entry: SandboxEntry = {
    child,
    router: null,
    pendingHttpRequests: new Map(),
    pluginId,
    workspaceId,
    busSubscriptions: [],
  };
  sandboxes.set(key, entry);

  // Build router for HTTP endpoint calls (populated after setup_done)
  const router = Router({ mergeParams: true });

  child.on('message', async (msg: Record<string, unknown>) => {
    switch (msg['type']) {
      case 'ready': {
        // Send setup message once child signals ready
        child.send({
          type: 'setup',
          bundlePath,
          pluginId,
          workspaceId,
          dataAccess: [...dataAccess],
          tables,
        });
        break;
      }

      case 'setup_done': {
        entry.router = router;
        routerCache.set(key, router);

        // Subscribe declared listen topics on the workspace bus and forward
        // each event to the sandbox over IPC. Topics come from the manifest
        // (`listens` + `hooks` + hub change topics) — the parent cannot see
        // the child's internal bus.on registrations, so the manifest is the
        // source of truth for what reaches the sandbox.
        const bus = pluginEventBus.forWorkspace(workspaceId);
        for (const event of new Set(listens)) {
          const handler = (payload: unknown): void => {
            if (child.connected) {
              child.send({ type: 'bus_event', event, payload });
            }
          };
          bus.on(event, handler);
          entry.busSubscriptions.push({ event, handler });
        }

        logger.info({ pluginId, workspaceId, listens: [...new Set(listens)] }, 'Plugin sandbox setup complete');
        break;
      }

      case 'setup_error': {
        logger.warn({ pluginId, workspaceId, message: msg['message'] }, 'Plugin sandbox setup failed');
        unsubscribeBus(entry);
        child.kill('SIGTERM');
        sandboxes.delete(key);
        break;
      }

      case 'bridge_call': {
        const { id, method, payload } = msg as { id: string; method: string; payload: unknown };
        try {
          const result = await dispatchBridgeCall(
            db as Kysely<any>,
            { workspaceId, pluginSlug: pluginId, dataAccess, tables, manifest },
            { method, payload: payload as any },
          );
          child.send({ type: 'bridge_response', id, result });
        } catch (err) {
          const errResult = {
            data: null,
            error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) },
          };
          child.send({ type: 'bridge_response', id, result: errResult });
        }
        break;
      }

      case 'http_handler_registered': {
        const endpointPath = msg['path'] as string;
        router.all(endpointPath, async (req, res) => {
          const reqId = String(++httpRequestIdCounter);
          const pluginReq = {
            method: req.method,
            path: req.path,
            query: req.query as Record<string, string>,
            headers: req.headers as Record<string, string>,
            body: req.body != null ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
            params: req.params as Record<string, string>,
          };

          try {
            const result = await new Promise<any>((resolve, reject) => {
              entry.pendingHttpRequests.set(reqId, { resolve, reject });
              child.send({ type: 'http_request', id: reqId, req: pluginReq });
              setTimeout(() => {
                if (entry.pendingHttpRequests.has(reqId)) {
                  entry.pendingHttpRequests.delete(reqId);
                  reject({ code: 'TIMEOUT', message: 'Plugin HTTP handler timed out' });
                }
              }, 30_000);
            });

            const status = result?.status ?? 200;
            const headers = result?.headers ?? {};
            for (const [k, v] of Object.entries(headers)) res.setHeader(k, v as string);
            res.status(status);
            if (typeof result?.body === 'string') res.send(result.body);
            else if (result?.body != null) res.json(result.body);
            else res.end();
          } catch (err) {
            logger.error({ err, pluginId, workspaceId }, 'Plugin HTTP endpoint error');
            res.status(500).json({ data: null, error: { code: 'PLUGIN_ERROR', message: 'Internal plugin error' } });
          }
        });
        break;
      }

      case 'http_response': {
        const { id, res: pluginRes } = msg as { id: string; res: unknown };
        const pending = entry.pendingHttpRequests.get(id);
        if (pending) {
          entry.pendingHttpRequests.delete(id);
          pending.resolve(pluginRes);
        }
        break;
      }

      case 'log': {
        const level = msg['level'] as 'info' | 'warn' | 'error';
        logger[level]({ pluginId, workspaceId, sandboxLog: msg['data'] }, 'Plugin sandbox log');
        break;
      }

      default:
        break;
    }
  });

  child.on('error', (err) => {
    logger.error({ err, pluginId, workspaceId }, 'Plugin sandbox process error');
  });

  child.on('exit', (code, signal) => {
    logger.warn({ pluginId, workspaceId, code, signal }, 'Plugin sandbox process exited');
    unsubscribeBus(entry);
    sandboxes.delete(key);
    routerCache.delete(key);
    // Auto-restart on crash (but not on deliberate kill)
    if (signal !== 'SIGTERM' && code !== 0) {
      logger.info({ pluginId, workspaceId }, 'Restarting plugin sandbox after crash');
      setTimeout(() => {
        if (fs.existsSync(bundlePath)) {
          spawnPluginSandbox(pluginId, workspaceId, bundlePath, dataAccess, tables, db, listens, manifest);
        }
      }, 5_000);
    }
  });

  // Pipe child stderr to parent logger
  child.stderr?.on('data', (chunk: Buffer) => {
    logger.warn({ pluginId, workspaceId }, `Plugin stderr: ${chunk.toString().trim()}`);
  });
}

export function getSandboxRouter(pluginId: string, workspaceId: string): Router | null {
  return routerCache.get(sandboxKey(pluginId, workspaceId)) ?? null;
}

/**
 * Sends a bus-style event directly to one sandbox (used by the plugin cron
 * worker to fire `cron:<name>` handlers registered inside the child).
 * Returns false when the sandbox is not running.
 */
export function sendBusEventToSandbox(
  pluginId: string,
  workspaceId: string,
  event: string,
  payload: unknown,
): boolean {
  const entry = sandboxes.get(sandboxKey(pluginId, workspaceId));
  if (!entry || !entry.child.connected) return false;
  entry.child.send({ type: 'bus_event', event, payload });
  return true;
}

export function isSandboxRunning(pluginId: string, workspaceId: string): boolean {
  const entry = sandboxes.get(sandboxKey(pluginId, workspaceId));
  return Boolean(entry?.child.connected);
}

export function killSandbox(pluginId: string, workspaceId: string): void {
  const key = sandboxKey(pluginId, workspaceId);
  const entry = sandboxes.get(key);
  if (entry) {
    unsubscribeBus(entry);
    entry.child.kill('SIGTERM');
    sandboxes.delete(key);
    routerCache.delete(key);
  }
}

export function killAllSandboxes(): void {
  for (const [, entry] of sandboxes) {
    unsubscribeBus(entry);
    entry.child.kill('SIGTERM');
  }
  sandboxes.clear();
  routerCache.clear();
}
