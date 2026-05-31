import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      },
    });
    return;
  }

  logger.error(err, 'Unhandled error');

  const isDev = process.env['NODE_ENV'] !== 'production';
  let detail = 'An unexpected error occurred';
  if (isDev) {
    if (err instanceof Error) detail = `${err.constructor.name}: ${err.message}`;
    else if (typeof err === 'object' && err !== null) detail = JSON.stringify(err);
    else detail = String(err);
  }

  res.status(500).json({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: detail },
  });
}
