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

export default function SettingsPage() {
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // In a real app, this would save to the backend
    await new Promise(r => setTimeout(r, 800));
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">AI Persona Settings</h1>
        <p className="text-slate-400 text-sm mb-8">Configure how your AI assistant behaves in Telegram conversations</p>

        {/* AI Toggle */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-100">AI Auto-Responses</div>
              <div className="text-sm text-slate-400 mt-0.5">Automatically reply to incoming messages with AI</div>
            </div>
            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${aiEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Persona */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4">
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            🤖 AI Persona / System Prompt
          </label>
          <p className="text-xs text-slate-500 mb-3">
            This defines your AI assistant's personality, tone, and goals. Write it like instructions to a person.
          </p>
          <textarea
            value={persona}
            onChange={e => setPersona(e.target.value)}
            rows={14}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 text-sm font-mono leading-relaxed focus:outline-none focus:border-blue-500 resize-y"
            placeholder="Write your AI persona here…"
          />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-slate-600">{persona.length} characters</span>
            <button onClick={() => setPersona(DEFAULT_PERSONA)} className="text-xs text-slate-500 hover:text-slate-300">
              Reset to default
            </button>
          </div>
        </div>

        {/* Model Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="font-semibold text-slate-200 mb-4">⚙️ Model Settings</div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs text-slate-400 block mb-2">Max Response Length (tokens)</label>
              <input type="number" min={50} max={2000} value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
              <div className="text-xs text-slate-600 mt-1">~{Math.round(maxTokens * 0.75)} words</div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2">
                Creativity (temperature): <span className="text-blue-400">{temperature}</span>
              </label>
              <input type="range" min={0} max={1} step={0.1} value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-1">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
          } disabled:opacity-60`}
        >
          {saving ? '⏳ Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
        </button>

        <p className="text-xs text-slate-600 text-center mt-3">
          Note: Persona is sent as a system prompt with every AI message. Changes take effect immediately.
        </p>
      </div>
    </DashboardLayout>
  );
}
