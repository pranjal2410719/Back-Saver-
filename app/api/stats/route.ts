import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'stats_log'");
    const log = result.rows.length > 0 ? result.rows[0].value : [];
    return NextResponse.json({ log });
  } catch (err: any) {
    return NextResponse.json({ log: [] });
  }
}

export async function DELETE() {
  try {
    await pool.query("DELETE FROM app_state WHERE key = 'stats_log'");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
