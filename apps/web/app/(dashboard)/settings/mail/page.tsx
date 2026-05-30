'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import ConnectAccountModal from '@/components/mail/ConnectAccountModal';

interface MailAccount {
  id: string;
  provider: 'gmail' | 'imap';
  email: string;
  display_name: string | null;
  sync_status: 'idle' | 'syncing' | 'error';
  sync_error: string | null;
  last_synced_at: string | null;
}

export interface WorkspaceImapConfig {
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
}

interface ServerForm {
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  use_ssl: boolean;
}

export default function MailSettingsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceImapConfig | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'member'>('member');
  const [serverForm, setServerForm] = useState<ServerForm>({
    imap_host: '', imap_port: '993', smtp_host: '', smtp_port: '587', use_ssl: true,
  });
  const [showModal, setShowModal] = useState(false);
  const [savingServer, setSavingServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('connected') === 'gmail') setSuccessMsg('Gmail account connected.');
    const oauthError = searchParams.get('error');
    if (oauthError) setError(`Gmail connection failed: ${oauthError}`);
  }, [searchParams]);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    try {
      const [meRes, configRes, accountsRes] = await Promise.all([
        apiFetch<{ data: { user: { role: 'admin' | 'member' } } }>('/api/me').catch(() => null),
        apiFetch<{ data: WorkspaceImapConfig | null }>('/api/mail/workspace-config').catch(() => null),
        apiFetch<{ data: MailAccount[] }>('/api/mail/accounts').catch(() => null),
      ]);
      if (meRes?.data?.user?.role) setUserRole(meRes.data.user.role);
      if (configRes) {
        setWorkspaceConfig(configRes.data);
        if (configRes.data) {
          setServerForm({
            imap_host: configRes.data.imap_host,
            imap_port: String(configRes.data.imap_port),
            smtp_host: configRes.data.smtp_host,
            smtp_port: String(configRes.data.smtp_port),
            use_ssl: configRes.data.use_ssl,
          });
        }
      }
      if (accountsRes) setAccounts(accountsRes.data ?? []);
      if (!meRes && !configRes && !accountsRes) {
        setError('Failed to load mail settings. Please refresh.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load mail settings');
    }
  }

  async function saveServerConfig() {
    setSavingServer(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const saved = await apiFetch<{ data: WorkspaceImapConfig }>('/api/mail/workspace-config', {
        method: 'PUT',
        body: JSON.stringify({
          imap_host: serverForm.imap_host,
          imap_port: Number(serverForm.imap_port),
          smtp_host: serverForm.smtp_host,
          smtp_port: Number(serverForm.smtp_port),
          use_ssl: serverForm.use_ssl,
        }),
      });
      setWorkspaceConfig(saved.data);
      setServerForm({
        imap_host: saved.data.imap_host,
        imap_port: String(saved.data.imap_port),
        smtp_host: saved.data.smtp_host,
        smtp_port: String(saved.data.smtp_port),
        use_ssl: saved.data.use_ssl,
      });
      setSuccessMsg('Server settings saved.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save server settings');
    } finally {
      setSavingServer(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this account? All synced emails will be deleted.')) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/api/mail/accounts/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
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
      {error && (
        <div style={{ background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Admin: workspace IMAP server config */}
      {userRole === 'admin' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>Workspace Mail Server</h3>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 14px' }}>
            Configure your company IMAP/SMTP server once. Team members only need to enter their password.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr 80px', gap: 8, marginBottom: 10 }}>
            {([
              ['imap_host', 'IMAP host', 'imap.company.com'],
              ['imap_port', 'Port', '993'],
              ['smtp_host', 'SMTP host', 'smtp.company.com'],
              ['smtp_port', 'Port', '587'],
            ] as [keyof ServerForm, string, string][]).map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 3 }}>{label}</label>
                <input
                  value={String(serverForm[key])}
                  onChange={e => setServerForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              id="use-ssl"
              checked={serverForm.use_ssl}
              onChange={e => setServerForm(f => ({ ...f, use_ssl: e.target.checked }))}
            />
            <label htmlFor="use-ssl" style={{ fontSize: 13 }}>Use SSL/TLS</label>
          </div>
          <button
            onClick={() => void saveServerConfig()}
            disabled={savingServer}
            style={{ padding: '7px 14px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
          >
            {savingServer ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Account list */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Your accounts</div>
        {accounts.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>No accounts connected yet.</p>
        )}
        {accounts.map(acc => (
          <div key={acc.id} style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px',
            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{acc.email}</div>
              <div style={{
                fontSize: 12, marginTop: 2,
                color: acc.sync_status === 'error' ? 'var(--red)'
                     : acc.sync_status === 'syncing' ? 'var(--amber)'
                     : 'var(--text3)',
              }}>
                {acc.provider === 'gmail' ? 'Gmail' : 'Company mail'} &middot;{' '}
                {acc.sync_status === 'syncing' ? 'Syncing…'
                 : acc.sync_status === 'error' ? `Error: ${acc.sync_error}`
                 : acc.last_synced_at ? `Synced ${new Date(acc.last_synced_at).toLocaleString()}`
                 : 'Not synced yet'}
              </div>
            </div>
            <button
              onClick={() => void disconnect(acc.id)}
              style={{ padding: '5px 12px', fontSize: 12, background: 'var(--red-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--red)' }}
            >
              Disconnect
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowModal(true)}
        style={{ padding: '8px 16px', fontSize: 13, background: 'var(--text)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
      >
        Connect account
      </button>

      {showModal && (
        <ConnectAccountModal
          workspaceConfig={workspaceConfig}
          userRole={userRole}
          onClose={() => setShowModal(false)}
          onConnected={() => { setShowModal(false); void loadAll(); }}
        />
      )}
    </div>
  );
}
