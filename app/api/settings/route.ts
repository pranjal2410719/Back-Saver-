import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET() {
  try {
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'is_monitoring'");
    const isMonitoring = result.rows.length > 0 ? result.rows[0].value : false;
    return NextResponse.json({ isMonitoring });
  } catch (err: any) {
    return NextResponse.json({ isMonitoring: false });
  }
}

export async function POST(request: Request) {
  try {
    const { isMonitoring } = await request.json();
    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ('is_monitoring', $1) 
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(isMonitoring)]
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
