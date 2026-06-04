// apps/mobile/lib/logger.ts
export const logger = {
  info:  (...args: unknown[]) => console.log('[vencore]', ...args),
  warn:  (...args: unknown[]) => console.warn('[vencore]', ...args),
  error: (...args: unknown[]) => console.error('[vencore]', ...args),
};
