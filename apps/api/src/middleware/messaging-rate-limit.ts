import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from './auth';

// Per-user sliding-window rate limiter for messaging send endpoints.
// 30 messages per 60 seconds. In-process only — if you run multiple replicas,
// upgrade to Redis with INCR + EXPIRE.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

const buckets = new Map<string, number[]>();

// Prune stale entries every 5 minutes so the map doesn't grow unbounded.
const prune = () => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, times] of buckets) {
    const fresh = times.filter(t => t > cutoff);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
};
setInterval(prune, 5 * 60_000).unref();

export const messagingSendRateLimit: RequestHandler = (req, res, next) => {
  const { user } = req as unknown as AuthenticatedRequest;
  if (!user) { next(); return; }

  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const key = user.id;
  const times = (buckets.get(key) ?? []).filter(t => t > cutoff);

  if (times.length >= MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((times[0]! + WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      data: null,
      error: { code: 'RATE_LIMITED', message: `Too many messages. Try again in ${retryAfter}s.` },
    });
    return;
  }

  times.push(now);
  buckets.set(key, times);
  next();
};
