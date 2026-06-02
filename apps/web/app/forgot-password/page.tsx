'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/modules/shared/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/api/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

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
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Forgot password
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Enter your email and we'll send a reset link.
          </div>
        </div>

        {submitted ? (
          <div>
            <div style={{
              background: 'var(--green-bg)',
              border: '1px solid var(--green)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--green)',
              marginBottom: 16,
            }}>
              If that email is registered, you'll receive a reset link shortly.
            </div>
            <Link href="/login" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

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
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link href="/login" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none', textAlign: 'center' }}>
              ← Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
