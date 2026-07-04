import Expo from 'expo-server-sdk';
import { logger } from './logger';

const expo = new Expo();

export interface PushPreferences {
  alerts_critical?: boolean;
  alerts_warning?: boolean;
  tasks_due?: boolean;
  deals_assigned?: boolean;
  contacts_assigned?: boolean;
  pm_assigned?: boolean;
}

/**
 * Send a push notification to a list of Expo push tokens.
 * Silently skips invalid tokens. Logs errors but never throws —
 * push failures must not affect the caller's response.
 */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
): Promise<void> {
  const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const messages = validTokens.map(to => ({
    to,
    title,
    body,
    sound: 'default' as const,
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      receipts.forEach((receipt, i) => {
        if (receipt.status === 'error') {
          logger.warn({ token: validTokens[i], error: receipt.message }, '[push] delivery error');
        }
      });
    }
  } catch (err) {
    logger.error({ err }, '[push] sendPush failed');
  }
}
