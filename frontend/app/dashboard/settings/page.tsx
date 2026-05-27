'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const C = {
  s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', sep:'rgba(255,255,255,0.07)',
  t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2',
};

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
  { code: 'de', flag: '🇩🇪', label: 'German' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'uk', flag: '🇺🇦', label: 'Ukrainian' },
  { code: 'ru', flag: '🇷🇺', label: 'Russian' },
];

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function SettingsPage() {
  const [persona, setPersona] = useState(NIKA_PERSONA);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.75);
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['de', 'en', 'uk', 'ru']);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jsonError, setJsonError] = useState('');
  const [jsonSuccess, setJsonSuccess] = useState('');
  const [tab, setTab] = useState<'persona'|'model'|'languages'|'advanced'>('persona');
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [testingAI, setTestingAI] = useState(false);
  const [enablingAll, setEnablingAll] = useState(false);
  const jsonRef = useRef<HTMLInputElement>(null);

  const api = getApi();

  const testAI = useCallback(async () => {
    setTestingAI(true);
    try {
      const d = await fetch(`${api}/ai/status`).then(r => r.json());
      setAiStatus(d);
    } catch (e: any) { setAiStatus({ error: e.message }); }
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

  // Load existing persona on mount
  useEffect(() => {
    fetch(`${api}/ai/persona`).then(r => r.json()).then(d => {
      if (d && typeof d === 'object' && Object.keys(d).length > 0) {
        if (typeof d.persona === 'string' && d.persona.trim()) setPersona(d.persona);
        if (typeof d.ai_enabled === 'boolean') setAiEnabled(d.ai_enabled);
        if (typeof d.max_tokens === 'number') setMaxTokens(d.max_tokens);
        if (typeof d.temperature === 'number') setTemperature(d.temperature);
        if (typeof d.model === 'string') setModel(d.model);
        if (Array.isArray(d.enabled_languages) && d.enabled_languages.length) setEnabledLanguages(d.enabled_languages);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [api]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${api}/ai/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model, enabled_languages: enabledLanguages }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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

        const personaText =
          json.persona ?? json.system_prompt ?? json.prompt ??
          json.content ?? json.instructions ?? json.character ??
          json.ai_persona ?? json.bot_persona ?? null;

        if (typeof personaText === 'string' && personaText.trim()) {
          setPersona(personaText.trim());
        } else if (typeof json === 'string') {
          setPersona(json);
        }

        if (typeof json.ai_enabled === 'boolean') setAiEnabled(json.ai_enabled);
        if (typeof json.max_tokens === 'number') setMaxTokens(json.max_tokens);
        if (typeof json.temperature === 'number') setTemperature(json.temperature);
        if (typeof json.model === 'string') setModel(json.model);

        setJsonSuccess(`✓ Loaded from ${file.name}`);
        setTab('persona');
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

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px',
    padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', ...style,
  });

  const TABS = [
    { key: 'persona'   as const, label: '🤖 Persona' },
    { key: 'languages' as const, label: '🌍 Languages' },
    { key: 'model'     as const, label: '⚙ Model' },
    { key: 'advanced'  as const, label: '🔧 Advanced' },
  ];

  const toggleLang = (code: string) => {
    setEnabledLanguages(prev =>
      prev.includes(code) ? prev.filter(l => l !== code) : [...prev, code]
    );
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '720px', color: C.t1 }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.03em' }}>AI Settings</h1>
        <p style={{ color: C.t2, fontSize: '14px', margin: '0 0 24px' }}>Configure Nika — your Telegram sales autopilot</p>

        {/* AI Toggle */}
        <div style={{ background: C.s1, borderRadius: '16px', padding: '16px 18px', border: `1px solid ${C.sep}`, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>AI Auto-Responses</div>
            <div style={{ fontSize: '12px', color: C.t3, marginTop: '2px' }}>Nika replies automatically to incoming Telegram messages</div>
          </div>
          <div onClick={() => setAiEnabled(v => !v)} style={{
            width: '44px', height: '26px', borderRadius: '13px', cursor: 'pointer',
            background: aiEnabled ? C.green : C.s3,
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{ position: 'absolute', top: '3px', left: aiEnabled ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: C.s1, borderRadius: '12px', padding: '4px', border: `1px solid ${C.sep}` }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              background: tab === t.key ? C.s2 : 'transparent',
              color: tab === t.key ? C.t1 : C.t3, fontSize: '13px', fontWeight: tab === t.key ? 600 : 400,
              transition: 'all 0.12s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* JSON Upload / Export strip */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <label style={{ flex: 1, padding: '9px', borderRadius: '10px', background: C.s1, border: `1px solid ${C.sep}`, color: C.t2, fontSize: '13px', cursor: 'pointer', textAlign: 'center', fontWeight: 500 }}>
            ⬆ Import JSON
            <input ref={jsonRef} type="file" accept=".json,.md,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleJsonUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <button onClick={exportJson} style={{ flex: 1, padding: '9px', borderRadius: '10px', background: C.s1, border: `1px solid ${C.sep}`, color: C.t2, fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>⬇ Export JSON</button>
        </div>

        {jsonError && <div style={{ padding: '8px 14px', borderRadius: '10px', marginBottom: '12px', background: 'rgba(255,69,58,0.1)', color: C.red, fontSize: '13px' }}>{jsonError}</div>}
        {jsonSuccess && <div style={{ padding: '8px 14px', borderRadius: '10px', marginBottom: '12px', background: 'rgba(48,209,88,0.08)', color: C.green, fontSize: '13px' }}>{jsonSuccess}</div>}

        {/* Tab content */}
        {tab === 'persona' && (
          <div style={{ background: C.s1, borderRadius: '16px', padding: '18px', border: `1px solid ${C.sep}` }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>System Prompt</div>
            <div style={{ fontSize: '12px', color: C.t3, marginBottom: '12px' }}>This is Nika's complete personality, rules, and sales logic. Edit freely.</div>
            <textarea
              value={persona}
              onChange={e => setPersona(e.target.value)}
              rows={22}
              style={{ ...inp(), resize: 'vertical', lineHeight: '1.55', fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: '12px' }}
            />
          </div>
        )}

        {tab === 'languages' && (
          <div style={{ background: C.s1, borderRadius: '16px', padding: '18px', border: `1px solid ${C.sep}` }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Reply Languages</div>
            <div style={{ fontSize: '12px', color: C.t3, marginBottom: '18px' }}>
              Nika detects the language of each incoming message and automatically replies in the same language.
              Enable the languages you want to support.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {LANGUAGES.map(lang => {
                const active = enabledLanguages.includes(lang.code);
                return (
                  <div key={lang.code} onClick={() => toggleLang(lang.code)} style={{
                    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s',
                    background: active ? 'rgba(10,132,255,0.08)' : C.s2,
                    border: `1px solid ${active ? 'rgba(10,132,255,0.35)' : C.sep}`,
                  }}>
                    <span style={{ fontSize: '26px', lineHeight: 1 }}>{lang.flag}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: active ? C.t1 : C.t2 }}>{lang.label}</div>
                      <div style={{ fontSize: '11px', color: C.t3, marginTop: '2px' }}>
                        {lang.code === 'de' && 'Nika antwortet auf Deutsch wenn jemand Deutsch schreibt'}
                        {lang.code === 'en' && 'Nika replies in English when someone writes in English'}
                        {lang.code === 'uk' && 'Ніка відповідає українською, коли хтось пише по-українськи'}
                        {lang.code === 'ru' && 'Ника отвечает по-русски, когда кто-то пишет по-русски'}
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div style={{
                      width: '42px', height: '24px', borderRadius: '12px', flexShrink: 0,
                      background: active ? C.blue : C.s3,
                      position: 'relative', transition: 'background 0.2s',
                    }}>
                      <div style={{
                        position: 'absolute', top: '3px', left: active ? '21px' : '3px',
                        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '10px', background: C.s2, fontSize: '12px', color: C.t3, lineHeight: 1.6 }}>
              💡 <strong style={{ color: C.t2 }}>Auto-detect is always on.</strong> Nika reads the language of each message and replies in that language — no manual switching needed.
              If a user writes in a language not enabled here, Nika defaults to English.
            </div>
          </div>
        )}

        {tab === 'model' && (
          <div style={{ background: C.s1, borderRadius: '16px', padding: '18px', border: `1px solid ${C.sep}` }}>
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Claude Model</div>
              <select value={model} onChange={e => setModel(e.target.value)} style={inp()}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Max Tokens: {maxTokens}</div>
              <input type="range" min={128} max={2048} step={128} value={maxTokens} onChange={e => setMaxTokens(+e.target.value)} style={{ width: '100%', accentColor: C.blue }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.t3, marginTop: '4px' }}><span>128 (short)</span><span>2048 (long)</span></div>
            </label>
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Temperature: {temperature.toFixed(2)}</div>
              <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={e => setTemperature(+e.target.value)} style={{ width: '100%', accentColor: C.blue }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.t3, marginTop: '4px' }}><span>0 (precise)</span><span>1 (creative)</span></div>
            </label>
          </div>
        )}

        {tab === 'advanced' && (
          <div style={{ background: C.s1, borderRadius: '16px', padding: '18px', border: `1px solid ${C.sep}` }}>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>Advanced Settings</div>
            <div style={{ padding: '12px', borderRadius: '10px', background: C.s2, fontSize: '13px', color: C.t2, lineHeight: '1.7' }}>
              <div style={{ marginBottom: '8px' }}>• AI replies to all new incoming messages when enabled</div>
              <div style={{ marginBottom: '8px' }}>• Per-user AI can be toggled in the inbox insight panel</div>
              <div style={{ marginBottom: '8px' }}>• Conversation history (last 30 msgs) is always included as context</div>
              <div style={{ marginBottom: '8px' }}>• Media files are sent based on keywords defined in the Media library</div>
              <div>• Packages are pitched based on keywords + message count triggers</div>
            </div>
          </div>
        )}

        {/* ── AI Diagnostic Panel ── */}
        <div style={{ marginTop: '16px', background: C.s1, borderRadius: '16px', padding: '16px 18px', border: `1px solid ${C.sep}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiStatus ? '12px' : '0' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>🔬 Test Autopilot</div>
              <div style={{ fontSize: '11px', color: C.t3, marginTop: '2px' }}>Verify key + Claude reachability + enable AI for all chats</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={enableAllAI} disabled={enablingAll} style={{
                padding: '7px 14px', borderRadius: '10px', background: 'rgba(48,209,88,0.12)',
                border: '1px solid rgba(48,209,88,0.3)', color: C.green,
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: enablingAll ? 0.5 : 1,
              }}>
                {enablingAll ? '…' : '⚡ Enable All'}
              </button>
              <button onClick={testAI} disabled={testingAI} style={{
                padding: '7px 14px', borderRadius: '10px', background: C.s2,
                border: `1px solid ${C.sep}`, color: C.t2,
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: testingAI ? 0.5 : 1,
              }}>
                {testingAI ? '…' : '▶ Run Test'}
              </button>
            </div>
          </div>

          {aiStatus && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'API Key', ok: aiStatus.api_key_set, val: aiStatus.api_key_set ? '✓ Set in Railway' : '✗ Missing — add ANTHROPIC_API_KEY in Railway Variables' },
                { label: 'Persona', ok: aiStatus.persona_saved, val: aiStatus.persona_saved ? '✓ Saved' : '✗ Not saved — click Save below' },
                { label: 'Model', ok: true, val: aiStatus.model },
                { label: 'Claude', ok: aiStatus.claude_reachable, val: aiStatus.claude_reachable ? `✓ Online — "${aiStatus.test_response}"` : `✗ Unreachable — ${aiStatus.error || 'unknown error'}` },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '12px' }}>
                  <span style={{ width: '60px', color: C.t3, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ color: row.ok ? C.green : C.red, fontWeight: 500, flex: 1 }}>{row.val}</span>
                </div>
              ))}
              {aiStatus._enabledAll != null && (
                <div style={{ fontSize: '12px', color: C.green, paddingTop: '4px', borderTop: `1px solid ${C.sep}` }}>
                  ✓ AI enabled for {aiStatus._enabledAll} chats
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={saving || loading} style={{
          width: '100%', marginTop: '16px', padding: '13px', borderRadius: '13px',
          background: saved ? C.green : C.blue, border: 'none', color: '#fff',
          fontSize: '15px', fontWeight: 600, cursor: 'pointer',
          opacity: (saving || loading) ? 0.6 : 1, transition: 'background 0.2s',
        }}>
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Nika\'s Settings'}
        </button>
      </div>
    </DashboardLayout>
  );
}
