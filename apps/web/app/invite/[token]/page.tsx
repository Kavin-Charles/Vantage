'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface InviteInfo {
  email: string;
  role: string;
  workspaceName: string;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'success'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/accept/${token}`)
      .then(r => r.json())
      .then((res: { data: InviteInfo; error: { code: string } | null }) => {
        if (res.error) {
          setErrorMsg(
            res.error.code === 'EXPIRED'
              ? 'This invite link has expired.'
              : res.error.code === 'ALREADY_ACCEPTED'
              ? 'This invite has already been accepted.'
              : 'Invalid invite link.'
          );
          setStatus('error');
        } else {
          setInfo(res.data);
          setStatus('ready');
        }
      })
      .catch(() => {
        setErrorMsg('Failed to load invite.');
        setStatus('error');
      });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return; }
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/invites/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json() as { error: { code: string } | null };
      if (data.error) { setErrorMsg(data.error.code); setSubmitting(false); return; }
      setStatus('success');
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setErrorMsg('Something went wrong. Try again.');
      setSubmitting(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
  };
  const boxStyle: React.CSSProperties = {
    width: 380, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 32,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 7,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
  };

  if (status === 'loading') return (
    <div style={cardStyle}>
      <div style={{ color: 'var(--text3)', fontSize: 14 }}>Loading…</div>
    </div>
  );

  if (status === 'error') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invalid invite</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>{errorMsg}</div>
      </div>
    </div>
  );

  if (status === 'success') return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Account created!</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Redirecting to sign in…</div>
      </div>
    </div>
  );

  return (
    <div style={cardStyle}>
      <div style={boxStyle}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Join {info?.workspaceName}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            You were invited as <strong>{info?.email}</strong> ({info?.role}).
          </div>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Your name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required placeholder="Full name" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Password</label>
            <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Confirm password</label>
            <input style={inputStyle} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>

          {errorMsg && (
            <div style={{ fontSize: 13, color: 'var(--red)', background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 7 }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--text)', color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginTop: 4 }}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
