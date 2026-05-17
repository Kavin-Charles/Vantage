// apps/mobile/lib/logger.ts
export const logger = {
  info:  (...args: unknown[]) => console.log('[vantage]', ...args),
  warn:  (...args: unknown[]) => console.warn('[vantage]', ...args),
  error: (...args: unknown[]) => console.error('[vantage]', ...args),
};
