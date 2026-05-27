'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', sep:'rgba(255,255,255,0.07)',
  t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.s1, borderRadius: '16px', border: `1px solid ${C.sep}`, ...style }}>
      {children}
    </div>
  );
}

const QUICK = [
  { href:'/dashboard/inbox',       icon:'💬', label:'Inbox',      desc:'All conversations' },
  { href:'/dashboard/leads',       icon:'🎯', label:'Leads',      desc:'Pipeline & scoring' },
  { href:'/dashboard/analytics',   icon:'📊', label:'Analytics',  desc:'Conversion metrics' },
  { href:'/dashboard/media',       icon:'🖼️', label:'Media',      desc:'Auto-send files' },
  { href:'/dashboard/packages',    icon:'📦', label:'Packages',   desc:'Offers & pricing' },
  { href:'/dashboard/autoreplies', icon:'⚡', label:'Auto-Reply', desc:'Smart automations' },
];

export default function DashboardPage() {
  const [health, setHealth] = useState<any>(null);
  const [tg, setTg]         = useState<any>(null);
  const [stats, setStats]   = useState({ messages:0, users:0, leads:0 });

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '');
  })();

  useEffect(() => {
    fetch(`${apiBase}/health`).then(r=>r.json()).then(setHealth).catch(()=>{});
    fetch(`${apiBase}/api/v1/telegram/status`).then(r=>r.json()).then(setTg).catch(()=>{});
    const api = `${apiBase}/api/v1`;
    Promise.allSettled([
      fetch(`${api}/messages?limit=1`).then(r=>r.json()),
      fetch(`${api}/users?limit=1`).then(r=>r.json()),
      fetch(`${api}/leads?limit=1`).then(r=>r.json()),
    ]).then(([m,u,l]) => setStats({
      messages: m.status==='fulfilled' ? (m.value?.total ?? 0) : 0,
      users:    u.status==='fulfilled' ? (u.value?.total ?? 0) : 0,
      leads:    l.status==='fulfilled' ? (l.value?.total ?? 0) : 0,
    }));
  }, []);

  const backendOk = health?.status === 'healthy';
  const tgOk     = !!tg?.connected;
  const tgName   = tg?.account?.name || tg?.account?.username;

  const STATUS_ITEMS = [
    { label: 'Backend',  ok: backendOk, value: backendOk ? 'Online' : 'Offline' },
    { label: 'Telegram', ok: tgOk,      value: tgOk ? (tgName || 'Connected') : 'Disconnected' },
    { label: 'AI',       ok: backendOk, value: backendOk ? 'Ready' : 'Offline' },
  ];

  const KPIS = [
    { label: 'Messages', value: stats.messages.toLocaleString(), color: C.blue, icon: '✉' },
    { label: 'Users',    value: stats.users.toLocaleString(),    color: C.purple, icon: '👥' },
    { label: 'Leads',    value: stats.leads.toLocaleString(),    color: C.green, icon: '🎯' },
    { label: 'AI',       value: tgOk ? 'Active' : 'Off',        color: C.orange, icon: '🤖' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'980px', color: C.t1 }}>

        {/* Header */}
        <div style={{ marginBottom:'28px' }}>
          <h1 style={{ fontSize:'28px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Overview</h1>
          <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Your AI Telegram CRM at a glance</p>
        </div>

        {/* Status bar */}
        <Card style={{ padding:'16px 20px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'24px', flexWrap:'wrap' }}>
          {STATUS_ITEMS.map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ width:'7px', height:'7px', borderRadius:'50%', background: s.ok ? C.green : C.red, flexShrink:0, boxShadow: s.ok ? `0 0 8px ${C.green}` : 'none' }} />
              <span style={{ fontSize:'12px', color: C.t3, fontWeight:500 }}>{s.label}</span>
              <span style={{ fontSize:'12px', color: s.ok ? C.t1 : C.red, fontWeight:600 }}>{s.value}</span>
            </div>
          ))}
          {!tgOk && (
            <Link href="/dashboard/inbox" style={{ marginLeft:'auto', fontSize:'12px', color: C.blue, fontWeight:600 }}>
              Fix connection →
            </Link>
          )}
        </Card>

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'20px' }} className="kpi-grid">
          {KPIS.map(k => (
            <Card key={k.label} style={{ padding:'20px 18px', borderTop:`2px solid ${k.color}` }}>
              <div style={{ fontSize:'11px', color: C.t3, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>{k.label}</div>
              <div style={{ fontSize:'30px', fontWeight:700, color: k.color, letterSpacing:'-0.03em', lineHeight:1 }}>{k.value}</div>
            </Card>
          ))}
        </div>

        {/* Quick access */}
        <div style={{ fontSize:'11px', fontWeight:600, color: C.t3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:'12px' }}>Quick Access</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px' }} className="ql-grid">
          {QUICK.map(q => (
            <Link key={q.href} href={q.href} style={{ display:'block', textDecoration:'none' }}>
              <Card style={{ padding:'18px', cursor:'pointer', transition:'border-color 0.15s, transform 0.1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.blue; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.sep; (e.currentTarget as HTMLElement).style.transform = ''; }}
              >
                <div style={{ fontSize:'24px', marginBottom:'10px' }}>{q.icon}</div>
                <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'3px', color: C.t1 }}>{q.label}</div>
                <div style={{ fontSize:'12px', color: C.t3 }}>{q.desc}</div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Help callout if not connected */}
        {!tgOk && (
          <Card style={{ padding:'16px 20px', marginTop:'20px', background:'rgba(10,132,255,0.06)', borderColor:'rgba(10,132,255,0.2)', display:'flex', alignItems:'center', gap:'14px' }}>
            <span style={{ fontSize:'24px' }}>🔗</span>
            <div>
              <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'2px' }}>Telegram not connected</div>
              <div style={{ fontSize:'13px', color: C.t2 }}>Go to <Link href="/dashboard/inbox" style={{ color: C.blue }}>Inbox</Link> and click Reconnect to get your chats and autopilot working.</div>
            </div>
          </Card>
        )}
      </div>

      <style>{`
        @media(max-width:640px) { .kpi-grid{grid-template-columns:repeat(2,1fr)!important} .ql-grid{grid-template-columns:1fr!important} }
        @media(min-width:641px) and (max-width:900px) { .ql-grid{grid-template-columns:repeat(2,1fr)!important} }
      `}</style>
    </DashboardLayout>
  );
}
