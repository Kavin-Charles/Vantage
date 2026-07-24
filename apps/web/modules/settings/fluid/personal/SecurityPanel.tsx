'use client';

import { useState } from 'react';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader, FluidInput, FluidButton, FluidBadge, MSIcon } from '@/modules/shared/fluid/ui';

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--fl-on-surface-variant)',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: '0 0 4px',
  fontFamily: 'var(--fl-font-display)',
  fontWeight: 600,
  fontSize: 20,
  color: 'var(--fl-on-surface)',
};

const SECTION_SUBTITLE_STYLE: React.CSSProperties = {
  margin: '0 0 20px',
  fontFamily: 'var(--fl-font-body)',
  fontSize: 13,
  color: 'var(--fl-on-surface-variant)',
};

interface EnrollData {
  secret: string;
  otpauth_uri: string;
}

/**
 * Personal "Security" settings panel — registered into the Foundation
 * settings registry (personal scope). Takes no props; mounted directly by
 * apps/web/app/(fluid)/settings/security/page.tsx.
 *
 * Two independent sections:
 *  - Change password (PATCH /api/me/password)
 *  - TOTP 2FA enroll/verify/disable (POST /api/me/2fa/*), gated by
 *    user.totp_enabled from GET /api/me.
 *
 * Security notes: the TOTP secret, otpauth URI, and recovery codes only ever
 * live in this component's local state — they are never logged, and are not
 * written to Redux/localStorage. Recovery codes are shown exactly once,
 * immediately after verification, per the API contract (the server does not
 * return them again).
 */
export function SecurityPanel() {
  const { user, isLoading, refetch } = useAuth();
  const getToken = useApiToken();

  return (
    <>
      <PageHeader title="Security" subtitle="Manage your password and two-factor authentication." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <ChangePasswordCard getToken={getToken} />
        {isLoading ? (
          <GlassCard>
            <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Loading…</p>
          </GlassCard>
        ) : !user ? (
          <GlassCard>
            <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>Could not load your security settings.</p>
          </GlassCard>
        ) : (
          <TwoFactorCard enabled={user.totp_enabled ?? false} getToken={getToken} refetch={refetch} />
        )}
      </div>
    </>
  );
}

function ChangePasswordCard({ getToken }: { getToken: () => Promise<string> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && !isSaving;

  async function handleSubmit() {
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <GlassCard>
      <h3 style={SECTION_TITLE_STYLE}>Password</h3>
      <p style={SECTION_SUBTITLE_STYLE}>Change the password you use to sign in.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 420 }}>
        <div>
          <label style={LABEL_STYLE}>Current password</label>
          <FluidInput value={currentPassword} onChange={setCurrentPassword} type="password" icon="lock" placeholder="Current password" />
        </div>
        <div>
          <label style={LABEL_STYLE}>New password</label>
          <FluidInput value={newPassword} onChange={setNewPassword} type="password" icon="key" placeholder="At least 8 characters" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FluidButton onClick={() => void handleSubmit()} disabled={!canSubmit} icon="save">
            {isSaving ? 'Saving…' : 'Change password'}
          </FluidButton>
          {saved ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--fl-font-body)', fontSize: 13, color: 'var(--fl-primary)' }}>
              <MSIcon name="check_circle" size={16} /> Password updated
            </span>
          ) : null}
        </div>
        {error ? <p style={{ margin: 0, fontSize: 12, color: 'var(--fl-error)' }}>{error}</p> : null}
      </div>
    </GlassCard>
  );
}

function TwoFactorCard({
  enabled, getToken, refetch,
}: {
  enabled: boolean;
  getToken: () => Promise<string>;
  refetch: () => Promise<void>;
}) {
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const [copied, setCopied] = useState<'secret' | 'uri' | 'codes' | null>(null);

  async function copy(text: string, which: 'secret' | 'uri' | 'codes') {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(prev => (prev === which ? null : prev)), 2000);
  }

  async function handleEnroll() {
    setIsEnrolling(true);
    setEnrollError(null);
    try {
      const token = await getToken();
      const res = await apiFetch<{ data: EnrollData; error: null }>('/api/me/2fa/enroll', {
        method: 'POST',
        body: JSON.stringify({}),
        token,
      });
      setEnrollData(res.data);
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : 'Could not start 2FA enrollment. Please try again.');
    } finally {
      setIsEnrolling(false);
    }
  }

  async function handleVerify() {
    if (!verifyCode.trim()) return;
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const token = await getToken();
      const res = await apiFetch<{ data: { recovery_codes: string[] }; error: null }>('/api/me/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode.trim() }),
        token,
      });
      setRecoveryCodes(res.data.recovery_codes);
      setEnrollData(null);
      setVerifyCode('');
      await refetch();
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'That code did not match. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleDisable() {
    if (!disableCode.trim()) return;
    setIsDisabling(true);
    setDisableError(null);
    try {
      const token = await getToken();
      await apiFetch('/api/me/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: disableCode.trim() }),
        token,
      });
      setDisableCode('');
      setShowDisable(false);
      await refetch();
    } catch (e) {
      setDisableError(e instanceof Error ? e.message : 'That code did not match. Please try again.');
    } finally {
      setIsDisabling(false);
    }
  }

  // Recovery codes are shown exactly once — this card takes over the entire
  // 2FA section until the user acknowledges they've saved the codes, since
  // the API will never return them again after this response.
  if (recoveryCodes) {
    return (
      <GlassCard style={{ border: '1px solid var(--fl-error)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MSIcon name="warning" size={20} style={{ color: 'var(--fl-error)' }} />
          <h3 style={{ ...SECTION_TITLE_STYLE, margin: 0 }}>Save your recovery codes</h3>
        </div>
        <p style={{ ...SECTION_SUBTITLE_STYLE, color: 'var(--fl-error)', fontWeight: 600 }}>
          Two-factor authentication is now enabled. Save these codes somewhere safe now — they will not be shown again.
          Each code can be used once to sign in if you lose access to your authenticator app.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 8,
            padding: 16,
            borderRadius: 'var(--fl-radius-input)',
            background: 'var(--fl-surface-container-lowest)',
            border: '1px solid var(--fl-outline-variant)',
            fontFamily: 'monospace',
            fontSize: 13,
            color: 'var(--fl-on-surface)',
            maxWidth: 420,
          }}
        >
          {recoveryCodes.map(code => (
            <span key={code}>{code}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <FluidButton
            variant="ghost"
            icon={copied === 'codes' ? 'check' : 'content_copy'}
            onClick={() => void copy(recoveryCodes.join('\n'), 'codes')}
          >
            {copied === 'codes' ? 'Copied' : 'Copy codes'}
          </FluidButton>
          <FluidButton onClick={() => setRecoveryCodes(null)} icon="check_circle">
            I&apos;ve saved these codes
          </FluidButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <h3 style={{ ...SECTION_TITLE_STYLE, marginBottom: 0 }}>Two-factor authentication</h3>
        <FluidBadge tone={enabled ? 'green' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</FluidBadge>
      </div>
      <p style={SECTION_SUBTITLE_STYLE}>Require a code from an authenticator app when you sign in.</p>

      {enabled ? (
        <div style={{ maxWidth: 420 }}>
          {!showDisable ? (
            <FluidButton variant="ghost" onClick={() => setShowDisable(true)} icon="lock_open">
              Disable 2FA
            </FluidButton>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={LABEL_STYLE}>Enter a current authenticator code to disable</label>
                <FluidInput value={disableCode} onChange={setDisableCode} icon="pin" placeholder="6-digit code" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <FluidButton
                  variant="ghost"
                  onClick={() => void handleDisable()}
                  disabled={isDisabling || !disableCode.trim()}
                  icon="lock_open"
                >
                  {isDisabling ? 'Disabling…' : 'Confirm disable'}
                </FluidButton>
                <FluidButton
                  variant="ghost"
                  onClick={() => {
                    setShowDisable(false);
                    setDisableCode('');
                    setDisableError(null);
                  }}
                >
                  Cancel
                </FluidButton>
              </div>
              {disableError ? <p style={{ margin: 0, fontSize: 12, color: 'var(--fl-error)' }}>{disableError}</p> : null}
            </div>
          )}
        </div>
      ) : !enrollData ? (
        <div style={{ maxWidth: 420 }}>
          <FluidButton onClick={() => void handleEnroll()} disabled={isEnrolling} icon="shield">
            {isEnrolling ? 'Starting…' : 'Enable 2FA'}
          </FluidButton>
          {enrollError ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--fl-error)' }}>{enrollError}</p> : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fl-on-surface-variant)' }}>
            Add this account to your authenticator app (Google Authenticator, 1Password, Authy, etc.), then enter the
            6-digit code it shows to finish enabling 2FA.
          </p>

          <div>
            <label style={LABEL_STYLE}>Secret key (manual entry)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 'var(--fl-radius-input)',
                  background: 'var(--fl-surface-container-lowest)',
                  border: '1px solid var(--fl-outline-variant)',
                  fontSize: 13,
                  wordBreak: 'break-all',
                  color: 'var(--fl-on-surface)',
                }}
              >
                {enrollData.secret}
              </code>
              <button
                type="button"
                title="Copy secret"
                onClick={() => void copy(enrollData.secret, 'secret')}
                style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: copied === 'secret' ? 'var(--fl-primary)' : 'var(--fl-outline)', padding: 4 }}
              >
                <MSIcon name={copied === 'secret' ? 'check' : 'content_copy'} size={18} />
              </button>
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Setup URI</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 'var(--fl-radius-input)',
                  background: 'var(--fl-surface-container-lowest)',
                  border: '1px solid var(--fl-outline-variant)',
                  fontSize: 12,
                  wordBreak: 'break-all',
                  color: 'var(--fl-on-surface)',
                }}
              >
                {enrollData.otpauth_uri}
              </code>
              <button
                type="button"
                title="Copy setup URI"
                onClick={() => void copy(enrollData.otpauth_uri, 'uri')}
                style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: copied === 'uri' ? 'var(--fl-primary)' : 'var(--fl-outline)', padding: 4 }}
              >
                <MSIcon name={copied === 'uri' ? 'check' : 'content_copy'} size={18} />
              </button>
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Verification code</label>
            <FluidInput value={verifyCode} onChange={setVerifyCode} icon="pin" placeholder="6-digit code" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FluidButton onClick={() => void handleVerify()} disabled={isVerifying || !verifyCode.trim()} icon="verified_user">
              {isVerifying ? 'Verifying…' : 'Verify & enable'}
            </FluidButton>
            <FluidButton
              variant="ghost"
              onClick={() => {
                setEnrollData(null);
                setVerifyCode('');
                setVerifyError(null);
              }}
            >
              Cancel
            </FluidButton>
          </div>
          {verifyError ? <p style={{ margin: 0, fontSize: 12, color: 'var(--fl-error)' }}>{verifyError}</p> : null}
        </div>
      )}
    </GlassCard>
  );
}
