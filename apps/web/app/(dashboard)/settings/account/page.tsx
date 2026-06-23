'use client';

import { useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { Button } from '@/modules/shared/components/ui/Button';
import { Input, FormField } from '@/modules/shared/components/ui/FormField';

export default function AccountPage() {
  const { user } = useAuth();
  const getToken = useApiToken();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function handleChangePassword() {
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const token = await getToken();
      await apiFetch('/api/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
        token,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch {
      setError('Current password is incorrect.');
    } finally {
      setIsSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
    marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Account</h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text2)' }}>Your login credentials.</p>

      <div style={card}>
        <FormField label="Email">
          <Input value={user.email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
        </FormField>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: -8 }}>Email is your login identity and can&rsquo;t be changed here.</p>
      </div>

      <div style={card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Change password</h3>
        <FormField label="Current password">
          <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        </FormField>
        <FormField label="New password">
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </FormField>
        <FormField label="Confirm new password" error={mismatch ? 'Passwords do not match.' : error ?? undefined}>
          <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
        </FormField>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" onClick={() => void handleChangePassword()} disabled={isSaving || !canSubmit}>
            {isSaving ? 'Updating…' : 'Update password'}
          </Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Password updated</span>}
        </div>
      </div>
    </div>
  );
}
