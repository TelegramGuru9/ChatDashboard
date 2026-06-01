'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(84,84,88,0.5)', sepL:'rgba(84,84,88,0.2)',
  t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
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
  tg_folders?: string[];
  lead_label?: string;
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

interface Insights {
  lead_label?: string;
  interest_tags?: string[];
  purchase_status?: string;
  loop_status?: string;
  wishperme_status?: string;
  handoff_status?: string;
  human_notes?: string;
  ai_enabled?: boolean;
  tg_folders?: string[];
  message_count?: number;
  incoming_count?: number;
  outgoing_count?: number;
  ai_count?: number;
  lead_score?: number;
}

const LABELS = ['COLD','CURIOUS','WARM','HOT','BUYER','TIMEWASTER','CUSTOM'];
const FILTER_LABELS = ['All', 'COLD', 'CURIOUS', 'WARM', 'HOT', 'BUYER', 'TIMEWASTER'];
const INTERESTS = ['SOLO','DILDO','SQUIRTING','DESSOUS','HIGHHEELS','BATHTUB','FEET','TOYS','OUTDOOR','COUPLE'];
const LABEL_COLORS: Record<string,string> = {
  COLD: C.teal, CURIOUS: C.blue, WARM: C.orange, HOT: '#ff2d55', BUYER: C.green, TIMEWASTER: C.red, CUSTOM: C.purple,
};
type SortBy = 'recent' | 'oldest' | 'score_high' | 'score_low';

function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); } catch { return ''; }
}
function scoreColor(s: number) { return s >= 70 ? C.green : s >= 40 ? C.orange : C.t3; }
function sortByRecent(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}
function avatarColor(id: number) {
  const colors = [C.blue, C.green, C.orange, C.purple, C.red, C.teal, '#ffd60a'];
  return colors[Math.abs(id) % colors.length];
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

function InboxContent() {
  const searchParams = useSearchParams();
  const autoSelectUserId = searchParams?.get('user') ?? null;
  const { withCreator } = useCreator();
  const [tgConnected, setTgConnected] = useState<boolean | null>(null);
  const [tgAccount, setTgAccount]     = useState('');
  const [convos, setConvos]           = useState<Conversation[]>([]);
  const [selected, setSelected]       = useState<Conversation | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [insights, setInsights]       = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsSaving, setInsightsSaving]   = useState(false);
  const [insightsTab, setInsightsTab] = useState<'insights'|'memory'>('insights');
  const [panelOpen, setPanelOpen]     = useState(true);
  const [folders, setFolders]         = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs]    = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [syncStatus, setSyncStatus]   = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [search, setSearch]           = useState('');
  const [labelFilter, setLabelFilter] = useState<string>('All');
  const [sortBy, setSortBy]           = useState<SortBy>('recent');
  const [draft, setDraft]             = useState('');
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastMsg, setBroadcastMsg]   = useState('hey wie gehts dir so 😊');
  const [broadcasting, setBroadcasting]   = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');
  const [resetting, setResetting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const pollRef        = useRef<NodeJS.Timeout | null>(null);
  const lastMsgTimeRef = useRef<string>('');

  const api = apiBase();

  const checkStatus = useCallback(async () => {
    try {
      const d = await fetch(`${api}/telegram/status`).then(r => r.json());
      setTgConnected(d.connected);
      if (d.account?.name) setTgAccount(d.account.name);
      return d.connected as boolean;
    } catch { setTgConnected(false); return false; }
  }, [api]);

  const loadFolders = useCallback(async () => {
    try {
      const d = await fetch(`${api}/telegram/folders`).then(r => r.json());
      if (Array.isArray(d.folders) && d.folders.length > 0) setFolders(d.folders);
    } catch { /* silent */ }
  }, [api]);

  const loadConvos = useCallback(async (folder?: string) => {
    try {
      setLoadingConvos(true);
      const folderParam = (folder && folder !== 'All') ? `&folder=${encodeURIComponent(folder)}` : '';
      const data = await fetch(withCreator(`${api}/messages/conversations?limit=500${folderParam}`)).then(r => r.json());
      setConvos(data.items || []);
      return (data.items || []).length as number;
    } catch { setConvos([]); return 0; }
    finally { setLoadingConvos(false); }
  }, [api, withCreator]);

  const loadMessages = useCallback(async (userId: string, append = false) => {
    try {
      if (!append) setLoadingMsgs(true);
      const since = append && lastMsgTimeRef.current ? `&since=${encodeURIComponent(lastMsgTimeRef.current)}` : '';
      const data: Message[] = await fetch(`${api}/messages/user/${userId}/history?limit=300${since}`).then(r => r.json());
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
      if (data.length > 0) lastMsgTimeRef.current = data[data.length - 1].created_at;
    } catch { if (!append) setMessages([]); }
    finally { if (!append) setLoadingMsgs(false); }
  }, [api]);

  const loadInsights = useCallback(async (userId: string) => {
    setInsightsLoading(true);
    try {
      const d = await fetch(`${api}/users/${userId}/insights`).then(r => r.json());
      setInsights(d);
    } catch { setInsights(null); }
    finally { setInsightsLoading(false); }
  }, [api]);

  const saveInsights = async (patch: Partial<Insights>) => {
    if (!selected) return;
    setInsightsSaving(true);
    try {
      await fetch(`${api}/users/${selected.user_id}/insights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setInsights(prev => prev ? { ...prev, ...patch } : patch as Insights);
      // Update convo ai_enabled in list
      if ('ai_enabled' in patch) {
        setConvos(prev => prev.map(c => c.user_id === selected.user_id ? { ...c, ai_enabled: patch.ai_enabled } : c));
      }
    } catch { /* silent */ }
    finally { setInsightsSaving(false); }
  };

  const resetConversation = async (userId?: string) => {
    const targetId = userId ?? selected?.user_id;
    if (!targetId) return;
    if (!confirm('Kompletten Chat löschen?\n\nAlle Nachrichten, Erinnerungen und Daten werden gelöscht. Der Bot startet von vorne.\n\nDiese Aktion kann nicht rückgängig gemacht werden.')) return;
    setResetting(true);
    try {
      const res = await fetch(withCreator(`${api}/users/${targetId}/reset`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Clear messages + insights if this chat is currently open
      if (selected?.user_id === targetId) {
        setMessages([]);
        setInsights(null);
        lastMsgTimeRef.current = '';
        setSelected(null);
      }
      // Remove from conversation list entirely
      setConvos(prev => prev.filter(c => c.user_id !== targetId));
    } catch (e) {
      alert('Fehler beim Löschen. Bitte erneut versuchen.');
      console.error('Reset failed:', e);
    }
    finally { setResetting(false); }
  };

  const toggleChatAI = async (e: React.MouseEvent, userId: string, current: boolean | undefined) => {
    e.stopPropagation();
    const next = !current;
    // Optimistic update
    setConvos(prev => prev.map(c => c.user_id === userId ? { ...c, ai_enabled: next } : c));
    if (selected?.user_id === userId) setInsights(prev => prev ? { ...prev, ai_enabled: next } : { ai_enabled: next });
    try {
      await fetch(`${api}/users/${userId}/insights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_enabled: next }),
      });
    } catch {
      // Revert on failure
      setConvos(prev => prev.map(c => c.user_id === userId ? { ...c, ai_enabled: current } : c));
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return;
    setBroadcasting(true); setBroadcastResult('');
    try {
      const folder = activeFolder !== 'All' ? activeFolder : undefined;
      const res = await fetch(`${api}/telegram/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim(), limit: 500, ...(folder ? { folder } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) { setBroadcastResult(`⚠ ${d.detail || 'Failed'}`); setBroadcasting(false); return; }

      // New async response: { status: "started", job_id, total, eta_seconds }
      if (d.job_id) {
        setBroadcastResult(`📤 Sending… 0/${d.total} sent`);
        const pollInterval = setInterval(async () => {
          try {
            const sr = await fetch(`${api}/telegram/broadcast/status?job_id=${d.job_id}`);
            const s = await sr.json();
            if (!s) return;
            setBroadcastResult(`📤 Sending… ${s.sent ?? 0}/${s.total ?? d.total} sent${s.failed > 0 ? `, ${s.failed} failed` : ''}`);
            if (s.status === 'done') {
              clearInterval(pollInterval);
              setBroadcasting(false);
              setBroadcastResult(`✓ Sent to ${s.sent} chats${s.failed > 0 ? `, ${s.failed} failed` : ''}`);
              loadConvos(activeFolder !== 'All' ? activeFolder : undefined);
            }
          } catch { /* keep polling */ }
        }, 2000);
      } else {
        // Legacy sync response fallback
        setBroadcastResult(`✓ Sent to ${d.sent} chats${d.failed > 0 ? `, ${d.failed} failed` : ''}`);
        setBroadcasting(false);
        loadConvos(activeFolder !== 'All' ? activeFolder : undefined);
      }
    } catch (e: any) { setBroadcastResult(`⚠ ${e.message}`); setBroadcasting(false); }
  };

  const sync = useCallback(async (silent = false) => {
    if (!silent) { setSyncing(true); setSyncStatus('Syncing all chats (main + archived)…'); }
    try {
      // limit=0 → unlimited, syncs main + archived folders
      const res = await fetch(`${api}/telegram/sync?limit_per_chat=150&max_dialogs=0`, { method:'POST' });
      const d = await res.json();
      if (res.ok) {
        const totalMsg = d.total_dialogs > 0
          ? `✓ Found ${d.total_dialogs} chats · ${d.synced_users} new · ${d.synced_messages} new msgs`
          : `✓ Synced ${d.synced_messages} messages from ${d.synced_users} new chats`;
        if (!silent) setSyncStatus(totalMsg);
        // Also fetch folder tags in background
        fetch(`${api}/telegram/sync-folders`, { method:'POST' }).then(() => loadFolders()).catch(() => {});
        await loadConvos(activeFolder !== 'All' ? activeFolder : undefined);
      } else {
        if (!silent) setSyncStatus(`⚠ ${d.detail || 'Sync failed'}`);
      }
    } catch (e: any) { if (!silent) setSyncStatus(`⚠ ${e.message}`); }
    finally { if (!silent) setSyncing(false); }
  }, [api, loadConvos, loadFolders, activeFolder]);

  const reconnect = async () => {
    setReconnecting(true); setSyncStatus('Attempting reconnect…');
    try {
      const d = await fetch(`${api}/telegram/reconnect`, { method:'POST' }).then(r => r.json());
      if (d.status === 'reconnected') {
        setTgConnected(true); setTgAccount(d.account || '');
        setSyncStatus('✓ Reconnected — syncing chats…');
        await sync();
      } else {
        setSyncStatus(`⚠ Reconnect failed: ${d.detail}`);
      }
    } catch (e: any) { setSyncStatus(`⚠ ${e.message}`); }
    finally { setReconnecting(false); }
  };

  const sendMessage = async () => {
    if (!draft.trim() || !selected || sending) return;
    const text = draft.trim();
    setDraft(''); setSending(true); setSendError('');
    const tempId = `temp-${Date.now()}`;
    const opt: Message = { id:tempId, text, direction:'outgoing', is_ai_generated:false, created_at:new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const res = await fetch(`${api}/messages/send`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: selected.user_id, text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setSendError(d.detail || 'Send failed');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setDraft(text);
      } else {
        setMessages(prev => prev.map(m => m.id === tempId ? d : m));
        lastMsgTimeRef.current = d.created_at;
        setConvos(prev => {
          const updated = prev.map(c =>
            c.user_id === selected.user_id ? { ...c, last_message: text, last_message_direction: 'outgoing', last_message_at: d.created_at } : c
          );
          return sortByRecent(updated);
        });
      }
    } catch (e: any) {
      setSendError(e.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setDraft(text);
    } finally { setSending(false); }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  useEffect(() => {
    (async () => {
      const connected = await checkStatus();
      loadFolders();
      const count = await loadConvos();
      if (connected && count === 0) await sync(true);
    })();
  }, []); // eslint-disable-line

  // Auto-select user from URL param (e.g. ?user=UUID from analytics)
  useEffect(() => {
    if (!autoSelectUserId || convos.length === 0) return;
    const target = convos.find(c => c.user_id === autoSelectUserId);
    if (target) setSelected(target);
  }, [autoSelectUserId, convos]); // eslint-disable-line

  useEffect(() => {
    if (selected) {
      lastMsgTimeRef.current = '';
      loadMessages(selected.user_id);
      loadInsights(selected.user_id);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected]); // eslint-disable-line

  // SSE live stream + 3s safety-net poll
  useEffect(() => {
    if (!selected) return;
    const sseUrl = `${api}/telegram/stream`;
    let es: EventSource | null = null;

    const connect = () => {
      es = new EventSource(sseUrl);
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'connected') return;
          if (data.user_id !== selected.user_id) return;
          const msg = data.message;
          if (!msg?.id) return;
          setMessages(prev => {
            if (prev.some(m => String(m.id) === String(msg.id))) return prev;
            return [...prev, { ...msg, id: String(msg.id) }];
          });
          setConvos(prev => {
            const updated = prev.map(c =>
              c.user_id === selected.user_id
                ? { ...c, last_message: msg.text, last_message_direction: msg.direction, last_message_at: msg.created_at }
                : c
            );
            return sortByRecent(updated);
          });
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); setTimeout(connect, 3000); };
    };
    connect();
    // Safety-net poll every 3s in case SSE misses events
    const safePoll = setInterval(() => loadMessages(selected.user_id, true), 3000);
    return () => { es?.close(); clearInterval(safePoll); };
  }, [selected, api]); // eslint-disable-line

  const filtered = (() => {
    let list = convos.filter(c => {
      const matchesSearch = !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.username||'').toLowerCase().includes(search.toLowerCase()) ||
        (c.last_message||'').toLowerCase().includes(search.toLowerCase());
      const matchesFolder = activeFolder === 'All' || (c.tg_folders || []).includes(activeFolder);
      const matchesLabel  = labelFilter === 'All' || (c.lead_label || '').toUpperCase() === labelFilter;
      return matchesSearch && matchesFolder && matchesLabel;
    });
    // Sort
    if (sortBy === 'recent') {
      list = [...list].sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return ta - tb;
      });
    } else if (sortBy === 'score_high') {
      list = [...list].sort((a, b) => b.lead_score - a.lead_score);
    } else if (sortBy === 'score_low') {
      list = [...list].sort((a, b) => a.lead_score - b.lead_score);
    }
    return list;
  })();

  // ── Memory analysis: group messages by day and annotate ──
  const memoryGroups = (() => {
    if (!messages.length) return [];
    const byDay: Record<string, Message[]> = {};
    messages.forEach(m => {
      const day = new Date(m.created_at).toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' });
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m);
    });
    return Object.entries(byDay).map(([day, msgs]) => ({ day, msgs }));
  })();

  const statusBanner = () => {
    if (tgConnected === null) return null;
    if (tgConnected) return (
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 12px', borderRadius:'10px', background:'rgba(48,209,88,0.08)', border:'1px solid rgba(48,209,88,0.2)', fontSize:'12px', color:C.green, marginBottom:'10px' }}>
        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}`, flexShrink:0 }} />
        {tgAccount || 'Connected'}
        <button onClick={() => sync()} disabled={syncing} style={{ marginLeft:'auto', background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:'12px', fontWeight:600, padding:0, opacity:syncing?0.5:1 }}>
          {syncing ? 'Syncing…' : '⬇ Sync'}
        </button>
      </div>
    );
    return (
      <div style={{ padding:'12px', borderRadius:'12px', background:'rgba(255,69,58,0.08)', border:'1px solid rgba(255,69,58,0.25)', marginBottom:'12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
          <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:C.red, flexShrink:0 }} />
          <span style={{ fontSize:'13px', fontWeight:600, color:C.red }}>Telegram not connected</span>
          <button onClick={reconnect} disabled={reconnecting} style={{ marginLeft:'auto', padding:'4px 12px', borderRadius:'8px', background:C.blue, border:'none', color:'#fff', fontSize:'12px', fontWeight:600, cursor:'pointer', opacity:reconnecting?0.5:1 }}>
            {reconnecting ? 'Reconnecting…' : '↺ Reconnect'}
          </button>
        </div>
        <div style={{ padding:'10px 12px', borderRadius:'8px', background:'rgba(0,0,0,0.4)', fontFamily:'monospace', fontSize:'11px', color:'#e5e5e5', lineHeight:1.9 }}>
          <div style={{ color:C.t3 }}># Mac Terminal:</div>
          <div>cd ~/Downloads/ai-telegram-crm && railway shell</div>
          <div style={{ color:C.t3 }}># In shell:</div>
          <div>pip3 install telethon && python3 -c &quot;from telethon.sync import TelegramClient; from telethon.sessions import StringSession; import os; c = TelegramClient(StringSession(), int(os.environ[&apos;TELEGRAM_API_ID&apos;]), os.environ[&apos;TELEGRAM_API_HASH&apos;]); c.start(phone=os.environ[&apos;TELEGRAM_PHONE&apos;]); print(c.session.save())&quot;</div>
          <div style={{ color:C.t3 }}># Copy output → Railway Variables → TELEGRAM_SESSION_STRING → Save → Redeploy</div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ display:'flex', height:'calc(100vh - 50px)', overflow:'hidden' }}>

        {/* ── Convo list ── */}
        <div style={{ width: selected ? 'min(280px,30%)' : '100%', borderRight:`1px solid ${C.sep}`, display:'flex', flexDirection:'column', background:C.bg, flexShrink:0, transition:'width 0.2s' }} className="convo-panel">
          {/* ── Inbox header ── */}
          <div style={{ borderBottom:`1px solid ${C.sepL}`, flexShrink:0 }}>
            {/* Title row */}
            <div style={{ padding:'12px 14px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h2 style={{ fontSize:'20px', fontWeight:700, margin:0, color:C.t1 }}>Inbox</h2>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <span style={{ fontSize:'11px', color:C.t3 }}>{convos.length}</span>
                <button onClick={() => loadConvos()} disabled={loadingConvos} style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:'18px', opacity:loadingConvos?0.4:1, padding:'2px 6px', borderRadius:'6px' }}>↺</button>
              </div>
            </div>

            {/* Folder tabs — always visible, scrollable */}
            <div style={{ overflowX:'auto', paddingBottom:'1px' }} className="folder-scroll">
              <div style={{ display:'flex', gap:'0', borderBottom:`1px solid ${C.sepL}`, paddingLeft:'4px', minWidth:'max-content' }}>
                {['All', ...folders].map(f => (
                  <button key={f} onClick={() => { setActiveFolder(f); loadConvos(f !== 'All' ? f : undefined); }} style={{
                    padding:'8px 14px', background:'none', border:'none', cursor:'pointer',
                    fontSize:'12px', fontWeight:600, whiteSpace:'nowrap',
                    color: activeFolder === f ? C.blue : C.t3,
                    borderBottom: activeFolder === f ? `2px solid ${C.blue}` : '2px solid transparent',
                    transition:'all 0.15s',
                  }}>{f}</button>
                ))}
              </div>
            </div>

            {/* Label filter chips + sort */}
            <div style={{ padding:'6px 10px 0', display:'flex', alignItems:'center', gap:'6px', flexWrap:'nowrap', overflowX:'auto' }} className="filter-scroll">
              {FILTER_LABELS.map(lbl => {
                const active = labelFilter === lbl;
                const col = lbl === 'All' ? C.blue : (LABEL_COLORS[lbl] ?? C.t3);
                return (
                  <button key={lbl} onClick={() => setLabelFilter(lbl)} style={{
                    padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:600,
                    cursor:'pointer', border:'1px solid', whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s',
                    background: active ? `${col}22` : 'transparent',
                    borderColor: active ? col : 'rgba(84,84,88,0.35)',
                    color: active ? col : C.t3,
                  }}>
                    {lbl === 'All' ? `Alle (${convos.length})` : lbl}
                  </button>
                );
              })}
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} style={{
                marginLeft:'auto', flexShrink:0, background:C.s2, border:`1px solid rgba(84,84,88,0.35)`,
                borderRadius:'8px', padding:'3px 7px', color:C.t2, fontSize:'11px', outline:'none', cursor:'pointer',
              }}>
                <option value="recent">Neueste</option>
                <option value="oldest">Älteste</option>
                <option value="score_high">Score ↓</option>
                <option value="score_low">Score ↑</option>
              </select>
            </div>

            {/* Search + status */}
            <div style={{ padding:'8px 14px 10px' }}>
              {statusBanner()}
              {syncStatus && (
                <div style={{ fontSize:'12px', padding:'5px 10px', borderRadius:'8px', marginBottom:'8px',
                  background: syncStatus.startsWith('✓') ? 'rgba(48,209,88,0.08)' : 'rgba(255,149,10,0.08)',
                  color: syncStatus.startsWith('✓') ? C.green : C.orange }}>
                  {syncStatus}
                </div>
              )}
              <input placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', background:C.s2, border:'none', borderRadius:'10px', padding:'8px 12px', color:C.t1, fontSize:'14px', outline:'none' }} />
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {loadingConvos && convos.length === 0 ? (
              <div style={{ textAlign:'center', padding:'50px 20px', color:C.t3 }}>Loading chats…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:'28px 20px', textAlign:'center', color:C.t3 }}>
                <div style={{ fontSize:'32px', marginBottom:'10px' }}>✉</div>
                <div style={{ fontSize:'14px', fontWeight:600, color:C.t2, marginBottom:'8px' }}>No chats yet</div>
                {tgConnected ? (
                  <>
                    <div style={{ fontSize:'12px', marginBottom:'12px' }}>Tap below to import all existing conversations.</div>
                    <button onClick={() => sync()} disabled={syncing} style={{ padding:'10px 20px', borderRadius:'12px', background:C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:syncing?0.6:1 }}>
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
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', cursor:'pointer',
                    background: on ? 'rgba(10,132,255,0.1)' : 'transparent',
                    borderBottom:`1px solid rgba(84,84,88,0.12)`, transition:'background 0.1s' }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background='transparent'; }}
                >
                  <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:ac, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:700, color:'#fff', flexShrink:0, position:'relative' }}>
                    {(c.name||'?')[0].toUpperCase()}
                    {/* AI active indicator dot */}
                    {c.ai_enabled && (
                      <div style={{ position:'absolute', bottom:'1px', right:'1px', width:'9px', height:'9px', borderRadius:'50%', background:C.green, border:`1.5px solid ${C.bg}` }} />
                    )}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'4px' }}>
                      <span style={{ fontWeight:600, fontSize:'13px', color:C.t1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'110px' }}>{c.name}</span>
                      <span style={{ fontSize:'10px', color:C.t3, flexShrink:0 }}>{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div style={{ fontSize:'12px', color:C.t3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>
                      {c.last_message_direction === 'outgoing' && <span style={{ color:C.blue }}>↗ </span>}
                      {c.last_message || '—'}
                    </div>
                    <div style={{ display:'flex', gap:'5px', marginTop:'4px', alignItems:'center' }}>
                      {/* AI toggle pill */}
                      <button
                        onClick={e => toggleChatAI(e, c.user_id, c.ai_enabled)}
                        title={c.ai_enabled ? 'AI autopilot ON — click to pause' : 'AI autopilot OFF — click to activate'}
                        style={{
                          display:'flex', alignItems:'center', gap:'3px',
                          padding:'2px 7px 2px 5px', borderRadius:'10px', cursor:'pointer',
                          border: `1px solid ${c.ai_enabled ? 'rgba(48,209,88,0.4)' : 'rgba(84,84,88,0.4)'}`,
                          background: c.ai_enabled ? 'rgba(48,209,88,0.12)' : 'rgba(84,84,88,0.12)',
                          flexShrink:0, transition:'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize:'9px' }}>🤖</span>
                        <span style={{ fontSize:'9px', fontWeight:700, color: c.ai_enabled ? C.green : C.t3 }}>
                          {c.ai_enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                      {/* Lead label */}
                      {c.lead_label && (() => {
                        const lc: Record<string,string> = { HOT:C.orange, BUYER:C.green, TIMEWASTER:C.red, COLD:C.teal, CURIOUS:C.blue, CUSTOM:C.purple };
                        const col = lc[c.lead_label] ?? C.t3;
                        return <span style={{ fontSize:'9px', padding:'2px 6px', borderRadius:'8px', background:`${col}20`, color:col, fontWeight:600 }}>{c.lead_label}</span>;
                      })()}
                      {/* Score bar */}
                      <div style={{ display:'flex', alignItems:'center', gap:'3px', marginLeft:'auto' }}>
                        <div style={{ width:'22px', height:'3px', borderRadius:'2px', background:C.s3 }}>
                          <div style={{ height:'100%', background:scoreColor(c.lead_score), width:`${c.lead_score}%` }} />
                        </div>
                        <span style={{ fontSize:'9px', color:scoreColor(c.lead_score) }}>{Math.round(c.lead_score)}</span>
                      </div>
                      {/* Delete / reset chat button */}
                      <button
                        onClick={e => { e.stopPropagation(); resetConversation(c.user_id); }}
                        title="Chat zurücksetzen"
                        style={{
                          background:'none', border:'none', cursor:'pointer',
                          padding:'2px 4px', borderRadius:'6px', fontSize:'11px',
                          color:C.t3, lineHeight:1, flexShrink:0,
                          transition:'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff453a')}
                        onMouseLeave={e => (e.currentTarget.style.color = C.t3)}
                      >🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding:'8px 14px', borderTop:`1px solid ${C.sep}`, fontSize:'11px', color:C.t3, display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
            <span>{convos.length} chats</span>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              {tgConnected && (
                <button onClick={() => sync()} disabled={syncing} style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:'11px', opacity:syncing?0.5:1 }}>
                  {syncing ? 'Syncing…' : '⬇ Sync'}
                </button>
              )}
              {tgConnected && convos.length > 0 && (
                <button onClick={() => { setBroadcastOpen(true); setBroadcastResult(''); }} style={{
                  padding:'4px 10px', borderRadius:'8px', background:'rgba(191,90,242,0.12)',
                  border:'1px solid rgba(191,90,242,0.3)', color:C.purple,
                  fontSize:'11px', fontWeight:600, cursor:'pointer',
                }}>📢 Broadcast</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Thread ── */}
        {selected ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, background:C.bg }}>
            {/* Thread header */}
            <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.sepL}`, display:'flex', alignItems:'center', gap:'10px', flexShrink:0 }}>
              <button onClick={() => setSelected(null)} className="back-btn" style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:'20px', padding:'0 4px 0 0', display:'none' }}>←</button>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:avatarColor(selected.telegram_id||0), display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:'13px', flexShrink:0 }}>
                {(selected.name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:'15px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:C.t1 }}>{selected.name}</div>
                <div style={{ fontSize:'11px', color:C.t3 }}>
                  {selected.username ? `@${selected.username} · ` : ''}{selected.total_messages} msgs · Score {Math.round(selected.lead_score)}
                </div>
              </div>
              <button onClick={() => loadMessages(selected.user_id)} style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:'16px', padding:'4px' }} title="Refresh">↺</button>

              {/* Autopilot quick toggle */}
              <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 10px', borderRadius:'10px',
                background: insights?.ai_enabled ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${insights?.ai_enabled ? 'rgba(48,209,88,0.3)' : C.sep}`,
              }}>
                <span style={{ fontSize:'11px', fontWeight:600, color: insights?.ai_enabled ? C.green : C.t3 }}>
                  {insights?.ai_enabled ? '🤖 AI ON' : '🤖 AI OFF'}
                </span>
                <div onClick={() => saveInsights({ ai_enabled: !insights?.ai_enabled })}
                  style={{ width:'32px', height:'18px', borderRadius:'9px', background: insights?.ai_enabled ? C.green : C.s4,
                    cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:'2px', left: insights?.ai_enabled ? '16px' : '2px',
                    width:'14px', height:'14px', borderRadius:'50%', background:'#fff',
                    transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)' }} />
                </div>
              </div>

              <button
                onClick={() => setPanelOpen(v => !v)}
                style={{ background: panelOpen ? 'rgba(10,132,255,0.15)' : C.s2, border:`1px solid ${panelOpen ? C.blue : C.sep}`, borderRadius:'8px', color: panelOpen ? C.blue : C.t3, cursor:'pointer', fontSize:'12px', padding:'5px 10px', fontWeight:600 }}
                title="Toggle insights panel"
              >
                {panelOpen ? '→ Info' : '← Info'}
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex:1, overflowY:'auto', padding:'14px', display:'flex', flexDirection:'column', gap:'6px' }}>
              {loadingMsgs ? (
                <div style={{ textAlign:'center', padding:'40px', color:C.t3 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:C.t3 }}>No messages — tap Sync to import</div>
              ) : messages.map(msg => {
                const out = msg.direction === 'outgoing';
                return (
                  <div key={msg.id} style={{ display:'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth:'70%', padding:'9px 13px',
                      borderRadius: out ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
                      background: out ? (msg.is_ai_generated ? 'rgba(191,90,242,0.55)' : C.blue) : C.s2,
                      fontSize:'14px', lineHeight:'1.5', color:C.t1,
                      boxShadow: out ? '0 1px 4px rgba(10,132,255,0.25)' : '0 1px 3px rgba(0,0,0,0.3)',
                    }}>
                      {msg.text || <em style={{ color:C.t3, fontSize:'12px' }}>[{msg.media_type||'media'}]</em>}
                      <div style={{ fontSize:'10px', marginTop:'4px', color:'rgba(255,255,255,0.4)', display:'flex', gap:'4px', justifyContent:out?'flex-end':'flex-start', alignItems:'center' }}>
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
            <div style={{ borderTop:`1px solid ${C.sepL}`, padding:'10px 12px', background:C.s1, flexShrink:0 }}>
              {sendError && <div style={{ fontSize:'12px', color:C.red, marginBottom:'6px', padding:'4px 8px', borderRadius:'6px', background:'rgba(255,69,58,0.1)' }}>⚠ {sendError}</div>}
              <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message… (Enter to send)"
                  disabled={sending || !tgConnected}
                  rows={1}
                  style={{ flex:1, background:C.s2, border:'none', borderRadius:'14px', padding:'10px 14px', color:C.t1, fontSize:'14px', resize:'none', outline:'none', lineHeight:'1.5', minHeight:'40px', maxHeight:'120px', fontFamily:'inherit', opacity:(!tgConnected)?0.5:1 }}
                />
                <button onClick={sendMessage} disabled={sending || !draft.trim() || !tgConnected} style={{ width:'40px', height:'40px', borderRadius:'50%', background:(sending||!draft.trim()||!tgConnected)?C.s3:C.blue, border:'none', color:'#fff', fontSize:'18px', cursor:(sending||!draft.trim()||!tgConnected)?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'background 0.15s' }}>
                  {sending ? '…' : '↑'}
                </button>
              </div>
              {!tgConnected && <div style={{ fontSize:'11px', color:C.t3, marginTop:'5px', textAlign:'center' }}>Telegram disconnected — reconnect to send messages</div>}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:C.t3 }} className="empty-thread">
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'40px', marginBottom:'10px' }}>✉</div>
              <div style={{ fontSize:'14px' }}>Select a conversation</div>
            </div>
          </div>
        )}

        {/* ── Right insights panel ── */}
        {selected && panelOpen && (
          <div style={{ width:'280px', flexShrink:0, borderLeft:`1px solid ${C.sep}`, background:C.s1, display:'flex', flexDirection:'column', overflowY:'auto' }} className="insights-panel">
            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:`1px solid ${C.sepL}`, flexShrink:0 }}>
              {(['insights','memory'] as const).map(tab => (
                <button key={tab} onClick={() => setInsightsTab(tab)} style={{
                  flex:1, padding:'12px 0', background:'none', border:'none', cursor:'pointer',
                  fontSize:'12px', fontWeight:600, textTransform:'capitalize',
                  color: insightsTab===tab ? C.blue : C.t3,
                  borderBottom: insightsTab===tab ? `2px solid ${C.blue}` : '2px solid transparent',
                  transition:'color 0.15s',
                }}>{tab === 'insights' ? '🎯 Insights' : '🧠 Memory'}</button>
              ))}
            </div>

            {insightsTab === 'insights' ? (
              <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'14px' }}>
                {insightsLoading ? (
                  <div style={{ textAlign:'center', padding:'30px', color:C.t3 }}>Loading…</div>
                ) : (
                  <>
                    {/* AI Autopilot toggle */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px', borderRadius:'12px', background:C.s2 }}>
                      <div>
                        <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'2px' }}>AI Autopilot</div>
                        <div style={{ fontSize:'11px', color:C.t3 }}>Nika replies automatically</div>
                      </div>
                      <div
                        onClick={() => saveInsights({ ai_enabled: !insights?.ai_enabled })}
                        style={{ width:'42px', height:'24px', borderRadius:'12px', background: insights?.ai_enabled ? C.green : C.s4, cursor:'pointer', position:'relative', transition:'background 0.2s', opacity:insightsSaving?0.5:1 }}
                      >
                        <div style={{ position:'absolute', top:'3px', left: insights?.ai_enabled ? '21px' : '3px', width:'18px', height:'18px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)' }} />
                      </div>
                    </div>

                    {/* Lead label */}
                    <div>
                      <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Lead Stage</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                        {LABELS.map(l => {
                          const active = insights?.lead_label === l;
                          const col = LABEL_COLORS[l] ?? C.t3;
                          return (
                            <button key={l} onClick={() => saveInsights({ lead_label: l })} style={{
                              padding:'4px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:600, cursor:'pointer', border:'1px solid',
                              background: active ? `${col}20` : 'transparent',
                              borderColor: active ? col : C.sep,
                              color: active ? col : C.t3, transition:'all 0.15s',
                            }}>{l}</button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interest tags */}
                    <div>
                      <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px' }}>Interests</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                        {INTERESTS.map(tag => {
                          const active = insights?.interest_tags?.includes(tag);
                          return (
                            <button key={tag} onClick={() => {
                              const prev = insights?.interest_tags || [];
                              const next = active ? prev.filter(t => t !== tag) : [...prev, tag];
                              saveInsights({ interest_tags: next });
                            }} style={{
                              padding:'3px 9px', borderRadius:'16px', fontSize:'10px', fontWeight:500, cursor:'pointer', border:'1px solid',
                              background: active ? 'rgba(10,132,255,0.15)' : 'transparent',
                              borderColor: active ? C.blue : C.sep,
                              color: active ? C.blue : C.t3, transition:'all 0.15s',
                            }}>{tag}</button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Purchase status */}
                    <div>
                      <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Purchase Status</div>
                      <select value={insights?.purchase_status || ''} onChange={e => saveInsights({ purchase_status: e.target.value })}
                        style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'7px 10px', color:C.t1, fontSize:'12px', outline:'none' }}>
                        <option value="">— Not set —</option>
                        {['NEVER_BOUGHT','VIEWED_ONLY','BOUGHT_ONCE','REPEAT_BUYER','VIP'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                      </select>
                    </div>

                    {/* Loop / wishperme status */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                      <div>
                        <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, marginBottom:'6px' }}>Loop</div>
                        <select value={insights?.loop_status || ''} onChange={e => saveInsights({ loop_status: e.target.value })}
                          style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'7px 8px', color:C.t1, fontSize:'11px', outline:'none' }}>
                          <option value="">—</option>
                          {['FREE_LOOP','PAID_LOOP','INACTIVE'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, marginBottom:'6px' }}>Wishperme</div>
                        <select value={insights?.wishperme_status || ''} onChange={e => saveInsights({ wishperme_status: e.target.value })}
                          style={{ width:'100%', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'7px 8px', color:C.t1, fontSize:'11px', outline:'none' }}>
                          <option value="">—</option>
                          {['NOT_SHOWN','SHOWN','INTERESTED','SUBSCRIBED'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Stats */}
                    {insights && (insights.message_count ?? 0) > 0 && (
                      <div style={{ padding:'10px 12px', borderRadius:'10px', background:C.s2, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                        {[
                          { label:'Total', value: insights.message_count ?? 0 },
                          { label:'Incoming', value: insights.incoming_count ?? 0 },
                          { label:'Outgoing', value: insights.outgoing_count ?? 0 },
                          { label:'AI Sent', value: insights.ai_count ?? 0 },
                        ].map(s => (
                          <div key={s.label}>
                            <div style={{ fontSize:'10px', color:C.t3 }}>{s.label}</div>
                            <div style={{ fontSize:'15px', fontWeight:700, color:C.t1 }}>{s.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Human notes */}
                    <div>
                      <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px' }}>Notes</div>
                      <textarea
                        value={insights?.human_notes || ''}
                        onChange={e => setInsights(prev => prev ? { ...prev, human_notes: e.target.value } : { human_notes: e.target.value })}
                        onBlur={() => saveInsights({ human_notes: insights?.human_notes || '' })}
                        placeholder="Private notes about this contact…"
                        rows={3}
                        style={{ width:'100%', boxSizing:'border-box', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 10px', color:C.t1, fontSize:'12px', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
                      />
                    </div>

                    {/* Reset conversation */}
                    <button
                      onClick={resetConversation}
                      disabled={resetting}
                      style={{
                        width: '100%', padding: '9px', borderRadius: '10px',
                        background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.25)',
                        color: '#ff453a', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        opacity: resetting ? 0.5 : 1, transition: 'opacity 0.2s',
                        marginTop: '4px',
                      }}
                    >
                      {resetting ? '🗑 Löschen…' : '🗑 Kompletten Chat zurücksetzen'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Memory tab */
              <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'16px' }}>
                <div style={{ fontSize:'12px', color:C.t3 }}>Full conversation timeline with AI analysis</div>
                {memoryGroups.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'30px', color:C.t3 }}>No messages loaded</div>
                ) : memoryGroups.map(({ day, msgs }) => (
                  <div key={day}>
                    <div style={{ fontSize:'10px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'8px', padding:'4px 8px', background:C.s2, borderRadius:'6px', display:'inline-block' }}>{day}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                      {msgs.map(m => {
                        const out = m.direction === 'outgoing';
                        return (
                          <div key={m.id} style={{ display:'flex', gap:'6px', alignItems:'flex-start' }}>
                            <span style={{ fontSize:'9px', color:C.t3, flexShrink:0, marginTop:'3px', width:'36px', textAlign:'right' }}>{formatTime(m.created_at)}</span>
                            <div style={{
                              flex:1, padding:'6px 9px', borderRadius:'8px',
                              background: out ? (m.is_ai_generated ? 'rgba(191,90,242,0.15)' : 'rgba(10,132,255,0.15)') : C.s2,
                              fontSize:'12px', lineHeight:1.5, color: out ? C.t1 : C.t2,
                              borderLeft: `2px solid ${out ? (m.is_ai_generated ? C.purple : C.blue) : C.sep}`,
                            }}>
                              {m.text || <em style={{ color:C.t3 }}>[{m.media_type||'media'}]</em>}
                              {m.is_ai_generated && <span style={{ fontSize:'9px', color:C.purple, marginLeft:'6px' }}>AI</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Broadcast Modal ── */}
      {broadcastOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setBroadcastOpen(false); }}>
          <div style={{ background:C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'460px', border:`1px solid ${C.sep}` }}>
            <h3 style={{ margin:'0 0 6px', fontSize:'17px', fontWeight:700 }}>📢 Broadcast Message</h3>
            <p style={{ fontSize:'13px', color:C.t3, margin:'0 0 18px' }}>
              Sends to {activeFolder !== 'All' ? `"${activeFolder}" folder` : 'all chats'} ({convos.length} contacts).
              Nika will auto-reply to everyone who responds.
            </p>

            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={4}
              placeholder="Your message…"
              style={{ width:'100%', boxSizing:'border-box', background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'12px', padding:'12px', color:C.t1, fontSize:'14px', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5 }}
            />

            {broadcastResult && (
              <div style={{ marginTop:'10px', padding:'8px 12px', borderRadius:'8px', fontSize:'13px',
                background: broadcastResult.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
                color: broadcastResult.startsWith('✓') ? C.green : C.red }}>
                {broadcastResult}
              </div>
            )}

            <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
              <button onClick={() => setBroadcastOpen(false)} style={{ flex:1, padding:'11px', borderRadius:'12px', background:C.s3, border:'none', color:C.t2, fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={sendBroadcast} disabled={broadcasting || !broadcastMsg.trim()} style={{
                flex:2, padding:'11px', borderRadius:'12px', background:C.purple, border:'none', color:'#fff',
                fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:(broadcasting||!broadcastMsg.trim())?0.5:1,
              }}>
                {broadcasting ? `📤 Sending… please wait` : `📢 Send to ${activeFolder !== 'All' ? activeFolder : 'All'} (${convos.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:768px) {
          .convo-panel { width:100% !important; border-right:none !important; }
          .back-btn { display:block !important; }
          .empty-thread { display:none !important; }
          .insights-panel { display:none !important; }
        }
        .folder-scroll::-webkit-scrollbar { height:3px; }
        .folder-scroll::-webkit-scrollbar-track { background:transparent; }
        .folder-scroll::-webkit-scrollbar-thumb { background:rgba(84,84,88,0.4); border-radius:2px; }
        .filter-scroll::-webkit-scrollbar { height:3px; }
        .filter-scroll::-webkit-scrollbar-track { background:transparent; }
        .filter-scroll::-webkit-scrollbar-thumb { background:rgba(84,84,88,0.3); border-radius:2px; }
      `}</style>
    </DashboardLayout>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxContent />
    </Suspense>
  );
}
