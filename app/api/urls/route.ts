import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'urls'");
    const urls = result.rows.length > 0 ? result.rows[0].value : [];
    return NextResponse.json({ urls });
  } catch (err: any) {
    console.error('DB GET Error:', err);
    return NextResponse.json({ urls: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { urls } = await request.json();
    if (!Array.isArray(urls)) {
      return NextResponse.json({ error: 'urls must be an array' }, { status: 400 });
    }
    await ensureTable();
    
    await pool.query(
      `INSERT INTO app_state (key, value) VALUES ('urls', $1) 
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(urls)]
    );
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DB POST Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
