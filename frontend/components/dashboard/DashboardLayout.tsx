'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV = [
  { label: 'Overview',   href: '/dashboard',              icon: '⊞',  exact: true },
  { label: 'Inbox',      href: '/dashboard/inbox',        icon: '✉' },
  { label: 'Leads',      href: '/dashboard/leads',        icon: '◎' },
  { label: 'Analytics',  href: '/dashboard/analytics',    icon: '▦' },
  { label: 'Media',      href: '/dashboard/media',        icon: '⬡' },
  { label: 'Packages',   href: '/dashboard/packages',     icon: '▣' },
  { label: 'Auto-Reply', href: '/dashboard/autoreplies',  icon: '⚡' },
  { label: 'Settings',   href: '/dashboard/settings',     icon: '⊕' },
];

// Calm iOS dark palette
const p = {
  bg:       '#000000',
  s1:       '#1c1c1e',   // card / sidebar
  s2:       '#2c2c2e',   // input / inner card
  s3:       '#3a3a3c',   // hover
  sep:      'rgba(84,84,88,0.5)',
  label:    '#ffffff',
  label2:   'rgba(235,235,245,0.6)',
  label3:   'rgba(235,235,245,0.3)',
  blue:     '#0a84ff',
  green:    '#30d158',
  red:      '#ff453a',
  orange:   '#ff9f0a',
  yellow:   '#ffd60a',
  purple:   '#bf5af2',
  teal:     '#5ac8fa',
};

const SIDEBAR = 220;
const SIDEBAR_COL = 60;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile]       = useState(false);
  const [drawer, setDrawer]       = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => {
      const m = window.innerWidth < 768;
      setMobile(m);
      if (m) setCollapsed(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const active = (item: typeof NAV[0]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const showLabel = mobile ? true : !collapsed;
  const sidebarW  = mobile ? SIDEBAR : (collapsed ? SIDEBAR_COL : SIDEBAR);

  const NavItems = ({ onClick }: { onClick?: () => void }) => (
    <>
      {NAV.map(item => {
        const on = active(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: showLabel ? '10px' : 0,
              justifyContent: showLabel ? 'flex-start' : 'center',
              padding: showLabel ? '9px 12px' : '9px 0',
              borderRadius: '10px',
              margin: '1px 0',
              color: on ? p.blue : p.label2,
              background: on ? 'rgba(10,132,255,0.12)' : 'transparent',
              fontWeight: on ? 600 : 400,
              fontSize: '14px',
              transition: 'background 0.12s',
              textDecoration: 'none',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = `rgba(255,255,255,0.05)`; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0, opacity: on ? 1 : 0.7 }}>{item.icon}</span>
            {showLabel && <span style={{ lineHeight: 1 }}>{item.label}</span>}
          </Link>
        );
      })}
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: p.bg, color: p.label, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif' }}>

      {/* ── Desktop sidebar ── */}
      {!mobile && (
        <aside style={{
          width: `${sidebarW}px`, flexShrink: 0,
          background: p.s1,
          borderRight: `1px solid ${p.sep}`,
          position: 'sticky', top: 0, height: '100vh',
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Logo */}
          <div style={{
            padding: collapsed ? '18px 0' : '18px 16px',
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '10px',
            borderBottom: `1px solid ${p.sep}`,
            marginBottom: '8px',
          }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: p.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🤖</div>
            {!collapsed && <span style={{ fontWeight: 700, fontSize: '15px' }}>AI CRM</span>}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
            <NavItems />
          </nav>

          {/* Collapse toggle */}
          <div style={{ padding: '10px 8px', borderTop: `1px solid ${p.sep}` }}>
            <button onClick={() => setCollapsed(c => !c)} style={{
              width: '100%', padding: '8px', borderRadius: '10px', border: 'none',
              background: 'transparent', color: p.label3, cursor: 'pointer', fontSize: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <span style={{ fontSize: '16px' }}>{collapsed ? '→' : '←'}</span>
              {!collapsed && <span style={{ fontSize: '12px' }}>Collapse</span>}
            </button>
          </div>
        </aside>
      )}

      {/* ── Mobile top bar ── */}
      {mobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          height: '50px', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '0 16px',
          background: 'rgba(28,28,30,0.95)', backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${p.sep}`,
        }}>
          <button onClick={() => setDrawer(d => !d)} style={{ background: 'none', border: 'none', color: p.label, fontSize: '18px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
            {drawer ? '✕' : '☰'}
          </button>
          <span style={{ fontWeight: 700, fontSize: '16px' }}>AI CRM</span>
        </div>
      )}

      {/* ── Mobile drawer ── */}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300, width: `${SIDEBAR}px`,
            background: p.s1, borderRight: `1px solid ${p.sep}`,
            display: 'flex', flexDirection: 'column',
            animation: 'slideIn 0.18s ease',
          }}>
            <div style={{ padding: '16px', borderBottom: `1px solid ${p.sep}`, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: p.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🤖</div>
              <span style={{ fontWeight: 700, fontSize: '15px' }}>AI CRM</span>
            </div>
            <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
              <NavItems onClick={() => setDrawer(false)} />
            </nav>
          </aside>
        </>
      )}

      {/* ── Main content ── */}
      <main style={{ flex: 1, minWidth: 0, marginTop: mobile ? '50px' : 0, overflowX: 'hidden' }}>
        {children}
      </main>

      <style>{`
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; }
        a { text-decoration: none; color: inherit; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        input, textarea, select { font-family: inherit; }
      `}</style>
    </div>
  );
}
