import { redirect } from 'next/navigation';
import { SetupWizard } from './SetupWizard';
import { getSetupStatus } from './status';

export const metadata = { title: 'Setup — Vencore' };

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
