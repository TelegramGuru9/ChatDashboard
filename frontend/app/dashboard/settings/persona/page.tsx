'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Bot, ChevronLeft, Upload, Download } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

function PersonaCard({ data }: { data: Record<string, any> }) {
  // Support both new schema (identity/appearance) and legacy schema (personal)
  const id       = data.identity   || data.personal || {};
  const pers     = data.personality || {};
  const look     = data.appearance  || {};
  const texting  = data.texting_habits || {};

  const arr = (v: any) => Array.isArray(v) ? v.join(', ') : (v ? String(v) : null);
  const val = (...vs: any[]) => vs.map(v => v || null).find(v => v != null) ?? null;

  const rows = [
    { label: 'Name',         value: val(id.name, data.name, data.creator_name) },
    { label: 'Age',          value: val(id.age) },
    { label: 'Location',     value: val(id.location, id.residence) },
    { label: 'Nationality',  value: val(id.nationality) },
    { label: 'Status',       value: val(id.relationship_status) },
    { label: 'Languages',    value: arr(id.languages) },
    { label: 'Summary',      value: val(data.persona_summary) },
    { label: 'Interests',    value: Array.isArray(data.interests) ? data.interests.slice(0, 6).join(', ') : null },
    // Appearance
    { label: 'Style',        value: val(look.style) },
    { label: 'Body',         value: look.height || look.body_type ? [look.height, look.body_type].filter(Boolean).join(' · ') : null },
    { label: 'Hair / Eyes',  value: look.hair_color || look.eye_color ? [look.hair_color, look.eye_color].filter(Boolean).join(' / ') : null },
    { label: 'Features',     value: arr(look.features) },
    { label: 'Outfits',      value: Array.isArray(look.typical_outfits) ? look.typical_outfits.slice(0, 3).join(', ') : null },
    // Personality
    { label: 'Traits',       value: Array.isArray(pers.traits) ? pers.traits.slice(0, 5).join(', ') : arr(pers.traits) },
    { label: 'Tone',         value: val(pers.communication_style, data.tone) },
    { label: 'Private side', value: val(pers.private_side) },
    { label: 'Likes',        value: arr(pers.likes) },
    { label: 'Boundaries',   value: arr(pers.boundaries) || (data.boundaries ? arr(data.boundaries) : null) },
    // Texting / bot
    { label: 'Chat style',   value: val(texting.typical_message_length, data.chat_style) },
  ].filter(r => r.value);

  // Group sections for cleaner display
  const sections = [
    { title: 'Identity',     keys: ['Name','Age','Location','Nationality','Status','Languages','Summary','Interests'] },
    { title: 'Appearance',   keys: ['Style','Body','Hair / Eyes','Features','Outfits'] },
    { title: 'Personality',  keys: ['Traits','Tone','Private side','Likes','Boundaries'] },
    { title: 'Chat Behaviour', keys: ['Chat style'] },
  ];

  const rowMap = Object.fromEntries(rows.map(r => [r.label, r.value]));

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-purple-500/15 flex items-center gap-2">
        <Bot className="h-4 w-4 text-purple-400" />
        <span className="font-semibold text-sm text-purple-400">Persona Overview</span>
        <span className="ml-auto text-xs text-muted-foreground">What the LLM knows about this creator</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-6 text-xs text-muted-foreground text-center">
          Upload a persona JSON to see the overview
        </div>
      ) : (
        sections.map(sec => {
          const secRows = sec.keys.filter(k => rowMap[k]);
          if (secRows.length === 0) return null;
          return (
            <div key={sec.title}>
              <div className="px-4 py-1.5 bg-purple-500/10 border-y border-purple-500/10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400/70">{sec.title}</span>
              </div>
              <div className="divide-y divide-border/30">
                {secRows.map(label => (
                  <div key={label} className="flex gap-4 px-4 py-2">
                    <span className="text-xs text-muted-foreground w-24 flex-shrink-0 mt-0.5">{label}</span>
                    <span className="text-xs text-foreground leading-relaxed">{String(rowMap[label])}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function PersonaPage() {
  const { withCreator } = useCreator();
  const api = getApi();
  const fileRef = useRef<HTMLInputElement>(null);

  const [personaText, setPersonaText] = useState('');
  const [parsedPersona, setParsedPersona] = useState<Record<string, any> | null>(null);
  const [parseError, setParseError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(withCreator(`${api}/ai/persona`))
      .then(r => r.json())
      .then(d => {
        if (d && typeof d === 'object' && Object.keys(d).length > 0) {
          const text = JSON.stringify(d, null, 2);
          setPersonaText(text);
          setParsedPersona(d);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [api, withCreator]);

  const handleTextChange = (text: string) => {
    setPersonaText(text);
    setParseError('');
    try {
      const parsed = JSON.parse(text);
      setParsedPersona(parsed);
    } catch {
      setParsedPersona(null);
    }
  };

  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      try {
        let parsed: any;
        if (file.name.endsWith('.json')) {
          parsed = JSON.parse(text);
        } else {
          // Try to extract JSON from markdown/text
          const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          else parsed = { persona: text };
        }
        setPersonaText(JSON.stringify(parsed, null, 2));
        setParsedPersona(parsed);
        setParseError('');
      } catch (err) {
        setParseError(`Parse error: ${err}`);
      }
    };
    reader.readAsText(file);
  };

  const save = async () => {
    if (!personaText.trim()) return;
    setSaving(true);
    try {
      let payload: any;
      try { payload = JSON.parse(personaText); } catch { payload = { persona: personaText }; }
      await fetch(withCreator(`${api}/ai/persona`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const exportJson = () => {
    const blob = new Blob([personaText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'persona.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Persona</h1>
            <p className="text-xs text-muted-foreground">The LLM's source of truth — upload creator JSON to set identity</p>
          </div>
        </div>

        {/* Persona overview card */}
        <PersonaCard data={parsedPersona || {}} />

        {/* Import / Export */}
        <div className="flex gap-2">
          <label className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground cursor-pointer hover:bg-accent transition-colors">
            <Upload className="h-3.5 w-3.5" /> Import JSON / MD
            <input ref={fileRef} type="file" accept=".json,.md,.txt" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <button onClick={exportJson} disabled={!personaText}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Export JSON
          </button>
        </div>

        {parseError && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{parseError}</div>
        )}

        {/* JSON Editor */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">Persona JSON</div>
              <div className="text-xs text-muted-foreground mt-0.5">Edit directly or import a file above</div>
            </div>
            {parsedPersona && <span className="text-xs text-green-400 font-medium">✓ Valid JSON</span>}
          </div>
          <div className="p-4">
            <textarea
              value={personaText}
              onChange={e => handleTextChange(e.target.value)}
              rows={24}
              placeholder={'{\n  "identity": {\n    "name": "Nika White",\n    "age": 28,\n    "nationality": "German",\n    "location": "Cologne, Germany",\n    "relationship_status": "single"\n  },\n  "persona_summary": "...",\n  "personality": {\n    "traits": ["confident", "teasing", "playful"],\n    "boundaries": ["selective", "never cheap"]\n  },\n  "bot_general_prompt": "...",\n  "bot_message_style": "..."\n}'}
              className={cn(inputCls, 'resize-y font-mono text-xs leading-relaxed')}
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving || loading || !personaText.trim()}
          className={cn(
            'w-full py-3 rounded-xl text-sm font-semibold transition-colors',
            saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {saved ? '✓ Persona Saved' : saving ? 'Saving…' : 'Save Persona'}
        </button>

      </div>
    </DashboardLayout>
  );
}
