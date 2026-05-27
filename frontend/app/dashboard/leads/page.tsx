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

  const scoreColor = (score: number) => {
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Lead Pipeline</h1>
            <p className="text-slate-400 text-sm mt-1">{leads.length} total leads</p>
          </div>
          <button onClick={fetchLeads} disabled={loading}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 text-sm transition-colors">
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Funnel Summary */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {['awareness', 'interest', 'consideration', 'decision', 'purchase'].map(stage => {
            const count = leads.filter(l => l.funnel_stage === stage).length;
            return (
              <div key={stage} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-slate-100">{count}</div>
                <div className="text-xs capitalize mt-1" style={{ color: stageColors[stage] }}>{stage}</div>
              </div>
            );
          })}
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'new', 'interested', 'qualified', 'customer', 'lost'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200'
              }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && ` (${leads.filter(l => l.status === s).length})`}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-950/30 border border-red-900 rounded-xl text-red-300 text-sm">⚠️ {error}</div>
        )}

        {loading && !leads.length ? (
          <div className="flex items-center justify-center h-48 text-slate-500">⏳ Loading leads…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🎯</div>
            <div className="text-slate-400">No leads yet</div>
            <div className="text-slate-600 text-sm mt-1">Leads are created automatically from Telegram conversations</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.sort((a, b) => b.lead_score - a.lead_score).map(lead => (
              <div key={lead.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Score */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold border-2"
                    style={{ borderColor: scoreColor(lead.lead_score), color: scoreColor(lead.lead_score) }}>
                    {Math.round(lead.lead_score)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-slate-100 font-medium text-sm">User #{lead.user_id.slice(0, 8)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full border"
                        style={{ color: statusColors[lead.status] || '#64748b', borderColor: statusColors[lead.status] || '#64748b', background: 'transparent' }}>
                        {lead.status}
                      </span>
                      {lead.qualified && <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800">✓ Qualified</span>}
                      {lead.converted && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800">⭐ Converted</span>}
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>Stage: <span className="capitalize" style={{ color: stageColors[lead.funnel_stage] }}>{lead.funnel_stage}</span></span>
                      <span>Interactions: {lead.total_interactions}</span>
                      {lead.source && <span>Source: {lead.source}</span>}
                      <span>{new Date(lead.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Score Bar */}
                  <div className="hidden md:block w-32">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${lead.lead_score}%`, background: scoreColor(lead.lead_score) }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1 text-right">{Math.round(lead.lead_score)}/100</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
