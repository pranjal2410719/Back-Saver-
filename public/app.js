/* ============================================================
   BackSaver — app.js  v3.5 (UptimeRobot Edition)
   Multi-type health monitor: HTTP(S), Keyword, SSL, Port & Heartbeats
   ============================================================ */

'use strict';

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

/** Active monitor records from database */
let monitorsList = [];

/** Selected monitor type in create form */
let selectedMonitorType = 'http';

/** Global config */
const cfg = {
  intervalMs:    60000,
  method:        'GET',
  isMonitoring:  false,
};

/** Aggregate stats across all monitors */
const gStats = {
  totalChecks:    0,
  successChecks:  0,
  totalResponseMs: 0,
  log:            [],  // newest first
};

/**
 * Per-monitor runtime state
 * Map<monitorId, { timerId, countdownId, countdownRemaining, lastResult }>
 */
const monitors = new Map();

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

// Manage Monitors
const urlInput           = $('url-input');
const nameInput          = $('name-input');
const keywordInput       = $('keyword-input');
const portInput          = $('port-input');
const groupUrl           = $('group-url');
const groupKeyword       = $('group-keyword');
const groupPort          = $('group-port');
const lblUrl             = $('lbl-url');
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
// SERVER STATE & API INTEGRATION
// ════════════════════════════════════════════════════════════

const API_MONITORS = '/api/monitors';
const API_STATS    = '/api/stats';
const API_SETTINGS = '/api/settings';

async function loadServerState() {
  try {
    const localInterval = localStorage.getItem('backsaver_interval_ms');
    if (localInterval) applyInterval(parseInt(localInterval, 10), false);
    
    const localMethod = localStorage.getItem('backsaver_method');
    if (localMethod) applyMethod(localMethod, false);

    // Fetch monitors
    const resMonitors = await fetch(API_MONITORS);
    if (resMonitors.ok) {
      const data = await resMonitors.json();
      if (Array.isArray(data.monitors)) {
        monitorsList = data.monitors;
      }
    }

    // Fetch settings
    const resSettings = await fetch(API_SETTINGS);
    if (resSettings.ok) {
      const { isMonitoring, intervalMs, method } = await resSettings.json();
      if (typeof intervalMs === 'number' && !localInterval) applyInterval(intervalMs, false);
      if (method && !localMethod) applyMethod(method, false);
      if (isMonitoring) {
        cfg.isMonitoring = true;
        syncAllStartButtons();
      }
    }

    // Fetch stats log
    const resStats = await fetch(API_STATS);
    if (resStats.ok) {
      const data = await resStats.json();
      if (Array.isArray(data.log) && data.log.length) mergeServerLog(data.log);
    }
  } catch (e) {
    console.warn('Failed to load state from server', e);
  }
}

async function persistSettings(isMonitoring) {
  try {
    await fetch(API_SETTINGS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isMonitoring: isMonitoring ?? cfg.isMonitoring,
        intervalMs: cfg.intervalMs,
        method: cfg.method,
      }),
    });
  } catch (e) {
    console.warn('Failed to persist settings to server', e);
  }
}

function mergeServerLog(serverLog) {
  const seen = new Set(gStats.log.map(r => (r.url || r.name) + '|' + new Date(r.timestamp).toISOString()));
  const fresh = [];

  for (const r of serverLog) {
    const ts = new Date(r.timestamp || r.created_at);
    const key = (r.url || r.name) + '|' + ts.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...r, timestamp: ts });
  }

  if (fresh.length) {
    gStats.log = fresh.concat(gStats.log).slice(0, 500);
    recomputeStats();
  }
}

function recomputeStats() {
  const log = gStats.log;
  gStats.totalChecks     = log.length;
  gStats.successChecks   = log.filter(r => r.ok || r.is_up).length;
  gStats.totalResponseMs = log.reduce((s, r) => s + (r.responseMs || r.response_ms || 0), 0);
  renderAll();
}

function startServerRefresh() {
  setInterval(async () => {
    try {
      const res = await fetch(API_MONITORS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.monitors)) {
          monitorsList = data.monitors;
          renderAll();
        }
      }
    } catch (e) {}
  }, 10000);
}

function renderAll() {
  renderMonitorList();
  renderOverviewEndpoints();
  renderOverviewRecentLog();
  updateGlobalStatCards();
  updateSidebarBadges();
}

// ════════════════════════════════════════════════════════════
// MONITOR TYPE SELECTOR LOGIC
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    selectedMonitorType = btn.dataset.type;

    // Adjust form fields based on monitor type
    if (groupKeyword) groupKeyword.style.display = selectedMonitorType === 'keyword' ? 'flex' : 'none';
    if (groupPort) groupPort.style.display = selectedMonitorType === 'port' ? 'flex' : 'none';
    
    if (selectedMonitorType === 'heartbeat') {
      if (lblUrl) lblUrl.textContent = 'Cron Job Identifier';
      if (urlInput) urlInput.placeholder = 'e.g. daily-database-backup';
    } else if (selectedMonitorType === 'ssl') {
      if (lblUrl) lblUrl.textContent = 'Domain / Hostname';
      if (urlInput) urlInput.placeholder = 'example.com or https://example.com';
    } else if (selectedMonitorType === 'port') {
      if (lblUrl) lblUrl.textContent = 'Host / IP Address';
      if (urlInput) urlInput.placeholder = 'db.internal.company.com or 1.2.3.4';
    } else {
      if (lblUrl) lblUrl.textContent = 'Target URL / Endpoint';
      if (urlInput) urlInput.placeholder = 'https://api.yourbackend.com/health';
    }
  });
});

// ════════════════════════════════════════════════════════════
// CREATE & MANAGE MONITORS
// ════════════════════════════════════════════════════════════

async function addMonitor() {
  const rawUrl = urlInput.value.trim();
  const name   = nameInput ? nameInput.value.trim() : '';
  const keyword = keywordInput ? keywordInput.value.trim() : '';
  const port = portInput ? portInput.value.trim() : '';

  if (!rawUrl && selectedMonitorType !== 'heartbeat') {
    shakeEl(urlInput);
    return;
  }

  try {
    btnAddUrl.disabled = true;
    btnAddUrl.textContent = 'Saving…';

    const res = await fetch(API_MONITORS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: selectedMonitorType,
        url: rawUrl,
        name: name || undefined,
        keyword: selectedMonitorType === 'keyword' ? keyword : undefined,
        port: selectedMonitorType === 'port' ? port : undefined,
        interval_seconds: Math.round(cfg.intervalMs / 1000),
        method: cfg.method,
      }),
    });

    const data = await res.json();
    if (data.success && data.monitor) {
      monitorsList.push(data.monitor);
      urlInput.value = '';
      if (nameInput) nameInput.value = '';
      if (keywordInput) keywordInput.value = '';
      if (portInput) portInput.value = '';
      
      renderAll();
      navigateTo('monitors');
    } else {
      alert(data.error || 'Failed to create monitor');
    }
  } catch (err) {
    console.error('Add monitor error:', err);
  } finally {
    btnAddUrl.disabled = false;
    btnAddUrl.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      Save & Start Monitor
    `;
  }
}

async function removeMonitor(id) {
  if (!confirm('Are you sure you want to delete this monitor and its check history?')) return;
  try {
    const res = await fetch(`${API_MONITORS}/${id}`, { method: 'DELETE' });
    if (res.ok) {
      monitorsList = monitorsList.filter(m => m.id !== id);
      monitors.delete(id);
      renderAll();
    }
  } catch (e) {
    console.warn('Failed to delete monitor', e);
  }
}

function renderMonitorList() {
  const n = monitorsList.length;
  urlListCountBadge.textContent = n + (n === 1 ? ' Monitor' : ' Monitors');

  if (n === 0) {
    urlListEmpty.style.display = 'flex';
    urlListContainer.innerHTML = '';
    urlListContainer.appendChild(urlListEmpty);
    return;
  }

  urlListEmpty.style.display = 'none';
  urlListContainer.innerHTML = '';

  monitorsList.forEach((m, i) => {
    const isUp = m.status === 'UP';
    const dotCls = m.status === 'PENDING' ? '' : isUp ? 'ok' : 'error';
    const typeLabel = (m.type || 'http').toUpperCase();

    const row = document.createElement('div');
    row.className = 'url-item';
    row.innerHTML = `
      <span class="url-item-num">${i + 1}</span>
      <div class="url-item-dot ${dotCls}"></div>
      <span class="type-pill-badge">${typeLabel}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;color:var(--color-deep-forest)">${escHtml(m.name || m.url)}</div>
        <div class="url-item-url" title="${escHtml(m.url)}">${escHtml(m.url)}</div>
      </div>
      <span class="tag-pill" style="font-size:10px;background:${isUp ? 'var(--color-chartreuse-lime)' : '#fed7d7'}">${m.status}</span>
      <button class="url-item-remove" title="Remove Monitor" aria-label="Remove monitor">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    row.querySelector('.url-item-remove').addEventListener('click', () => removeMonitor(m.id));
    urlListContainer.appendChild(row);
  });
}

// ════════════════════════════════════════════════════════════
// OVERVIEW RENDERS
// ════════════════════════════════════════════════════════════

function renderOverviewEndpoints() {
  if (monitorsList.length === 0) {
    ovEndpointEmpty.style.display = 'flex';
    ovEndpointList.innerHTML = '';
    ovEndpointList.appendChild(ovEndpointEmpty);
    return;
  }

  ovEndpointEmpty.style.display = 'none';
  ovEndpointList.innerHTML = '';

  monitorsList.forEach(m => {
    const isUp = m.status === 'UP';
    const dotCls = m.status === 'PENDING' ? '' : isUp ? 'ok' : 'error';
    const codeStr = m.status === 'UP' ? '200 OK' : m.status;

    const row = document.createElement('div');
    row.className = 'ov-ep-row';
    row.innerHTML = `
      <div class="ov-ep-dot ${dotCls}"></div>
      <span class="ov-ep-url" title="${escHtml(m.name || m.url)}">
        <strong>${escHtml(m.name || m.url)}</strong> — <span style="opacity:.6">${escHtml(m.url)}</span>
      </span>
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
    const isUp = r.ok || r.is_up;
    const dotCls = isUp ? 'ok' : 'error';
    const codeStr = r.code || r.status_code || r.status || (isUp ? '200' : 'ERR');
    const row = document.createElement('div');
    row.className = 'ov-log-row';
    row.innerHTML = `
      <div class="ov-log-dot ${dotCls}"></div>
      <span class="ov-log-code">${escHtml(String(codeStr))}</span>
      <span class="ov-log-url" title="${escHtml(r.url || r.name)}">${escHtml(r.url || r.name)}</span>
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
  ovUrlCount.textContent = monitorsList.length;

  ovUptime.textContent = gStats.totalChecks > 0
    ? Math.round((gStats.successChecks / gStats.totalChecks) * 100) + '%'
    : (monitorsList.length > 0 ? '99.9%' : '—');

  ovAvg.textContent = (gStats.totalChecks > 0 && gStats.totalResponseMs > 0)
    ? Math.round(gStats.totalResponseMs / gStats.totalChecks) + 'ms'
    : '—';
}

function updateSidebarBadges() {
  navUrlCount.textContent = monitorsList.length;
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
// SYNC BUTTONS & EVENT HANDLERS
// ════════════════════════════════════════════════════════════

function syncAllStartButtons() {
  const active = cfg.isMonitoring;
  const label  = active ? 'Stop Monitoring' : 'Start Monitoring';

  if (ovBtnStart) {
    ovBtnStart.textContent = label;
    ovBtnStart.classList.toggle('is-stop', active);
  }
  if (monBtnStart) {
    monBtnStart.textContent = label;
    monBtnStart.classList.toggle('is-stop', active);
  }
  if (setBtnStart) {
    setBtnStart.textContent = label;
    setBtnStart.classList.toggle('is-stop', active);
  }
  if (setCtrlTitle) {
    setCtrlTitle.textContent = active ? 'Monitoring active' : 'Not monitoring';
    setCtrlDesc.textContent  = active
      ? `Pinging ${monitorsList.length} monitor${monitorsList.length !== 1 ? 's' : ''} every ${fmtIntervalLabel(cfg.intervalMs)}.`
      : 'Start to begin monitoring all targets.';
  }
}

btnAddUrl && btnAddUrl.addEventListener('click', addMonitor);
urlInput  && urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMonitor(); } });

[ovBtnStart, monBtnStart, setBtnStart].forEach(btn => {
  btn && btn.addEventListener('click', () => {
    cfg.isMonitoring ? stopAllMonitoring() : startAllMonitoring();
  });
});

async function runCheckNow(btn) {
  if (monitorsList.length === 0) { navigateTo('urls'); return; }
  const origText = btn.textContent;
  btn.textContent = 'Checking…';
  btn.disabled = true;
  await Promise.all(monitorsList.map(m => performCheck(m)));
  btn.textContent = origText;
  btn.disabled = false;
}
monBtnCheckNow && monBtnCheckNow.addEventListener('click', () => runCheckNow(monBtnCheckNow));
setBtnCheckNow && setBtnCheckNow.addEventListener('click', () => runCheckNow(setBtnCheckNow));

// Clear log
btnClearLog && btnClearLog.addEventListener('click', async () => {
  gStats.log             = [];
  gStats.totalChecks     = 0;
  gStats.successChecks   = 0;
  gStats.totalResponseMs = 0;
  try {
    await fetch(API_STATS, { method: 'DELETE' });
  } catch (e) {}
  renderLog();
  renderOverviewRecentLog();
  renderOverviewEndpoints();
  updateGlobalStatCards();
  updateSidebarBadges();
});

function applyInterval(ms, save = true) {
  if (!ms || isNaN(ms)) return;
  cfg.intervalMs = ms;
  document.querySelectorAll('.interval-btn').forEach(btn => {
    const btnMs = parseInt(btn.dataset.ms, 10);
    btn.classList.toggle('is-selected', btnMs === ms);
  });
  if (save) {
    localStorage.setItem('backsaver_interval_ms', String(ms));
    persistSettings();
  }
  if (cfg.isMonitoring) {
    monitors.forEach((m, id) => {
      clearTimeout(m.timerId);
      clearInterval(m.countdownId);
      scheduleNext(monitorsList.find(item => item.id === id));
    });
    syncAllStartButtons();
  }
}

function applyMethod(method, save = true) {
  if (!method) return;
  cfg.method = method;
  document.querySelectorAll('.method-btn').forEach(btn => {
    btn.classList.toggle('is-selected', btn.dataset.method === method);
  });
  if (save) {
    localStorage.setItem('backsaver_method', method);
    persistSettings();
  }
}

document.querySelectorAll('.interval-btn').forEach(btn => {
  btn.addEventListener('click', () => applyInterval(parseInt(btn.dataset.ms, 10), true));
});

document.querySelectorAll('.method-btn').forEach(btn => {
  btn.addEventListener('click', () => applyMethod(btn.dataset.method, true));
});

// ════════════════════════════════════════════════════════════
// MONITORING ENGINE & RUNTIME
// ════════════════════════════════════════════════════════════

function startAllMonitoring() {
  if (monitorsList.length === 0) {
    navigateTo('urls');
    shakeEl(urlInput);
    return;
  }

  cfg.isMonitoring = true;
  localStorage.setItem('backsaver_is_monitoring', 'true');
  persistSettings(true);

  renderMonitorList();

  monitorGrid.innerHTML = '';
  monitorEmpty.style.display = 'none';

  monitorsList.forEach(async monitor => {
    const m = {
      timerId: null, countdownId: null, countdownRemaining: 0,
      lastResult: null,
      totalChecks: 0, successChecks: 0, totalResponseMs: 0,
    };
    monitors.set(monitor.id, m);
    createMonitorCard(monitor);
    await performCheck(monitor);
    scheduleNext(monitor);
  });

  syncAllStartButtons();
  updateSidebarBadges();
}

function stopAllMonitoring() {
  cfg.isMonitoring = false;
  localStorage.setItem('backsaver_is_monitoring', 'false');
  persistSettings(false);

  monitors.forEach(m => { clearTimeout(m.timerId); clearInterval(m.countdownId); });
  monitors.clear();

  renderMonitorList();

  monitorGrid.innerHTML = '';
  monitorEmpty.style.display = 'flex';

  syncAllStartButtons();
  updateSidebarBadges();
  renderOverviewEndpoints();
}

function scheduleNext(monitor) {
  if (!monitor) return;
  const m = monitors.get(monitor.id);
  if (!m || !cfg.isMonitoring) return;

  m.countdownRemaining = cfg.intervalMs;

  clearInterval(m.countdownId);
  m.countdownId = setInterval(() => {
    m.countdownRemaining = Math.max(0, m.countdownRemaining - 1000);
    if (m.countdownRemaining <= 0) clearInterval(m.countdownId);
    refreshMonitorCard(monitor, m);
  }, 1000);

  refreshMonitorCard(monitor, m);

  m.timerId = setTimeout(async () => {
    if (!cfg.isMonitoring || !monitors.has(monitor.id)) return;
    await performCheck(monitor);
    scheduleNext(monitor);
  }, cfg.intervalMs);
}

async function performCheck(monitor) {
  const t0 = performance.now();
  const timestamp = new Date();
  const result = {
    monitorId: monitor.id,
    name: monitor.name || monitor.url,
    url: monitor.url,
    type: monitor.type,
    method: cfg.method,
    timestamp,
    code: null,
    status: 'UNKNOWN',
    responseMs: null,
    ok: false,
    error: null,
    sslDaysRemaining: null,
  };

  try {
    const res = await fetch(`${API_MONITORS}/${monitor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_now' }),
    });
    const data = await res.json();
    if (data.result) {
      result.responseMs = data.result.responseMs;
      result.code = data.result.statusCode;
      result.ok = data.result.isUp;
      result.status = data.result.status;
      result.error = data.result.error;
      result.sslDaysRemaining = data.result.sslDaysRemaining;
    }
  } catch (e) {
    result.responseMs = Math.round(performance.now() - t0);
    result.status = 'ERROR';
    result.error  = e.message;
  }

  gStats.totalChecks++;
  if (result.ok) gStats.successChecks++;
  if (result.responseMs !== null) gStats.totalResponseMs += result.responseMs;
  gStats.log.unshift(result);
  if (gStats.log.length > 500) gStats.log.pop();

  const m = monitors.get(monitor.id);
  if (m) {
    m.totalChecks++;
    if (result.ok) m.successChecks++;
    if (result.responseMs !== null) m.totalResponseMs += result.responseMs;
    m.lastResult = result;
    refreshMonitorCard(monitor, m);
  }

  renderLog();
  updateGlobalStatCards();
  renderOverviewEndpoints();
  renderOverviewRecentLog();
  updateSidebarBadges();
}

// ════════════════════════════════════════════════════════════
// MONITOR CARDS
// ════════════════════════════════════════════════════════════

function cardId(id) { return 'mc-monitor-' + id; }

function createMonitorCard(monitor) {
  const card = document.createElement('div');
  card.className = 'monitor-card';
  card.id = cardId(monitor.id);
  monitorGrid.appendChild(card);
  refreshMonitorCard(monitor, monitors.get(monitor.id));
}

function refreshMonitorCard(monitor, m) {
  if (!monitor || !m) return;
  const card = $(cardId(monitor.id));
  if (!card) return;

  const r = m.lastResult;
  const isUp = r ? r.ok : monitor.status === 'UP';
  const dotCls = !r && monitor.status === 'PENDING' ? '' : isUp ? 'ok' : 'error';
  const borderCls = isUp ? 's-ok' : (r ? 's-error' : '');
  const codeStr = r ? (r.code !== null ? String(r.code) : r.status) : monitor.status;
  const statusMsg = r ? (r.error && !r.ok ? r.error : r.status) : 'Ready';
  const msStr = r && r.responseMs !== null ? r.responseMs + ' ms' : (monitor.last_response_ms ? monitor.last_response_ms + ' ms' : '—');
  const cdLabel = m.countdownRemaining > 0 ? 'next in ' + fmtCountdown(m.countdownRemaining) : (r ? '—' : 'checking…');

  const uptimePct = monitor.uptime_24h ? monitor.uptime_24h + '%' : (m.totalChecks > 0 ? Math.round((m.successChecks / m.totalChecks) * 100) + '%' : '100%');
  const typeTag = (monitor.type || 'http').toUpperCase();
  const sslNotice = monitor.ssl_days_remaining ? `<span style="font-size:11px;color:#22c55e">🔒 SSL: ${monitor.ssl_days_remaining}d left</span>` : '';

  card.className = 'monitor-card' + (borderCls ? ' ' + borderCls : '');
  card.innerHTML = `
    <div class="mc-top">
      <div class="mc-dot ${dotCls}"></div>
      <span class="mc-code">${escHtml(codeStr)}</span>
      <span class="type-pill-badge">${typeTag}</span>
      <span class="mc-ts">${r ? fmtTime(r.timestamp) : ''}</span>
    </div>
    <div style="font-weight:600;font-size:15px;color:var(--color-deep-forest)">${escHtml(monitor.name || monitor.url)}</div>
    <div class="mc-url" title="${escHtml(monitor.url)}">${escHtml(monitor.url)}</div>
    <div class="mc-msg">${escHtml(statusMsg)}</div>
    <div class="mc-stats">
      <div class="mc-stat">
        <span class="mc-stat-lbl">Uptime 24h</span>
        <span class="mc-stat-val">${uptimePct}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Latency</span>
        <span class="mc-stat-val">${msStr}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Checks</span>
        <span class="mc-stat-val">${m.totalChecks}</span>
      </div>
      <div class="mc-stat">
        <span class="mc-stat-lbl">Incidents (30d)</span>
        <span class="mc-stat-val">${monitor.incident_count_30d || 0}</span>
      </div>
    </div>
    <div class="mc-footer">
      <div>${sslNotice || `<span class="mc-method">${escHtml(monitor.type === 'port' ? 'PORT ' + monitor.port : cfg.method)}</span>`}</div>
      <span class="mc-countdown">${cdLabel}</span>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════
// CHECK LOG
// ════════════════════════════════════════════════════════════

function renderLog() {
  const n = gStats.log.length;
  logCountBadge.textContent = n + (n === 1 ? ' entry' : ' entries');
  logEmpty.style.display = n === 0 ? 'flex' : 'none';
  logList.style.display  = n === 0 ? 'none' : 'flex';

  logList.innerHTML = '';
  gStats.log.forEach(r => {
    const isUp = r.ok || r.is_up;
    const dotCls  = isUp ? 'ok' : 'error';
    const codeStr = r.code || r.status_code || r.status || (isUp ? '200' : 'ERR');
    const msStr   = r.responseMs !== null ? r.responseMs + ' ms' : 'timeout';

    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <div class="log-dot ${dotCls}"></div>
      <span class="log-code">${escHtml(String(codeStr))}</span>
      <span class="log-method">${escHtml(r.type ? r.type.toUpperCase() : 'HTTP')}</span>
      <span class="log-url" title="${escHtml(r.url || r.name)}">${escHtml(r.name || r.url)}</span>
      <span class="log-ms">${msStr}</span>
      <span class="log-time">${fmtTime(r.timestamp)}</span>
    `;
    logList.appendChild(row);
  });
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

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
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shakeEl(el) {
  if (!el) return;
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake .4s ease';
  setTimeout(() => { el.style.animation = ''; }, 450);
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

  if (localStorage.getItem('backsaver_is_monitoring') === 'true' && monitorsList.length > 0) {
    setTimeout(startAllMonitoring, 500);
  }

  const currentYear = new Date().getFullYear();
  const sidebarYear = $('sidebar-year');
  if (sidebarYear) sidebarYear.textContent = currentYear;
})();
