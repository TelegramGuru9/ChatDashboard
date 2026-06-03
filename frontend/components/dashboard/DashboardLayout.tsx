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
  DollarSign, Zap,
} from 'lucide-react';

interface DashboardLayoutProps { children: React.ReactNode; }

const NAV = [
  { label: 'Overview',    href: '/dashboard',            icon: LayoutDashboard, exact: true },
  { label: 'Inbox',       href: '/dashboard/inbox',      icon: MessageSquare },
  { label: 'Leads',       href: '/dashboard/leads',      icon: Users },
  { label: 'Analytics',   href: '/dashboard/analytics',  icon: BarChart3 },
  { label: 'Media',       href: '/dashboard/media',      icon: Image },
  { label: 'Packages',    href: '/dashboard/packages',   icon: Package },
  { label: 'Cash Alarm',  href: '/dashboard/cash',       icon: DollarSign },
  { label: 'Creators',    href: '/dashboard/creators',   icon: UserCog },
  { label: 'Settings',    href: '/dashboard/settings',   icon: Settings },
];

// ── Creator Switcher ─────────────────────────────────────────────────────────
function CreatorSwitcher({ collapsed }: { collapsed: boolean }) {
  const { creators, selected, switchCreator } = useCreator();
  const [open, setOpen] = useState(false);
  if (creators.length === 0) return null;

  return (
    <div className="px-3 py-2 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 rounded-md border border-border bg-background",
          "hover:bg-accent transition-colors text-sm px-3 py-2",
          collapsed && "justify-center px-2"
        )}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0 font-bold text-white"
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
          <div className="absolute top-full left-3 right-3 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
            {creators.map(c => (
              <button
                key={c.id}
                onClick={() => { switchCreator(c.id); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors",
                  c.id === selected?.id && "bg-accent"
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

// ── Inner layout ─────────────────────────────────────────────────────────────
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

  const NavList = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
      {NAV.map(item => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={onNav}>
            <div className={cn(
              "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
              collapsed && !mobile ? "justify-center px-2" : "gap-3",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}>
              <Icon className="flex-shrink-0 h-4 w-4" />
              {(!collapsed || mobile) && (
                <span className="leading-none">{item.label}</span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 h-14 border-b border-border flex-shrink-0",
        collapsed && !isMobile && "justify-center px-2"
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-primary-foreground" />
        </div>
        {(!collapsed || isMobile) && (
          <div className="min-w-0">
            <div className="font-bold text-sm tracking-tight leading-tight truncate">WishperME</div>
            <div className="text-[10px] text-muted-foreground leading-tight truncate">Telegram API Dashboard</div>
          </div>
        )}
      </div>

      {/* Creator switcher */}
      <CreatorSwitcher collapsed={collapsed && !isMobile} />
      <Separator className="mx-3" style={{ width: 'auto' }} />

      {/* Nav */}
      <NavList onNav={isMobile ? () => setDrawer(false) : undefined} />

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <>
          <Separator className="mx-3" style={{ width: 'auto' }} />
          <div className="p-2">
            <button
              onClick={() => setCollapsed(c => !c)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                collapsed ? "justify-center" : ""
              )}
            >
              {collapsed
                ? <ChevronRight size={14} />
                : <><ChevronLeft size={14} /><span>Collapse</span></>
              }
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* Desktop sidebar */}
      {!mobile && (
        <aside className={cn(
          "flex flex-col flex-shrink-0 bg-card border-r border-border",
          "sticky top-0 h-screen transition-all duration-200 overflow-hidden",
          collapsed ? "w-[56px]" : "w-[220px]"
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
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Zap size={14} className="text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-sm">WishperME</span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)}
            className="fixed inset-0 bg-black/50 z-50" />
          <aside className="fixed top-0 left-0 bottom-0 z-[60] w-[220px] flex flex-col bg-card border-r border-border slide-in-from-left">
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* Main content */}
      <main className={cn("flex-1 min-w-0 overflow-x-hidden", mobile && "mt-14")}>
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
