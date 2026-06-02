'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/modules/shared/lib/api';

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--red)', padding: 32, fontSize: 14 }}>
        Invalid or missing reset token.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    try {
      await apiFetch(`/api/auth/reset/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setError('This link has expired or is invalid. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{
        background: 'var(--green-bg)', border: '1px solid var(--green)',
        borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--green)',
      }}>
        Password reset successfully. Redirecting to sign in…
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        Set new password
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
          Confirm password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 7 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '9px 16px', borderRadius: 7, border: 'none',
          background: 'var(--text)', color: '#fff', fontSize: 14,
          fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Resetting…' : 'Reset password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 360,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 32,
      }}>
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
