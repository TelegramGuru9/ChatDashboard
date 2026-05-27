'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

interface StatsData {
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  aiMessages: number;
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  avgLeadScore: number;
  totalUsers: number;
  stageBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
}

const C = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#06b6d4',
  slate100: '#f1f5f9',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate800: '#1e293b',
  slate900: '#0f172a',
};

const STAGE_COLORS: Record<string, string> = {
  awareness: '#64748b',
  interest: '#3b82f6',
  consideration: '#8b5cf6',
  decision: '#f59e0b',
  purchase: '#10b981',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#64748b',
  interested: '#3b82f6',
  qualified: '#10b981',
  customer: '#f59e0b',
  lost: '#ef4444',
};

function StatCard({ label, value, icon, accent, sub }: {
  label: string; value: string | number; icon: string; accent: string; sub?: string;
}) {
  return (
    <div style={{
      background: C.slate900, border: '1px solid #1e293b',
      borderRadius: '14px', padding: '18px',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: C.slate100 }}>{value}</div>
      <div style={{ fontSize: '11px', color: C.slate500, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: accent, marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, colors, title }: {
  data: Record<string, number>; colors: Record<string, string>; title: string;
}) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div style={{
      background: C.slate900, border: '1px solid #1e293b',
      borderRadius: '14px', padding: '20px',
    }}>
      <div style={{ fontWeight: 600, color: C.slate100, marginBottom: '16px', fontSize: '14px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Object.entries(data).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '90px', fontSize: '12px', color: colors[key] || C.slate400, textTransform: 'capitalize', flexShrink: 0, fontWeight: 600 }}>
              {key}
            </div>
            <div style={{ flex: 1, height: '10px', background: '#1e293b', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '5px',
                background: colors[key] || C.slate500,
                width: `${(val / max) * 100}%`,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ width: '28px', fontSize: '12px', color: C.slate400, textAlign: 'right', flexShrink: 0 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutSegment({ pct, color, offset }: { pct: number; color: string; offset: number }) {
  const circ = 2 * Math.PI * 40;
  return (
    <circle
      cx="50" cy="50" r="40"
      fill="none"
      stroke={color}
      strokeWidth="12"
      strokeDasharray={`${pct / 100 * circ} ${circ}`}
      strokeDashoffset={-offset / 100 * circ}
      strokeLinecap="butt"
      style={{ transition: 'all 0.6s ease' }}
    />
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.endsWith('/api/v1') ? raw : raw.replace(/\/?$/, '') + '/api/v1';
  })();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [msgRes, leadRes, userRes] = await Promise.all([
        fetch(`${apiBase}/messages?limit=1000`).then(r => r.json()),
        fetch(`${apiBase}/leads?limit=1000`).then(r => r.json()),
        fetch(`${apiBase}/users?limit=1000`).then(r => r.json()),
      ]);

      const messages = msgRes.items || [];
      const leads = leadRes.items || [];

      const stageBreakdown: Record<string, number> = {};
      const statusBreakdown: Record<string, number> = {};
      let totalScore = 0;
      let qualified = 0;
      let converted = 0;

      for (const l of leads) {
        stageBreakdown[l.funnel_stage] = (stageBreakdown[l.funnel_stage] || 0) + 1;
        statusBreakdown[l.status] = (statusBreakdown[l.status] || 0) + 1;
        totalScore += l.lead_score || 0;
        if (l.qualified) qualified++;
        if (l.converted) converted++;
      }

      setData({
        totalMessages: msgRes.total || messages.length,
        incomingMessages: messages.filter((m: any) => m.direction === 'incoming').length,
        outgoingMessages: messages.filter((m: any) => m.direction === 'outgoing').length,
        aiMessages: messages.filter((m: any) => m.is_ai_generated).length,
        totalLeads: leadRes.total || leads.length,
        qualifiedLeads: qualified,
        convertedLeads: converted,
        avgLeadScore: leads.length ? Math.round(totalScore / leads.length) : 0,
        totalUsers: userRes.total || 0,
        stageBreakdown,
        statusBreakdown,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const aiPct = data && data.totalMessages > 0 ? Math.round((data.aiMessages / data.totalMessages) * 100) : 0;
  const qualPct = data && data.totalLeads > 0 ? Math.round((data.qualifiedLeads / data.totalLeads) * 100) : 0;
  const convPct = data && data.totalLeads > 0 ? Math.round((data.convertedLeads / data.totalLeads) * 100) : 0;

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '1040px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: C.slate100, margin: 0 }}>Analytics</h1>
            <p style={{ color: C.slate400, fontSize: '13px', margin: '4px 0 0' }}>Conversion and engagement overview</p>
          </div>
          <button onClick={fetchData} disabled={loading} style={{
            padding: '8px 14px', borderRadius: '10px',
            background: C.slate800, border: '1px solid #334155',
            color: C.slate400, fontSize: '13px', cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {error && (
          <div style={{
            marginBottom: '16px', padding: '14px 16px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px', color: '#fca5a5', fontSize: '13px',
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: '80px', color: C.slate500 }}>⏳ Loading analytics…</div>
        ) : data ? (
          <>
            {/* KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }} className="kpi-grid">
              <StatCard label="Total Messages" value={data.totalMessages} icon="💬" accent={C.blue} />
              <StatCard label="Total Leads" value={data.totalLeads} icon="🎯" accent={C.green} />
              <StatCard label="Total Users" value={data.totalUsers} icon="👤" accent={C.purple} />
              <StatCard label="Avg Lead Score" value={`${data.avgLeadScore}/100`} icon="⭐" accent={C.amber} />
            </div>

            {/* Conversion KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }} className="conv-grid">
              <StatCard label="Qualified Leads" value={data.qualifiedLeads} icon="✓" accent={C.green} sub={`${qualPct}% qualification rate`} />
              <StatCard label="Converted" value={data.convertedLeads} icon="⭐" accent={C.amber} sub={`${convPct}% conversion rate`} />
              <StatCard label="AI-Generated Replies" value={data.aiMessages} icon="🤖" accent={C.purple} sub={`${aiPct}% of all messages`} />
            </div>

            {/* Charts row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }} className="chart-grid">
              <BarChart data={data.stageBreakdown} colors={STAGE_COLORS} title="📊 Leads by Funnel Stage" />
              <BarChart data={data.statusBreakdown} colors={STATUS_COLORS} title="🏷️ Leads by Status" />
            </div>

            {/* Message breakdown */}
            <div style={{
              background: C.slate900, border: '1px solid #1e293b',
              borderRadius: '14px', padding: '20px',
            }}>
              <div style={{ fontWeight: 600, color: C.slate100, marginBottom: '16px', fontSize: '14px' }}>
                💬 Message Breakdown
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
                {/* Donut SVG */}
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="12" />
                  {data.totalMessages > 0 && (() => {
                    const inPct = (data.incomingMessages / data.totalMessages) * 100;
                    const outPct = (data.outgoingMessages / data.totalMessages) * 100;
                    return (
                      <>
                        <DonutSegment pct={inPct} color={C.blue} offset={0} />
                        <DonutSegment pct={outPct} color={C.green} offset={inPct} />
                      </>
                    );
                  })()}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Incoming', value: data.incomingMessages, color: C.blue },
                    { label: 'Outgoing', value: data.outgoingMessages, color: C.green },
                    { label: 'AI Generated', value: data.aiMessages, color: C.purple },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: C.slate400, width: '100px' }}>{item.label}</span>
                      <span style={{ fontSize: '13px', color: C.slate100, fontWeight: 600 }}>{item.value}</span>
                      <span style={{ fontSize: '11px', color: C.slate500 }}>
                        ({data.totalMessages > 0 ? Math.round((item.value / data.totalMessages) * 100) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .kpi-grid { grid-template-columns: repeat(2,1fr) !important; }
          .conv-grid { grid-template-columns: 1fr !important; }
          .chart-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .kpi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
