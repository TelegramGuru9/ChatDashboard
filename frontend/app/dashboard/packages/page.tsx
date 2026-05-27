'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ios = {
  surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

interface Package {
  id: string;
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
  active: boolean;
}

const DEMO: Package[] = [
  { id: '1', name: 'Starter', price: '49', currency: '€', period: 'month', description: 'Perfect for individuals just getting started', features: ['5 AI conversations/day', '1 Telegram account', 'Basic analytics', 'Email support'], highlighted: false, active: true },
  { id: '2', name: 'Pro', price: '149', currency: '€', period: 'month', description: 'Everything you need to grow your business', features: ['Unlimited conversations', '3 Telegram accounts', 'Full analytics dashboard', 'Media library', 'Priority support', 'Auto-reply rules'], highlighted: true, active: true },
  { id: '3', name: 'Enterprise', price: '499', currency: '€', period: 'month', description: 'For teams and agencies at scale', features: ['Everything in Pro', 'Unlimited accounts', 'Custom AI persona', 'API access', 'Dedicated account manager', 'SLA guarantee'], highlighted: false, active: true },
];

const CURRENCIES = ['€', '$', '£', '₺', 'CHF'];
const PERIODS = ['month', 'year', 'one-time'];

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>(DEMO);
  const [editing, setEditing] = useState<Package | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [featureInput, setFeatureInput] = useState('');

  const blank = (): Package => ({
    id: Date.now().toString(), name: '', price: '', currency: '€', period: 'month',
    description: '', features: [], highlighted: false, active: true,
  });

  const save = (pkg: Package) => {
    setPackages(prev => {
      const idx = prev.findIndex(p => p.id === pkg.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = pkg; return n; }
      return [...prev, pkg];
    });
    setEditing(null); setShowForm(false); setFeatureInput('');
  };

  const remove = (id: string) => setPackages(prev => prev.filter(p => p.id !== id));
  const toggleActive = (id: string) => setPackages(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  const highlight = (id: string) => setPackages(prev => prev.map(p => ({ ...p, highlighted: p.id === id })));

  const E = editing;

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '960px', color: ios.text }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Packages & Pricing</h1>
            <p style={{ color: ios.text2, fontSize: '13px', marginTop: '4px' }}>
              Define your offers — the AI will reference these when leads ask about pricing
            </p>
          </div>
          <button onClick={() => { setEditing(blank()); setShowForm(true); setFeatureInput(''); }} style={{
            padding: '10px 18px', borderRadius: '12px', background: ios.accent,
            border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>＋ New Package</button>
        </div>

        {/* Package cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: '14px', marginBottom: '28px' }}>
          {packages.map(pkg => (
            <div key={pkg.id} style={{
              background: ios.surface, borderRadius: '18px', overflow: 'hidden',
              border: `1px solid ${pkg.highlighted ? ios.accent : ios.border}`,
              opacity: pkg.active ? 1 : 0.5,
              position: 'relative',
            }}>
              {pkg.highlighted && (
                <div style={{ background: ios.accent, textAlign: 'center', padding: '5px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>
                  ⭐ MOST POPULAR
                </div>
              )}
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '18px' }}>{pkg.name}</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => toggleActive(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: pkg.active ? ios.green : ios.text3 }} title={pkg.active ? 'Deactivate' : 'Activate'}>
                      {pkg.active ? '✓' : '○'}
                    </button>
                    <button onClick={() => highlight(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: pkg.highlighted ? ios.amber : ios.text3 }} title="Set as featured">⭐</button>
                    <button onClick={() => { setEditing(pkg); setShowForm(true); setFeatureInput(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: ios.accent }}>✎</button>
                    <button onClick={() => remove(pkg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: ios.red }}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, color: pkg.highlighted ? ios.accent : ios.text }}>{pkg.currency}{pkg.price}</span>
                  <span style={{ fontSize: '13px', color: ios.text3 }}>/{pkg.period}</span>
                </div>
                <p style={{ fontSize: '13px', color: ios.text2, marginBottom: '14px', lineHeight: 1.5 }}>{pkg.description}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pkg.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: ios.text2 }}>
                      <span style={{ color: ios.green, flexShrink: 0, marginTop: '1px' }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI integration note */}
        <div style={{ padding: '16px', borderRadius: '14px', background: ios.surface, border: `1px solid ${ios.border}`, fontSize: '13px', color: ios.text2 }}>
          💡 <strong style={{ color: ios.text }}>How it works:</strong> Your AI persona automatically references these packages when leads ask about pricing or features. Make sure your AI persona prompt mentions "refer to our packages" or similar.
        </div>

        {/* Edit / Create modal */}
        {showForm && E && (
          <>
            <div onClick={() => { setShowForm(false); setEditing(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, backdropFilter: 'blur(8px)' }} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              zIndex: 500, width: 'min(520px, 90vw)', maxHeight: '85vh', overflowY: 'auto',
              background: ios.surface, borderRadius: '22px', padding: '28px',
              border: `1px solid ${ios.border}`,
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
                {packages.find(p => p.id === E.id) ? 'Edit Package' : 'New Package'}
              </h2>

              {[
                { label: 'Package Name', key: 'name', type: 'text', placeholder: 'e.g. Pro' },
                { label: 'Description', key: 'description', type: 'text', placeholder: 'Short tagline' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>{f.label}</label>
                  <input value={(E as any)[f.key]} onChange={ev => setEditing({ ...E, [f.key]: ev.target.value })}
                    placeholder={f.placeholder}
                    style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px' }} />
                </div>
              ))}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>Currency</label>
                  <select value={E.currency} onChange={ev => setEditing({ ...E, currency: ev.target.value })}
                    style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px', color: ios.text, fontSize: '14px' }}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>Price</label>
                  <input value={E.price} onChange={ev => setEditing({ ...E, price: ev.target.value })} placeholder="99"
                    style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px 12px', color: ios.text, fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>Period</label>
                  <select value={E.period} onChange={ev => setEditing({ ...E, period: ev.target.value })}
                    style={{ width: '100%', background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '10px', color: ios.text, fontSize: '14px' }}>
                    {PERIODS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Features */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: ios.text2, display: 'block', marginBottom: '6px' }}>Features</label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    value={featureInput} onChange={ev => setFeatureInput(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Enter' && featureInput.trim()) { setEditing({ ...E, features: [...E.features, featureInput.trim()] }); setFeatureInput(''); }}}
                    placeholder="Type feature and press Enter"
                    style={{ flex: 1, background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '10px', padding: '8px 12px', color: ios.text, fontSize: '13px' }}
                  />
                  <button onClick={() => { if (featureInput.trim()) { setEditing({ ...E, features: [...E.features, featureInput.trim()] }); setFeatureInput(''); }}}
                    style={{ padding: '8px 12px', borderRadius: '10px', background: ios.accent, border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px' }}>＋</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {E.features.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', background: ios.surface2 }}>
                      <span style={{ color: ios.green, fontSize: '13px' }}>✓</span>
                      <span style={{ flex: 1, fontSize: '13px', color: ios.text }}>{f}</span>
                      <button onClick={() => setEditing({ ...E, features: E.features.filter((_, j) => j !== i) })}
                        style={{ background: 'none', border: 'none', color: ios.red, cursor: 'pointer', fontSize: '14px' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '10px 20px', borderRadius: '12px', background: ios.surface2, border: 'none', color: ios.text2, cursor: 'pointer', fontSize: '14px' }}>
                  Cancel
                </button>
                <button onClick={() => save(E)} style={{ padding: '10px 24px', borderRadius: '12px', background: ios.accent, border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                  Save Package
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
