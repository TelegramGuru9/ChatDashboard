'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

interface Message {
  id: string;
  text: string | null;
  direction: 'incoming' | 'outgoing';
  is_ai_generated: boolean;
  created_at: string;
  user_id: string;
}

export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing' | 'ai'>('all');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.endsWith('/api/v1') ? raw : raw.replace(/\/?$/, '') + '/api/v1';
  })();

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/messages?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.items || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const filtered = messages.filter(m => {
    if (filter === 'incoming' && m.direction !== 'incoming') return false;
    if (filter === 'outgoing' && m.direction !== 'outgoing') return false;
    if (filter === 'ai' && !m.is_ai_generated) return false;
    if (search && !m.text?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Message Inbox</h1>
            <p className="text-slate-400 text-sm mt-1">{messages.length} total messages</p>
          </div>
          <button onClick={fetchMessages} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 text-sm transition-colors">
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3 mb-6">
          <input
            placeholder="Search messages…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-1">
            {(['all', 'incoming', 'outgoing', 'ai'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-950/30 border border-red-900 rounded-xl text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading && !messages.length ? (
          <div className="flex items-center justify-center h-48 text-slate-500">
            <div>⏳ Loading messages…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <div className="text-slate-400">No messages found</div>
            <div className="text-slate-600 text-sm mt-1">Messages will appear here once your Telegram bot receives them</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(msg => (
              <div key={msg.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    msg.direction === 'incoming'
                      ? 'bg-blue-900/60 text-blue-300 border border-blue-800'
                      : 'bg-green-900/60 text-green-300 border border-green-800'
                  }`}>
                    {msg.direction === 'incoming' ? '← In' : '→ Out'}
                  </span>
                  {msg.is_ai_generated && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-800">
                      🤖 AI
                    </span>
                  )}
                  <span className="text-xs text-slate-500 ml-auto">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-200 text-sm leading-relaxed">
                  {msg.text || <span className="text-slate-500 italic">[media message]</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
