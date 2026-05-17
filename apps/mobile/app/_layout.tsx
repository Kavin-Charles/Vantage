import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import { getAuthToken } from '@/lib/secureStore';

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
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(app)');
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
