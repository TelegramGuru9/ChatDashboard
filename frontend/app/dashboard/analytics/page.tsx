'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

interface AnalyticsSummary {
  totals: { users: number; messages: number; leads: number; ai_sent: number };
  daily_messages: { date: string; count: number }[];
  lead_stages: { stage: string; count: number }[];
  top_users: { user_id: string; name: string; username: string; score: number; messages: number }[];
}

const STAGE_COLORS: Record<string, string> = {
  COLD: C.teal, CURIOUS: C.blue, HOT: C.orange,
  BUYER: C.green, TIMEWASTER: C.red, CUSTOM: C.purple,
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.s1, borderRadius: '16px', border: `1px solid ${C.sep}`, ...style }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display:'inline-block', width:'16px', height:'16px', border:`2px solid ${C.sep}`,
      borderTopColor: C.blue, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
  );
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(14);

  const load = useCallback(async (silent = false, d = days) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${apiBase()}/analytics/summary?days=${d}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      setError('');
    } catch {
      setError('Daten konnten nicht geladen werden. Läuft das Backend?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { load(false, days); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = data?.daily_messages ?? [];
  const maxCount = Math.max(...chartData.map(d => d.count), 1);
  const totalLeads = data?.lead_stages?.reduce((a, s) => a + s.count, 0) || 0;

  const fmtDate = (iso: string) => {
    // Parse "YYYY-MM-DD" in local time to avoid UTC-offset date shifts
    const parts = (iso || '').split('-');
    if (parts.length === 3) {
      const [y, m, day] = parts.map(Number);
      const d = new Date(y, m - 1, day);
      return d.toLocaleDateString('de', { month: 'short', day: 'numeric' });
    }
    return iso;
  };

  const KPI = [
    { label: 'Nutzer gesamt',   value: data?.totals.users    ?? 0, color: C.purple, icon: '👥' },
    { label: 'Nachrichten',     value: data?.totals.messages ?? 0, color: C.blue,   icon: '✉' },
    { label: 'Aktive Leads',    value: data?.totals.leads    ?? 0, color: C.green,  icon: '🎯' },
    { label: 'KI-Antworten',    value: data?.totals.ai_sent  ?? 0, color: C.orange, icon: '🤖' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1040px', color: C.t1 }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Analytics</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Echtzeit-Daten deines Telegram-Kontos</p>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              style={{ padding:'9px 14px', borderRadius:'12px', background: C.s2, border:`1px solid ${C.sep}`, color: C.t2, fontSize:'13px', cursor:'pointer', outline:'none' }}
            >
              <option value={7}>Letzte 7 Tage</option>
              <option value={14}>Letzte 14 Tage</option>
              <option value={30}>Letzte 30 Tage</option>
              <option value={90}>Letzte 90 Tage</option>
            </select>
            <button onClick={() => load(true)} disabled={refreshing} style={{
              padding:'9px 16px', borderRadius:'12px', background: C.s2, border:`1px solid ${C.sep}`,
              color: C.t2, fontSize:'13px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px',
            }}>
              {refreshing ? <Spinner /> : '↻'} Aktualisieren
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding:'12px 16px', borderRadius:'12px', marginBottom:'20px', fontSize:'13px',
            background:'rgba(255,69,58,0.08)', color: C.red, border:`1px solid rgba(255,69,58,0.2)` }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:'80px', color: C.t3 }}>
            <Spinner /><div style={{ marginTop:'12px', fontSize:'14px' }}>Loading analytics…</div>
          </div>
        ) : (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'24px' }} className="kpi-grid">
              {KPI.map(k => (
                <Card key={k.label} style={{ padding:'20px 18px', borderTop:`2px solid ${k.color}` }}>
                  <div style={{ fontSize:'11px', color: C.t3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>{k.label}</div>
                  <div style={{ fontSize:'32px', fontWeight:700, color: k.color, letterSpacing:'-0.03em', lineHeight:1 }}>
                    {k.value.toLocaleString()}
                  </div>
                </Card>
              ))}
            </div>

            <Card style={{ padding:'24px', marginBottom:'20px' }}>
              <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'20px', color: C.t2 }}>Nachrichten — letzte {days} Tage</div>
              {chartData.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color: C.t3, fontSize:'13px' }}>Noch keine Nachrichtendaten</div>
              ) : (
                <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'160px', paddingBottom:'28px', position:'relative', paddingLeft:'32px' }}>
                  {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                    <div key={frac} style={{
                      position:'absolute', left:'32px', right:0, bottom:`calc(28px + ${frac * 120}px)`,
                      borderTop:`1px solid ${C.sep}`, pointerEvents:'none',
                    }}>
                      <span style={{ position:'absolute', left:'-28px', top:'-9px', fontSize:'10px', color: C.t3 }}>
                        {Math.round(maxCount * frac)}
                      </span>
                    </div>
                  ))}
                  {chartData.map((d, i) => {
                    const h = Math.max(4, (d.count / maxCount) * 120);
                    return (
                      <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}>
                        <div title={`${d.count} messages`} style={{
                          width:'100%', height:`${h}px`, borderRadius:'4px 4px 0 0',
                          background: `linear-gradient(180deg, ${C.blue} 0%, rgba(10,132,255,0.4) 100%)`,
                          cursor:'default', transition:'opacity 0.15s',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                        />
                        <span style={{ position:'absolute', bottom:'-22px', fontSize:'9px', color: C.t3, whiteSpace:'nowrap' }}>
                          {fmtDate((d as any).date ?? (d as any).day ?? '')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.6fr', gap:'16px' }} className="bottom-grid">
              <Card style={{ padding:'24px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'20px', color: C.t2 }}>Lead-Phasen</div>
                {!data?.lead_stages?.length ? (
                  <div style={{ textAlign:'center', padding:'40px 0', color: C.t3, fontSize:'13px' }}>Keine Lead-Daten</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                    {data.lead_stages.map(s => {
                      const pct = totalLeads > 0 ? (s.count / totalLeads) * 100 : 0;
                      const col = STAGE_COLORS[s.stage] ?? C.t3;
                      return (
                        <div key={s.stage}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                            <span style={{ fontSize:'12px', fontWeight:600, color: col }}>{s.stage}</span>
                            <span style={{ fontSize:'12px', color: C.t3 }}>{s.count} ({pct.toFixed(0)}%)</span>
                          </div>
                          <div style={{ height:'6px', borderRadius:'3px', background: C.s3 }}>
                            <div style={{ height:'6px', borderRadius:'3px', width:`${pct}%`, background: col, transition:'width 0.6s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card style={{ padding:'24px' }}>
                <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'16px', color: C.t2 }}>Top Kontakte nach Score</div>
                {!data?.top_users?.length ? (
                  <div style={{ textAlign:'center', padding:'40px 0', color: C.t3, fontSize:'13px' }}>Noch keine Kontakte</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px', gap:'8px', padding:'0 8px 8px', borderBottom:`1px solid ${C.sep}` }}>
                      {['Name', 'Score', 'Nachr.'].map(h => (
                        <span key={h} style={{ fontSize:'10px', fontWeight:600, color: C.t3, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</span>
                      ))}
                    </div>
                    {data.top_users.map((u, i) => (
                      <div key={u.user_id} style={{
                        display:'grid', gridTemplateColumns:'1fr 60px 60px', gap:'8px',
                        padding:'8px', borderRadius:'8px', alignItems:'center',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                      }}>
                        <div style={{ overflow:'hidden' }}>
                          <div style={{ fontSize:'13px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {u.name || u.username || 'Unknown'}
                          </div>
                          {u.username && u.name && (
                            <div style={{ fontSize:'10px', color: C.t3 }}>@{u.username}</div>
                          )}
                        </div>
                        <div style={{ fontSize:'13px', fontWeight:700, color: C.orange }}>{u.score}</div>
                        <div style={{ fontSize:'13px', color: C.t2 }}>{u.messages}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media(max-width:640px) { .kpi-grid{grid-template-columns:repeat(2,1fr)!important} .bottom-grid{grid-template-columns:1fr!important} }
      `}</style>
    </DashboardLayout>
  );
}
