'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import Link from 'next/link';
import { apiFetch } from '@/modules/shared/lib/api';
import { useConfig } from '@/modules/shared/lib/useConfig';
import { setAuth } from '@/store/auth-slice';
import type { AppDispatch } from '@/store';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { data: config } = useConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{
        data: {
          id: string; name: string; email: string; token: string;
          isAdmin: boolean; permissions: string[]; theme: 'light' | 'dark';
          // Present (and the only field) when the account has 2FA enabled and no
          // valid code was supplied yet — the server withholds the session token.
          totp_required?: boolean;
        };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(
          totpRequired ? { email, password, code } : { email, password },
        ),
      });
      if (res.data.totp_required) {
        // Second factor needed — reveal the code field and wait for the user.
        setTotpRequired(true);
        return;
      }
      dispatch(setAuth({
        token: res.data.token,
        user: {
          id: res.data.id,
          name: res.data.name,
          email: res.data.email,
          isAdmin: res.data.isAdmin,
          permissions: res.data.permissions,
          theme: res.data.theme,
        },
      }));
      const raw = searchParams.get('from') ?? '';
      // Prevent open redirect — only allow same-origin relative paths
      const from = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/crm/pipeline';
      window.location.href = from;
    } catch {
      setError(totpRequired ? 'Invalid two-factor code' : 'Invalid email or password');
    } finally {
      setLoading(false);
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
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          {config?.app.logoUrl && config.app.logoUrl !== '/logo.png' ? (
            <img
              src={config.app.logoUrl}
              alt={config.app.name}
              style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 'var(--radius-md)', marginBottom: 12 }}
            />
          ) : (
            <div style={{
              width: 40, height: 40, background: 'var(--text)',
              borderRadius: 'var(--radius-md)', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
            }}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L2 14h12L8 2z" fill="white" />
              </svg>
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Sign in</div>
          {config?.app.tagline && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{config.app.tagline}</div>
          )}
        </div>

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
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ textAlign: 'right', marginTop: -6 }}>
            <Link href="/forgot-password" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>
              Forgot password?
            </Link>
          </div>

          {totpRequired && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
                Authentication code
              </label>
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.trim())}
                required
                autoFocus
                placeholder="6-digit code or recovery code"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 7,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5 }}>
                Enter the code from your authenticator app, or a one-time recovery code.
              </div>
            </div>
          )}

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
              opacity: loading ? 0.6 : 1, marginTop: 4,
            }}
          >
            {loading ? 'Signing in…' : totpRequired ? 'Verify' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
