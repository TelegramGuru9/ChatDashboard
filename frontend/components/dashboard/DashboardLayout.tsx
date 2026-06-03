'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreatorProvider, useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, MessageSquare, Users, BarChart3,
  Image, Package, UserCog, Settings, ChevronLeft,
  ChevronRight, Menu, X, ChevronsUpDown, Check, Bot, DollarSign,
} from 'lucide-react';

interface DashboardLayoutProps { children: React.ReactNode; }

const NAV = [
  { label: 'Overview',   href: '/dashboard',             icon: LayoutDashboard, exact: true },
  { label: 'Inbox',      href: '/dashboard/inbox',       icon: MessageSquare },
  { label: 'Leads',      href: '/dashboard/leads',       icon: Users },
  { label: 'Analytics',  href: '/dashboard/analytics',   icon: BarChart3 },
  { label: 'Media',      href: '/dashboard/media',       icon: Image },
  { label: 'Packages',   href: '/dashboard/packages',    icon: Package },
  { label: 'Cash Alarm', href: '/dashboard/cash',         icon: DollarSign },
  { label: 'Creators',   href: '/dashboard/creators',    icon: UserCog },
  { label: 'Settings',   href: '/dashboard/settings',    icon: Settings },
];

// ── Creator Switcher ─────────────────────────────────────────────────────────
function CreatorSwitcher({ collapsed }: { collapsed: boolean }) {
  const { creators, selected, switchCreator } = useCreator();
  const [open, setOpen] = useState(false);
  if (creators.length === 0) return null;

  return (
    <div className="px-2 py-1 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50",
          "hover:bg-muted transition-colors text-sm",
          collapsed ? "justify-center p-2" : "px-3 py-2"
        )}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0"
          style={{ background: selected?.color || '#0a84ff' }}
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
          <div className="absolute top-full left-2 right-2 mt-1 bg-popover border border-border rounded-xl shadow-2xl z-50 overflow-hidden min-w-[180px]">
            {creators.map(c => (
              <button
                key={c.id}
                onClick={() => { switchCreator(c.id); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors",
                  c.id === selected?.id && "bg-primary/10"
                )}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: c.color || '#0a84ff' }}>
                  {c.emoji || '🎭'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold truncate">{c.display_name || c.name}</div>
                  {c.telegram_phone && <div className="text-xs text-muted-foreground">{c.telegram_phone}</div>}
                </div>
                {c.id === selected?.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>
            ))}
            <div className="border-t border-border p-1.5">
              <Link href="/dashboard/creators" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                + Creator verwalten
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
    <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
      {NAV.map(item => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={onNav}>
            <div className={cn(
              "flex items-center rounded-lg transition-all duration-100 group relative",
              collapsed && !mobile ? "justify-center px-0 py-2.5 mx-0" : "gap-3 px-3 py-2.5",
              active
                ? "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground font-medium",
            )}>
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
              )}
              <Icon className={cn("flex-shrink-0", active ? "opacity-100" : "opacity-70")} size={18} />
              {(!collapsed || mobile) && (
                <span className="text-sm leading-none">{item.label}</span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );

  const SidebarHeader = () => (
    <div className={cn(
      "flex items-center gap-2.5 border-b border-border",
      collapsed && !mobile ? "justify-center px-0 py-4" : "px-4 py-4"
    )}>
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
        <Bot size={18} className="text-white" />
      </div>
      {(!collapsed || mobile) && (
        <div>
          <div className="font-bold text-sm tracking-tight">AI CRM</div>
          <div className="text-[10px] text-muted-foreground">Telegram Autopilot</div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* Desktop sidebar */}
      {!mobile && (
        <aside className={cn(
          "flex flex-col flex-shrink-0 bg-card border-r border-border",
          "sticky top-0 h-screen transition-all duration-200 overflow-hidden",
          collapsed ? "w-[62px]" : "w-[232px]"
        )}>
          <SidebarHeader />
          <CreatorSwitcher collapsed={collapsed} />
          <Separator className="mx-3 w-auto" />
          <NavList />
          <Separator className="mx-3 w-auto" />
          <div className="p-2">
            <button
              onClick={() => setCollapsed(c => !c)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg p-2.5 text-xs text-muted-foreground",
                "hover:bg-muted/60 hover:text-foreground transition-colors",
                collapsed ? "justify-center" : ""
              )}
            >
              {collapsed
                ? <ChevronRight size={16} />
                : <><ChevronLeft size={16} /><span>Collapse</span></>
              }
            </button>
          </div>
        </aside>
      )}

      {/* Mobile top bar */}
      {mobile && (
        <div className="fixed top-0 left-0 right-0 z-50 h-13 flex items-center gap-3 px-4 bg-card/90 backdrop-blur-xl border-b border-border">
          <button onClick={() => setDrawer(d => !d)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            {drawer ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot size={15} className="text-white" />
            </div>
            <span className="font-bold text-sm">AI CRM</span>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <aside className="fixed top-0 left-0 bottom-0 z-[60] w-[232px] flex flex-col bg-card border-r border-border animate-in slide-in-from-left duration-200">
            <SidebarHeader />
            <CreatorSwitcher collapsed={false} />
            <Separator className="mx-3 w-auto" />
            <NavList onNav={() => setDrawer(false)} />
          </aside>
        </>
      )}

      {/* Main content */}
      <main className={cn("flex-1 min-w-0 overflow-x-hidden", mobile && "mt-13")}>
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
