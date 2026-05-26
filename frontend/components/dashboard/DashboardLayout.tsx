'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    // Clear auth token and redirect to login
    localStorage.removeItem('authToken');
    router.push('/login');
  };

  return (
    <div className=\"min-h-screen bg-slate-950 text-slate-100\">
      {/* Header */}
      <header className=\"sticky top-0 z-50 border-b border-slate-800 bg-slate-900 backdrop-blur-sm\">
        <div className=\"flex items-center justify-between h-16 px-4 sm:px-6\">
          {/* Logo */}
          <Link href=\"/dashboard\" className=\"flex items-center gap-2 font-bold text-lg\">
            <div className=\"w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500\" />
            <span className=\"hidden sm:inline\">AI CRM</span>
          </Link>

          {/* Center - Navigation (Desktop) */}
          <nav className=\"hidden md:flex items-center gap-1\">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors relative ${\n                  isActive(item.href)\n                    ? 'bg-slate-800 text-blue-400'\n                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'\n                }`}
              >
                {item.label}
                {item.badge && (\n                  <Badge variant=\"destructive\" className=\"absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center\">\n                    {item.badge}\n                  </Badge>\n                )}\n              </Link>\n            ))}\n          </nav>\n\n          {/* Right - User Menu */}\n          <div className=\"flex items-center gap-4\">\n            {/* Mobile Menu Button */}\n            <button\n              onClick={() => setSidebarOpen(!sidebarOpen)}\n              className=\"md:hidden p-2 hover:bg-slate-800 rounded-lg\"\n              aria-label=\"Toggle menu\"\n            >\n              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}\n            </button>\n\n            {/* User Profile Dropdown (Simplified) */}\n            <Button\n              variant=\"ghost\"\n              size=\"sm\"\n              onClick={handleLogout}\n              className=\"text-red-400 hover:text-red-300 hover:bg-red-950/20\"\n            >\n              <LogOut size={18} />\n            </Button>\n          </div>\n        </div>\n\n        {/* Mobile Menu */}\n        {sidebarOpen && (\n          <nav className=\"md:hidden px-4 py-3 border-t border-slate-800 flex flex-col gap-2\">\n            {menuItems.map((item) => {\n              const Icon = item.icon;\n              return (\n                <Link\n                  key={item.href}\n                  href={item.href}\n                  onClick={() => setSidebarOpen(false)}\n                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${\n                    isActive(item.href)\n                      ? 'bg-slate-800 text-blue-400'\n                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'\n                  }`}\n                >\n                  <Icon size={18} />\n                  {item.label}\n                  {item.badge && <Badge variant=\"destructive\">{item.badge}</Badge>}\n                </Link>\n              );\n            })}\n          </nav>\n        )}\n      </header>\n\n      {/* Main Content */}\n      <main className=\"min-h-[calc(100vh-4rem)]\">\n        {children}\n      </main>\n    </div>\n  );\n}

// ==================== INBOX COMPONENT ====================

\"\"\"
components/dashboard/Inbox.tsx\nLive message inbox with real-time updates.\n\"\"\"