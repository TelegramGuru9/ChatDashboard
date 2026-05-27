'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

export default function DashboardPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ messages: 0, users: 0, leads: 0 });

  useEffect(() => {
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1$/, '');
    fetch(`${base}/health`)
      .then(r => r.json())
      .then(d => setConnected(d.status === 'healthy'))
      .catch(() => setConnected(false));

    const api = base + '/api/v1';
    Promise.allSettled([
      fetch(`${api}/messages?limit=1`).then(r => r.json()),
      fetch(`${api}/users?limit=1`).then(r => r.json()),
      fetch(`${api}/leads?limit=1`).then(r => r.json()),
    ]).then(([m, u, l]) => setStats({
      messages: m.status === 'fulfilled' ? m.value?.total ?? 0 : 0,
      users: u.status === 'fulfilled' ? u.value?.total ?? 0 : 0,
      leads: l.status === 'fulfilled' ? l.value?.total ?? 0 : 0,
    }));
  }, []);

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Status */}
        <div className={`flex items-center gap-2 mb-8 px-4 py-3 rounded-xl text-sm ${connected ? 'bg-green-950/40 border border-green-900/50 text-green-400' : connected === false ? 'bg-red-950/40 border border-red-900/50 text-red-400' : 'bg-slate-800/40 border border-slate-700 text-slate-400'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : connected === false ? 'bg-red-400' : 'bg-slate-500'}`} />
          {connected === null ? 'Connecting to backend…' : connected ? 'Backend connected ✓' : 'Backend not reachable — check Railway'}
        </div>

        <h1 className="text-2xl font-bold text-slate-100 mb-1">Overview</h1>
        <p className="text-slate-400 text-sm mb-8">Your AI Telegram CRM at a glance</p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Messages', value: stats.messages, icon: '💬', accent: '#3b82f6' },
            { label: 'Users', value: stats.users, icon: '👤', accent: '#8b5cf6' },
            { label: 'Leads', value: stats.leads, icon: '🎯', accent: '#10b981' },
            { label: 'AI Active', value: connected ? 'Yes' : 'No', icon: '🤖', accent: '#f59e0b' },
          ].map(c => (
            <div key={c.label} style={{ borderLeft: `3px solid ${c.accent}` }}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="text-2xl font-bold text-slate-100">{c.value}</div>
              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Quick Nav */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { href: '/dashboard/inbox', icon: '📨', title: 'Message Inbox', desc: 'View all Telegram conversations' },
            { href: '/dashboard/leads', icon: '📊', title: 'Lead Pipeline', desc: 'Track and score leads automatically' },
            { href: '/dashboard/settings', icon: '🤖', title: 'AI Persona', desc: 'Configure your AI assistant personality' },
          ].map(item => (
            <a key={item.href} href={item.href}
              className="block no-underline bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-blue-600 transition-colors">
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="font-semibold text-slate-100 mb-1">{item.title}</div>
              <div className="text-xs text-slate-500">{item.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
