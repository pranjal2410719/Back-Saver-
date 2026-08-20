import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'is_monitoring'");
    const isMonitoring = result.rows.length > 0 ? result.rows[0].value : false;
    return NextResponse.json({ isMonitoring });
  } catch (err: any) {
    console.error('Settings GET Error:', err);
    return NextResponse.json({ isMonitoring: false });
  }
}

export async function POST(request: Request) {
  try {
    const { isMonitoring } = await request.json();
    if (typeof isMonitoring !== 'boolean') {
      return NextResponse.json({ error: 'isMonitoring must be a boolean' }, { status: 400 });
    }
    await ensureTable();
    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ('is_monitoring', $1) 
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(isMonitoring)]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Settings POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
