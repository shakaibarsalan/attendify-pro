import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) {
      store.delete(key);
    }
  }
}, 60_000);

export function idempotency(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key) {
    return next();
  }

  const cached = store.get(key);
  if (cached) {
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);

  let statusCode = 200;
  res.status = function (code: number) {
    statusCode = code;
    return originalStatus(code);
  } as typeof res.status;
  res.json = function (body: unknown) {
    if (statusCode >= 200 && statusCode < 300) {
      store.set(key, {
        status: statusCode,
        body,
        expiresAt: Date.now() + 60_000,
      });
    }
    return originalJson(body);
  } as typeof res.json;

  next();
}

export { store };
