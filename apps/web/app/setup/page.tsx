import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';
import { getSetupStatus } from './status';

export const metadata = { title: 'Setup — Vencore' };

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

function StatusUnavailable() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg, #f7f6f2)', padding: 24, textAlign: 'center',
    }}>
      <div style={{
        background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e4e0d8)',
        borderRadius: 12, padding: '32px 40px', maxWidth: 420,
      }}>
        <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 24, color: 'var(--text, #1a1814)', margin: '0 0 8px' }}>
          Can&apos;t reach the server
        </h1>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--text2, #6b665c)', margin: '0 0 20px' }}>
          The setup status check failed, so setup can&apos;t continue right now. Check that the API is running, then try again.
        </p>
        <a href="/setup" style={{
          display: 'inline-block', fontFamily: 'DM Sans, sans-serif', fontSize: 14,
          color: 'var(--surface, #ffffff)', background: 'var(--text, #1a1814)',
          padding: '8px 20px', borderRadius: 8, textDecoration: 'none',
        }}>
          Retry
        </a>
      </div>
    </div>
  );
}

export default async function SetupPage({ searchParams }: PageProps) {
  const status = await getSetupStatus();

  if (status === 'configured') {
    const params = await searchParams;
    const from = params.from ?? '/';
    redirect(`/api/setup/activate?from=${encodeURIComponent(from)}`);
  }

  // Never show the wizard unless the API confirmed the instance is unconfigured —
  // submitting against a configured instance can only fail with ALREADY_CONFIGURED.
  if (status === 'unreachable') return <StatusUnavailable />;

  return <SetupWizard />;
}
