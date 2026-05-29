'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

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

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id;

  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [convRes, msgsRes] = await Promise.all([
          fetch(`/api/conversations/${id}`),
          id ? fetch(`/api/conversations/by-chat/${id}`) : Promise.resolve({ json: () => ({}) }),
        ]);
        const convData = await convRes.json();
        setConv(convData);

        if (convData.chat_id) {
          const msgs = await fetch(`/api/conversations/by-chat/${convData.chat_id}`).then((r) => r.json());
          setMessages(Array.isArray(msgs) ? msgs : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading...</div>;
  if (!conv) return <div style={{ color: 'var(--text-muted)', padding: '2rem' }}>Conversation not found</div>;

  const ticket = conv.tickets;

  return (
    <div>
      <a href="/conversations" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        Back to Inbox
      </a>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Timeline */}
        <div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
            {conv.client_name || conv.chat_id}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{msg.direction === 'inbound' ? (msg.client_name || 'Client') : 'Bot'}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{timeAgo(msg.created_at)}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                  {msg.text || <em style={{ color: 'var(--text-muted)' }}>No text</em>}
                </p>
                {msg.ai_decision && (
                  <div style={{ marginTop: '0.5rem', display: 'inline-flex', fontSize: '0.6875rem', fontWeight: 500, padding: '0.125rem 0.5rem', borderRadius: 99, background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                    {msg.ai_decision === 'CREATE_SUBTASK' ? 'Ticket Created' : msg.ai_decision}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
            <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Client Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Name:</span> {conv.client_name || 'N/A'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Chat ID:</span> <code style={{ fontSize: '0.75rem' }}>{conv.chat_id}</code></div>
              <div><span style={{ color: 'var(--text-muted)' }}>First seen:</span> {timeAgo(conv.created_at)}</div>
            </div>
          </div>

          {ticket && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Related Ticket</h3>
              <div style={{ fontSize: '0.8125rem' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.375rem' }}>{ticket.summary}</div>
                <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[ticket.status] || 'var(--text-muted)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{ticket.status}</span>
                </div>
                <a href={`/tickets`} style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--accent)' }}>View ticket &rarr;</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
