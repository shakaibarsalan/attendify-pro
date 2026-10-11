import { createServer } from 'http';
import { config } from './config/index.js';
import { validateConfig } from './config/validate.js';
import { app, metricsData } from './app.js';

const httpServer = createServer(app);

// Critical safety net: an unhandled rejection/exception (e.g. a route handler that
// awaits a query without try/catch and hits a malformed UUID) would otherwise kill
// the Node process — letting a single crafted request take down (and crash-loop)
// the whole API. Log and keep serving; the offending request fails, the server lives.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

try {
  validateConfig();
} catch (err) {
  console.error('Configuration error:', (err as Error).message);
  process.exit(1);
}

let realtimeInitialized = false;
try {
  const { initRealtime } = await import('./realtime/index.js');
  initRealtime(httpServer);
  realtimeInitialized = true;
} catch (err) {
  console.warn('Socket.IO not initialized:', (err as Error).message);
}

try {
  const { startJobs } = await import('./jobs/index.js');
  startJobs();
} catch (err) {
  console.warn('Background jobs not started:', (err as Error).message);
}

httpServer.listen(config.server.port, () => {
  console.log(`Attendify API running on ${config.server.url}`);
  console.log(`Environment: ${config.env}`);
  console.log(`Docs: ${config.server.url}/api-docs`);
  console.log(`Realtime: ${realtimeInitialized ? 'enabled' : 'disabled'}`);
});

// Graceful shutdown — stop accepting new connections, let in-flight requests
// finish, then close DB pools + Redis. Without this, every `docker compose up`
// kills in-flight requests and produces the brief 502s seen on each deploy.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — closing gracefully…`);

  // Force-exit if cleanup hangs so the orchestrator can move on.
  const force = setTimeout(() => {
    console.error('[shutdown] cleanup timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();

  httpServer.close(async () => {
    try {
      const { pool, biometricPool } = await import('./config/database.js');
      await Promise.allSettled([pool.end(), biometricPool.end()]);
    } catch { /* pools may already be closed */ }
    try {
      const { getRedis } = await import('./config/redis.js');
      const redis = getRedis();
      if (redis) await redis.quit().catch(() => {});
    } catch { /* redis optional */ }
    clearTimeout(force);
    console.log('[shutdown] closed cleanly');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { httpServer, metricsData };
export default app;
