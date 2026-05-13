/**
 * Demo seed — populates every feature with realistic-looking data.
 * Run once: DEMO_SEED=true pnpm dev  (or set in .env)
 * Safe to re-run — checks for existing demo data before inserting.
 */

import { createHash, randomBytes } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from './logger';

function sha256(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function secondsAgo(s: number) {
  return new Date(Date.now() - s * 1000).toISOString();
}

export async function seedDemo(db: Kysely<Database>): Promise<void> {
  // Guard — skip if demo data already exists
  const existingContact = await db
    .selectFrom('contacts')
    .select(['id'])
    .limit(1)
    .executeTakeFirst();
  if (existingContact) {
    logger.info('[Demo] Data already present — skipping demo seed');
    return;
  }

  const workspace = await db
    .selectFrom('workspaces')
    .select(['id'])
    .executeTakeFirstOrThrow();
  const wid = workspace.id;

  const admin = await db
    .selectFrom('users')
    .where('workspace_id', '=', wid)
    .select(['id'])
    .executeTakeFirstOrThrow();
  const adminId = admin.id;

  logger.info('[Demo] Seeding demo data…');

  // ── Companies ─────────────────────────────────────────────────────────────

  const companies = await db
    .insertInto('companies')
    .values([
      { workspace_id: wid, name: 'Meridian Labs',    industry: 'SaaS',           location: 'San Francisco, CA', employee_count: 42,   website: 'https://meridianlabs.io' },
      { workspace_id: wid, name: 'Stackline Inc.',   industry: 'DevTools',       location: 'Austin, TX',        employee_count: 18,   website: 'https://stackline.dev' },
      { workspace_id: wid, name: 'Cobalt Systems',   industry: 'Cybersecurity',  location: 'New York, NY',      employee_count: 130,  website: 'https://cobaltsystems.com' },
      { workspace_id: wid, name: 'Fenix Analytics',  industry: 'Data & AI',      location: 'London, UK',        employee_count: 67,   website: 'https://fenixanalytics.ai' },
      { workspace_id: wid, name: 'Orbit Cloud',      industry: 'Cloud Infra',    location: 'Seattle, WA',       employee_count: 210,  website: 'https://orbitcloud.io' },
      { workspace_id: wid, name: 'Parchment Media',  industry: 'Media & Content', location: 'Los Angeles, CA',  employee_count: 55,   website: 'https://parchmentmedia.com' },
    ])
    .returningAll()
    .execute();

  const [meridian, stackline, cobalt, fenix, orbit, parchment] = companies as Required<typeof companies>;

  // ── Contacts ──────────────────────────────────────────────────────────────

  const contacts = await db
    .insertInto('contacts')
    .values([
      { workspace_id: wid, owner_id: adminId, company_id: meridian.id,  name: 'Priya Nair',       email: 'priya@meridianlabs.io',    phone: '+1 415 555 0182', status: 'customer',  last_contacted_at: daysAgo(2) },
      { workspace_id: wid, owner_id: adminId, company_id: meridian.id,  name: 'Tom Weston',       email: 'tom.w@meridianlabs.io',    phone: '+1 415 555 0193', status: 'customer',  last_contacted_at: daysAgo(5) },
      { workspace_id: wid, owner_id: adminId, company_id: stackline.id, name: 'Amir Hosseini',    email: 'amir@stackline.dev',       phone: '+1 512 555 0247', status: 'prospect',  last_contacted_at: daysAgo(1) },
      { workspace_id: wid, owner_id: adminId, company_id: stackline.id, name: 'Clara Ruiz',       email: 'clara@stackline.dev',      phone: null,              status: 'prospect',  last_contacted_at: daysAgo(7) },
      { workspace_id: wid, owner_id: adminId, company_id: cobalt.id,    name: 'James Okafor',     email: 'j.okafor@cobaltsystems.com', phone: '+1 212 555 0318', status: 'customer', last_contacted_at: daysAgo(3) },
      { workspace_id: wid, owner_id: adminId, company_id: fenix.id,     name: 'Sophie Müller',    email: 'sophie@fenixanalytics.ai', phone: '+44 20 5555 0142', status: 'prospect', last_contacted_at: daysAgo(10) },
      { workspace_id: wid, owner_id: adminId, company_id: fenix.id,     name: 'Luca Ferretti',    email: 'luca@fenixanalytics.ai',   phone: null,              status: 'cold',     last_contacted_at: daysAgo(30) },
      { workspace_id: wid, owner_id: adminId, company_id: orbit.id,     name: 'Rachel Kim',       email: 'rachel.kim@orbitcloud.io', phone: '+1 206 555 0471', status: 'customer', last_contacted_at: daysAgo(1) },
      { workspace_id: wid, owner_id: adminId, company_id: orbit.id,     name: 'David Chen',       email: 'd.chen@orbitcloud.io',     phone: '+1 206 555 0482', status: 'customer', last_contacted_at: daysAgo(4) },
      { workspace_id: wid, owner_id: adminId, company_id: parchment.id, name: 'Mia Santos',       email: 'mia@parchmentmedia.com',   phone: '+1 323 555 0529', status: 'churned',  last_contacted_at: daysAgo(60) },
      { workspace_id: wid, owner_id: adminId, company_id: null,         name: 'Ben Hartley',      email: 'ben.hartley@gmail.com',    phone: '+1 720 555 0613', status: 'prospect', last_contacted_at: daysAgo(3) },
      { workspace_id: wid, owner_id: adminId, company_id: cobalt.id,    name: 'Nina Petrov',      email: 'n.petrov@cobaltsystems.com', phone: '+1 212 555 0374', status: 'customer', last_contacted_at: daysAgo(6) },
    ])
    .returningAll()
    .execute();

  const [priya, , amir, , james, sophie, , rachel, , , ben, nina] = contacts as Required<typeof contacts>;

  // ── Pipeline stages ───────────────────────────────────────────────────────

  const pipeline = await db
    .selectFrom('pipelines')
    .where('workspace_id', '=', wid)
    .select(['id'])
    .executeTakeFirstOrThrow();

  const stages = await db
    .selectFrom('pipeline_stages')
    .where('pipeline_id', '=', pipeline.id)
    .select(['id', 'name', 'is_won', 'is_lost'])
    .orderBy('position', 'asc')
    .execute();

  const stageMap = Object.fromEntries(stages.map(s => [s.name, s.id]));
  const leadId      = stageMap['Lead']!;
  const qualifyId   = stageMap['Qualifying']!;
  const proposalId  = stageMap['Proposal']!;
  const closingId   = stageMap['Closing']!;
  const wonId       = stageMap['Won']!;
  const lostId      = stageMap['Lost']!;

  // ── Deals ─────────────────────────────────────────────────────────────────

  await db
    .insertInto('deals')
    .values([
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: leadId,     owner_id: adminId, contact_id: amir.id,   company_id: stackline.id, name: 'Stackline — Developer Plan',    value: 4800,   probability: 20, close_date: daysFromNow(45) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: leadId,     owner_id: adminId, contact_id: ben.id,    company_id: null,         name: 'Ben Hartley — Indie License',   value: 990,    probability: 30, close_date: daysFromNow(30) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: qualifyId,  owner_id: adminId, contact_id: sophie.id, company_id: fenix.id,     name: 'Fenix Analytics — Team Plan',   value: 18000,  probability: 40, close_date: daysFromNow(21) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: qualifyId,  owner_id: adminId, contact_id: james.id,  company_id: cobalt.id,    name: 'Cobalt Systems — Enterprise',   value: 55000,  probability: 45, close_date: daysFromNow(60) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: proposalId, owner_id: adminId, contact_id: nina.id,   company_id: cobalt.id,    name: 'Cobalt — Infra Monitoring Add-on', value: 12000, probability: 65, close_date: daysFromNow(14) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: closingId,  owner_id: adminId, contact_id: rachel.id, company_id: orbit.id,     name: 'Orbit Cloud — Platform License', value: 36000, probability: 85, close_date: daysFromNow(7) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: wonId,      owner_id: adminId, contact_id: priya.id,  company_id: meridian.id,  name: 'Meridian Labs — Annual Plan',   value: 24000,  probability: 100, close_date: daysAgo(10) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: wonId,      owner_id: adminId, contact_id: james.id,  company_id: cobalt.id,    name: 'Cobalt Systems — Starter',      value: 9600,   probability: 100, close_date: daysAgo(25) },
      { workspace_id: wid, pipeline_id: pipeline.id, stage_id: lostId,     owner_id: adminId, contact_id: sophie.id, company_id: fenix.id,     name: 'Fenix — Q1 Outreach',           value: 8400,   probability: 0,  close_date: daysAgo(15) },
    ])
    .execute();

  // ── Tasks ─────────────────────────────────────────────────────────────────

  await db
    .insertInto('tasks')
    .values([
      { workspace_id: wid, assignee_id: adminId, contact_id: rachel.id, title: 'Send Orbit Cloud contract for review',     due_date: daysFromNow(2),  status: 'todo' },
      { workspace_id: wid, assignee_id: adminId, contact_id: sophie.id, title: 'Follow up on Fenix Analytics proposal',    due_date: daysFromNow(3),  status: 'todo' },
      { workspace_id: wid, assignee_id: adminId, contact_id: james.id,  title: 'Schedule enterprise demo with Cobalt',     due_date: daysFromNow(5),  status: 'todo' },
      { workspace_id: wid, assignee_id: adminId, contact_id: amir.id,   title: 'Send Stackline onboarding docs',           due_date: daysFromNow(1),  status: 'todo' },
      { workspace_id: wid, assignee_id: adminId, contact_id: priya.id,  title: 'Quarterly check-in call with Meridian',    due_date: daysFromNow(14), status: 'todo' },
      { workspace_id: wid, assignee_id: adminId, contact_id: priya.id,  title: 'Set up Meridian workspace',                due_date: daysAgo(12),     status: 'done' },
      { workspace_id: wid, assignee_id: adminId, contact_id: james.id,  title: 'Send Cobalt Starter agreement',            due_date: daysAgo(28),     status: 'done' },
      { workspace_id: wid, assignee_id: adminId, contact_id: ben.id,    title: 'Reply to Ben Hartley interest email',      due_date: daysAgo(2),      status: 'done' },
    ])
    .execute();

  // ── Activity ──────────────────────────────────────────────────────────────

  await db
    .insertInto('activities')
    .values([
      { workspace_id: wid, user_id: adminId, contact_id: rachel.id, type: 'call',     body: 'Discussed pricing options and support SLA. Rachel is ready to move forward pending legal review.' },
      { workspace_id: wid, user_id: adminId, contact_id: sophie.id, type: 'email',    body: 'Sent over the Team Plan proposal PDF. Requested a follow-up call for Thursday.' },
      { workspace_id: wid, user_id: adminId, contact_id: james.id,  type: 'meeting',  body: 'Intro call with Cobalt security team. They want infra monitoring + CRM bundled. Good fit for enterprise tier.' },
      { workspace_id: wid, user_id: adminId, contact_id: priya.id,  type: 'note',     body: 'Meridian fully onboarded. Using pipeline + server monitoring. Very happy so far — potential expansion to 3 more seats.' },
      { workspace_id: wid, user_id: adminId, contact_id: amir.id,   type: 'email',    body: 'Amir signed up for the trial. Walked him through the monitoring agent setup over chat.' },
      { workspace_id: wid, user_id: adminId, contact_id: nina.id,   type: 'call',     body: 'Quick call to clarify the infra monitoring scope. Nina confirmed 4 servers and 2 databases.' },
      { workspace_id: wid, user_id: adminId, contact_id: ben.id,    type: 'note',     body: 'Replied to inbound enquiry. Indie developer looking for a lightweight CRM. Sent trial link.' },
      { workspace_id: wid, user_id: adminId, contact_id: rachel.id, type: 'email',    body: 'Sent Orbit Cloud the final contract. Expecting signature by end of week.' },
    ])
    .execute();

  // ── Servers ───────────────────────────────────────────────────────────────

  const now = new Date().toISOString();
  const degradedAt = secondsAgo(150);   // 2.5 min ago → degraded

  await db
    .insertInto('servers')
    .values([
      {
        workspace_id: wid,
        name: 'prod-web-01',
        region: 'us-east-1',
        ip_address: '54.211.18.92',
        agent_token_hash: sha256(randomBytes(32).toString('hex')),
        cpu_pct: 34.2,
        mem_pct: 61.8,
        disk_pct: 47.3,
        uptime_seconds: 1_382_400,   // 16 days
        load_avg_1m: 1.24,
        net_in_bytes: 48_234_122,
        net_out_bytes: 29_812_744,
        status: 'online',
        last_ping_at: now,
      },
      {
        workspace_id: wid,
        name: 'prod-api-01',
        region: 'us-east-1',
        ip_address: '54.211.19.14',
        agent_token_hash: sha256(randomBytes(32).toString('hex')),
        cpu_pct: 71.5,
        mem_pct: 83.2,
        disk_pct: 58.9,
        uptime_seconds: 864_000,   // 10 days
        load_avg_1m: 3.87,
        net_in_bytes: 192_834_512,
        net_out_bytes: 87_234_901,
        status: 'online',
        last_ping_at: now,
      },
      {
        workspace_id: wid,
        name: 'staging-01',
        region: 'eu-west-1',
        ip_address: '52.18.34.77',
        agent_token_hash: sha256(randomBytes(32).toString('hex')),
        cpu_pct: 12.1,
        mem_pct: 38.4,
        disk_pct: 21.0,
        uptime_seconds: 259_200,   // 3 days
        load_avg_1m: 0.41,
        net_in_bytes: 8_192_344,
        net_out_bytes: 4_102_881,
        status: 'online',
        last_ping_at: now,
      },
      {
        workspace_id: wid,
        name: 'prod-worker-01',
        region: 'us-east-1',
        ip_address: '54.211.20.3',
        agent_token_hash: sha256(randomBytes(32).toString('hex')),
        cpu_pct: 88.3,
        mem_pct: 91.7,
        disk_pct: 72.1,
        uptime_seconds: 432_000,
        load_avg_1m: 5.12,
        net_in_bytes: 22_103_884,
        net_out_bytes: 11_201_990,
        status: 'degraded',
        last_ping_at: degradedAt,
      },
    ])
    .execute();

  // ── Infra databases ───────────────────────────────────────────────────────

  await db
    .insertInto('infra_databases')
    .values([
      {
        workspace_id: wid,
        name: 'prod-postgres',
        engine: 'postgres',
        version: '15.4',
        host: 'db.internal.acme.com',
        port: 5432,
        db_user: 'vantage_ro',
        db_password: null,
        database_name: 'production',
        use_ssl: true,
        storage_gb: 48.3,
        connection_count: 34,
        replication_lag_s: 0.12,
        status: 'healthy',
        last_checked_at: now,
      },
      {
        workspace_id: wid,
        name: 'prod-redis',
        engine: 'redis',
        version: '7.2.3',
        host: 'cache.internal.acme.com',
        port: 6379,
        db_user: null,
        db_password: null,
        database_name: null,
        use_ssl: false,
        storage_gb: 2.1,
        connection_count: 18,
        connected_clients: 18,
        memory_used_mb: 412,
        status: 'healthy',
        last_checked_at: now,
      },
      {
        workspace_id: wid,
        name: 'analytics-clickhouse',
        engine: 'clickhouse',
        version: '24.1',
        host: 'analytics.internal.acme.com',
        port: 9000,
        db_user: 'readonly',
        db_password: null,
        database_name: 'events',
        use_ssl: true,
        storage_gb: 312.7,
        connection_count: 8,
        status: 'degraded',
        last_checked_at: secondsAgo(70),
      },
    ])
    .execute();

  // ── Websites ──────────────────────────────────────────────────────────────

  await db
    .insertInto('websites')
    .values([
      {
        workspace_id: wid,
        url: 'https://acme.com',
        label: 'Marketing Site',
        host: 'acme.com',
        response_ms: 187,
        uptime_pct_30d: 99.97,
        ssl_expiry_date: daysFromNow(82).toISOString().split('T')[0],
        status: 'online',
        last_checked_at: now,
      },
      {
        workspace_id: wid,
        url: 'https://app.acme.com',
        label: 'Dashboard',
        host: 'app.acme.com',
        response_ms: 243,
        uptime_pct_30d: 99.91,
        ssl_expiry_date: daysFromNow(82).toISOString().split('T')[0],
        status: 'online',
        last_checked_at: now,
      },
      {
        workspace_id: wid,
        url: 'https://api.acme.com',
        label: 'API',
        host: 'api.acme.com',
        response_ms: 94,
        uptime_pct_30d: 99.99,
        ssl_expiry_date: daysFromNow(82).toISOString().split('T')[0],
        status: 'online',
        last_checked_at: now,
      },
      {
        workspace_id: wid,
        url: 'https://status.acme.com',
        label: 'Status Page',
        host: 'status.acme.com',
        response_ms: 1840,
        uptime_pct_30d: 97.3,
        ssl_expiry_date: daysFromNow(12).toISOString().split('T')[0],
        status: 'degraded',
        last_checked_at: now,
      },
    ])
    .execute();

  // ── Alerts ────────────────────────────────────────────────────────────────

  await db
    .insertInto('alerts')
    .values([
      {
        workspace_id: wid,
        resource_type: 'server',
        severity: 'critical',
        message: 'prod-worker-01: Memory usage at 91.7% — above critical threshold (90%)',
        acknowledged: false,
        resolved: false,
      },
      {
        workspace_id: wid,
        resource_type: 'server',
        severity: 'warning',
        message: 'prod-api-01: CPU usage at 71.5% for 2 consecutive checks',
        acknowledged: false,
        resolved: false,
      },
      {
        workspace_id: wid,
        resource_type: 'database',
        severity: 'warning',
        message: 'analytics-clickhouse: Health check failed — connection timeout',
        acknowledged: false,
        resolved: false,
      },
      {
        workspace_id: wid,
        resource_type: 'website',
        severity: 'warning',
        message: 'status.acme.com: Response time 1840ms — above threshold (1500ms)',
        acknowledged: true,
        resolved: false,
      },
    ])
    .execute();

  logger.info('[Demo] Demo seed complete ✓');
}
