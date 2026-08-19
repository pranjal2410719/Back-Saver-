import Script from 'next/script'
import fs from 'fs'
import path from 'path'

export default function Home() {
  // Read body.html at build time/request time to render safely
  // Wait, I can just inject the raw string here using code generation!
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: `  <aside class="sidebar" id="sidebar" aria-label="Primary navigation">

    <div class="sidebar-brand">
      <div class="sidebar-logo">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="10" stroke="#c8f169" stroke-width="1.6"/>
          <circle cx="11" cy="11" r="3.5" fill="#c8f169"/>
        </svg>
        <span class="sidebar-wordmark">BackSaver</span>
      </div>
      <div class="sidebar-status-pill" id="sidebar-status-pill">
        <span class="sidebar-status-dot" id="sidebar-status-dot"></span>
        <span class="sidebar-status-label" id="sidebar-status-label">IDLE</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button class="nav-item is-active" data-page="overview" aria-current="page">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        Overview
      </button>

      <button class="nav-item" data-page="urls">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.535 3.535 0 0 0-5-5L7.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.535 3.535 0 0 0 5 5l1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        Manage URLs
        <span class="nav-badge" id="nav-url-count">0</span>
      </button>

      <button class="nav-item" data-page="monitors">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <polyline points="1,11 4.5,6.5 7.5,9 10.5,4 13.5,7.5 15,5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Live Monitors
        <span class="nav-badge nav-badge--live" id="nav-live-badge" style="display:none">LIVE</span>
      </button>

      <button class="nav-item" data-page="log">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="3" y1="12" x2="9"  y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        Check Log
        <span class="nav-badge" id="nav-log-count">0</span>
      </button>

      <button class="nav-item" data-page="settings">
        <svg class="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        Settings
      </button>
    </nav>

    <div class="sidebar-footer">
      <p class="sidebar-footer-name">BackSaver</p>
      <p class="sidebar-footer-ver">v3.0 · URL Health Monitor</p>
    </div>
    <div class="sidebar-copyright">
      <p class="sidebar-copyright-name">&copy; <span id="sidebar-year"></span> Pranjal Yadav</p>
      <p class="sidebar-copyright-line">Developer & Owner</p>
    </div>
  </aside>

  <!-- Blur overlay (mobile only) -->
  <div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>

  <!-- ═══════════════════════════════════════════
       MOBILE TOP BAR
  ═══════════════════════════════════════════ -->
  <header class="topbar" id="topbar" aria-label="Mobile navigation">
    <div class="topbar-brand">
      <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="10" stroke="#c8f169" stroke-width="1.6"/>
        <circle cx="11" cy="11" r="3.5" fill="#c8f169"/>
      </svg>
      <span class="topbar-wordmark">BackSaver</span>
    </div>
    <button class="hamburger" id="hamburger" aria-label="Open navigation" aria-expanded="false">
      <span class="hamburger-bar"></span>
      <span class="hamburger-bar"></span>
      <span class="hamburger-bar"></span>
    </button>
  </header>

  <!-- ═══════════════════════════════════════════
       MAIN CONTENT — 5 routed pages
  ═══════════════════════════════════════════ -->
  <main class="main">

    <!-- ─────────────── PAGE: OVERVIEW ─────────────── -->
    <section class="page is-active" id="page-overview">
      <div class="page-body">

        <header class="page-header">
          <span class="eyebrow">Dashboard</span>
          <h1 class="page-title">URL Health<br>Overview</h1>
          <p class="page-sub">Your backend endpoints, at a glance. All stats update live.</p>
        </header>

        <!-- 4 global stat cards -->
        <div class="stat-grid">
          <div class="stat-forest">
            <span class="stat-forest-label">Total Checks</span>
            <span class="stat-forest-value" id="ov-total">0</span>
          </div>
          <div class="stat-forest">
            <span class="stat-forest-label">Overall Uptime</span>
            <span class="stat-forest-value" id="ov-uptime">—</span>
          </div>
          <div class="stat-forest">
            <span class="stat-forest-label">Avg Response</span>
            <span class="stat-forest-value" id="ov-avg">—</span>
          </div>
          <div class="stat-forest">
            <span class="stat-forest-label">URLs Tracked</span>
            <span class="stat-forest-value" id="ov-url-count">0</span>
          </div>
        </div>

        <!-- Two-col: endpoint list + recent activity -->
        <div class="ov-cols">
          <!-- Endpoint quick-status -->
          <div class="card">
            <div class="card-row">
              <span class="eyebrow" style="font-size:11px">Endpoints</span>
              <button class="btn-sm" id="ov-btn-start">Start Monitoring</button>
            </div>
            <div id="ov-endpoint-list">
              <div class="inline-empty" id="ov-endpoint-empty">
                <p>No URLs saved yet.</p>
                <button class="link-btn" data-page="urls">Add your first URL →</button>
              </div>
            </div>
          </div>

          <!-- Recent activity -->
          <div class="card">
            <div class="card-row">
              <span class="eyebrow" style="font-size:11px">Recent Activity</span>
              <span class="tag-pill" id="ov-log-count">0 entries</span>
            </div>
            <div id="ov-recent-log">
              <div class="inline-empty">
                <p>No checks yet. Start monitoring to see activity.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- ─────────────── PAGE: MANAGE URLs ─────────────── -->
    <section class="page" id="page-urls">
      <div class="page-body">

        <header class="page-header">
          <span class="eyebrow">Management</span>
          <h1 class="page-title">Target URLs</h1>
          <p class="page-sub">Add and manage the endpoints you want BackSaver to track independently.</p>
        </header>

        <!-- Add URL card -->
        <div class="card">
          <span class="card-label">Add a URL</span>
          <div class="add-row">
            <input
              id="url-input"
              class="url-input"
              type="url"
              placeholder="https://api.yourbackend.com/health"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="btn-primary" id="btn-add-url">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              Add URL
            </button>
          </div>
          <p class="hint">Press <kbd>Enter</kbd> or click <strong>Add URL</strong> — each endpoint is tracked independently with its own stats</p>
        </div>

        <!-- Saved URL list -->
        <div>
          <div class="sub-header">
            <span class="eyebrow" style="font-size:11px">Saved URLs</span>
            <span class="tag-pill" id="url-list-count">0 URLs</span>
          </div>
          <div id="url-list-container">
            <div class="empty-card" id="url-list-empty">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true" style="opacity:.2">
                <circle cx="18" cy="18" r="16" stroke="#043f2e" stroke-width="1.4"/>
                <path d="M12 18 Q14.5 13 18 12 Q21.5 11 24 18" stroke="#043f2e" stroke-width="1.4" fill="none"/>
              </svg>
              <p>No URLs yet. Enter one above and click <strong>Add URL</strong>.</p>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- ─────────────── PAGE: LIVE MONITORS ─────────────── -->
    <section class="page" id="page-monitors">
      <div class="page-body">

        <header class="page-header">
          <span class="eyebrow">Live</span>
          <h1 class="page-title">Active<br>Monitors</h1>
          <div class="header-actions">
            <button class="btn-primary" id="mon-btn-start">Start Monitoring</button>
            <button class="btn-ghost" id="mon-btn-check-now">Check Now</button>
          </div>
        </header>

        <div id="monitor-wrap">
          <div class="empty-card" id="monitor-empty">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true" style="opacity:.2;margin-bottom:4px">
              <polyline points="2,32 11,19 19,25 27,12 35,20 42,15" stroke="#043f2e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <p style="font-size:16px;color:#043f2e;opacity:.45">No active monitors.</p>
            <p style="font-size:13px;color:#043f2e;opacity:.3">Add URLs on the Manage URLs page, then click Start Monitoring.</p>
          </div>
          <div class="monitor-grid" id="monitor-cards-grid"></div>
        </div>

      </div>
    </section>

    <!-- ─────────────── PAGE: CHECK LOG ─────────────── -->
    <section class="page" id="page-log">
      <div class="page-body">

        <header class="page-header">
          <span class="eyebrow">Activity</span>
          <h1 class="page-title">Check Log</h1>
          <div class="header-actions">
            <span class="tag-pill" id="log-count-badge">0 entries</span>
            <button class="btn-ghost" id="btn-clear-log">Clear Log</button>
          </div>
        </header>

        <div class="log-wrap">
          <div class="empty-card" id="log-empty">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" style="opacity:.2;margin-bottom:4px">
              <line x1="6" y1="8"  x2="26" y2="8"  stroke="#043f2e" stroke-width="1.4" stroke-linecap="round"/>
              <line x1="6" y1="15" x2="26" y2="15" stroke="#043f2e" stroke-width="1.4" stroke-linecap="round"/>
              <line x1="6" y1="22" x2="16" y2="22" stroke="#043f2e" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <p>No checks yet. Start monitoring or run a manual check.</p>
          </div>
          <div id="log-list"></div>
        </div>

      </div>
    </section>

    <!-- ─────────────── PAGE: SETTINGS ─────────────── -->
    <section class="page" id="page-settings">
      <div class="page-body">

        <header class="page-header">
          <span class="eyebrow">Configuration</span>
          <h1 class="page-title">Settings</h1>
          <p class="page-sub">Configure how BackSaver monitors your endpoints.</p>
        </header>

        <div class="settings-grid">

          <!-- Monitoring control -->
          <div class="card">
            <span class="card-label">Monitoring Control</span>
            <div class="settings-control">
              <div>
                <p class="settings-ctrl-title" id="set-ctrl-title">Not monitoring</p>
                <p class="settings-ctrl-desc" id="set-ctrl-desc">Start to begin pinging all saved URLs.</p>
              </div>
              <button class="btn-primary" id="set-btn-start">Start Monitoring</button>
            </div>
            <div class="settings-actions">
              <button class="btn-ghost" id="set-btn-check-now">Check Now</button>
            </div>
          </div>

          <!-- Interval -->
          <div class="card">
            <span class="card-label">Check Interval</span>
            <p class="settings-field-hint">How often BackSaver pings each URL.</p>
            <div class="interval-grid">
              <button class="interval-btn" data-ms="15000">15 sec</button>
              <button class="interval-btn" data-ms="45000">45 sec</button>
              <button class="interval-btn is-selected" data-ms="60000">1 min</button>
              <button class="interval-btn" data-ms="300000">5 min</button>
              <button class="interval-btn" data-ms="600000">10 min</button>
              <button class="interval-btn" data-ms="900000">15 min</button>
            </div>
          </div>

          <!-- HTTP Method -->
          <div class="card">
            <span class="card-label">HTTP Method</span>
            <p class="settings-field-hint">Request verb used for every health check.</p>
            <div class="method-row">
              <button class="method-btn is-selected" data-method="GET">GET</button>
              <button class="method-btn" data-method="HEAD">HEAD</button>
              <button class="method-btn" data-method="POST">POST</button>
            </div>
          </div>

          <!-- CORS notice -->
          <div class="card card--notice">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:2px" aria-hidden="true">
              <circle cx="9" cy="9" r="8" stroke="#043f2e" stroke-width="1.3"/>
              <path d="M9 5.5v4M9 12.5v.5" stroke="#043f2e" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <div>
              <p class="notice-title">Monitoring Runs on Netlify's Servers</p>
              <p class="notice-text">Saved URLs are stored in Netlify Blobs and checked automatically by a scheduled function (<code>&#42;/1 * * * *</code>) — continuously, even when you're not online. Browser checks below are a live preview and may hit CORS limits (missing <code>Access-Control-Allow-Origin</code> headers).</p>
            </div>
          </div>

        </div>
      </div>
    </section>

  </main>

  <!-- ═══════════════════════════════════════════
       DEVELOPER WELCOME POPUP
  ═══════════════════════════════════════════ -->
  <div class="popup-backdrop" id="popup-backdrop" role="dialog" aria-modal="true" aria-labelledby="popup-title">
    <div class="popup-card">

      <!-- Avatar + accent ring -->
      <div class="popup-avatar-wrap" aria-hidden="true">
        <div class="popup-avatar-ring"></div>
        <div class="popup-avatar">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="16" stroke="#c8f169" stroke-width="1.6"/>
            <circle cx="18" cy="18" r="5.5" fill="#c8f169"/>
          </svg>
        </div>
      </div>

      <div class="popup-eyebrow">👋 Welcome to BackSaver</div>

      <h2 class="popup-title" id="popup-title">Built by<br>Pranjal Yadav</h2>

      <p class="popup-desc">
        BackSaver is an open-source URL health monitor — add your backend endpoints,
        monitor uptime in real time, and catch downtime before your users do.
      </p>

      <div class="popup-tags">
        <span class="popup-tag">URL Monitor</span>
        <span class="popup-tag">Open Source</span>
        <span class="popup-tag">v3.0</span>
      </div>

      <div class="popup-actions">
        <a
          class="popup-btn-github"
          href="https://github.com/pranjal2410719"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Pranjal Yadav's GitHub profile"
        >
          <!-- GitHub mark SVG -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577
              0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729
              1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93
              0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005
              2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22
              0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57
              C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          View GitHub Profile
        </a>
        <button class="popup-btn-close" id="popup-close-btn">
          Get Started →
        </button>
      </div>

      <!-- Copyright line -->
      <p class="popup-copyright">
        &copy; <span id="popup-year"></span> Pranjal Yadav · All rights reserved
      </p>

    </div>
  </div>

  
` }} />
      <Script src="/app.js" strategy="lazyOnload" />
    </>
  )
}
