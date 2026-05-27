'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ios = {
  surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  cyan: '#32ade6',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

const STAGE_C: Record<string, string> = {
  awareness: '#64748b', interest: '#0a84ff', consideration: '#bf5af2', decision: '#ffd60a', purchase: '#30d158',
};
const STATUS_C: Record<string, string> = {
  new: '#64748b', interested: '#0a84ff', qualified: '#30d158', customer: '#ffd60a', lost: '#ff453a',
};

interface Stats {
  totalMessages: number; incoming: number; outgoing: number; aiMessages: number;
  totalLeads: number; qualifiedLeads: number; convertedLeads: number; avgScore: number;
  totalUsers: number;
  stageBreak: Record<string, number>; statusBreak: Record<string, number>;
}

function KPI({ label, value, icon, color, sub }: { label: string; value: string | number; icon: string; color: string; sub?: string }) {
  return (
    <div style={{ background: ios.surface, borderRadius: '16px', padding: '18px', border: `1px solid ${ios.border}`, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '26px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: ios.text3, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: ios.text2, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function Bar({ data, colors, title }: { data: Record<string, number>; colors: Record<string, string>; title: string }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div style={{ background: ios.surface, borderRadius: '16px', padding: '20px', border: `1px solid ${ios.border}` }}>
      <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '16px' }}>{title}</div>
      {Object.entries(data).length === 0 ? (
        <div style={{ color: ios.text3, fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No data yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.entries(data).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100px', fontSize: '12px', color: colors[k] || ios.text2, textTransform: 'capitalize', fontWeight: 600, flexShrink: 0 }}>{k}</div>
              <div style={{ flex: 1, height: '10px', background: ios.surface2, borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '5px', background: colors[k] || ios.text2, width: `${(v / max) * 100}%`, transition: 'width 0.7s ease' }} />
              </div>
              <div style={{ width: '24px', fontSize: '12px', color: ios.text2, textAlign: 'right', flexShrink: 0 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const [mR, lR, uR] = await Promise.all([
        fetch(`${apiBase}/messages?limit=1000`).then(r => r.json()),
        fetch(`${apiBase}/leads?limit=1000`).then(r => r.json()),
        fetch(`${apiBase}/users?limit=1000`).then(r => r.json()),
      ]);
      const msgs = mR.items || [];
      const leads = lR.items || [];
      const stageBreak: Record<string, number> = {};
      const statusBreak: Record<string, number> = {};
      let totalScore = 0, qualified = 0, converted = 0;
      for (const l of leads) {
        if (l.funnel_stage) stageBreak[l.funnel_stage] = (stageBreak[l.funnel_stage] || 0) + 1;
        if (l.status) statusBreak[l.status] = (statusBreak[l.status] || 0) + 1;
        totalScore += l.lead_score || 0;
        if (l.qualified) qualified++;
        if (l.converted) converted++;
      }
      setStats({
        totalMessages: mR.total || msgs.length,
        incoming: msgs.filter((m: any) => m.direction === 'incoming').length,
        outgoing: msgs.filter((m: any) => m.direction === 'outgoing').length,
        aiMessages: msgs.filter((m: any) => m.is_ai_generated).length,
        totalLeads: lR.total || leads.length,
        qualifiedLeads: qualified, convertedLeads: converted,
        avgScore: leads.length ? Math.round(totalScore / leads.length) : 0,
        totalUsers: uR.total || 0,
        stageBreak, statusBreak,
      });
    } catch (e: any) { setError(e.message || 'Failed'); } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const S = stats;
  const aiPct = S && S.totalMessages > 0 ? Math.round((S.aiMessages / S.totalMessages) * 100) : 0;
  const qualPct = S && S.totalLeads > 0 ? Math.round((S.qualifiedLeads / S.totalLeads) * 100) : 0;
  const convPct = S && S.totalLeads > 0 ? Math.round((S.convertedLeads / S.totalLeads) * 100) : 0;

  const Ring = ({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) => {
    const r = (size / 2) - 8; const circ = 2 * Math.PI * r;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ios.surface2} strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${pct / 100 * circ} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
        <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fill={color} fontSize="13" fontWeight="700">{pct}%</text>
      </svg>
    );
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '980px', color: ios.text }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Analytics</h1>
            <p style={{ color: ios.text2, fontSize: '13px', marginTop: '4px' }}>Conversion and engagement overview</p>
          </div>
          <button onClick={load} disabled={loading} style={{ padding: '9px 16px', borderRadius: '12px', background: ios.surface, border: `1px solid ${ios.border}`, color: ios.text2, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {error && <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff6b6b', fontSize: '13px', marginBottom: '14px' }}>⚠️ {error}</div>}

        {loading && !stats ? (
          <div style={{ textAlign: 'center', padding: '80px', color: ios.text3 }}>⏳ Loading analytics…</div>
        ) : S ? (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }} className="g4">
              <KPI label="Messages" value={S.totalMessages} icon="💬" color={ios.accent} />
              <KPI label="Leads" value={S.totalLeads} icon="🎯" color={ios.green} />
              <KPI label="Users" value={S.totalUsers} icon="👤" color={ios.purple} />
              <KPI label="Avg Score" value={`${S.avgScore}/100`} icon="⭐" color={ios.amber} />
            </div>

            {/* Conversion rings */}
            <div style={{ background: ios.surface, borderRadius: '16px', padding: '20px', border: `1px solid ${ios.border}`, marginBottom: '16px' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '18px' }}>📊 Conversion Metrics</div>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-around' }}>
                {[
                  { label: 'AI Response Rate', pct: aiPct, color: ios.purple, sub: `${S.aiMessages} of ${S.totalMessages} messages` },
                  { label: 'Qualification Rate', pct: qualPct, color: ios.green, sub: `${S.qualifiedLeads} of ${S.totalLeads} leads` },
                  { label: 'Conversion Rate', pct: convPct, color: ios.amber, sub: `${S.convertedLeads} converted` },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <Ring pct={item.pct} color={item.color} size={90} />
                    <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '8px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: ios.text3, marginTop: '2px' }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bar charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }} className="g2">
              <Bar data={S.stageBreak} colors={STAGE_C} title="📈 Leads by Funnel Stage" />
              <Bar data={S.statusBreak} colors={STATUS_C} title="🏷️ Leads by Status" />
            </div>

            {/* Message breakdown */}
            <div style={{ background: ios.surface, borderRadius: '16px', padding: '20px', border: `1px solid ${ios.border}` }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '14px' }}>💬 Message Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Incoming (from users)', value: S.incoming, color: ios.accent, total: S.totalMessages },
                  { label: 'Outgoing (AI + manual)', value: S.outgoing, color: ios.green, total: S.totalMessages },
                  { label: 'AI Generated', value: S.aiMessages, color: ios.purple, total: S.totalMessages },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '190px', fontSize: '13px', color: ios.text2, flexShrink: 0 }}>{item.label}</div>
                    <div style={{ flex: 1, height: '10px', background: ios.surface2, borderRadius: '5px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '5px', background: item.color, width: item.total ? `${(item.value / item.total) * 100}%` : '0%', transition: 'width 0.7s ease' }} />
                    </div>
                    <div style={{ width: '60px', fontSize: '12px', color: ios.text2, textAlign: 'right', flexShrink: 0 }}>
                      {item.value} <span style={{ color: ios.text3, fontSize: '11px' }}>({item.total ? Math.round((item.value / item.total) * 100) : 0}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
      <style>{`
        @media(max-width:700px){ .g4{grid-template-columns:repeat(2,1fr)!important} .g2{grid-template-columns:1fr!important} }
        @media(max-width:400px){ .g4{grid-template-columns:1fr!important} }
      `}</style>
    </DashboardLayout>
  );
}
