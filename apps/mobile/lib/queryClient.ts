// apps/mobile/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000,  // 24h — survive app restarts
      staleTime: 5 * 60 * 1000,     // 5 min — background refetch
      networkMode: 'offlineFirst',  // serve cache immediately
      retry: 3,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'VANTAGE_QUERY_CACHE',
});
