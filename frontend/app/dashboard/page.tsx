'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Users, Target, WifiOff,
  BarChart3, Image, Package, ArrowUpRight, Flame, Hash,
  TrendingUp,
} from 'lucide-react';

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '');
};

const QUICK = [
  { href: '/dashboard/inbox',     icon: MessageSquare, label: 'Inbox',     desc: 'All conversations',  color: 'bg-blue-500/10 text-blue-400' },
  { href: '/dashboard/leads',     icon: Target,        label: 'Leads',     desc: 'Pipeline & scoring', color: 'bg-purple-500/10 text-purple-400' },
  { href: '/dashboard/analytics', icon: BarChart3,     label: 'Analytics', desc: 'Conversion metrics', color: 'bg-emerald-500/10 text-emerald-400' },
  { href: '/dashboard/media',     icon: Image,         label: 'Media',     desc: 'Teasers & files',    color: 'bg-pink-500/10 text-pink-400' },
  { href: '/dashboard/packages',  icon: Package,       label: 'Packages',  desc: 'Offers & pricing',   color: 'bg-amber-500/10 text-amber-400' },
];

function AutopilotToggle({ on, loading, onChange }: { on: boolean; loading: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      aria-label={on ? 'Disable autopilot' : 'Enable autopilot'}
      className={cn(
        'relative w-11 h-6 rounded-full border-none cursor-pointer transition-all duration-300 flex-shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        on ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-muted-foreground/25',
        loading && 'opacity-50 cursor-wait'
      )}
    >
      <div className={cn(
        'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300',
        on ? 'left-[26px]' : 'left-1'
      )} />
    </button>
  );
}

function StatCard({
  label, value, icon: Icon, iconBg, sub, trend
}: {
  label: string; value: string; icon: React.ElementType;
  iconBg: string; sub?: string; trend?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <p className="text-[28px] font-bold tracking-tight leading-none">{value}</p>
      {(sub || trend) && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          {trend && <TrendingUp className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
          <span>{trend || sub}</span>
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { withCreator } = useCreator();
  const [health,      setHealth]     = useState<any>(null);
  const [tg,          setTg]         = useState<any>(null);
  const [stats,       setStats]      = useState({ messages: 0, users: 0 });
  const [hotCount,    setHotCount]   = useState(0);
  const [orderCount,  setOrderCount] = useState(0);
  const [autopilot,   setAutopilot]  = useState(false);
  const [apLoading,   setApLoading]  = useState(true);
  const [apToggling,  setApToggling] = useState(false);
  const [apStatus,    setApStatus]   = useState('');

  const base = apiBase();
  const api  = `${base}/api/v1`;

  const loadAll = useCallback(async () => {
    Promise.allSettled([
      fetch(`${base}/health`).then(r => r.json()),
      fetch(`${api}/telegram/status`).then(r => r.json()),
      fetch(withCreator(`${api}/messages?limit=1`)).then(r => r.json()),
      fetch(withCreator(`${api}/users?limit=1`)).then(r => r.json()),
      fetch(withCreator(`${api}/analytics/summary?days=365`)).then(r => r.json()),
      fetch(withCreator(`${api}/config/order_counter`)).then(r => r.json()),
    ]).then(([h, t, m, u, analytics, orderCfg]) => {
      if (h.status === 'fulfilled') setHealth(h.value);
      if (t.status === 'fulfilled') setTg(t.value);
      setStats({
        messages: m.status === 'fulfilled' ? (m.value?.total ?? 0) : 0,
        users:    u.status === 'fulfilled' ? (u.value?.total ?? 0) : 0,
      });
      if (analytics.status === 'fulfilled') setHotCount(analytics.value?.totals?.hot_label_count ?? 0);
      if (orderCfg.status === 'fulfilled') setOrderCount(typeof orderCfg.value?.value === 'number' ? orderCfg.value.value : 0);
    });

    try {
      setApLoading(true);
      const cfgRes = await fetch(withCreator(`${api}/config/autopilot_global`));
      const cfg = await cfgRes.json();
      setAutopilot(cfg.value?.enabled !== false && cfg.value !== null && cfg.value !== undefined
        ? cfg.value?.enabled !== false : false);
    } catch { setAutopilot(false); }
    finally  { setApLoading(false); }
  }, [base, api, withCreator]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleAutopilot = async () => {
    const next = !autopilot;
    setApToggling(true); setApStatus('');
    try {
      await fetch(withCreator(`${api}/config/autopilot_global`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const endpoint = next ? 'enable-all' : 'disable-all';
      const res = await fetch(`${api}/ai/${endpoint}`, { method: 'POST' });
      const d = await res.json();
      const count = d.enabled_count ?? d.disabled_count ?? '?';
      setApStatus(next ? `Active — ${count} chats enabled` : `Paused — ${count} chats`);
      setAutopilot(next);
    } catch (e: any) { setApStatus(`Error: ${e.message}`); }
    finally {
      setApToggling(false);
      setTimeout(() => setApStatus(''), 4000);
    }
  };

  const backendOk = health?.status === 'healthy';
  const tgOk      = !!tg?.connected;
  const tgName    = tg?.account?.name || tg?.account?.username;

  const KPIS = [
    { label: 'Total Messages', value: stats.messages.toLocaleString(), icon: MessageSquare, iconBg: 'bg-blue-500/10 text-blue-400',    sub: 'All time' },
    { label: 'Total Users',    value: stats.users.toLocaleString(),    icon: Users,         iconBg: 'bg-violet-500/10 text-violet-400', sub: 'Unique contacts' },
    { label: 'HOT Leads',      value: hotCount.toLocaleString(),       icon: Flame,         iconBg: 'bg-orange-500/10 text-orange-400', trend: hotCount > 0 ? 'Ready to convert' : undefined, sub: hotCount === 0 ? 'None yet' : undefined },
    { label: 'Last Order',     value: `#${String(orderCount).padStart(6, '0')}`, icon: Hash, iconBg: 'bg-amber-500/10 text-amber-400', sub: 'Order counter' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-5xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your AI Telegram CRM at a glance</p>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Backend',  ok: backendOk, val: backendOk ? 'Online' : 'Offline' },
              { label: 'Telegram', ok: tgOk,      val: tgOk ? (tgName || 'Connected') : 'Not connected' },
              { label: 'AI',       ok: backendOk, val: backendOk ? 'Ready' : 'Offline' },
            ].map(s => (
              <div key={s.label} className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                s.ok ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                     : 'bg-red-500/8 border-red-500/20 text-red-400'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', s.ok ? 'bg-emerald-400' : 'bg-red-400')} />
                {s.label}: <strong className="ml-0.5">{s.val}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {KPIS.map(k => <StatCard key={k.label} {...k} />)}
        </div>

        {/* ── Autopilot + Quick Access ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Autopilot */}
          <div className={cn(
            'rounded-xl border bg-card p-5 flex flex-col gap-4 transition-colors',
            autopilot ? 'border-emerald-500/25 bg-emerald-500/[0.03]' : 'border-border'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-colors',
                autopilot ? 'bg-emerald-500/15' : 'bg-muted'
              )}>
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">AI Autopilot</div>
                <div className={cn('text-xs mt-0.5 font-medium', autopilot ? 'text-emerald-400' : 'text-muted-foreground')}>
                  {apLoading ? 'Loading…' : autopilot ? '● Active' : '○ Paused'}
                </div>
              </div>
              <AutopilotToggle on={autopilot} loading={apLoading || apToggling} onChange={toggleAutopilot} />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {autopilot
                ? 'Nika is replying automatically. Disable per-chat in Inbox.'
                : 'Turn on for Nika to reply to all incoming messages automatically.'}
            </p>

            {apStatus && (
              <div className="text-xs bg-muted rounded-lg px-3 py-2 text-muted-foreground">
                {apStatus}
              </div>
            )}

            {!tgOk && (
              <Link href="/dashboard/inbox"
                className="text-xs text-primary font-medium hover:underline self-start">
                Connect Telegram first →
              </Link>
            )}
          </div>

          {/* Quick Access */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-semibold mb-3.5">Quick Access</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK.map(q => {
                const Icon = q.icon;
                return (
                  <Link key={q.href} href={q.href}
                    className="group flex items-center gap-3 px-3.5 py-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/60 transition-all">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', q.color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{q.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{q.desc}</div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Telegram not connected ── */}
        {!tgOk && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <WifiOff size={18} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Telegram not connected</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Go to{' '}
                  <Link href="/dashboard/inbox" className="text-primary hover:underline font-medium">Inbox</Link>
                  {' '}and click Reconnect to enable chats and autopilot.
                </p>
              </div>
              <Link href="/dashboard/inbox"
                className="shrink-0 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1.5">
                Reconnect <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
