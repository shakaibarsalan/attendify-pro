import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { query } from '../config/database.js';

const AUDIT_SKIP_PATHS = ['/api/attendance/mark', '/health', '/api-docs'];

export function auditLog(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return next();
  }

  const path = req.path;
  if (AUDIT_SKIP_PATHS.some((p) => path.startsWith(p))) {
    return next();
  }

  if (!path.startsWith('/api/')) {
    return next();
  }

  const authReq = req as AuthRequest;
  const userId = authReq.user?.id || null;
  const institutionId = authReq.user?.institutionId || null;

  const entityMatch = path.match(/\/api\/(\w+)(?:\/([0-9a-f-]+))?/);
  const entityType = entityMatch ? entityMatch[1] : null;
  const rawEntityId = entityMatch ? entityMatch[2] || null : null;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entityId = rawEntityId && UUID_RE.test(rawEntityId) ? rawEntityId : null;

  const body = { ...req.body };
  for (const key of ['password', 'qr_secret', 'faceData', 'frames', 'token', 'qrSecret']) {
    if (key in body) body[key] = '[REDACTED]';
  }

  query(
    `INSERT INTO audit_logs (institution_id, user_id, action, entity_type, entity_id, new_values, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      institutionId,
      userId,
      `${req.method} ${path}`,
      entityType,
      entityId,
      req.method === 'DELETE' ? null : JSON.stringify(body),
      req.ip || req.headers['x-forwarded-for']?.toString() || null,
      req.headers['user-agent'] || null,
    ],
  ).catch((err) => {
    console.error('Audit log failed:', err);
  });

  next();
}
