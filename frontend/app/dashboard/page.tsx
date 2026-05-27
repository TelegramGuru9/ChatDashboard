'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

const ios = {
  bg: '#000', surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: ios.surface, borderRadius: '18px', padding: '18px', border: `1px solid ${ios.border}`, ...style }}>
      {children}
    </div>
  );
}

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
      users:    u.status === 'fulfilled' ? (u.value?.total ?? 0) : 0,
      leads:    l.status === 'fulfilled' ? (l.value?.total ?? 0) : 0,
    }));
  }, []);

  const kpis = [
    { label: 'Messages', value: stats.messages, icon: '💬', color: ios.accent },
    { label: 'Users',    value: stats.users,    icon: '👤', color: ios.purple },
    { label: 'Leads',    value: stats.leads,    icon: '🎯', color: ios.green },
    { label: 'AI',       value: connected ? 'Live' : '—',  icon: '🤖', color: ios.amber },
  ];

  const quickLinks = [
    { href: '/dashboard/inbox',       icon: '💬', label: 'Inbox',       desc: 'All Telegram messages' },
    { href: '/dashboard/leads',       icon: '🎯', label: 'Leads',       desc: 'Pipeline & scoring' },
    { href: '/dashboard/analytics',   icon: '📊', label: 'Analytics',   desc: 'Conversion metrics' },
    { href: '/dashboard/media',       icon: '🖼️', label: 'Media',       desc: 'Images & files' },
    { href: '/dashboard/packages',    icon: '📦', label: 'Packages',    desc: 'Pricing & offers' },
    { href: '/dashboard/autoreplies', icon: '⚡', label: 'Auto-Reply',  desc: 'Smart reply rules' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 20px', maxWidth: '960px', color: ios.text }}>

        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '8px 14px', borderRadius: '999px', marginBottom: '28px',
          background: connected ? 'rgba(48,209,88,0.12)' : connected === false ? 'rgba(255,69,58,0.12)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${connected ? 'rgba(48,209,88,0.3)' : connected === false ? 'rgba(255,69,58,0.3)' : 'rgba(255,255,255,0.1)'}`,
          fontSize: '13px', fontWeight: 500,
          color: connected ? ios.green : connected === false ? ios.red : ios.text2,
        }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            background: connected ? ios.green : connected === false ? ios.red : ios.text3,
            boxShadow: connected ? `0 0 6px ${ios.green}` : undefined,
          }} />
          {connected === null ? 'Connecting…' : connected ? 'Backend online · Telegram active' : 'Backend offline — check Railway'}
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>Good morning 👋</h1>
        <p style={{ color: ios.text2, fontSize: '14px', marginBottom: '28px' }}>Here's your CRM at a glance</p>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '28px' }}>
          {kpis.map(k => (
            <Card key={k.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '26px', marginBottom: '8px' }}>{k.icon}</div>
              <div style={{ fontSize: '30px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: '11px', color: ios.text3, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            </Card>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ fontSize: '12px', fontWeight: 600, color: ios.text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Quick Access
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
          {quickLinks.map(ql => (
            <Link key={ql.href} href={ql.href}>
              <div
                style={{ background: ios.surface, borderRadius: '16px', padding: '18px', border: `1px solid ${ios.border}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = ios.accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = ios.border)}
              >
                <div style={{ fontSize: '26px', marginBottom: '10px' }}>{ql.icon}</div>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{ql.label}</div>
                <div style={{ fontSize: '12px', color: ios.text3 }}>{ql.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:600px){
        div[style*="repeat(4,1fr)"]{grid-template-columns:repeat(2,1fr)!important}
        div[style*="repeat(3,1fr)"]{grid-template-columns:repeat(2,1fr)!important}
      }`}</style>
    </DashboardLayout>
  );
}
