import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

const GHCR_IMAGE = 'vencorehq/vencore-api';
const RELEASES_BASE = 'https://github.com/vencorehq/Vencore/releases/tag';

export function currentVersion(): string {
  return process.env['VENCORE_VERSION'] ?? '0.0.0-dev';
}

export function isSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!;
  }
  return 0;
}

export function pickLatest(tags: string[]): string | null {
  const semvers = tags.filter(isSemver);
  if (semvers.length === 0) return null;
  return semvers.sort(compareSemver).at(-1) ?? null;
}

export async function fetchLatestGhcrVersion(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const tokenRes = await fetchFn(
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${GHCR_IMAGE}:pull`,
  );
  if (!tokenRes.ok) throw new Error(`GHCR token request failed: ${tokenRes.status}`);
  const { token } = (await tokenRes.json()) as { token: string };

  const tagsRes = await fetchFn(`https://ghcr.io/v2/${GHCR_IMAGE}/tags/list?n=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!tagsRes.ok) throw new Error(`GHCR tags request failed: ${tagsRes.status}`);
  const { tags } = (await tagsRes.json()) as { tags: string[] | null };

  return pickLatest(tags ?? []);
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  lastCheckedAt: Date | null;
}

export async function runUpdateCheck(
  db: Kysely<Database>,
  fetchFn: typeof fetch = fetch,
): Promise<UpdateInfo> {
  const running = currentVersion();
  const latest = await fetchLatestGhcrVersion(fetchFn);
  const releaseUrl = latest ? `${RELEASES_BASE}/v${latest}` : null;
  const now = new Date();

  await db
    .updateTable('instance_meta')
    .set({ latest_version: latest, release_url: releaseUrl, last_checked_at: now })
    .where('id', '=', 1)
    .execute();

  const updateAvailable =
    latest !== null && isSemver(running) && compareSemver(latest, running) > 0;

  if (updateAvailable && latest) {
    const meta = await db
      .selectFrom('instance_meta')
      .select('notified_version')
      .where('id', '=', 1)
      .executeTakeFirst();

    if (meta?.notified_version !== latest) {
      const admins = await db
        .selectFrom('users')
        .select(['id', 'workspace_id'])
        .where('role', '=', 'admin')
        .execute();

      if (admins.length > 0) {
        await db
          .insertInto('notifications')
          .values(
            admins.map(a => ({
              workspace_id: a.workspace_id,
              user_id: a.id,
              type: 'system',
              title: `Vencore ${latest} is available`,
              body: `You are running ${running}. Apply the update from Settings → Updates.`,
              resource_type: null,
              resource_id: null,
            })),
          )
          .execute();
      }

      await db
        .updateTable('instance_meta')
        .set({ notified_version: latest })
        .where('id', '=', 1)
        .execute();
    }
  }

  return {
    currentVersion: running,
    latestVersion: latest,
    updateAvailable,
    releaseUrl,
    lastCheckedAt: now,
  };
}
