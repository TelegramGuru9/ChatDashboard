'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: 'Overview', href: '/dashboard', icon: '🏠' },
  { label: 'Inbox', href: '/dashboard/inbox', icon: '💬' },
  { label: 'Leads', href: '/dashboard/leads', icon: '🎯' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: '📊' },
  { label: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
];

const S = {
  root: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '16px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: 700,
    fontSize: '16px',
    color: '#e2e8f0',
    textDecoration: 'none',
    marginRight: '8px',
  },
  logoIcon: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: 1,
  },
  navLink: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.15s',
    color: active ? '#60a5fa' : '#94a3b8',
    background: active ? '#1e293b' : 'transparent',
  }),
  main: {
    flex: 1,
    minHeight: 'calc(100vh - 56px)',
  },
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <Link href="/dashboard" style={S.logo}>
          <div style={S.logoIcon}>🤖</div>
          <span>AI CRM</span>
        </Link>

        {/* Desktop nav */}
        <nav style={S.nav} className="desktop-nav">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} style={S.navLink(isActive(item.href))}>
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '4px 8px',
            display: 'none',
          }}
          className="mobile-menu-btn"
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile dropdown nav */}
      {menuOpen && (
        <div style={{
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '8px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                ...S.navLink(isActive(item.href)),
                padding: '10px 12px',
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      )}

      <main style={S.main}>{children}</main>

      <style>{`
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
        * { box-sizing: border-box; }
        a { color: inherit; }
      `}</style>
    </div>
  );
}
