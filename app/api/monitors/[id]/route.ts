import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../../lib/db';
import { executeMonitorCheck, MonitorRecord } from '../../../lib/checker';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const monitorId = parseInt(id, 10);
    if (!monitorId) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    await ensureTable();

    const monitorRes = await pool.query('SELECT * FROM monitors WHERE id = $1', [monitorId]);
    if (monitorRes.rows.length === 0) {
      return NextResponse.json({ error: 'Monitor not found' }, { status: 404 });
    }

    const checksRes = await pool.query(
      `SELECT id, status_code, response_ms, is_up, status, error, created_at
       FROM checks
       WHERE monitor_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [monitorId]
    );

    const incidentsRes = await pool.query(
      `SELECT id, started_at, resolved_at, duration_seconds, cause
       FROM incidents
       WHERE monitor_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [monitorId]
    );

    const heartbeatRes = await pool.query(
      `SELECT token, expected_interval_seconds, grace_seconds, last_ping_at, status
       FROM heartbeats
       WHERE monitor_id = $1`,
      [monitorId]
    );

    return NextResponse.json({
      monitor: monitorRes.rows[0],
      checks: checksRes.rows,
      incidents: incidentsRes.rows,
      heartbeat: heartbeatRes.rows[0] || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const monitorId = parseInt(id, 10);
    if (!monitorId) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    await ensureTable();
    await pool.query('DELETE FROM monitors WHERE id = $1', [monitorId]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const monitorId = parseInt(id, 10);
    if (!monitorId) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const body = await request.json();
    await ensureTable();

    // Toggle pause/resume or update details
    if (body.action === 'toggle_pause') {
      const current = await pool.query('SELECT status FROM monitors WHERE id = $1', [monitorId]);
      if (current.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const newStatus = current.rows[0].status === 'PAUSED' ? 'PENDING' : 'PAUSED';
      await pool.query('UPDATE monitors SET status = $1 WHERE id = $2', [newStatus, monitorId]);
      return NextResponse.json({ success: true, status: newStatus });
    }

    if (body.action === 'check_now') {
      const monitorRes = await pool.query('SELECT * FROM monitors WHERE id = $1', [monitorId]);
      if (monitorRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const monitor: MonitorRecord = monitorRes.rows[0];
      const result = await executeMonitorCheck(monitor);
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
