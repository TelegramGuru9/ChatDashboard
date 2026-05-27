'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

const C = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
  bg: '#0d1117',
};

const card: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '14px',
  padding: '20px',
};

export default function DashboardPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ messages: 0, users: 0, leads: 0 });

  useEffect(() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const base = raw.replace(/\/api\/v1\/?$/, '');
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
      messages: m.status === 'fulfilled' ? (m.value?.total ?? 0) : 0,
      users: u.status === 'fulfilled' ? (u.value?.total ?? 0) : 0,
      leads: l.status === 'fulfilled' ? (l.value?.total ?? 0) : 0,
    }));
  }, []);

  const statusColor = connected ? C.green : connected === false ? C.red : C.slate500;
  const statusBg = connected ? 'rgba(16,185,129,0.08)' : connected === false ? 'rgba(239,68,68,0.08)' : 'rgba(100,116,139,0.12)';

  const statCards = [
    { label: 'Messages', value: stats.messages, icon: '💬', accent: C.blue },
    { label: 'Users', value: stats.users, icon: '👤', accent: C.purple },
    { label: 'Leads', value: stats.leads, icon: '🎯', accent: C.green },
    { label: 'AI Active', value: connected ? 'Online' : 'Offline', icon: '🤖', accent: C.amber },
  ];

  const quickNav = [
    { href: '/dashboard/inbox', icon: '📨', title: 'Message Inbox', desc: 'View all Telegram conversations' },
    { href: '/dashboard/leads', icon: '📊', title: 'Lead Pipeline', desc: 'Track and score leads automatically' },
    { href: '/dashboard/analytics', icon: '📈', title: 'Analytics', desc: 'Visualise conversion and engagement' },
    { href: '/dashboard/settings', icon: '🤖', title: 'AI Persona', desc: 'Configure your AI assistant personality' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '960px', margin: '0 auto' }}>

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderRadius: '12px', marginBottom: '28px',
          background: statusBg, border: `1px solid ${statusColor}33`,
          color: statusColor, fontSize: '13px', fontWeight: 500,
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: statusColor, display: 'inline-block',
            boxShadow: connected ? `0 0 8px ${C.green}` : undefined,
          }} />
          {connected === null
            ? 'Connecting to backend…'
            : connected
            ? '✓ Backend connected — Telegram AI is live'
            : '⚠ Backend not reachable — check Railway deployment'}
        </div>

        <h1 style={{ fontSize: '24px', fontWeight: 700, color: C.slate100, marginBottom: '4px' }}>
          Overview
        </h1>
        <p style={{ color: C.slate400, fontSize: '13px', marginBottom: '28px' }}>
          Your AI Telegram CRM at a glance
        </p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '28px' }}>
          {statCards.map(c => (
            <div key={c.label} style={{ ...card, borderLeft: `3px solid ${c.accent}` }}>
              <div style={{ fontSize: '26px', marginBottom: '10px' }}>{c.icon}</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: C.slate100 }}>{c.value}</div>
              <div style={{ fontSize: '11px', color: C.slate500, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Quick nav */}
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: C.slate400, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>
          Quick Access
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '14px' }}>
          {quickNav.map(item => (
            <Link key={item.href} href={item.href} style={{
              ...card,
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'border-color 0.15s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = C.blue)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}
            >
              <div style={{ fontSize: '30px', marginBottom: '10px' }}>{item.icon}</div>
              <div style={{ fontWeight: 600, color: C.slate100, marginBottom: '4px', fontSize: '15px' }}>{item.title}</div>
              <div style={{ fontSize: '12px', color: C.slate500 }}>{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          div[style*="gridTemplateColumns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="gridTemplateColumns: repeat(2"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </DashboardLayout>
  );
}
