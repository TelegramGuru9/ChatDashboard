'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  ai_enabled?: boolean;
}

interface Message {
  id: string;
  text: string | null;
  direction: 'incoming' | 'outgoing';
  is_ai_generated: boolean;
  created_at: string;
  has_media?: boolean;
  media_type?: string;
}

function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function scoreColor(s: number) { return s >= 70 ? p.green : s >= 40 ? p.orange : p.label3; }
function avatarColor(id: number) {
  const colors = ['#0a84ff','#30d158','#ff9f0a','#bf5af2','#ff453a','#5ac8fa','#ffd60a'];
  return colors[Math.abs(id) % colors.length];
}

export default function InboxPage() {
  const [tgConnected, setTgConnected] = useState<boolean | null>(null);
  const [tgAccount, setTgAccount] = useState('');
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastMsgTimeRef = useRef<string>('');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/telegram/status`);
      const d = await res.json();
      setTgConnected(d.connected);
      if (d.account?.name) setTgAccount(d.account.name);
      return d.connected as boolean;
    } catch { setTgConnected(false); return false; }
  }, [apiBase]);

  const loadConvos = useCallback(async () => {
    try {
      setLoadingConvos(true);
      const res = await fetch(`${apiBase}/messages/conversations?limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConvos(data.items || []);
      return (data.items || []).length as number;
    } catch { setConvos([]); return 0; }
    finally { setLoadingConvos(false); }
  }, [apiBase]);

  const loadMessages = useCallback(async (userId: string, append = false) => {
    try {
      if (!append) setLoadingMsgs(true);
      const since = append && lastMsgTimeRef.current ? `&since=${encodeURIComponent(lastMsgTimeRef.current)}` : '';
      const res = await fetch(`${apiBase}/messages/user/${userId}/history?limit=300${since}`);
      if (!res.ok) throw new Error();
      const data: Message[] = await res.json();
      if (append) {
        if (data.length > 0) {
          setMessages(prev => {
            const ids = new Set(prev.map(m => m.id));
            const fresh = data.filter(m => !ids.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } else {
        setMessages(data);
      }
      if (data.length > 0) {
        lastMsgTimeRef.current = data[data.length - 1].created_at;
      }
    } catch { if (!append) setMessages([]); }
    finally { if (!append) setLoadingMsgs(false); }
  }, [apiBase]);

  const sync = useCallback(async (silent = false) => {
    if (!silent) { setSyncing(true); setSyncStatus('Syncing all chats…'); }
    try {
      const res = await fetch(`${apiBase}/telegram/sync?limit_per_chat=150&max_dialogs=500`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        if (!silent) setSyncStatus(`✓ Synced ${d.synced_messages} messages from ${d.synced_users} new chats`);
        await loadConvos();
      } else {
        if (!silent) setSyncStatus(`⚠ ${d.detail || 'Sync failed'}`);
      }
    } catch (e: any) { if (!silent) setSyncStatus(`⚠ ${e.message}`); }
    finally { if (!silent) setSyncing(false); }
  }, [apiBase, loadConvos]);

  const reconnect = async () => {
    setReconnecting(true);
    setSyncStatus('Attempting reconnect…');
    try {
      const res = await fetch(`${apiBase}/telegram/reconnect`, { method: 'POST' });
      const d = await res.json();
      if (d.status === 'reconnected') {
        setTgConnected(true);
        setTgAccount(d.account || '');
        setSyncStatus('✓ Reconnected — syncing chats…');
        await sync();
      } else {
        setSyncStatus(`⚠ Reconnect failed: ${d.detail}`);
      }
    } catch (e: any) { setSyncStatus(`⚠ ${e.message}`); }
    finally { setReconnecting(false); }
  };

  // Send a message
  const sendMessage = async () => {
    if (!draft.trim() || !selected || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);
    setSendError('');
    // Optimistic UI — add message immediately
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = { id: tempId, text, direction: 'outgoing', is_ai_generated: false, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    try {
      const res = await fetch(`${apiBase}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.user_id, text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSendError(d.detail || 'Send failed');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setDraft(text);
      } else {
        // Replace temp with real message
        setMessages(prev => prev.map(m => m.id === tempId ? d : m));
        lastMsgTimeRef.current = d.created_at;
        // Update convo list
        setConvos(prev => prev.map(c =>
          c.user_id === selected.user_id
            ? { ...c, last_message: text, last_message_direction: 'outgoing', last_message_at: d.created_at }
            : c
        ));
      }
    } catch (e: any) {
      setSendError(e.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setDraft(text);
    } finally { setSending(false); }
  };

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initial load: check status, load convos, auto-sync if empty
  useEffect(() => {
    (async () => {
      const connected = await checkStatus();
      const count = await loadConvos();
      if (connected && count === 0) {
        await sync(true);
      }
    })();
  }, []); // eslint-disable-line

  // Load messages when conversation selected
  useEffect(() => {
    if (selected) {
      lastMsgTimeRef.current = '';
      loadMessages(selected.user_id);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selected]); // eslint-disable-line

  // Poll for new messages every 5s when a chat is open
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!selected) return;
    pollRef.current = setInterval(() => {
      loadMessages(selected.user_id, true);
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected, loadMessages]);

  const filtered = convos.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.last_message || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusBanner = () => {
    if (tgConnected === null) return null;
    if (tgConnected) return (
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 12px', borderRadius:'10px', background:'rgba(48,209,88,0.08)', border:'1px solid rgba(48,209,88,0.2)', fontSize:'12px', color:p.green, marginBottom:'10px' }}>
        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:p.green, flexShrink:0, boxShadow:`0 0 6px ${p.green}` }} />
        {tgAccount || 'Connected'}
        <button onClick={() => sync()} disabled={syncing} style={{ marginLeft:'auto', background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'12px', fontWeight:600, padding:0, opacity:syncing?0.5:1 }}>
          {syncing ? 'Syncing…' : '⬇ Sync'}
        </button>
      </div>
    );
    return (
      <div style={{ padding:'12px', borderRadius:'12px', background:'rgba(255,69,58,0.08)', border:'1px solid rgba(255,69,58,0.25)', marginBottom:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
          <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:p.red, flexShrink:0 }} />
          <span style={{ fontSize:'13px', fontWeight:600, color:p.red }}>Telegram not connected</span>
          <button onClick={reconnect} disabled={reconnecting} style={{ marginLeft:'auto', padding:'4px 12px', borderRadius:'8px', background:p.blue, border:'none', color:'#fff', fontSize:'12px', fontWeight:600, cursor:'pointer', opacity:reconnecting?0.5:1 }}>
            {reconnecting ? 'Reconnecting…' : '↺ Reconnect'}
          </button>
        </div>
        <div style={{ padding:'10px 12px', borderRadius:'8px', background:'rgba(0,0,0,0.4)', fontFamily:'monospace', fontSize:'11px', color:'#e5e5e5', lineHeight:1.9 }}>
          <div style={{ color:p.label3 }}># Mac Terminal:</div>
          <div>cd ~/Downloads/ai-telegram-crm && railway shell</div>
          <div style={{ marginTop:'4px', color:p.label3 }}># In shell:</div>
          <div>pip3 install telethon && python3 -c &quot;from telethon.sync import TelegramClient; from telethon.sessions import StringSession; import os; c = TelegramClient(StringSession(), int(os.environ[&apos;TELEGRAM_API_ID&apos;]), os.environ[&apos;TELEGRAM_API_HASH&apos;]); c.start(phone=os.environ[&apos;TELEGRAM_PHONE&apos;]); print(c.session.save())&quot;</div>
          <div style={{ marginTop:'4px', color:p.label3 }}># Copy output → Railway Variables → TELEGRAM_SESSION_STRING → Save → Redeploy</div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ display:'flex', height:'calc(100vh - 50px)', overflow:'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{ width: selected ? 'min(320px, 35%)' : '100%', borderRight:`1px solid ${p.sep}`, display:'flex', flexDirection:'column', background:p.bg, flexShrink:0, transition:'width 0.2s' }} className="convo-panel">
          <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid rgba(84,84,88,0.3)` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <h2 style={{ fontSize:'20px', fontWeight:700, margin:0, color:p.label }}>Inbox</h2>
              <button onClick={loadConvos} disabled={loadingConvos} title="Refresh" style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'18px', opacity:loadingConvos?0.4:1, padding:'2px 6px', borderRadius:'6px' }}>↺</button>
            </div>
            {statusBanner()}
            {syncStatus && (
              <div style={{ fontSize:'12px', padding:'5px 10px', borderRadius:'8px', marginBottom:'8px', background: syncStatus.startsWith('✓') ? 'rgba(48,209,88,0.08)' : 'rgba(255,149,10,0.08)', color: syncStatus.startsWith('✓') ? p.green : p.orange }}>
                {syncStatus}
              </div>
            )}
            <input placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width:'100%', boxSizing:'border-box', background:p.s2, border:'none', borderRadius:'10px', padding:'8px 12px', color:p.label, fontSize:'14px', outline:'none' }} />
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {loadingConvos && convos.length === 0 ? (
              <div style={{ textAlign:'center', padding:'50px 20px', color:p.label3 }}>Loading chats…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:'28px 20px', textAlign:'center', color:p.label3 }}>
                <div style={{ fontSize:'32px', marginBottom:'10px' }}>✉</div>
                <div style={{ fontSize:'14px', fontWeight:600, color:p.label2, marginBottom:'8px' }}>No chats yet</div>
                {tgConnected ? (
                  <>
                    <div style={{ fontSize:'12px', marginBottom:'12px' }}>Tap below to import all existing conversations.</div>
                    <button onClick={() => sync()} disabled={syncing} style={{ padding:'10px 20px', borderRadius:'12px', background:p.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:syncing?0.6:1 }}>
                      {syncing ? '⏳ Syncing…' : '⬇ Import All Chats'}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize:'12px' }}>Connect Telegram first using the instructions above.</div>
                )}
              </div>
            ) : filtered.map(c => {
              const on = selected?.user_id === c.user_id;
              const ac = avatarColor(c.telegram_id || 0);
              return (
                <div key={c.user_id} onClick={() => setSelected(c)}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', cursor:'pointer', background: on ? 'rgba(10,132,255,0.1)' : 'transparent', borderBottom:`1px solid rgba(84,84,88,0.12)`, transition:'background 0.1s' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:ac, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(c.name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'4px' }}>
                      <span style={{ fontWeight:600, fontSize:'14px', color:p.label, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'150px' }}>{c.name}</span>
                      <span style={{ fontSize:'11px', color:p.label3, flexShrink:0 }}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:p.label3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                      {c.last_message_direction === 'outgoing' && <span style={{ color:p.blue }}>↗ </span>}
                      {c.last_message || '—'}
                    </div>
                    <div style={{ display:'flex', gap:'5px', marginTop:'3px', alignItems:'center' }}>
                      <div style={{ width:'30px', height:'3px', borderRadius:'2px', background:p.s3, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:scoreColor(c.lead_score), width:`${c.lead_score}%` }} />
                      </div>
                      <span style={{ fontSize:'10px', color:scoreColor(c.lead_score) }}>{Math.round(c.lead_score)}</span>
                      {c.ai_enabled && <span style={{ fontSize:'10px', color:p.purple, marginLeft:'2px' }}>AI</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {convos.length > 0 && (
            <div style={{ padding:'8px 14px', borderTop:`1px solid ${p.sep}`, fontSize:'11px', color:p.label3, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>{convos.length} chats</span>
              {tgConnected && (
                <button onClick={() => sync()} disabled={syncing} style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'11px', opacity:syncing?0.5:1 }}>
                  {syncing ? 'Syncing…' : '⬇ Sync more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: thread ── */}
        {selected ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:p.bg }}>
            {/* Header */}
            <div style={{ padding:'10px 16px', borderBottom:`1px solid rgba(84,84,88,0.3)`, display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
              <button onClick={() => setSelected(null)} className="back-btn" style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'20px', lineHeight:1, padding:'0 4px 0 0', display:'none' }}>←</button>
              <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:avatarColor(selected.telegram_id||0), display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:'14px', flexShrink:0 }}>
                {(selected.name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'15px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:p.label }}>{selected.name}</div>
                <div style={{ fontSize:'11px', color:p.label3 }}>
                  {selected.username ? `@${selected.username} · ` : ''}{selected.total_messages} msgs · Score {Math.round(selected.lead_score)}
                </div>
              </div>
              <button onClick={() => loadMessages(selected.user_id)} style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'16px', padding:'4px' }} title="Refresh messages">↺</button>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {loadingMsgs ? (
                <div style={{ textAlign:'center', padding:'40px', color:p.label3 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:p.label3 }}>No messages in DB — tap Sync to import</div>
              ) : messages.map(msg => {
                const out = msg.direction === 'outgoing';
                return (
                  <div key={msg.id} style={{ display:'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth:'70%', padding:'9px 13px',
                      borderRadius: out ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
                      background: out ? (msg.is_ai_generated ? 'rgba(191,90,242,0.55)' : '#0a84ff') : p.s2,
                      fontSize:'14px', lineHeight:'1.5', color:p.label,
                      boxShadow: out ? '0 1px 4px rgba(10,132,255,0.25)' : '0 1px 3px rgba(0,0,0,0.3)',
                    }}>
                      {msg.text || <em style={{ color:p.label3, fontSize:'12px' }}>[{msg.media_type || 'media'}]</em>}
                      <div style={{ fontSize:'10px', marginTop:'4px', color:'rgba(255,255,255,0.4)', display:'flex', gap:'4px', justifyContent: out?'flex-end':'flex-start', alignItems:'center' }}>
                        {msg.is_ai_generated && <span style={{ background:'rgba(255,255,255,0.15)', padding:'1px 5px', borderRadius:'4px' }}>AI</span>}
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose bar */}
            <div style={{ borderTop:`1px solid rgba(84,84,88,0.3)`, padding:'10px 12px', background:p.s1, flexShrink:0 }}>
              {sendError && (
                <div style={{ fontSize:'12px', color:p.red, marginBottom:'6px', padding:'4px 8px', borderRadius:'6px', background:'rgba(255,69,58,0.1)' }}>
                  ⚠ {sendError}
                </div>
              )}
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  disabled={sending || !tgConnected}
                  rows={1}
                  style={{
                    flex:1, background:p.s2, border:'none', borderRadius:'14px', padding:'10px 14px',
                    color:p.label, fontSize:'14px', resize:'none', outline:'none', lineHeight:'1.5',
                    minHeight:'40px', maxHeight:'120px', fontFamily:'inherit',
                    opacity: (!tgConnected) ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !draft.trim() || !tgConnected}
                  style={{
                    width:'40px', height:'40px', borderRadius:'50%', background: (sending || !draft.trim() || !tgConnected) ? p.s3 : p.blue,
                    border:'none', color:'#fff', fontSize:'18px', cursor: (sending || !draft.trim() || !tgConnected) ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    transition:'background 0.15s',
                  }}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>
              {!tgConnected && (
                <div style={{ fontSize:'11px', color:p.label3, marginTop:'5px', textAlign:'center' }}>
                  Telegram disconnected — reconnect to send messages
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:p.label3 }} className="empty-thread">
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'40px', marginBottom:'10px' }}>✉</div>
              <div style={{ fontSize:'14px' }}>Select a conversation</div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media(max-width:640px) {
          .convo-panel { width:100% !important; border-right:none !important; }
          .back-btn { display:block !important; }
          .empty-thread { display:none !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
