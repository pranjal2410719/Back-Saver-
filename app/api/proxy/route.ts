import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url, method } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const t0 = Date.now();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);

    try {
      const res = await fetch(url, { method: method || 'GET', signal: ctrl.signal });
      clearTimeout(timeout);
      
      return NextResponse.json({
        url,
        method,
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
        method,
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
