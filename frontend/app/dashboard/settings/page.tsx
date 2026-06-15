'use client';

import Link from 'next/link';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useTheme, type Appearance } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  Shield, Bot, MessageSquare, Globe, Eye,
  ChevronRight, Settings, Sun, Moon, Monitor,
} from 'lucide-react';

const CARDS = [
  {
    href: '/dashboard/settings/systemprompt',
    icon: Shield,
    color: 'bg-blue-500/10 text-blue-400',
    label: 'System Prompt',
    desc: 'Global autopilot rules, safety constraints, and behavioral toggles. Applied before everything else.',
  },
  {
    href: '/dashboard/settings/persona',
    icon: Bot,
    color: 'bg-purple-500/10 text-purple-400',
    label: 'Persona',
    desc: 'Upload and manage the creator JSON. The LLM always replies in this persona when autopilot is on.',
  },
  {
    href: '/dashboard/settings/replysettings',
    icon: MessageSquare,
    color: 'bg-green-500/10 text-green-400',
    label: 'Reply Settings',
    desc: 'Tone, message length, response delay, keyword triggers, upsell workflow, and blocking rules.',
  },
  {
    href: '/dashboard/settings/languages',
    icon: Globe,
    color: 'bg-amber-500/10 text-amber-400',
    label: 'Languages',
    desc: 'Configure which languages the autopilot can reply in — native, translated, or disabled.',
  },
  {
    href: '/dashboard/settings/messagepreview',
    icon: Eye,
    color: 'bg-pink-500/10 text-pink-400',
    label: 'Message Preview',
    desc: 'Telegram-style preview of all configured auto-messages: packages, buy links, workflows, upsells.',
  },
];

const APPEARANCE_OPTIONS: { value: Appearance; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsHubPage() {
  const { appearance, setAppearance } = useTheme();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure your AI autopilot, persona, and workflows</p>
          </div>
        </div>

        {/* Appearance */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              <Sun className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">Appearance</div>
              <div className="text-xs text-muted-foreground">Choose how the dashboard looks</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {APPEARANCE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = appearance === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAppearance(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 py-3 px-2 rounded-xl border text-sm font-medium transition-all',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nav cards */}
        <div className="grid gap-3">
          {CARDS.map(card => {
            const Icon = card.icon;
            return (
              <Link key={card.href} href={card.href}
                className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-all">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', card.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{card.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>

      </div>
    </DashboardLayout>
  );
}
