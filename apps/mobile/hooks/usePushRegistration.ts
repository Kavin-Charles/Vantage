// apps/mobile/hooks/usePushRegistration.ts
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '@/lib/api';
import { storePushToken } from '@/lib/secureStore';
import { logger } from '@/lib/logger';

/**
 * Call inside the authenticated app layout with the current auth token.
 * Requests notification permission, gets Expo push token, stores it in
 * SecureStore, and POSTs it to the API. Silently skips if permission denied.
 */
export function usePushRegistration(authToken: string): void {
  useEffect(() => {
    if (!authToken) return;

    void (async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return; // silently skip

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';

        await storePushToken(expoPushToken);
        await registerPushToken(authToken, expoPushToken, platform);
      } catch (err) {
        // Push registration failures must never crash the app
        logger.warn('[usePushRegistration] error:', err);
      }
    })();
  }, [authToken]);
}
