'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Globe, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

type LangMode = 'native' | 'translated' | 'disabled';

interface LangSetting {
  code: string; name: string; flag: string; mode: LangMode; isDefault?: boolean;
}

const ALL_LANGUAGES: Omit<LangSetting, 'mode'>[] = [
  { code: 'de', name: 'German',     flag: '🇩🇪', isDefault: true },
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'ru', name: 'Russian',    flag: '🇷🇺' },
  { code: 'uk', name: 'Ukrainian',  flag: '🇺🇦' },
  { code: 'tr', name: 'Turkish',    flag: '🇹🇷' },
  { code: 'es', name: 'Spanish',    flag: '🇪🇸' },
  { code: 'fr', name: 'French',     flag: '🇫🇷' },
  { code: 'it', name: 'Italian',    flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ar', name: 'Arabic',     flag: '🇸🇦' },
  { code: 'zh', name: 'Chinese',    flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese',   flag: '🇯🇵' },
];

const DEFAULT_LANGS: LangSetting[] = ALL_LANGUAGES.map(l => ({
  ...l,
  mode: l.code === 'de' || l.code === 'en' ? 'native' : l.code === 'ru' || l.code === 'uk' ? 'translated' : 'disabled',
}));

const MODE_LABELS: Record<LangMode, string> = {
  native: 'Native',
  translated: 'Translated',
  disabled: 'Disabled',
};
const MODE_COLORS: Record<LangMode, string> = {
  native: 'bg-green-500/10 text-green-400 border-green-500/20',
  translated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  disabled: 'bg-muted/50 text-muted-foreground border-border',
};

export default function LanguagesPage() {
  const { withCreator } = useCreator();
  const api = getApi();
  const [langs, setLangs] = useState<LangSetting[]>(DEFAULT_LANGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(withCreator(`${api}/config/language_settings`))
      .then(r => r.json())
      .catch(() => ({ value: null }))
      .then(d => {
        if (Array.isArray(d.value) && d.value.length > 0) {
          // Merge saved modes into ALL_LANGUAGES list
          const saved = d.value as LangSetting[];
          setLangs(ALL_LANGUAGES.map(l => {
            const match = saved.find(s => s.code === l.code);
            return { ...l, mode: match?.mode || 'disabled' };
          }));
        }
        setLoading(false);
      });
  }, [api, withCreator]);

  const cycleMode = (code: string) => {
    const order: LangMode[] = ['native', 'translated', 'disabled'];
    setLangs(ls => ls.map(l => {
      if (l.code !== code) return l;
      const idx = order.indexOf(l.mode);
      return { ...l, mode: order[(idx + 1) % order.length] };
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(withCreator(`${api}/config/language_settings`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(langs),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const native     = langs.filter(l => l.mode === 'native');
  const translated = langs.filter(l => l.mode === 'translated');
  const disabled   = langs.filter(l => l.mode === 'disabled');

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Globe className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Languages</h1>
            <p className="text-xs text-muted-foreground">Click a language to cycle: Native → Translated → Disabled</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-3 flex-wrap">
          {(['native', 'translated', 'disabled'] as LangMode[]).map(m => (
            <div key={m} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', MODE_COLORS[m])}>
              {MODE_LABELS[m]}
              {m === 'native' && ' — reply naturally in this language'}
              {m === 'translated' && ' — reply via translation'}
              {m === 'disabled' && ' — fall back to default'}
            </div>
          ))}
        </div>

        {/* Language grid */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">All Languages</div>
          <div className="divide-y divide-border">
            {langs.map(lang => (
              <button key={lang.code} onClick={() => cycleMode(lang.code)}
                className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-accent transition-colors text-left">
                <span className="text-xl flex-shrink-0">{lang.flag}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{lang.name}</div>
                  {lang.isDefault && <div className="text-xs text-muted-foreground">Default fallback language</div>}
                </div>
                <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border', MODE_COLORS[lang.mode])}>
                  {MODE_LABELS[lang.mode]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-1.5">
          <div><span className="text-green-400 font-semibold">Native:</span> {native.map(l => l.name).join(', ') || 'None'}</div>
          <div><span className="text-blue-400 font-semibold">Translated:</span> {translated.map(l => l.name).join(', ') || 'None'}</div>
          <div><span className="text-muted-foreground font-semibold">Disabled:</span> {disabled.map(l => l.name).join(', ') || 'None'}</div>
        </div>

        <button onClick={save} disabled={saving || loading}
          className={cn('w-full py-3 rounded-xl text-sm font-semibold transition-colors', saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Language Settings'}
        </button>

      </div>
    </DashboardLayout>
  );
}
