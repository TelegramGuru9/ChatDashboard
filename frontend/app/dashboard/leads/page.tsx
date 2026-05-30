'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e',
  sep:'rgba(84,84,88,0.4)', sepL:'rgba(84,84,88,0.18)',
  t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa', pink:'#ff2d55',
};

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
  {
    key: 'hook',
    label: 'Hook',
    icon: '🪝',
    color: C.teal,
    desc: '1–10 Nachrichten',
    hint: 'Erster Kontakt — Nika baut Rapport auf',
  },
  {
    key: 'engagement',
    label: 'Engagement',
    icon: '💬',
    color: C.blue,
    desc: '10+ Nachrichten',
    hint: 'Aktiv im Gespräch — Interesse wächst',
  },
  {
    key: 'emotional_connection',
    label: 'Emotional',
    icon: '❤️',
    color: C.purple,
    desc: 'Persönliche Signale',
    hint: 'Persönliche Daten geteilt — hohe Bindung',
  },
  {
    key: 'monetization',
    label: 'Monetization',
    icon: '💰',
    color: C.green,
    desc: 'Kaufbereit',
    hint: 'Bereit zu kaufen — Nika sendet Pakete',
  },
];

const POINT_EVENTS = [
  { label: 'Fan-Nachricht', pts: 3, color: C.teal },
  { label: 'AI-Antwort', pts: 1, color: C.blue },
  { label: 'Preisanfrage', pts: 15, color: C.orange },
  { label: 'Persönliches Signal', pts: 20, color: C.purple },
  { label: 'Kauf', pts: 100, color: C.green },
];

function scoreColor(s: number) { return s >= 70 ? C.green : s >= 35 ? C.orange : C.teal; }
function stageColor(s: string) { return FUNNEL.find(f => f.key === s)?.color ?? C.t3; }
function stageIcon(s: string) { return FUNNEL.find(f => f.key === s)?.icon ?? '—'; }
function stageLabel(s: string) { return FUNNEL.find(f => f.key === s)?.label ?? s; }
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function LeadsPage() {
  const router = useRouter();
  const { withCreator } = useCreator();
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortBy, setSortBy]       = useState<'score'|'recent'|'msgs'>('score');

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

  const stageCounts = FUNNEL.reduce<Record<string,number>>((acc, f) => {
    acc[f.key] = leads.filter(l => (l.funnel_stage || 'hook') === f.key).length;
    return acc;
  }, {});

  const filtered = (() => {
    let list = stageFilter === 'all' ? leads : leads.filter(l => (l.funnel_stage || 'hook') === stageFilter);
    if (sortBy === 'score')  list = [...list].sort((a,b) => b.lead_score - a.lead_score);
    if (sortBy === 'recent') list = [...list].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortBy === 'msgs')   list = [...list].sort((a,b) => b.total_interactions - a.total_interactions);
    return list;
  })();

  const totalQualified   = leads.filter(l => l.qualified).length;
  const totalConverted   = leads.filter(l => l.converted).length;
  const avgScore         = leads.length ? Math.round(leads.reduce((s,l) => s+l.lead_score,0)/leads.length) : 0;

  return (
    <DashboardLayout>
      <div style={{ padding:'24px 20px', maxWidth:'1060px', color:C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'22px', flexWrap:'wrap', gap:'10px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Lead Pipeline</h1>
            <p style={{ fontSize:'13px', color:C.t2, margin:'4px 0 0' }}>
              {leads.length} Leads · {totalQualified} qualifiziert · {totalConverted} konvertiert · Ø Score {avgScore}
            </p>
          </div>
          <button onClick={fetchLeads} disabled={loading} style={{ padding:'8px 16px', borderRadius:'12px', background:C.s2, border:`1px solid ${C.sep}`, color:C.t2, fontSize:'13px', fontWeight:600, cursor:'pointer', opacity:loading?0.5:1 }}>
            {loading ? '⏳ Laden…' : '↺ Aktualisieren'}
          </button>
        </div>

        {/* ── Funnel pipeline ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'20px' }} className="funnel-grid">
          {FUNNEL.map((f, i) => {
            const cnt   = stageCounts[f.key] ?? 0;
            const pct   = leads.length ? Math.round((cnt/leads.length)*100) : 0;
            const isActive = stageFilter === f.key;
            return (
              <div key={f.key} onClick={() => setStageFilter(isActive ? 'all' : f.key)}
                style={{
                  background: isActive ? `${f.color}12` : C.s1,
                  borderRadius:'16px', padding:'16px', cursor:'pointer',
                  border:`1px solid ${isActive ? f.color : C.sep}`,
                  borderTop:`3px solid ${f.color}`,
                  transition:'all 0.18s', position:'relative',
                }}>
                {/* Arrow connector */}
                {i < 3 && <div style={{ position:'absolute', right:'-10px', top:'50%', transform:'translateY(-50%)', color:C.t3, fontSize:'16px', zIndex:1 }}>›</div>}
                <div style={{ fontSize:'22px', marginBottom:'8px' }}>{f.icon}</div>
                <div style={{ fontSize:'20px', fontWeight:700, color:f.color, lineHeight:1 }}>{cnt}</div>
                <div style={{ fontSize:'12px', fontWeight:700, color:C.t1, marginTop:'4px' }}>{f.label}</div>
                <div style={{ fontSize:'11px', color:C.t3, marginTop:'2px' }}>{f.desc}</div>
                <div style={{ marginTop:'10px', height:'3px', background:C.s3, borderRadius:'2px' }}>
                  <div style={{ height:'100%', background:f.color, width:`${pct}%`, borderRadius:'2px', transition:'width 0.4s' }} />
                </div>
                <div style={{ fontSize:'10px', color:C.t3, marginTop:'3px', textAlign:'right' }}>{pct}%</div>
              </div>
            );
          })}
        </div>

        {/* ── Point system legend ── */}
        <div style={{ background:C.s1, border:`1px solid ${C.sep}`, borderRadius:'14px', padding:'14px 16px', marginBottom:'20px' }}>
          <div style={{ fontSize:'11px', fontWeight:600, color:C.t3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>Punktesystem</div>
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            {POINT_EVENTS.map(e => (
              <div key={e.label} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'5px 10px', borderRadius:'20px', background:`${e.color}12`, border:`1px solid ${e.color}30` }}>
                <span style={{ fontSize:'13px', fontWeight:700, color:e.color }}>+{e.pts}</span>
                <span style={{ fontSize:'11px', color:C.t2 }}>{e.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters row */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
          <button onClick={() => setStageFilter('all')} style={{
            padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:600, cursor:'pointer', border:'1px solid',
            background: stageFilter==='all' ? `${C.blue}20` : 'transparent',
            borderColor: stageFilter==='all' ? C.blue : C.sep,
            color: stageFilter==='all' ? C.blue : C.t3,
          }}>Alle ({leads.length})</button>
          {FUNNEL.map(f => (
            <button key={f.key} onClick={() => setStageFilter(stageFilter===f.key?'all':f.key)} style={{
              padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:600, cursor:'pointer', border:'1px solid',
              background: stageFilter===f.key ? `${f.color}20` : 'transparent',
              borderColor: stageFilter===f.key ? f.color : C.sep,
              color: stageFilter===f.key ? f.color : C.t3,
            }}>{f.icon} {f.label} ({stageCounts[f.key]??0})</button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ fontSize:'11px', color:C.t3 }}>Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ background:C.s2, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'5px 8px', color:C.t2, fontSize:'12px', outline:'none', cursor:'pointer' }}>
              <option value="score">Score</option>
              <option value="recent">Neueste</option>
              <option value="msgs">Nachrichten</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ padding:'12px 16px', borderRadius:'12px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.3)', color:C.red, fontSize:'13px', marginBottom:'14px' }}>⚠ {error}</div>
        )}

        {loading && !leads.length ? (
          <div style={{ textAlign:'center', padding:'80px', color:C.t3 }}>Lade Leads…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px' }}>
            <div style={{ fontSize:'40px', marginBottom:'12px' }}>🎯</div>
            <div style={{ fontSize:'16px', fontWeight:600, marginBottom:'6px' }}>Keine Leads</div>
            <div style={{ fontSize:'13px', color:C.t3 }}>Leads werden automatisch aus Telegram-Gesprächen erstellt, sobald der Autopilot antwortet.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {filtered.map(lead => {
              const stage = lead.funnel_stage || 'hook';
              const sc  = scoreColor(lead.lead_score);
              const stC = stageColor(stage);
              const breakdown = lead.score_breakdown || {};
              const breakdownEntries = Object.entries(breakdown);
              return (
                <div key={lead.id} style={{
                  background:C.s1, borderRadius:'14px', padding:'14px 16px',
                  border:`1px solid ${C.sep}`, display:'flex', alignItems:'center', gap:'14px',
                  transition:'border-color 0.15s', cursor:'pointer',
                }}
                  onClick={() => router.push('/dashboard/inbox')}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor=stC}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor=C.sep}
                >
                  {/* Score circle */}
                  <div style={{
                    flexShrink:0, width:'48px', height:'48px', borderRadius:'50%',
                    border:`2.5px solid ${sc}`, display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'13px', fontWeight:700, color:sc, background:`${sc}12`,
                  }}>{Math.round(lead.lead_score)}</div>

                  {/* Main info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'14px', color:C.t1 }}>
                        {lead.name || `User #${(lead.user_id||'').slice(0,8)}`}
                      </span>
                      {lead.username && <span style={{ fontSize:'11px', color:C.t3 }}>@{lead.username}</span>}
                      {/* Stage badge */}
                      <span style={{
                        fontSize:'11px', padding:'2px 9px', borderRadius:'20px', fontWeight:600,
                        background:`${stC}18`, color:stC, border:`1px solid ${stC}40`,
                      }}>{stageIcon(stage)} {stageLabel(stage)}</span>
                      {lead.qualified && <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'rgba(48,209,88,0.1)', color:C.green, border:'1px solid rgba(48,209,88,0.3)' }}>✓ Qualifiziert</span>}
                      {lead.converted && <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'rgba(255,149,10,0.1)', color:C.orange, border:'1px solid rgba(255,149,10,0.3)' }}>⭐ Konvertiert</span>}
                    </div>
                    <div style={{ display:'flex', gap:'12px', fontSize:'12px', color:C.t3, flexWrap:'wrap', alignItems:'center' }}>
                      <span>💬 {lead.total_interactions} Nachrichten</span>
                      <span>🕒 {timeAgo(lead.created_at)}</span>
                      {breakdownEntries.length > 0 && (
                        <span style={{ color:C.t3 }}>
                          {breakdownEntries.slice(0,3).map(([k,v]) => `${k}: ${v}pts`).join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mini funnel progress */}
                  <div style={{ flexShrink:0, display:'flex', gap:'4px', alignItems:'center' }}>
                    {FUNNEL.map(f => {
                      const done = FUNNEL.findIndex(x => x.key===stage) >= FUNNEL.findIndex(x => x.key===f.key);
                      return (
                        <div key={f.key} style={{
                          width:'8px', height:'8px', borderRadius:'50%',
                          background: done ? f.color : C.s3,
                          boxShadow: f.key===stage ? `0 0 6px ${f.color}` : 'none',
                          transition:'all 0.2s',
                        }} title={f.label} />
                      );
                    })}
                  </div>

                  {/* Score bar */}
                  <div style={{ width:'80px', flexShrink:0 }}>
                    <div style={{ height:'4px', background:C.s3, borderRadius:'2px', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:'2px', background:sc, width:`${Math.min(lead.lead_score,100)}%`, transition:'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize:'10px', color:C.t3, marginTop:'3px', textAlign:'right' }}>{Math.round(lead.lead_score)}/100</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`
        @media(max-width:700px) { .funnel-grid{grid-template-columns:repeat(2,1fr)!important} }
      `}</style>
    </DashboardLayout>
  );
}
