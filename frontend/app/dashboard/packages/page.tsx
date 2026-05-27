'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const p = {
  bg:'#000',s1:'#1c1c1e',s2:'#2c2c2e',s3:'#3a3a3c',
  sep:'rgba(84,84,88,0.5)',
  label:'#fff',label2:'rgba(235,235,245,0.6)',label3:'rgba(235,235,245,0.3)',
  blue:'#0a84ff',green:'#30d158',red:'#ff453a',orange:'#ff9f0a',yellow:'#ffd60a',purple:'#bf5af2',
};

interface Package {
  id: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  keywords: string[];        // trigger keywords for AI
  welcome_message: string;   // message AI sends when pkg is triggered
  media_files: string[];     // file names from media library
  highlighted: boolean;
  active: boolean;
}

const DEMO: Package[] = [
  {
    id: '1', name: 'Starter', tagline: 'Get started today',
    price: '49', currency: '€', period: 'month',
    description: 'Perfect for creators just getting started',
    features: ['10 AI messages/day', 'Basic analytics', 'Email support'],
    keywords: ['starter', 'cheap', 'basic', 'start', 'beginning'],
    welcome_message: 'Great choice! 🌟 Our Starter package is perfect for getting started. For just €49/month you get everything you need. Want me to send you more details?',
    media_files: [],
    highlighted: false, active: true,
  },
  {
    id: '2', name: 'Creator Pro', tagline: 'Everything for growing creators',
    price: '149', currency: '€', period: 'month',
    description: 'Full AI automation for serious creators',
    features: ['Unlimited AI messages', '3 accounts', 'Media auto-send', 'Auto-reply rules', 'Priority support'],
    keywords: ['pro', 'professional', 'full', 'unlimited', 'best', 'creator'],
    welcome_message: 'Our Creator Pro package is our most popular! 🚀 For €149/month you get unlimited AI conversations, media auto-sending, and everything a serious creator needs. Ready to level up?',
    media_files: ['brochure.pdf'],
    highlighted: true, active: true,
  },
];

const CURRENCIES = ['€','$','£','₺','CHF','AED'];
const PERIODS = ['month','year','week','one-time'];

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '8px', background: p.s3, fontSize: '12px', color: p.label2 }}>
      {label}
      {onRemove && <button onClick={onRemove} style={{ background: 'none', border: 'none', color: p.label3, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>×</button>}
    </span>
  );
}

function Input({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: p.s2, border: `1px solid ${p.sep}`, borderRadius: '10px', padding: '9px 12px', color: p.label, fontSize: '13px', ...style }} />
  );
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>(DEMO);
  const [editing, setEditing] = useState<Package | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [featureInput, setFeatureInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const jsonRef = useRef<HTMLInputElement>(null);
  const [jsonMsg, setJsonMsg] = useState('');

  const apiBase = (() => {
    const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
  })();

  // Load from backend on mount
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/config/packages`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.value) && data.value.length > 0) setPackages(data.value);
      }
    } catch (_) {}
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const saveToBackend = async (pkgs: Package[]) => {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/config/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkgs),
      });
      setSaveMsg(res.ok ? '✓ Saved to backend' : '⚠ Save failed');
    } catch { setSaveMsg('⚠ Could not reach backend'); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(''), 3000); }
  };

  const blank = (): Package => ({
    id: Date.now().toString(), name: '', tagline: '', price: '', currency: '€', period: 'month',
    description: '', features: [], keywords: [], welcome_message: '', media_files: [], highlighted: false, active: true,
  });

  const savePackage = (pkg: Package) => {
    const updated = (() => {
      const idx = packages.findIndex(p => p.id === pkg.id);
      if (idx >= 0) { const n = [...packages]; n[idx] = pkg; return n; }
      return [...packages, pkg];
    })();
    setPackages(updated);
    setEditing(null);
    setFeatureInput(''); setKeywordInput('');
    saveToBackend(updated);
  };

  const remove = (id: string) => {
    const updated = packages.filter(pk => pk.id !== id);
    setPackages(updated);
    saveToBackend(updated);
  };

  const toggle = (id: string) => {
    const updated = packages.map(pk => pk.id === id ? { ...pk, active: !pk.active } : pk);
    setPackages(updated);
    saveToBackend(updated);
  };

  const highlight = (id: string) => {
    const updated = packages.map(pk => ({ ...pk, highlighted: pk.id === id }));
    setPackages(updated);
    saveToBackend(updated);
  };

  // JSON import — MERGES, doesn't overwrite
  const importJson = (file: File) => {
    setJsonMsg('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const incoming: Package[] = Array.isArray(json) ? json : json.packages || [];
        if (!incoming.length) { setJsonMsg('⚠ No packages found in JSON'); return; }
        // Merge: incoming wins on id match, others are appended
        const merged = [...packages];
        for (const pkg of incoming) {
          const idx = merged.findIndex(m => m.id === pkg.id || m.name === pkg.name);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...pkg };
          else merged.push({ ...blank(), ...pkg, id: pkg.id || Date.now().toString() });
        }
        setPackages(merged);
        setJsonMsg(`✓ Merged ${incoming.length} package(s) — ${merged.length} total`);
        saveToBackend(merged);
      } catch { setJsonMsg('⚠ Invalid JSON'); }
    };
    reader.readAsText(file);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(packages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'packages.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const E = editing;

  const addTag = (field: 'features' | 'keywords', val: string, set: (v: string) => void) => {
    if (!val.trim() || !E) return;
    setEditing({ ...E, [field]: [...E[field], val.trim()] });
    set('');
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '960px', color: p.label }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Creator Packages</h1>
            <p style={{ color: p.label2, fontSize: '13px', marginTop: '4px' }}>
              Define your offers — the AI uses keyword triggers to automatically pitch the right package
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => jsonRef.current?.click()} style={{ padding: '8px 14px', borderRadius: '10px', background: p.s2, border: `1px solid ${p.sep}`, color: p.label2, fontSize: '13px', cursor: 'pointer' }}>⬆ Import JSON</button>
            <button onClick={exportJson} style={{ padding: '8px 14px', borderRadius: '10px', background: p.s2, border: `1px solid ${p.sep}`, color: p.label2, fontSize: '13px', cursor: 'pointer' }}>⬇ Export JSON</button>
            <button onClick={() => setEditing(blank())} style={{ padding: '8px 16px', borderRadius: '10px', background: p.blue, border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>＋ New Package</button>
          </div>
        </div>

        <input ref={jsonRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importJson(e.target.files[0])} />

        {/* Messages */}
        {jsonMsg && <div style={{ padding: '10px 14px', borderRadius: '10px', background: jsonMsg.startsWith('✓') ? 'rgba(48,209,88,0.08)' : 'rgba(255,149,10,0.08)', border: `1px solid ${jsonMsg.startsWith('✓') ? 'rgba(48,209,88,0.2)' : 'rgba(255,149,10,0.2)'}`, color: jsonMsg.startsWith('✓') ? p.green : p.orange, fontSize: '13px', marginBottom: '14px' }}>{jsonMsg}</div>}
        {saveMsg && <div style={{ padding: '8px 14px', borderRadius: '10px', background: saveMsg.startsWith('✓') ? 'rgba(48,209,88,0.08)' : 'rgba(255,149,10,0.08)', fontSize: '12px', color: saveMsg.startsWith('✓') ? p.green : p.orange, marginBottom: '14px' }}>{saveMsg}</div>}

        {/* How AI uses these */}
        <div style={{ background: p.s1, borderRadius: '14px', padding: '14px 16px', border: `1px solid ${p.sep}`, marginBottom: '20px', fontSize: '13px', color: p.label2, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '20px', lineHeight: 1.4 }}>💡</span>
          <div>
            <strong style={{ color: p.label }}>How it works: </strong>
            When a user mentions a keyword from any package (e.g. "pro", "price", "how much"), the AI automatically presents that package using the welcome message you write here. Add media files to auto-attach them to the pitch.
          </div>
        </div>

        {/* Package cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {packages.map(pkg => (
            <div key={pkg.id} style={{ background: p.s1, borderRadius: '16px', border: `1px solid ${pkg.highlighted ? p.blue : p.sep}`, overflow: 'hidden', opacity: pkg.active ? 1 : 0.5 }}>
              {pkg.highlighted && (
                <div style={{ background: p.blue, textAlign: 'center', padding: '5px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: '#fff' }}>⭐ FEATURED</div>
              )}
              <div style={{ padding: '18px' }}>
                {/* Title row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '17px' }}>{pkg.name || '—'}</div>
                    <div style={{ fontSize: '12px', color: p.label3 }}>{pkg.tagline}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* active toggle */}
                    <button onClick={() => toggle(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: pkg.active ? p.green : p.label3 }} title="Toggle active">●</button>
                    <button onClick={() => highlight(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: pkg.highlighted ? p.yellow : p.label3 }} title="Feature">⭐</button>
                    <button onClick={() => { setEditing(pkg); setFeatureInput(''); setKeywordInput(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: p.blue }} title="Edit">✎</button>
                    <button onClick={() => remove(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: p.red }} title="Delete">✕</button>
                  </div>
                </div>

                {/* Price */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '10px 0' }}>
                  <span style={{ fontSize: '30px', fontWeight: 700, color: pkg.highlighted ? p.blue : p.label }}>{pkg.currency}{pkg.price || '—'}</span>
                  <span style={{ fontSize: '13px', color: p.label3 }}>/{pkg.period}</span>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                  {pkg.features.slice(0, 4).map((f, i) => (
                    <div key={i} style={{ fontSize: '13px', color: p.label2, display: 'flex', gap: '7px' }}>
                      <span style={{ color: p.green, flexShrink: 0 }}>✓</span>{f}
                    </div>
                  ))}
                  {pkg.features.length > 4 && <div style={{ fontSize: '12px', color: p.label3 }}>+{pkg.features.length - 4} more</div>}
                </div>

                {/* Keywords */}
                {pkg.keywords.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                    {pkg.keywords.slice(0, 5).map(k => <span key={k} style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '7px', background: 'rgba(10,132,255,0.12)', color: p.blue }}>{k}</span>)}
                    {pkg.keywords.length > 5 && <span style={{ fontSize: '11px', color: p.label3 }}>+{pkg.keywords.length - 5}</span>}
                  </div>
                )}

                {/* Media files */}
                {pkg.media_files.length > 0 && (
                  <div style={{ fontSize: '12px', color: p.label3, display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    📎 {pkg.media_files.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add card */}
          <div onClick={() => setEditing(blank())} style={{ background: 'transparent', borderRadius: '16px', border: `2px dashed ${p.sep}`, minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexDirection: 'column', gap: '8px', color: p.label3, transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = p.blue)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = p.sep)}
          >
            <span style={{ fontSize: '28px' }}>＋</span>
            <span style={{ fontSize: '13px' }}>New Package</span>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {E && (
        <>
          <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 500, width: 'min(580px,94vw)', maxHeight: '90vh', overflowY: 'auto',
            background: p.s1, borderRadius: '20px', padding: '24px', border: `1px solid ${p.sep}`,
          }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '18px' }}>
              {packages.find(pk => pk.id === E.id) ? 'Edit Package' : 'New Package'}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[['Name', 'name'], ['Tagline', 'tagline']].map(([label, key]) => (
                <div key={key}>
                  <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <Input value={(E as any)[key]} onChange={v => setEditing({ ...E, [key]: v })} placeholder={label} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
              <Input value={E.description} onChange={v => setEditing({ ...E, description: v })} placeholder="Short description" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              {[['Currency', 'currency', CURRENCIES], ['Period', 'period', PERIODS]].map(([label, key, opts]) => (
                <div key={key as string}>
                  <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label as string}</div>
                  <select value={(E as any)[key as string]} onChange={ev => setEditing({ ...E, [key as string]: ev.target.value })}
                    style={{ width: '100%', background: p.s2, border: `1px solid ${p.sep}`, borderRadius: '10px', padding: '9px 10px', color: p.label, fontSize: '13px' }}>
                    {(opts as string[]).map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price</div>
                <Input value={E.price} onChange={v => setEditing({ ...E, price: v })} placeholder="99" />
              </div>
            </div>

            {/* Features */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Features</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag('features', featureInput, setFeatureInput); }}
                  placeholder="Add feature (Enter to add)"
                  style={{ flex: 1, background: p.s2, border: `1px solid ${p.sep}`, borderRadius: '10px', padding: '8px 12px', color: p.label, fontSize: '13px' }} />
                <button onClick={() => addTag('features', featureInput, setFeatureInput)} style={{ padding: '8px 12px', borderRadius: '10px', background: p.blue, border: 'none', color: '#fff', cursor: 'pointer' }}>＋</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {E.features.map((f, i) => <Tag key={i} label={f} onRemove={() => setEditing({ ...E, features: E.features.filter((_, j) => j !== i) })} />)}
              </div>
            </div>

            {/* Keywords */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trigger Keywords (AI uses these to auto-pitch)</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTag('keywords', keywordInput, setKeywordInput); }}
                  placeholder="e.g. price, how much, pro (Enter to add)"
                  style={{ flex: 1, background: p.s2, border: `1px solid ${p.sep}`, borderRadius: '10px', padding: '8px 12px', color: p.label, fontSize: '13px' }} />
                <button onClick={() => addTag('keywords', keywordInput, setKeywordInput)} style={{ padding: '8px 12px', borderRadius: '10px', background: p.blue, border: 'none', color: '#fff', cursor: 'pointer' }}>＋</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {E.keywords.map((k, i) => <Tag key={i} label={k} onRemove={() => setEditing({ ...E, keywords: E.keywords.filter((_, j) => j !== i) })} />)}
              </div>
            </div>

            {/* Welcome message */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Welcome Message (auto-sent when triggered)</div>
              <textarea value={E.welcome_message} onChange={e => setEditing({ ...E, welcome_message: e.target.value })}
                rows={4} placeholder="The message the AI sends when this package is triggered by a keyword…"
                style={{ width: '100%', background: p.s2, border: `1px solid ${p.sep}`, borderRadius: '10px', padding: '9px 12px', color: p.label, fontSize: '13px', resize: 'vertical' }} />
            </div>

            {/* Media files */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: p.label3, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Media Files to Auto-Send (names from Media Library)</div>
              <Input value={E.media_files.join(', ')} onChange={v => setEditing({ ...E, media_files: v.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="brochure.pdf, product-photo.jpg" />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '10px 18px', borderRadius: '12px', background: p.s2, border: 'none', color: p.label2, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={() => savePackage(E)} style={{ padding: '10px 22px', borderRadius: '12px', background: p.blue, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>Save Package</button>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
