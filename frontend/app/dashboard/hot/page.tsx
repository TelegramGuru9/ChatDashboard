'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Flame, RefreshCw, MessageSquare, Clock, TrendingUp } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

interface HotUser {
  id: string;
  telegram_id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  conversation_state?: string;
  last_message_at?: string;
  message_count?: number;
  extra_data?: Record<string, any>;
  creator_id?: string;
}

function timeAgo(ts?: string) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function stateBadge(state?: string) {
  if (!state) return null;
  const s = state.toLowerCase();
  if (s.includes('hot') || s.includes('lead')) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20">
      🔥 {state}
    </span>
  );
  if (s.includes('warm')) return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
      ♨️ {state}
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
      {state}
    </span>
  );
}

export default function HotPage() {
  const { withCreator } = useCreator();
  const api = getApi();
  const [users, setUsers] = useState<HotUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(withCreator(`${api}/users/hot/list?limit=100`));
      const data = await res.json();
      if (Array.isArray(data.items)) setUsers(data.items);
      else if (Array.isArray(data)) setUsers(data);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  const displayName = (u: HotUser) => {
    if (u.first_name || u.last_name) return `${u.first_name || ''} ${u.last_name || ''}`.trim();
    if (u.username) return `@${u.username}`;
    return u.telegram_id ? `User ${u.telegram_id}` : `ID ${u.id.slice(0, 8)}`;
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">HOT Leads</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? 'Loading…' : `${users.length} active lead${users.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        {!loading && users.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total HOT', value: users.length, icon: <Flame className="h-4 w-4 text-orange-400" />, color: 'text-orange-400' },
              { label: 'Active today', value: users.filter(u => u.last_message_at && (Date.now() - new Date(u.last_message_at).getTime()) < 86400000).length, icon: <TrendingUp className="h-4 w-4 text-green-400" />, color: 'text-green-400' },
              { label: 'Avg messages', value: users.length ? Math.round(users.reduce((s, u) => s + (u.message_count || 0), 0) / users.length) : 0, icon: <MessageSquare className="h-4 w-4 text-blue-400" />, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-muted-foreground">{s.label}</span></div>
                <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* User list */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading HOT leads…</div>
        ) : users.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🔥</div>
            <div className="font-semibold mb-1">No HOT leads yet</div>
            <div className="text-sm text-muted-foreground">Users tagged as HOT or in hot/lead_hot state will appear here.</div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              Active HOT Leads
            </div>
            <div className="divide-y divide-border">
              {users.map(u => (
                <Link key={u.id}
                  href={`/dashboard/inbox?user=${u.telegram_id || u.id}`}
                  className="flex items-center gap-3.5 px-4 py-3 hover:bg-accent transition-colors group">

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-orange-500/15 border border-orange-500/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-orange-400">
                    {(displayName(u)[0] || '?').toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{displayName(u)}</span>
                      {u.username && u.first_name && (
                        <span className="text-xs text-muted-foreground">@{u.username}</span>
                      )}
                      {stateBadge(u.conversation_state)}
                      {u.extra_data?.lead_label === 'HOT' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-300">HOT</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {u.message_count != null && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {u.message_count} messages
                        </span>
                      )}
                      {u.last_message_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(u.last_message_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
