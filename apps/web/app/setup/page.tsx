import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: 'Setup — Vencore' };

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
  return <SetupWizard />;
}
