/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { CompanyFormModal } from '@/modules/crm/fluid/companies/CompanyFormModal';
import { createCompany, updateCompany } from '@/modules/crm/companies/lib/companies';

vi.mock('@/modules/crm/companies/lib/companies', () => ({
  createCompany: vi.fn().mockResolvedValue({ data: { id: 'c1', name: 'Acme' }, error: null }),
  updateCompany: vi.fn().mockResolvedValue({ data: { id: 'c1', name: 'Acme' }, error: null }),
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

describe('CompanyFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create mode: typing a name and clicking Create calls createCompany and fires onSaved', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <CompanyFormModal open mode="create" onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByPlaceholderText('Company name'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createCompany).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ name: 'Acme Corp' }),
      );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(updateCompany).not.toHaveBeenCalled();
  });

  it('create mode: submit is disabled while name is empty', () => {
    renderWithProviders(
      <CompanyFormModal open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    const submit = screen.getByRole('button', { name: /create/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
