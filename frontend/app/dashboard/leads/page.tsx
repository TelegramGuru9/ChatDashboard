'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

interface Lead {
  id: string;
  user_id: string;
  status: string;
  lead_score: number;
  funnel_stage: string;
  qualified: boolean;
  converted: boolean;
  total_interactions: number;
  created_at: string;
  source?: string;
}

const stageColors: Record<string, string> = {
  awareness: '#64748b',
  interest: '#3b82f6',
  consideration: '#8b5cf6',
  decision: '#f59e0b',
  purchase: '#10b981',
};

const statusColors: Record<string, string> = {
  new: '#64748b',
  interested: '#3b82f6',
  qualified: '#10b981',
  customer: '#f59e0b',
  lost: '#ef4444',
};

function scoreColor(score: number) {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

const C = {
  slate100: '#f1f5f9',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate800: '#1e293b',
  slate900: '#0f172a',
  blue: '#3b82f6',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.endsWith('/api/v1') ? raw : raw.replace(/\/?$/, '') + '/api/v1';
  })();

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/leads?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLeads(data.items || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const sorted = [...filtered].sort((a, b) => b.lead_score - a.lead_score);

  const STAGES = ['awareness', 'interest', 'consideration', 'decision', 'purchase'];
  const STATUSES = ['all', 'new', 'interested', 'qualified', 'customer', 'lost'];

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '1040px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: C.slate100, margin: 0 }}>Lead Pipeline</h1>
            <p style={{ color: C.slate400, fontSize: '13px', margin: '4px 0 0' }}>{leads.length} total leads</p>
          </div>
          <button onClick={fetchLeads} disabled={loading} style={{
            padding: '8px 14px', borderRadius: '10px',
            background: C.slate800, border: '1px solid #334155',
            color: C.slate400, fontSize: '13px', cursor: 'pointer',
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Funnel stages */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '24px' }}>
          {STAGES.map(stage => {
            const count = leads.filter(l => l.funnel_stage === stage).length;
            return (
              <div key={stage} style={{
                background: C.slate900, border: '1px solid #1e293b',
                borderRadius: '12px', padding: '14px', textAlign: 'center',
                borderTop: `3px solid ${stageColors[stage]}`,
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: C.slate100 }}>{count}</div>
                <div style={{ fontSize: '11px', textTransform: 'capitalize', color: stageColors[stage], marginTop: '4px', fontWeight: 600 }}>
                  {stage}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '7px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background: filter === s ? C.blue : C.slate800,
              borderColor: filter === s ? C.blue : '#334155',
              color: filter === s ? '#fff' : C.slate400,
            }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && ` (${leads.filter(l => l.status === s).length})`}
            </button>
          ))}
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

        {loading && !leads.length ? (
          <div style={{ textAlign: 'center', padding: '60px', color: C.slate500 }}>⏳ Loading leads…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎯</div>
            <div style={{ color: C.slate400, fontSize: '15px' }}>No leads yet</div>
            <div style={{ color: C.slate500, fontSize: '12px', marginTop: '6px' }}>Leads are created automatically from Telegram conversations</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sorted.map(lead => {
              const sc = scoreColor(lead.lead_score);
              return (
                <div key={lead.id} style={{
                  background: C.slate900, border: '1px solid #1e293b',
                  borderRadius: '12px', padding: '16px',
                  display: 'flex', alignItems: 'center', gap: '16px',
                }}>
                  {/* Score ring */}
                  <div style={{
                    flexShrink: 0, width: '52px', height: '52px', borderRadius: '50%',
                    border: `2px solid ${sc}`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: sc,
                  }}>
                    {Math.round(lead.lead_score)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ color: C.slate100, fontWeight: 600, fontSize: '14px' }}>
                        User #{lead.user_id.slice(0, 8)}
                      </span>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        border: `1px solid ${statusColors[lead.status] || '#64748b'}`,
                        color: statusColors[lead.status] || '#64748b', fontWeight: 600,
                      }}>
                        {lead.status}
                      </span>
                      {lead.qualified && (
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                          background: 'rgba(16,185,129,0.12)', color: '#34d399',
                          border: '1px solid rgba(16,185,129,0.3)',
                        }}>✓ Qualified</span>
                      )}
                      {lead.converted && (
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                          background: 'rgba(245,158,11,0.12)', color: '#fbbf24',
                          border: '1px solid rgba(245,158,11,0.3)',
                        }}>⭐ Converted</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: C.slate500, flexWrap: 'wrap' }}>
                      <span>Stage: <span style={{ color: stageColors[lead.funnel_stage], textTransform: 'capitalize', fontWeight: 600 }}>{lead.funnel_stage}</span></span>
                      <span>Interactions: {lead.total_interactions}</span>
                      {lead.source && <span>Source: {lead.source}</span>}
                      <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ width: '100px', flexShrink: 0 }}>
                    <div style={{ height: '6px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '4px', background: sc, width: `${lead.lead_score}%` }} />
                    </div>
                    <div style={{ fontSize: '11px', color: C.slate500, marginTop: '4px', textAlign: 'right' }}>
                      {Math.round(lead.lead_score)}/100
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 640px) {
          div[style*="gridTemplateColumns: repeat(5"] { grid-template-columns: repeat(3,1fr) !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
