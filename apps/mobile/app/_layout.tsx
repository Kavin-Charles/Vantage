import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import { getAuthToken } from '@/lib/secureStore';

// Show notifications while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void getAuthToken().then(setToken);
  }, []);

  useEffect(() => {
    if (token === undefined) return; // still loading
    const inAuthGroup = segments[0] === '(auth)';
    if (token && inAuthGroup) {
      router.replace('/(app)');
    } else if (!token && !inAuthGroup) {
      // Re-read storage before redirecting — covers post-login navigation
      // where login screen stored the token just before router.replace
      void getAuthToken().then(fresh => {
        if (fresh) {
          setToken(fresh);
        } else {
          router.replace('/(auth)/login');
        }
      });
    }
  }, [token, segments, router]);

  if (token === undefined) return null; // show nothing while loading token

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </PersistQueryClientProvider>
  );
}
