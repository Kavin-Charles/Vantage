'use client';

import '@/modules/shared/lib/register-module-widgets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { useState, useEffect } from 'react';
import { store } from '@/store';
import { PluginRuntimeProvider } from '@/modules/shared/contexts/PluginRuntimeContext';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const suppress = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', suppress);
    return () => document.removeEventListener('contextmenu', suppress);
  }, []);

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
