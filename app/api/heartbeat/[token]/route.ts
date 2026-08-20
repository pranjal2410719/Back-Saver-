import { NextResponse } from 'next/server';
import { pool, ensureTable } from '@/app/lib/db';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return handleHeartbeat(await params);
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return handleHeartbeat(await params);
}

async function handleHeartbeat(params: { token: string }) {
  const { token } = params;
  if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 });

  try {
    await ensureTable();

    const hbRes = await pool.query(
      `SELECT h.id, h.monitor_id, m.name 
       FROM heartbeats h
       JOIN monitors m ON m.id = h.monitor_id
       WHERE h.token = $1`,
      [token]
    );

    if (hbRes.rows.length === 0) {
      return NextResponse.json({ error: 'Heartbeat token not found' }, { status: 404 });
    }

    const { id: heartbeatId, monitor_id: monitorId, name } = hbRes.rows[0];

    // Mark heartbeat and monitor UP
    await pool.query(
      `UPDATE heartbeats SET last_ping_at = NOW(), status = 'UP' WHERE id = $1`,
      [heartbeatId]
    );

    await pool.query(
      `UPDATE monitors SET status = 'UP', consecutive_fails = 0, last_checked_at = NOW() WHERE id = $1`,
      [monitorId]
    );

    // Log check
    await pool.query(
      `INSERT INTO checks (monitor_id, status_code, response_ms, is_up, status, error)
       VALUES ($1, 200, 1, true, 'UP', NULL)`,
      [monitorId]
    );

    // Resolve any open incidents
    await pool.query(
      `UPDATE incidents 
       SET resolved_at = NOW(), duration_seconds = ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)))
       WHERE monitor_id = $1 AND resolved_at IS NULL`,
      [monitorId]
    );

    return NextResponse.json({
      success: true,
      message: `Heartbeat received for "${name}"`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Heartbeat Ping Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
