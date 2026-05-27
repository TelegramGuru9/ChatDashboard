'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

interface Message {
  id: string;
  text: string | null;
  direction: 'incoming' | 'outgoing';
  is_ai_generated: boolean;
  created_at: string;
  user_id: string;
}

const C = {
  blue: '#3b82f6',
  green: '#10b981',
  purple: '#8b5cf6',
  red: '#ef4444',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
};

function Badge({ color, bg, border, children }: { color: string; bg: string; border: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 8px',
      borderRadius: '20px', background: bg, color, border: `1px solid ${border}`,
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      {children}
    </span>
  );
}

type Filter = 'all' | 'incoming' | 'outgoing' | 'ai';

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.endsWith('/api/v1') ? raw : raw.replace(/\/?$/, '') + '/api/v1';
  })();

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/messages?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.items || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const filtered = messages.filter(m => {
    if (filter === 'incoming' && m.direction !== 'incoming') return false;
    if (filter === 'outgoing' && m.direction !== 'outgoing') return false;
    if (filter === 'ai' && !m.is_ai_generated) return false;
    if (search && !m.text?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filterBtns: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'incoming', label: '← Incoming' },
    { key: 'outgoing', label: '→ Outgoing' },
    { key: 'ai', label: '🤖 AI Only' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Message Inbox</h1>
            <p style={{ color: C.slate400, fontSize: '13px', margin: '4px 0 0' }}>
              {messages.length} total messages
            </p>
          </div>
          <button
            onClick={fetchMessages}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '10px',
              background: C.slate800, border: '1px solid #334155',
              color: C.slate400, fontSize: '13px', cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Search + Filter */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            placeholder="Search messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: '200px',
              background: C.slate800, border: '1px solid #334155',
              borderRadius: '10px', padding: '9px 14px',
              color: '#e2e8f0', fontSize: '13px', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {filterBtns.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '8px 12px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: 500, cursor: 'pointer', border: '1px solid',
                  background: filter === f.key ? C.blue : C.slate800,
                  borderColor: filter === f.key ? C.blue : '#334155',
                  color: filter === f.key ? '#fff' : C.slate400,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '16px', padding: '14px 16px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px', color: '#fca5a5', fontSize: '13px',
          }}>
            ⚠️ {error} — make sure the backend is running and CORS is configured.
          </div>
        )}

        {/* Messages list */}
        {loading && !messages.length ? (
          <div style={{ textAlign: 'center', padding: '60px', color: C.slate500 }}>⏳ Loading messages…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
            <div style={{ color: C.slate400, fontSize: '15px' }}>No messages found</div>
            <div style={{ color: C.slate500, fontSize: '12px', marginTop: '6px' }}>
              Messages appear here once your Telegram bot receives them
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(msg => (
              <div key={msg.id} style={{
                background: C.slate900, border: '1px solid #1e293b',
                borderRadius: '12px', padding: '14px 16px',
                borderLeft: `3px solid ${msg.direction === 'incoming' ? C.blue : C.green}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {msg.direction === 'incoming' ? (
                    <Badge color="#93c5fd" bg="rgba(59,130,246,0.15)" border="rgba(59,130,246,0.3)">← In</Badge>
                  ) : (
                    <Badge color="#6ee7b7" bg="rgba(16,185,129,0.15)" border="rgba(16,185,129,0.3)">→ Out</Badge>
                  )}
                  {msg.is_ai_generated && (
                    <Badge color="#c4b5fd" bg="rgba(139,92,246,0.15)" border="rgba(139,92,246,0.3)">🤖 AI</Badge>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.slate500 }}>
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: '1.6' }}>
                  {msg.text || <span style={{ color: C.slate500, fontStyle: 'italic' }}>[media message]</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
