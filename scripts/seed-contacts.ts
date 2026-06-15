/**
 * Seed 25 random contacts into a workspace.
 * Usage:
 *   ./apps/api/node_modules/.bin/tsx scripts/seed-contacts.ts
 *   ./apps/api/node_modules/.bin/tsx scripts/seed-contacts.ts <workspace-id>
 */
import { createDb } from '../packages/db/src/client';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../apps/api/.env');
  if (!process.env['DATABASE_URL'] && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const [k, ...rest] = line.split('=');
      if (k && rest.length && !process.env[k.trim()]) {
        process.env[k.trim()] = rest.join('=').trim();
      }
    }
  }
}

const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry',
  'Isla', 'James', 'Karen', 'Liam', 'Maya', 'Noah', 'Olivia', 'Peter',
  'Quinn', 'Rachel', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Moore', 'Young', 'Lee', 'Walker',
  'Hall', 'Allen', 'King', 'Wright',
];

const DOMAINS = [
  'acme.com', 'globex.com', 'initech.com', 'umbrella.corp', 'stark.io',
  'wayne.co', 'aperture.com', 'bluth.co', 'pied-piper.dev', 'dunder.biz',
];

const STATUSES = ['prospect', 'customer', 'cold', 'churned'] as const;
const PHONES = ['+1', '+44', '+91', '+61', '+49'];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randPhone(): string {
  const prefix = pick(PHONES);
  const num = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
  return `${prefix}${num}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  loadEnv();

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL not set.');
    process.exit(1);
  }

  const db = createDb(url);
  const targetWorkspaceId = process.argv[2] ?? null;

  const workspace = targetWorkspaceId
    ? await db.selectFrom('workspaces').selectAll().where('id', '=', targetWorkspaceId).executeTakeFirst()
    : await db.selectFrom('workspaces').selectAll().orderBy('created_at', 'asc').limit(1).executeTakeFirst();

  if (!workspace) {
    const all = await db.selectFrom('workspaces').select(['id', 'name']).execute();
    console.error('Workspace not found. Available:');
    for (const w of all) console.error(`  ${w.id}  ${w.name}`);
    process.exit(1);
  }

  const owner = await db
    .selectFrom('users')
    .selectAll()
    .where('workspace_id', '=', workspace.id)
    .orderBy('created_at', 'asc')
    .limit(1)
    .executeTakeFirst();

  if (!owner) {
    console.error('No user in workspace. Log in first.');
    process.exit(1);
  }

  console.log(`Seeding 25 contacts into "${workspace.name}" (${workspace.id})`);

  const rows = FIRST_NAMES.map((first, i) => {
    const last = LAST_NAMES[i]!;
    const name = `${first} ${last}`;
    const domain = pick(DOMAINS);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
    const status = pick(STATUSES);
    const hasPhone = Math.random() > 0.3;
    const hasLastContacted = Math.random() > 0.4;

    return {
      workspace_id: workspace.id,
      owner_id: owner.id,
      name,
      email,
      phone: hasPhone ? randPhone() : null,
      status,
      last_contacted_at: hasLastContacted ? daysAgo(Math.floor(Math.random() * 60)) : null,
      created_at: daysAgo(Math.floor(Math.random() * 180)),
      updated_at: new Date(),
    };
  });

  let inserted = 0;
  for (const row of rows) {
    try {
      await db.insertInto('contacts').values(row).execute();
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unique') || msg.includes('duplicate')) {
        console.warn(`  skip duplicate: ${row.email}`);
      } else {
        throw err;
      }
    }
  }

  console.log(`Inserted ${inserted}/25 (${25 - inserted} skipped — already exist).`);

  // Reconcile contact_count
  await db
    .updateTable('workspaces')
    .set((eb) => ({
      contact_count: eb
        .selectFrom('contacts')
        .select(eb.fn.countAll<number>().as('n'))
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null),
    }))
    .where('id', '=', workspace.id)
    .execute();

  console.log('Done. Refresh Contacts page.');
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
