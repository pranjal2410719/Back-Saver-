import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { pool: Pool | undefined };

export const pool = globalForDb.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
});

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

let tablesInitialized = false;

export async function ensureTable() {
  if (tablesInitialized) return;

  await pool.query(`
    -- Legacy app state
    CREATE TABLE IF NOT EXISTS app_state (
      key VARCHAR(255) PRIMARY KEY,
      value JSONB NOT NULL
    );

    -- Core Monitors table (UptimeRobot architecture)
    CREATE TABLE IF NOT EXISTS monitors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'http', -- 'http', 'keyword', 'ssl', 'port', 'heartbeat'
      url TEXT NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'GET',
      keyword TEXT,
      keyword_type VARCHAR(20) DEFAULT 'contains', -- 'contains', 'not_contains'
      port INTEGER,
      interval_seconds INTEGER NOT NULL DEFAULT 60,
      timeout_ms INTEGER NOT NULL DEFAULT 10000,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'UP', 'DOWN', 'PAUSED', 'PENDING'
      consecutive_fails INTEGER NOT NULL DEFAULT 0,
      ssl_days_remaining INTEGER,
      ssl_expires_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Time-series check logs
    CREATE TABLE IF NOT EXISTS checks (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
      status_code INTEGER,
      response_ms INTEGER,
      is_up BOOLEAN NOT NULL,
      status VARCHAR(50) NOT NULL, -- 'UP', 'DOWN', 'TIMEOUT', 'KEYWORD_MISMATCH', 'SSL_EXPIRED', 'PORT_CLOSED'
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Incidents tracking (Downtime tracking & root cause)
    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      cause TEXT
    );

    -- Heartbeat tokens for cron jobs & background workers
    CREATE TABLE IF NOT EXISTS heartbeats (
      id SERIAL PRIMARY KEY,
      monitor_id INTEGER REFERENCES monitors(id) ON DELETE CASCADE,
      token VARCHAR(100) UNIQUE NOT NULL,
      expected_interval_seconds INTEGER NOT NULL DEFAULT 3600,
      grace_seconds INTEGER NOT NULL DEFAULT 300,
      last_ping_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    );

    CREATE INDEX IF NOT EXISTS idx_checks_monitor_created ON checks (monitor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents (monitor_id, started_at DESC);
  `);

  // Auto-migrate legacy URLs from app_state if monitors table is empty
  try {
    const monitorCount = await pool.query('SELECT COUNT(*) FROM monitors');
    if (parseInt(monitorCount.rows[0].count, 10) === 0) {
      const legacyUrls = await pool.query("SELECT value FROM app_state WHERE key = 'urls'");
      if (legacyUrls.rows.length > 0 && Array.isArray(legacyUrls.rows[0].value)) {
        for (const url of legacyUrls.rows[0].value) {
          if (typeof url === 'string' && url.trim()) {
            let name = url;
            try { name = new URL(url).hostname; } catch {}
            await pool.query(
              `INSERT INTO monitors (name, type, url, method, interval_seconds, status)
               VALUES ($1, 'http', $2, 'GET', 60, 'PENDING')`,
              [name, url.trim()]
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn('Migration warning:', err);
  }

  tablesInitialized = true;
}
