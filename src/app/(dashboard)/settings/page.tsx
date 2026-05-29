'use client';

import { useState, useEffect } from 'react';

const TABS = ['General', 'AI', 'Notifications', 'Assignees'];

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{hint}</p>}
    </div>
  );
}

function Input({ type = 'text', value, onChange, placeholder, masked }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none', fontFamily: type === 'password' || masked ? 'monospace' : 'inherit' }} />
  );
}

function SaveButton({ saving }) {
  return (
    <button type="submit" disabled={saving}
      style={{ padding: '0.5rem 1.5rem', borderRadius: 8, background: 'var(--accent)', color: 'white', fontSize: '0.875rem', fontWeight: 500, opacity: saving ? 0.7 : 1, transition: 'opacity 0.15s' }}>
      {saving ? 'Saving...' : 'Save Changes'}
    </button>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('General');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [general, setGeneral] = useState({
    appName: 'Ops Dashboard',
    vipMode: 'allow_all',
  });

  const [ai, setAi] = useState({
    provider: 'gemini',
    geminiApiKey: '',
    geminiModel: 'gemini-2.5-flash-preview',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2:3b',
  });

  const [notifications, setNotifications] = useState({
    gmailUser: '',
    gmailAppPassword: '',
    gmailFrom: '',
    gmailTo: '',
    whatsappChatId: '',
  });

  const [assignees, setAssignees] = useState([
    { id: 1, name: 'Phuc', accountId: '' },
    { id: 2, name: 'Tram', accountId: '' },
    { id: 3, name: 'Vy', accountId: '' },
  ]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Settings</h1>
        {saved && <span style={{ color: 'var(--success)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg> Saved</span>}
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: tab === t ? 500 : 400, color: tab === t ? 'var(--accent)' : 'var(--text-secondary)', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} style={{ maxWidth: 560 }}>
        {tab === 'General' && (
          <>
            <Field label="App Name">
              <Input value={general.appName} onChange={(v) => setGeneral({ ...general, appName: v })} placeholder="Ops Dashboard" />
            </Field>
            <Field label="VIP Mode" hint="allow_all: process all messages. strict: only whitelisted clients.">
              <select value={general.vipMode} onChange={(e) => setGeneral({ ...general, vipMode: e.target.value })}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                <option value="allow_all">allow_all - Process all messages</option>
                <option value="strict">strict - VIP clients only</option>
              </select>
            </Field>
          </>
        )}

        {tab === 'AI' && (
          <>
            <Field label="AI Provider">
              <select value={ai.provider} onChange={(e) => setAi({ ...ai, provider: e.target.value })}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}>
                <option value="gemini">Gemini (Google AI)</option>
                <option value="ollama">Ollama (Local)</option>
              </select>
            </Field>

            {ai.provider === 'gemini' && (
              <>
                <Field label="Gemini API Key">
                  <Input type="password" value={ai.geminiApiKey} onChange={(v) => setAi({ ...ai, geminiApiKey: v })} placeholder="AIza..." masked />
                </Field>
                <Field label="Gemini Model">
                  <Input value={ai.geminiModel} onChange={(v) => setAi({ ...ai, geminiModel: v })} placeholder="gemini-2.5-flash-preview" />
                </Field>
              </>
            )}

            {ai.provider === 'ollama' && (
              <>
                <Field label="Ollama Base URL">
                  <Input value={ai.ollamaBaseUrl} onChange={(v) => setAi({ ...ai, ollamaBaseUrl: v })} placeholder="http://localhost:11434" />
                </Field>
                <Field label="Ollama Model">
                  <Input value={ai.ollamaModel} onChange={(v) => setAi({ ...ai, ollamaModel: v })} placeholder="llama3.2:3b" />
                </Field>
              </>
            )}
          </>
        )}

        {tab === 'Notifications' && (
          <>
            <Field label="Gmail Address">
              <Input type="email" value={notifications.gmailUser} onChange={(v) => setNotifications({ ...notifications, gmailUser: v })} placeholder="your-email@gmail.com" />
            </Field>
            <Field label="Gmail App Password">
              <Input type="password" value={notifications.gmailAppPassword} onChange={(v) => setNotifications({ ...notifications, gmailAppPassword: v })} placeholder="xxxx xxxx xxxx xxxx" masked />
            </Field>
            <Field label="From Address">
              <Input value={notifications.gmailFrom} onChange={(v) => setNotifications({ ...notifications, gmailFrom: v })} placeholder="your-email@gmail.com" />
            </Field>
            <Field label="To Addresses (comma separated)">
              <Input value={notifications.gmailTo} onChange={(v) => setNotifications({ ...notifications, gmailTo: v })} placeholder="email1@test.com,email2@test.com" />
            </Field>
            <Field label="WhatsApp Internal Chat ID">
              <Input value={notifications.whatsappChatId} onChange={(v) => setNotifications({ ...notifications, whatsappChatId: v })} placeholder="120363xxxx@g.us" />
            </Field>
          </>
        )}

        {tab === 'Assignees' && (
          <>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Configure team members who can be assigned to tickets. Account IDs are used by the AI to route tickets.
            </p>
            {assignees.map((a) => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{a.name}</span>
                <input type="text" value={a.accountId} onChange={(e) => setAssignees(assignees.map((x) => x.id === a.id ? { ...x, accountId: e.target.value } : x))} placeholder="Account ID"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', fontFamily: 'monospace' }} />
              </div>
            ))}
          </>
        )}

        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
          <SaveButton saving={saving} />
        </div>
      </form>
    </div>
  );
}
