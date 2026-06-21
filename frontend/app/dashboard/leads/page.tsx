'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCw, MessageSquare, Clock, Target } from 'lucide-react';

interface Lead {
  id: string;
  user_id: string;
  name?: string;
  username?: string;
  lead_score: number;
  funnel_stage: string;
  qualified: boolean;
  converted: boolean;
  total_interactions: number;
  score_breakdown?: Record<string, number>;
  created_at: string;
}

const FUNNEL = [
  { key: 'hook',               label: 'Hook',       icon: '🪝', colorClass: 'text-cyan-400',   borderClass: 'border-t-cyan-400',   bgClass: 'bg-cyan-400/10',   desc: '1–10 Nachrichten' },
  { key: 'engagement',         label: 'Engagement', icon: '💬', colorClass: 'text-blue-400',   borderClass: 'border-t-blue-400',   bgClass: 'bg-blue-400/10',   desc: '10+ Nachrichten' },
  { key: 'emotional_connection', label: 'Emotional', icon: '❤️', colorClass: 'text-purple-400', borderClass: 'border-t-purple-400', bgClass: 'bg-purple-400/10', desc: 'Persönliche Signale' },
  { key: 'monetization',       label: 'Monetization', icon: '💰', colorClass: 'text-green-400', borderClass: 'border-t-green-400', bgClass: 'bg-green-400/10', desc: 'Kaufbereit' },
];

const POINT_EVENTS = [
  { label: 'Fan-Nachricht',      pts: 3,   colorClass: 'text-cyan-400',   bgClass: 'bg-cyan-400/10',   borderClass: 'border-cyan-400/30' },
  { label: 'AI-Antwort',         pts: 1,   colorClass: 'text-blue-400',   bgClass: 'bg-blue-400/10',   borderClass: 'border-blue-400/30' },
  { label: 'Preisanfrage',       pts: 15,  colorClass: 'text-orange-400', bgClass: 'bg-orange-400/10', borderClass: 'border-orange-400/30' },
  { label: 'Persönliches Signal', pts: 20, colorClass: 'text-purple-400', bgClass: 'bg-purple-400/10', borderClass: 'border-purple-400/30' },
  { label: 'Kauf',               pts: 100, colorClass: 'text-green-400',  bgClass: 'bg-green-400/10',  borderClass: 'border-green-400/30' },
];

function scoreColorClass(s: number) { return s >= 70 ? 'text-green-400' : s >= 35 ? 'text-orange-400' : 'text-cyan-400'; }
function scoreBorderClass(s: number) { return s >= 70 ? 'border-green-400' : s >= 35 ? 'border-orange-400' : 'border-cyan-400'; }
function scoreBgClass(s: number) { return s >= 70 ? 'bg-green-400/10' : s >= 35 ? 'bg-orange-400/10' : 'bg-cyan-400/10'; }
function getStage(key: string) { return FUNNEL.find(f => f.key === key) || FUNNEL[0]; }
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function LeadsPage() {
  const router = useRouter();
  const { withCreator } = useCreator();
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortBy, setSortBy]           = useState<'score' | 'recent' | 'msgs'>('score');

  const api = apiBase();

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const res = await fetch(withCreator(`${api}/leads?limit=500`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setLeads(d.items || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, withCreator]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const stageCounts = FUNNEL.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = leads.filter(l => (l.funnel_stage || 'hook') === f.key).length;
    return acc;
  }, {});

  const filtered = (() => {
    let list = stageFilter === 'all' ? leads : leads.filter(l => (l.funnel_stage || 'hook') === stageFilter);
    if (sortBy === 'score')  list = [...list].sort((a, b) => b.lead_score - a.lead_score);
    if (sortBy === 'recent') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'msgs')   list = [...list].sort((a, b) => b.total_interactions - a.total_interactions);
    return list;
  })();

  const totalQualified = leads.filter(l => l.qualified).length;
  const totalConverted = leads.filter(l => l.converted).length;
  const avgScore       = leads.length ? Math.round(leads.reduce((s, l) => s + l.lead_score, 0) / leads.length) : 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lead Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {leads.length} Leads · {totalQualified} qualifiziert · {totalConverted} konvertiert · Ø Score {avgScore}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
            <RefreshCw size={14} className={cn("mr-1.5", loading && "animate-spin")} />
            Aktualisieren
          </Button>
        </div>

        {/* Funnel */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FUNNEL.map((f, i) => {
            const cnt = stageCounts[f.key] ?? 0;
            const pct = leads.length ? Math.round((cnt / leads.length) * 100) : 0;
            const isActive = stageFilter === f.key;
            return (
              <Card
                key={f.key}
                onClick={() => setStageFilter(isActive ? 'all' : f.key)}
                className={cn(
                  "cursor-pointer transition-all duration-150 border-t-2 relative",
                  f.borderClass,
                  isActive && f.bgClass
                )}
              >
                {i < 3 && (
                  <span className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-lg z-10">›</span>
                )}
                <CardContent className="pt-4 pb-3">
                  <div className="text-xl mb-2">{f.icon}</div>
                  <div className={cn("text-2xl font-bold leading-none", f.colorClass)}>{cnt}</div>
                  <div className="text-xs font-bold mt-1">{f.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                  <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", f.bgClass.replace('/10', ''))} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 text-right">{pct}%</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Point system */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Punktesystem</p>
            <div className="flex gap-2 flex-wrap">
              {POINT_EVENTS.map(e => (
                <div key={e.label} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs", e.bgClass, e.borderClass)}>
                  <span className={cn("font-bold", e.colorClass)}>+{e.pts}</span>
                  <span className="text-muted-foreground">{e.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStageFilter('all')}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors",
              stageFilter === 'all'
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground"
            )}
          >
            Alle ({leads.length})
          </button>
          {FUNNEL.map(f => (
            <button
              key={f.key}
              onClick={() => setStageFilter(stageFilter === f.key ? 'all' : f.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                stageFilter === f.key
                  ? cn(f.bgClass, f.borderClass.replace('border-t-', 'border-'), f.colorClass)
                  : "border-border text-muted-foreground hover:border-muted-foreground"
              )}
            >
              {f.icon} {f.label} ({stageCounts[f.key] ?? 0})
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
            >
              <option value="score">Score</option>
              <option value="recent">Neueste</option>
              <option value="msgs">Nachrichten</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {error}</div>
        )}

        {/* Lead list */}
        {loading && !leads.length ? (
          <div className="text-center py-20 text-muted-foreground">Lade Leads…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎯</div>
            <div className="font-semibold mb-1">Keine Leads</div>
            <div className="text-sm text-muted-foreground">Leads werden automatisch aus Telegram-Gesprächen erstellt, sobald der Autopilot antwortet.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(lead => {
              const stage = lead.funnel_stage || 'hook';
              const stageInfo = getStage(stage);
              const breakdown = lead.score_breakdown || {};
              const scoreClass = scoreColorClass(lead.lead_score);
              const scoreBdr   = scoreBorderClass(lead.lead_score);
              const scoreBg    = scoreBgClass(lead.lead_score);
              return (
                <Card
                  key={lead.id}
                  className={cn("cursor-pointer transition-all duration-150 hover:border-primary/40")}
                  onClick={() => router.push('/dashboard/inbox')}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3.5">
                      {/* Score circle */}
                      <div className={cn(
                        "flex-shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center text-xs font-bold",
                        scoreBdr, scoreBg, scoreClass
                      )}>
                        {Math.round(lead.lead_score)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-sm">
                            {lead.name || `User #${(lead.user_id || '').slice(0, 8)}`}
                          </span>
                          {lead.username && <span className="text-xs text-muted-foreground">@{lead.username}</span>}
                          <Badge variant="outline" className={cn("text-xs border px-2 py-0", stageInfo.bgClass, stageInfo.borderClass.replace('border-t-', 'border-'), stageInfo.colorClass)}>
                            {stageInfo.icon} {stageInfo.label}
                          </Badge>
                          {lead.qualified && <Badge variant="outline" className="text-xs text-green-400 border-green-400/30 bg-green-400/10">✓ Qualifiziert</Badge>}
                          {lead.converted && <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/30 bg-orange-400/10">⭐ Konvertiert</Badge>}
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap items-center">
                          <span className="flex items-center gap-1"><MessageSquare size={11} />{lead.total_interactions}</span>
                          <span className="flex items-center gap-1"><Clock size={11} />{timeAgo(lead.created_at)}</span>
                          {Object.entries(breakdown).slice(0, 3).map(([k, v]) => (
                            <span key={k}>{k}: {v}pts</span>
                          ))}
                        </div>
                      </div>

                      {/* Funnel dots */}
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                        {FUNNEL.map(f => {
                          const done = FUNNEL.findIndex(x => x.key === stage) >= FUNNEL.findIndex(x => x.key === f.key);
                          return (
                            <div
                              key={f.key}
                              title={f.label}
                              className={cn(
                                "w-2 h-2 rounded-full transition-all duration-200",
                                done ? f.bgClass.replace('/10', '') : "bg-muted",
                                f.key === stage && "shadow-[0_0_6px_currentColor]"
                              )}
                            />
                          );
                        })}
                      </div>

                      {/* Score bar */}
                      <div className="w-16 flex-shrink-0 hidden sm:block">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", scoreBg.replace('/10', ''))}
                            style={{ width: `${Math.min(lead.lead_score, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 text-right">{Math.round(lead.lead_score)}/100</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
