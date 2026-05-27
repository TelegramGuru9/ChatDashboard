'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutGrid,
  MessageSquare,
  Users,
  TrendingUp,
  Settings,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  initialStats?: {
    unreadMessages: number;
    activeConversations: number;
    newLeads: number;
    leadScore: number;
  };
}

export default function DashboardLayout({ children, initialStats }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const menuItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutGrid },
    { label: 'Inbox', href: '/dashboard/inbox', icon: MessageSquare, badge: initialStats?.unreadMessages },
    { label: 'Leads', href: '/dashboard/leads', icon: Users, badge: initialStats?.newLeads },
    { label: 'Analytics', href: '/dashboard/analytics', icon: TrendingUp },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900 backdrop-blur-sm">
        <div className="flex items-center justify-between h-16 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500" />
            <span className="hidden sm:inline">AI CRM</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive(item.href)
                    ? 'bg-slate-800 text-blue-400'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 hover:bg-slate-800 rounded-lg"
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              onClick={handleLogout}
              className="text-red-400 hover:text-red-300 hover:bg-red-950/20 p-2 rounded-lg"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <nav className="md:hidden px-4 py-3 border-t border-slate-800 flex flex-col gap-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-slate-800 text-blue-400'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                  {item.badge ? (
                    <span className="ml-auto h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main className="min-h-[calc(100vh-4rem)]">
        {children}
      </main>
    </div>
  );
}
