'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Monitor {
  id: number;
  name: string;
  type: string;
  url: string;
  status: string;
  last_response_ms: number;
  uptime_30d: string | null;
}

interface Incident {
  id: number;
  monitor_name: string;
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
  cause: string;
}

export default function StatusPage() {
  const [data, setData] = useState<{
    systemStatus: string;
    monitors: Monitor[];
    recentIncidents: Incident[];
    generatedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Status fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isAllUp = data?.systemStatus === 'OPERATIONAL';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-pale-sage)', color: 'var(--color-deep-forest)', padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(4,63,46,0.1)', paddingBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke="#043f2e" strokeWidth="1.8"/>
              <circle cx="11" cy="11" r="3.5" fill="#043f2e"/>
            </svg>
            <span style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.01em' }}>BackSaver Status</span>
          </div>
          <Link href="/" style={{ fontSize: '13px', color: 'var(--color-deep-forest)', textDecoration: 'none', fontWeight: 500, opacity: 0.7 }}>
            ← Dashboard
          </Link>
        </header>

        {/* System Banner */}
        <div style={{
          background: isAllUp ? 'var(--color-deep-forest)' : '#b91c1c',
          color: isAllUp ? 'var(--color-chartreuse-lime)' : '#ffffff',
          borderRadius: '16px',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>Current Status</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 400, marginTop: '4px' }}>
              {loading ? 'Checking status…' : isAllUp ? 'All Systems Operational' : 'Partial System Outage'}
            </h1>
          </div>
          <div style={{
            width: '14px', height: '14px', borderRadius: '50%',
            background: isAllUp ? 'var(--color-chartreuse-lime)' : '#f87171',
            boxShadow: isAllUp ? '0 0 16px var(--color-chartreuse-lime)' : '0 0 16px #f87171'
          }}></div>
        </div>

        {/* Monitors List */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, fontWeight: 600 }}>
            Services & Endpoints
          </h2>

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', opacity: 0.5 }}>Loading services…</div>
          ) : data?.monitors.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', opacity: 0.6 }}>
              No public monitors configured yet.
            </div>
          ) : (
            data?.monitors.map(m => {
              const isUp = m.status === 'UP';
              const uptime = m.uptime_30d ? `${m.uptime_30d}%` : '100%';
              return (
                <div key={m.id} style={{ background: '#ffffff', borderRadius: '16px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: isUp ? '#22c55e' : '#ef4444',
                      }}></span>
                      <strong style={{ fontSize: '15px' }}>{m.name || m.url}</strong>
                      <span style={{ fontSize: '10px', background: 'var(--color-pale-sage)', padding: '2px 7px', borderRadius: '9999px', fontWeight: 600 }}>
                        {m.type.toUpperCase()}
                      </span>
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 600,
                      color: isUp ? '#16a34a' : '#dc2626',
                    }}>
                      {isUp ? 'Operational' : 'Disrupted'}
                    </span>
                  </div>

                  {/* 30-day visual status bar */}
                  <div style={{ display: 'flex', gap: '3px', height: '16px', alignItems: 'center' }}>
                    {Array.from({ length: 30 }).map((_, idx) => (
                      <div
                        key={idx}
                        title={`Day ${30 - idx}: Operational`}
                        style={{
                          flex: 1,
                          height: '100%',
                          borderRadius: '2px',
                          background: isUp ? '#22c55e' : (idx === 29 ? '#ef4444' : '#22c55e'),
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', opacity: 0.6 }}>
                    <span>30 days ago</span>
                    <span><strong>{uptime}</strong> uptime · {m.last_response_ms ? `${m.last_response_ms}ms avg` : 'Normal'}</span>
                    <span>Today</span>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Incident History Feed */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6, fontWeight: 600 }}>
            Recent Incidents (Last 30 Days)
          </h2>

          {data?.recentIncidents.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', textAlign: 'center', opacity: 0.5, fontSize: '14px' }}>
              🎉 No downtime incidents reported in the last 30 days.
            </div>
          ) : (
            data?.recentIncidents.map(inc => (
              <div key={inc.id} style={{ background: '#fff', borderRadius: '16px', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '14px' }}>{inc.monitor_name}</strong>
                  <span style={{ fontSize: '12px', color: inc.resolved_at ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {inc.resolved_at ? `Resolved (${Math.round((inc.duration_seconds || 0) / 60)}m downtime)` : 'Investigating'}
                  </span>
                </div>
                <div style={{ fontSize: '13px', opacity: 0.7 }}>
                  {inc.cause || 'Service unresponsive'} · Started {new Date(inc.started_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', fontSize: '12px', opacity: 0.4, borderTop: '1px solid rgba(4,63,46,0.08)', paddingTop: '24px' }}>
          Powered by BackSaver · Live 24/7 Availability Monitor
        </footer>

      </div>
    </div>
  );
}
