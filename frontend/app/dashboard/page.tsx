'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import Link from 'next/link';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', sep:'rgba(255,255,255,0.07)',
  t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

function Card({ children, style, onMouseEnter, onMouseLeave }: {
  children: React.ReactNode; style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div style={{ background: C.s1, borderRadius:'16px', border:`1px solid ${C.sep}`, ...style }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {children}
    </div>
  );
}

function BigToggle({ on, loading, onChange }: { on: boolean; loading: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        width:'64px', height:'34px', borderRadius:'17px',
        background: on ? C.green : C.s3,
        border: 'none', cursor: loading ? 'wait' : 'pointer', position:'relative',
        transition:'background 0.25s', flexShrink:0, opacity: loading ? 0.6 : 1,
        boxShadow: on ? `0 0 16px rgba(48,209,88,0.4)` : 'none',
      }}
    >
      <div style={{
        position:'absolute', top:'4px', left: on ? '34px' : '4px', width:'26px', height:'26px',
        borderRadius:'50%', background:'#fff', transition:'left 0.25s',
        boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px',
      }}>
        {loading ? '…' : on ? '✓' : ''}
      </div>
    </button>
  );
}

const QUICK = [
  { href:'/dashboard/inbox',       icon:'💬', label:'Inbox',       desc:'Alle Gespräche' },
  { href:'/dashboard/leads',       icon:'🎯', label:'Leads',       desc:'Pipeline & Scoring' },
  { href:'/dashboard/analytics',   icon:'📊', label:'Analytics',   desc:'Conversion-Metriken' },
  { href:'/dashboard/media',       icon:'🖼️', label:'Media',       desc:'Teaser & Dateien' },
  { href:'/dashboard/packages',    icon:'📦', label:'Pakete',      desc:'Angebote & Preise' },
  { href:'/dashboard/autoreplies', icon:'⚡', label:'Auto-Antwort', desc:'Automationen' },
];

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '');
};

export default function DashboardPage() {
  const [health,     setHealth]    = useState<any>(null);
  const [tg,         setTg]        = useState<any>(null);
  const [stats,      setStats]     = useState({ messages:0, users:0, leads:0 });
  const [autopilot,  setAutopilot] = useState<boolean>(false);
  const [apLoading,  setApLoading] = useState(true);
  const [apToggling, setApToggling]= useState(false);
  const [apStatus,   setApStatus]  = useState('');

  const base = apiBase();
  const api  = `${base}/api/v1`;

  // ── Load everything ───────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    // Status, Telegram, quick stats
    Promise.allSettled([
      fetch(`${base}/health`).then(r => r.json()),
      fetch(`${api}/telegram/status`).then(r => r.json()),
      fetch(`${api}/messages?limit=1`).then(r => r.json()),
      fetch(`${api}/users?limit=1`).then(r => r.json()),
      fetch(`${api}/leads?limit=1`).then(r => r.json()),
    ]).then(([h, t, m, u, l]) => {
      if (h.status === 'fulfilled') setHealth(h.value);
      if (t.status === 'fulfilled') setTg(t.value);
      setStats({
        messages: m.status === 'fulfilled' ? (m.value?.total ?? 0) : 0,
        users:    u.status === 'fulfilled' ? (u.value?.total ?? 0) : 0,
        leads:    l.status === 'fulfilled' ? (l.value?.total ?? 0) : 0,
      });
    });

    // Global autopilot state — prefer config, fall back to "are any users enabled?"
    try {
      setApLoading(true);
      const cfgRes = await fetch(`${api}/config/autopilot_global`);
      const cfg = await cfgRes.json();
      if (cfg.value !== null && cfg.value !== undefined) {
        // Stored config exists
        setAutopilot(cfg.value?.enabled !== false);
      } else {
        // No config yet — check if any user has ai_enabled
        const usersRes = await fetch(`${api}/users?limit=1`);
        const usersData = await usersRes.json();
        setAutopilot(false); // default off if no config
      }
    } catch {
      setAutopilot(false);
    } finally {
      setApLoading(false);
    }
  }, [base, api]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Toggle autopilot ──────────────────────────────────────────────────────
  const toggleAutopilot = async () => {
    const next = !autopilot;
    setApToggling(true);
    setApStatus('');
    try {
      // 1. Save global config
      await fetch(`${api}/config/autopilot_global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });

      // 2. Enable or disable all user-level AI flags
      if (next) {
        const res = await fetch(`${api}/ai/enable-all`, { method: 'POST' });
        const d = await res.json();
        setApStatus(`✓ Autopilot aktiviert — ${d.enabled_count ?? '?'} Chats aktiv`);
      } else {
        const res = await fetch(`${api}/ai/disable-all`, { method: 'POST' });
        const d = await res.json();
        setApStatus(`Autopilot deaktiviert — ${d.disabled_count ?? '?'} Chats pausiert`);
      }

      setAutopilot(next);
    } catch (e: any) {
      setApStatus(`⚠ Fehler: ${e.message}`);
    } finally {
      setApToggling(false);
      setTimeout(() => setApStatus(''), 4000);
    }
  };

  const backendOk = health?.status === 'healthy';
  const tgOk      = !!tg?.connected;
  const tgName    = tg?.account?.name || tg?.account?.username;

  const STATUS_ITEMS = [
    { label: 'Backend',  ok: backendOk, value: backendOk ? 'Online' : 'Offline' },
    { label: 'Telegram', ok: tgOk,      value: tgOk ? (tgName || 'Verbunden') : 'Nicht verbunden' },
    { label: 'KI-Modell', ok: backendOk, value: backendOk ? 'Bereit' : 'Offline' },
  ];

  const KPIS = [
    { label: 'Nachrichten', value: stats.messages.toLocaleString(), color: C.blue,   icon: '✉' },
    { label: 'Nutzer',      value: stats.users.toLocaleString(),    color: C.purple, icon: '👥' },
    { label: 'Leads',       value: stats.leads.toLocaleString(),    color: C.green,  icon: '🎯' },
    { label: 'Autopilot',   value: autopilot ? 'Aktiv' : 'Aus',    color: autopilot ? C.green : C.t3, icon: '🤖' },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'980px', color: C.t1 }}>

        {/* Header */}
        <div style={{ marginBottom:'24px' }}>
          <h1 style={{ fontSize:'28px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Übersicht</h1>
          <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Dein KI-Telegram-CRM auf einen Blick</p>
        </div>

        {/* ── AUTOPILOT SWITCH ─────────────────────────────────────────────── */}
        <div style={{
          background: autopilot
            ? 'linear-gradient(135deg, rgba(48,209,88,0.12) 0%, rgba(48,209,88,0.04) 100%)'
            : C.s1,
          border: `1px solid ${autopilot ? 'rgba(48,209,88,0.3)' : C.sep}`,
          borderRadius:'18px', padding:'22px 24px', marginBottom:'20px',
          display:'flex', alignItems:'center', gap:'20px', flexWrap:'wrap',
          transition:'all 0.3s',
        }}>
          {/* Icon */}
          <div style={{
            width:'52px', height:'52px', borderRadius:'14px', flexShrink:0, fontSize:'28px',
            display:'flex', alignItems:'center', justifyContent:'center',
            background: autopilot ? 'rgba(48,209,88,0.15)' : C.s2,
            border:`1px solid ${autopilot ? 'rgba(48,209,88,0.25)' : C.sep}`,
          }}>
            🤖
          </div>

          {/* Text */}
          <div style={{ flex:1, minWidth:'200px' }}>
            <div style={{ fontWeight:700, fontSize:'17px', marginBottom:'4px' }}>
              Autopilot
              {!apLoading && (
                <span style={{
                  marginLeft:'10px', fontSize:'11px', fontWeight:600,
                  padding:'2px 8px', borderRadius:'8px',
                  background: autopilot ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)',
                  color: autopilot ? C.green : C.t3,
                }}>
                  {autopilot ? '● AKTIV' : '○ AUS'}
                </span>
              )}
            </div>
            <div style={{ fontSize:'13px', color: C.t2 }}>
              {autopilot
                ? 'Nika antwortet automatisch — KI aktiv für alle Chats. Einzelne Chats im Inbox deaktivierbar.'
                : 'Autopilot ist aus — Nika antwortet nicht automatisch. Einschalten um alle Chats zu aktivieren.'}
            </div>
            {apStatus && (
              <div style={{ fontSize:'12px', marginTop:'6px', color: apStatus.startsWith('✓') ? C.green : apStatus.startsWith('⚠') ? C.orange : C.t2 }}>
                {apStatus}
              </div>
            )}
          </div>

          {/* Toggle */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'6px' }}>
            <BigToggle on={autopilot} loading={apLoading || apToggling} onChange={toggleAutopilot} />
            <span style={{ fontSize:'10px', color: C.t3 }}>{autopilot ? 'Ausschalten' : 'Einschalten'}</span>
          </div>
        </div>

        {/* Status bar */}
        <Card style={{ padding:'14px 20px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'24px', flexWrap:'wrap' }}>
          {STATUS_ITEMS.map(s => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ width:'7px', height:'7px', borderRadius:'50%', background: s.ok ? C.green : C.red, flexShrink:0, boxShadow: s.ok ? `0 0 8px ${C.green}` : 'none' }} />
              <span style={{ fontSize:'12px', color: C.t3, fontWeight:500 }}>{s.label}</span>
              <span style={{ fontSize:'12px', color: s.ok ? C.t1 : C.red, fontWeight:600 }}>{s.value}</span>
            </div>
          ))}
          {!tgOk && (
            <Link href="/dashboard/inbox" style={{ marginLeft:'auto', fontSize:'12px', color: C.blue, fontWeight:600 }}>
              Verbindung reparieren →
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
        <div style={{ fontSize:'11px', fontWeight:600, color: C.t3, textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:'12px' }}>
          Schnellzugriff
        </div>
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
              <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'2px' }}>Telegram nicht verbunden</div>
              <div style={{ fontSize:'13px', color: C.t2 }}>
                Gehe zu <Link href="/dashboard/inbox" style={{ color: C.blue }}>Inbox</Link> und klicke Reconnect um Chats und Autopilot zu aktivieren.
              </div>
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
