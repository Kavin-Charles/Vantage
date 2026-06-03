'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { store } from '@/store';
import { PluginRuntimeProvider } from '@/modules/shared/contexts/PluginRuntimeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }));

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <PluginRuntimeProvider>
          {children}
        </PluginRuntimeProvider>
      </QueryClientProvider>
    </Provider>
  );
}
