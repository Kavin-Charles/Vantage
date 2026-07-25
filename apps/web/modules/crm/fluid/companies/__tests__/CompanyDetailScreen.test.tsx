/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { CompanyDetailScreen } from '@/modules/crm/fluid/companies/CompanyDetailScreen';
import { useCompanyOverview } from '@/modules/crm/fluid/lib/useCompanyOverview';
import type { Company, CompanyOverview } from '@vencore/types';

const refetch = vi.fn();

vi.mock('@/modules/crm/fluid/lib/useCompanyOverview', () => ({
  useCompanyOverview: vi.fn(),
}));

vi.mock('@/modules/shared/fluid/host/FluidPanelSlot', () => ({
  FluidPanelSlot: () => null,
}));

vi.mock('@/modules/crm/fluid/companies/CompanyFormModal', () => ({
  CompanyFormModal: ({ open, mode, initial }: { open: boolean; mode: string; initial?: Partial<Company> }) =>
    (open ? <div data-testid="company-form-modal">{mode}:{initial?.name}</div> : null),
}));

const company: Company = {
  id: 'company-1',
  workspace_id: 'ws-1',
  name: 'Acme Corp',
  industry: 'Manufacturing',
  location: 'Austin, TX',
  employee_count: 120,
  website: 'https://acme.example',
  status: 'active',
  annual_revenue: 5_000_000,
  deleted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const overview: CompanyOverview = {
  company,
  contacts: [],
  deals: [],
  activities: [],
  tasks: [],
  metrics: {
    total_deal_value: 0,
    open_deal_count: 0,
    contact_count: 0,
    last_activity_at: null,
  },
};

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

describe('CompanyDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCompanyOverview as ReturnType<typeof vi.fn>).mockReturnValue({
      data: overview,
      isLoading: false,
      error: null,
      refetch,
    });
  });

  it('renders an Edit button that opens CompanyFormModal in edit mode with the company as initial', async () => {
    renderWithProviders(<CompanyDetailScreen id="company-1" />);

    const editButton = await screen.findByRole('button', { name: /edit/i });
    expect(screen.queryByTestId('company-form-modal')).toBeNull();

    fireEvent.click(editButton);

    await waitFor(() => {
      const modal = screen.queryByTestId('company-form-modal');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toBe('edit:Acme Corp');
    });
  });
});
