import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { query } from '../config/database.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    institutionId: string | null;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  let payload: { id: string; email: string; role: string; institutionId: string | null; iat?: number; type?: string };
  try {
    payload = jwt.verify(token, config.jwt.secret) as typeof payload;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (payload.type && payload.type !== 'access') {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Re-read the live user row so a token can't carry a stale role/institution
  // (prevents cross-tenant leakage from an out-of-date token) and so logout /
  // deactivation / role changes take effect immediately.
  try {
    const userRow = await query(
      'SELECT role, institution_id, is_active, last_logout_at FROM users WHERE id = $1',
      [payload.id],
    );
    if (userRow.rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists. Please login again.' });
    }
    const u = userRow.rows[0];
    if (u.is_active === false) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    if (payload.iat && u.last_logout_at) {
      const logoutTs = new Date(u.last_logout_at).getTime() / 1000;
      if (payload.iat < logoutTs) {
        return res.status(401).json({ error: 'Token invalidated. Please login again.' });
      }
    }
    // The DB is the source of truth for role + institution, not the token.
    payload.role = u.role;
    payload.institutionId = u.institution_id;
  } catch {
    // If the DB check fails, fall back to the token's claims (fail open to avoid
    // taking down all authenticated traffic on a transient DB blip).
  }

  req.user = payload;
  next();
}

export function requireRoles(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireTenantAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role === 'system_admin') {
    return next();
  }
  if (!req.user.institutionId) {
    return res.status(403).json({ error: 'No institution assigned' });
  }
  next();
}

export async function injectTenantFilter(req: AuthRequest, _res: Response, next: NextFunction) {
  if (req.user && req.user.role !== 'system_admin' && req.user.institutionId) {
    (req as any).tenantFilter = { institution_id: req.user.institutionId };
  }
  next();
}

export function apiKeyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const keyString = String(apiKey);
  const prefix = keyString.substring(0, 10);
  const keyHash = crypto.createHash('sha256').update(keyString).digest('hex');

  query(
    `SELECT k.id, k.institution_id, k.permissions, k.rate_limit, k.status, k.key_hash,
            i.api_access_enabled
       FROM api_keys k JOIN institutions i ON i.id = k.institution_id
      WHERE k.key_prefix = $1 AND k.status = 'active'`,
    [prefix]
  ).then(result => {
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    const key = result.rows[0];
    if (key.key_hash !== keyHash) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    // API access can be revoked at the organization level (system admin disables
    // it) independently of the key's own status — block immediately if so.
    if (key.api_access_enabled !== true) {
      return res.status(403).json({ error: 'API access is disabled for this organization' });
    }
    delete key.key_hash;
    delete key.api_access_enabled;
    (req as any).apiKey = key;
    req.user = {
      id: key.id,
      email: `api:${key.id}`,
      role: 'api',
      institutionId: key.institution_id,
    };
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [key.id]).catch(() => {});
    next();
  }).catch(() => {
    res.status(500).json({ error: 'Internal server error' });
  });
}
