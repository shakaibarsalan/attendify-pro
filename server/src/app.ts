import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { idempotency } from './middleware/idempotency.js';
import { auditLog } from './middleware/audit.js';
import { authRouter } from './modules/auth/routes.js';
import { userRouter } from './modules/users/routes.js';
import { institutionRouter } from './modules/institutions/routes.js';
import { courseRouter } from './modules/courses/routes.js';
import { enrollmentRouter } from './modules/enrollments/routes.js';
import { sessionRouter } from './modules/sessions/routes.js';
import { attendanceRouter } from './modules/attendance/routes.js';
import { fraudRouter } from './modules/fraud/routes.js';
import { reportRouter } from './modules/reports/routes.js';
import { auditRouter } from './modules/audit/routes.js';
import { publicApiRouter } from './modules/public-api/routes.js';
import { biometricRouter } from './modules/biometric/routes.js';
import { notificationRouter } from './modules/notifications/routes.js';
import { orgRequestRouter } from './modules/org-requests/routes.js';
import { planRouter } from './modules/plans/routes.js';
import { departmentRouter } from './modules/departments/routes.js';
import { apiKeyRouter } from './modules/api-keys/routes.js';
import { webhookRouter } from './modules/webhooks/routes.js';
import { enrollmentRequestRouter } from './modules/enrollment-requests/routes.js';
import { chatRouter } from './modules/chat/routes.js';
import { queryRouter } from './modules/queries/routes.js';
import { setupSwagger } from './modules/public-api/swagger.js';

// The Express app is built here (no HTTP listener, no realtime, no jobs) so it can
// be imported in-process by integration tests (supertest) without booting the
// server or connecting to infrastructure. index.ts wraps this app with the HTTP
// server, realtime, background jobs and lifecycle handlers.
const app = express();

// Trust the nginx reverse proxy so req.ip returns the real client IP
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: config.server.isDev ? false : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", config.ai.serviceUrl, ...config.cors.origins],
    },
  },
  crossOriginEmbedderPolicy: !config.server.isDev,
}));
app.use(compression());
app.use(hpp());
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Device-Fingerprint', 'Idempotency-Key', 'X-Request-Id'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  (req as any).requestId = requestId;
  next();
});

// No request should hang forever. If a handler hasn't responded in 60s (e.g. an
// un-try/catch'd async rejection left the response unsent), return 503 and free the
// connection instead of holding it open. Skips the Socket.IO transport (long-poll).
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  const timer = setTimeout(() => {
    if (!res.headersSent) res.status(503).json({ error: 'Request timed out' });
  }, 60_000);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

if (config.server.isDev) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const userId = (req as any).user?.id || 'anon';
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms [${userId}] [${(req as any).requestId}]`);
    });
    next();
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'attendify-api' });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, string> = {};
  let allOk = true;

  try {
    const { pool } = await import('./config/database.js');
    await pool.query('SELECT 1');
    checks.main_db = 'ok';
  } catch {
    checks.main_db = 'error';
    allOk = false;
  }

  try {
    const { biometricPool } = await import('./config/database.js');
    await biometricPool.query('SELECT 1');
    checks.biometric_db = 'ok';
  } catch {
    checks.biometric_db = 'error';
    allOk = false;
  }

  try {
    const resp = await fetch(`${config.ai.serviceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      checks.ai_service = 'ok';
    } else {
      checks.ai_service = 'error';
      allOk = false;
    }
  } catch {
    checks.ai_service = 'error';
    allOk = false;
  }

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

const metricsData = {
  requestCount: 0,
  errorCount: 0,
  aiLatencies: [] as number[],
};

app.use((_req, res, next) => {
  metricsData.requestCount++;
  res.on('finish', () => {
    if (res.statusCode >= 500) metricsData.errorCount++;
  });
  next();
});

app.get('/health/metrics', (_req, res) => {
  const type = 'text';
  res.type(type);
  const latencies = metricsData.aiLatencies;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0;

  res.send(`# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metricsData.requestCount}

# HELP http_errors_total Total HTTP 5xx errors
# TYPE http_errors_total counter
http_errors_total ${metricsData.errorCount}

# HELP ai_service_latency_ms AI service request latency
# TYPE ai_service_latency_ms summary
ai_service_latency_ms{quantile="0.5"} ${p50}
ai_service_latency_ms{quantile="0.95"} ${p95}
ai_service_latency_ms{quantile="0.99"} ${p99}
ai_service_latency_ms_count ${latencies.length}
`);
});

setupSwagger(app);

app.use(idempotency);
app.use(auditLog);

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/institutions', institutionRouter);
app.use('/api/courses', courseRouter);
app.use('/api/enrollments', enrollmentRouter);
app.use('/api/sessions', sessionRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/fraud', fraudRouter);
app.use('/api/reports', reportRouter);
app.use('/api/audit', auditRouter);
app.use('/api/public', publicApiRouter);
app.use('/api/biometric', biometricRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/org-requests', orgRequestRouter);
app.use('/api/plans', planRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/api-keys', apiKeyRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/enrollment-requests', enrollmentRequestRouter);
app.use('/api/chat', chatRouter);
app.use('/api/queries', queryRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app, metricsData };
export default app;
