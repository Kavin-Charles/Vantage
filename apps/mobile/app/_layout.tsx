import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { queryClient, asyncStoragePersister } from '@/lib/queryClient';
import { getAuthToken } from '@/lib/secureStore';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
  });

  useEffect(() => {
    void getAuthToken().then(setToken);
  }, []);

  useEffect(() => {
    if (fontsLoaded && token !== undefined) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, token]);

  useEffect(() => {
    if (token === undefined) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (token && inAuthGroup) {
      router.replace('/(app)');
    } else if (!token && !inAuthGroup) {
      void getAuthToken().then(fresh => {
        if (fresh) {
          setToken(fresh);
        } else {
          router.replace('/(auth)/login');
        }
      });
    }
  }, [token, segments, router]);

  if (!fontsLoaded || token === undefined) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </PersistQueryClientProvider>
  );
}
