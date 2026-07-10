import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { currentVersion } from './update-check';
import {
  SUPPORTED_SDK_MAJOR,
  semverGt,
  semverValid,
  semverSatisfies,
  semverMajor,
} from './version';

export interface VersionRuleInput {
  id: string;
  version: string;
  sdk_version?: string;
  host_version?: string;
}

export interface VersionRuleResult {
  error: { code: 'VERSION_NOT_BUMPED' | 'HOST_VERSION_UNSATISFIED'; message: string } | null;
  warnings: string[];
}

/**
 * Version gate for plugin install/publish. Must run before any side effect
 * (file save, build, migration, upsert). Blocking rules return `error`;
 * non-blocking issues accumulate in `warnings`.
 */
export async function checkVersionRules(
  db: Kysely<Database>,
  workspaceId: string,
  mf: VersionRuleInput,
): Promise<VersionRuleResult> {
  const warnings: string[] = [];

  const existing = await db
    .selectFrom('workspace_plugins')
    .select('version')
    .where('workspace_id', '=', workspaceId)
    .where('plugin_id', '=', mf.id)
    .executeTakeFirst();

  // Rows written before strict validation may hold junk versions — let a
  // republish repair them instead of comparing against garbage.
  if (existing && semverValid(existing.version) !== null && !semverGt(mf.version, existing.version)) {
    return {
      error: {
        code: 'VERSION_NOT_BUMPED',
        message: `Version ${mf.version} must be greater than installed ${existing.version}`,
      },
      warnings,
    };
  }

  const host = currentVersion();
  const hostIsDev = host === '0.0.0-dev' || semverValid(host) === null;
  if (mf.host_version && !hostIsDev && !semverSatisfies(host, mf.host_version)) {
    return {
      error: {
        code: 'HOST_VERSION_UNSATISFIED',
        message: `Plugin requires host ${mf.host_version}, this instance is ${host}`,
      },
      warnings,
    };
  }

  if (mf.sdk_version && semverMajor(mf.sdk_version) !== SUPPORTED_SDK_MAJOR) {
    warnings.push(
      `Plugin was built with SDK ${mf.sdk_version}; this host supports SDK major ${SUPPORTED_SDK_MAJOR}. It may not work correctly.`,
    );
  }

  return { error: null, warnings };
}
