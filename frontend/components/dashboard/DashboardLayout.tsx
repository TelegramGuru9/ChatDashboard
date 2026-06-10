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
  DollarSign, Flame, ChevronDown, ChevronUp,
} from 'lucide-react';

interface DashboardLayoutProps { children: React.ReactNode; }

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { label: 'Overview',   href: '/dashboard',           icon: LayoutDashboard, exact: true },
      { label: 'Inbox',      href: '/dashboard/inbox',     icon: MessageSquare },
      { label: 'HOT',        href: '/dashboard/hot',       icon: Flame, accent: 'text-orange-400' },
      { label: 'Leads',      href: '/dashboard/leads',     icon: Users },
      { label: 'Analytics',  href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Media',      href: '/dashboard/media',    icon: Image },
      { label: 'Pakete',     href: '/dashboard/packages', icon: Package },
      { label: 'Cash Alarm', href: '/dashboard/cash',     icon: DollarSign },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Creators',   href: '/dashboard/creators',  icon: UserCog },
      {
        label: 'Settings', href: '/dashboard/settings', icon: Settings,
        children: [
          { label: 'System Prompt',    href: '/dashboard/settings/systemprompt' },
          { label: 'Persona',          href: '/dashboard/settings/persona' },
          { label: 'Reply Settings',   href: '/dashboard/settings/replysettings' },
          { label: 'Languages',        href: '/dashboard/settings/languages' },
          { label: 'Message Preview',  href: '/dashboard/settings/messagepreview' },
        ],
      },
    ],
  },
];

// ── WishperME Logo ───────────────────────────────────────────────────────────
function WishperMELogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-5 h-[60px] border-b border-gray-200 flex-shrink-0',
      collapsed && 'justify-center px-3'
    )}>
      <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0 shadow-theme-sm">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path d="M9 1.5C5.134 1.5 2 4.41 2 8C2 9.8 2.78 11.42 4.04 12.57L3 16.5L7.18 14.87C7.76 15.01 8.37 15.08 9 15.08C12.866 15.08 16 12.17 16 8.58C16 4.99 12.866 1.5 9 1.5Z" fill="white"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-bold text-sm text-gray-900 tracking-tight leading-tight">WishperME</div>
          <div className="text-[10px] text-gray-400 leading-tight">Telegram Autopilot</div>
        </div>
      )}
    </div>
  );
}

// ── Creator Switcher ─────────────────────────────────────────────────────────
function CreatorSwitcher({ collapsed }: { collapsed: boolean }) {
  const { creators, selected, switchCreator } = useCreator();
  const [open, setOpen] = useState(false);
  if (creators.length === 0) return null;

  const label = selected
    ? selected.telegram_phone
      ? `${selected.display_name || selected.name} — ${selected.telegram_phone}`
      : (selected.display_name || selected.name) || 'Incomplete Creator'
    : 'Select Creator';

  const isIncomplete = selected && !selected.display_name && !selected.name;

  return (
    <div className="px-3 py-2 relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50',
          'hover:bg-gray-100 transition-colors text-sm px-3 py-2',
          collapsed && 'justify-center px-2'
        )}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs flex-shrink-0 font-bold text-white"
          style={{ background: selected?.color || '#465fff' }}>
          {selected?.emoji || '🎭'}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className={cn('text-xs font-medium truncate leading-tight text-gray-700', isIncomplete && 'text-orange-500')}>
                {selected?.display_name || selected?.name || 'Incomplete Creator'}
              </div>
              {selected?.telegram_phone && (
                <div className="text-[10px] text-gray-400 truncate leading-tight">{selected.telegram_phone}</div>
              )}
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          </>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div className="absolute top-full left-3 right-3 mt-1 bg-white border border-gray-200 rounded-xl shadow-theme-md z-50 overflow-hidden">
            {creators.map(c => (
              <button key={c.id} onClick={() => { switchCreator(c.id); setOpen(false); }}
                className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors', c.id === selected?.id && 'bg-brand-50')}>
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-sm flex-shrink-0 font-bold text-white"
                  style={{ background: c.color || '#465fff' }}>
                  {c.emoji || '🎭'}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-medium truncate text-sm text-gray-800">{c.display_name || c.name || 'Unnamed'}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {c.telegram_phone || <span className="text-orange-500">No phone connected</span>}
                  </div>
                </div>
                {c.id === selected?.id && <Check className="h-4 w-4 text-brand-500 flex-shrink-0" />}
              </button>
            ))}
            <Separator />
            <div className="p-1">
              <Link href="/dashboard/creators" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors">
                + Manage Creators
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Nav Item (with optional children) ────────────────────────────────────────
function NavItem({
  item, collapsed, onNav, depth = 0,
}: {
  item: any; collapsed: boolean; onNav?: () => void; depth?: number;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const childActive = item.children?.some((c: any) => pathname.startsWith(c.href));

  useEffect(() => {
    if (childActive) setExpanded(true);
  }, [childActive]);

  const Icon = item.icon;

  if (item.children && !collapsed) {
    return (
      <div>
        <button
          onClick={() => setExpanded(e => !e)}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
            (isActive || childActive)
              ? 'bg-brand-50 text-brand-600'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          {Icon && (
            <Icon className={cn(
              'flex-shrink-0 h-4 w-4',
              (isActive || childActive) ? 'text-brand-500' : 'text-gray-500'
            )} />
          )}
          <span className="flex-1 text-left leading-none">{item.label}</span>
          {expanded
            ? <ChevronUp className="h-3 w-3 text-gray-400" />
            : <ChevronDown className="h-3 w-3 text-gray-400" />}
        </button>
        {expanded && (
          <div className="ml-3 mt-0.5 pl-3 border-l border-gray-200 space-y-0.5">
            {item.children.map((child: any) => (
              <Link key={child.href} href={child.href} onClick={onNav}>
                <div className={cn(
                  'flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                  pathname === child.href || pathname.startsWith(child.href + '/')
                    ? 'text-brand-600 font-semibold bg-brand-50/60'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                )}>
                  {child.label}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={item.href} onClick={onNav}>
      <div className={cn(
        'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all',
        collapsed ? 'justify-center' : 'gap-3',
        isActive
          ? 'bg-brand-50 text-brand-600'
          : childActive
          ? 'bg-brand-50/60 text-brand-500'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
      )}>
        {Icon && (
          <Icon className={cn(
            'flex-shrink-0 h-4 w-4',
            isActive ? 'text-brand-500' : childActive ? 'text-brand-400' : item.accent ?? 'text-gray-500'
          )} />
        )}
        {!collapsed && <span className="leading-none">{item.label}</span>}
      </div>
    </Link>
  );
}

// ── Inner layout ──────────────────────────────────────────────────────────────
function DashboardInner({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const check = () => { const m = window.innerWidth < 768; setMobile(m); if (m) setCollapsed(false); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const NavContent = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-1 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-widest select-none">
              {group.label}
            </div>
          )}
          <div className="space-y-0.5">
            {group.items.map(item => (
              <NavItem key={item.href} item={item} collapsed={collapsed} onNav={onNav} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex flex-col h-full">
      <WishperMELogo collapsed={collapsed && !isMobile} />
      <div className="py-2">
        <CreatorSwitcher collapsed={collapsed && !isMobile} />
      </div>
      <div className="mx-4 h-px bg-gray-100" />
      <NavContent onNav={isMobile ? () => setDrawer(false) : undefined} />
      {!isMobile && (
        <div className="p-3 border-t border-gray-200">
          <button onClick={() => setCollapsed(c => !c)}
            className={cn('w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors', collapsed ? 'justify-center' : '')}>
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      {!mobile && (
        <aside className={cn(
          'flex flex-col flex-shrink-0 bg-white border-r border-gray-200 sticky top-0 h-screen transition-all duration-200 overflow-hidden shadow-theme-sm',
          collapsed ? 'w-[56px]' : 'w-[240px]'
        )}>
          <SidebarContent />
        </aside>
      )}
      {mobile && (
        <div className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center gap-3 px-4 bg-white border-b border-gray-200 shadow-theme-sm">
          <button onClick={() => setDrawer(d => !d)} className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-600">
            {drawer ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
                <path d="M9 1.5C5.134 1.5 2 4.41 2 8C2 9.8 2.78 11.42 4.04 12.57L3 16.5L7.18 14.87C7.76 15.01 8.37 15.08 9 15.08C12.866 15.08 16 12.17 16 8.58C16 4.99 12.866 1.5 9 1.5Z" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-sm text-gray-900">WishperME</span>
          </div>
        </div>
      )}
      {mobile && drawer && (
        <>
          <div onClick={() => setDrawer(false)} className="fixed inset-0 bg-black/40 z-50" />
          <aside className="fixed top-0 left-0 bottom-0 z-[60] w-[240px] flex flex-col bg-white border-r border-gray-200 shadow-theme-md slide-in-from-left">
            <SidebarContent isMobile />
          </aside>
        </>
      )}
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
