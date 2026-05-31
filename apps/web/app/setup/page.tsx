import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: 'Setup — Vantage' };

async function getSetupStatus(): Promise<boolean> {
  const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/setup/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function SetupPage({ searchParams }: PageProps) {
  const configured = await getSetupStatus();
  if (configured) {
    const params = await searchParams;
    const from = params.from ?? '/';
    redirect(`/api/setup/activate?from=${encodeURIComponent(from)}`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 32,
            fontWeight: 400,
            color: 'var(--text)',
            margin: '0 0 8px',
          }}>
            Welcome to Vantage
          </h1>
          <p style={{ color: 'var(--text2)', margin: 0 }}>
            Let's get your instance set up.
          </p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}
