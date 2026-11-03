import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { EMAIL_RE, stripTrailingSlashes } from '../utils/validation.js';
import { apiRateLimit, apiRateLimitKey } from '../middleware/apiRateLimit.js';
import { errorHandler } from '../middleware/errorHandler.js';

const SECRET = process.env.JWT_SECRET as string;

describe('EMAIL_RE', () => {
  it('accepts ordinary addresses', () => {
    for (const e of ['ali@umt.edu.pk', 'a.b+c@example.co', 'x_1@sub.domain.org']) expect(EMAIL_RE.test(e)).toBe(true);
  });

  it('rejects malformed addresses', () => {
    for (const e of ['a@b', 'a@@b.com', 'a b@c.com', 'a@b..com', '@b.com', 'a@.com', 'a@b.com.']) expect(EMAIL_RE.test(e)).toBe(false);
  });

  it('stays fast on input built to trigger backtracking', () => {
    const evil = '!@!.' + '!.'.repeat(50_000) + ' ';
    const start = performance.now();
    EMAIL_RE.test(evil);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('stripTrailingSlashes', () => {
  it('removes only trailing slashes', () => {
    expect(stripTrailingSlashes('umt.edu.pk///')).toBe('umt.edu.pk');
    expect(stripTrailingSlashes('a/b/')).toBe('a/b');
    expect(stripTrailingSlashes('///')).toBe('');
    expect(stripTrailingSlashes('plain')).toBe('plain');
  });

  it('is linear on long runs of slashes', () => {
    const start = performance.now();
    stripTrailingSlashes('/'.repeat(200_000) + 'x');
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('apiRateLimitKey', () => {
  const req = (headers: Record<string, string> = {}) => ({ headers, ip: '203.0.113.7' }) as unknown as express.Request;

  it('counts a valid access token against the user', () => {
    const token = jwt.sign({ id: 'user-42', role: 'student' }, SECRET);
    expect(apiRateLimitKey(req({ authorization: `Bearer ${token}` }))).toBe('user:user-42');
  });

  it('falls back to the IP for missing or invalid tokens', () => {
    expect(apiRateLimitKey(req())).toBe('ip:203.0.113.7');
    expect(apiRateLimitKey(req({ authorization: 'Bearer not-a-token' }))).toBe('ip:203.0.113.7');
    const forged = jwt.sign({ id: 'user-42' }, 'some-other-secret-that-is-long-enough');
    expect(apiRateLimitKey(req({ authorization: `Bearer ${forged}` }))).toBe('ip:203.0.113.7');
  });
});

describe('apiRateLimit', () => {
  const app = express();
  app.use('/api', apiRateLimit);
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));

  it('lets normal traffic through and returns 429 past the anonymous ceiling', async () => {
    let last = 200;
    for (let i = 0; i < 301; i++) last = (await request(app).get('/api/ping')).status;
    expect(last).toBe(429);
  });

  it('gives each signed-in user their own budget', async () => {
    const token = jwt.sign({ id: 'user-7' }, SECRET);
    const res = await request(app).get('/api/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('errorHandler logging', () => {
  it('passes the request path as data, not as the format string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.get('/boom/:x', () => { throw new Error('x'); });
    app.use(errorHandler);
    return request(app).get('/boom/%25s%25d').then((res) => {
      expect(res.status).toBe(500);
      expect(spy.mock.calls[0]?.[0]).toBe('[error] %s %s -> %s%s:');
      spy.mockRestore();
    });
  });
});
