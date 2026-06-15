'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Shield, ChevronLeft, Zap, Brain, Sparkles } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

const DEFAULT_SYSTEM_SETTINGS = {
  autopilot_enabled: true,
  use_persona: true,
  use_reply_settings: true,
  use_package_keywords: true,
  use_purchase_keywords: true,
  use_cash_workflow: true,
  auto_status_change: true,
  human_handover_after_buy: true,
  never_ask_for_email: true,
  never_send_paid_media: true,
};

const TOGGLES = [
  { key: 'autopilot_enabled',         label: 'Autopilot enabled',             desc: 'Main on/off switch for all auto-replies' },
  { key: 'use_persona',               label: 'Reply in persona',              desc: 'LLM uses the configured Persona JSON as identity' },
  { key: 'use_reply_settings',        label: 'Use Reply Settings',            desc: 'Apply tone, length, and delay from Reply Settings' },
  { key: 'use_package_keywords',      label: 'Use package keywords',          desc: 'Trigger package messages on matching keywords' },
  { key: 'use_purchase_keywords',     label: 'Use purchase keywords',         desc: 'Detect buy intent from configured purchase keywords' },
  { key: 'use_cash_workflow',         label: 'Cash Alarm workflow',           desc: 'Trigger Cash Alarm notifications after buy link sent' },
  { key: 'auto_status_change',        label: 'Auto-update user status',       desc: 'Automatically change cold/warm/hot status on behavior' },
  { key: 'human_handover_after_buy',  label: 'Human handover after buy link', desc: 'Disable autopilot for a chat after buy link is sent' },
  { key: 'never_ask_for_email',       label: 'Never ask for email',           desc: 'Safety rule — autopilot must never ask for email' },
  { key: 'never_send_paid_media',     label: 'Never send paid media',         desc: 'Safety rule — autopilot never sends paid content automatically' },
];

const MODELS = [
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    tag: 'Fast',
    tagColor: 'bg-green-500/10 text-green-400 border-green-500/20',
    icon: <Zap className="h-4 w-4 text-green-400" />,
    desc: 'Fastest replies, lowest cost. Best for high-volume casual chats.',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    tag: 'Balanced',
    tagColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: <Brain className="h-4 w-4 text-blue-400" />,
    desc: 'Smart and fast. Great balance of quality and speed for most conversations.',
  },
  {
    id: 'claude-opus-4-6',
    label: 'Opus 4.6',
    tag: 'Premium',
    tagColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: <Sparkles className="h-4 w-4 text-purple-400" />,
    desc: 'High quality replies. Great for nuanced conversations and closing sales.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus 4.8',
    tag: 'Best',
    tagColor: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    icon: <Sparkles className="h-4 w-4 text-pink-400" />,
    desc: 'Latest & most capable Opus. Strongest reasoning, most honest, best at long conversations. Recommended for highest quality results.',
  },
];

export default function SystemPromptPage() {
  const { withCreator } = useCreator();
  const api = getApi();

  const [systemPrompt, setSystemPrompt] = useState('');
  const [settings, setSettings]         = useState(DEFAULT_SYSTEM_SETTINGS);
  const [model, setModel]               = useState('claude-haiku-4-5-20251001');
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(withCreator(`${api}/config/system_prompt`)).then(r => r.json()).catch(() => ({ value: '' })),
      fetch(withCreator(`${api}/config/system_settings`)).then(r => r.json()).catch(() => ({ value: null })),
      fetch(withCreator(`${api}/ai/persona`)).then(r => r.json()).catch(() => null),
    ]).then(([sp, ss, persona]) => {
      if (typeof sp.value === 'string') setSystemPrompt(sp.value);
      if (ss.value && typeof ss.value === 'object') setSettings({ ...DEFAULT_SYSTEM_SETTINGS, ...ss.value });
      if (persona && typeof persona === 'object') {
        const m = persona.model;
        if (m && MODELS.some(x => x.id === m)) setModel(m);
      }
      setLoading(false);
    });
  }, [api, withCreator]);

  const save = async () => {
    setSaving(true);
    try {
      // Save system prompt + settings
      await Promise.all([
        fetch(withCreator(`${api}/config/system_prompt`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(systemPrompt),
        }),
        fetch(withCreator(`${api}/config/system_settings`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        }),
      ]);

      // Patch model into the persona config
      const personaRes = await fetch(withCreator(`${api}/ai/persona`)).catch(() => null);
      if (personaRes?.ok) {
        const currentPersona = await personaRes.json().catch(() => ({}));
        await fetch(withCreator(`${api}/ai/persona`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...currentPersona, model }),
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const toggle = (key: string) =>
    setSettings(s => ({ ...s, [key]: !s[key as keyof typeof s] }));

  const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">System Prompt</h1>
            <p className="text-xs text-muted-foreground">Global autopilot rules — applied before persona on every AI call</p>
          </div>
        </div>

        {/* ── Model picker ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="font-semibold text-sm">AI Model</div>
            <div className="text-xs text-muted-foreground mt-0.5">Choose the Claude model used for all auto-replies</div>
          </div>
          <div className="p-4 grid gap-2.5">
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                  model === m.id
                    ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-accent/40'
                )}
              >
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                  model === m.id ? 'bg-primary/10' : 'bg-muted'
                )}>
                  {m.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{m.label}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold border', m.tagColor)}>
                      {m.tag}
                    </span>
                    {model === m.id && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.desc}</div>
                </div>
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all',
                  model === m.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                )}>
                  {model === m.id && (
                    <div className="w-full h-full rounded-full bg-card scale-[0.45] block" />
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/30">
            <p className="text-[10px] text-muted-foreground">
              Model ID: <span className="font-mono text-foreground">{model}</span>
            </p>
          </div>
        </div>

        {/* ── Autopilot toggles ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="font-semibold text-sm">Autopilot Behavior</div>
            <div className="text-xs text-muted-foreground mt-0.5">These settings control what the autopilot is allowed to do</div>
          </div>
          <div className="divide-y divide-border">
            {TOGGLES.map(t => (
              <div key={t.key} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                <button
                  onClick={() => toggle(t.key)}
                  disabled={loading}
                  className={cn(
                    'w-10 h-5 rounded-full relative flex-shrink-0 transition-colors',
                    settings[t.key as keyof typeof settings] ? 'bg-primary' : 'bg-muted-foreground/25'
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-all',
                    settings[t.key as keyof typeof settings] ? 'left-5' : 'left-0.5'
                  )} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── System prompt textarea ────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="font-semibold text-sm">System Prompt</div>
            <div className="text-xs text-muted-foreground mt-0.5">Injected at the top of every AI call. Persona comes after this.</div>
          </div>
          <div className="p-4 space-y-3">
            <div className="px-3 py-2 rounded-lg bg-blue-500/8 border border-blue-500/20 text-xs text-blue-400 leading-relaxed">
              🛡 <strong>Highest priority.</strong> These rules are seen by Claude before anything else. Use them to set hard constraints.
            </div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={16}
              placeholder={`Example rules:\n- Reply in maximum 2 sentences.\n- Use at most 1 emoji per message.\n- Never mention competitors.\n- Always stay in character.\n- Never ask for email.\n- Never invent package prices.`}
              className={cn(inputCls, 'resize-y font-mono text-xs leading-relaxed')}
            />
            <p className="text-xs text-muted-foreground">Leave blank to rely on Persona alone.</p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || loading}
          className={cn(
            'w-full py-3 rounded-xl text-sm font-semibold transition-colors',
            saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Settings'}
        </button>

      </div>
    </DashboardLayout>
  );
}
