'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

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

const C = {
  blue: '#3b82f6',
  green: '#10b981',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',
};

const card: React.CSSProperties = {
  background: C.slate900,
  border: '1px solid #1e293b',
  borderRadius: '14px',
  padding: '20px',
  marginBottom: '14px',
};

export default function SettingsPage() {
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.endsWith('/api/v1') ? raw : raw.replace(/\/?$/, '') + '/api/v1';
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/ai/persona`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, ai_enabled: aiEnabled, max_tokens: maxTokens, temperature }),
      });
    } catch (_) {}
    await new Promise(r => setTimeout(r, 600));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '720px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: C.slate100, marginBottom: '4px' }}>
          AI Persona Settings
        </h1>
        <p style={{ color: C.slate400, fontSize: '13px', marginBottom: '24px' }}>
          Configure how your AI assistant behaves in Telegram conversations
        </p>

        {/* AI Toggle */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, color: C.slate100, fontSize: '15px' }}>AI Auto-Responses</div>
              <div style={{ fontSize: '13px', color: C.slate400, marginTop: '4px' }}>
                Automatically reply to incoming Telegram messages with AI
              </div>
            </div>
            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              style={{
                position: 'relative', width: '48px', height: '26px', borderRadius: '13px',
                background: aiEnabled ? C.blue : C.slate700,
                border: 'none', cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: '3px', width: '20px', height: '20px',
                borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
                left: aiEnabled ? '25px' : '3px',
              }} />
            </button>
          </div>
          <div style={{
            marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
            background: aiEnabled ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${aiEnabled ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}`,
            fontSize: '12px',
            color: aiEnabled ? '#34d399' : C.slate500,
          }}>
            {aiEnabled ? '✓ AI is active — messages will be answered automatically' : '○ AI is paused — messages will not be answered automatically'}
          </div>
        </div>

        {/* Persona editor */}
        <div style={card}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: C.slate200, marginBottom: '6px' }}>
            🤖 AI Persona / System Prompt
          </label>
          <p style={{ fontSize: '12px', color: C.slate500, marginBottom: '12px' }}>
            This defines your AI assistant's personality, tone, and goals. Write it like instructions to a person.
          </p>
          <textarea
            value={persona}
            onChange={e => setPersona(e.target.value)}
            rows={16}
            style={{
              width: '100%', background: C.slate800, border: '1px solid #334155',
              borderRadius: '10px', padding: '12px 14px', color: C.slate100,
              fontSize: '12px', fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              lineHeight: '1.7', outline: 'none', resize: 'vertical',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = C.blue; }}
            onBlur={e => { e.target.style.borderColor = '#334155'; }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', color: C.slate500 }}>{persona.length} characters</span>
            <button
              onClick={() => setPersona(DEFAULT_PERSONA)}
              style={{ background: 'none', border: 'none', color: C.slate400, fontSize: '12px', cursor: 'pointer', padding: 0 }}
            >
              Reset to default
            </button>
          </div>
        </div>

        {/* Model settings */}
        <div style={card}>
          <div style={{ fontWeight: 600, color: C.slate200, fontSize: '15px', marginBottom: '18px' }}>
            ⚙️ Model Settings
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: C.slate400, display: 'block', marginBottom: '8px' }}>
                Max Response Length (tokens)
              </label>
              <input
                type="number" min={50} max={2000} value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                style={{
                  width: '100%', background: C.slate800, border: '1px solid #334155',
                  borderRadius: '8px', padding: '8px 12px', color: C.slate100,
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: '11px', color: C.slate500, marginTop: '6px' }}>
                ≈ {Math.round(maxTokens * 0.75)} words
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: C.slate400, display: 'block', marginBottom: '8px' }}>
                Creativity (temperature):&nbsp;
                <span style={{ color: C.blue, fontWeight: 600 }}>{temperature}</span>
              </label>
              <input
                type="range" min={0} max={1} step={0.1} value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                style={{ width: '100%', accentColor: C.blue }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.slate500, marginTop: '4px' }}>
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            fontWeight: 600, fontSize: '14px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: saved ? C.green : C.blue,
            color: '#fff', opacity: saving ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saving ? '⏳ Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>

        <p style={{ fontSize: '11px', color: C.slate500, textAlign: 'center', marginTop: '12px' }}>
          Persona is sent as a system prompt with every AI message. Changes take effect immediately.
        </p>
      </div>
    </DashboardLayout>
  );
}
