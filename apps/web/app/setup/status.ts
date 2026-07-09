export function serverApiUrl(): string {
  return process.env['API_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}

export async function getSetupStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${serverApiUrl()}/api/setup/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return json.data?.configured === true;
  } catch {
    return false;
  }
}
