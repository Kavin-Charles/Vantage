// packages/api-client/src/core.ts
let _baseUrl = '';

/**
 * Call once at app startup before any API calls.
 * Web:    configure(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
 * Mobile: configure(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001')
 */
export function configure(baseUrl: string): void {
  _baseUrl = baseUrl;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${_baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const json = (await res.json()) as { error?: { message?: string } };

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  return json as T;
}
