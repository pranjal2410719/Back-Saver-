import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query("SELECT key, value FROM app_state WHERE key IN ('is_monitoring', 'settings')");
    let isMonitoring = false;
    let intervalMs = 60000;
    let method = 'GET';

    for (const row of result.rows) {
      if (row.key === 'is_monitoring') isMonitoring = row.value;
      if (row.key === 'settings') {
        if (row.value?.intervalMs) intervalMs = row.value.intervalMs;
        if (row.value?.method) method = row.value.method;
        if (typeof row.value?.isMonitoring === 'boolean') isMonitoring = row.value.isMonitoring;
      }
    }

    return NextResponse.json({ isMonitoring, intervalMs, method });
  } catch (err: any) {
    console.error('Settings GET Error:', err);
    return NextResponse.json({ isMonitoring: false, intervalMs: 60000, method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const isMonitoring = typeof body.isMonitoring === 'boolean' ? body.isMonitoring : undefined;
    const intervalMs = typeof body.intervalMs === 'number' ? body.intervalMs : undefined;
    const method = typeof body.method === 'string' ? body.method : undefined;

    await ensureTable();

    if (isMonitoring !== undefined) {
      await pool.query(
        `INSERT INTO app_state (key, value) VALUES ('is_monitoring', $1) 
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(isMonitoring)]
      );
    }

    const settingsObj = {
      isMonitoring: isMonitoring ?? false,
      intervalMs: intervalMs ?? 60000,
      method: method ?? 'GET',
    };

    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ('settings', $1) 
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(settingsObj)]
    );

    // Re-schedule all monitors at the new global interval (server-side scheduling)
    if (typeof intervalMs === 'number' && intervalMs > 0) {
      await pool.query('UPDATE monitors SET interval_seconds = $1', [Math.round(intervalMs / 1000)]);
    }

    return NextResponse.json({ success: true, settings: settingsObj });
  } catch (err: any) {
    console.error('Settings POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
