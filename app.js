/* ============================================================
   BackSaver — app.js  v3.0
   Multi-URL health monitor · sidebar dashboard edition
   ============================================================ */

'use strict';

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

/** Saved URL list (before and after monitoring) */
let savedUrls = [];

/** Global config */
const cfg = {
  intervalMs:    60000,
  method:        'GET',
  isMonitoring:  false,
};

/** Aggregate stats across all URLs */
const gStats = {
  totalChecks:    0,
  successChecks:  0,
  totalResponseMs: 0,
  log:            [],  // newest first
};

/**
 * Per-URL runtime state (active only during monitoring).
 * Map<url, { timerId, countdownId, countdownRemaining,
 *            lastResult, totalChecks, successChecks, totalResponseMs }>
 */
const monitors = new Map();

/**
 * Persisted results from the Netlify scheduled monitor.
 * Map<url, lastResult> — independent of local monitoring sessions.
 */
const lastResults = new Map();

// ════════════════════════════════════════════════════════════
// DOM REFERENCES
// ════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);

// Layout
const sidebar        = $('sidebar');
const sidebarOverlay = $('sidebar-overlay');
const hamburger      = $('hamburger');

// Sidebar dynamic elements
const sidebarStatusDot   = $('sidebar-status-dot');
const sidebarStatusLabel = $('sidebar-status-label');
const navUrlCount        = $('nav-url-count');
const navLiveBadge       = $('nav-live-badge');
const navLogCount        = $('nav-log-count');

// Overview
const ovTotal          = $('ov-total');
const ovUptime         = $('ov-uptime');
const ovAvg            = $('ov-avg');
const ovUrlCount       = $('ov-url-count');
const ovBtnStart       = $('ov-btn-start');
const ovEndpointList   = $('ov-endpoint-list');
const ovEndpointEmpty  = $('ov-endpoint-empty');
const ovRecentLog      = $('ov-recent-log');
const ovLogCount       = $('ov-log-count');

// Manage URLs
const urlInput           = $('url-input');
const btnAddUrl          = $('btn-add-url');
const urlListContainer   = $('url-list-container');
const urlListEmpty       = $('url-list-empty');
const urlListCountBadge  = $('url-list-count');

// Monitors page
const monBtnStart    = $('mon-btn-start');
const monBtnCheckNow = $('mon-btn-check-now');
const monitorGrid    = $('monitor-cards-grid');
const monitorEmpty   = $('monitor-empty');

// Log page
const logList        = $('log-list');
const logEmpty       = $('log-empty');
const logCountBadge  = $('log-count-badge');
const btnClearLog    = $('btn-clear-log');

// Settings
const setBtnStart    = $('set-btn-start');
const setBtnCheckNow = $('set-btn-check-now');
const setCtrlTitle   = $('set-ctrl-title');
const setCtrlDesc    = $('set-ctrl-desc');

// ════════════════════════════════════════════════════════════
// NAVIGATION (sidebar routing)
// ════════════════════════════════════════════════════════════

const navItems = document.querySelectorAll('.nav-item[data-page]');
const pages    = document.querySelectorAll('.page[id^="page-"]');

function navigateTo(pageId) {
  pages.forEach(p => p.classList.remove('is-active'));
  navItems.forEach(n => { n.classList.remove('is-active'); n.removeAttribute('aria-current'); });

  const page = $('page-' + pageId);
  const nav  = document.querySelector(`.nav-item[data-page="${pageId}"]`);

  if (page) page.classList.add('is-active');
  if (nav)  { nav.classList.add('is-active'); nav.setAttribute('aria-current', 'page'); }

  closeMobileSidebar();
}

navItems.forEach(item => {
  item.addEventListener('click', () => { if (item.dataset.page) navigateTo(item.dataset.page); });
});

// Link-buttons inside pages that navigate elsewhere
document.querySelectorAll('.link-btn[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ════════════════════════════════════════════════════════════
// MOBILE SIDEBAR TOGGLE
// ════════════════════════════════════════════════════════════

function openMobileSidebar() {
  sidebar.classList.add('is-open');
  sidebarOverlay.classList.add('is-visible');
  hamburger.classList.add('is-open');
  hamburger.setAttribute('aria-expanded', 'true');
  hamburger.setAttribute('aria-label', 'Close navigation');
}

function closeMobileSidebar() {
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-visible');
  hamburger.classList.remove('is-open');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-label', 'Open navigation');
}

hamburger.addEventListener('click', () => {
  sidebar.classList.contains('is-open') ? closeMobileSidebar() : openMobileSidebar();
});

sidebarOverlay.addEventListener('click', closeMobileSidebar);

// ════════════════════════════════════════════════════════════
// PERSISTED STATE (Netlify Blobs via Functions)
// ════════════════════════════════════════════════════════════

const API_URLS  = '/api/urls';
const API_STATS = '/api/stats';

/** Load saved URLs + last scheduled-check results from Blob storage. */
async function loadServerState() {
  const [urlRes, statRes] = await Promise.allSettled([
    fetch(API_URLS),
    fetch(API_STATS),
  ]);

  if (urlRes.status === 'fulfilled' && urlRes.value.ok) {
    const data = await urlRes.value.json();
    if (Array.isArray(data.urls)) savedUrls = data.urls;
  }

  if (statRes.status === 'fulfilled' && statRes.value.ok) {
    const data = await statRes.value.json();
    if (Array.isArray(data.results) && data.results.length) {
      data.results.forEach(r => {
        r.timestamp = new Date(r.timestamp);
        lastResults.set(r.url, r);
      });
    }
    if (Array.isArray(data.log) && data.log.length) mergeServerLog(data.log);
  }
}

/** Persist the current URL list to Blob storage. */
async function persistUrls() {
  try {
    await fetch(API_URLS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: savedUrls }),
    });
  } catch (e) {
    console.warn('BackSaver: failed to persist URLs', e);
  }
}

/** Merge scheduled-run log entries into the global log without duplicates. */
function mergeServerLog(serverLog) {
  const seen = new Set(gStats.log.map(r => r.url + '|' + r.timestamp.toISOString()));
  const fresh = [];

  for (const r of serverLog) {
    const ts = new Date(r.timestamp);
    const key = r.url + '|' + ts.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...r, timestamp: ts });
  }

  if (fresh.length) {
    gStats.log = fresh.concat(gStats.log).slice(0, 500);
    recomputeStatsFromLog();
  }
}

/** Rebuild aggregate + per-URL stats from gStats.log (avoids double counting). */
function recomputeStatsFromLog() {
  const log = gStats.log;
  gStats.totalChecks    = log.length;
  gStats.successChecks  = log.filter(r => r.ok).length;
  gStats.totalResponseMs = log.reduce((s, r) => s + (r.responseMs || 0), 0);

  const summary = new Map();
  for (const r of log) {
    const s = summary.get(r.url) || { totalChecks: 0, successChecks: 0, totalResponseMs: 0 };
    s.totalChecks++;
    if (r.ok) s.successChecks++;
    if (r.responseMs !== null) s.totalResponseMs += r.responseMs;
    summary.set(r.url, s);
  }

  summary.forEach((s, url) => {
    lastResults.set(url, { ...s, ...log.find(r => r.url === url) });
    const m = monitors.get(url);
    if (m) {
      m.totalChecks = s.totalChecks;
      m.successChecks = s.successChecks;
      m.totalResponseMs = s.totalResponseMs;
      m.lastResult = lastResults.get(url);
      refreshMonitorCard(url, m);
    }
  });
}

/** Poll the scheduled monitor's persisted results every 15s. */
function startServerRefresh() {
  setInterval(async () => {
    try {
      const res = await fetch(API_STATS);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length) {
        data.results.forEach(r => {
          r.timestamp = new Date(r.timestamp);
          lastResults.set(r.url, r);
        });
      }
      if (Array.isArray(data.log) && data.log.length) mergeServerLog(data.log);
      renderAll();
    } catch (e) {
      /* offline or function not yet deployed — ignore */
    }
  }, 15000);
}

function renderAll() {
  renderUrlList();
  renderOverviewEndpoints();
  renderOverviewRecentLog();
  updateGlobalStatCards();
  updateSidebarBadges();
}

// ════════════════════════════════════════════════════════════
// URL MANAGEMENT
// ════════════════════════════════════════════════════════════

function addUrl() {
  if (cfg.isMonitoring) return;
  const raw = urlInput.value.trim();
  if (!raw) { shakeEl(urlInput); return; }
  if (!isValidUrl(raw)) { shakeEl(urlInput); flashBorder(urlInput, '#ef4444'); return; }

  if (savedUrls.includes(raw)) {
    // Flash the existing row instead of duplicating
    const existing = urlListContainer.querySelector(`[data-url="${CSS.escape(raw)}"]`);
    if (existing) flashBorder(existing, 'var(--color-chartreuse-lime)');
    urlInput.value = '';
    return;
  }

  savedUrls.push(raw);
  urlInput.value = '';
  urlInput.focus();
  persistUrls();
  renderUrlList();
  renderOverviewEndpoints();
  updateSidebarBadges();
  updateGlobalStatCards();
}

function removeUrl(url) {
  if (cfg.isMonitoring) return;
  savedUrls = savedUrls.filter(u => u !== url);
  lastResults.delete(url);
  persistUrls();
  renderUrlList();
  renderOverviewEndpoints();
  updateSidebarBadges();
  updateGlobalStatCards();
}

function renderUrlList() {
  const n = savedUrls.length;
  urlListCountBadge.textContent = n + (n === 1 ? ' URL' : ' URLs');

  if (n === 0) {
    urlListEmpty.style.display = 'flex';
    // Put empty state back inside container
    urlListContainer.innerHTML = '';
    urlListContainer.appendChild(urlListEmpty);
    return;
  }

  urlListEmpty.style.display = 'none';
  urlListContainer.innerHTML = '';

  savedUrls.forEach((url, i) => {
    const row = document.createElement('div');
    row.className = 'url-item';
    row.dataset.url = url;
    row.innerHTML = `
      <span class="url-item-num">${i + 1}</span>
      <div class="url-item-dot"></div>
      <span class="url-item-url" title="${escHtml(url)}">${escHtml(url)}</span>
      ${cfg.isMonitoring ? '' : `
        <button class="url-item-remove" title="Remove URL" aria-label="Remove ${escHtml(url)}">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </button>
      `}
    `;
    if (!cfg.isMonitoring) {
      row.querySelector('.url-item-remove').addEventListener('click', () => removeUrl(url));
    }
    urlListContainer.appendChild(row);
  });
}

// ════════════════════════════════════════════════════════════
// OVERVIEW RENDERS
// ════════════════════════════════════════════════════════════

function renderOverviewEndpoints() {
  if (savedUrls.length === 0) {
    ovEndpointEmpty.style.display = 'flex';
    ovEndpointList.innerHTML = '';
    ovEndpointList.appendChild(ovEndpointEmpty);
    return;
  }

  ovEndpointEmpty.style.display = 'none';
  ovEndpointList.innerHTML = '';

  savedUrls.forEach(url => {
    const r = (monitors.get(url) && monitors.get(url).lastResult) || lastResults.get(url) || null;
    const dotCls  = !r ? '' : r.ok ? 'ok' : (r.status === 'REACHABLE' ? 'warn' : 'error');
    const codeStr = !r ? '—' : (r.code !== null ? String(r.code) : r.status);

    const row = document.createElement('div');
    row.className = 'ov-ep-row';
    row.innerHTML = `
      <div class="ov-ep-dot ${dotCls}"></div>
      <span class="ov-ep-url" title="${escHtml(url)}">${escHtml(url)}</span>
      <span class="ov-ep-code">${escHtml(codeStr)}</span>
    `;
    ovEndpointList.appendChild(row);
  });
}

function renderOverviewRecentLog() {
  const recent = gStats.log.slice(0, 6);
  ovLogCount.textContent = gStats.log.length + (gStats.log.length === 1 ? ' entry' : ' entries');

  if (recent.length === 0) {
    ovRecentLog.innerHTML = `
      <div class="inline-empty">
        <p>No checks yet. Start monitoring to see activity here.</p>
      </div>`;
    return;
  }

  ovRecentLog.innerHTML = '';
  recent.forEach(r => {
    const dotCls  = r.ok ? 'ok' : (r.status === 'REACHABLE' ? 'warn' : 'error');
    const codeStr = r.code !== null ? String(r.code) : r.status;
    const row = document.createElement('div');
    row.className = 'ov-log-row';
    row.innerHTML = `
      <div class="ov-log-dot ${dotCls}"></div>
      <span class="ov-log-code">${escHtml(codeStr)}</span>
      <span class="ov-log-url" title="${escHtml(r.url)}">${escHtml(r.url)}</span>
      <span class="ov-log-time">${fmtTime(r.timestamp)}</span>
    `;
    ovRecentLog.appendChild(row);
  });
}

// ════════════════════════════════════════════════════════════
// GLOBAL STAT CARDS
// ════════════════════════════════════════════════════════════

function updateGlobalStatCards() {
  ovTotal.textContent    = gStats.totalChecks;
  ovUrlCount.textContent = savedUrls.length;

  ovUptime.textContent = gStats.totalChecks > 0
    ? Math.round((gStats.successChecks / gStats.totalChecks) * 100) + '%'
    : '—';

  ovAvg.textContent = (gStats.totalChecks > 0 && gStats.totalResponseMs > 0)
    ? Math.round(gStats.totalResponseMs / gStats.totalChecks) + 'ms'
    : '—';
}

// ════════════════════════════════════════════════════════════
// SIDEBAR BADGES + STATUS
// ════════════════════════════════════════════════════════════

function updateSidebarBadges() {
  navUrlCount.textContent = savedUrls.length;
  navLogCount.textContent = gStats.log.length;

  if (cfg.isMonitoring) {
    navLiveBadge.style.display = 'inline-flex';
    sidebarStatusDot.classList.add('is-active');
    sidebarStatusLabel.classList.add('is-active');
    sidebarStatusLabel.textContent = 'ACTIVE';
  } else {
    navLiveBadge.style.display = 'none';
    sidebarStatusDot.classList.remove('is-active');
    sidebarStatusLabel.classList.remove('is-active');
    sidebarStatusLabel.textContent = 'IDLE';
  }
}

// ════════════════════════════════════════════════════════════
// SYNC ALL START/STOP BUTTONS
// ════════════════════════════════════════════════════════════

function syncAllStartButtons() {
  const active = cfg.isMonitoring;
  const label  = active ? 'Stop Monitoring' : 'Start Monitoring';

  // Overview small button
  if (ovBtnStart) {
    ovBtnStart.textContent = label;
    ovBtnStart.classList.toggle('is-stop', active);
  }
  // Monitors page primary button
  if (monBtnStart) {
    monBtnStart.textContent = label;
    monBtnStart.classList.toggle('is-stop', active);
  }
  // Settings primary button
  if (setBtnStart) {
    setBtnStart.textContent = label;
    setBtnStart.classList.toggle('is-stop', active);
  }
  // Settings status text
  if (setCtrlTitle) {
    setCtrlTitle.textContent = active ? 'Monitoring active' : 'Not monitoring';
    setCtrlDesc.textContent  = active
      ? `Pinging ${savedUrls.length} URL${savedUrls.length !== 1 ? 's' : ''} every ${fmtIntervalLabel(cfg.intervalMs)}.`
      : 'Start to begin monitoring all saved URLs.';
  }
}

// ════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ════════════════════════════════════════════════════════════

// Add URL
btnAddUrl && btnAddUrl.addEventListener('click', addUrl);
urlInput  && urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });

// All "Start/Stop Monitoring" buttons wired to the same toggle
[ovBtnStart, monBtnStart, setBtnStart].forEach(btn => {
  btn && btn.addEventListener('click', () => {
    cfg.isMonitoring ? stopAllMonitoring() : startAllMonitoring();
  });
});

// "Check Now" buttons (monitors page + settings page)
async function runCheckNow(btn) {
  if (savedUrls.length === 0) { navigateTo('urls'); return; }
  const origText = btn.textContent;
  btn.textContent = 'Checking…';
  btn.disabled = true;
  await Promise.all(savedUrls.map(url => performCheck(url, cfg.method)));
  btn.textContent = origText;
  btn.disabled = false;
}
monBtnCheckNow && monBtnCheckNow.addEventListener('click', () => runCheckNow(monBtnCheckNow));
setBtnCheckNow && setBtnCheckNow.addEventListener('click', () => runCheckNow(setBtnCheckNow));

// Clear log
btnClearLog && btnClearLog.addEventListener('click', () => {
  gStats.log            = [];
  gStats.totalChecks    = 0;
  gStats.successChecks  = 0;
  gStats.totalResponseMs = 0;
  // Reset per-monitor stats too
  monitors.forEach((m, url) => {
    m.totalChecks     = 0;
    m.successChecks   = 0;
    m.totalResponseMs = 0;
    m.lastResult      = null;
    refreshMonitorCard(url, m);
  });
  renderLog();
  renderOverviewRecentLog();
  renderOverviewEndpoints();
  updateGlobalStatCards();
  updateSidebarBadges();
});

// Interval buttons
document.querySelectorAll('.interval-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (cfg.isMonitoring) return;
    document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    cfg.intervalMs = parseInt(btn.dataset.ms, 10);
  });
});

// Method buttons
document.querySelectorAll('.method-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (cfg.isMonitoring) return;
    document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    cfg.method = btn.dataset.method;
  });
});

// ════════════════════════════════════════════════════════════
// MONITORING — START / STOP
// ════════════════════════════════════════════════════════════

function startAllMonitoring() {
  if (savedUrls.length === 0) {
    navigateTo('urls');
    shakeEl(urlInput);
    return;
  }

  cfg.isMonitoring = true;

  // Lock inputs
  urlInput  && (urlInput.disabled = true);
  btnAddUrl && (btnAddUrl.disabled = true);
  document.querySelectorAll('.interval-btn').forEach(b => b.disabled = true);
  document.querySelectorAll('.method-btn').forEach(b => b.disabled = true);

  // Re-render URL list (hides remove buttons while monitoring)
  renderUrlList();

  // Clear & prepare monitor cards
  monitorGrid.innerHTML = '';
  monitorEmpty.style.display = 'none';

  // Spin up one independent monitor per URL
  savedUrls.forEach(url => {
    const m = {
      timerId: null, countdownId: null, countdownRemaining: 0,
      lastResult: null,
      totalChecks: 0, successChecks: 0, totalResponseMs: 0,
    };
    monitors.set(url, m);
    createMonitorCard(url);
    performCheck(url, cfg.method).then(() => scheduleNext(url));
  });

  syncAllStartButtons();
  updateSidebarBadges();
}

function stopAllMonitoring() {
  cfg.isMonitoring = false;

  monitors.forEach(m => { clearTimeout(m.timerId); clearInterval(m.countdownId); });
  monitors.clear();

  // Unlock inputs
  urlInput  && (urlInput.disabled = false);
  btnAddUrl && (btnAddUrl.disabled = false);
  document.querySelectorAll('.interval-btn').forEach(b => b.disabled = false);
  document.querySelectorAll('.method-btn').forEach(b => b.disabled = false);

  renderUrlList();

  monitorGrid.innerHTML = '';
  monitorEmpty.style.display = 'flex';

  syncAllStartButtons();
  updateSidebarBadges();
  renderOverviewEndpoints();
}

// ════════════════════════════════════════════════════════════
// MONITORING — SCHEDULING
// ════════════════════════════════════════════════════════════

function scheduleNext(url) {
  const m = monitors.get(url);
  if (!m || !cfg.isMonitoring) return;

  m.countdownRemaining = cfg.intervalMs;

  clearInterval(m.countdownId);
  m.countdownId = setInterval(() => {
    m.countdownRemaining = Math.max(0, m.countdownRemaining - 1000);
    if (m.countdownRemaining <= 0) clearInterval(m.countdownId);
    refreshMonitorCard(url, m);
  }, 1000);

  refreshMonitorCard(url, m);

  m.timerId = setTimeout(async () => {
    if (!cfg.isMonitoring || !monitors.has(url)) return;
    await performCheck(url, cfg.method);
    scheduleNext(url);
  }, cfg.intervalMs);
}

// ════════════════════════════════════════════════════════════
// MONITORING — HTTP CHECK
// ════════════════════════════════════════════════════════════

async function performCheck(url, method) {
  const t0        = performance.now();
  const timestamp = new Date();
  const result    = { url, method, timestamp, code: null, status: 'UNKNOWN', responseMs: null, ok: false, error: null };

  try {
    const ctrl = new AbortController();
    const tOut = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { method, signal: ctrl.signal });
      clearTimeout(tOut);
      result.responseMs = Math.round(performance.now() - t0);
      result.code   = res.status;
      result.ok     = res.ok;
      result.status = res.ok ? 'UP' : 'DOWN';
    } catch (corsErr) {
      clearTimeout(tOut);
      if (corsErr.name === 'AbortError') {
        result.status = 'TIMEOUT';
        result.error  = 'Request timed out after 10s';
      } else {
        // Fallback: no-cors reachability probe
        try {
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), 10000);
          await fetch(url, { method: 'GET', mode: 'no-cors', signal: c2.signal });
          clearTimeout(t2);
          result.responseMs = Math.round(performance.now() - t0);
          result.code   = '•';
          result.status = 'REACHABLE';
          result.ok     = true;
          result.error  = 'CORS blocked — no-cors probe (status unknown)';
        } catch (e) {
          result.responseMs = Math.round(performance.now() - t0);
          result.status = e.name === 'AbortError' ? 'TIMEOUT' : 'DOWN';
          result.error  = e.message;
        }
      }
    }
  } catch (e) {
    result.status = 'ERROR';
    result.error  = e.message;
  }

  // ── Update global stats ──
  gStats.totalChecks++;
  if (result.ok) gStats.successChecks++;
  if (result.responseMs !== null) gStats.totalResponseMs += result.responseMs;
  gStats.log.unshift(result);
  if (gStats.log.length > 500) gStats.log.pop();

  // ── Update per-monitor state ──
  lastResults.set(url, result);
  const m = monitors.get(url);
  if (m) {
    m.totalChecks++;
    if (result.ok) m.successChecks++;
    if (result.responseMs !== null) m.totalResponseMs += result.responseMs;
    m.lastResult = result;
    refreshMonitorCard(url, m);
  }

  // ── Refresh all dependent UI ──
  renderLog();
  updateGlobalStatCards();
  renderOverviewEndpoints();
  renderOverviewRecentLog();
  updateSidebarBadges();
}

// ════════════════════════════════════════════════════════════
// MONITOR CARDS
// ════════════════════════════════════════════════════════════

function cardId(url) { return 'mc-' + url.replace(/[^a-zA-Z0-9]/g, '_'); }

function createMonitorCard(url) {
  const card = document.createElement('div');
  card.className = 'monitor-card';
  card.id = cardId(url);
  monitorGrid.appendChild(card);
  refreshMonitorCard(url, monitors.get(url));
}

function refreshMonitorCard(url, m) {
  if (!url || !m) return;
  const card = $(cardId(url));
  if (!card) return;

  const r        = m.lastResult;
  const dotCls   = !r ? '' : r.ok ? 'ok' : (r.status === 'REACHABLE' ? 'warn' : 'error');
  const borderCls= !r ? '' : r.ok ? 's-ok' : (r.status === 'REACHABLE' ? 's-warn' : 's-error');
  const codeStr  = !r ? '—' : (r.code !== null ? String(r.code) : r.status);
  const statusMsg= !r ? 'Waiting for first check…' : (r.error && !r.ok ? r.error : r.status);
  const msStr    = !r || r.responseMs === null ? '—' : r.responseMs + ' ms';
  const tsStr    = !r ? '—' : fmtTime(r.timestamp);
  const cdLabel  = m.countdownRemaining > 0 ? 'next in ' + fmtCountdown(m.countdownRemaining) : (r ? '—' : 'checking…');

  const uptimePct = m.totalChecks > 0
    ? Math.round((m.successChecks / m.totalChecks) * 100) + '%'
    : '—';
  const avgMs = (m.totalChecks > 0 && m.totalResponseMs > 0)
    ? Math.round(m.totalResponseMs / m.totalChecks) + 'ms'
    : '—';

  card.className = 'monitor-card' + (borderCls ? ' ' + borderCls : '');
  card.innerHTML = `
    <div class="mc-top">
      <div class="mc-dot ${dotCls}"></div>
      <span class="mc-code">${escHtml(codeStr)}</span>
      <span class="mc-ts">${tsStr}</span>
    </div>
    <div class="mc-url" title="${escHtml(url)}">${escHtml(url)}</div>
    <div class="mc-msg">${escHtml(statusMsg)}</div>
    <div class="mc-stats">
      <div class="mc-stat">
        <span class="mc-stat-lbl">Uptime</span>
        <span class="mc-stat-val">${uptimePct}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Avg Response</span>
        <span class="mc-stat-val">${avgMs}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Checks</span>
        <span class="mc-stat-val">${m.totalChecks}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Last Response</span>
        <span class="mc-stat-val">${msStr}</span>
      </div>
    </div>
    <div class="mc-footer">
      <span class="mc-method">${escHtml(cfg.method)}</span>
      <span class="mc-countdown">${cdLabel}</span>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// RENDER: CHECK LOG
// ════════════════════════════════════════════════════════════

function renderLog() {
  const n = gStats.log.length;
  logCountBadge.textContent = n + (n === 1 ? ' entry' : ' entries');
  logEmpty.style.display = n === 0 ? 'flex' : 'none';
  logList.style.display  = n === 0 ? 'none' : 'flex';

  logList.innerHTML = '';
  gStats.log.forEach(r => {
    const dotCls  = r.ok ? 'ok' : (r.status === 'REACHABLE' ? 'warn' : 'error');
    const codeStr = r.code !== null ? String(r.code) : r.status;
    const msStr   = r.responseMs !== null ? r.responseMs + ' ms' : 'timeout';

    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <div class="log-dot ${dotCls}"></div>
      <span class="log-code">${escHtml(codeStr)}</span>
      <span class="log-method">${escHtml(r.method)}</span>
      <span class="log-url" title="${escHtml(r.url)}">${escHtml(r.url)}</span>
      <span class="log-ms">${msStr}</span>
      <span class="log-time">${fmtTime(r.timestamp)}</span>
    `;
    logList.appendChild(row);
  });
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function isValidUrl(url) {
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol); }
  catch { return false; }
}

function fmtCountdown(ms) {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  return r === 0 ? m + 'm' : m + 'm ' + r + 's';
}

function fmtIntervalLabel(ms) {
  if (ms < 60000) return (ms / 1000) + ' seconds';
  const m = ms / 60000;
  return m + (m === 1 ? ' minute' : ' minutes');
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shakeEl(el) {
  if (!el) return;
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake .4s ease';
  setTimeout(() => { el.style.animation = ''; }, 450);
}

function flashBorder(el, color) {
  if (!el) return;
  const prev = el.style.outline;
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = '2px';
  setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = ''; }, 900);
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

(async function init() {
  try {
    await loadServerState();
  } catch (e) {
    console.warn('BackSaver: failed to load persisted state', e);
  }

  renderAll();
  syncAllStartButtons();
  startServerRefresh();

  // ── Developer Welcome Popup & Copyright ──
  const currentYear = new Date().getFullYear();
  const sidebarYear = $('sidebar-year');
  const popupYear   = $('popup-year');
  if (sidebarYear) sidebarYear.textContent = currentYear;
  if (popupYear)   popupYear.textContent   = currentYear;

  const popupBackdrop = $('popup-backdrop');
  const popupCloseBtn = $('popup-close-btn');

  if (popupBackdrop && popupCloseBtn) {
    // Check if we already showed it
    const hasSeenPopup = localStorage.getItem('backsaver_seen_developer_popup');

    if (!hasSeenPopup) {
      // Show it
      popupBackdrop.style.display = 'flex';

      // Close logic
      popupCloseBtn.addEventListener('click', () => {
        popupBackdrop.classList.add('is-hidden');
        localStorage.setItem('backsaver_seen_developer_popup', 'true');
        setTimeout(() => { popupBackdrop.style.display = 'none'; }, 300);
      });
    } else {
      popupBackdrop.style.display = 'none';
    }
  }
})();

