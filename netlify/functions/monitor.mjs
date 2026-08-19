import { getStore } from '@netlify/blobs';

const STORE = 'backsaver';
const TIMEOUT_MS = 10000;
const LOG_LIMIT = 200;

export const config = { schedule: '*/1 * * * *' };

export default async () => {
  const store = getStore({ name: STORE });
  const urls = (await store.get('urls', { type: 'json' })) || [];
  const results = [];

  for (const url of urls) {
    const t0 = Date.now();
    const result = {
      url,
      method: 'GET',
      timestamp: new Date().toISOString(),
      code: null,
      status: 'UNKNOWN',
      responseMs: null,
      ok: false,
      error: null,
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
      clearTimeout(timeout);
      result.responseMs = Date.now() - t0;
      result.code = res.status;
      result.ok = res.ok;
      result.status = res.ok ? 'UP' : 'DOWN';
    } catch (e) {
      if (e.name === 'AbortError') {
        result.status = 'TIMEOUT';
        result.error = 'Request timed out after 10s';
      } else {
        result.status = 'DOWN';
        result.error = e.message;
      }
    }

    results.push(result);
  }

  const prevLog = (await store.get('log', { type: 'json' })) || [];
  const log = [...results, ...prevLog].slice(0, LOG_LIMIT);

  await store.setJSON('latest', { runAt: new Date().toISOString(), results });
  await store.setJSON('log', log);

  return { statusCode: 200, body: JSON.stringify({ ok: true, count: results.length }) };
};