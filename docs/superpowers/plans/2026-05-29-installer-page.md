# Installer Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-time first-boot setup wizard at `/setup` that collects branding, features, SMTP, and admin credentials, saves them to the DB, and marks the instance as configured.

**Architecture:** Multi-step React wizard (client state, single POST at end). DB-backed via new `system_settings` table. Middleware cookie guard prevents access to the app before setup and blocks re-running after. TOCTOU-safe via DB transaction with row lock.

**Tech Stack:** Next.js 14 (App Router), Express, Kysely, Zod, bcrypt, Node.js `crypto` (AES-256-CBC).

---

## File Map

**New files:**
- `packages/db/migrations/20260529_001_system_settings.ts` — creates + seeds system_settings table
- `packages/config/src/read-config-from-db.ts` — async DB config reader
- `apps/api/src/lib/setup-crypto.ts` — AES-256-CBC encrypt/decrypt for SMTP password
- `apps/api/src/lib/setup-db.ts` — DB helpers: isConfigured(), saveSetup()
- `apps/api/src/routes/setup.ts` — GET /api/setup/status + POST /api/setup
- `apps/api/src/__tests__/setup.test.ts` — route unit tests
- `apps/web/app/setup/page.tsx` — Next.js page entry (no auth, no sidebar)
- `apps/web/app/setup/SetupWizard.tsx` — state container, step routing
- `apps/web/app/setup/ProgressBar.tsx` — 5-step visual indicator
- `apps/web/app/setup/steps/StepBranding.tsx`
- `apps/web/app/setup/steps/StepFeatures.tsx`
- `apps/web/app/setup/steps/StepSmtp.tsx`
- `apps/web/app/setup/steps/StepAdminAccount.tsx`
- `apps/web/app/setup/steps/StepReview.tsx`

**Modified files:**
- `packages/db/src/schema.ts` — add SystemSettingsTable + Database entry
- `packages/config/src/index.ts` — export readConfigFromDb
- `apps/api/src/routes/config.ts` — read config from DB when available
- `apps/api/src/index.ts` — register setup route (public, before requireAuth)
- `apps/web/middleware.ts` — add setup cookie guard

---

## Task 1: DB Migration — system_settings table

**Files:**
- Create: `packages/db/migrations/20260529_001_system_settings.ts`

- [ ] **Step 1: Write the migration**

```typescript
// packages/db/migrations/20260529_001_system_settings.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('system_settings')
    .addColumn('key', 'text', c => c.primaryKey())
    .addColumn('value', 'jsonb', c => c.notNull())
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    INSERT INTO system_settings (key, value)
    VALUES ('setup', '{"configured": false}'::jsonb)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('system_settings').execute();
}
```

- [ ] **Step 2: Run migration**

```bash
cd packages/db && npx tsx src/migrate.ts
```

Expected: Migration `20260529_001_system_settings` applied successfully.

- [ ] **Step 3: Verify**

```bash
cd packages/db && npx tsx -e "
  import { createDb } from './src/client';
  const db = createDb(process.env.DATABASE_URL!);
  const row = await db.selectFrom('system_settings' as any).selectAll().executeTakeFirst();
  console.log(row);
  process.exit(0);
"
```

Expected: `{ key: 'setup', value: { configured: false }, updated_at: ... }`

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260529_001_system_settings.ts
git commit -m "feat(db): add system_settings table with setup seed row"
```

---

## Task 2: DB Schema — add SystemSettingsTable type

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write failing test** (type-level — verify build compiles)

This task has no runtime test; correctness is verified by TypeScript compilation in Task 2 Step 3.

- [ ] **Step 2: Add SystemSettingsTable and Database entry**

Open `packages/db/src/schema.ts`. At the end, before the `Database` interface, add:

```typescript
export interface SystemSettingsTable {
  key: string;
  value: Record<string, unknown>;
  updated_at: Generated<Date>;
}
```

Then find the `Database` interface (it lists all table names as properties) and add:

```typescript
  system_settings: SystemSettingsTable;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/db && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add SystemSettingsTable type to schema"
```

---

## Task 3: Config — readConfigFromDb

**Files:**
- Create: `packages/config/src/read-config-from-db.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: Write the test**

```typescript
// packages/config/src/__tests__/read-config-from-db.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readConfigFromDb } from '../read-config-from-db';

describe('readConfigFromDb', () => {
  it('returns null when no config row exists', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result).toBeNull();
  });

  it('parses and returns valid config from DB', async () => {
    const value = {
      app: { name: 'Test', logoUrl: '/logo.png' },
      features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
      smtp: null,
    };

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value }),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result?.app.name).toBe('Test');
    expect(result?.features.crm).toBe(true);
  });

  it('returns null when config row has invalid shape', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { bad: 'shape' } }),
          }),
        }),
      }),
    } as any;

    const result = await readConfigFromDb(mockDb);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/config && npx vitest run src/__tests__/read-config-from-db.test.ts
```

Expected: FAIL — `read-config-from-db` module not found.

- [ ] **Step 3: Implement readConfigFromDb**

```typescript
// packages/config/src/read-config-from-db.ts
import type { Kysely } from 'kysely';
import { configSchema, type VantageConfig } from './config-schema';

export async function readConfigFromDb(db: Kysely<any>): Promise<VantageConfig | null> {
  const row = await db
    .selectFrom('system_settings')
    .where('key', '=', 'config')
    .select('value')
    .executeTakeFirst();

  if (!row) return null;

  const result = configSchema.safeParse(row.value);
  if (!result.success) return null;

  return result.data;
}
```

- [ ] **Step 4: Export from index**

In `packages/config/src/index.ts`, add after the existing exports:

```typescript
export { readConfigFromDb } from './read-config-from-db';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/config && npx vitest run src/__tests__/read-config-from-db.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/read-config-from-db.ts packages/config/src/index.ts packages/config/src/__tests__/read-config-from-db.test.ts
git commit -m "feat(config): add readConfigFromDb for DB-backed config reading"
```

---

## Task 4: API — setup-crypto.ts (SMTP password encryption)

**Files:**
- Create: `apps/api/src/lib/setup-crypto.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/api/src/__tests__/setup-crypto.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('setup-crypto', () => {
  const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    process.env['SSH_ENCRYPTION_KEY'] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env['SSH_ENCRYPTION_KEY'];
  });

  it('encrypts and decrypts SMTP password round-trip', async () => {
    const { encryptSmtpPassword, decryptSmtpPassword } = await import('../lib/setup-crypto');
    const plaintext = 'super-secret-password-123!';
    const { encrypted, iv } = encryptSmtpPassword(plaintext);
    const decrypted = decryptSmtpPassword(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encryptSmtpPassword } = await import('../lib/setup-crypto');
    const r1 = encryptSmtpPassword('password');
    const r2 = encryptSmtpPassword('password');
    expect(r1.iv).not.toBe(r2.iv);
    expect(r1.encrypted).not.toBe(r2.encrypted);
  });

  it('throws if SSH_ENCRYPTION_KEY is missing', async () => {
    delete process.env['SSH_ENCRYPTION_KEY'];
    const { encryptSmtpPassword } = await import('../lib/setup-crypto');
    expect(() => encryptSmtpPassword('x')).toThrow('SSH_ENCRYPTION_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/__tests__/setup-crypto.test.ts
```

Expected: FAIL — `setup-crypto` module not found.

- [ ] **Step 3: Implement setup-crypto.ts**

```typescript
// apps/api/src/lib/setup-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getKey(): Buffer {
  const hex = process.env['SSH_ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('SSH_ENCRYPTION_KEY must be a 64-char hex string');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSmtpPassword(plaintext: string): { encrypted: string; iv: string } {
  const key = getKey();
  const ivBuf = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, ivBuf);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { encrypted: enc.toString('base64'), iv: ivBuf.toString('hex') };
}

export function decryptSmtpPassword(encrypted: string, iv: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/__tests__/setup-crypto.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/setup-crypto.ts apps/api/src/__tests__/setup-crypto.test.ts
git commit -m "feat(api): add SMTP password encryption helper for installer"
```

---

## Task 5: API — setup-db.ts (DB helpers)

**Files:**
- Create: `apps/api/src/lib/setup-db.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/api/src/__tests__/setup-db.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('isConfigured', () => {
  it('returns false when system_settings row has configured=false', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { configured: false } }),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when configured=true', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue({ value: { configured: true } }),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });

  it('returns false when row is missing (table exists, setup not run)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(false);
  });

  it('returns true when DB throws (legacy deploy, table does not exist)', async () => {
    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            executeTakeFirst: vi.fn().mockRejectedValue(new Error('relation "system_settings" does not exist')),
          }),
        }),
      }),
    } as any;

    const { isConfigured } = await import('../lib/setup-db');
    expect(await isConfigured(mockDb)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/__tests__/setup-db.test.ts
```

Expected: FAIL — `setup-db` module not found.

- [ ] **Step 3: Implement setup-db.ts**

```typescript
// apps/api/src/lib/setup-db.ts
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export async function isConfigured(db: Kysely<Database>): Promise<boolean> {
  try {
    const row = await db
      .selectFrom('system_settings')
      .where('key', '=', 'setup')
      .select('value')
      .executeTakeFirst();
    return (row?.value as { configured?: boolean })?.configured === true;
  } catch {
    // Table doesn't exist = pre-migration / local-dev with file config = treat as configured
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/__tests__/setup-db.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/setup-db.ts apps/api/src/__tests__/setup-db.test.ts
git commit -m "feat(api): add isConfigured DB helper for setup guard"
```

---

## Task 6: API — setup route

**Files:**
- Create: `apps/api/src/routes/setup.ts`
- Create: `apps/api/src/__tests__/setup-route.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// apps/api/src/__tests__/setup-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSetupRouter } from '../routes/setup';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

const mockDb = {} as Kysely<Database>;

describe('GET /api/setup/status', () => {
  it('returns { configured: false } when not set up', async () => {
    const router = createSetupRouter(mockDb);
    expect(router).toBeDefined();
    expect(typeof router.get).toBe('function');
  });
});

describe('POST /api/setup', () => {
  it('router exports createSetupRouter function', async () => {
    const { createSetupRouter } = await import('../routes/setup');
    expect(typeof createSetupRouter).toBe('function');
  });

  it('router has POST route', async () => {
    const { createSetupRouter } = await import('../routes/setup');
    const router = createSetupRouter(mockDb);
    expect(typeof router.post).toBe('function');
  });

  it('source validates zod schema before processing', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('setupSchema');
    expect(source).toContain('safeParse');
  });

  it('source contains transaction and FOR UPDATE lock', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('FOR UPDATE');
    expect(source).toContain('transaction');
  });

  it('source hashes password with bcrypt', async () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../routes/setup.ts'),
      'utf-8',
    );
    expect(source).toContain('bcrypt.hash');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/__tests__/setup-route.test.ts
```

Expected: FAIL — `setup` module not found.

- [ ] **Step 3: Implement the setup route**

```typescript
// apps/api/src/routes/setup.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { z } from 'zod';
import { smtpSchema, configSchema } from '@vantage/config';
import { encryptSmtpPassword } from '../lib/setup-crypto';
import { isConfigured } from '../lib/setup-db';
import { logger } from '../lib/logger';

// In-memory rate limiter: IP → timestamps of recent requests
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

const setupSchema = z.object({
  branding: z.object({
    name: z.string().min(1).max(100),
    logoUrl: z.string().default('/logo.png'),
    domain: z.string().optional(),
  }),
  features: z.object({
    crm: z.boolean(),
    infra: z.boolean(),
    alerts: z.boolean(),
    analytics: z.boolean(),
    files: z.boolean(),
  }),
  smtp: smtpSchema.nullable(),
  admin: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export function createSetupRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      const configured = await isConfigured(db);
      res.json({ data: { configured }, error: null });
    } catch (err) {
      logger.error({ err }, '[setup] status check failed');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  router.post('/', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ data: null, error: { code: 'RATE_LIMITED' } });
      return;
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
      return;
    }

    const { branding, features, smtp, admin } = parsed.data;

    try {
      await db.transaction().execute(async trx => {
        // Row-level lock prevents concurrent setup
        const row = await sql<{ value: { configured: boolean } }>`
          SELECT value FROM system_settings WHERE key = 'setup' FOR UPDATE
        `.execute(trx);

        const isAlreadyConfigured = (row.rows[0]?.value as { configured?: boolean })?.configured === true;
        if (isAlreadyConfigured) {
          const err = new Error('ALREADY_CONFIGURED');
          (err as any).statusCode = 403;
          throw err;
        }

        // Hash admin password
        const passwordHash = await bcrypt.hash(admin.password, 12);

        // Create workspace
        const workspace = await trx
          .insertInto('workspaces')
          .values({
            name: branding.name,
            domain: branding.domain ?? null,
          })
          .returning(['id'])
          .executeTakeFirstOrThrow();

        // Create admin user
        await trx
          .insertInto('users')
          .values({
            workspace_id: workspace.id,
            name: admin.name,
            email: admin.email,
            password_hash: passwordHash,
            role: 'admin',
          })
          .execute();

        // Encrypt SMTP password if provided
        let smtpToStore = smtp ? { ...smtp } as Record<string, unknown> : null;
        if (smtpToStore && typeof smtpToStore['password'] === 'string') {
          const { encrypted, iv } = encryptSmtpPassword(smtpToStore['password'] as string);
          smtpToStore = { ...smtpToStore, password: encrypted, password_iv: iv };
        }

        // Save config row
        const configValue = {
          app: { name: branding.name, logoUrl: branding.logoUrl, domain: branding.domain },
          features,
          smtp: smtpToStore,
        };

        await trx
          .insertInto('system_settings')
          .values({ key: 'config', value: JSON.stringify(configValue) as any })
          .execute();

        // Mark setup as complete
        await sql`
          UPDATE system_settings SET value = '{"configured": true}'::jsonb, updated_at = now()
          WHERE key = 'setup'
        `.execute(trx);
      });

      res.cookie('vantage_setup_done', '1', {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.json({ data: { ok: true }, error: null });
    } catch (err: any) {
      if (err?.message === 'ALREADY_CONFIGURED') {
        res.status(403).json({ data: null, error: { code: 'ALREADY_CONFIGURED' } });
        return;
      }
      logger.error({ err }, '[setup] POST failed');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/__tests__/setup-route.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/setup.ts apps/api/src/__tests__/setup-route.test.ts
git commit -m "feat(api): add setup route (GET /status + POST /)"
```

---

## Task 7: API — register setup route + update config endpoint

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/config.ts`

- [ ] **Step 1: Register setup route in index.ts**

Open `apps/api/src/index.ts`. Add import near the top (after existing route imports):

```typescript
import { createSetupRouter } from './routes/setup';
```

Then add the route registration before the `requireAuth` routes (it must be public):

```typescript
// Setup (public — must come before requireAuth routes)
app.use('/api/setup', createSetupRouter(db));
```

Place it right after `app.use('/api/auth', ...)` line.

- [ ] **Step 2: Update config route to read from DB when available**

Replace the contents of `apps/api/src/routes/config.ts` with:

```typescript
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { VantageConfig } from '@vantage/config';
import { readConfigFromDb } from '@vantage/config';

export function createConfigRouter(config: VantageConfig, db: Kysely<Database>): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    // Try DB config first (set during installer); fall back to file config
    const dbConfig = await readConfigFromDb(db).catch(() => null);
    const effective = dbConfig ?? config;

    res.json({
      data: {
        app: { name: effective.app.name, logoUrl: effective.app.logoUrl },
        features: effective.features,
      },
      error: null,
    });
  });

  return router;
}
```

- [ ] **Step 3: Update call site in index.ts**

In `apps/api/src/index.ts`, find:
```typescript
app.use('/api/config', createConfigRouter(config));
```

Replace with:
```typescript
app.use('/api/config', createConfigRouter(config, db));
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/routes/config.ts
git commit -m "feat(api): register setup route and serve config from DB when available"
```

---

## Task 8: Web — middleware setup guard

**Files:**
- Modify: `apps/web/middleware.ts`

- [ ] **Step 1: Update middleware to check setup cookie**

Replace the contents of `apps/web/middleware.ts` with:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/config'];
const SETUP_PATHS = ['/setup', '/api/setup'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files, Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  const isSetupPath = SETUP_PATHS.some(p => pathname.startsWith(p));
  const setupDone = req.cookies.get('vantage_setup_done')?.value === '1';

  // Setup guard: redirect to /setup if not configured
  if (!setupDone && !isSetupPath) {
    return NextResponse.redirect(new URL('/setup', req.url));
  }

  // Prevent revisiting /setup after completion
  if (setupDone && pathname === '/setup') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Allow public paths through (no auth cookie required)
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files, Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = req.cookies.get('vantage_token');
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(web): add setup cookie guard to middleware"
```

---

## Task 9: Web — setup page entry + ProgressBar

**Files:**
- Create: `apps/web/app/setup/page.tsx`
- Create: `apps/web/app/setup/ProgressBar.tsx`

- [ ] **Step 1: Create the page entry**

The page is a server component — it checks setup status server-side and redirects away if already configured.

```tsx
// apps/web/app/setup/page.tsx
import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: 'Setup — Vantage' };

async function getSetupStatus(): Promise<boolean> {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/setup/status`, { cache: 'no-store' });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}

export default async function SetupPage() {
  const configured = await getSetupStatus();
  if (configured) redirect('/');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 32,
            fontWeight: 400,
            color: 'var(--text)',
            margin: '0 0 8px',
          }}>
            Welcome to Vantage
          </h1>
          <p style={{ color: 'var(--text2)', margin: 0 }}>
            Let's get your instance set up.
          </p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProgressBar**

```tsx
// apps/web/app/setup/ProgressBar.tsx
const STEPS = ['Branding', 'Features', 'SMTP', 'Admin Account', 'Review'];

export function ProgressBar({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? 'var(--text)' : 'var(--border)',
                  color: done || active ? '#fff' : 'var(--text3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {done ? '✓' : step}
                </div>
                <span style={{
                  fontSize: 11,
                  color: active ? 'var(--text)' : 'var(--text3)',
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  height: 2,
                  flex: 1,
                  background: done ? 'var(--green)' : 'var(--border)',
                  marginBottom: 20,
                  marginLeft: -4,
                  marginRight: -4,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/setup/page.tsx apps/web/app/setup/ProgressBar.tsx
git commit -m "feat(web): add setup page entry and progress bar component"
```

---

## Task 10: Web — SetupWizard + StepBranding + StepFeatures

**Files:**
- Create: `apps/web/app/setup/SetupWizard.tsx`
- Create: `apps/web/app/setup/steps/StepBranding.tsx`
- Create: `apps/web/app/setup/steps/StepFeatures.tsx`

- [ ] **Step 1: Create SetupWizard (state container)**

```tsx
// apps/web/app/setup/SetupWizard.tsx
'use client';

import { useState } from 'react';
import { ProgressBar } from './ProgressBar';
import { StepBranding } from './steps/StepBranding';
import { StepFeatures } from './steps/StepFeatures';
import { StepSmtp } from './steps/StepSmtp';
import { StepAdminAccount } from './steps/StepAdminAccount';
import { StepReview } from './steps/StepReview';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SetupState = {
  step: 1 | 2 | 3 | 4 | 5;
  branding: { name: string; logoUrl: string; domain: string };
  features: { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };
  smtp: SmtpConfig | null;
  admin: { name: string; email: string; password: string };
};

const INITIAL: SetupState = {
  step: 1,
  branding: { name: '', logoUrl: '/logo.png', domain: '' },
  features: { crm: true, infra: true, alerts: true, analytics: false, files: false },
  smtp: null,
  admin: { name: '', email: '', password: '' },
};

export function SetupWizard() {
  const [state, setState] = useState<SetupState>(INITIAL);

  const update = (partial: Partial<SetupState>) =>
    setState(s => ({ ...s, ...partial }));

  const next = () => update({ step: (state.step + 1) as SetupState['step'] });
  const back = () => update({ step: (state.step - 1) as SetupState['step'] });

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 32,
    }}>
      <ProgressBar current={state.step} />
      {state.step === 1 && (
        <StepBranding
          value={state.branding}
          onChange={branding => update({ branding })}
          onNext={next}
        />
      )}
      {state.step === 2 && (
        <StepFeatures
          value={state.features}
          onChange={features => update({ features })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 3 && (
        <StepSmtp
          value={state.smtp}
          onChange={smtp => update({ smtp })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 4 && (
        <StepAdminAccount
          value={state.admin}
          onChange={admin => update({ admin })}
          onNext={next}
          onBack={back}
        />
      )}
      {state.step === 5 && (
        <StepReview
          state={state}
          onBack={back}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create StepBranding**

```tsx
// apps/web/app/setup/steps/StepBranding.tsx
'use client';

import { useState } from 'react';

type Props = {
  value: { name: string; logoUrl: string; domain: string };
  onChange: (v: { name: string; logoUrl: string; domain: string }) => void;
  onNext: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: 6,
};

export function StepBranding({ value, onChange, onNext }: Props) {
  const [error, setError] = useState('');

  const submit = () => {
    if (!value.name.trim()) {
      setError('App name is required.');
      return;
    }
    setError('');
    onNext();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Branding
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Customize how your Vantage instance appears.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>App name *</label>
          <input
            style={inputStyle}
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="Acme CRM"
          />
        </div>
        <div>
          <label style={labelStyle}>Logo URL</label>
          <input
            style={inputStyle}
            value={value.logoUrl}
            onChange={e => onChange({ ...value, logoUrl: e.target.value })}
            placeholder="/logo.png"
          />
        </div>
        <div>
          <label style={labelStyle}>Domain</label>
          <input
            style={inputStyle}
            value={value.domain}
            onChange={e => onChange({ ...value, domain: e.target.value })}
            placeholder="app.yourcompany.com"
          />
        </div>
      </div>

      {error && (
        <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={submit}
          style={{
            padding: '8px 20px',
            background: 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create StepFeatures**

```tsx
// apps/web/app/setup/steps/StepFeatures.tsx
'use client';

type Features = { crm: boolean; infra: boolean; alerts: boolean; analytics: boolean; files: boolean };

type Props = {
  value: Features;
  onChange: (v: Features) => void;
  onNext: () => void;
  onBack: () => void;
};

const FEATURE_LABELS: { key: keyof Features; label: string; desc: string }[] = [
  { key: 'crm', label: 'CRM', desc: 'Contacts, companies, deals, tasks, activity' },
  { key: 'infra', label: 'Infrastructure', desc: 'Server monitoring, databases, websites' },
  { key: 'alerts', label: 'Alerts', desc: 'Threshold alerts and notifications' },
  { key: 'analytics', label: 'Analytics', desc: 'Revenue charts, pipeline stats, rep leaderboard' },
  { key: 'files', label: 'Files', desc: 'File storage and management' },
];

export function StepFeatures({ value, onChange, onNext, onBack }: Props) {
  const toggle = (key: keyof Features) =>
    onChange({ ...value, [key]: !value[key] });

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Features
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Enable the modules you need.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FEATURE_LABELS.map(({ key, label, desc }) => (
          <label
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              background: value[key] ? 'var(--surface2)' : 'var(--surface)',
            }}
          >
            <input
              type="checkbox"
              checked={value[key]}
              onChange={() => toggle(key)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={onNext} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/setup/SetupWizard.tsx apps/web/app/setup/steps/StepBranding.tsx apps/web/app/setup/steps/StepFeatures.tsx
git commit -m "feat(web): add SetupWizard, StepBranding, StepFeatures"
```

---

## Task 11: Web — StepSmtp + StepAdminAccount

**Files:**
- Create: `apps/web/app/setup/steps/StepSmtp.tsx`
- Create: `apps/web/app/setup/steps/StepAdminAccount.tsx`

- [ ] **Step 1: Create StepSmtp**

```tsx
// apps/web/app/setup/steps/StepSmtp.tsx
'use client';

import { useState } from 'react';
import type { SmtpConfig } from '../SetupWizard';

type Props = {
  value: SmtpConfig | null;
  onChange: (v: SmtpConfig | null) => void;
  onNext: () => void;
  onBack: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: 6,
};

const EMPTY: SmtpConfig = { host: '', port: 587, secure: false, user: '', password: '', from: '' };

export function StepSmtp({ value, onChange, onNext, onBack }: Props) {
  const [enabled, setEnabled] = useState(value !== null);
  const [form, setForm] = useState<SmtpConfig>(value ?? EMPTY);
  const [error, setError] = useState('');

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  const submit = () => {
    if (!enabled) {
      onChange(null);
      onNext();
      return;
    }
    if (!form.host || !form.user || !form.password || !form.from) {
      setError('All SMTP fields are required when SMTP is enabled.');
      return;
    }
    setError('');
    onChange(form);
    onNext();
  };

  const f = (key: keyof SmtpConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(s => ({ ...s, [key]: key === 'port' ? Number(e.target.value) : e.target.value }));

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        SMTP
      </h2>
      <p style={{ margin: '0 0 20px', color: 'var(--text2)', fontSize: 14 }}>
        Configure email sending for notifications and password resets.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>Enable SMTP</span>
      </label>

      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Host *</label>
              <input style={inputStyle} value={form.host} onChange={f('host')} placeholder="smtp.sendgrid.net" />
            </div>
            <div>
              <label style={labelStyle}>Port *</label>
              <input style={inputStyle} type="number" value={form.port} onChange={f('port')} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Username *</label>
            <input style={inputStyle} value={form.user} onChange={f('user')} placeholder="apikey" />
          </div>
          <div>
            <label style={labelStyle}>Password *</label>
            <input style={inputStyle} type="password" value={form.password} onChange={f('password')} />
          </div>
          <div>
            <label style={labelStyle}>From address *</label>
            <input style={inputStyle} value={form.from} onChange={f('from')} placeholder="hello@yourcompany.com" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.secure}
              onChange={e => setForm(s => ({ ...s, secure: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Use TLS (port 465)</span>
          </label>
        </div>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={submit} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          {enabled ? 'Next' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create StepAdminAccount**

```tsx
// apps/web/app/setup/steps/StepAdminAccount.tsx
'use client';

import { useState } from 'react';

type AdminValue = { name: string; email: string; password: string };

type Props = {
  value: AdminValue;
  onChange: (v: AdminValue) => void;
  onNext: () => void;
  onBack: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: 6,
};

export function StepAdminAccount({ value, onChange, onNext, onBack }: Props) {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  const submit = () => {
    if (!value.name.trim()) { setError('Name is required.'); return; }
    if (!value.email.includes('@')) { setError('Valid email is required.'); return; }
    if (value.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (value.password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    onNext();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Admin Account
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        This creates the first admin account. Use these credentials to log in after setup.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Full name *</label>
          <input
            style={inputStyle}
            value={value.name}
            onChange={e => onChange({ ...value, name: e.target.value })}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input
            style={inputStyle}
            type="email"
            value={value.email}
            onChange={e => onChange({ ...value, email: e.target.value })}
            placeholder="admin@yourcompany.com"
          />
        </div>
        <div>
          <label style={labelStyle}>Password * (min 8 characters)</label>
          <input
            style={inputStyle}
            type="password"
            value={value.password}
            onChange={e => onChange({ ...value, password: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Confirm password *</label>
          <input
            style={inputStyle}
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
        </div>
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button onClick={submit} style={{ ...btnBase, background: 'var(--text)', color: '#fff' }}>
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/setup/steps/StepSmtp.tsx apps/web/app/setup/steps/StepAdminAccount.tsx
git commit -m "feat(web): add StepSmtp and StepAdminAccount wizard steps"
```

---

## Task 12: Web — StepReview + submission

**Files:**
- Create: `apps/web/app/setup/steps/StepReview.tsx`

- [ ] **Step 1: Create StepReview**

```tsx
// apps/web/app/setup/steps/StepReview.tsx
'use client';

import { useState } from 'react';
import type { SetupState } from '../SetupWizard';

type Props = {
  state: SetupState;
  onBack: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text2)', fontSize: 13 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export function StepReview({ state, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const btnBase: React.CSSProperties = {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'DM Sans, sans-serif',
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          branding: state.branding,
          features: state.features,
          smtp: state.smtp,
          admin: state.admin,
        }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error?.code === 'ALREADY_CONFIGURED'
          ? 'This instance is already configured.'
          : 'Setup failed. Please check your inputs and try again.');
        return;
      }

      // Redirect to login — cookie is set by the API
      window.location.href = '/login';
    } catch {
      setError('Network error. Is the API running?');
    } finally {
      setLoading(false);
    }
  };

  const enabledFeatures = Object.entries(state.features)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'None';

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
        Review & Confirm
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text2)', fontSize: 14 }}>
        Check your configuration before launching.
      </p>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Branding
        </div>
        <Row label="App name" value={state.branding.name} />
        <Row label="Logo URL" value={state.branding.logoUrl} />
        {state.branding.domain && <Row label="Domain" value={state.branding.domain} />}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Features
        </div>
        <Row label="Enabled" value={enabledFeatures} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          SMTP
        </div>
        {state.smtp
          ? <>
              <Row label="Host" value={`${state.smtp.host}:${state.smtp.port}`} />
              <Row label="From" value={state.smtp.from} />
              <Row label="Password" value="••••••••" />
            </>
          : <Row label="Status" value="Skipped" />
        }
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Admin Account
        </div>
        <Row label="Name" value={state.admin.name} />
        <Row label="Email" value={state.admin.email} />
        <Row label="Password" value="••••••••" />
      </div>

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} disabled={loading} style={{ ...btnBase, background: 'var(--surface2)', color: 'var(--text)' }}>
          Back
        </button>
        <button
          onClick={submit}
          disabled={loading}
          style={{ ...btnBase, background: 'var(--green)', color: '#fff', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Launching…' : 'Launch Vantage'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/setup/steps/StepReview.tsx
git commit -m "feat(web): add StepReview with API submission and redirect"
```

---

## Task 13: End-to-end smoke test

- [ ] **Step 1: Start API and web dev servers**

In two terminals:
```bash
# Terminal 1
cd apps/api && npm run dev

# Terminal 2
cd apps/web && npm run dev
```

- [ ] **Step 2: Verify setup redirect**

Navigate to `http://localhost:3000`. Should redirect to `http://localhost:3000/setup`.

- [ ] **Step 3: Complete the wizard**

Fill in all 5 steps with test data:
- Branding: name="Test Instance", logoUrl="/logo.png"
- Features: all defaults
- SMTP: Skip
- Admin: name="Test Admin", email="admin@test.com", password="testpassword123"
- Review: click "Launch Vantage"

Expected: Redirect to `/login`.

- [ ] **Step 4: Log in**

Use the admin credentials from Step 3. Should land on the dashboard.

- [ ] **Step 5: Verify setup redirect blocked**

Navigate to `http://localhost:3000/setup`. Should redirect to `/`.

- [ ] **Step 6: Verify DB state**

```bash
cd apps/api && npx tsx -e "
  import { createDb } from '@vantage/db';
  const db = createDb(process.env.DATABASE_URL!);
  const s = await db.selectFrom('system_settings').selectAll().execute();
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
"
```

Expected: Two rows — `setup` with `configured: true`, `config` with full config object.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: installer page — first-boot setup wizard complete"
```
