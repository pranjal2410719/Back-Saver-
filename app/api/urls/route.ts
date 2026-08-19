import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query("SELECT value FROM app_state WHERE key = 'urls'");
    if (result.rows.length > 0) {
      return NextResponse.json({ urls: result.rows[0].value });
    }
    return NextResponse.json({ urls: [] });
  } catch (err: any) {
    console.error('DB GET Error:', err);
    return NextResponse.json({ urls: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { urls } = await request.json();
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
