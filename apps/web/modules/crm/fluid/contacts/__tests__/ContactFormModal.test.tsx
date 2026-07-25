/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { ContactFormModal } from '@/modules/crm/fluid/contacts/ContactFormModal';
import { createContact, updateContact } from '@/modules/crm/contacts/lib/contacts';
import { listCompanies } from '@/modules/crm/companies/lib/companies';

vi.mock('@/modules/crm/contacts/lib/contacts', () => ({
  createContact: vi.fn().mockResolvedValue({ data: { id: 'ct1', name: 'Jane Doe' }, error: null }),
  updateContact: vi.fn().mockResolvedValue({ data: { id: 'ct1', name: 'Janet Doe' }, error: null }),
}));

vi.mock('@/modules/crm/companies/lib/companies', () => ({
  listCompanies: vi.fn().mockResolvedValue({
    data: [{ id: 'co1', name: 'Acme Corp' }, { id: 'co2', name: 'Globex' }],
    total: 2,
  }),
}));

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

describe('ContactFormModal', () => {
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
    (updateContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'ct1', name: 'Janet Doe' },
      error: null,
    });
  });

  it('renders a status select with the four contact status values', async () => {
    renderWithProviders(
      <ContactFormModal open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />,
    );

    const statusSelect = await screen.findByTestId('contact-status-select');
    const optionValues = Array.from(statusSelect.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual(['prospect', 'customer', 'cold', 'churned']);
  });

  it('edit mode: prefills from initial, and submitting a changed name calls updateContact with the id', async () => {
    const onSaved = vi.fn();
    const initial = {
      id: 'ct1',
      name: 'Jane Doe',
      email: 'jane@acme.com',
      phone: '555-1234',
      title: 'Head of Product',
      company_id: 'co1',
      status: 'customer' as const,
    };

    renderWithProviders(
      <ContactFormModal open mode="edit" initial={initial} onClose={vi.fn()} onSaved={onSaved} />,
    );

    await screen.findByText('Acme Corp');

    const firstNameInput = screen.getByPlaceholderText('First name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('Jane');

    fireEvent.change(firstNameInput, { target: { value: 'Janet' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(
        'test-token',
        'ct1',
        expect.objectContaining({ name: 'Janet Doe', email: 'jane@acme.com' }),
      );
    });
    expect(createContact).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
