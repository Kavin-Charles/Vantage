// apps/api/src/lib/ssh-exec.ts
import { Client, type ConnectConfig } from 'ssh2';
import type { Response } from 'express';
import type { SshStreamEvent } from '@vantage/types';

export interface SshSessionConfig {
  host: string;
  username: string;
  privateKey: string; // PEM string, decrypted
}

/** Write a typed SSE event to the response. Call res.end() separately when done. */
export function sseWrite(res: Response, event: SshStreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Set SSE headers on the response. Must be called before any sseWrite. */
export function sseStart(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

/**
 * Opens an SSH connection, runs the callback with the connected Client,
 * then ensures the connection is closed. The callback is responsible for
 * running commands and ending the session.
 *
 * Rejects after 30s if connection is not established.
 */
export function withSshSession(
  config: SshSessionConfig,
  callback: (conn: Client) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectTimeout = setTimeout(() => {
      conn.destroy();
      reject(new Error('SSH connection timeout (30s)'));
    }, 30_000);

    conn.on('ready', async () => {
      clearTimeout(connectTimeout);
      try {
        await callback(conn);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        conn.end();
      }
    });

    conn.on('error', (err) => {
      clearTimeout(connectTimeout);
      reject(err);
    });

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: 22,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: 30_000,
    };

    conn.connect(connectConfig);
  });
}

/**
 * Run a command on an open SSH connection and stream output via SSE.
 * Resolves with the exit code when the command finishes.
 */
export function runCommand(
  conn: Client,
  res: Response,
  command: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let done = false;

    const sessionTimeout = setTimeout(() => {
      if (!done) {
        done = true;
        sseWrite(res, { type: 'error', message: 'Session timeout (5 minutes)' });
        resolve(1);
      }
    }, 5 * 60_000);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(sessionTimeout);
        reject(err);
        return;
      }

      stream.stdout.on('data', (chunk: Buffer) => {
        if (done) return;
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line) sseWrite(res, { type: 'stdout', line });
        }
      });

      stream.stderr.on('data', (chunk: Buffer) => {
        if (done) return;
        for (const line of chunk.toString('utf8').split('\n')) {
          if (line) sseWrite(res, { type: 'stderr', line });
        }
      });

      stream.on('close', (code: number) => {
        if (done) return;
        done = true;
        clearTimeout(sessionTimeout);
        resolve(code ?? 0);
      });

      stream.on('error', (err: Error) => {
        if (done) return;
        done = true;
        clearTimeout(sessionTimeout);
        reject(err);
      });
    });
  });
}
