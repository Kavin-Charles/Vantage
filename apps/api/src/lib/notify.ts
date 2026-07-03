import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { sendPush } from './push-notify';
import { logger } from './logger';

export interface NotifyParams {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
}

export async function notify(db: Kysely<Database>, params: NotifyParams): Promise<void> {
  try {
    await db
      .insertInto('notifications')
      .values({
        workspace_id: params.workspaceId,
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
      })
      .execute();

    const tokenRows = await db
      .selectFrom('push_tokens')
      .where('user_id', '=', params.userId)
      .select(['token', 'preferences'])
      .execute();

    const eligibleTokens = tokenRows
      .filter(row => {
        const prefs = (row.preferences ?? {}) as Record<string, boolean>;
        return prefs['pm_assigned'] !== false;
      })
      .map(row => row.token);

    if (eligibleTokens.length > 0) {
      await sendPush(eligibleTokens, params.title, params.body);
    }
  } catch (err) {
    logger.error({ err }, '[notify] failed');
  }
}
