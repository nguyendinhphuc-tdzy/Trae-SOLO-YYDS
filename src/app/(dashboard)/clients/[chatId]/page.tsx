'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const STATUS_COLORS = {
  'Open': 'var(--warning)',
  'In Progress': 'var(--accent)',
  'Done': 'var(--success)',
  'Closed': 'var(--text-muted)',
};

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

export default function ClientDetailPage() {
  const params = useParams();
  const chatId = decodeURIComponent(params.chatId);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients/${encodeURIComponent(chatId)}`);
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [chatId]);

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading...</div>;
  if (!data) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Client not found</div>;

  const { client, tickets } = data;

  return (
    <div>
      <Link href="/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Clients
      </Link>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.5rem', color: 'var(--accent)', flexShrink: 0 }}>
          {(client?.display_name || chatId || '?')[0].toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{client?.display_name || 'Unknown Client'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.25rem', fontFamily: 'monospace' }}>{chatId}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.5rem', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{client?.ticket_count || 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tickets</div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{client?.assignee_name || '-'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assignee</div>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Ticket History</h2>
      {(!tickets || tickets.length === 0) ? (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No tickets for this client
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tickets.map((t) => (
            <div key={t.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.125rem' }}>{t.summary}</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.description || t.ai_reason || 'No description'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 99, color: STATUS_COLORS[t.status] || 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>
                  {t.status}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
