'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const p = {
  bg:'#000',s1:'#1c1c1e',s2:'#2c2c2e',s3:'#3a3a3c',
  sep:'rgba(84,84,88,0.5)',
  label:'#fff',label2:'rgba(235,235,245,0.6)',label3:'rgba(235,235,245,0.3)',
  blue:'#0a84ff',green:'#30d158',red:'#ff453a',orange:'#ff9f0a',purple:'#bf5af2',
};

interface Conversation {
  user_id: string;
  telegram_id: number;
  name: string;
  username?: string;
  lead_score: number;
  total_messages: number;
  last_message?: string;
  last_message_direction: string;
  last_message_at?: string;
  ai_enabled: boolean;
}

interface Message {
  id: string;
  text: string | null;
  direction: 'incoming' | 'outgoing';
  is_ai_generated: boolean;
  created_at: string;
}

function timeAgo(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function scoreColor(s: number) { return s >= 70 ? p.green : s >= 40 ? p.orange : p.label3; }

export default function InboxPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  const loadConversations = useCallback(async () => {
    try {
      setLoadingConvos(true);
      setError('');
      const res = await fetch(`${apiBase}/messages/conversations?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConvos(data.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingConvos(false);
    }
  }, [apiBase]);

  const loadMessages = useCallback(async (userId: string) => {
    try {
      setLoadingMsgs(true);
      const res = await fetch(`${apiBase}/messages/user/${userId}/history?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [apiBase]);

  const sync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch(`${apiBase}/telegram/sync?limit_per_chat=100&max_dialogs=300`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`✓ Synced ${data.synced_messages} messages from ${data.synced_users} new users`);
        await loadConversations();
      } else {
        setSyncResult(`⚠ ${data.detail || 'Sync failed'}`);
      }
    } catch (e: any) {
      setSyncResult(`⚠ ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (selected) loadMessages(selected.user_id);
  }, [selected, loadMessages]);

  const filtered = convos.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.username?.toLowerCase().includes(search.toLowerCase()) ||
    c.last_message?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>

        {/* ── Left: conversation list ── */}
        <div style={{
          width: selected ? '320px' : '100%',
          maxWidth: '420px',
          borderRight: `1px solid rgba(84,84,88,0.5)`,
          display: 'flex', flexDirection: 'column',
          background: p.bg, flexShrink: 0,
          minWidth: selected ? '260px' : undefined,
        }} className="convo-panel">
          {/* Header */}
          <div style={{ padding: '16px 14px 10px', borderBottom: `1px solid rgba(84,84,88,0.4)` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Chats</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={loadConversations} disabled={loadingConvos} style={{ background: 'none', border: 'none', color: p.blue, cursor: 'pointer', fontSize: '18px', opacity: loadingConvos ? 0.4 : 1 }} title="Refresh">↺</button>
                <button onClick={sync} disabled={syncing} style={{
                  padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
                  background: p.blue, color: '#fff', fontSize: '12px', fontWeight: 600, opacity: syncing ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  {syncing ? '⏳ Syncing…' : '⬇ Sync'}
                </button>
              </div>
            </div>

            {/* Sync result */}
            {syncResult && (
              <div style={{ fontSize: '12px', color: syncResult.startsWith('✓') ? p.green : p.orange, marginBottom: '8px', padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)' }}>
                {syncResult}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ fontSize: '12px', color: p.red, marginBottom: '8px', padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,69,58,0.08)' }}>
                {error} — check CORS_ORIGINS in Railway
              </div>
            )}

            {/* Search */}
            <input
              placeholder="Search chats…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', background: p.s2, border: 'none', borderRadius: '10px', padding: '8px 12px', color: p.label, fontSize: '14px' }}
            />
          </div>

          {/* Conversations */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingConvos && convos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: p.label3, fontSize: '13px' }}>Loading chats…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: p.label3 }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>✉</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: p.label2 }}>No chats yet</div>
                <div style={{ fontSize: '12px', marginTop: '6px' }}>Tap <strong style={{ color: p.blue }}>⬇ Sync</strong> to import your existing Telegram conversations</div>
              </div>
            ) : filtered.map(c => {
              const on = selected?.user_id === c.user_id;
              return (
                <div key={c.user_id}
                  onClick={() => setSelected(c)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', cursor: 'pointer',
                    background: on ? 'rgba(10,132,255,0.12)' : 'transparent',
                    borderBottom: `1px solid rgba(84,84,88,0.2)`,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
                    background: `hsl(${(c.telegram_id || 0) % 360}, 45%, 35%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', fontWeight: 700, color: '#fff',
                  }}>
                    {(c.name || '?')[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: p.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: '11px', color: p.label3, flexShrink: 0 }}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: p.label3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                      {c.last_message_direction === 'outgoing' && <span style={{ color: p.blue }}>↗ </span>}
                      {c.last_message || 'No messages'}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                      <div style={{ width: '36px', height: '3px', borderRadius: '2px', background: p.s2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: scoreColor(c.lead_score), width: `${c.lead_score}%` }} />
                      </div>
                      <span style={{ fontSize: '10px', color: scoreColor(c.lead_score) }}>{Math.round(c.lead_score)}</span>
                      <span style={{ fontSize: '10px', color: p.label3 }}>{c.total_messages} msgs</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: message thread ── */}
        {selected && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: p.bg }}>
            {/* Thread header */}
            <div style={{ padding: '14px 18px', borderBottom: `1px solid rgba(84,84,88,0.4)`, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: p.blue, cursor: 'pointer', fontSize: '20px', padding: 0, lineHeight: 1 }} className="back-btn">←</button>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: `hsl(${(selected.telegram_id || 0) % 360}, 45%, 35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: '14px', flexShrink: 0 }}>
                {(selected.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div>
                <div style={{ fontSize: '11px', color: p.label3 }}>{selected.username ? `@${selected.username}` : `ID ${selected.telegram_id}`} · {selected.total_messages} messages · Score {Math.round(selected.lead_score)}</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingMsgs ? (
                <div style={{ textAlign: 'center', padding: '40px', color: p.label3 }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: p.label3 }}>No messages in this chat</div>
              ) : messages.map(msg => {
                const out = msg.direction === 'outgoing';
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '9px 13px',
                      borderRadius: out ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: out ? (msg.is_ai_generated ? p.purple : p.blue) : p.s2,
                      color: p.label, fontSize: '14px', lineHeight: '1.5',
                    }}>
                      {msg.text || <em style={{ color: p.label3, fontSize: '12px' }}>[media]</em>}
                      <div style={{ fontSize: '10px', color: out ? 'rgba(255,255,255,0.55)' : p.label3, marginTop: '4px', textAlign: out ? 'right' : 'left', display: 'flex', gap: '5px', justifyContent: out ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                        {msg.is_ai_generated && <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '6px', fontSize: '10px' }}>AI</span>}
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media(max-width:640px){
          .convo-panel { max-width:100% !important; }
          .back-btn { display:flex !important; }
        }
        @media(min-width:641px){
          .back-btn { display:none !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
