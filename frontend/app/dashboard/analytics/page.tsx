'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCw, Users, MessageSquare, Target, Bot } from 'lucide-react';

interface AnalyticsSummary {
  totals: { users: number; messages: number; leads: number; ai_sent: number };
  daily_messages: { date: string; count: number }[];
  lead_stages: { stage: string; count: number }[];
  top_users: { user_id: string; name: string; username: string; score: number; messages: number }[];
}

const FUNNEL_META: Record<string, { label: string; icon: string; colorClass: string; barClass: string }> = {
  hook:                { label: 'Hook',       icon: '🪝', colorClass: 'text-cyan-400',   barClass: 'bg-cyan-400' },
  engagement:          { label: 'Engagement', icon: '💬', colorClass: 'text-blue-400',   barClass: 'bg-blue-400' },
  emotional_connection:{ label: 'Emotional',  icon: '❤️', colorClass: 'text-purple-400', barClass: 'bg-purple-400' },
  monetization:        { label: 'Monetize',   icon: '💰', colorClass: 'text-green-400',  barClass: 'bg-green-400' },
};

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { withCreator } = useCreator();
  const [data,       setData]       = useState<AnalyticsSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [days,       setDays]       = useState(14);

  const load = useCallback(async (silent = false, d = days) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(withCreator(`${apiBase()}/analytics/summary?days=${d}`));
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError('');
    } catch {
      setError('Daten konnten nicht geladen werden. Läuft das Backend?');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days, withCreator]);

  useEffect(() => { load(false, days); }, [days]); // eslint-disable-line

  const chartData = data?.daily_messages ?? [];
  const maxCount  = Math.max(...chartData.map(d => d.count), 1);
  const totalLeads = data?.lead_stages?.reduce((a, s) => a + s.count, 0) || 0;

  const fmtDate = (iso: string) => {
    const parts = (iso || '').split('-');
    if (parts.length === 3) {
      const [y, m, day] = parts.map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('de', { month: 'short', day: 'numeric' });
    }
    return iso;
  };

  const KPI = [
    { label: 'Nutzer gesamt', value: data?.totals.users    ?? 0, icon: Users,          colorClass: 'text-purple-400', borderClass: 'border-t-purple-400' },
    { label: 'Nachrichten',   value: data?.totals.messages ?? 0, icon: MessageSquare,  colorClass: 'text-blue-400',   borderClass: 'border-t-blue-400' },
    { label: 'Aktive Leads',  value: data?.totals.leads    ?? 0, icon: Target,         colorClass: 'text-green-400',  borderClass: 'border-t-green-400' },
    { label: 'KI-Antworten',  value: data?.totals.ai_sent  ?? 0, icon: Bot,            colorClass: 'text-orange-400', borderClass: 'border-t-orange-400' },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">Echtzeit-Daten deines Telegram-Kontos</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none cursor-pointer"
            >
              <option value={7}>Letzte 7 Tage</option>
              <option value={14}>Letzte 14 Tage</option>
              <option value={30}>Letzte 30 Tage</option>
              <option value={90}>Letzte 90 Tage</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw size={14} className={cn("mr-1.5", refreshing && "animate-spin")} />
              Aktualisieren
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Lade Analytics…</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {KPI.map(k => {
                const Icon = k.icon;
                return (
                  <Card key={k.label} className={cn("border-t-2", k.borderClass)}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{k.label}</span>
                        <Icon size={14} className={k.colorClass} />
                      </div>
                      <div className={cn("text-3xl font-bold tracking-tight leading-none", k.colorClass)}>
                        {k.value.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Nachrichten — letzte {days} Tage</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">Noch keine Nachrichtendaten</div>
                ) : (
                  <div className="relative pl-8 pb-7" style={{ height: '180px' }}>
                    {/* Y-axis gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                      <div
                        key={frac}
                        className="absolute left-8 right-0 border-t border-border/50 pointer-events-none"
                        style={{ bottom: `calc(28px + ${frac * 120}px)` }}
                      >
                        <span className="absolute -left-7 -top-2.5 text-[9px] text-muted-foreground">
                          {Math.round(maxCount * frac)}
                        </span>
                      </div>
                    ))}
                    {/* Bars */}
                    <div className="absolute inset-0 pl-8 pb-7 flex items-end gap-1">
                      {chartData.map((d, i) => {
                        const h = Math.max(4, (d.count / maxCount) * 120);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center relative" title={`${d.count} messages`}>
                            <div
                              className="w-full rounded-t-sm bg-blue-500/60 hover:bg-blue-400/80 transition-opacity cursor-default"
                              style={{ height: `${h}px` }}
                            />
                            <span className="absolute -bottom-6 text-[9px] text-muted-foreground whitespace-nowrap">
                              {fmtDate((d as any).date ?? (d as any).day ?? '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bottom grid */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.6fr] gap-4">
              {/* Lead phases */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Aktive Leads — Phasen</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data?.lead_stages?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Keine Lead-Daten</div>
                  ) : (
                    <div className="space-y-3">
                      {data.lead_stages.map(s => {
                        const pct  = totalLeads > 0 ? (s.count / totalLeads) * 100 : 0;
                        const meta = FUNNEL_META[s.stage] ?? { label: s.stage, icon: '●', colorClass: 'text-muted-foreground', barClass: 'bg-muted' };
                        return (
                          <div key={s.stage}>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className={cn("text-xs font-semibold", meta.colorClass)}>{meta.icon} {meta.label}</span>
                              <span className="text-xs text-muted-foreground">{s.count} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all duration-500", meta.barClass)} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
                        <span>Gesamt Leads</span>
                        <span className="font-bold text-foreground">{totalLeads}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top contacts */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">Top Kontakte nach Score</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data?.top_users?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Noch keine Kontakte</div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-2 pb-2 border-b border-border">
                        {['Name', 'Score', 'Nachr.'].map(h => (
                          <span key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</span>
                        ))}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {data.top_users.map((u, i) => (
                          <div
                            key={u.user_id}
                            onClick={() => router.push(`/dashboard/inbox?user=${u.user_id}`)}
                            className={cn(
                              "grid grid-cols-[1fr_60px_60px] gap-2 px-2 py-2 rounded-lg items-center cursor-pointer",
                              "hover:bg-primary/8 transition-colors",
                              i % 2 !== 0 && "bg-muted/30"
                            )}
                          >
                            <div className="overflow-hidden">
                              <div className="text-sm font-semibold text-primary truncate">→ {u.name || u.username || 'Unknown'}</div>
                              {u.username && u.name && <div className="text-[10px] text-muted-foreground">@{u.username}</div>}
                            </div>
                            <div className="text-sm font-bold text-orange-400">{u.score}</div>
                            <div className="text-sm text-muted-foreground">{u.messages}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center mt-2">Klicken um Chat zu öffnen</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
