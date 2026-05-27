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

const ios = {
  bg: '#000', surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

type Filter = 'all' | 'incoming' | 'outgoing' | 'ai';

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [backendUrl, setBackendUrl] = useState('');

  const getApiBase = () => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  };

  const fetchMessages = useCallback(async () => {
    const apiBase = getApiBase();
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/messages?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setMessages(data.items || []);
      setBackendUrl(apiBase);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
      setBackendUrl(apiBase);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const filtered = messages.filter(m => {
    if (filter === 'incoming' && m.direction !== 'incoming') return false;
    if (filter === 'outgoing' && m.direction !== 'outgoing') return false;
    if (filter === 'ai' && !m.is_ai_generated) return false;
    if (search && !m.text?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: messages.length },
    { key: 'incoming', label: '← In', count: messages.filter(m => m.direction === 'incoming').length },
    { key: 'outgoing', label: '→ Out', count: messages.filter(m => m.direction === 'outgoing').length },
    { key: 'ai', label: '🤖 AI', count: messages.filter(m => m.is_ai_generated).length },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '860px', color: ios.text }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Message Inbox</h1>
            <p style={{ color: ios.text2, fontSize: '13px', marginTop: '4px' }}>{messages.length} total messages</p>
          </div>
          <button onClick={fetchMessages} disabled={loading} style={{
            padding: '9px 16px', borderRadius: '12px',
            background: ios.surface, border: `1px solid ${ios.border}`,
            color: ios.text2, fontSize: '13px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
            opacity: loading ? 0.5 : 1,
          }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: ios.text3, fontSize: '14px' }}>🔍</span>
          <input
            placeholder="Search messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 34px',
              background: ios.surface2, border: `1px solid ${ios.border}`,
              borderRadius: '12px', color: ios.text, fontSize: '14px',
            }}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)} style={{
              padding: '7px 14px', borderRadius: '20px', fontSize: '13px',
              fontWeight: 500, cursor: 'pointer', border: '1px solid',
              background: filter === t.key ? ios.accent : ios.surface,
              borderColor: filter === t.key ? ios.accent : ios.border,
              color: filter === t.key ? '#fff' : ios.text2,
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              {t.label}
              <span style={{
                fontSize: '11px', padding: '1px 5px', borderRadius: '8px',
                background: filter === t.key ? 'rgba(255,255,255,0.2)' : ios.surface2,
              }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: '16px', padding: '14px 16px', borderRadius: '14px',
            background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)',
            color: '#ff6b6b', fontSize: '13px',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠️ Cannot reach backend</div>
            <div style={{ color: ios.text2, fontSize: '12px' }}>
              Tried: <code style={{ color: ios.amber }}>{backendUrl}/messages</code>
              <br />Make sure <strong>CORS_ORIGINS</strong> in Railway includes <code>https://nika-white1.vercel.app</code>
            </div>
          </div>
        )}

        {/* Messages */}
        {loading && !messages.length ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: ios.text3 }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
            Loading messages…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>💬</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
              {messages.length === 0 ? 'No messages yet' : 'No messages match your filter'}
            </div>
            <div style={{ fontSize: '13px', color: ios.text3, maxWidth: '280px', margin: '0 auto' }}>
              {messages.length === 0
                ? 'Send a message to your Telegram account (Nika White) to see it appear here'
                : 'Try adjusting your search or filter'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(msg => (
              <div key={msg.id} style={{
                background: ios.surface, borderRadius: '14px', padding: '14px 16px',
                border: `1px solid ${ios.border}`,
                borderLeft: `3px solid ${msg.direction === 'incoming' ? ios.accent : ios.green}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                    borderRadius: '20px',
                    background: msg.direction === 'incoming' ? 'rgba(10,132,255,0.15)' : 'rgba(48,209,88,0.15)',
                    color: msg.direction === 'incoming' ? ios.accent : ios.green,
                    border: `1px solid ${msg.direction === 'incoming' ? 'rgba(10,132,255,0.3)' : 'rgba(48,209,88,0.3)'}`,
                  }}>
                    {msg.direction === 'incoming' ? '← Incoming' : '→ Outgoing'}
                  </span>
                  {msg.is_ai_generated && (
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                      background: 'rgba(191,90,242,0.15)', color: ios.purple,
                      border: '1px solid rgba(191,90,242,0.3)',
                    }}>🤖 AI Generated</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: ios.text3 }}>
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: ios.text, lineHeight: 1.6, wordBreak: 'break-word' }}>
                  {msg.text || <em style={{ color: ios.text3 }}>[media or non-text message]</em>}
                </p>
                <div style={{ fontSize: '11px', color: ios.text3, marginTop: '6px' }}>
                  User #{msg.user_id?.slice(0, 8)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
