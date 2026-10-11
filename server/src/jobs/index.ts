import { query, biometricQuery } from '../config/database.js';
import { config } from '../config/index.js';
import cron from 'node-cron';

let jobsStarted = false;

export function startJobs() {
  if (jobsStarted) return;
  if (config.env === 'test') return;
  if (config.env !== 'production' && process.env.ENABLE_JOBS !== 'true') return;

  jobsStarted = true;

  setInterval(async () => {
    try {
      await expireSessions();
    } catch (err) {
      console.error('[job] Session expiry failed:', err);
    }
  }, 60_000);

  setInterval(async () => {
    try {
      await cleanupIdempotencyKeys();
    } catch (err) {
      console.error('[job] Idempotency cleanup failed:', err);
    }
  }, 300_000);

  cron.schedule('0 2 * * 0', async () => {
    try {
      await runEmbeddingHygiene();
    } catch (err) {
      console.error('[job] Embedding hygiene failed:', err);
    }
  });

  // Health monitor: check dependencies and email ops on degrade/recover. Started
  // after a grace period so the AI model reload right after a deploy doesn't
  // trigger a false "AI down" alert.
  setTimeout(() => {
    checkHealthAndAlert().catch((e) => console.error('[health-monitor] first check failed:', e));
    setInterval(() => {
      checkHealthAndAlert().catch((e) => console.error('[health-monitor] check failed:', e));
    }, 120_000);
  }, 180_000);

  console.log('[jobs] Background jobs started (session expiry, idempotency cleanup, embedding hygiene Sunday 2AM, health monitor)');
}

// Tracks the last-known health of each dependency so we only alert on a state
// change (down -> alert once; recovered -> recovery notice), never on every tick.
const depHealth: Record<'main_db' | 'biometric_db' | 'ai_service', boolean> = {
  main_db: true,
  biometric_db: true,
  ai_service: true,
};

async function checkHealthAndAlert() {
  const results: Record<'main_db' | 'biometric_db' | 'ai_service', boolean> = {
    main_db: false,
    biometric_db: false,
    ai_service: false,
  };
  try { await query('SELECT 1'); results.main_db = true; } catch { /* down */ }
  try { await biometricQuery('SELECT 1'); results.biometric_db = true; } catch { /* down */ }
  try {
    const r = await fetch(`${config.ai.serviceUrl}/health`, { signal: AbortSignal.timeout(5000) });
    results.ai_service = r.ok;
  } catch { /* down */ }

  const downed: string[] = [];
  const recovered: string[] = [];
  (Object.keys(results) as (keyof typeof results)[]).forEach((k) => {
    if (!results[k] && depHealth[k]) downed.push(k);
    if (results[k] && !depHealth[k]) recovered.push(k);
    depHealth[k] = results[k];
  });

  if (downed.length || recovered.length) {
    const { emailService } = await import('../services/email.js');
    if (downed.length) {
      console.error('[health-monitor] DEGRADED:', downed.join(', '));
      await emailService
        .sendOpsAlert(`Service degraded: ${downed.join(', ')}`, downed.map((d) => `<strong>${d}</strong> is DOWN`))
        .catch((e) => console.error('[health-monitor] degrade alert failed:', e));
    }
    if (recovered.length) {
      console.log('[health-monitor] RECOVERED:', recovered.join(', '));
      await emailService
        .sendOpsAlert(`Service recovered: ${recovered.join(', ')}`, recovered.map((d) => `<strong>${d}</strong> is back UP`), '#16A34A')
        .catch(() => {});
    }
  }
}

async function expireSessions() {
  const expired = await query(
    `SELECT s.id, s.course_id, s.institution_id FROM attendance_sessions s
     WHERE s.status = 'active' AND s.end_time < NOW()`,
  );

  for (const sess of expired.rows) {
    // Single set-based insert (was an INSERT-per-student N+1): mark every active
    // enrollee who has no attendance row for this session as 'absent'.
    const inserted = await query(
      `INSERT INTO attendance (institution_id, session_id, student_id, status, verification_method, marked_at)
       SELECT $1, $2, e.student_id, 'absent', 'auto', NOW()
       FROM enrollments e
       WHERE e.course_id = $3 AND e.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM attendance a WHERE a.session_id = $2 AND a.student_id = e.student_id
         )
       ON CONFLICT DO NOTHING`,
      [sess.institution_id, sess.id, sess.course_id],
    );

    await query(
      `UPDATE attendance_sessions SET status = 'completed' WHERE id = $1`,
      [sess.id],
    );

    console.log(`[job] Expired session ${sess.id}, ${inserted.rowCount ?? 0} students marked absent`);
  }
}

async function cleanupIdempotencyKeys() {
  try {
    const { store } = await import('../middleware/idempotency.js');
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of store) {
      if (entry.expiresAt < now) {
        store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[job] Cleaned ${cleaned} expired idempotency keys`);
    }
  } catch {
    // idempotency module not loaded — skip
  }
}

async function runEmbeddingHygiene() {
  const MAX_EMBEDDINGS_PER_USER = 5;

  const users = await biometricQuery(
    `SELECT user_id, COUNT(*) as count FROM face_embeddings GROUP BY user_id HAVING COUNT(*) > $1`,
    [MAX_EMBEDDINGS_PER_USER],
  );

  let totalUsers = 0;
  let totalDeleted = 0;

  for (const row of users.rows) {
    const del = await biometricQuery(
      `DELETE FROM face_embeddings WHERE user_id = $1 AND id NOT IN (
        SELECT id FROM face_embeddings WHERE user_id = $1 ORDER BY quality_score DESC NULLS LAST LIMIT $2
      )`,
      [row.user_id, MAX_EMBEDDINGS_PER_USER],
    );
    totalUsers++;
    totalDeleted += del.rowCount ?? 0;
  }

  await biometricQuery(
    `INSERT INTO embedding_hygiene_runs (total_users_processed, total_embeddings_deleted, details)
     VALUES ($1, $2, $3)`,
    [totalUsers, totalDeleted, JSON.stringify({ maxKept: MAX_EMBEDDINGS_PER_USER })],
  );

  console.log(`[job] Embedding hygiene: ${totalUsers} users processed, ${totalDeleted} embeddings deleted`);
}
