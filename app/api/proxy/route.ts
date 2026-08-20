import { NextResponse } from 'next/server';

const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal'];
const BLOCKED_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.'];

function isBlockedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(hostname)) return true;
    if (BLOCKED_PREFIXES.some(p => hostname.startsWith(p))) return true;
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    return false;
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  try {
    const { url, method } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (isBlockedUrl(url)) {
      return NextResponse.json({ error: 'URL is not allowed' }, { status: 403 });
    }

    const httpMethod = (method || 'GET').toUpperCase();
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);

    try {
      const res = await fetch(url, { method: httpMethod, signal: ctrl.signal });
      clearTimeout(timeout);
      
      return NextResponse.json({
        url,
        method: httpMethod,
        code: res.status,
        ok: res.ok,
        responseMs: Date.now() - t0,
        aborted: false,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      const isAbort = fetchErr.name === 'AbortError' || fetchErr.message?.includes('aborted');
      
      return NextResponse.json({
        url,
        method: httpMethod,
        code: null,
        ok: false,
        responseMs: Date.now() - t0,
        aborted: isAbort,
        error: isAbort ? 'Request timed out after 10s' : fetchErr.message,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
