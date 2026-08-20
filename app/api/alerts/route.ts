import { NextResponse } from 'next/server';
import { pool } from '../../lib/db';
import { ensureAlertsTable } from '../../lib/alerts';

export async function GET() {
  try {
    await ensureAlertsTable();
    const result = await pool.query('SELECT * FROM alert_channels ORDER BY id ASC');
    return NextResponse.json({ channels: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, channels: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, type, destination } = await request.json();
    if (!name || !destination) {
      return NextResponse.json({ error: 'Name and destination (Webhook URL or Email) are required' }, { status: 400 });
    }

    await ensureAlertsTable();
    const result = await pool.query(
      `INSERT INTO alert_channels (name, type, destination)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, type || 'webhook', destination]
    );

    return NextResponse.json({ success: true, channel: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await ensureAlertsTable();
    await pool.query('DELETE FROM alert_channels WHERE id = $1', [parseInt(id, 10)]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
