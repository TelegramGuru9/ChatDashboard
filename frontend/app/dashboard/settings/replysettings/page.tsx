'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { MessageSquare, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

const DEFAULT: ReplySettings = {
  max_sentences: 2, max_words: 60, max_emojis: 1,
  tone: 'casual', flirt_level: 3, warmth_level: 4, playfulness: 4, confidence: 4, formality: 1,
  random_delay_enabled: true, min_delay_seconds: 3, max_delay_seconds: 15,
  never_repeat_content: true,
  upsell_enabled: false, upsell_delay_hours: 24, upsell_message: '',
  block_after_days: 14, auto_block_enabled: false,
  block_keywords: '',
  custom_instructions: '', forbidden_openers: '',
};

interface ReplySettings {
  max_sentences: number; max_words: number; max_emojis: number;
  tone: string; flirt_level: number; warmth_level: number; playfulness: number; confidence: number; formality: number;
  random_delay_enabled: boolean; min_delay_seconds: number; max_delay_seconds: number;
  never_repeat_content: boolean;
  upsell_enabled: boolean; upsell_delay_hours: number; upsell_message: string;
  block_after_days: number; auto_block_enabled: boolean; block_keywords: string;
  custom_instructions: string; forbidden_openers: string;
}

function SliderRow({ label, value, min, max, step = 1, onChange, leftLabel, rightLabel }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; leftLabel?: string; rightLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-primary font-semibold">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-primary" />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{leftLabel}</span><span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: () => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button onClick={onChange}
        className={cn('w-10 h-5 rounded-full relative flex-shrink-0 transition-colors', on ? 'bg-primary' : 'bg-muted-foreground/25')}>
        <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-all', on ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  );
}

const TONES = [
  { value: 'casual',   label: 'Casual',   desc: 'Natural & relaxed' },
  { value: 'balanced', label: 'Balanced', desc: 'Friendly & clear' },
  { value: 'formal',   label: 'Formal',   desc: 'Professional' },
];

const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const sectionCls = 'rounded-xl border border-border bg-card overflow-hidden';
const headerCls = 'px-4 py-3 border-b border-border';

export default function ReplySettingsPage() {
  const { withCreator } = useCreator();
  const api = getApi();
  const [reply, setReply] = useState<ReplySettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);

  const set = <K extends keyof ReplySettings>(k: K, v: ReplySettings[K]) =>
    setReply(r => ({ ...r, [k]: v }));

  useEffect(() => {
    Promise.all([
      fetch(withCreator(`${api}/config/reply_settings`)).then(r => r.json()).catch(() => ({ value: null })),
      fetch(withCreator(`${api}/config/packages`)).then(r => r.json()).catch(() => ({ value: [] })),
    ]).then(([rs, pkgs]) => {
      if (rs.value && typeof rs.value === 'object') setReply({ ...DEFAULT, ...rs.value });
      if (Array.isArray(pkgs.value)) setPackages(pkgs.value);
      setLoading(false);
    });
  }, [api, withCreator]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(withCreator(`${api}/config/reply_settings`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Reply Settings</h1>
            <p className="text-xs text-muted-foreground">Tone, timing, length, upsell rules, and blocking</p>
          </div>
        </div>

        {/* Tone */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Tone</div>
            <div className="text-xs text-muted-foreground mt-0.5">Base communication style</div>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {TONES.map(t => (
                <button key={t.value} onClick={() => set('tone', t.value)}
                  className={cn('p-3 rounded-lg border text-center transition-all', reply.tone === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground')}>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="space-y-4 pt-1">
              <SliderRow label="Flirt level" value={reply.flirt_level} min={0} max={5} onChange={v => set('flirt_level', v)} leftLabel="None" rightLabel="Flirty" />
              <SliderRow label="Warmth" value={reply.warmth_level} min={0} max={5} onChange={v => set('warmth_level', v)} leftLabel="Cool" rightLabel="Warm" />
              <SliderRow label="Playfulness" value={reply.playfulness} min={0} max={5} onChange={v => set('playfulness', v)} leftLabel="Serious" rightLabel="Playful" />
              <SliderRow label="Confidence" value={reply.confidence} min={0} max={5} onChange={v => set('confidence', v)} leftLabel="Shy" rightLabel="Bold" />
            </div>
          </div>
        </div>

        {/* Message length */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Message Length</div>
          </div>
          <div className="p-4 space-y-4">
            <SliderRow label="Max sentences per reply" value={reply.max_sentences} min={1} max={5} onChange={v => set('max_sentences', v)} leftLabel="1 (very short)" rightLabel="5 (long)" />
            <SliderRow label="Max words per reply" value={reply.max_words} min={10} max={300} step={10} onChange={v => set('max_words', v)} leftLabel="10" rightLabel="300" />
            <SliderRow label="Max emojis per reply" value={reply.max_emojis} min={0} max={5} onChange={v => set('max_emojis', v)} leftLabel="0 (none)" rightLabel="5" />
            <Toggle on={reply.never_repeat_content} onChange={() => set('never_repeat_content', !reply.never_repeat_content)}
              label="Never repeat same content" desc="Rewrite repeated intent with fresh wording" />
          </div>
        </div>

        {/* Response timing */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Response Timing</div>
            <div className="text-xs text-muted-foreground mt-0.5">Human-like delay before replies</div>
          </div>
          <div className="p-4 space-y-4">
            <Toggle on={reply.random_delay_enabled} onChange={() => set('random_delay_enabled', !reply.random_delay_enabled)}
              label="Random delay enabled" desc="Simulates human typing time" />
            {reply.random_delay_enabled && (
              <>
                <SliderRow label="Min delay (seconds)" value={reply.min_delay_seconds} min={1} max={30} onChange={v => set('min_delay_seconds', v)} />
                <SliderRow label="Max delay (seconds)" value={reply.max_delay_seconds} min={1} max={120} onChange={v => set('max_delay_seconds', v)} />
              </>
            )}
          </div>
        </div>

        {/* Forbidden openers & custom instructions */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Custom Instructions</div>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Forbidden openers (one per line)</label>
              <textarea value={reply.forbidden_openers} onChange={e => set('forbidden_openers', e.target.value)} rows={3}
                placeholder="Sure!\nOf course!\nAbsolutely!" className={cn(inputCls, 'resize-y font-mono text-xs')} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Extra instructions</label>
              <textarea value={reply.custom_instructions} onChange={e => set('custom_instructions', e.target.value)} rows={4}
                placeholder="Additional behavior rules..." className={cn(inputCls, 'resize-y text-xs')} />
            </div>
          </div>
        </div>

        {/* Upsell workflow */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Upsell Workflow</div>
            <div className="text-xs text-muted-foreground mt-0.5">Send a follow-up after buy link</div>
          </div>
          <div className="p-4 space-y-4">
            <Toggle on={reply.upsell_enabled} onChange={() => set('upsell_enabled', !reply.upsell_enabled)}
              label="Upsell enabled" desc="Send a follow-up message after the configured delay" />
            {reply.upsell_enabled && (
              <>
                <SliderRow label="Send after (hours)" value={reply.upsell_delay_hours} min={1} max={72} onChange={v => set('upsell_delay_hours', v)}
                  leftLabel="1h" rightLabel="72h" />
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Upsell message</label>
                  <textarea value={reply.upsell_message} onChange={e => set('upsell_message', e.target.value)} rows={4}
                    placeholder="Hey, did you complete your order? Let me know if you have questions!" className={cn(inputCls, 'resize-y text-xs')} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Blocking rules */}
        <div className={sectionCls}>
          <div className={headerCls}>
            <div className="font-semibold text-sm">Blocking Rules</div>
          </div>
          <div className="p-4 space-y-4">
            <Toggle on={reply.auto_block_enabled} onChange={() => set('auto_block_enabled', !reply.auto_block_enabled)}
              label="Auto-block enabled" desc="Automatically block users after no purchase" />
            {reply.auto_block_enabled && (
              <SliderRow label="Block after (days without purchase)" value={reply.block_after_days} min={1} max={90} onChange={v => set('block_after_days', v)}
                leftLabel="1 day" rightLabel="90 days" />
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Block keywords (comma-separated)</label>
              <input type="text" value={reply.block_keywords} onChange={e => set('block_keywords', e.target.value)}
                placeholder="spam, refund, scam" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Keyword reference from packages */}
        {packages.length > 0 && (
          <div className={sectionCls}>
            <div className={headerCls}>
              <div className="font-semibold text-sm">Package Keywords Reference</div>
              <div className="text-xs text-muted-foreground mt-0.5">Keywords loaded from configured packages</div>
            </div>
            <div className="divide-y divide-border">
              {packages.map((pkg: any, i: number) => (
                <div key={i} className="px-4 py-3 space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground">{pkg.name || `Package ${i + 1}`}</div>
                  {pkg.keywords && <div className="text-xs"><span className="text-muted-foreground">Trigger: </span>{pkg.keywords}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={save} disabled={saving || loading}
          className={cn('w-full py-3 rounded-xl text-sm font-semibold transition-colors', saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Reply Settings'}
        </button>

      </div>
    </DashboardLayout>
  );
}
