'use client';

import { useState, useEffect, useRef } from 'react';
import { DealForm } from './DealForm';
import { StagePill } from './StagePill';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/api';
import { ComposeModal } from '@/components/mail/ComposeModal';
import type { Deal, PipelineStage, StageField } from '@vantage/types';

type StageWithFields = PipelineStage & { fields: StageField[] };

interface Props {
  deal: Deal;
  stages: StageWithFields[];
  stageMap: Record<string, PipelineStage>;
  userMap: Record<string, string>;
  pipelineId: string;
  contactEmail?: string;
  contactId?: string;
  onDone: () => void;
}

interface DealEmailRow {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string;
  sent_at: string;
  is_read: boolean;
  folder: string;
}

function DealEmails({ dealId, contactEmail, contactId }: { dealId: string; contactEmail?: string; contactId?: string }) {
  const [emails, setEmails] = useState<DealEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; email: string; display_name: string | null }[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  function loadEmails() {
    setLoading(true);
    void apiFetch<{ data: DealEmailRow[] }>(`/api/mail/emails?deal_id=${dealId}&per_page=10`)
      .then(j => { if (mountedRef.current) setEmails(j.data ?? []); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }

  useEffect(() => {
    setLoading(true);
    setAccountsLoading(true);
    void apiFetch<{ data: DealEmailRow[] }>(`/api/mail/emails?deal_id=${dealId}&per_page=10`)
      .then(j => { if (mountedRef.current) setEmails(j.data ?? []); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
    void apiFetch<{ data: { id: string; email: string; display_name: string | null }[] }>('/api/mail/accounts')
      .then(j => { if (mountedRef.current) setAccounts(j.data ?? []); })
      .finally(() => { if (mountedRef.current) setAccountsLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: 1.3,
  };

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={sectionLabelStyle}>Emails</span>
        <button
          onClick={() => setShowCompose(true)}
          disabled={accountsLoading || accounts.length === 0}
          style={{
            fontSize: 12, fontWeight: 500, color: 'var(--text2)',
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 10px',
            opacity: accountsLoading || accounts.length === 0 ? 0.5 : 1,
            cursor: accountsLoading || accounts.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          + Send email
        </button>
      </div>

      {loading ? (
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</span>
      ) : emails.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>No emails linked to this deal.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {emails.map(email => {
            const isSent = email.folder === 'sent';
            const date = new Date(email.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div key={email.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 500, color: 'var(--text3)',
                  background: 'var(--surface2)', borderRadius: 4, padding: '1px 6px',
                  flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {isSent ? 'Sent' : 'In'}
                </span>
                <span style={{
                  flex: 1, fontSize: 13, color: 'var(--text)',
                  fontWeight: email.is_read || isSent ? 400 : 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {email.subject ?? '(no subject)'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{date}</span>
              </div>
            );
          })}
        </div>
      )}

      {showCompose && accounts.length > 0 && (
        <ComposeModal
          accounts={accounts}
          dealId={dealId}
          contactId={contactId}
          initialTo={contactEmail}
          onClose={() => setShowCompose(false)}
          onSent={() => {
            setShowCompose(false);
            loadEmails();
          }}
        />
      )}
    </div>
  );
}

function fmtValue(v: number | null | undefined) {
  if (!v) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.3 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

export function DealDetailCard({ deal, stages, stageMap, userMap, pipelineId, contactEmail, contactId, onDone }: Props) {
  const [editing, setEditing] = useState(false);
  const stage = deal.stage_id ? stageMap[deal.stage_id] : undefined;
  const ownerName = deal.owner_id ? (userMap[deal.owner_id] ?? '—') : '—';
  const ownerInitial = ownerName !== '—' ? ownerName[0].toUpperCase() : '?';

  if (editing) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setEditing(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, padding: 0 }}
          >
            <span style={{ transform: 'rotate(90deg)', display: 'inline-flex' }}><Icon name="chevron" size={13} /></span>
            Back
          </button>
        </div>
        <DealForm
          deal={deal}
          pipelineId={pipelineId}
          stages={stages}
          defaultStageId={deal.stage_id ?? stages[0]?.id ?? null}
          onDone={onDone}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 600,
            fontFamily: 'var(--font-display)', letterSpacing: '-0.4px',
            color: 'var(--text)', lineHeight: 1.2,
          }}>
            {deal.name}
          </h2>
          <div style={{ marginTop: 8 }}>
            {stage && <StagePill stage={stage} />}
          </div>
        </div>
        <Button onClick={() => setEditing(true)} style={{ flexShrink: 0, padding: '6px 14px', fontSize: 13 }}>
          Edit
        </Button>
      </div>

      {/* Metrics grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 16,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <Meta label="Value">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text)' }}>
            {fmtValue(deal.value)}
          </span>
        </Meta>
        <Meta label="Probability">
          {deal.probability != null ? `${deal.probability}%` : '—'}
        </Meta>
        <Meta label="Close date">
          {deal.close_date ? new Date(deal.close_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        </Meta>
        <Meta label="Owner">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
            }}>{ownerInitial}</span>
            {ownerName}
          </span>
        </Meta>
      </div>

      {/* Custom field values */}
      {deal.field_values && Object.keys(deal.field_values).length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px',
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.3 }}>
            Stage fields
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.entries(deal.field_values).map(([key, val]) => {
              const v = val ?? '';
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{v || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Emails */}
      <DealEmails dealId={deal.id} contactEmail={contactEmail} contactId={contactId} />

      {/* Created at */}
      {deal.created_at && (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right' }}>
          Created {new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
