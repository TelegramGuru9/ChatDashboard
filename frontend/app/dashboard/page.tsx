'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

const p = {
  bg:'#000',s1:'#1c1c1e',s2:'#2c2c2e',s3:'#3a3a3c',
  sep:'rgba(84,84,88,0.5)',
  label:'#fff',label2:'rgba(235,235,245,0.6)',label3:'rgba(235,235,245,0.3)',
  blue:'#0a84ff',green:'#30d158',red:'#ff453a',orange:'#ff9f0a',yellow:'#ffd60a',purple:'#bf5af2',
};

export default function DashboardPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tgConnected, setTgConnected] = useState<boolean | null>(null);
  const [tgAccount, setTgAccount] = useState<string>('');
  const [stats, setStats] = useState({ messages: 0, users: 0, leads: 0 });

  useEffect(() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const base = raw.replace(/\/api\/v1\/?$/, '');
    fetch(`${base}/health`).then(r => r.json()).then(d => {
      setConnected(d.status === 'healthy');
    }).catch(() => setConnected(false));

    fetch(`${base}/api/v1/telegram/status`).then(r => r.json()).then(d => {
      setTgConnected(!!d.connected);
      if (d.account?.name) setTgAccount(d.account.name);
    }).catch(() => setTgConnected(false));

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
    { label: 'Messages', value: stats.messages, color: p.blue },
    { label: 'Users',    value: stats.users,    color: p.purple },
    { label: 'Leads',    value: stats.leads,    color: p.green },
    { label: 'AI',       value: connected ? 'Live' : '—', color: p.orange },
  ];

  const links = [
    { href: '/dashboard/inbox',       icon: '✉',  label: 'Inbox',       desc: 'All Telegram chats — tap Sync to import' },
    { href: '/dashboard/leads',       icon: '◎',  label: 'Leads',       desc: 'Pipeline & lead scoring' },
    { href: '/dashboard/analytics',   icon: '▦',  label: 'Analytics',   desc: 'Conversion metrics' },
    { href: '/dashboard/media',       icon: '⬡',  label: 'Media',       desc: 'Upload files for auto-sending' },
    { href: '/dashboard/packages',    icon: '▣',  label: 'Packages',    desc: 'Creator offers with keyword triggers' },
    { href: '/dashboard/autoreplies', icon: '⚡', label: 'Auto-Reply',  desc: 'Smart reply automation rules' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 20px', maxWidth: '880px', color: p.label }}>

        {/* Status */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
          borderRadius: '20px', marginBottom: '28px', fontSize: '13px',
          background: connected ? 'rgba(48,209,88,0.08)' : connected === false ? 'rgba(255,69,58,0.08)' : p.s1,
          border: `1px solid ${connected ? 'rgba(48,209,88,0.2)' : connected === false ? 'rgba(255,69,58,0.2)' : p.sep}`,
          color: connected ? p.green : connected === false ? p.red : p.label3,
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: connected ? p.green : connected === false ? p.red : p.label3, flexShrink: 0 }} />
          {connected === null ? 'Connecting…' : connected
            ? tgConnected === false
              ? 'Backend connected · ⚠ Telegram not connected — go to Inbox to fix'
              : `Backend connected · ${tgAccount ? `Telegram: ${tgAccount}` : 'Telegram active'}`
            : 'Backend offline — check Railway'}
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '4px' }}>Overview</h1>
        <p style={{ color: p.label2, fontSize: '13px', marginBottom: '24px' }}>
          Your AI Telegram CRM at a glance
        </p>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '28px' }} className="kpi">
          {kpis.map(k => (
            <div key={k.label} style={{ background: p.s1, borderRadius: '14px', padding: '16px', border: `1px solid ${p.sep}`, borderTop: `2px solid ${k.color}` }}>
              <div style={{ fontSize: '26px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: '11px', color: p.label3, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div style={{ fontSize: '11px', fontWeight: 600, color: p.label3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Quick Access</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }} className="ql">
          {links.map(l => (
            <Link key={l.href} href={l.href}>
              <div style={{ background: p.s1, borderRadius: '14px', padding: '16px', border: `1px solid ${p.sep}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = p.blue)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = p.sep)}>
                <div style={{ fontSize: '22px', marginBottom: '8px' }}>{l.icon}</div>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '3px' }}>{l.label}</div>
                <div style={{ fontSize: '12px', color: p.label3 }}>{l.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <style>{`
        @media(max-width:600px){ .kpi{grid-template-columns:repeat(2,1fr)!important} .ql{grid-template-columns:1fr!important} }
        @media(min-width:601px) and (max-width:860px){ .ql{grid-template-columns:repeat(2,1fr)!important} }
      `}</style>
    </DashboardLayout>
  );
}
