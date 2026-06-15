'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Flame, RefreshCw, MessageSquare, Clock, CheckCircle2, Thermometer, DollarSign } from 'lucide-react';
import Link from 'next/link';

const getApi = () =>
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

interface LeadUser {
  id:               string;
  telegram_id?:     number;
  username?:        string;
  name?:            string;
  lead_label?:      string;
  last_message_at?: string;
  message_count?:   number;
  ai_enabled?:      boolean;
  // WARM
  list_sent_at?:    string;
  // HOT
  hot_pkg_name?:    string;
  pkg_sent_at?:     string;
  // SALE
  sale_completed_at?: string;
}

function timeAgo(ts?: string | null) {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - new Date(ts + 'Z').getTime()) / 1000);
  if (isNaN(diff)) return '—';
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function displayName(u: LeadUser) {
  if (u.name && u.name !== 'Unknown') return u.name;
  if (u.username) return `@${u.username}`;
  return u.telegram_id ? `User ${u.telegram_id}` : `ID ${u.id.slice(0, 8)}`;
}

/* ── Single lead card ───────────────────────────────────────────────────────── */
function LeadCard({ u, accent }: { u: LeadUser; accent: string }) {
  const initials = (displayName(u)[0] || '?').toUpperCase();
  return (
    <Link
      href={`/dashboard/inbox?user=${u.telegram_id || u.id}`}
      className={cn(
        'block rounded-2xl border p-4 transition-shadow hover:shadow-md cursor-pointer',
        accent,
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold bg-card/60 border border-current/20">
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{displayName(u)}</div>
          {u.username && u.name && u.name !== 'Unknown' && (
            <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
          )}

          {/* Trigger label */}
          {u.lead_label === 'WARM' && (
            <div className="mt-1.5 text-xs text-blue-700 font-medium">
              📋 Liste gesendet · {timeAgo(u.list_sent_at)} ago
            </div>
          )}
          {u.lead_label === 'HOT' && (
            <div className="mt-1.5 text-xs text-orange-700 font-medium truncate">
              📦 {u.hot_pkg_name || 'Paket'} gesendet · {timeAgo(u.pkg_sent_at)} ago
            </div>
          )}
          {u.lead_label === 'BUYER' && (
            <div className="mt-1.5 text-xs text-emerald-700 font-medium">
              ✅ Zahlung bestätigt · {timeAgo(u.sale_completed_at)} ago
            </div>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            {u.message_count != null && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />{u.message_count}
              </span>
            )}
            {u.last_message_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{timeAgo(u.last_message_at)} ago
              </span>
            )}
            {!u.ai_enabled && (
              <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">manual</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ── Column ─────────────────────────────────────────────────────────────────── */
function Column({
  title, icon, count, accent, headerCls, emptyText, users,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  accent: string;
  headerCls: string;
  emptyText: string;
  users: LeadUser[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Column header */}
      <div className={cn('rounded-2xl px-4 py-3 flex items-center gap-2', headerCls)}>
        {icon}
        <span className="font-semibold text-sm">{title}</span>
        <span className="ml-auto text-xs font-bold opacity-70">{count}</span>
      </div>

      {/* Cards */}
      {users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <div className="text-muted-foreground/60 text-xs">{emptyText}</div>
        </div>
      ) : (
        users.map(u => <LeadCard key={u.id} u={u} accent={accent} />)
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
export default function HotPage() {
  const { withCreator } = useCreator();
  const api = getApi();

  const [warm,       setWarm]       = useState<LeadUser[]>([]);
  const [hot,        setHot]        = useState<LeadUser[]>([]);
  const [sale,       setSale]       = useState<LeadUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const res  = await fetch(withCreator(`${api}/users/hot/list?limit=200`));
      const data = await res.json();
      setWarm(Array.isArray(data.warm) ? data.warm : []);
      setHot (Array.isArray(data.hot)  ? data.hot  : []);
      setSale(Array.isArray(data.sale) ? data.sale : []);
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  const total = warm.length + hot.length + sale.length;

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Flame className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Lead Pipeline</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {loading ? 'Laden…' : `${total} lead${total !== 1 ? 's' : ''} total`}
              </p>
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Summary chips */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold">
              <Thermometer className="h-4 w-4" />{warm.length} Warm
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm font-semibold">
              <Flame className="h-4 w-4" />{hot.length} Hot
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold">
              <DollarSign className="h-4 w-4" />{sale.length} Sale
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-24 text-muted-foreground/60">Leads laden…</div>
        ) : total === 0 ? (
          <div className="text-center py-24">
            <div className="text-5xl mb-3">🔥</div>
            <div className="font-semibold text-foreground/80 mb-1">Noch keine Leads</div>
            <div className="text-sm text-muted-foreground/60">
              Sobald der Bot eine Liste oder ein Paket sendet, tauchen Leads hier auf.
            </div>
          </div>
        ) : (
          /* 3-column grid */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Column
              title="Warm"
              icon={<Thermometer className="h-4 w-4 text-blue-500" />}
              count={warm.length}
              headerCls="bg-blue-50 border border-blue-200 text-blue-800"
              accent="border-blue-200 bg-blue-50/40 text-blue-900"
              emptyText="Kein Warm Lead — sobald die Liste gesendet wird, erscheint er hier."
              users={warm}
            />
            <Column
              title="Hot"
              icon={<Flame className="h-4 w-4 text-orange-500" />}
              count={hot.length}
              headerCls="bg-orange-50 border border-orange-200 text-orange-800"
              accent="border-orange-200 bg-orange-50/40 text-orange-900"
              emptyText="Kein Hot Lead — sobald ein Paket gesendet wird, erscheint er hier."
              users={hot}
            />
            <Column
              title="Sale"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              count={sale.length}
              headerCls="bg-emerald-50 border border-emerald-200 text-emerald-800"
              accent="border-emerald-200 bg-emerald-50/40 text-emerald-900"
              emptyText="Noch kein Sale — sobald eine Zahlung bestätigt ist, erscheint er hier."
              users={sale}
            />
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
