import { Pool, PoolConfig } from 'pg';
import { config } from './index.js';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeout,
  connectionTimeoutMillis: 5000,
} as PoolConfig);

export const biometricPool = new Pool({
  host: config.biometricDb.host,
  port: config.biometricDb.port,
  database: config.biometricDb.name,
  user: config.biometricDb.user,
  password: config.biometricDb.password,
  ssl: config.biometricDb.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: config.db.idleTimeout,
  connectionTimeoutMillis: 5000,
} as PoolConfig);

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.server.isDev) {
    console.log('Executed query', { text, duration: `${duration}ms`, rows: result.rowCount });
  }
  return result;
}

export async function biometricQuery(text: string, params?: unknown[]) {
  return biometricPool.query(text, params);
}

export async function withTransaction<T>(callback: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});
