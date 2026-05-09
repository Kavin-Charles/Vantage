const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const json = await res.json();

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  return json;
}
