import { Router } from 'express';
import { z } from 'zod';
import { getServerIp } from '../lib/installer/docker-client';
import { createJob, getJob, runDeploy } from '../lib/installer/deploy-job';
import type { DeployPayload } from '../lib/installer/deploy-job';

const testDbSchema = z.object({
  host: z.string(),
  port: z.number(),
  name: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
});

const testSmtpSchema = z.object({
  smtp: z.object({
    host: z.string(),
    port: z.number(),
    user: z.string(),
    password: z.string(),
    from: z.string(),
    secure: z.boolean(),
  }),
  to: z.string().email(),
});

const checkDomainSchema = z.object({
  domain: z.string(),
  ssl: z.boolean().default(false),
});

export function createInstallerRouter(): Router {
  const router = Router();

  router.get('/server-ip', async (_req, res) => {
    const ip = await getServerIp();
    res.json({ data: { ip }, error: null });
  });

  router.post('/test-db', async (req, res) => {
    const parsed = testDbSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { host, port, name, user, password, ssl } = parsed.data;
    try {
      const { Client } = await import('pg');
      const client = new Client({
        host, port, database: name, user, password,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
      });
      await client.connect();
      await client.end();
      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      res.json({ data: null, error: { code: 'DB_CONNECT_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/test-smtp', async (req, res) => {
    const parsed = testSmtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { smtp, to } = parsed.data;
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
      });
      await transport.sendMail({
        from: smtp.from,
        to,
        subject: 'Vencore SMTP Test',
        text: 'This is a test email from your Vencore setup wizard.',
      });
      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      res.json({ data: null, error: { code: 'SMTP_FAILED', message: (err as Error).message } });
    }
  });

  router.post('/check-domain', async (req, res) => {
    const parsed = checkDomainSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const { domain, ssl } = parsed.data;
    let dnsOk = false;
    let sslOk = false;

    try {
      const { promises: dns } = await import('dns');
      const serverIp = await getServerIp();
      const records = await dns.resolve4(domain);
      dnsOk = records.includes(serverIp);
    } catch { /* DNS not resolved yet */ }

    if (ssl && dnsOk) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`https://${domain}`, { signal: controller.signal });
        sslOk = r.ok || r.status < 500;
      } catch { /* SSL not ready yet */ }
    }

    res.json({ data: { dns: dnsOk, ssl: sslOk }, error: null });
  });

  router.post('/deploy', async (req, res) => {
    const job = createJob();
    runDeploy(job, req.body as DeployPayload).catch(() => {});
    res.json({ data: { jobId: job.id }, error: null });
  });

  router.get('/deploy/:jobId/stream', (req, res) => {
    const job = getJob(req.params['jobId']);
    if (!job) {
      res.status(404).json({ data: null, error: { code: 'JOB_NOT_FOUND' } });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (line: string, type: 'log' | 'done' | 'error') => {
      res.write(`data: ${JSON.stringify({ type, line })}\n\n`);
    };

    job.logs.forEach(line => send(line, 'log'));

    if (job.status === 'done') { send('', 'done'); res.end(); return; }
    if (job.status === 'error') { send(job.logs.at(-1) ?? '', 'error'); res.end(); return; }

    job.subscribers.add(send);
    req.on('close', () => job.subscribers.delete(send));
  });

  return router;
}
