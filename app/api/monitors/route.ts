import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';
import { executeMonitorCheck, MonitorRecord } from '../../lib/checker';
import crypto from 'crypto';

export async function GET() {
  try {
    await ensureTable();

    // Fetch monitors + aggregate statistics (uptime 24h, avg latency, latest check)
    const result = await pool.query(`
      SELECT 
        m.*,
        COALESCE(c.response_ms, 0) as last_response_ms,
        COALESCE(c.status_code, 0) as last_status_code,
        c.error as last_error,
        c.created_at as last_check_time,
        (
          SELECT ROUND((COUNT(CASE WHEN is_up THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1)
          FROM checks 
          WHERE monitor_id = m.id AND created_at >= NOW() - INTERVAL '24 hours'
        ) as uptime_24h,
        (
          SELECT ROUND(AVG(response_ms))
          FROM checks 
          WHERE monitor_id = m.id AND created_at >= NOW() - INTERVAL '24 hours' AND response_ms IS NOT NULL
        ) as avg_response_24h,
        (
          SELECT COUNT(*)
          FROM incidents 
          WHERE monitor_id = m.id AND started_at >= NOW() - INTERVAL '30 days'
        ) as incident_count_30d,
        (
          SELECT COUNT(*)
          FROM checks
          WHERE monitor_id = m.id
        ) as checks_total,
        h.token as heartbeat_token,
        h.last_ping_at as heartbeat_last_ping
      FROM monitors m
      LEFT JOIN LATERAL (
        SELECT response_ms, status_code, error, created_at
        FROM checks
        WHERE monitor_id = m.id
        ORDER BY created_at DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN heartbeats h ON h.monitor_id = m.id
      ORDER BY m.id ASC
    `);

    return NextResponse.json({ monitors: result.rows });
  } catch (err: any) {
    console.error('Monitors GET Error:', err);
    return NextResponse.json({ error: err.message, monitors: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Server-side "Check Now" for all monitors
  if (body?.action === 'check_all') {
    return handleCheckAll();
  }

  try {
    const {
      name,
      type = 'http',
      url,
      method = 'GET',
      keyword,
      keyword_type = 'contains',
      port,
      interval_seconds = 60,
      timeout_ms = 10000,
    } = body;

    if (!url && type !== 'heartbeat') {
      return NextResponse.json({ error: 'URL or Host is required' }, { status: 400 });
    }

    const monitorName = name || (url ? (new URL(url.startsWith('http') ? url : `http://${url}`).hostname) : 'Monitor');

    await ensureTable();

    const insertResult = await pool.query(
      `INSERT INTO monitors (name, type, url, method, keyword, keyword_type, port, interval_seconds, timeout_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
       RETURNING *`,
      [
        monitorName,
        type,
        url || `heartbeat://${monitorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        method.toUpperCase(),
        keyword || null,
        keyword_type || 'contains',
        port ? parseInt(port, 10) : null,
        parseInt(interval_seconds, 10) || 60,
        parseInt(timeout_ms, 10) || 10000,
      ]
    );

    const newMonitor: MonitorRecord = insertResult.rows[0];

    // If heartbeat monitor, generate check-in token
    let heartbeatToken = null;
    if (type === 'heartbeat') {
      heartbeatToken = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `INSERT INTO heartbeats (monitor_id, token, expected_interval_seconds)
         VALUES ($1, $2, $3)`,
        [newMonitor.id, heartbeatToken, parseInt(interval_seconds, 10) || 3600]
      );
    } else {
      // Run initial immediate check
      try {
        await executeMonitorCheck(newMonitor);
      } catch (checkErr) {
        console.warn('Initial check notice:', checkErr);
      }
    }

    return NextResponse.json({
      success: true,
      monitor: { ...newMonitor, heartbeat_token: heartbeatToken },
    });
  } catch (err: any) {
    console.error('Monitors POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handleCheckAll() {
  try {
    await ensureTable();
    const monitorsRes = await pool.query(
      `SELECT * FROM monitors
       WHERE status != 'PAUSED' AND type != 'heartbeat'`
    );

    const monitors: MonitorRecord[] = monitorsRes.rows;
    const results = await Promise.allSettled(
      monitors.map(m => executeMonitorCheck(m).then(r => ({
        id: m.id,
        name: m.name || m.url,
        url: m.url,
        status: r.status,
        isUp: r.isUp,
        responseMs: r.responseMs,
        error: r.error,
      })))
    );

    const summary = results.map(r => (r.status === 'fulfilled' ? r.value : { error: String(r.reason) }));
    return NextResponse.json({ success: true, checked: summary.length, results: summary });
  } catch (err: any) {
    console.error('Monitors check_all Error:', err);
    return NextResponse.json({ error: err.message, success: false }, { status: 500 });
  }
}
