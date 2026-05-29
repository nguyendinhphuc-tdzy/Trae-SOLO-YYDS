'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardHome() {
  const [stats, setStats] = useState(null);
  const [recentConv, setRecentConv] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [overviewRes, convRes, ticketRes] = await Promise.all([
          fetch('/api/analytics/overview?days=7'),
          fetch('/api/conversations?limit=5'),
          fetch('/api/tickets?limit=5'),
        ]);
        const [overview, conv, ticket] = await Promise.all([overviewRes.json(), convRes.json(), ticketRes.json()]);
        setStats(overview);
        setRecentConv(conv.data || []);
        setRecentTickets(ticket.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Overview</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          WhatsApp Ticket Ops Dashboard &mdash; last 7 days
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Conversations', value: stats?.totalConversations || 0, color: 'var(--accent)', bg: 'var(--accent-muted)' },
          { label: 'Tickets Created', value: stats?.totalTickets || 0, color: 'var(--success)', bg: 'var(--success-muted)' },
          { label: 'Active Clients', value: stats?.activeClients || 0, color: 'var(--warning)', bg: 'var(--warning-muted)' },
          { label: 'Ignored', value: stats?.byDecision?.IGNORE || 0, color: 'var(--text-muted)', bg: 'var(--bg-tertiary)' },
        ].map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1.125rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: card.color }} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{card.label}</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Recent Conversations */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Recent Conversations</h3>
            <Link href="/conversations" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>View all &rarr;</Link>
          </div>
          {recentConv.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No conversations yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentConv.map((conv) => (
                <div key={conv.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.75rem', color: 'var(--accent)', flexShrink: 0 }}>
                    {(conv.client_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.client_name || conv.chat_id}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.text || 'No text'}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(conv.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Tickets */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Recent Tickets</h3>
            <Link href="/tickets" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>View all &rarr;</Link>
          </div>
          {recentTickets.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No tickets yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentTickets.map((t) => (
                <div key={t.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.summary}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.client_name || 'Unknown client'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: 99, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {t.priority}
                    </span>
                    <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: 99, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem 1.25rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/tickets" style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem', transition: 'border-color 0.15s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Ticket
          </Link>
          <Link href="/conversations" style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></svg>
            View Inbox
          </Link>
          <Link href="/clients" style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
            Clients
          </Link>
          <Link href="/analytics" style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
            Analytics
          </Link>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
