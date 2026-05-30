'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface MailAccount {
  id: string;
  provider: 'gmail' | 'imap';
  email: string;
  display_name: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
  sync_error: string | null;
  last_synced_at: string | null;
}

interface ImapForm {
  email: string;
  imap_host: string;
  imap_port: string;
  imap_user: string;
  imap_pass: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  use_ssl: boolean;
}

export default function MailSettingsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [showImapForm, setShowImapForm] = useState(false);
  const [imapForm, setImapForm] = useState<ImapForm>({
    email: '', imap_host: '', imap_port: '993', imap_user: '', imap_pass: '',
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', use_ssl: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('connected') === 'gmail') {
      setSuccessMsg('Gmail account connected successfully.');
    }
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(`Gmail connection failed: ${oauthError}`);
    }
  }, [searchParams]);

  useEffect(() => {
    void fetchAccounts();
  }, []);

  async function fetchAccounts() {
    try {
      const json = await apiFetch<{ data: MailAccount[] }>('/api/mail/accounts');
      setAccounts(json.data ?? []);
    } catch {
      setAccounts([]);
    }
  }

  async function connectGmail() {
    try {
      const json = await apiFetch<{ data: { url: string } }>('/api/mail/accounts/gmail/auth-url', {
        method: 'POST',
      });
      window.location.href = json.data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get Gmail auth URL');
    }
  }

  async function connectImap() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/mail/accounts/imap', {
        method: 'POST',
        body: JSON.stringify({
          ...imapForm,
          imap_port: Number(imapForm.imap_port),
          smtp_port: Number(imapForm.smtp_port),
        }),
      });
      setShowImapForm(false);
      setSuccessMsg('Mail account connected.');
      await fetchAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this account? All synced emails will be deleted.')) return;
    try {
      await apiFetch(`/api/mail/accounts/${id}`, { method: 'DELETE' });
      await fetchAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  }

  async function triggerSync(id: string) {
    try {
      await apiFetch(`/api/mail/accounts/${id}/sync`, { method: 'POST' });
      setSuccessMsg('Sync triggered.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger sync');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Mail Accounts</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 24px' }}>
        Connect your Gmail or company mail to view and send emails inside Vantage.
      </p>

      {successMsg && (
        <div style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {successMsg}
        </div>
      )}

      {accounts.map(acc => (
        <div key={acc.id} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px',
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{acc.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {acc.provider === 'gmail' ? 'Gmail' : 'IMAP'} &middot;{' '}
              {acc.sync_status === 'syncing' ? 'Syncing…' :
               acc.sync_status === 'error' ? `Error: ${acc.sync_error}` :
               acc.last_synced_at ? `Synced ${new Date(acc.last_synced_at).toLocaleString()}` : 'Never synced'}
            </div>
          </div>
          <button
            onClick={() => void triggerSync(acc.id)}
            style={{ padding: '6px 12px', fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)' }}
          >
            Sync now
          </button>
          <button
            onClick={() => void disconnect(acc.id)}
            style={{ padding: '6px 12px', fontSize: 12, background: 'var(--red-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--red)' }}
          >
            Disconnect
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => void connectGmail()}
          style={{ padding: '8px 16px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
        >
          Connect Gmail
        </button>
        <button
          onClick={() => setShowImapForm(v => !v)}
          style={{ padding: '8px 16px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
        >
          Connect company mail
        </button>
      </div>

      {showImapForm && (
        <div style={{ marginTop: 20, padding: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Company Mail (IMAP/SMTP)</h3>
          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              ['email', 'Email address', 'full'],
              ['imap_host', 'IMAP host', ''],
              ['imap_port', 'IMAP port', ''],
              ['imap_user', 'IMAP username', ''],
              ['imap_pass', 'IMAP password', ''],
              ['smtp_host', 'SMTP host', ''],
              ['smtp_port', 'SMTP port', ''],
              ['smtp_user', 'SMTP username', ''],
              ['smtp_pass', 'SMTP password', ''],
            ] as [keyof ImapForm, string, string][]).map(([key, label, span]) => (
              <div key={key} style={{ gridColumn: span === 'full' ? '1 / -1' : undefined }}>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  type={key.includes('pass') ? 'password' : 'text'}
                  value={String(imapForm[key])}
                  onChange={e => setImapForm(f => ({ ...f, [key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={imapForm.use_ssl}
              onChange={e => setImapForm(f => ({ ...f, use_ssl: e.target.checked }))}
              id="use-ssl"
            />
            <label htmlFor="use-ssl" style={{ fontSize: 13 }}>Use SSL/TLS</label>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={() => void connectImap()}
              disabled={saving}
              style={{ padding: '8px 16px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
            >
              {saving ? 'Connecting…' : 'Connect'}
            </button>
            <button
              onClick={() => setShowImapForm(false)}
              style={{ padding: '8px 16px', fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
