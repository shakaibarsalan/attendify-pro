import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../config/index.js';
import { AuthRequest } from './auth.js';

/**
 * Per-API-key rate limiting for the public API. Must run after apiKeyAuth so
 * req.apiKey is populated; the limit is the rate_limit value configured for
 * that key (requests per minute), falling back to 100/min if unset.
 */
export const apiKeyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => (req as AuthRequest & { apiKey?: { rate_limit?: number } }).apiKey?.rate_limit || 100,
  keyGenerator: (req) => (req as AuthRequest & { apiKey?: { id?: string } }).apiKey?.id || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for this API key' },
});

// Who a request counts against: the signed-in user when the access token is valid,
// otherwise the client IP. Cached per request because the limiter asks twice.
const keys = new WeakMap<Request, string>();
export function apiRateLimitKey(req: Request): string {
  const cached = keys.get(req);
  if (cached) return cached;
  let key = `ip:${req.ip ?? 'unknown'}`;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwt.secret) as { id?: string };
      if (payload.id) key = `user:${payload.id}`;
    } catch {
      // Invalid or expired token: count it against the IP.
    }
  }
  keys.set(req, key);
  return key;
}

/**
 * A ceiling for every /api route, so no endpoint can be hammered. Signed-in requests
 * are counted per user, so a whole class behind one campus IP doesn't share a
 * budget; anonymous ones per IP. The public API (which also has its per-key limit)
 * gets a higher ceiling for integrations. All three are far above normal use.
 */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => {
    if (req.path.startsWith('/public/')) return 1200;
    return apiRateLimitKey(req).startsWith('user:') ? 600 : 300;
  },
  keyGenerator: (req) => apiRateLimitKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});
