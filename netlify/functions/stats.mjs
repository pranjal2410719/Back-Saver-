import { getStore } from '@netlify/blobs';

const STORE = 'backsaver';

export default async () => {
  const store = getStore({ name: STORE });
  const latest = (await store.get('latest', { type: 'json' })) || { runAt: null, results: [] };
  const log = (await store.get('log', { type: 'json' })) || [];

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ runAt: latest.runAt, results: latest.results, log }),
  };
};