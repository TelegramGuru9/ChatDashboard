'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NIKA_PERSONA = `You are a Telegram sales autopilot for wishperme creator. You write exactly like the creator herself — warm, flirty, teasing, personal, short and natural.

## Tone Rules
- Flirty, warm, teasing, personal
- Short messages (1-3 sentences max)
- Casual and human — never robotic
- Sales-oriented but never pushy
- Confident with boundaries

## Your Core Job
1. Qualify social-media leads who message via Telegram
2. Sell the first Telegram package based on detected interests
3. Tag and store buyer interests during conversation
4. After first sale → pitch wishperme personally
5. If wishperme declined → offer ONE Telegram upsell
6. Send second stronger wishperme pitch with exclusive code
7. End active loop after second pitch

## Packages
- Quick Tease: 1 video → €20
- Hot Bundle: 2 videos + 8 pictures → €30
- Full Package: 3 videos + 10 pictures → €40

## Content Categories
SOLO | DILDO | SQUIRTING | DESSOUS | HIGHHEELS | BATHTUB | FULL_BODY | FACE_VISIBLE | EXTRA_DIRTY | MIXED_PACKAGE

## Lead Labels (assign silently)
COLD | CURIOUS | HOT | BUYER | TIMEWASTER | CUSTOM | FAILED_PAYMENT | HIGH_INTENT_NO_BUY | UPSELL_READY | WISHPERME_READY | WISHPERME_DECLINED | WISHPERME_MIGRATED | LOOP_ENDED

## Keyword → Action Rules
- Price / how much / what does it cost → HOT label, send package menu
- Link / payment / pay / buy → HOT label, send payment CTA
- Paid / done / sent → BUYER, confirm and send first wishperme pitch
- Free / show me first / preview → TIMEWASTER, boundary response
- Custom / custom video / personalized → CUSTOM, escalate to human
- Meet / meetup / in person → reject real-life meeting
- More / another / give me more → UPSELL_READY, offer upsell
- wishperme / subscription / join → explain wishperme naturally
- Category keywords (solo, dildo, squirting, etc.) → detect interest, offer matching package

## Compliance Rules (non-negotiable)
- Digital content ONLY — no real-life services
- Always reject real-life meeting requests
- Reject unsafe, illegal, underage, or non-consensual content
- Never send free previews
- Require 18+ confirmation if age is unclear
- Escalate: custom requests, failed payments, high-value buyers, safety concerns

## Boundary Responses
- Free preview request: "I don't send previews for free, babe. Pick a set and I'll make sure you get something worth it 😘"
- Meeting request: "I don't do meetings. Everything stays here and private. But I can send you a hot set if you want something now."
- Freebie: "That's not how this works babe 😘 But I can hook you up with something really good if you're serious."

## Message Templates (vary these naturally)
First reply: "Hey babe 😘 tell me what you're in the mood for and I'll show you what fits best."
Price menu: "I've got a few options:\\nQuick Tease — 1 video for 20€\\nHot Bundle — 2 vids + 8 pics for 30€\\nFull Package — 3 vids + 10 pics for 40€\\nWant something specific or mixed?"
After first sale: "Since I know what you like now… you'd probably enjoy my wishperme even more 😏 More exclusive, more personal, more of what you just picked. Want the link?"
Loop end: "No stress babe 😘 I'll leave it here for now."

## Upsell Logic
After a purchase, offer same-category THEN cross-category:
- SQUIRTING → more squirting + dildo or extra dirty
- DILDO → more dildo + squirting or solo
- DESSOUS → more dessous + highheels or solo
- HIGHHEELS → more highheels + dessous or full body

## wishperme Pitch Codes
- SQUIRTING → SQUIRTVIP
- DESSOUS → DESSOUSVIP
- HIGH_VALUE → PRIVATEVIP
- MIXED_PACKAGE → VIPACCESS`;

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fast, cheap)' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Balanced)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Most capable)' },
];

const LANGUAGES = [
  { code: 'de', flag: '🇩🇪', label: 'German',    hint: 'Nika antwortet auf Deutsch wenn jemand Deutsch schreibt' },
  { code: 'en', flag: '🇬🇧', label: 'English',   hint: 'Nika replies in English when someone writes in English' },
  { code: 'uk', flag: '🇺🇦', label: 'Ukrainian', hint: 'Ніка відповідає українською, коли хтось пише по-українськи' },
  { code: 'ru', flag: '🇷🇺', label: 'Russian',   hint: 'Ника отвечает по-русски, когда кто-то пишет по-русски' },
];

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

type TabKey = 'system_prompt' | 'persona' | 'model' | 'languages' | 'advanced' | 'cash';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'system_prompt', label: '🛡 System Rules' },
  { key: 'persona',       label: '🤖 Persona' },
  { key: 'languages',     label: '🌍 Languages' },
  { key: 'model',         label: '⚙ Model' },
  { key: 'cash',          label: '💵 Cash Alarm' },
  { key: 'advanced',      label: '🔧 Advanced' },
];

export default function SettingsPage() {
  const [persona,          setPersona]         = useState(NIKA_PERSONA);
  const [aiEnabled,        setAiEnabled]       = useState(true);
  const [maxTokens,        setMaxTokens]       = useState(512);
  const [temperature,      setTemperature]     = useState(0.75);
  const [model,            setModel]           = useState('claude-haiku-4-5-20251001');
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['de','en','uk','ru']);
  const [saved,            setSaved]           = useState(false);
  const [saving,           setSaving]          = useState(false);
  const [loading,          setLoading]         = useState(true);
  const [jsonError,        setJsonError]       = useState('');
  const [jsonSuccess,      setJsonSuccess]     = useState('');
  const [systemPrompt,     setSystemPrompt]    = useState('');
  const [tab,              setTab]             = useState<TabKey>('system_prompt');
  const [cashUsers,        setCashUsers]       = useState<string[]>(['FuegoFounder', 'rickjames999']);
  const [cashInput,        setCashInput]       = useState('');
  const [cashSaving,       setCashSaving]      = useState(false);
  const [cashSaved,        setCashSaved]       = useState(false);
  const [aiStatus,         setAiStatus]        = useState<any>(null);
  const [testingAI,        setTestingAI]       = useState(false);
  const [enablingAll,      setEnablingAll]     = useState(false);
  const jsonRef = useRef<HTMLInputElement>(null);

  const api = getApi();
  const { withCreator } = useCreator();

  const testAI = useCallback(async () => {
    setTestingAI(true);
    try { setAiStatus(await fetch(`${api}/ai/status`).then(r => r.json())); }
    catch (e: any) { setAiStatus({ error: e.message }); }
    finally { setTestingAI(false); }
  }, [api]);

  const enableAllAI = useCallback(async () => {
    setEnablingAll(true);
    try {
      const d = await fetch(`${api}/ai/enable-all`, { method: 'POST' }).then(r => r.json());
      setAiStatus((prev: any) => ({ ...prev, _enabledAll: d.enabled_count }));
    } catch {}
    finally { setEnablingAll(false); }
  }, [api]);

  useEffect(() => {
    Promise.all([
      fetch(withCreator(`${api}/ai/persona`)).then(r => r.json()),
      fetch(withCreator(`${api}/config/system_prompt`)).then(r => r.json()).catch(() => ({ value: '' })),
      fetch(withCreator(`${api}/config/cash_notify_users`)).then(r => r.json()).catch(() => ({ value: [] })),
    ]).then(([d, sp, cu]) => {
      if (d && typeof d === 'object' && Object.keys(d).length > 0) {
        if (typeof d.persona === 'string' && d.persona.trim()) setPersona(d.persona);
        if (typeof d.ai_enabled === 'boolean') setAiEnabled(d.ai_enabled);
        if (typeof d.max_tokens === 'number') setMaxTokens(d.max_tokens);
        if (typeof d.temperature === 'number') setTemperature(d.temperature);
        if (typeof d.model === 'string') setModel(d.model);
        if (Array.isArray(d.enabled_languages) && d.enabled_languages.length) setEnabledLanguages(d.enabled_languages);
      }
      if (typeof sp?.value === 'string') setSystemPrompt(sp.value);
      if (Array.isArray(cu?.value) && cu.value.length > 0) setCashUsers(cu.value);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [api, withCreator]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch(withCreator(`${api}/ai/persona`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model, enabled_languages: enabledLanguages }),
        }),
        fetch(withCreator(`${api}/config/system_prompt`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(systemPrompt),
        }),
      ]);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleJsonUpload = (file: File) => {
    setJsonError(''); setJsonSuccess('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = e.target?.result as string;
        const json = JSON.parse(raw);
        const personaText = json.persona ?? json.system_prompt ?? json.prompt ?? json.content ?? json.instructions ?? json.character ?? json.ai_persona ?? json.bot_persona ?? null;
        if (typeof personaText === 'string' && personaText.trim()) setPersona(personaText.trim());
        else if (typeof json === 'string') setPersona(json);
        if (typeof json.ai_enabled === 'boolean') setAiEnabled(json.ai_enabled);
        if (typeof json.max_tokens === 'number') setMaxTokens(json.max_tokens);
        if (typeof json.temperature === 'number') setTemperature(json.temperature);
        if (typeof json.model === 'string') setModel(json.model);
        setJsonSuccess(`✓ Loaded from ${file.name}`); setTab('persona');
      } catch { setJsonError('Invalid JSON — could not parse.'); }
    };
    reader.readAsText(file);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'nika-persona.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const saveCashUsers = async () => {
    setCashSaving(true);
    try {
      await fetch(withCreator(`${api}/config/cash_notify_users`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cashUsers),
      });
      setCashSaved(true); setTimeout(() => setCashSaved(false), 3000);
    } catch {}
    setCashSaving(false);
  };

  const addCashUser = () => {
    const u = cashInput.trim().replace(/^@/, '');
    if (u && !cashUsers.includes(u)) setCashUsers(prev => [...prev, u]);
    setCashInput('');
  };

  const inputCls = "w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none";

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure Nika — your Telegram sales autopilot</p>
        </div>

        {/* AI Toggle */}
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">AI Auto-Responses</div>
              <div className="text-xs text-muted-foreground mt-0.5">Nika replies automatically to incoming Telegram messages</div>
            </div>
            <div
              onClick={() => setAiEnabled(v => !v)}
              className={cn("w-11 h-6 rounded-full relative cursor-pointer transition-colors flex-shrink-0", aiEnabled ? "bg-green-500" : "bg-muted-foreground/30")}
            >
              <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all", aiEnabled ? "left-6" : "left-1")} />
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                tab === t.key ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* JSON import/export */}
        <div className="flex gap-2">
          <label className="flex-1 py-2.5 rounded-xl bg-card border border-border text-muted-foreground text-xs font-medium text-center cursor-pointer hover:bg-muted transition-colors">
            ⬆ Import JSON
            <input ref={jsonRef} type="file" accept=".json,.md,.txt" className="hidden" onChange={e => { if (e.target.files?.[0]) handleJsonUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <button onClick={exportJson} className="flex-1 py-2.5 rounded-xl bg-card border border-border text-muted-foreground text-xs font-medium hover:bg-muted transition-colors">⬇ Export JSON</button>
        </div>

        {jsonError && <div className="px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-sm">{jsonError}</div>}
        {jsonSuccess && <div className="px-3 py-2 rounded-xl bg-green-500/10 text-green-400 text-sm">{jsonSuccess}</div>}

        {/* Tab Content */}
        {tab === 'system_prompt' && (
          <Card>
            <CardContent className="pt-4 pb-5 space-y-3">
              <div>
                <div className="font-semibold text-sm">System Rules</div>
                <div className="text-xs text-muted-foreground mt-0.5">Strict behavioral rules applied before everything else. These override the Persona.</div>
              </div>
              <div className="px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/20 text-xs text-primary leading-relaxed">
                🛡 <strong>Highest priority.</strong> The backend prepends this block to every prompt. Claude sees it first — your Persona comes second.
              </div>
              <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={18}
                placeholder={`Example rules:\n- Reply in maximum 2 sentences.\n- Use at most 1 emoji per message.\n- Never mention competitors.\n- Always stay in character as Nika.`}
                className={cn(inputCls, "resize-y leading-relaxed font-mono text-xs")} />
              <div className="text-xs text-muted-foreground">Leave blank to use Persona alone.</div>
            </CardContent>
          </Card>
        )}

        {tab === 'persona' && (
          <Card>
            <CardContent className="pt-4 pb-5 space-y-3">
              <div>
                <div className="font-semibold text-sm">System Prompt</div>
                <div className="text-xs text-muted-foreground mt-0.5">Nika's complete personality, rules, and sales logic.</div>
              </div>
              <textarea value={persona} onChange={e => setPersona(e.target.value)} rows={22}
                className={cn(inputCls, "resize-y leading-relaxed font-mono text-xs")} />
            </CardContent>
          </Card>
        )}

        {tab === 'languages' && (
          <Card>
            <CardContent className="pt-4 pb-5 space-y-3">
              <div>
                <div className="font-semibold text-sm">Reply Languages</div>
                <div className="text-xs text-muted-foreground mt-0.5">Nika detects the language of each message and replies in the same language.</div>
              </div>
              <div className="space-y-2">
                {LANGUAGES.map(lang => {
                  const active = enabledLanguages.includes(lang.code);
                  return (
                    <div key={lang.code} onClick={() => setEnabledLanguages(prev => prev.includes(lang.code) ? prev.filter(l => l !== lang.code) : [...prev, lang.code])}
                      className={cn(
                        "flex items-center gap-3.5 p-3.5 rounded-xl cursor-pointer border transition-all",
                        active ? "bg-primary/8 border-primary/30" : "bg-muted border-border hover:border-muted-foreground"
                      )}>
                      <span className="text-2xl">{lang.flag}</span>
                      <div className="flex-1">
                        <div className={cn("font-semibold text-sm", active ? "text-foreground" : "text-muted-foreground")}>{lang.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{lang.hint}</div>
                      </div>
                      <div className={cn("w-10 h-6 rounded-full relative flex-shrink-0 transition-colors", active ? "bg-primary" : "bg-muted-foreground/30")}>
                        <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all", active ? "left-5" : "left-1")} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-2.5 rounded-xl bg-muted text-xs text-muted-foreground leading-relaxed">
                💡 <strong className="text-foreground">Auto-detect is always on.</strong> If a user writes in a language not enabled here, Nika defaults to English.
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'model' && (
          <Card>
            <CardContent className="pt-4 pb-5 space-y-4">
              <label className="block">
                <div className="text-xs text-muted-foreground mb-1.5">Claude Model</div>
                <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
                  {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="text-xs text-muted-foreground mb-1.5">Max Tokens: {maxTokens}</div>
                <input type="range" min={128} max={2048} step={128} value={maxTokens} onChange={e => setMaxTokens(+e.target.value)} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>128 (short)</span><span>2048 (long)</span></div>
              </label>
              <label className="block">
                <div className="text-xs text-muted-foreground mb-1.5">Temperature: {temperature.toFixed(2)}</div>
                <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={e => setTemperature(+e.target.value)} className="w-full accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0 (precise)</span><span>1 (creative)</span></div>
              </label>
            </CardContent>
          </Card>
        )}

        {tab === 'cash' && (
          <Card className="border-yellow-400/20">
            <CardContent className="pt-4 pb-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">💵</span>
                <div>
                  <div className="font-bold text-base text-yellow-400">Cash Alarm</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Wer bekommt eine Telegram-Nachricht wenn ein Kauf bestätigt wird?</div>
                </div>
              </div>
              <div className="px-4 py-3.5 rounded-xl bg-yellow-400/6 border border-yellow-400/15 text-sm leading-relaxed">
                <div className="text-yellow-400 font-semibold text-xs mb-2">Was passiert beim Kauf:</div>
                <div className="text-muted-foreground space-y-1 text-xs">
                  <div>1. User bestätigt Zahlung (Screenshot / Transaktions-Nr.)</div>
                  <div>2. Lead wird auf <span className="text-green-400 font-semibold">BUYER</span> gesetzt</div>
                  <div>3. Alle Nutzer unten erhalten: <span className="font-mono text-yellow-400">💵💵💵 $ CASH CASH CASH $ 💵💵💵</span></div>
                </div>
              </div>
              <div className="space-y-2">
                {cashUsers.map(u => (
                  <div key={u} className="flex items-center justify-between bg-muted rounded-xl px-3.5 py-2.5">
                    <span className="font-semibold text-sm">@{u}</span>
                    <button onClick={() => setCashUsers(prev => prev.filter(x => x !== u))} className="text-red-400 hover:text-red-300 text-lg px-1 leading-none">✕</button>
                  </div>
                ))}
                {cashUsers.length === 0 && <div className="text-center py-4 text-muted-foreground text-sm">Noch keine Nutzer</div>}
              </div>
              <div className="flex gap-2">
                <input value={cashInput} onChange={e => setCashInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCashUser()}
                  placeholder="@username" className={cn(inputCls, "flex-1")} />
                <button onClick={addCashUser} className="px-4 py-2 rounded-xl bg-yellow-400 text-black font-bold text-sm hover:bg-yellow-300 transition-colors">+ Add</button>
              </div>
              <button onClick={saveCashUsers} disabled={cashSaving}
                className={cn("w-full py-2.5 rounded-xl font-bold text-sm text-black transition-colors", cashSaved ? "bg-green-400" : "bg-yellow-400 hover:bg-yellow-300", cashSaving && "opacity-60")}>
                {cashSaved ? '✓ Gespeichert!' : cashSaving ? 'Speichere…' : '💾 Cash Alarm speichern'}
              </button>
            </CardContent>
          </Card>
        )}

        {tab === 'advanced' && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="font-semibold text-sm mb-3">Advanced Settings</div>
              <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                {[
                  'AI replies to all new incoming messages when enabled',
                  'Per-user AI can be toggled in the inbox insight panel',
                  'Conversation history (last 30 msgs) is always included as context',
                  'Media files are sent based on keywords defined in the Media library',
                  'Packages are pitched based on keywords + message count triggers',
                ].map((item, i) => <div key={i}>• {item}</div>)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Diagnostic */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">🔬 Test Autopilot</div>
                <div className="text-xs text-muted-foreground mt-0.5">Verify API key + Claude reachability</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-green-400 border-green-400/30 bg-green-400/8 hover:bg-green-400/15" onClick={enableAllAI} disabled={enablingAll}>
                  {enablingAll ? '…' : '⚡ Enable All'}
                </Button>
                <Button variant="outline" size="sm" onClick={testAI} disabled={testingAI}>
                  {testingAI ? '…' : '▶ Run Test'}
                </Button>
              </div>
            </div>
            {aiStatus && (
              <div className="space-y-2">
                {[
                  { label: 'API Key', ok: aiStatus.api_key_set, val: aiStatus.api_key_set ? '✓ Set in Railway' : '✗ Missing — add ANTHROPIC_API_KEY in Railway Variables' },
                  { label: 'Persona', ok: aiStatus.persona_saved, val: aiStatus.persona_saved ? '✓ Saved' : '✗ Not saved — click Save below' },
                  { label: 'Model', ok: true, val: aiStatus.model },
                  { label: 'Claude', ok: aiStatus.claude_reachable, val: aiStatus.claude_reachable ? `✓ Online — "${aiStatus.test_response}"` : `✗ Unreachable — ${aiStatus.error || 'unknown error'}` },
                ].map(row => (
                  <div key={row.label} className="flex gap-2.5 items-start text-xs">
                    <span className="w-14 text-muted-foreground flex-shrink-0">{row.label}</span>
                    <span className={cn("flex-1", row.ok ? "text-green-400" : "text-red-400")}>{row.val}</span>
                  </div>
                ))}
                {aiStatus._enabledAll != null && (
                  <div className="text-xs text-green-400 pt-2 border-t border-border">✓ AI enabled for {aiStatus._enabledAll} chats</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className={cn("w-full py-5 text-base font-semibold transition-colors", saved ? "bg-green-500 hover:bg-green-500" : "")}
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : "Save Nika's Settings"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
