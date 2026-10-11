import Redis from 'ioredis';
import { config } from './index.js';

let client: Redis | null = null;

/**
 * Returns a shared Redis client, or null if Redis is not configured (e.g. tests,
 * or single-instance deployments without REDIS_URL set). Callers must fall back
 * to in-memory state when this returns null or a Redis call throws.
 */
export function getRedis(): Redis | null {
  if (!config.redis.url || config.env === 'test') return null;

  if (!client) {
    client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    client.on('error', (err) => console.warn('[Redis] connection error:', err.message));
    client.connect().catch((err) => console.warn('[Redis] initial connection failed:', err.message));
  }

  return client;
}
