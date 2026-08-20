import tls from 'tls';
import net from 'net';
import { pool } from './db';

export interface CheckResult {
  isUp: boolean;
  statusCode: number | null;
  responseMs: number;
  status: 'UP' | 'DOWN' | 'TIMEOUT' | 'KEYWORD_MISMATCH' | 'SSL_EXPIRED' | 'PORT_CLOSED' | 'HEARTBEAT_LATE';
  error: string | null;
  sslDaysRemaining?: number | null;
  sslExpiresAt?: Date | null;
}

export interface MonitorRecord {
  id: number;
  name: string;
  type: 'http' | 'keyword' | 'ssl' | 'port' | 'heartbeat';
  url: string;
  method?: string;
  keyword?: string | null;
  keyword_type?: 'contains' | 'not_contains' | null;
  port?: number | null;
  interval_seconds: number;
  timeout_ms: number;
  status: string;
  consecutive_fails: number;
  ssl_days_remaining?: number | null;
  ssl_expires_at?: string | null;
}

/**
 * 1. HTTP / HTTPS Availability Check
 */
export async function checkHttp(url: string, method = 'GET', timeoutMs = 10000): Promise<CheckResult> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: method.toUpperCase(),
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BackSaver-UptimeRobot/3.5 (+https://github.com/pranjal2410719/Back-Saver-)' },
    });
    clearTimeout(timeout);
    const responseMs = Date.now() - t0;
    const isUp = res.status >= 200 && res.status < 400;

    return {
      isUp,
      statusCode: res.status,
      responseMs,
      status: isUp ? 'UP' : 'DOWN',
      error: isUp ? null : `HTTP Status ${res.status}`,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
    return {
      isUp: false,
      statusCode: null,
      responseMs: Date.now() - t0,
      status: isTimeout ? 'TIMEOUT' : 'DOWN',
      error: isTimeout ? `Request timed out after ${timeoutMs / 1000}s` : (err.message || 'Connection failed'),
    };
  }
}

/**
 * 2. Keyword Check (Checks for expected text or absence of error text)
 */
export async function checkKeyword(
  url: string,
  keyword: string,
  keywordType: 'contains' | 'not_contains' = 'contains',
  timeoutMs = 10000
): Promise<CheckResult> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BackSaver-UptimeRobot/3.5' },
    });
    const text = await res.text();
    clearTimeout(timeout);
    const responseMs = Date.now() - t0;

    if (!res.ok) {
      return {
        isUp: false,
        statusCode: res.status,
        responseMs,
        status: 'DOWN',
        error: `HTTP Status ${res.status}`,
      };
    }

    const hasKeyword = text.includes(keyword);
    const matched = keywordType === 'contains' ? hasKeyword : !hasKeyword;

    return {
      isUp: matched,
      statusCode: res.status,
      responseMs,
      status: matched ? 'UP' : 'KEYWORD_MISMATCH',
      error: matched
        ? null
        : keywordType === 'contains'
        ? `Page did not contain expected keyword: "${keyword}"`
        : `Page contained forbidden keyword: "${keyword}"`,
    };
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
    return {
      isUp: false,
      statusCode: null,
      responseMs: Date.now() - t0,
      status: isTimeout ? 'TIMEOUT' : 'DOWN',
      error: isTimeout ? `Timed out after ${timeoutMs / 1000}s` : err.message,
    };
  }
}

/**
 * 3. SSL Certificate Expiry & Validity Check
 */
export async function checkSsl(urlStr: string, timeoutMs = 10000): Promise<CheckResult> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let hostname = urlStr;
    try {
      if (urlStr.startsWith('http')) {
        hostname = new URL(urlStr).hostname;
      }
    } catch {}

    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const responseMs = Date.now() - t0;
        socket.destroy();

        if (!cert || !cert.valid_to) {
          return resolve({
            isUp: false,
            statusCode: null,
            responseMs,
            status: 'SSL_EXPIRED',
            error: 'No SSL certificate found or invalid certificate',
          });
        }

        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isUp = daysRemaining > 0;

        return resolve({
          isUp,
          statusCode: 200,
          responseMs,
          status: isUp ? 'UP' : 'SSL_EXPIRED',
          error: isUp ? null : `SSL Certificate expired on ${validTo.toISOString().slice(0, 10)}`,
          sslDaysRemaining: daysRemaining,
          sslExpiresAt: validTo,
        });
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        isUp: false,
        statusCode: null,
        responseMs: Date.now() - t0,
        status: 'TIMEOUT',
        error: `SSL handshake timed out after ${timeoutMs / 1000}s`,
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        isUp: false,
        statusCode: null,
        responseMs: Date.now() - t0,
        status: 'DOWN',
        error: `SSL Handshake Error: ${err.message}`,
      });
    });
  });
}

/**
 * 4. TCP / Port Check (PostgreSQL, Redis, SMTP, SSH, etc.)
 */
export async function checkPort(hostOrUrl: string, port = 80, timeoutMs = 10000): Promise<CheckResult> {
  const t0 = Date.now();
  let host = hostOrUrl;
  try {
    if (hostOrUrl.startsWith('http')) {
      host = new URL(hostOrUrl).hostname;
    }
  } catch {}

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const responseMs = Date.now() - t0;
      socket.destroy();
      resolve({
        isUp: true,
        statusCode: 200,
        responseMs,
        status: 'UP',
        error: null,
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        isUp: false,
        statusCode: null,
        responseMs: Date.now() - t0,
        status: 'TIMEOUT',
        error: `Port ${port} connection timed out after ${timeoutMs / 1000}s`,
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        isUp: false,
        statusCode: null,
        responseMs: Date.now() - t0,
        status: 'PORT_CLOSED',
        error: `Port ${port} is unreachable: ${err.message}`,
      });
    });
  });
}

/**
 * 5. Master Monitor Check Runner & Incident Lifecycle Manager
 */
export async function executeMonitorCheck(monitor: MonitorRecord): Promise<CheckResult> {
  let result: CheckResult;

  switch (monitor.type) {
    case 'keyword':
      result = await checkKeyword(
        monitor.url,
        monitor.keyword || '',
        monitor.keyword_type || 'contains',
        monitor.timeout_ms || 10000
      );
      break;

    case 'ssl':
      result = await checkSsl(monitor.url, monitor.timeout_ms || 10000);
      break;

    case 'port':
      result = await checkPort(monitor.url, monitor.port || 80, monitor.timeout_ms || 10000);
      break;

    case 'http':
    default:
      result = await checkHttp(monitor.url, monitor.method || 'GET', monitor.timeout_ms || 10000);
      break;
  }

  // ── Database Logging & Status State Machine ──
  try {
    await pool.query(
      `INSERT INTO checks (monitor_id, status_code, response_ms, is_up, status, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [monitor.id, result.statusCode, result.responseMs, result.isUp, result.status, result.error]
    );

    const prevStatus = monitor.status;
    const newStatus = result.isUp ? 'UP' : 'DOWN';
    const consecutiveFails = result.isUp ? 0 : (monitor.consecutive_fails || 0) + 1;

    // Update monitor row
    await pool.query(
      `UPDATE monitors
       SET status = $1,
           consecutive_fails = $2,
           ssl_days_remaining = COALESCE($3, ssl_days_remaining),
           ssl_expires_at = COALESCE($4, ssl_expires_at),
           last_checked_at = NOW()
       WHERE id = $5`,
      [
        newStatus,
        consecutiveFails,
        result.sslDaysRemaining ?? null,
        result.sslExpiresAt ? result.sslExpiresAt.toISOString() : null,
        monitor.id,
      ]
    );

    // ── Incident Management Engine ──
    if (!result.isUp && prevStatus !== 'DOWN' && consecutiveFails >= 1) {
      // Open new incident
      await pool.query(
        `INSERT INTO incidents (monitor_id, started_at, cause)
         VALUES ($1, NOW(), $2)`,
        [monitor.id, result.error || result.status]
      );
    } else if (result.isUp && prevStatus === 'DOWN') {
      // Resolve ongoing incident
      const openIncident = await pool.query(
        `SELECT id, started_at FROM incidents 
         WHERE monitor_id = $1 AND resolved_at IS NULL 
         ORDER BY started_at DESC LIMIT 1`,
        [monitor.id]
      );
      if (openIncident.rows.length > 0) {
        const inc = openIncident.rows[0];
        const durationSec = Math.round((Date.now() - new Date(inc.started_at).getTime()) / 1000);
        await pool.query(
          `UPDATE incidents 
           SET resolved_at = NOW(), duration_seconds = $1 
           WHERE id = $2`,
          [durationSec, inc.id]
        );
      }
    }
  } catch (dbErr) {
    console.error('Error logging check execution:', dbErr);
  }

  return result;
}
