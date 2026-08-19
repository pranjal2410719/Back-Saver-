import { getStore } from '@netlify/blobs';

const STORE = 'backsaver';

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export default async (event) => {
  const store = getStore({ name: STORE });

  if (event.httpMethod === 'GET') {
    const urls = (await store.get('urls', { type: 'json' })) || [];
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ urls }),
    };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const raw = Array.isArray(body.urls) ? body.urls : [];
    const urls = [...new Set(raw.map(normalizeUrl).filter(Boolean))];

    if (body.method === 'POST') {
      const existing = (await store.get('urls', { type: 'json' })) || [];
      const merged = [...new Set([...existing, ...urls])];
      await store.setJSON('urls', merged);
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, urls: merged }),
      };
    }

    await store.setJSON('urls', urls);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, urls }),
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};