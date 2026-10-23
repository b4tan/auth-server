// Rate limiting middleware (token bucket, src/utils/ratelimit/token-bucket.ts).
// Each limit has a name and a key, e.g. the client IP or the email in the body,
// so login attempts are limited per address and per account separately.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { BucketPolicy, ITokenBucket } from '@utils/ratelimit/token-bucket.js';
import logger from '@utils/logging/logger.utils.js';

export type RateLimitKey = (req: Request) => string | undefined;

export const byIp: RateLimitKey = (req) => req.ip;

export const byEmail: RateLimitKey = (req) => {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : undefined;
};

export function createRateLimit(bucket: ITokenBucket) {
  /**
   * Refuses the request with 429 once `key` has used up its bucket. Requests
   * without a key (e.g. no email in the body) are left to validation.
   * If the store is unreachable the request goes through: an outage of the
   * limiter shouldn't take logins down with it.
   */
  return (name: string, policy: BucketPolicy, key: RateLimitKey = byIp): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
      const id = key(req);
      if (!id) return next();

      try {
        const result = await bucket.consume(`ratelimit:${name}:${id}`, policy);
        res.setHeader('RateLimit-Limit', String(policy.capacity));
        res.setHeader('RateLimit-Remaining', String(result.remaining));

        if (!result.allowed) {
          logger.warn('Rate limit exceeded', { requestId: req.requestId, limit: name, path: req.path });
          res.setHeader('Retry-After', String(result.retryAfterSeconds));
          res.status(429).json({
            ok: false,
            message: 'Too many requests. Please try again later.',
            code: 'RATE_LIMITED',
            data: { retryAfterSeconds: result.retryAfterSeconds },
          });
          return;
        }
      } catch (error) {
        logger.error('Rate limiter unavailable, allowing request', error, { requestId: req.requestId, limit: name });
      }
      next();
    };
}
