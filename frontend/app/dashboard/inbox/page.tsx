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
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  // Check Telegram status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/telegram/status`);
      const d = await res.json();
      setTgConnected(d.connected);
      if (d.account?.name) setTgAccount(d.account.name);
    } catch { setTgConnected(false); }
  }, [apiBase]);

  // Load conversation list
  const loadConvos = useCallback(async () => {
    try {
      setLoadingConvos(true);
      const res = await fetch(`${apiBase}/messages/conversations?limit=300`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConvos(data.items || []);
    } catch (e: any) {
      setConvos([]);
    } finally {
      setLoadingConvos(false);
    }
  }, [apiBase]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (userId: string) => {
    try {
      setLoadingMsgs(true);
      const res = await fetch(`${apiBase}/messages/user/${userId}/history?limit=300`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : (data.items || []));
    } catch { setMessages([]); } finally { setLoadingMsgs(false); }
  }, [apiBase]);

  // Sync
  const sync = async () => {
    if (!tgConnected) {
      setSyncStatus('⚠ Telegram is not connected — see instructions below');
      return;
    }
    setSyncing(true);
    setSyncStatus('Syncing all chats…');
    try {
      const res = await fetch(`${apiBase}/telegram/sync?limit_per_chat=100&max_dialogs=400`, { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setSyncStatus(`✓ Synced ${d.synced_messages} messages from ${d.synced_users} new chats`);
        await loadConvos();
      } else {
        setSyncStatus(`⚠ ${d.detail || 'Sync failed'}`);
      }
    } catch (e: any) { setSyncStatus(`⚠ ${e.message}`); }
    finally { setSyncing(false); }
  };

  // Reconnect
  const reconnect = async () => {
    setReconnecting(true);
    setSyncStatus('Attempting reconnect…');
    try {
      const res = await fetch(`${apiBase}/telegram/reconnect`, { method: 'POST' });
      const d = await res.json();
      if (d.status === 'reconnected') {
        setTgConnected(true);
        setTgAccount(d.account || '');
        setSyncStatus(`✓ Reconnected as ${d.account}`);
        await sync();
      } else {
        setSyncStatus(`⚠ Reconnect failed: ${d.detail}`);
      }
    } catch (e: any) { setSyncStatus(`⚠ ${e.message}`); }
    finally { setReconnecting(false); }
  };

  useEffect(() => {
    checkStatus();
    loadConvos();
  }, [checkStatus, loadConvos]);

  useEffect(() => {
    if (selected) loadMessages(selected.user_id);
  }, [selected, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = convos.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.last_message || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusBanner = () => {
    if (tgConnected === null) return null;
    if (tgConnected) return (
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 12px', borderRadius:'10px', background:'rgba(48,209,88,0.08)', border:'1px solid rgba(48,209,88,0.2)', fontSize:'12px', color:p.green, marginBottom:'10px' }}>
        <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:p.green, flexShrink:0, boxShadow:`0 0 6px ${p.green}` }} />
        Connected{tgAccount ? ` · ${tgAccount}` : ''}
        <button onClick={sync} disabled={syncing} style={{ marginLeft:'auto', background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'12px', fontWeight:600, padding:0, opacity:syncing?0.5:1 }}>
          {syncing ? 'Syncing…' : '⬇ Sync'}
        </button>
      </div>
    );

    // Disconnected — show prominent warning + instructions
    return (
      <div style={{ padding:'14px', borderRadius:'12px', background:'rgba(255,69,58,0.08)', border:'1px solid rgba(255,69,58,0.25)', marginBottom:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
          <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:p.red, flexShrink:0 }} />
          <span style={{ fontSize:'13px', fontWeight:600, color:p.red }}>Telegram not connected</span>
          <button onClick={reconnect} disabled={reconnecting} style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:'8px', background:p.blue, border:'none', color:'#fff', fontSize:'12px', fontWeight:600, cursor:'pointer', opacity:reconnecting?0.5:1 }}>
            {reconnecting ? 'Reconnecting…' : '↺ Try reconnect'}
          </button>
        </div>
        <div style={{ fontSize:'12px', color:p.label2, lineHeight:1.7 }}>
          The Telegram session has expired or been invalidated. To fix:
        </div>
        <div style={{ marginTop:'8px', padding:'10px 12px', borderRadius:'8px', background:'rgba(0,0,0,0.4)', fontFamily:'monospace', fontSize:'11px', color:'#e5e5e5', lineHeight:1.9 }}>
          <div style={{ color:p.label3, marginBottom:'4px' }}># In your Mac Terminal:</div>
          <div>cd ~/Downloads/ai-telegram-crm</div>
          <div>railway login</div>
          <div>railway link</div>
          <div>railway shell</div>
          <div style={{ marginTop:'6px', color:p.label3 }}># Then inside the Railway shell:</div>
          <div>cd /app && python3 -c "<br/>from telethon.sync import TelegramClient<br/>from telethon.sessions import StringSession<br/>import os<br/>c = TelegramClient(StringSession(), int(os.environ['TELEGRAM_API_ID']), os.environ['TELEGRAM_API_HASH'])<br/>c.start(phone=os.environ['TELEGRAM_PHONE'])<br/>print('NEW SESSION:', c.session.save())<br/>"</div>
          <div style={{ marginTop:'6px', color:p.label3 }}># Copy the printed string → Railway → Variables → TELEGRAM_SESSION_STRING → Save</div>
          <div style={{ color:p.label3 }}># Then redeploy Railway service</div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ display:'flex', height:'calc(100vh - 50px)', overflow:'hidden' }}>

        {/* ── Left panel: conversation list ── */}
        <div style={{ width: selected ? 'min(340px, 38%)' : '100%', maxWidth: selected ? '380px' : '100%', borderRight:`1px solid ${p.sep}`, display:'flex', flexDirection:'column', background:p.bg, flexShrink:0 }} className="convo-panel">

          {/* Header */}
          <div style={{ padding:'16px 14px 10px', borderBottom:`1px solid rgba(84,84,88,0.35)` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
              <h2 style={{ fontSize:'20px', fontWeight:700, margin:0 }}>Inbox</h2>
              <button onClick={loadConvos} disabled={loadingConvos} style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'20px', opacity:loadingConvos?0.4:1, padding:'2px 6px', borderRadius:'6px' }}>↺</button>
            </div>

            {statusBanner()}

            {syncStatus && (
              <div style={{ fontSize:'12px', padding:'6px 10px', borderRadius:'8px', marginBottom:'8px', background: syncStatus.startsWith('✓') ? 'rgba(48,209,88,0.08)' : 'rgba(255,149,10,0.08)', color: syncStatus.startsWith('✓') ? p.green : p.orange }}>
                {syncStatus}
              </div>
            )}

            <input placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width:'100%', background:p.s2, border:'none', borderRadius:'10px', padding:'8px 12px', color:p.label, fontSize:'14px' }} />
          </div>

          {/* List */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loadingConvos && convos.length === 0 ? (
              <div style={{ textAlign:'center', padding:'50px 20px', color:p.label3 }}>
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>⏳</div>
                Loading chats…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:'28px 20px', textAlign:'center', color:p.label3 }}>
                <div style={{ fontSize:'32px', marginBottom:'10px' }}>✉</div>
                <div style={{ fontSize:'14px', fontWeight:600, color:p.label2, marginBottom:'8px' }}>No chats yet</div>
                {tgConnected ? (
                  <div>
                    <div style={{ fontSize:'12px', marginBottom:'12px' }}>Tap the button below to import all your existing Telegram conversations.</div>
                    <button onClick={sync} disabled={syncing} style={{ padding:'10px 20px', borderRadius:'12px', background:p.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:syncing?0.6:1 }}>
                      {syncing ? '⏳ Syncing…' : '⬇ Import All Chats'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize:'12px' }}>Connect Telegram first using the instructions above.</div>
                )}
              </div>
            ) : filtered.map(c => {
              const on = selected?.user_id === c.user_id;
              const ac = avatarColor(c.telegram_id || 0);
              return (
                <div key={c.user_id} onClick={() => setSelected(c)}
                  style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 14px', cursor:'pointer', background: on ? 'rgba(10,132,255,0.1)' : 'transparent', borderBottom:`1px solid rgba(84,84,88,0.15)`, transition:'background 0.1s' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width:'40px', height:'40px', borderRadius:'50%', background:ac, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'15px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(c.name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'4px' }}>
                      <span style={{ fontWeight:600, fontSize:'14px', color:p.label, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'170px' }}>{c.name}</span>
                      <span style={{ fontSize:'11px', color:p.label3, flexShrink:0 }}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:p.label3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                      {c.last_message_direction === 'outgoing' && <span style={{ color:p.blue }}>↗ </span>}
                      {c.last_message || '—'}
                    </div>
                    <div style={{ display:'flex', gap:'6px', marginTop:'3px', alignItems:'center' }}>
                      <div style={{ width:'32px', height:'3px', borderRadius:'2px', background:p.s3, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:scoreColor(c.lead_score), width:`${c.lead_score}%` }} />
                      </div>
                      <span style={{ fontSize:'10px', color:scoreColor(c.lead_score) }}>{Math.round(c.lead_score)}</span>
                      <span style={{ fontSize:'10px', color:p.label3, marginLeft:'auto' }}>{c.total_messages} msgs</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer count */}
          {convos.length > 0 && (
            <div style={{ padding:'8px 14px', borderTop:`1px solid ${p.sep}`, fontSize:'11px', color:p.label3, textAlign:'center' }}>
              {convos.length} conversations
              {tgConnected && (
                <button onClick={sync} disabled={syncing} style={{ marginLeft:'10px', background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'11px', opacity:syncing?0.5:1 }}>
                  {syncing ? 'Syncing…' : '⬇ Sync more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: message thread ── */}
        {selected && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:p.bg }}>
            {/* Thread header */}
            <div style={{ padding:'12px 16px', borderBottom:`1px solid rgba(84,84,88,0.35)`, display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
              <button onClick={() => setSelected(null)} className="back-btn" style={{ background:'none', border:'none', color:p.blue, cursor:'pointer', fontSize:'20px', lineHeight:1, padding:0, display:'none' }}>←</button>
              <div style={{ width:'34px', height:'34px', borderRadius:'50%', background:avatarColor(selected.telegram_id||0), display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:'14px', flexShrink:0 }}>
                {(selected.name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'15px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selected.name}</div>
                <div style={{ fontSize:'11px', color:p.label3 }}>
                  {selected.username ? `@${selected.username} · ` : ''}{selected.total_messages} messages · Score {Math.round(selected.lead_score)}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {loadingMsgs ? (
                <div style={{ textAlign:'center', padding:'40px', color:p.label3 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:p.label3 }}>No messages loaded</div>
              ) : messages.map(msg => {
                const out = msg.direction === 'outgoing';
                return (
                  <div key={msg.id} style={{ display:'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth:'72%', padding:'8px 12px', borderRadius: out ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: out ? (msg.is_ai_generated ? 'rgba(191,90,242,0.6)' : p.blue) : p.s2, fontSize:'14px', lineHeight:'1.5', color:p.label }}>
                      {msg.text || <em style={{ color:p.label3, fontSize:'12px' }}>[media]</em>}
                      <div style={{ fontSize:'10px', marginTop:'4px', color:'rgba(255,255,255,0.45)', textAlign: out ? 'right' : 'left', display:'flex', gap:'4px', justifyContent: out?'flex-end':'flex-start', alignItems:'center' }}>
                        {msg.is_ai_generated && <span style={{ background:'rgba(255,255,255,0.15)', padding:'1px 5px', borderRadius:'5px' }}>AI</span>}
                        {new Date(msg.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media(max-width:640px) {
          .convo-panel { width:100% !important; max-width:100% !important; border-right:none !important; }
          .back-btn { display:block !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
