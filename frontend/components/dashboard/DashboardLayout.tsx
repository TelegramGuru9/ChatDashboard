'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreatorProvider, useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, MessageSquare, Users, BarChart3,
  Image, Package, UserCog, Settings, ChevronLeft,
  ChevronRight, Menu, X, ChevronsUpDown, Check,
  DollarSign,
} from 'lucide-react';

interface DashboardLayoutProps { children: React.ReactNode; }

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { label: 'Overview',   href: '/dashboard',           icon: LayoutDashboard, exact: true },
      { label: 'Inbox',      href: '/dashboard/inbox',     icon: MessageSquare },
      { label: 'Leads',      href: '/dashboard/leads',     icon: Users },
      { label: 'Analytics',  href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Media',      href: '/dashboard/media',     icon: Image },
      { label: 'Packages',   href: '/dashboard/packages',  icon: Package },
      { label: 'Cash Alarm', href: '/dashboard/cash',      icon: DollarSign },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Creators',   href: '/dashboard/creators',  icon: UserCog },
      { label: 'Settings',   href: '/dashboard/settings',  icon: Settings },
    ],
  },
];

// ── WishperME Logo ────────────────────────────────────────────────────────────
function WishperMELogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0',
      collapsed && 'justify-center px-3'
    )}>
      <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 1.5C5.134 1.5 2 4.41 2 8C2 9.8 2.78 11.42 4.04 12.57L3 16.5L7.18 14.87C7.76 15.01 8.37 15.08 9 15.08C12.866 15.08 16 12.17 16 8.58C16 4.99 12.866 1.5 9 1.5Z" fill="white"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-bold text-sm tracking-tight leading-tight">WishperME</div>
          <div className="text-[10px] text-muted-foreground leading-tight">Telegram API Dashboard</div>
        </div>
      )}
    </div>
  );
}

// ── Creator Switcher ──────────────────────────────────────────────────────────
function CreatorSwitcher({ collapsed }: { collapsed: boolean }) {
  const { creators, selected, switchCreator } = useCreator();
  const [open, setOpen] = useState(false);
  if (creators.length === 0) return null;

  return (
    <div className="px-3 py-2 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-lg border border-border bg-background/50',
          'hover:bg-accent transition-colors text-sm px-3 py-2',
          collapsed && 'justify-center px-2'
        )}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0 font-bold text-white"
          style={{ background: selected?.color || '#3b82f6' }}
        >
          {selected?.emoji || '🎭'}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 text-left font-medium truncate text-sm">
              {selected?.display_name || selected?.name || 'Creator'}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div className="absolute top-full left-3 right-3 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            {creators.map(c => (
              <button
                key={c.id}
                onClick={() => { switchCreator(c.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                  c.id === selected?.id && 'bg-accent'
                )}
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm flex-shrink-0 font-bold text-white"
                  style={{ background: c.color || '#3b82f6' }}>
                  {c.emoji || '🎭'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-medium truncate">{c.display_name || c.name}</div>
                  {c.telegram_phone && <div className="text-xs text-muted-foreground">{c.telegram_phone}</div>}
                </div>
                {c.id === selected?.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>
            ))}
            <Separator />
            <div className="p-1">
              <Link href="/dashboard/creators" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-primary hover:bg-accent transition-colors">
                + Manage Creators
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Inner layout ──────────────────────────────────────────────────────────────
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

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const NavContent = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-2 mb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest select-none">
              {group.label}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map(item => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} onClick={onNav}>
                  <div className={cn(
                    'flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150',
                    collapsed ? 'justify-center' : 'gap-3',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}>
                    <Icon className="flex-shrink-0 h-4 w-4" />
                    {!collapsed && <span className="leading-none">{item.label}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      <WishperMELogo collapsed={collapsed && !isMobile} />
      <div className="py-1.5">
        <CreatorSwitcher collapsed={collapsed && !isMobile} />
      </div>
      <Separator />
      <NavContent onNav={isMobile ? () => setDrawer(false) : undefined} />
      <Separator />
      {!isMobile && (
        <div className="p-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground',
              'hover:bg-accent hover:text-foreground transition-colors',
              collapsed ? 'justify-center' : ''
            )}
          >
            {collapsed
              ? <ChevronRight size={14} />
              : <><ChevronLeft size={14} /><span className="font-medium">Collapse</span></>
            }
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* Desktop sidebar */}
      {!mobile && (
        <aside className={cn(
          'flex flex-col flex-shrink-0 bg-card border-r border-border',
          'sticky top-0 h-screen transition-all duration-200 overflow-hidden',
          collapsed ? 'w-[56px]' : 'w-[224px]'
        )}>
          <SidebarContent />
        </aside>
      )}

      {/* Mobile top bar */}
      {mobile && (
        <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-3 px-4 bg-card border-b border-border">
          <button onClick={() => setDrawer(d => !d)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors">
            {drawer ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
                <path d="M9 1.5C5.134 1.5 2 4.41 2 8C2 9.8 2.78 11.42 4.04 12.57L3 16.5L7.18 14.87C7.76 15.01 8.37 15.08 9 15.08C12.866 15.08 16 12.17 16 8.58C16 4.99 12.866 1.5 9 1.5Z" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-sm">WishperME</span>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)}
            className="fixed inset-0 bg-black/50 z-50" />
          <aside className="fixed top-0 left-0 bottom-0 z-[60] w-[224px] flex flex-col bg-card border-r border-border slide-in-from-left">
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* Main content */}
      <main className={cn('flex-1 min-w-0 overflow-x-hidden', mobile && 'mt-14')}>
        {children}
      </main>
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
