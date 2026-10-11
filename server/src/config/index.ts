import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  server: {
    port: parseInt(process.env.SERVER_PORT || '5000', 10),
    url: process.env.SERVER_URL || 'http://localhost:5000',
    isDev: (process.env.NODE_ENV || 'development') === 'development',
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'attendify',
    user: process.env.DB_USER || 'attendify_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  },
  biometricDb: {
    host: process.env.BIOMETRIC_DB_HOST || 'localhost',
    port: parseInt(process.env.BIOMETRIC_DB_PORT || '5433', 10),
    name: process.env.BIOMETRIC_DB_NAME || 'attendify_biometric',
    user: process.env.BIOMETRIC_DB_USER || 'biometric_user',
    password: process.env.BIOMETRIC_DB_PASSWORD || '',
    ssl: process.env.BIOMETRIC_DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  cors: {
    origins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  },
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.AI_SERVICE_API_KEY || '',
  },
  publicApi: {
    enabled: process.env.PUBLIC_API_ENABLED === 'true',
    rateLimit: parseInt(process.env.PUBLIC_API_RATE_LIMIT || '100', 10),
  },
  docs: {
    // The FULL Swagger (/api-docs) exposes the entire internal API surface — it
    // must NOT be public in production. It is served only in dev, or when
    // ENABLE_API_DOCS=true (e.g. a staging box behind auth). The curated
    // /api/integration-docs (Public API + Webhooks only) is always public.
    enableFullDocs: process.env.ENABLE_API_DOCS === 'true',
  },
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
  },
  qr: {
    rotationIntervalS: parseInt(process.env.QR_ROTATION_INTERVAL_S || '15', 10),
  },
  idempotency: {
    ttlS: parseInt(process.env.IDEMPOTENCY_TTL_S || '60', 10),
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },
  demo: {
    // Scheduling link sent in the "book a demo" email (Calendly). Override per
    // environment with DEMO_SCHEDULING_URL.
    schedulingUrl: process.env.DEMO_SCHEDULING_URL || 'https://calendly.com/shakaibarsalan6553/attendify-demo',
  },
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
} as const;
