export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { Pool } = await import('pg');
    
    // Start background worker for Node.js environments (like npm run dev)
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const TIMEOUT_MS = 10000;
    const LOG_LIMIT = 500;

    async function probe(url: string) {
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
        clearTimeout(timeout);
        return { code: res.status, ok: res.ok, responseMs: Date.now() - t0, aborted: false };
      } catch (e: any) {
        clearTimeout(timeout);
        const isAbort = e.name === 'AbortError' || e.message?.includes('aborted');
        return { code: null, ok: false, responseMs: Date.now() - t0, aborted: isAbort, error: isAbort ? 'Request timed out' : e.message };
      }
    }

    async function runCron() {
      try {
        const stateRes = await pool.query("SELECT key, value FROM app_state WHERE key IN ('is_monitoring', 'urls', 'stats_log')");
        let isMonitoring = false;
        let urls: string[] = [];
        let log: any[] = [];
        
        for (const row of stateRes.rows) {
          if (row.key === 'is_monitoring') isMonitoring = row.value;
          if (row.key === 'urls') urls = row.value;
          if (row.key === 'stats_log') log = row.value;
        }
        
        if (!isMonitoring || urls.length === 0) return;
        
        const results = [];
        for (const url of urls) {
          const r = await probe(url);
          results.push({
            url, method: 'GET', timestamp: new Date().toISOString(),
            code: r.code, status: r.ok ? 'UP' : r.aborted ? 'TIMEOUT' : 'DOWN',
            responseMs: r.responseMs, ok: r.ok, error: r.error ?? null,
          });
        }
        
        const newLog = [...results, ...log].slice(0, LOG_LIMIT);
        await pool.query(
          `INSERT INTO app_state (key, value) VALUES ('stats_log', $1) 
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [JSON.stringify(newLog)]
        );
      } catch (err) {
        console.error("Background Worker Error:", err);
      }
    }

    // Run every 60 seconds
    setInterval(runCron, 60000);
  }
}
