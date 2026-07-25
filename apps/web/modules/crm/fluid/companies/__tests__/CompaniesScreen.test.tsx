/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { CompaniesScreen } from '@/modules/crm/fluid/companies/CompaniesScreen';
import { listCompanies } from '@/modules/crm/companies/lib/companies';

vi.mock('@/modules/crm/companies/lib/companies', () => ({
  listCompanies: vi.fn().mockResolvedValue({ data: [], total: 0 }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/modules/crm/fluid/companies/CompanyFormModal', () => ({
  CompanyFormModal: ({ open }: { open: boolean }) =>
    (open ? <div data-testid="company-form-modal">Add New Company</div> : null),
}));

// Minimal store matching RootState's `auth` slice shape, consumed by
// useApiToken — avoids pulling in the real auth-slice (which reaches for
// localStorage at module-eval time).
function createTestStore() {
  return configureStore({
    reducer: {
      auth: (state = { token: 'test-token', user: null }) => state,
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

describe('CompaniesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listCompanies as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], total: 0 });
  });

  it('renders an Add Company button that opens the CompanyFormModal', async () => {
    renderWithProviders(<CompaniesScreen />);

    const addButton = await screen.findByRole('button', { name: /add company/i });
    expect(screen.queryByTestId('company-form-modal')).toBeNull();

    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.queryByTestId('company-form-modal')).not.toBeNull();
    });
  });
});
