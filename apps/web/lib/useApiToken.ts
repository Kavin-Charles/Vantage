'use client';

// Auth is now cookie-based (vantage_token httpOnly cookie).
// No bearer token needed — return empty string for API calls.
export function useApiToken() {
  return async () => '';
}
