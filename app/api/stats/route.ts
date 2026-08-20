import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'stats_log'");
    const log = result.rows.length > 0 ? result.rows[0].value : [];
    return NextResponse.json({ log });
  } catch (err: any) {
    console.error('Stats GET Error:', err);
    return NextResponse.json({ log: [] });
  }
}

export async function DELETE() {
  try {
    await ensureTable();
    await pool.query("DELETE FROM app_state WHERE key = 'stats_log'");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Stats DELETE Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
