'use client';

import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  'Open': 'var(--warning)',
  'In Progress': 'var(--accent)',
  'Done': 'var(--success)',
  'Closed': 'var(--text-muted)',
};

const DECISION_BADGES = {
  'CREATE_SUBTASK': { bg: 'var(--accent-muted)', color: 'var(--accent)' },
  'IGNORE': { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 30;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset: page * limit });
      if (filter) params.set('aiDecision', filter);
      const res = await fetch(`/api/conversations?${params}`);
      const json = await res.json();
      setConversations(json.data || []);
      setCount(json.count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(count / limit);

  const filtered = search
    ? conversations.filter(
        (c) =>
          (c.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.text || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Inbox</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.125rem' }}>
            {count} total conversations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.8125rem', width: 240, outline: 'none' }}
            />
          </div>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', outline: 'none' }}>
            <option value="">All decisions</option>
            <option value="CREATE_SUBTASK">Ticket Created</option>
            <option value="IGNORE">Ignored</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '3rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No conversations found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map((conv) => {
            const badge = DECISION_BADGES[conv.ai_decision] || DECISION_BADGES.IGNORE;
            return (
              <div key={conv.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'border-color 0.15s' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 600, fontSize: '0.8125rem', color: 'var(--accent)' }}>
                  {(conv.client_name || conv.chat_id || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{conv.client_name || conv.chat_id}</span>
                    <span style={{ ...badge, fontSize: '0.6875rem', fontWeight: 500, padding: '0.125rem 0.5rem', borderRadius: 99 }}>
                      {conv.ai_decision === 'CREATE_SUBTASK' ? 'Ticket' : conv.ai_decision === 'IGNORE' ? 'Ignored' : conv.ai_decision}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.text || <em style={{ color: 'var(--text-muted)' }}>No message text</em>}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{timeAgo(conv.created_at)}</div>
                  {conv.tickets && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.125rem' }}>
                      #{conv.tickets.id?.slice(0, 8)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: '0.8125rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
            Previous
          </button>
          <span style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {page + 1} / {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: '0.8125rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
