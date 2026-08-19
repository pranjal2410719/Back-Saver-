# BackSaver

A multi-URL health monitor that checks your endpoints every minute, around the clock — even when you're offline.

## How It Works

- **Persistence:** URLs you add are stored in [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), not the browser — they survive refreshes and redeploys.
- **Scheduled monitoring:** a [scheduled function](https://docs.netlify.com/build/functions/scheduled-functions/) (`netlify/functions/monitor.mjs`) runs every minute, reads your saved URLs, probes each one, and stores the results. No browser, no laptop, no downtime-blind spots.
- **Live dashboard:** the UI polls the stored results every 15 seconds and shows uptime, response times, and check logs.

## Architecture

```
Browser (index.html + app.js)
   │  GET /api/urls          load saved URLs
   │  POST /api/urls         save/remove URLs
   │  GET /api/stats         latest checks + log (polled every 15s)
   ▼
Netlify Functions
   ├── urls.mjs    read/write URL list       → Blob "backsaver/urls"
   ├── stats.mjs   read latest checks + log  → Blob "backsaver/latest", "backsaver/log"
   └── monitor.mjs scheduled (cron */1 * * * *) → probes each URL, writes results
```

## Local Development

The Blob store is emulated by the Netlify CLI:

```bash
npm i -g netlify-cli
netlify dev
```

## Deploy

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import from an existing project → Pick the repo**.
3. Done — the scheduled function registers automatically on first deploy (look for it under **Functions** with a "Scheduled" badge; you can press "Run now" to test).

### Update the schedule

Edit `netlify.toml`:

```toml
[[schedule.functions]]
  schedule = "*/5 * * * *"   # every 5 minutes
  name = "monitor"
```

Then just `git push` — Netlify redeploys automatically.

## Notes

- Each scheduled run allows up to **30 seconds** of execution, so keep timeouts and URL count modest.
- Check results are capped at the most recent **200 entries** in the persisted log.
- The in-browser "Start Monitoring" buttons run a live local preview in addition to the server-side schedule.