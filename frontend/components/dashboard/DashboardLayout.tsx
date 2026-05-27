'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV = [
  { label: 'Overview',    href: '/dashboard',              icon: '🏠', exact: true },
  { label: 'Inbox',       href: '/dashboard/inbox',        icon: '💬' },
  { label: 'Leads',       href: '/dashboard/leads',        icon: '🎯' },
  { label: 'Analytics',   href: '/dashboard/analytics',    icon: '📊' },
  { label: 'Media',       href: '/dashboard/media',        icon: '🖼️' },
  { label: 'Packages',    href: '/dashboard/packages',     icon: '📦' },
  { label: 'Auto-Reply',  href: '/dashboard/autoreplies',  icon: '⚡' },
  { label: 'Settings',    href: '/dashboard/settings',     icon: '⚙️' },
];

/* ── iOS colour palette ── */
const ios = {
  bg:        '#000000',
  surface:   '#1c1c1e',
  surface2:  '#2c2c2e',
  border:    'rgba(255,255,255,0.08)',
  accent:    '#0a84ff',
  green:     '#30d158',
  red:       '#ff453a',
  amber:     '#ffd60a',
  purple:    '#bf5af2',
  text:      '#ffffff',
  text2:     'rgba(255,255,255,0.55)',
  text3:     'rgba(255,255,255,0.3)',
};

const SIDEBAR_W  = 220;
const SIDEBAR_COL = 64;

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => {
      const isMob = window.innerWidth < 768;
      setMobile(isMob);
      if (isMob) setCollapsed(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isActive = (item: typeof NAV[0]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const sidebarWidth = mobile ? SIDEBAR_W : collapsed ? SIDEBAR_COL : SIDEBAR_W;
  const showLabel = mobile ? true : !collapsed;

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: collapsed && !mobile ? '20px 0' : '20px 16px',
        justifyContent: collapsed && !mobile ? 'center' : 'flex-start',
        borderBottom: `1px solid ${ios.border}`,
        marginBottom: '8px',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '10px', flexShrink: 0,
          background: 'linear-gradient(135deg,#0a84ff,#bf5af2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>🤖</div>
        {showLabel && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: ios.text, lineHeight: 1.2 }}>AI CRM</div>
            <div style={{ fontSize: '10px', color: ios.text3, letterSpacing: '0.05em' }}>Telegram</div>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => mobile && setMobileOpen(false)}
              title={collapsed && !mobile ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                gap: showLabel ? '10px' : 0,
                justifyContent: showLabel ? 'flex-start' : 'center',
                padding: '10px',
                borderRadius: '12px',
                marginBottom: '2px',
                textDecoration: 'none',
                background: active ? `rgba(10,132,255,0.18)` : 'transparent',
                color: active ? ios.accent : ios.text2,
                fontWeight: active ? 600 : 400,
                fontSize: '14px',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
              {showLabel && <span style={{ lineHeight: 1 }}>{item.label}</span>}
              {showLabel && active && (
                <span style={{
                  marginLeft: 'auto', width: '6px', height: '6px',
                  borderRadius: '50%', background: ios.accent,
                }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      {!mobile && (
        <div style={{ padding: '12px 8px', borderTop: `1px solid ${ios.border}` }}>
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{
              width: '100%', padding: '8px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.05)', border: 'none',
              color: ios.text2, cursor: 'pointer', fontSize: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px',
            }}
          >
            {collapsed ? '→' : '←'}
            {!collapsed && <span style={{ fontSize: '12px' }}>Collapse</span>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: ios.bg, color: ios.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    }}>

      {/* ── Desktop sidebar ── */}
      {!mobile && (
        <aside style={{
          width: `${sidebarWidth}px`, flexShrink: 0,
          background: ios.surface,
          borderRight: `1px solid ${ios.border}`,
          position: 'sticky', top: 0, height: '100vh',
          overflowY: 'auto', overflowX: 'hidden',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <SidebarContent />
        </aside>
      )}

      {/* ── Mobile header ── */}
      {mobile && (
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(28,28,30,0.92)', backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${ios.border}`,
          height: '52px', display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: '12px',
        }}>
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: ios.text, fontSize: '20px', cursor: 'pointer', padding: '4px' }}
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
          <div style={{ fontWeight: 700, fontSize: '16px' }}>AI CRM</div>
        </header>
      )}

      {/* ── Mobile drawer overlay ── */}
      {mobile && mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
              zIndex: 200, backdropFilter: 'blur(4px)',
            }}
          />
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 300,
            width: `${SIDEBAR_W}px`,
            background: ios.surface,
            borderRight: `1px solid ${ios.border}`,
            overflowY: 'auto',
            animation: 'slideIn 0.2s ease',
          }}>
            <SidebarContent />
          </aside>
        </>
      )}

      {/* ── Main content ── */}
      <main style={{
        flex: 1, minWidth: 0,
        marginTop: mobile ? '52px' : 0,
        overflowX: 'hidden',
      }}>
        {children}
      </main>

      <style>{`
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        a { text-decoration: none; color: inherit; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        input:focus, textarea:focus, select:focus { outline: 2px solid #0a84ff; outline-offset: -1px; }
      `}</style>
    </div>
  );
}
