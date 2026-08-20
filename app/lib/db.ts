import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

export const pool = globalForDb.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
});

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key VARCHAR(255) PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
}
