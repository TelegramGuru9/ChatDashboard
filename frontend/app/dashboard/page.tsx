'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Users, Target, Bot, WifiOff,
  BarChart3, Image, Package, ArrowRight, Flame, Hash,
} from 'lucide-react';

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '');
};

const QUICK = [
  { href: '/dashboard/inbox',     icon: MessageSquare, label: 'Inbox',     desc: 'Alle Gespräche' },
  { href: '/dashboard/leads',     icon: Target,        label: 'Leads',     desc: 'Pipeline & Scoring' },
  { href: '/dashboard/analytics', icon: BarChart3,     label: 'Analytics', desc: 'Conversion-Metriken' },
  { href: '/dashboard/media',     icon: Image,         label: 'Media',     desc: 'Teaser & Dateien' },
  { href: '/dashboard/packages',  icon: Package,       label: 'Pakete',    desc: 'Angebote & Preise' },
];

function BigToggle({ on, loading, onChange }: { on: boolean; loading: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      className={cn(
        "relative w-16 h-8 rounded-full border-none cursor-pointer transition-all duration-300 flex-shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        on ? "bg-green-500 shadow-[0_0_16px_rgba(34,197,94,0.4)]" : "bg-muted",
        loading && "opacity-60 cursor-wait"
      )}
    >
      <div className={cn(
        "absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300",
        "flex items-center justify-center text-xs font-bold",
        on ? "left-[34px] text-green-600" : "left-1 text-muted-foreground"
      )}>
        {loading ? '…' : on ? '✓' : ''}
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const { withCreator } = useCreator();
  const [health,       setHealth]      = useState<any>(null);
  const [tg,           setTg]          = useState<any>(null);
  const [stats,        setStats]       = useState({ messages: 0, users: 0, leads: 0 });
  const [hotCount,     setHotCount]    = useState(0);
  const [orderCount,   setOrderCount]  = useState(0);
  const [autopilot,    setAutopilot]   = useState(false);
  const [apLoading,    setApLoading]   = useState(true);
  const [apToggling,   setApToggling]  = useState(false);
  const [apStatus,     setApStatus]    = useState('');

  const base = apiBase();
  const api  = `${base}/api/v1`;

  const loadAll = useCallback(async () => {
    Promise.allSettled([
      fetch(`${base}/health`).then(r => r.json()),
      fetch(`${api}/telegram/status`).then(r => r.json()),
      fetch(withCreator(`${api}/messages?limit=1`)).then(r => r.json()),
      fetch(withCreator(`${api}/users?limit=1`)).then(r => r.json()),
      fetch(withCreator(`${api}/leads?limit=1`)).then(r => r.json()),
      fetch(withCreator(`${api}/analytics/summary?days=365`)).then(r => r.json()),
      fetch(withCreator(`${api}/config/order_counter`)).then(r => r.json()),
    ]).then(([h, t, m, u, l, analytics, orderCfg]) => {
      if (h.status === 'fulfilled') setHealth(h.value);
      if (t.status === 'fulfilled') setTg(t.value);
      setStats({
        messages: m.status === 'fulfilled' ? (m.value?.total ?? 0) : 0,
        users:    u.status === 'fulfilled' ? (u.value?.total ?? 0) : 0,
        leads:    l.status === 'fulfilled' ? (l.value?.total ?? 0) : 0,
      });
      if (analytics.status === 'fulfilled') {
        setHotCount(analytics.value?.totals?.hot_label_count ?? 0);
      }
      if (orderCfg.status === 'fulfilled') {
        setOrderCount(typeof orderCfg.value?.value === 'number' ? orderCfg.value.value : 0);
      }
    });

    try {
      setApLoading(true);
      const cfgRes = await fetch(withCreator(`${api}/config/autopilot_global`));
      const cfg = await cfgRes.json();
      setAutopilot(cfg.value?.enabled !== false && cfg.value !== null && cfg.value !== undefined
        ? cfg.value?.enabled !== false : false);
    } catch {
      setAutopilot(false);
    } finally {
      setApLoading(false);
    }
  }, [base, api, withCreator]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleAutopilot = async () => {
    const next = !autopilot;
    setApToggling(true);
    setApStatus('');
    try {
      await fetch(withCreator(`${api}/config/autopilot_global`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (next) {
        const res = await fetch(`${api}/ai/enable-all`, { method: 'POST' });
        const d = await res.json();
        setApStatus(`✓ Autopilot aktiviert — ${d.enabled_count ?? '?'} Chats aktiv`);
      } else {
        const res = await fetch(`${api}/ai/disable-all`, { method: 'POST' });
        const d = await res.json();
        setApStatus(`Autopilot deaktiviert — ${d.disabled_count ?? '?'} Chats pausiert`);
      }
      setAutopilot(next);
    } catch (e: any) {
      setApStatus(`⚠ Fehler: ${e.message}`);
    } finally {
      setApToggling(false);
      setTimeout(() => setApStatus(''), 4000);
    }
  };

  const backendOk = health?.status === 'healthy';
  const tgOk      = !!tg?.connected;
  const tgName    = tg?.account?.name || tg?.account?.username;

  const KPIS = [
    { label: 'Nachrichten', value: stats.messages.toLocaleString(), icon: MessageSquare, color: 'text-blue-400',    border: 'border-t-blue-400' },
    { label: 'Nutzer',      value: stats.users.toLocaleString(),    icon: Users,         color: 'text-purple-400',  border: 'border-t-purple-400' },
    { label: 'HOT Leads',   value: hotCount.toLocaleString(),       icon: Flame,         color: 'text-orange-400',  border: 'border-t-orange-400' },
    { label: 'Bestellungen',value: `#${String(orderCount).padStart(6, '0')}`, icon: Hash, color: 'text-yellow-400', border: 'border-t-yellow-400' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Übersicht</h1>
          <p className="text-sm text-muted-foreground mt-1">Dein KI-Telegram-CRM auf einen Blick</p>
        </div>

        {/* Autopilot card */}
        <Card className={cn(
          "transition-all duration-300",
          autopilot && "border-green-500/30 bg-green-500/5"
        )}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-5 flex-wrap">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl transition-colors",
                autopilot ? "bg-green-500/15 border border-green-500/25" : "bg-muted border border-border"
              )}>
                🤖
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="font-bold text-base">Autopilot</span>
                  {!apLoading && (
                    <Badge variant={autopilot ? 'default' : 'secondary'} className={cn(
                      "text-xs",
                      autopilot ? "bg-green-500/15 text-green-400 border-green-500/20" : ""
                    )}>
                      {autopilot ? '● AKTIV' : '○ AUS'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {autopilot
                    ? 'Nika antwortet automatisch — KI aktiv für alle Chats. Einzelne Chats im Inbox deaktivierbar.'
                    : 'Autopilot ist aus — Nika antwortet nicht automatisch. Einschalten um alle Chats zu aktivieren.'}
                </p>
                {apStatus && (
                  <p className={cn(
                    "text-xs mt-1.5",
                    apStatus.startsWith('✓') ? "text-green-400" : apStatus.startsWith('⚠') ? "text-orange-400" : "text-muted-foreground"
                  )}>
                    {apStatus}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <BigToggle on={autopilot} loading={apLoading || apToggling} onChange={toggleAutopilot} />
                <span className="text-[10px] text-muted-foreground">{autopilot ? 'Ausschalten' : 'Einschalten'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status bar */}
        <Card>
          <CardContent className="py-3.5 px-5">
            <div className="flex items-center gap-6 flex-wrap">
              {[
                { label: 'Backend',   ok: backendOk, value: backendOk ? 'Online' : 'Offline' },
                { label: 'Telegram',  ok: tgOk,      value: tgOk ? (tgName || 'Verbunden') : 'Nicht verbunden' },
                { label: 'KI-Modell', ok: backendOk, value: backendOk ? 'Bereit' : 'Offline' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    s.ok ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"
                  )} />
                  <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                  <span className={cn("text-xs font-semibold", s.ok ? "text-foreground" : "text-red-400")}>{s.value}</span>
                </div>
              ))}
              {!tgOk && (
                <Link href="/dashboard/inbox" className="ml-auto text-xs text-primary font-semibold hover:underline">
                  Verbindung reparieren →
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {KPIS.map(k => {
            const Icon = k.icon;
            return (
              <Card key={k.label} className={cn("border-t-2", k.border)}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{k.label}</span>
                    <Icon size={14} className={k.color} />
                  </div>
                  <div className={cn("text-3xl font-bold tracking-tight leading-none", k.color)}>{k.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick access */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Schnellzugriff</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {QUICK.map(q => {
              const Icon = q.icon;
              return (
                <Link key={q.href} href={q.href} className="block group">
                  <Card className="h-full transition-all duration-150 group-hover:border-primary/50 group-hover:-translate-y-px">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <Icon size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                      </div>
                      <div className="font-semibold text-sm mb-0.5">{q.label}</div>
                      <div className="text-xs text-muted-foreground">{q.desc}</div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Telegram not connected callout */}
        {!tgOk && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4">
                <WifiOff size={22} className="text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-0.5">Telegram nicht verbunden</p>
                  <p className="text-sm text-muted-foreground">
                    Gehe zu{' '}
                    <Link href="/dashboard/inbox" className="text-primary hover:underline font-medium">Inbox</Link>
                    {' '}und klicke Reconnect um Chats und Autopilot zu aktivieren.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </DashboardLayout>
  );
}
