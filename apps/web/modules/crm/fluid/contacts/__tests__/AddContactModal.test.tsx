/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { AddContactModal } from '@/modules/crm/fluid/contacts/AddContactModal';
import { createContact } from '@/modules/crm/contacts/lib/contacts';
import { listCompanies } from '@/modules/crm/companies/lib/companies';

vi.mock('@/modules/crm/contacts/lib/contacts', () => ({
  createContact: vi.fn().mockResolvedValue({ data: { id: 'ct1', name: 'Jane Doe' }, error: null }),
  updateContact: vi.fn().mockResolvedValue({ data: { id: 'ct1', name: 'Jane Doe' }, error: null }),
}));

vi.mock('@/modules/crm/companies/lib/companies', () => ({
  listCompanies: vi.fn().mockResolvedValue({
    data: [{ id: 'co1', name: 'Acme Corp' }, { id: 'co2', name: 'Globex' }],
    total: 2,
  }),
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

describe('AddContactModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listCompanies as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'co1', name: 'Acme Corp' }, { id: 'co2', name: 'Globex' }],
      total: 2,
    });
    (createContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'ct1', name: 'Jane Doe' },
      error: null,
    });
  });

  it('includes company_id in the create body when a company is selected', async () => {
    const onCreated = vi.fn();
    renderWithProviders(
      <AddContactModal open onClose={vi.fn()} onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'jane@acme.com' } });

    const companySelect = await screen.findByTestId('contact-company-select');
    await screen.findByText('Acme Corp');
    fireEvent.change(companySelect, { target: { value: 'co1' } });

    fireEvent.click(screen.getByRole('button', { name: /create contact/i }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ company_id: 'co1' }),
      );
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('omits company_id from the create body when no company is selected', async () => {
    renderWithProviders(
      <AddContactModal open onClose={vi.fn()} onCreated={vi.fn()} />,
    );

    fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByPlaceholderText('Last name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'jane@acme.com' } });

    fireEvent.click(screen.getByRole('button', { name: /create contact/i }));

    await waitFor(() => {
      expect(createContact).toHaveBeenCalled();
    });
    const body = (createContact as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).not.toHaveProperty('company_id');
  });
});
