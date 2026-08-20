import { pool, ensureTable } from './db';

export interface AlertChannel {
  id: number;
  name: string;
  type: 'discord' | 'slack' | 'webhook' | 'email';
  destination: string; // webhook URL or email address
  is_active: boolean;
  created_at: string;
}

export async function ensureAlertsTable() {
  await ensureTable();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_channels (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'discord', 'slack', 'webhook', 'email'
      destination TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Dispatches alert notifications to all active channels when a monitor changes status (UP -> DOWN or DOWN -> UP).
 */
export async function sendStateChangeAlert(
  monitorName: string,
  monitorUrl: string,
  fromStatus: string,
  toStatus: string,
  reason: string | null = null,
  durationSeconds: number | null = null
) {
  try {
    await ensureAlertsTable();
    const channelsRes = await pool.query('SELECT * FROM alert_channels WHERE is_active = true');
    if (channelsRes.rows.length === 0) return;

    const isDown = toStatus === 'DOWN';
    const title = isDown ? `🚨 [DOWN] Monitor "${monitorName}" is down` : `✅ [RECOVERED] Monitor "${monitorName}" is back UP`;
    const message = isDown
      ? `Monitor **${monitorName}** (${monitorUrl}) is DOWN.\n**Reason:** ${reason || 'Failed health check'}`
      : `Monitor **${monitorName}** (${monitorUrl}) has RECOVERED after ${durationSeconds ? Math.round(durationSeconds / 60) + ' minutes' : 'downtime'}.`;

    const promises = channelsRes.rows.map(async (ch: AlertChannel) => {
      try {
        if (ch.type === 'discord') {
          await fetch(ch.destination, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [
                {
                  title,
                  description: message,
                  color: isDown ? 15158332 : 3066993, // Red or Green
                  fields: [
                    { name: 'Target URL', value: monitorUrl, inline: true },
                    { name: 'Status', value: toStatus, inline: true },
                    { name: 'Timestamp', value: new Date().toUTCString(), inline: false },
                  ],
                  footer: { text: 'BackSaver Uptime Monitor' },
                },
              ],
            }),
          });
        } else if (ch.type === 'slack') {
          await fetch(ch.destination, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `${title}\n${message}`,
            }),
          });
        } else if (ch.type === 'webhook') {
          await fetch(ch.destination, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: isDown ? 'monitor_down' : 'monitor_recovered',
              monitor: { name: monitorName, url: monitorUrl },
              fromStatus,
              toStatus,
              reason,
              durationSeconds,
              timestamp: new Date().toISOString(),
            }),
          });
        } else if (ch.type === 'email' && process.env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'BackSaver Alerts <alerts@backsaver.dev>',
              to: [ch.destination],
              subject: title,
              text: message,
            }),
          });
        }
      } catch (err) {
        console.error(`Failed to send alert to channel ${ch.name} (${ch.type}):`, err);
      }
    });

    await Promise.allSettled(promises);
  } catch (err) {
    console.error('Error dispatching state change alerts:', err);
  }
}
