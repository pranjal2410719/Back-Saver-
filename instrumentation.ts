export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { pool, ensureTable } = await import('./app/lib/db');
    const { executeMonitorCheck } = await import('./app/lib/checker');

    async function runWorkerCycle() {
      try {
        await ensureTable();

        // 1. Fetch active monitors due for a check
        const dueMonitorsRes = await pool.query(`
          SELECT * FROM monitors
          WHERE status != 'PAUSED'
            AND type != 'heartbeat'
            AND (
              last_checked_at IS NULL 
              OR last_checked_at <= NOW() - (interval_seconds || ' seconds')::interval
            )
          LIMIT 50
        `);

        if (dueMonitorsRes.rows.length > 0) {
          await Promise.allSettled(
            dueMonitorsRes.rows.map(monitor => executeMonitorCheck(monitor))
          );
        }

        // 2. Evaluate Heartbeat monitors for missed pings
        const lateHeartbeatsRes = await pool.query(`
          SELECT h.*, m.name as monitor_name, m.status as monitor_status
          FROM heartbeats h
          JOIN monitors m ON m.id = h.monitor_id
          WHERE m.status != 'PAUSED'
            AND (
              (h.last_ping_at IS NULL AND h.created_at <= NOW() - ((h.expected_interval_seconds + h.grace_seconds) || ' seconds')::interval)
              OR (h.last_ping_at IS NOT NULL AND h.last_ping_at <= NOW() - ((h.expected_interval_seconds + h.grace_seconds) || ' seconds')::interval)
            )
        `);

        for (const hb of lateHeartbeatsRes.rows) {
          if (hb.monitor_status !== 'DOWN') {
            await pool.query(
              `UPDATE monitors SET status = 'DOWN', consecutive_fails = consecutive_fails + 1, last_checked_at = NOW() WHERE id = $1`,
              [hb.monitor_id]
            );
            await pool.query(
              `UPDATE heartbeats SET status = 'DOWN' WHERE id = $1`,
              [hb.id]
            );
            await pool.query(
              `INSERT INTO checks (monitor_id, status_code, response_ms, is_up, status, error)
               VALUES ($1, NULL, NULL, false, 'HEARTBEAT_LATE', $2)`,
              [hb.monitor_id, `Heartbeat missed expected ping window of ${hb.expected_interval_seconds}s`]
            );
            await pool.query(
              `INSERT INTO incidents (monitor_id, started_at, cause)
               VALUES ($1, NOW(), 'Heartbeat missed interval window')`,
              [hb.monitor_id]
            );
          }
        }
      } catch (err) {
        console.error('BackSaver Background Worker Cycle Error:', err);
      }
    }

    // Run scheduler check cycle every 10 seconds
    setInterval(runWorkerCycle, 10000);
    // Initial run immediately on boot
    runWorkerCycle();
  }
}
