'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreatorProvider, useCreator } from '@/contexts/CreatorContext';

interface DashboardLayoutProps { children: React.ReactNode; }

const C = {
  bg:'#0a0a0a', sb:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#ffffff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

const Ic = ({ d, size = 18 }: { d: string | string[]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const ICONS: Record<string, React.ReactNode> = {
  overview: <Ic d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />,
  inbox:    <Ic d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  leads:    <Ic d={["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8z","M23 21v-2a4 4 0 00-3-3.87","M16 3.13a4 4 0 010 7.75"]} />,
  analytics:<Ic d={["M18 20V10","M12 20V4","M6 20v-6"]} />,
  media:    <Ic d={["M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z","M8.5 8.5a1 1 0 100-2 1 1 0 000 2z","M21 15l-5-5L5 21"]} />,
  packages: <Ic d={["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z","M3.27 6.96L12 12.01l8.73-5.05","M12 22.08V12"]} />,
  autoreply:<Ic d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  creators: <Ic d={["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2","M9 11a4 4 0 100-8 4 4 0 000 8z","M23 21v-2a4 4 0 00-3-3.87","M16 3.13a4 4 0 010 7.75"]} size={18} />,
  settings: <Ic d={["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"]} />,
};

const NAV = [
  { label: 'Overview',   href: '/dashboard',             icon: 'overview',  exact: true },
  { label: 'Inbox',      href: '/dashboard/inbox',       icon: 'inbox' },
  { label: 'Leads',      href: '/dashboard/leads',       icon: 'leads' },
  { label: 'Analytics',  href: '/dashboard/analytics',   icon: 'analytics' },
  { label: 'Media',      href: '/dashboard/media',       icon: 'media' },
  { label: 'Packages',   href: '/dashboard/packages',    icon: 'packages' },
  { label: 'Creators',   href: '/dashboard/creators',    icon: 'creators' },
  { label: 'Settings',   href: '/dashboard/settings',    icon: 'settings' },
];

const W_FULL = 232;
const W_MINI = 62;

// ── Creator Switcher ─────────────────────────────────────────────────────────
function CreatorSwitcher({ full }: { full: boolean }) {
  const { creators, selected, switchCreator } = useCreator();
  const [open, setOpen] = useState(false);

  if (creators.length === 0) return null;

  return (
    <div style={{ padding: full ? '10px 10px 6px' : '10px 4px 6px', position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: full ? '8px' : 0, justifyContent: full ? 'flex-start' : 'center',
          padding: full ? '7px 9px' : '7px 0',
          borderRadius: '10px', border: `1px solid ${C.sep}`,
          background: open ? 'rgba(255,255,255,0.06)' : C.s2,
          cursor: 'pointer', transition: 'background 0.12s',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
          background: selected?.color || C.blue,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px',
        }}>
          {selected?.emoji || '🎭'}
        </div>
        {full && (
          <>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected?.display_name || selected?.name || 'Creator'}
              </div>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.t3} strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
          <div style={{
            position: 'absolute', top: '100%', left: full ? '10px' : '4px', right: full ? '10px' : '4px',
            background: C.s2, borderRadius: '12px', border: `1px solid ${C.sep}`,
            zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: '180px',
          }}>
            {creators.map(c => (
              <button key={c.id}
                onClick={() => { switchCreator(c.id); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', border: 'none', cursor: 'pointer',
                  color: C.t1, transition: 'background 0.1s',
                  background: c.id === selected?.id ? 'rgba(10,132,255,0.12)' : 'transparent',
                }}
                onMouseEnter={e => { if (c.id !== selected?.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (c.id !== selected?.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                  background: c.color || C.blue,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                }}>
                  {c.emoji || '🎭'}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.display_name || c.name}
                  </div>
                  {c.telegram_phone && (
                    <div style={{ fontSize: '10px', color: C.t3 }}>{c.telegram_phone}</div>
                  )}
                </div>
                {c.id === selected?.id && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${C.sep}`, padding: '6px' }}>
              <Link href="/dashboard/creators" onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '8px', color: C.blue, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(10,132,255,0.1)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span>+ Creator verwalten</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Inner layout (needs CreatorContext) ──────────────────────────────────────
function DashboardInner({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => { const m = window.innerWidth < 768; setMobile(m); if (m) setCollapsed(false); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isActive = (item: typeof NAV[0]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const full = !collapsed || mobile;
  const sw   = mobile ? W_FULL : collapsed ? W_MINI : W_FULL;

  const NavList = ({ onNav }: { onNav?: () => void }) => (
    <nav style={{ padding: '4px 8px', flex: 1, overflowY: 'auto' }}>
      {NAV.map(item => {
        const active = isActive(item);
        return (
          <Link key={item.href} href={item.href} onClick={onNav} style={{ display:'block', textDecoration:'none' }}>
            <div style={{
              display:'flex', alignItems:'center',
              gap: full ? '10px' : 0,
              justifyContent: full ? 'flex-start' : 'center',
              padding: full ? '9px 11px' : '10px 0',
              borderRadius:'10px', margin:'2px 0',
              color: active ? C.blue : C.t2,
              background: active ? 'rgba(10,132,255,0.13)' : 'transparent',
              fontWeight: active ? 600 : 400, fontSize:'13.5px', cursor:'pointer',
              transition:'background 0.12s, color 0.12s', position:'relative',
            }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.055)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {active && <span style={{ position:'absolute', left:0, top:'20%', bottom:'20%', width:'3px', borderRadius:'0 3px 3px 0', background: C.blue }} />}
              <span style={{ display:'flex', alignItems:'center', flexShrink:0, opacity: active ? 1 : 0.7 }}>
                {ICONS[item.icon]}
              </span>
              {full && <span style={{ lineHeight:1, letterSpacing:'-0.01em' }}>{item.label}</span>}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const SidebarHeader = () => (
    <div style={{
      padding: full ? '16px 16px 14px' : '16px 0 14px',
      display:'flex', alignItems:'center',
      justifyContent: full ? 'flex-start' : 'center',
      gap:'10px', borderBottom:`1px solid ${C.sep}`,
    }}>
      <div style={{
        width:'32px', height:'32px', borderRadius:'9px',
        background:'linear-gradient(135deg, #0a84ff 0%, #bf5af2 100%)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'17px', flexShrink:0, boxShadow:'0 2px 8px rgba(10,132,255,0.35)',
      }}>🤖</div>
      {full && (
        <div>
          <div style={{ fontWeight:700, fontSize:'14px', color:C.t1, letterSpacing:'-0.02em' }}>AI CRM</div>
          <div style={{ fontSize:'10px', color:C.t3, marginTop:'1px' }}>Telegram Autopilot</div>
        </div>
      )}
    </div>
  );

  const CollapseBtn = () => (
    <div style={{ padding:'8px', borderTop:`1px solid ${C.sep}` }}>
      <button onClick={() => setCollapsed(c => !c)} style={{
        width:'100%', padding:'8px', borderRadius:'9px', border:'none',
        background:'transparent', color:C.t3, cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent: full ? 'flex-start' : 'center',
        gap:'8px', fontSize:'12px', transition:'color 0.12s',
      }}
        onMouseEnter={e => (e.currentTarget.style.color = C.t2)}
        onMouseLeave={e => (e.currentTarget.style.color = C.t3)}
      >
        <Ic d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} size={16} />
        {full && <span>Collapse</span>}
      </button>
    </div>
  );

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:C.bg, color:C.t1, fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif' }}>

      {/* Desktop sidebar */}
      {!mobile && (
        <aside style={{
          width:`${sw}px`, flexShrink:0, background:C.sb,
          borderRight:`1px solid ${C.sep}`,
          position:'sticky', top:0, height:'100vh',
          display:'flex', flexDirection:'column',
          transition:'width 0.2s cubic-bezier(0.4,0,0.2,1)', overflow:'hidden',
        }}>
          <SidebarHeader />
          <CreatorSwitcher full={full} />
          <div style={{ height:'1px', background: C.sep, margin:'0 10px' }} />
          <NavList />
          <CollapseBtn />
        </aside>
      )}

      {/* Mobile top bar */}
      {mobile && (
        <div style={{
          position:'fixed', top:0, left:0, right:0, zIndex:200,
          height:'52px', display:'flex', alignItems:'center', gap:'12px', padding:'0 16px',
          background:'rgba(17,17,19,0.92)', backdropFilter:'blur(20px)',
          borderBottom:`1px solid ${C.sep}`,
        }}>
          <button onClick={() => setDrawer(d => !d)} style={{
            background:'none', border:'none', color:C.t1, cursor:'pointer',
            padding:'6px', borderRadius:'8px', display:'flex', alignItems:'center',
          }}>
            <Ic d={drawer ? "M18 6L6 18M6 6l12 12" : "M3 12h18M3 6h18M3 18h18"} size={20} />
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ width:'26px', height:'26px', borderRadius:'7px', background:'linear-gradient(135deg,#0a84ff,#bf5af2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>🤖</div>
            <span style={{ fontWeight:700, fontSize:'15px', letterSpacing:'-0.02em' }}>AI CRM</span>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:300, backdropFilter:'blur(4px)' }} />
          <aside style={{
            position:'fixed', top:0, left:0, bottom:0, zIndex:400, width:`${W_FULL}px`,
            background:C.sb, borderRight:`1px solid ${C.sep}`,
            display:'flex', flexDirection:'column',
            animation:'slideIn 0.18s cubic-bezier(0.4,0,0.2,1)',
          }}>
            <SidebarHeader />
            <CreatorSwitcher full={true} />
            <div style={{ height:'1px', background: C.sep, margin:'0 10px' }} />
            <NavList onNav={() => setDrawer(false)} />
          </aside>
        </>
      )}

      {/* Main content */}
      <main style={{ flex:1, minWidth:0, marginTop: mobile ? '52px' : 0, overflowX:'hidden' }}>
        {children}
      </main>

      <style>{`
        @keyframes slideIn { from { transform:translateX(-100%) } to { transform:translateX(0) } }
        *, *::before, *::after { box-sizing:border-box }
        body { margin:0 }
        a { text-decoration:none; color:inherit }
        ::-webkit-scrollbar { width:3px; height:3px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px }
        input, textarea, select, button { font-family:inherit }
        input::placeholder, textarea::placeholder { color:rgba(235,235,245,0.3) }
      `}</style>
    </div>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <CreatorProvider>
      <DashboardInner>{children}</DashboardInner>
    </CreatorProvider>
  );
}
