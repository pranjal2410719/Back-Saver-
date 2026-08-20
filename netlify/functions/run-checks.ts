import { pool, ensureTable } from '../../app/lib/db';
import { executeMonitorCheck, MonitorRecord } from '../../app/lib/checker';

/**
 * Netlify Scheduled Function (Runs 24/7 every 1 minute via Netlify Cron)
 */
export default async function handler() {
  console.log('[Netlify 24x7 Scheduled Function] Starting automated health check sweep...');
  const t0 = Date.now();

  try {
    await ensureTable();

    // 1. Fetch active monitors due for checking
    const dueMonitorsRes = await pool.query(`
      SELECT * FROM monitors
      WHERE status != 'PAUSED'
        AND type != 'heartbeat'
        AND (
          last_checked_at IS NULL 
          OR last_checked_at <= NOW() - (interval_seconds || ' seconds')::interval
        )
      LIMIT 100
    `);

    const monitors: MonitorRecord[] = dueMonitorsRes.rows;
    console.log(`[Netlify Scheduled Function] Found ${monitors.length} monitors due for check.`);

    if (monitors.length > 0) {
      const results = await Promise.allSettled(
        monitors.map(m => executeMonitorCheck(m))
      );
      const successful = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[Netlify Scheduled Function] Checked ${successful}/${monitors.length} monitors successfully.`);
    }

    // 2. Check overdue heartbeats
    const lateHeartbeatsRes = await pool.query(`
      SELECT h.*, m.name as monitor_name, m.status as monitor_status, m.url as monitor_url
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

    const elapsed = Date.now() - t0;
    return new Response(JSON.stringify({
      success: true,
      monitorsChecked: monitors.length,
      lateHeartbeats: lateHeartbeatsRes.rows.length,
      elapsedMs: elapsed,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[Netlify Scheduled Function Error]:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
