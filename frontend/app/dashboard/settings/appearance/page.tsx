'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { cn } from '@/lib/utils';
import { Sun, Moon, Monitor } from 'lucide-react';

type Appearance = 'light' | 'dark' | 'system';

const MODES: { value: Appearance; label: string; desc: string; Icon: typeof Sun }[] = [
  { value: 'light',  label: 'Light',  desc: 'Always use the light theme',               Icon: Sun },
  { value: 'dark',   label: 'Dark',   desc: 'Always use the dark theme',                Icon: Moon },
  { value: 'system', label: 'System', desc: 'Follow your OS light/dark preference',     Icon: Monitor },
];

function applyTheme(a: Appearance) {
  const dark =
    a === 'dark' ||
    (a === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export default function AppearancePage() {
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('appearance') as Appearance) || 'system';
    setAppearanceState(saved);
  }, []);

  const pick = (a: Appearance) => {
    setAppearanceState(a);
    localStorage.setItem('appearance', a);
    applyTheme(a);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Sun className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Appearance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Choose how the dashboard looks</p>
          </div>
        </div>

        {/* Theme picker */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="text-sm font-semibold text-foreground mb-1">Theme</div>
          {MODES.map(({ value, label, desc, Icon }) => {
            const active = appearance === value;
            return (
              <button
                key={value}
                onClick={() => pick(value)}
                className={cn(
                  'w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left',
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-accent/30'
                )}
              >
                {/* Icon circle */}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Labels */}
                <div className="flex-1 min-w-0">
                  <div className={cn('text-sm font-semibold', active ? 'text-primary' : 'text-foreground')}>
                    {label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>

                {/* Radio dot */}
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  active ? 'border-primary' : 'border-border'
                )}>
                  {active && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Preview strip */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="text-sm font-semibold text-foreground">Preview</div>
          <div className="flex gap-3">
            {/* Light preview */}
            <div className={cn(
              'flex-1 rounded-xl border-2 overflow-hidden transition-all',
              appearance === 'light' ? 'border-primary' : 'border-border'
            )}>
              <div className="bg-card p-3 space-y-1.5">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-border" />
                  <div className="w-2 h-2 rounded-full bg-border" />
                </div>
                <div className="h-2 w-2/3 rounded bg-muted" />
                <div className="h-2 w-1/2 rounded bg-muted" />
                <div className="h-2 w-3/4 rounded bg-blue-100" />
              </div>
              <div className="bg-background px-3 py-1.5 text-[10px] font-medium text-muted-foreground text-center">Light</div>
            </div>
            {/* Dark preview */}
            <div className={cn(
              'flex-1 rounded-xl border-2 overflow-hidden transition-all',
              appearance === 'dark' ? 'border-primary' : 'border-border'
            )}>
              <div className="bg-background p-3 space-y-1.5">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-700" />
                  <div className="w-2 h-2 rounded-full bg-gray-700" />
                </div>
                <div className="h-2 w-2/3 rounded bg-gray-800" />
                <div className="h-2 w-1/2 rounded bg-gray-800" />
                <div className="h-2 w-3/4 rounded bg-blue-900/60" />
              </div>
              <div className="bg-background px-3 py-1.5 text-[10px] font-medium text-muted-foreground text-center">Dark</div>
            </div>
            {/* System preview */}
            <div className={cn(
              'flex-1 rounded-xl border-2 overflow-hidden transition-all',
              appearance === 'system' ? 'border-primary' : 'border-border'
            )}>
              <div className="bg-gradient-to-br from-white to-gray-900 p-3 space-y-1.5">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                </div>
                <div className="h-2 w-2/3 rounded bg-gray-400/40" />
                <div className="h-2 w-1/2 rounded bg-gray-400/40" />
                <div className="h-2 w-3/4 rounded bg-blue-400/40" />
              </div>
              <div className="bg-gray-500 px-3 py-1.5 text-[10px] font-medium text-gray-200 text-center">System</div>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
