'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { useApiToken } from '@/lib/useApiToken';
import { apiFetch } from '@/lib/api';

function fmtCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

interface UsageData {
  contacts: number;
  seats: number;
  servers: number;
  databases: number;
  period_start: string;
  period_end: string;
  estimated_cents: number;
}

interface Invoice {
  id: string;
  amount_due: number;
  status: string;
  created: number;
  hosted_invoice_url: string;
}

const statCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '20px 24px',
};

export default function BillingPage() {
  const getToken = useApiToken();

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['billing-usage'],
    queryFn: async () => apiFetch<{ data: UsageData; error: null }>('/api/billing/usage', { token: await getToken() }),
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: async () => apiFetch<{ data: Invoice[]; error: null }>('/api/billing/invoices', { token: await getToken() }),
  });

  const portalMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: { url: string }; error: null }>('/api/billing/portal', { method: 'POST', token });
      return res;
    },
    onSuccess: (res) => {
      window.open(res.data.url, '_blank');
    },
  });

  const u = usage?.data;
  const invoices: Invoice[] = invoicesData?.data ?? [];

  return (
    <>
      <div style={{ maxWidth: 800 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Billing</h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>
          Current usage and invoices.
        </p>

        {/* Current usage */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Current Period Usage
          </div>
          {usageLoading ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
          ) : u ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Contacts', value: u.contacts },
                  { label: 'Seats', value: u.seats },
                  { label: 'Servers', value: u.servers },
                  { label: 'Databases', value: u.databases },
                ].map(({ label, value }) => (
                  <div key={label} style={statCard}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...statCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                    Period: {fmtDate(u.period_start)} – {fmtDate(u.period_end)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>Estimated charge</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-instrument-serif), serif' }}>
                  {fmtCents(u.estimated_cents)}
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>No usage data.</div>
          )}
        </div>

        {/* Manage billing */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Manage Subscription
          </div>
          <div style={{ ...statCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Stripe Customer Portal</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Update payment method, download invoices, manage subscription.</div>
            </div>
            <Button variant="primary" onClick={() => portalMut.mutate()} disabled={portalMut.isPending}>
              {portalMut.isPending ? 'Opening…' : 'Manage billing →'}
            </Button>
          </div>
        </div>

        {/* Invoice list */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
            Recent Invoices
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {invoicesLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
            ) : invoices.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No invoices yet.</div>
            ) : invoices.map((inv, i) => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px',
                borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtDate(new Date(inv.created * 1000).toISOString())}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, textTransform: 'capitalize' }}>{inv.status}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtCents(inv.amount_due)}</span>
                  {inv.hosted_invoice_url && (
                    <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}>
                      View →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
