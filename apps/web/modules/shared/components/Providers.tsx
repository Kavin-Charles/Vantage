'use client';

import '@/modules/shared/lib/register-module-widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { store } from '@/store';
import { PluginRuntimeProvider } from '@/modules/shared/contexts/PluginRuntimeContext';
import { GlobalContextMenu } from '@/modules/shared/components/GlobalContextMenu';
import { OfflineBanner } from '@/modules/shared/components/OfflineBanner';

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
          <GlobalContextMenu />
          <OfflineBanner />
        </PluginRuntimeProvider>
      </QueryClientProvider>
    </Provider>
  );
}
