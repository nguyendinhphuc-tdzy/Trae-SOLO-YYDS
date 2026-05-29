'use client';

import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = {
  'Open': 'var(--warning)',
  'In Progress': 'var(--accent)',
  'Done': 'var(--success)',
  'Closed': 'var(--text-muted)',
};
const PRIORITY_COLORS = {
  'High': 'var(--danger)',
  'Medium': 'var(--text-secondary)',
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

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ summary: '', description: '', priority: 'Medium', chatId: '' });
  const limit = 30;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset: page * limit });
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (search) params.set('search', search);
      const res = await fetch(`/api/tickets?${params}`);
      const json = await res.json();
      setTickets(json.data || []);
      setCount(json.count || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterPriority, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(count / limit);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        setShowCreate(false);
        setCreateForm({ summary: '', description: '', priority: 'Medium', chatId: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this ticket?')) return;
    await fetch(`/api/tickets/${id}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Tickets</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{count} total tickets</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: '0.875rem', fontWeight: 500, transition: 'opacity 0.15s' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Ticket
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Search tickets..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem 0.5rem 2rem', fontSize: '0.8125rem', width: '100%', outline: 'none' }} />
        </div>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', outline: 'none' }}>
          <option value="">All Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Done">Done</option>
          <option value="Closed">Closed</option>
        </select>
        <select value={filterPriority} onChange={(e) => { setFilterPriority(e.target.value); setPage(0); }}
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.8125rem', outline: 'none' }}>
          <option value="">All Priority</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Loading...</div>
      ) : tickets.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '3rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)' }}>
          No tickets found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tickets.map((t) => (
            <div key={t.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{t.summary}</span>
                  <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 99, fontWeight: 500, background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                    #{t.id?.slice(0, 8)}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.description || t.ai_reason || 'No description'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 99, fontWeight: 500, color: PRIORITY_COLORS[t.priority] || 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>
                  {t.priority}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 99, fontWeight: 500, color: STATUS_COLORS[t.status] || 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[t.status] || 'var(--text-muted)', display: 'inline-block' }} />
                  {t.status}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{timeAgo(t.created_at)}</span>
                <button onClick={() => handleDelete(t.id)} style={{ padding: '0.25rem', color: 'var(--danger)', opacity: 0.6, transition: 'opacity 0.15s' }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                  onMouseOut={(e) => e.currentTarget.style.opacity = 0.6}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: '0.8125rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
            Previous
          </button>
          <span style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ padding: '0.375rem 0.75rem', borderRadius: 6, fontSize: '0.8125rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}>
            Next
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.5rem', width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Create Ticket</h2>
              <button onClick={() => setShowCreate(false)} style={{ color: 'var(--text-muted)', padding: '0.25rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.375rem' }}>Summary *</label>
                <input required type="text" value={createForm.summary} onChange={(e) => setCreateForm({ ...createForm, summary: e.target.value })} placeholder="Ticket summary"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.375rem' }}>Description</label>
                <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Optional description" rows={3}
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.375rem' }}>Priority</label>
                  <select value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.375rem' }}>Chat ID</label>
                  <input type="text" value={createForm.chatId} onChange={(e) => setCreateForm({ ...createForm, chatId: e.target.value })} placeholder="Optional"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.875rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>Cancel</button>
                <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.875rem', background: 'var(--accent)', color: 'white', fontWeight: 500 }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
