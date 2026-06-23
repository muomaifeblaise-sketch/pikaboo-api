import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB] ${Date.now() - start}ms → ${text.slice(0, 80)}`);
  }
  return res;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
