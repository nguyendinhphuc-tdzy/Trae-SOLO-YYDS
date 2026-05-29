'use client';

import { useState, useEffect } from 'react';

function SimpleLineChart({ data, dataKey, color, label }) {
  if (!data || data.length === 0) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No data</div>;

  const maxVal = Math.max(...data.map((d) => d[dataKey] || 0), 1);
  const width = 100;
  const height = 100;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = data.map((d, i) => ({
    x: pad + (i / (data.length - 1 || 1)) * w,
    y: pad + h - (d[dataKey] / maxVal) * h,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${dataKey})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ))}
      </svg>
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: 'center' }}>{label}</div>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, color }) {
  if (!data || data.length === 0) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No data</div>;
  const maxVal = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.375rem', height: 100, padding: '0 0.25rem' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
          <div style={{ width: '100%', background: color, borderRadius: '3px 3px 0 0', minHeight: 2, height: `${Math.max((d[valueKey] / maxVal) * 80, 2)}px`, transition: 'height 0.3s ease' }} />
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {d[labelKey]}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.125rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/overview?days=${days}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [days]);

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading...</div>;
  if (!data) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Failed to load analytics</div>;

  const decisionData = Object.entries(data.byDecision || {}).map(([k, v]) => ({ label: k, value: v }));
  const priorityData = Object.entries(data.byPriority || {}).map(([k, v]) => ({ label: k, value: v }));
  const statusData = Object.entries(data.byStatus || {}).map(([k, v]) => ({ label: k, value: v }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.125rem' }}>Last {days} days</p>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: '0.8125rem', background: days === d ? 'var(--accent-muted)' : 'var(--bg-secondary)', color: days === d ? 'var(--accent)' : 'var(--text-secondary)', border: '1px solid var(--border)', transition: 'all 0.15s' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label="Conversations" value={data.totalConversations} color="var(--accent)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>} />
        <StatCard label="Tickets Created" value={data.totalTickets} color="var(--success)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2 2 2 0 012 2v3a2 2 0 01-2 2H5z" /><path d="M19 5a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V5z" /></svg>} />
        <StatCard label="Active Clients" value={data.activeClients} color="var(--warning)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>} />
        <StatCard label="Ignored" value={data.byDecision?.IGNORE || 0} color="var(--text-muted)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>} />
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>Conversation Trend</h3>
        <SimpleLineChart data={data.timeline || []} dataKey="conversations" color="var(--accent)" label="Conversations/day" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>AI Decisions</h3>
          <BarChart data={decisionData} labelKey="label" valueKey="value" color="var(--accent)" />
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>By Priority</h3>
          <BarChart data={priorityData} labelKey="label" valueKey="value" color="var(--warning)" />
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '1rem' }}>By Status</h3>
          <BarChart data={statusData} labelKey="label" valueKey="value" color="var(--success)" />
        </div>
      </div>
    </div>
  );
}
