import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();

    const monitorsRes = await pool.query(`
      SELECT 
        m.id, m.name, m.type, m.url, m.status, m.last_checked_at,
        COALESCE(c.response_ms, 0) as last_response_ms,
        (
          SELECT ROUND((COUNT(CASE WHEN is_up THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 2)
          FROM checks 
          WHERE monitor_id = m.id AND created_at >= NOW() - INTERVAL '30 days'
        ) as uptime_30d
      FROM monitors m
      LEFT JOIN LATERAL (
        SELECT response_ms, created_at
        FROM checks
        WHERE monitor_id = m.id
        ORDER BY created_at DESC
        LIMIT 1
      ) c ON true
      WHERE m.status != 'PAUSED'
      ORDER BY m.id ASC
    `);

    const incidentsRes = await pool.query(`
      SELECT i.id, i.monitor_id, m.name as monitor_name, i.started_at, i.resolved_at, i.duration_seconds, i.cause
      FROM incidents i
      JOIN monitors m ON m.id = i.monitor_id
      ORDER BY i.started_at DESC
      LIMIT 10
    `);

    const monitors = monitorsRes.rows;
    const isAllUp = monitors.every(m => m.status === 'UP' || m.status === 'PENDING');
    const systemStatus = monitors.length === 0 ? 'OPERATIONAL' : (isAllUp ? 'OPERATIONAL' : 'DEGRADED');

    return NextResponse.json({
      systemStatus,
      monitors,
      recentIncidents: incidentsRes.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
