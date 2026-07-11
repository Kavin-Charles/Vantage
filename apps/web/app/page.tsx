import { redirect } from 'next/navigation';
import { getSetupStatus } from './setup/status';

export default async function Home() {
  const status = await getSetupStatus();
  if (status === 'configured') redirect('/dashboard');
  redirect('/setup');
}
