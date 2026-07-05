import { redirect } from 'next/navigation';

async function getSetupConfigured(): Promise<boolean> {
  const apiUrl = process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/setup/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}

export default async function Home() {
  const configured = await getSetupConfigured();
  if (!configured) redirect('/setup');
  redirect('/dashboard');
}
