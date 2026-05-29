'use client';

import { useState, useEffect } from 'react';

export default function Header({ onMenuClick }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header style={{
      height: 'var(--header-height)', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
      padding: '0 1.5rem', gap: '1rem', position: 'sticky', top: 0, zIndex: 30,
    }}>
      <button
        onClick={onMenuClick}
        style={{
          display: 'none', padding: '0.375rem', borderRadius: 6, color: 'var(--text-secondary)',
          transition: 'background 0.15s',
        }}
        className="menu-btn"
        aria-label="Toggle menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {time}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--success)' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
        Online
      </div>

      <style>{`
        @media (max-width: 768px) { .menu-btn { display: flex !important; } }
      `}</style>
    </header>
  );
}
