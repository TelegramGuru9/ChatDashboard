'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Paperclip, Package } from 'lucide-react';

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
  photo_url?: string | null;
}

interface PkgConfig {
  name: string;
  message: string;
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

const LABELS       = ['COLD','CURIOUS','WARM','HOT','BUYER','TIMEWASTER','CUSTOM'];
const FILTER_LABELS = ['All','COLD','CURIOUS','WARM','HOT','BUYER','TIMEWASTER'];
const INTERESTS    = ['SOLO','DILDO','SQUIRTING','DESSOUS','HIGHHEELS','BATHTUB','FEET','TOYS','OUTDOOR','COUPLE'];

const LABEL_COLOR: Record<string,string> = {
  COLD:'text-cyan-400 border-cyan-400/40 bg-cyan-400/10',
  CURIOUS:'text-blue-400 border-blue-400/40 bg-blue-400/10',
  WARM:'text-orange-400 border-orange-400/40 bg-orange-400/10',
  HOT:'text-pink-400 border-pink-400/40 bg-pink-400/10',
  BUYER:'text-green-400 border-green-400/40 bg-green-400/10',
  TIMEWASTER:'text-red-400 border-red-400/40 bg-red-400/10',
  CUSTOM:'text-purple-400 border-purple-400/40 bg-purple-400/10',
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
function sortByRecent(list: Conversation[]): Conversation[] {
  return [...list].sort((a,b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}
const AVATAR_COLORS = ['bg-blue-500','bg-green-500','bg-orange-500','bg-purple-500','bg-red-500','bg-cyan-500','bg-yellow-500'];
function avatarColorClass(id: number) { return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length]; }

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

function InboxContent() {
  const searchParams = useSearchParams();
  const autoSelectUserId = searchParams?.get('user') ?? null;
  const { withCreator, selectedId: creatorId } = useCreator();

  const [tgConnected, setTgConnected]   = useState<boolean | null>(null);
  const [tgAccount,   setTgAccount]     = useState('');
  const [convos,      setConvos]        = useState<Conversation[]>([]);
  const [selected,    setSelected]      = useState<Conversation | null>(null);
  const [messages,    setMessages]      = useState<Message[]>([]);
  const [insights,    setInsights]      = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsSaving,  setInsightsSaving]  = useState(false);
  const [insightsTab, setInsightsTab]   = useState<'insights'|'memory'>('insights');
  const [panelOpen,   setPanelOpen]     = useState(true);
  const [folders,     setFolders]       = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs,   setLoadingMsgs]  = useState(false);
  const [syncing,     setSyncing]       = useState(false);
  const [syncStatus,  setSyncStatus]    = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [search,      setSearch]        = useState('');
  const [labelFilter, setLabelFilter]   = useState<string>('All');
  const [sortBy,      setSortBy]        = useState<SortBy>('recent');
  const [draft,       setDraft]         = useState('');
  const [sending,     setSending]       = useState(false);
  const [sendError,   setSendError]     = useState('');
  const [broadcastOpen,   setBroadcastOpen]   = useState(false);
  const [broadcastMsg,    setBroadcastMsg]    = useState('hey wie gehts dir so 😊');
  const [broadcasting,    setBroadcasting]    = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');
  const [resetting,          setResetting]          = useState(false);
  const [paymentCollecting,  setPaymentCollecting]  = useState(false);
  const [paymentCollected,   setPaymentCollected]   = useState(false);
  const [photoCache,  setPhotoCache]    = useState<Record<string, string | null>>({});
  const [packages,    setPackages]      = useState<PkgConfig[]>([]);
  const [pkgOpen,     setPkgOpen]       = useState(false);
  const [sendingFile, setSendingFile]   = useState(false);

  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLTextAreaElement>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const lastMsgTimeRef    = useRef<string>('');
  const fetchingPhotosRef = useRef<Set<string>>(new Set());

  const api = apiBase();

  const checkStatus = useCallback(async () => {
    try {
      // Use the creator-scoped status endpoint so non-default creators (pool clients)
      // are checked correctly instead of always checking the default env-var client.
      const url = creatorId
        ? `${api}/creators/${creatorId}/status`
        : `${api}/telegram/status`;
      const d = await fetch(url).then(r => r.json());
      setTgConnected(d.connected);
      const name = d.account?.name || d.account?.username || '';
      if (name) setTgAccount(name);
      return d.connected as boolean;
    } catch { setTgConnected(false); return false; }
  }, [api, creatorId]);

  const loadFolders = useCallback(async () => {
    try {
      const d = await fetch(`${api}/telegram/folders`).then(r => r.json());
      if (Array.isArray(d.folders) && d.folders.length > 0) setFolders(d.folders);
    } catch {}
  }, [api]);

  const loadConvos = useCallback(async (folder?: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s hard timeout
    try {
      setLoadingConvos(true);
      const fp = (folder && folder !== 'All') ? `&folder=${encodeURIComponent(folder)}` : '';
      const data = await fetch(
        withCreator(`${api}/messages/conversations?limit=500${fp}`),
        { signal: controller.signal }
      ).then(r => r.json());
      setConvos(data.items || []);
      return (data.items || []).length as number;
    } catch { setConvos([]); return 0; }
    finally { clearTimeout(timeout); setLoadingConvos(false); }
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
      } else { setMessages(data); }
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setInsights(prev => prev ? { ...prev, ...patch } : patch as Insights);
      if ('ai_enabled' in patch) {
        setConvos(prev => prev.map(c => c.user_id === selected.user_id ? { ...c, ai_enabled: patch.ai_enabled } : c));
      }
    } catch {}
    finally { setInsightsSaving(false); }
  };

  const resetConversation = async (userId?: string) => {
    const targetId = userId ?? selected?.user_id;
    if (!targetId) return;
    if (!confirm('Chat komplett löschen?\n\n• Alle Nachrichten werden gelöscht\n• KI-Erinnerungen werden gelöscht\n\nDiese Aktion kann nicht rückgängig gemacht werden.')) return;
    setResetting(true);
    try {
      const res = await fetch(withCreator(`${api}/users/${targetId}/reset`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (selected?.user_id === targetId) { setSelected(null); setMessages([]); setInsights(null); lastMsgTimeRef.current = ''; }
      setConvos(prev => prev.filter(c => c.user_id !== targetId));
    } catch (e) {
      alert(`Fehler beim Löschen:\n${e instanceof Error ? e.message : e}`);
    } finally { setResetting(false); }
  };

  const markPaymentCollected = async () => {
    if (!selected) return;
    if (!confirm('Zahlung als eingegangen markieren?\n\nDies setzt den Lead auf BUYER und sendet den "Sales Completed" Alarm an dein Team.')) return;
    setPaymentCollecting(true);
    try {
      const res = await fetch(withCreator(`${api}/users/${selected.user_id}/payment-collected`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPaymentCollected(true);
      setInsights(prev => prev ? { ...prev, lead_label: 'BUYER', purchase_status: prev.purchase_status === 'REPEAT_BUYER' || prev.purchase_status === 'VIP' ? prev.purchase_status : 'BOUGHT_ONCE' } : prev);
      setTimeout(() => setPaymentCollected(false), 4000);
    } catch (e) {
      alert(`Fehler:\n${e instanceof Error ? e.message : e}`);
    } finally { setPaymentCollecting(false); }
  };

  const toggleChatAI = async (e: React.MouseEvent, userId: string, current: boolean | undefined) => {
    e.stopPropagation();
    const next = !current;
    setConvos(prev => prev.map(c => c.user_id === userId ? { ...c, ai_enabled: next } : c));
    if (selected?.user_id === userId) setInsights(prev => prev ? { ...prev, ai_enabled: next } : { ai_enabled: next });
    try {
      await fetch(`${api}/users/${userId}/insights`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_enabled: next }),
      });
    } catch { setConvos(prev => prev.map(c => c.user_id === userId ? { ...c, ai_enabled: current } : c)); }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcasting) return;
    setBroadcasting(true); setBroadcastResult('');
    try {
      const folder = activeFolder !== 'All' ? activeFolder : undefined;
      const res = await fetch(`${api}/telegram/broadcast`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim(), limit: 500, ...(folder ? { folder } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) { setBroadcastResult(`⚠ ${d.detail || 'Failed'}`); setBroadcasting(false); return; }
      if (d.job_id) {
        setBroadcastResult(`📤 Sending… 0/${d.total} sent`);
        const iv = setInterval(async () => {
          try {
            const sr = await fetch(`${api}/telegram/broadcast/status?job_id=${d.job_id}`);
            const s = await sr.json();
            setBroadcastResult(`📤 Sending… ${s.sent ?? 0}/${s.total ?? d.total} sent${s.failed > 0 ? `, ${s.failed} failed` : ''}`);
            if (s.status === 'done') { clearInterval(iv); setBroadcasting(false); setBroadcastResult(`✓ Sent to ${s.sent} chats`); loadConvos(activeFolder !== 'All' ? activeFolder : undefined); }
          } catch {}
        }, 2000);
      } else { setBroadcastResult(`✓ Sent to ${d.sent} chats`); setBroadcasting(false); loadConvos(activeFolder !== 'All' ? activeFolder : undefined); }
    } catch (e: any) { setBroadcastResult(`⚠ ${e.message}`); setBroadcasting(false); }
  };

  const sync = useCallback(async (silent = false) => {
    if (!silent) { setSyncing(true); setSyncStatus('Syncing all chats…'); }
    try {
      // Pass creator_id so sync uses the right pool client and scopes users correctly
      const cidParam = creatorId ? `&creator_id=${creatorId}` : '';
      const res = await fetch(`${api}/telegram/sync?limit_per_chat=150&max_dialogs=0${cidParam}`, { method:'POST' });
      const d = await res.json();
      if (res.ok) {
        if (!silent) setSyncStatus(`✓ Found ${d.total_dialogs || 0} chats · ${d.synced_messages || 0} new msgs`);
        fetch(`${api}/telegram/sync-folders`, { method:'POST' }).then(() => loadFolders()).catch(() => {});
        await loadConvos(activeFolder !== 'All' ? activeFolder : undefined);
      } else { if (!silent) setSyncStatus(`⚠ ${d.detail || 'Sync failed'}`); }
    } catch (e: any) { if (!silent) setSyncStatus(`⚠ ${e.message}`); }
    finally { if (!silent) setSyncing(false); }
  }, [api, creatorId, loadConvos, loadFolders, activeFolder]);

  const reconnect = async () => {
    setReconnecting(true); setSyncStatus('Attempting reconnect…');
    try {
      // Use creator-scoped connect so the right client (pool vs default) is reconnected
      const url = creatorId
        ? `${api}/creators/${creatorId}/connect`
        : `${api}/telegram/reconnect`;
      const d = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
      const ok = d.status === 'connected' || d.status === 'reconnected';
      if (ok) {
        setTgConnected(true);
        setTgAccount(d.account_name || d.account || '');
        setSyncStatus('✓ Reconnected — syncing chats…');
        await sync();
      } else {
        const detail = d.detail || 'Unknown error';
        const isSession = /session|unauthorized|auth_key/i.test(detail);
        const isConfig  = /api_id|api_hash|env var/i.test(detail);
        const hint = isSession ? ' → Go to Creators page and re-authenticate with phone + SMS code'
                   : isConfig  ? ' → Check Railway → Variables'
                   : ' → Check Railway → Logs for full stack trace';
        setSyncStatus(`⚠ ${detail}${hint}`);
      }
    } catch (e: any) { setSyncStatus(`⚠ ${e.message}`); }
    finally { setReconnecting(false); }
  };

  const sendMessage = async () => {
    if (!draft.trim() || !selected || sending) return;
    const text = draft.trim(); setDraft(''); setSending(true); setSendError('');
    const tempId = `temp-${Date.now()}`;
    const opt: Message = { id:tempId, text, direction:'outgoing', is_ai_generated:false, created_at:new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const res = await fetch(`${api}/messages/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: selected.user_id, text }) });
      const d = await res.json();
      if (!res.ok) { setSendError(d.detail || 'Send failed'); setMessages(prev => prev.filter(m => m.id !== tempId)); setDraft(text); }
      else {
        setMessages(prev => prev.map(m => m.id === tempId ? d : m));
        lastMsgTimeRef.current = d.created_at;
        setConvos(prev => sortByRecent(prev.map(c => c.user_id === selected.user_id ? { ...c, last_message: text, last_message_direction: 'outgoing', last_message_at: d.created_at } : c)));
      }
    } catch (e: any) { setSendError(e.message); setMessages(prev => prev.filter(m => m.id !== tempId)); setDraft(text); }
    finally { setSending(false); }
  };

  const fetchPhoto = useCallback(async (userId: string) => {
    // Use a ref for deduplication — avoids stale closure on photoCache
    if (fetchingPhotosRef.current.has(userId)) return;
    fetchingPhotosRef.current.add(userId);
    try {
      const d = await fetch(`${api}/users/${userId}/photo`).then(r => r.json());
      setPhotoCache(prev => ({ ...prev, [userId]: d.photo_url || null }));
    } catch {
      setPhotoCache(prev => ({ ...prev, [userId]: null }));
    }
  }, [api]); // stable — no photoCache dep

  const loadPackages = useCallback(async () => {
    try {
      const d = await fetch(withCreator(`${api}/config/packages`)).then(r => r.json());
      if (Array.isArray(d?.value)) setPackages(d.value.filter((p: PkgConfig) => p.message));
    } catch {}
  }, [api, withCreator]);

  const sendFile = async (file: File) => {
    if (!selected || sendingFile) return;
    setSendingFile(true); setSendError('');
    const form = new FormData();
    form.append('user_id', selected.user_id);
    form.append('file', file);
    const tempId = `temp-file-${Date.now()}`;
    const opt: Message = { id: tempId, text: null, direction: 'outgoing', is_ai_generated: false, created_at: new Date().toISOString(), has_media: true, media_type: file.type };
    setMessages(prev => [...prev, opt]);
    try {
      const res = await fetch(`${api}/messages/send-file`, { method: 'POST', body: form });
      const d = await res.json();
      if (!res.ok) { setSendError(d.detail || 'File send failed'); setMessages(prev => prev.filter(m => m.id !== tempId)); }
      else setMessages(prev => prev.map(m => m.id === tempId ? d : m));
    } catch (e: any) { setSendError(e.message); setMessages(prev => prev.filter(m => m.id !== tempId)); }
    finally { setSendingFile(false); }
  };

  const sendPackage = async (pkg: PkgConfig, idx: number) => {
    if (!selected || sending) return;
    setPkgOpen(false); setSending(true); setSendError('');
    const tempId = `temp-pkg-${Date.now()}`;
    const opt: Message = { id: tempId, text: pkg.message, direction: 'outgoing', is_ai_generated: false, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, opt]);
    try {
      const res = await fetch(`${api}/messages/send-package`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.user_id, pkg_index: idx }),
      });
      const d = await res.json();
      if (!res.ok) { setSendError(d.detail || 'Package send failed'); setMessages(prev => prev.filter(m => m.id !== tempId)); }
      else {
        setMessages(prev => prev.map(m => m.id === tempId ? d : m));
        setConvos(prev => sortByRecent(prev.map(c => c.user_id === selected.user_id ? { ...c, last_message: pkg.message, last_message_direction: 'outgoing', last_message_at: new Date().toISOString() } : c)));
      }
    } catch (e: any) { setSendError(e.message); setMessages(prev => prev.filter(m => m.id !== tempId)); }
    finally { setSending(false); }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  // Step 1: load chats from DB immediately — pure DB query, no Telegram needed.
  // Runs on mount unconditionally so the list is never stuck in loading state.
  useEffect(() => {
    loadFolders();
    loadPackages();
    loadConvos();
  }, []); // eslint-disable-line

  // Step 2: check Telegram status + auto-reconnect once the creator is known.
  // Runs separately so a slow/hanging reconnect never blocks the chat list.
  useEffect(() => {
    if (!creatorId) return;
    (async () => {
      let connected = await checkStatus();

      // Try to reconnect from saved session
      if (!connected) {
        setSyncStatus('Reconnecting…');
        try {
          const d = await fetch(`${api}/creators/${creatorId}/connect`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          }).then(r => r.json());
          const ok = d.status === 'connected' || d.status === 'reconnected';
          if (ok) {
            connected = true;
            setTgConnected(true);
            if (d.account_name || d.account) setTgAccount(d.account_name || d.account || '');
            setSyncStatus('');
          } else {
            // Session expired — user must re-authenticate via phone+SMS
            setSyncStatus('⚠ Session expired — use 📱 Auth on the Creators page');
          }
        } catch (e: any) {
          setSyncStatus(`⚠ Reconnect failed: ${e?.message || 'unknown error'}`);
        }
      }

      // If connected and still no chats in DB, run a full sync to pull them in
      if (connected) {
        const count = await loadConvos();
        if (count === 0) await sync(true);
      }
    })();
  }, [creatorId]); // eslint-disable-line

  useEffect(() => {
    if (!autoSelectUserId || convos.length === 0) return;
    // Match by UUID (primary) or by telegram_id string (fallback for /hot links)
    const target = convos.find(c =>
      c.user_id === autoSelectUserId ||
      String(c.telegram_id) === autoSelectUserId
    );
    if (target) { setSelected(target); fetchPhoto(target.user_id); }
  }, [autoSelectUserId, convos]); // eslint-disable-line

  // Pre-fetch photos — throttled 5 at a time with 200ms spacing to avoid
  // flooding the Telegram client with concurrent download_profile_photo calls
  useEffect(() => {
    const top = convos.slice(0, 60);
    if (top.length === 0) return;
    let i = 0;
    let cancelled = false;
    const fetchBatch = () => {
      if (cancelled) return;
      top.slice(i, i + 5).forEach(c => fetchPhoto(c.user_id));
      i += 5;
      if (i < top.length) setTimeout(fetchBatch, 200);
    };
    fetchBatch();
    return () => { cancelled = true; };
  }, [convos, fetchPhoto]);

  useEffect(() => {
    if (selected) {
      lastMsgTimeRef.current = '';
      loadMessages(selected.user_id);
      loadInsights(selected.user_id);
      fetchPhoto(selected.user_id);
    }
  }, [selected]); // eslint-disable-line

  // SSE — always connected regardless of which chat is open.
  // Updates the left chat list for every incoming message.
  // If the sender is not yet in the list (new contact), reloads convos from DB.
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    let es: EventSource | null = null;
    const connectSSE = () => {
      es = new EventSource(`${api}/telegram/stream`);
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'connected') return;
          const msg = data.message;
          if (!msg?.id) return;

          // Update left chat list — or reload if this user isn't in the list yet
          setConvos(prev => {
            const exists = prev.some(c => c.user_id === data.user_id);
            if (!exists) {
              // Brand-new contact — reload the full list from DB
              loadConvos();
              return prev;
            }
            return sortByRecent(prev.map(c =>
              c.user_id === data.user_id
                ? { ...c, last_message: msg.text, last_message_direction: msg.direction, last_message_at: msg.created_at }
                : c
            ));
          });

          // Append to open message thread only if it's the selected chat
          const cur = selectedRef.current;
          if (cur && data.user_id === cur.user_id) {
            setMessages(prev => prev.some(m => String(m.id) === String(msg.id)) ? prev : [...prev, { ...msg, id: String(msg.id) }]);
          }
        } catch {}
      };
      es.onerror = () => { es?.close(); setTimeout(connectSSE, 3000); };
    };
    connectSSE();
    return () => { es?.close(); };
  }, [api]); // eslint-disable-line

  // Poll open chat messages every 3 s as a safety net for missed SSE events
  useEffect(() => {
    if (!selected) return;
    const safePoll = setInterval(() => loadMessages(selected.user_id, true), 3000);
    return () => clearInterval(safePoll);
  }, [selected]); // eslint-disable-line

  const filtered = (() => {
    let list = convos.filter(c => {
      const ms = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.username||'').toLowerCase().includes(search.toLowerCase()) || (c.last_message||'').toLowerCase().includes(search.toLowerCase());
      const mf = activeFolder === 'All' || (c.tg_folders || []).includes(activeFolder);
      const ml = labelFilter === 'All' || (c.lead_label || '').toUpperCase() === labelFilter;
      return ms && mf && ml;
    });
    if (sortBy === 'recent')     list = [...list].sort((a,b) => (new Date(b.last_message_at||0).getTime()) - (new Date(a.last_message_at||0).getTime()));
    else if (sortBy === 'oldest') list = [...list].sort((a,b) => (new Date(a.last_message_at||0).getTime()) - (new Date(b.last_message_at||0).getTime()));
    else if (sortBy === 'score_high') list = [...list].sort((a,b) => b.lead_score - a.lead_score);
    else if (sortBy === 'score_low')  list = [...list].sort((a,b) => a.lead_score - b.lead_score);
    return list;
  })();

  const memoryGroups = (() => {
    if (!messages.length) return [];
    const byDay: Record<string,Message[]> = {};
    messages.forEach(m => {
      const day = new Date(m.created_at).toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' });
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m);
    });
    return Object.entries(byDay).map(([day, msgs]) => ({ day, msgs }));
  })();

  return (
    <DashboardLayout>
      <div className="flex overflow-hidden" style={{ height:'calc(100vh - 52px)' }}>

        {/* ── Convo list ── */}
        <div className={cn(
          "flex flex-col flex-shrink-0 bg-background border-r border-border transition-all duration-200",
          selected ? "w-[260px] sm:w-[280px]" : "w-full"
        )}>
          {/* Header */}
          <div className="flex-shrink-0 border-b border-border">
            <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">Inbox</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{convos.length}</span>
                <button onClick={() => loadConvos()} disabled={loadingConvos} className="p-1 rounded text-primary text-base hover:bg-muted transition-colors disabled:opacity-40">↺</button>
              </div>
            </div>

            {/* Folder tabs */}
            <div className="overflow-x-auto border-b border-border">
              <div className="flex min-w-max pl-1">
                {['All', ...folders].map(f => (
                  <button key={f} onClick={() => { setActiveFolder(f); loadConvos(f !== 'All' ? f : undefined); }}
                    className={cn(
                      "px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-all",
                      activeFolder === f ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Label + sort filters */}
            <div className="px-2 pt-2 flex items-center gap-1.5 overflow-x-auto flex-nowrap">
              {FILTER_LABELS.map(lbl => {
                const active = labelFilter === lbl;
                const cls = lbl === 'All' ? 'text-primary border-primary/40 bg-primary/10' : (LABEL_COLOR[lbl] ?? '');
                return (
                  <button key={lbl} onClick={() => setLabelFilter(lbl)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0 transition-all",
                      active ? cls : "border-border text-muted-foreground"
                    )}>
                    {lbl === 'All' ? `Alle (${convos.length})` : lbl}
                  </button>
                );
              })}
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                className="ml-auto flex-shrink-0 bg-card border border-border rounded-lg px-1.5 py-0.5 text-[11px] text-foreground outline-none cursor-pointer">
                <option value="recent">Neueste</option>
                <option value="oldest">Älteste</option>
                <option value="score_high">Score ↓</option>
                <option value="score_low">Score ↑</option>
              </select>
            </div>

            {/* Status + search */}
            <div className="px-3.5 pt-2 pb-3 space-y-2">
              {/* Status banner */}
              {tgConnected === false && (
                <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/25 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <span className="text-xs font-semibold text-red-400">Telegram not connected</span>
                    <Button size="sm" className="ml-auto h-6 text-xs" onClick={reconnect} disabled={reconnecting}>
                      {reconnecting ? 'Connecting…' : '↺ Reconnect'}
                    </Button>
                  </div>
                  <a
                    href="/dashboard/creators"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors text-xs text-primary font-semibold"
                  >
                    📱 Re-authenticate with phone + SMS code →
                  </a>
                </div>
              )}
              {tgConnected === true && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/8 border border-green-500/20 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] flex-shrink-0" />
                    {tgAccount || 'Connected'}
                    <button onClick={() => sync()} disabled={syncing} className="ml-auto text-primary font-semibold disabled:opacity-50">
                      {syncing ? 'Syncing…' : '⬇ Sync'}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      setSyncStatus('🧠 Generating memories… (runs in background)');
                      try {
                        const cidParam = creatorId ? `?creator_id=${creatorId}` : '';
                        await fetch(`${api}/users/generate-memories${cidParam}`, { method: 'POST' });
                        setSyncStatus('🧠 Memory generation started — check back in a few minutes');
                      } catch { setSyncStatus('⚠ Memory generation failed'); }
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg bg-purple-500/8 border border-purple-500/20 text-xs text-purple-400 font-semibold hover:bg-purple-500/15 transition-colors"
                  >
                    🧠 Deep Sync — Generate Memories
                  </button>
                </div>
              )}
              {syncStatus && (
                <div className={cn("text-xs px-2.5 py-1.5 rounded-lg", syncStatus.startsWith('✓') ? "bg-green-500/8 text-green-400" : "bg-orange-500/8 text-orange-400")}>{syncStatus}</div>
              )}
              <input
                placeholder="Search chats…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-muted border-none rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvos && convos.length === 0 ? (
              <div className="p-7 text-center text-muted-foreground">
                <div className="text-2xl mb-2 animate-pulse">⏳</div>
                <div className="text-sm">Loading chats…</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-7 text-center text-muted-foreground">
                <div className="text-4xl mb-3">✉</div>
                <div className="font-semibold text-foreground mb-2">No chats yet</div>
                {tgConnected ? (
                  <>
                    <div className="text-xs mb-3">Import all conversations from Telegram.</div>
                    <Button size="sm" onClick={() => sync()} disabled={syncing}>
                      {syncing ? '⏳ Syncing…' : '⬇ Import All Chats'}
                    </Button>
                  </>
                ) : (
                  <div className="text-xs space-y-2">
                    <p>Telegram not connected — session may have expired.</p>
                    <a href="/dashboard/creators"
                       className="inline-block mt-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                      → Go to Creators to re-authenticate
                    </a>
                  </div>
                )}
              </div>
            ) : filtered.map(c => {
              const active = selected?.user_id === c.user_id;
              const avCls  = avatarColorClass(c.telegram_id || 0);
              const photo  = photoCache[c.user_id];
              return (
                <div
                  key={c.user_id}
                  onClick={() => { setSelected(c); fetchPhoto(c.user_id); setPaymentCollected(false); }}
                  className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer border-b border-border/40 transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/40"
                  )}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex-shrink-0 relative">
                    {photo ? (
                      <img src={photo} alt={c.name} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white", avCls)}>
                        {(c.name||'?')[0].toUpperCase()}
                      </div>
                    )}
                    {c.ai_enabled && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-semibold text-sm truncate max-w-[100px]">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.last_message_direction === 'outgoing' && <span className="text-primary">↗ </span>}
                      {c.last_message || '—'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {/* AI pill */}
                      <button
                        onClick={e => toggleChatAI(e, c.user_id, c.ai_enabled)}
                        className={cn(
                          "flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-bold border transition-all",
                          c.ai_enabled ? "bg-green-500/12 border-green-500/40 text-green-400" : "bg-muted border-border text-muted-foreground"
                        )}
                      >
                        🤖 {c.ai_enabled ? 'ON' : 'OFF'}
                      </button>
                      {/* Lead label */}
                      {c.lead_label && (
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-lg border font-semibold", LABEL_COLOR[c.lead_label] ?? 'text-muted-foreground border-border bg-muted')}>
                          {c.lead_label}
                        </span>
                      )}
                      {/* Score */}
                      <div className="flex items-center gap-1 ml-auto">
                        <div className="w-5 h-0.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full", c.lead_score >= 70 ? "bg-green-400" : c.lead_score >= 40 ? "bg-orange-400" : "bg-muted-foreground")} style={{ width:`${c.lead_score}%` }} />
                        </div>
                        <span className={cn("text-[9px]", c.lead_score >= 70 ? "text-green-400" : c.lead_score >= 40 ? "text-orange-400" : "text-muted-foreground")}>
                          {Math.round(c.lead_score)}
                        </span>
                      </div>
                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); resetConversation(c.user_id); }}
                        className="p-0.5 rounded text-muted-foreground hover:text-red-400 transition-colors text-[11px]"
                      >🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3.5 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between flex-shrink-0">
            <span>{convos.length} chats</span>
            <div className="flex gap-2 items-center">
              {tgConnected && <button onClick={() => sync()} disabled={syncing} className="text-primary disabled:opacity-50">{syncing ? 'Syncing…' : '⬇ Sync'}</button>}
              {tgConnected && convos.length > 0 && (
                <button onClick={() => { setBroadcastOpen(true); setBroadcastResult(''); }}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/12 border border-purple-500/30 text-purple-400 text-[11px] font-semibold hover:bg-purple-500/20 transition-colors">
                  📢 Broadcast
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Thread ── */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            {/* Thread header */}
            <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2.5 flex-shrink-0">
              <button onClick={() => setSelected(null)} className="sm:hidden text-primary text-xl px-1">←</button>
              {photoCache[selected.user_id] ? (
                <img src={photoCache[selected.user_id]!} alt={selected.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0", avatarColorClass(selected.telegram_id||0))}>
                  {(selected.name||'?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{selected.name}</div>
                <div className="text-xs text-muted-foreground">{selected.username ? `@${selected.username} · ` : ''}{selected.total_messages} msgs · Score {Math.round(selected.lead_score)}</div>
              </div>
              <button onClick={() => loadMessages(selected.user_id)} className="text-primary p-1 hover:bg-muted rounded transition-colors">↺</button>
              {/* AI toggle */}
              <div className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer select-none",
                insights?.ai_enabled ? "bg-green-500/10 border-green-500/30" : "bg-muted border-border"
              )} onClick={() => saveInsights({ ai_enabled: !insights?.ai_enabled })}>
                <span className={cn("text-xs font-semibold", insights?.ai_enabled ? "text-green-400" : "text-muted-foreground")}>
                  🤖 AI {insights?.ai_enabled ? 'ON' : 'OFF'}
                </span>
                <div className={cn("w-8 h-4 rounded-full relative transition-colors", insights?.ai_enabled ? "bg-green-500" : "bg-muted-foreground/30")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-card shadow transition-all", insights?.ai_enabled ? "left-4" : "left-0.5")} />
                </div>
              </div>
              <button
                onClick={() => setPanelOpen(v => !v)}
                className={cn("text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors", panelOpen ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted border-border text-muted-foreground")}
              >
                {panelOpen ? '→ Info' : '← Info'}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
              {loadingMsgs ? (
                <div className="text-center py-10 text-muted-foreground">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No messages — tap Sync to import</div>
              ) : messages.map(msg => {
                const out = msg.direction === 'outgoing';
                return (
                  <div key={msg.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[70%] px-3.5 py-2 text-sm leading-relaxed",
                      out ? "rounded-[18px_18px_5px_18px]" : "rounded-[18px_18px_18px_5px]",
                      out
                        ? msg.is_ai_generated ? "bg-purple-500/55 text-white" : "bg-primary text-white"
                        : "bg-card text-foreground"
                    )}>
                      {msg.has_media && out
                        ? <span className="flex items-center gap-1.5 opacity-90"><Paperclip className="w-3.5 h-3.5" />Datei gesendet{msg.text ? ` — ${msg.text}` : ''}</span>
                        : msg.has_media && !out
                        ? <em className="text-muted-foreground text-xs">[{msg.media_type||'media'}]</em>
                        : msg.text || <em className="text-muted-foreground text-xs">[empty]</em>
                      }
                      <div className={cn("text-[10px] mt-1 flex gap-1 items-center opacity-60", out ? "justify-end" : "justify-start")}>
                        {msg.is_ai_generated && <span className="bg-card/15 px-1 py-0.5 rounded">AI</span>}
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-border px-3 py-2.5 bg-card flex-shrink-0">
              {sendError && <div className="text-xs text-red-400 mb-1.5 px-2 py-1 rounded bg-red-500/10">⚠ {sendError}</div>}

              {/* Package dropdown */}
              {pkgOpen && packages.length > 0 && (
                <div className="mb-2 border border-border rounded-2xl overflow-hidden bg-card shadow-md">
                  <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-border">Paket senden</div>
                  {packages.map((pkg, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendPackage(pkg, idx)}
                      className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/40 last:border-0"
                    >
                      <div className="font-semibold text-foreground">{pkg.name || `Paket ${idx + 1}`}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{pkg.message?.slice(0, 80)}…</div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 items-end">
                {/* File upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ''; }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingFile || !tgConnected}
                  title="Datei hochladen"
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors border",
                    sendingFile ? "bg-muted text-muted-foreground cursor-default" : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer"
                  )}
                >
                  {sendingFile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>

                {/* Package button */}
                {packages.length > 0 && (
                  <button
                    onClick={() => setPkgOpen(v => !v)}
                    disabled={!tgConnected}
                    title="Paket senden"
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors border",
                      pkgOpen ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer"
                    )}
                  >
                    <Package className="w-4 h-4" />
                  </button>
                )}

                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={e => { setDraft(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; }}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message… (Enter to send)"
                  disabled={sending || !tgConnected}
                  rows={1}
                  className="flex-1 bg-muted border-none rounded-2xl px-3.5 py-2.5 text-sm resize-none outline-none min-h-[40px] max-h-[120px] font-inherit leading-relaxed disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !draft.trim() || !tgConnected}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-white text-lg flex-shrink-0 transition-colors",
                    sending || !draft.trim() || !tgConnected ? "bg-muted text-muted-foreground cursor-default" : "bg-primary cursor-pointer hover:bg-primary/80"
                  )}
                >
                  {sending ? '…' : '↑'}
                </button>
              </div>
              {!tgConnected && <div className="text-[11px] text-muted-foreground text-center mt-1">Telegram disconnected</div>}
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden sm:flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-4xl mb-2">✉</div>
              <div className="text-sm">Select a conversation</div>
            </div>
          </div>
        )}

        {/* ── Right panel ── */}
        {selected && panelOpen && (
          <div className="w-[270px] flex-shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto hidden md:flex">
            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0">
              {(['insights','memory'] as const).map(tab => (
                <button key={tab} onClick={() => setInsightsTab(tab)}
                  className={cn(
                    "flex-1 py-3 text-xs font-semibold capitalize border-b-2 transition-colors",
                    insightsTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  )}>
                  {tab === 'insights' ? '🎯 Insights' : '🧠 Memory'}
                </button>
              ))}
            </div>

            {insightsTab === 'insights' ? (
              <div className="p-4 space-y-4">
                {insightsLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
                ) : (
                  <>
                    {/* AI toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted">
                      <div>
                        <div className="text-sm font-semibold">AI Autopilot</div>
                        <div className="text-xs text-muted-foreground">Nika replies automatically</div>
                      </div>
                      <div
                        onClick={() => saveInsights({ ai_enabled: !insights?.ai_enabled })}
                        className={cn("w-10 h-6 rounded-full relative cursor-pointer transition-colors", insights?.ai_enabled ? "bg-green-500" : "bg-muted-foreground/30", insightsSaving && "opacity-50")}
                      >
                        <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-card shadow transition-all", insights?.ai_enabled ? "left-5" : "left-1")} />
                      </div>
                    </div>

                    {/* Lead label */}
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lead Stage</div>
                      <div className="flex flex-wrap gap-1.5">
                        {LABELS.map(l => {
                          const active = insights?.lead_label === l;
                          const cls = LABEL_COLOR[l] ?? '';
                          return (
                            <button key={l} onClick={() => saveInsights({ lead_label: l })}
                              className={cn("px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all", active ? cls : "border-border text-muted-foreground hover:border-muted-foreground")}>
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interests */}
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Interests</div>
                      <div className="flex flex-wrap gap-1">
                        {INTERESTS.map(tag => {
                          const active = insights?.interest_tags?.includes(tag);
                          return (
                            <button key={tag} onClick={() => {
                              const prev = insights?.interest_tags || [];
                              saveInsights({ interest_tags: active ? prev.filter(t => t !== tag) : [...prev, tag] });
                            }}
                              className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all",
                                active ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground")}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Purchase */}
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Purchase Status</div>
                      <select value={insights?.purchase_status || ''} onChange={e => saveInsights({ purchase_status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none cursor-pointer">
                        <option value="">— Not set —</option>
                        {['NEVER_BOUGHT','VIEWED_ONLY','BOUGHT_ONCE','REPEAT_BUYER','VIP'].map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                      </select>
                    </div>

                    {/* Loop + Wishperme */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Loop', key: 'loop_status' as keyof Insights, options: ['FREE_LOOP','PAID_LOOP','INACTIVE'] },
                        { label: 'Wishperme', key: 'wishperme_status' as keyof Insights, options: ['NOT_SHOWN','SHOWN','INTERESTED','SUBSCRIBED'] },
                      ].map(({ label, key, options }) => (
                        <div key={key}>
                          <div className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</div>
                          <select value={(insights?.[key] as string) || ''} onChange={e => saveInsights({ [key]: e.target.value })}
                            className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none cursor-pointer">
                            <option value="">—</option>
                            {options.map(v => <option key={v} value={v}>{v.replace(/_/g,' ')}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* Stats */}
                    {insights && (insights.message_count ?? 0) > 0 && (
                      <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted">
                        {[
                          { label:'Total', value: insights.message_count ?? 0 },
                          { label:'Incoming', value: insights.incoming_count ?? 0 },
                          { label:'Outgoing', value: insights.outgoing_count ?? 0 },
                          { label:'AI Sent', value: insights.ai_count ?? 0 },
                        ].map(s => (
                          <div key={s.label}>
                            <div className="text-[10px] text-muted-foreground">{s.label}</div>
                            <div className="text-base font-bold">{s.value}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notes</div>
                      <textarea
                        value={insights?.human_notes || ''}
                        onChange={e => setInsights(prev => prev ? { ...prev, human_notes: e.target.value } : { human_notes: e.target.value })}
                        onBlur={() => saveInsights({ human_notes: insights?.human_notes || '' })}
                        placeholder="Private notes…"
                        rows={3}
                        className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs outline-none resize-y font-inherit leading-relaxed"
                      />
                    </div>

                    {/* Payment Collected */}
                    <button
                      onClick={markPaymentCollected}
                      disabled={paymentCollecting}
                      className={cn(
                        "w-full py-3 rounded-xl border text-xs font-bold transition-all",
                        paymentCollected
                          ? "bg-green-500/20 border-green-500/50 text-green-400"
                          : "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 disabled:opacity-50"
                      )}
                    >
                      {paymentCollecting ? '💰 Wird verarbeitet…' : paymentCollected ? '✅ Sales Completed!' : '💰 Payment Collected'}
                    </button>

                    {/* Reset */}
                    <button
                      onClick={() => resetConversation()}
                      disabled={resetting}
                      className="w-full py-2.5 rounded-xl bg-red-500/8 border border-red-500/25 text-red-400 text-xs font-semibold hover:bg-red-500/15 transition-colors disabled:opacity-50"
                    >
                      {resetting ? '🗑 Löschen…' : '🗑 Kompletten Chat zurücksetzen'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">Full conversation timeline</p>
                {memoryGroups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No messages loaded</div>
                ) : memoryGroups.map(({ day, msgs }) => (
                  <div key={day}>
                    <div className="inline-block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 py-1 bg-muted rounded-md">{day}</div>
                    <div className="flex flex-col gap-1.5">
                      {msgs.map(m => {
                        const out = m.direction === 'outgoing';
                        return (
                          <div key={m.id} className="flex gap-1.5 items-start">
                            <span className="text-[9px] text-muted-foreground flex-shrink-0 mt-1 w-9 text-right">{formatTime(m.created_at)}</span>
                            <div className={cn(
                              "flex-1 px-2.5 py-1.5 rounded-lg text-xs leading-relaxed border-l-2",
                              out
                                ? m.is_ai_generated ? "bg-purple-500/15 text-white border-purple-500" : "bg-primary/15 text-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border"
                            )}>
                              {m.text || <em className="text-muted-foreground">[{m.media_type||'media'}]</em>}
                              {m.is_ai_generated && <span className="text-[9px] text-purple-400 ml-1.5">AI</span>}
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

      {/* Broadcast modal */}
      {broadcastOpen && (
        <div className="fixed inset-0 bg-black/80 z-[2000] flex items-center justify-center p-5"
          onClick={e => { if (e.target === e.currentTarget) setBroadcastOpen(false); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">📢 Broadcast Message</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Sends to {activeFolder !== 'All' ? `"${activeFolder}"` : 'all chats'} ({convos.length} contacts)</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setBroadcastOpen(false)}><X size={16} /></Button>
            </div>
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={4}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm outline-none resize-y font-inherit leading-relaxed mb-3"
            />
            {broadcastResult && (
              <div className={cn("px-3 py-2 rounded-xl text-sm mb-3", broadcastResult.startsWith('✓') ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                {broadcastResult}
              </div>
            )}
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
              <Button className="flex-[2] bg-purple-600 hover:bg-purple-500" onClick={sendBroadcast} disabled={broadcasting || !broadcastMsg.trim()}>
                {broadcasting ? '📤 Sending…' : `📢 Send to ${activeFolder !== 'All' ? activeFolder : 'All'} (${convos.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:640px) {
          .sm\\:hidden { display: block; }
          .sm\\:flex { display: none !important; }
        }
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
