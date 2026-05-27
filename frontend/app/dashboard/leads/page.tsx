'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

interface Lead {
  id: string; user_id: string; status: string; lead_score: number;
  funnel_stage: string; qualified: boolean; converted: boolean;
  total_interactions: number; created_at: string; source?: string;
}

const ios = {
  bg: '#000', surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

const STAGE_C: Record<string, string> = {
  awareness: '#64748b', interest: '#0a84ff', consideration: '#bf5af2', decision: '#ffd60a', purchase: '#30d158',
};
const STATUS_C: Record<string, string> = {
  new: '#64748b', interested: '#0a84ff', qualified: '#30d158', customer: '#ffd60a', lost: '#ff453a',
};

function scoreColor(s: number) { return s >= 70 ? '#30d158' : s >= 40 ? '#ffd60a' : '#ff453a'; }

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  const fetchLeads = useCallback(async () => {
    try { setLoading(true); setError('');
      const res = await fetch(`${apiBase}/leads?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLeads((await res.json()).items || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = (filter === 'all' ? leads : leads.filter(l => l.status === filter))
    .sort((a, b) => b.lead_score - a.lead_score);

  const STAGES = ['awareness','interest','consideration','decision','purchase'];
  const STATUSES = ['all','new','interested','qualified','customer','lost'];

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '1000px', color: ios.text }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Lead Pipeline</h1>
            <p style={{ color: ios.text2, fontSize: '13px', marginTop: '4px' }}>{leads.length} total leads</p>
          </div>
          <button onClick={fetchLeads} disabled={loading} style={{
            padding: '9px 16px', borderRadius: '12px', background: ios.surface,
            border: `1px solid ${ios.border}`, color: ios.text2, fontSize: '13px', cursor: 'pointer', opacity: loading ? 0.5 : 1,
          }}>{loading ? '⏳' : '🔄'} Refresh</button>
        </div>

        {/* Funnel stages */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '20px' }}>
          {STAGES.map(stage => {
            const count = leads.filter(l => l.funnel_stage === stage).length;
            const pct = leads.length ? Math.round((count / leads.length) * 100) : 0;
            return (
              <div key={stage} style={{
                background: ios.surface, borderRadius: '14px', padding: '14px', textAlign: 'center',
                border: `1px solid ${ios.border}`, borderTop: `3px solid ${STAGE_C[stage]}`,
              }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: STAGE_C[stage] }}>{count}</div>
                <div style={{ fontSize: '10px', textTransform: 'capitalize', color: ios.text2, marginTop: '4px', fontWeight: 600 }}>{stage}</div>
                <div style={{ fontSize: '10px', color: ios.text3, marginTop: '2px' }}>{pct}%</div>
              </div>
            );
          })}
        </div>

        {/* Status filters */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '7px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid',
              background: filter === s ? ios.accent : ios.surface,
              borderColor: filter === s ? ios.accent : ios.border,
              color: filter === s ? '#fff' : ios.text2,
            }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && ` (${leads.filter(l => l.status === s).length})`}
            </button>
          ))}
        </div>

        {error && <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.3)', color: '#ff6b6b', fontSize: '13px', marginBottom: '14px' }}>⚠️ {error}</div>}

        {loading && !leads.length ? (
          <div style={{ textAlign: 'center', padding: '80px', color: ios.text3 }}>⏳ Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>🎯</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No leads yet</div>
            <div style={{ fontSize: '13px', color: ios.text3 }}>Leads are created automatically from Telegram conversations</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(lead => {
              const sc = scoreColor(lead.lead_score);
              return (
                <div key={lead.id} style={{
                  background: ios.surface, borderRadius: '14px', padding: '16px',
                  border: `1px solid ${ios.border}`,
                  display: 'flex', alignItems: 'center', gap: '14px',
                }}>
                  {/* Score ring */}
                  <div style={{
                    flexShrink: 0, width: '50px', height: '50px', borderRadius: '50%',
                    border: `2.5px solid ${sc}`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: sc,
                    background: `${sc}15`,
                  }}>{Math.round(lead.lead_score)}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>User #{lead.user_id?.slice(0, 8)}</span>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        border: `1px solid ${STATUS_C[lead.status] || '#64748b'}`,
                        color: STATUS_C[lead.status] || '#64748b',
                      }}>{lead.status}</span>
                      {lead.qualified && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(48,209,88,0.12)', color: ios.green, border: '1px solid rgba(48,209,88,0.3)' }}>✓ Qualified</span>}
                      {lead.converted && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,214,10,0.12)', color: ios.amber, border: '1px solid rgba(255,214,10,0.3)' }}>⭐ Converted</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: ios.text3, flexWrap: 'wrap' }}>
                      <span>Stage: <span style={{ color: STAGE_C[lead.funnel_stage], textTransform: 'capitalize', fontWeight: 600 }}>{lead.funnel_stage}</span></span>
                      <span>Chats: {lead.total_interactions}</span>
                      {lead.source && <span>Source: {lead.source}</span>}
                      <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ width: '90px', flexShrink: 0 }}>
                    <div style={{ height: '5px', background: ios.surface2, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '3px', background: sc, width: `${lead.lead_score}%` }} />
                    </div>
                    <div style={{ fontSize: '10px', color: ios.text3, marginTop: '4px', textAlign: 'right' }}>{Math.round(lead.lead_score)}/100</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@media(max-width:600px){ div[style*="repeat(5,1fr)"]{grid-template-columns:repeat(3,1fr)!important} }`}</style>
    </DashboardLayout>
  );
}
