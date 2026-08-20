import { NextResponse } from 'next/server';
import { pool, ensureTable } from '../../lib/db';

export async function GET() {
  try {
    await ensureTable();
    const result = await pool.query(`
      SELECT c.id, c.monitor_id, c.status_code, c.response_ms, c.is_up, c.status, c.error, c.created_at,
             m.name, m.url, m.type
      FROM checks c
      JOIN monitors m ON m.id = c.monitor_id
      ORDER BY c.created_at DESC
      LIMIT 300
    `);

    const log = result.rows.map(r => ({
      id: r.id,
      monitorId: r.monitor_id,
      name: r.name,
      url: r.url,
      type: r.type,
      code: r.status_code,
      status_code: r.status_code,
      responseMs: r.response_ms,
      response_ms: r.response_ms,
      ok: r.is_up,
      is_up: r.is_up,
      status: r.status,
      error: r.error,
      timestamp: r.created_at,
    }));

    return NextResponse.json({ log });
  } catch (err: any) {
    console.error('Stats GET Error:', err);
    return NextResponse.json({ log: [] });
  }
}

export async function DELETE() {
  try {
    await ensureTable();
    await pool.query('DELETE FROM checks');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Stats DELETE Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}