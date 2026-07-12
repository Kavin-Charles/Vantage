export type SetupStatus = 'configured' | 'unconfigured' | 'unreachable';

type EnvLike = Record<string, string | undefined>;

export function resolveApiUrl(env: EnvLike = process.env): string {
  return env['API_URL'] ?? env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}

export async function getSetupStatus(
  fetchFn: typeof fetch = fetch,
  env: EnvLike = process.env,
): Promise<SetupStatus> {
  const apiUrl = resolveApiUrl(env);
  try {
    const res = await fetchFn(`${apiUrl}/api/setup/status`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const json = await res.json();
    return json.data?.configured === true ? 'configured' : 'unconfigured';
  } catch {
    return 'unreachable';
  }
}
