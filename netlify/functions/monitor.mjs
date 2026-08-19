import { getStore } from '@netlify/blobs';

const STORE = 'backsaver';
const TIMEOUT_MS = 10000;
const LOG_LIMIT = 200;

export const config = { schedule: '*/1 * * * *' };

async function probe(url) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    return {
      code: res.status,
      ok: res.ok,
      responseMs: Date.now() - t0,
      aborted: false,
    };
  } catch (e) {
    return {
      code: null,
      ok: false,
      responseMs: Date.now() - t0,
      aborted: e.name === 'AbortError',
      error: e.name === 'AbortError' ? 'Request timed out after 10s' : e.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async () => {
  const store = getStore({ name: STORE });
  const urls = (await store.get('urls', { type: 'json' })) || [];
  const results = [];

  for (const url of urls) {
    const first = await probe(url);
    let r = first;

    // Cold-start guard: a fast non-2xx/failure is usually a sleeping server
    // (e.g. Render free tier). Retry once before declaring DOWN.
    if (!r.ok && r.responseMs < 5000) {
      r = await probe(url);
    }

    results.push({
      url,
      method: 'GET',
      timestamp: new Date().toISOString(),
      code: r.code,
      status: r.ok ? 'UP' : r.aborted ? 'TIMEOUT' : 'DOWN',
      responseMs: r.responseMs,
      ok: r.ok,
      error: r.error ?? null,
    });
  }

  const prevLog = (await store.get('log', { type: 'json' })) || [];
  const log = [...results, ...prevLog].slice(0, LOG_LIMIT);

  await store.setJSON('latest', { runAt: new Date().toISOString(), results });
  await store.setJSON('log', log);

  return { statusCode: 200, body: JSON.stringify({ ok: true, count: results.length }) };
};