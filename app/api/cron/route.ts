import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';
import { executeMonitorCheck, MonitorRecord } from '../../lib/checker';

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    await ensureTable();

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

    if (monitors.length > 0) {
      await Promise.allSettled(monitors.map(m => executeMonitorCheck(m)));
    }

    return NextResponse.json({
      success: true,
      monitorsChecked: monitors.length,
      elapsedMs: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Cron API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
