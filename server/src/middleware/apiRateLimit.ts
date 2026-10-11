import rateLimit from 'express-rate-limit';
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
