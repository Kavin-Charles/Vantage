/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import SettingsEntryPage from '@/app/(fluid)/settings/[entryId]/page';

vi.mock('@/modules/shared/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/modules/crm/pipeline/lib/pipelines', () => ({
  listPipelines: vi.fn().mockResolvedValue([]),
}));

// A minimal store matching RootState's shape (just the `auth` slice consumed
// by useApiToken) — avoids pulling in the real auth-slice, whose token
// initializer reaches for `localStorage` at module-eval time.
function createTestStore() {
  return configureStore({
    reducer: {
      auth: (state = { token: null, user: null }) => state,
    },
  });
}

function renderWithProviders(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={createTestStore()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>,
  );
}

describe('settings [entryId] route', () => {
  it('renders the registered CRM preferences panel for entryId "crm-preferences"', async () => {
    const element = await SettingsEntryPage({ params: Promise.resolve({ entryId: 'crm-preferences' }) });
    renderWithProviders(element);

    expect(screen.getByRole('heading', { name: 'CRM Preferences' })).toBeTruthy();
  });

  it('calls notFound() for an unregistered entryId', async () => {
    await expect(
      SettingsEntryPage({ params: Promise.resolve({ entryId: 'not-a-real-entry' }) }),
    ).rejects.toThrow();
  });
});
