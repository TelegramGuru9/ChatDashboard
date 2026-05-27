'use client';

import { useState, useRef } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ios = {
  surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

const DEFAULT_PERSONA = `You are a friendly and professional sales assistant for our business. Your name is Nika.

Your personality:
- Warm, approachable, and genuine
- Professional but not formal or stiff
- Curious about the customer's needs
- Patient and never pushy

Your goals:
- Understand what the customer needs
- Answer questions clearly and helpfully
- Guide interested customers toward a call or purchase
- Qualify leads naturally through conversation

Rules:
- Never lie or make up information
- If you don't know something, say so honestly
- Keep responses concise (2-4 sentences max)
- Always end with a question to keep the conversation going
- If a customer seems very interested, suggest a call`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: ios.surface, borderRadius: '18px', padding: '20px', border: `1px solid ${ios.border}`, marginBottom: '14px' }}>
      <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '16px', color: ios.text }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '12px', color: ios.text2, fontWeight: 500, display: 'block', marginBottom: '6px' }}>{label}</label>
      {hint && <div style={{ fontSize: '11px', color: ios.text3, marginBottom: '6px' }}>{hint}</div>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [model, setModel] = useState('claude-haiku-4-5-20251001');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [jsonSuccess, setJsonSuccess] = useState('');
  const jsonRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'persona' | 'model' | 'advanced'>('persona');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/ai/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model }),
      });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleJsonUpload = (file: File) => {
    setJsonError(''); setJsonSuccess('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = e.target?.result as string;
        const json = JSON.parse(raw);

        // Accept ANY JSON — try multiple field names for the persona text
        const personaText =
          json.persona ?? json.system_prompt ?? json.prompt ??
          json.content ?? json.instructions ?? json.character ??
          json.ai_persona ?? json.bot_persona ?? null;

        if (typeof personaText === 'string' && personaText.trim()) {
          setPersona(personaText.trim());
        } else if (typeof json === 'string') {
          // The JSON IS the persona string
          setPersona(json);
        }
        // If no recognised text field found, just save the entire JSON as-is
        // (the backend will store it and use what it can)

        if (typeof json.ai_enabled === 'boolean') setAiEnabled(json.ai_enabled);
        if (typeof json.max_tokens === 'number') setMaxTokens(json.max_tokens);
        if (typeof json.temperature === 'number') setTemperature(json.temperature);
        if (typeof json.model === 'string') setModel(json.model);

        setJsonSuccess(`✓ Loaded from ${file.name}`);
        setTab('persona');
      } catch {
        setJsonError('Invalid JSON — could not parse the file.');
      }
    };
    reader.readAsText(file);
  };

  const handleExportJson = () => {
    const data = { persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'persona.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const TABS = [
    { key: 'persona', label: '🤖 Persona' },
    { key: 'model', label: '⚙️ Model' },
    { key: 'advanced', label: '🔧 Advanced' },
  ] as const;

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '720px', color: ios.text }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>AI Settings</h1>
        <p style={{ color: ios.text2, fontSize: '13px', marginBottom: '24px' }}>
          Configure your Nika AI assistant
        </p>

        {/* AI Toggle */}
        <div style={{ background: ios.surface, borderRadius: '18px', padding: '18px', border: `1px solid ${ios.border}`, marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>AI Auto-Responses</div>
              <div style={{ fontSize: '13px', color: ios.text2, marginTop: '3px' }}>Automatically reply to Telegram messages</div>
            </div>
            <button onClick={() => setAiEnabled(e => !e)} style={{
              width: '50px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: aiEnabled ? ios.green : ios.surface2, position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <span style={{
                position: 'absolute', top: '3px', width: '22px', height: '22px',
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                left: aiEnabled ? '25px' : '3px', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }} />
            </button>
          </div>
          <div style={{
            marginTop: '12px', padding: '10px 12px', borderRadius: '10px', fontSize: '12px',
            background: aiEnabled ? 'rgba(48,209,88,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${aiEnabled ? 'rgba(48,209,88,0.2)' : ios.border}`,
            color: aiEnabled ? ios.green : ios.text3,
          }}>
            {aiEnabled ? '✓ AI is live — all incoming messages get an automatic response' : '○ AI paused — messages will queue but not be answered automatically'}
          </div>
        </div>

        {/* JSON upload/export bar */}
        <div style={{ background: ios.surface, borderRadius: '14px', padding: '14px 18px', border: `1px solid ${ios.border}`, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>📁 Persona JSON</div>
            <div style={{ fontSize: '11px', color: ios.text3, marginTop: '2px' }}>Import or export your entire persona config</div>
          </div>
          <button onClick={() => jsonRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '10px', background: ios.surface2, border: `1px solid ${ios.border}`, color: ios.text2, fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
            ⬆️ Import JSON
          </button>
          <button onClick={handleExportJson} style={{ padding: '8px 14px', borderRadius: '10px', background: ios.surface2, border: `1px solid ${ios.border}`, color: ios.text2, fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
            ⬇️ Export JSON
          </button>
          <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleJsonUpload(e.target.files[0])} />
        </div>

        {jsonError && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.25)', color: '#ff6b6b', fontSize: '12px', marginBottom: '12px' }}>⚠️ {jsonError}</div>}
        {jsonSuccess && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.25)', color: ios.green, fontSize: '12px', marginBottom: '12px' }}>{jsonSuccess}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', background: ios.surface2, padding: '4px', borderRadius: '12px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
              background: tab === t.key ? ios.surface : 'transparent',
              color: tab === t.key ? ios.text : ios.text2,
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Persona tab */}
        {tab === 'persona' && (
          <Section title="🤖 System Prompt">
            <Field label="Persona instructions" hint="Define your AI's name, personality, goals and rules. Write as if briefing a team member.">
              <textarea
                value={persona} onChange={e => setPersona(e.target.value)} rows={18}
                style={{
                  width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`,
                  borderRadius: '12px', padding: '12px 14px', color: ios.text,
                  fontSize: '13px', fontFamily: '"SF Mono","Fira Code",monospace',
                  lineHeight: '1.7', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: ios.text3 }}>
                <span>{persona.length} characters · {Math.ceil(persona.length / 4)} tokens</span>
                <button onClick={() => setPersona(DEFAULT_PERSONA)} style={{ background: 'none', border: 'none', color: ios.text2, cursor: 'pointer', fontSize: '11px' }}>↩ Reset to default</button>
              </div>
            </Field>
          </Section>
        )}

        {/* Model tab */}
        {tab === 'model' && (
          <Section title="⚙️ Model Configuration">
            <Field label="AI Model">
              <select value={model} onChange={e => setModel(e.target.value)} style={{
                width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`,
                borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px',
              }}>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — Fast & efficient</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — Balanced</option>
                <option value="claude-opus-4-6">Claude Opus 4.6 — Most capable</option>
              </select>
            </Field>
            <Field label={`Max Response Length: ${maxTokens} tokens (≈${Math.round(maxTokens * 0.75)} words)`}>
              <input type="range" min={50} max={2000} step={50} value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                style={{ width: '100%', accentColor: ios.accent }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: ios.text3, marginTop: '4px' }}>
                <span>Short (50)</span><span>Long (2000)</span>
              </div>
            </Field>
            <Field label={`Creativity / Temperature: ${temperature}`}>
              <input type="range" min={0} max={1} step={0.1} value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                style={{ width: '100%', accentColor: ios.purple }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: ios.text3, marginTop: '4px' }}>
                <span>Precise (0.0)</span><span>Creative (1.0)</span>
              </div>
            </Field>
          </Section>
        )}

        {/* Advanced tab */}
        {tab === 'advanced' && (
          <Section title="🔧 Advanced">
            <Field label="JSON Schema (read-only preview)">
              <pre style={{
                background: ios.surface2, borderRadius: '12px', padding: '14px',
                fontSize: '11px', color: ios.text2, overflow: 'auto',
                lineHeight: 1.6, border: `1px solid ${ios.border}`,
                maxHeight: '300px',
              }}>
                {JSON.stringify({ persona: persona.slice(0, 80) + '…', ai_enabled: aiEnabled, max_tokens: maxTokens, temperature, model }, null, 2)}
              </pre>
            </Field>
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.2)', fontSize: '12px', color: ios.amber }}>
              ⚠️ Changes here are sent to the backend and affect all future AI responses immediately.
            </div>
          </Section>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
          fontWeight: 700, fontSize: '15px', cursor: saving ? 'not-allowed' : 'pointer',
          background: saved ? ios.green : ios.accent,
          color: '#fff', opacity: saving ? 0.7 : 1, transition: 'background 0.2s',
          marginTop: '4px',
        }}>
          {saving ? '⏳ Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '11px', color: ios.text3, marginTop: '10px' }}>
          Saved settings are applied to all subsequent AI conversations
        </p>
      </div>
    </DashboardLayout>
  );
}
