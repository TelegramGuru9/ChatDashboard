'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2',
};

interface Package {
  id: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string;
  keywords: string;
  welcome_message: string;
  send_after_messages: number;
  active: boolean;
}

const BLANK: Package = {
  id: '', name: '', tagline: '', price: '', currency: 'USD', period: 'one-time',
  description: '', features: '', keywords: '', welcome_message: '',
  send_after_messages: 0, active: true,
};

const PERIODS = ['one-time', 'monthly', 'yearly'];

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editing, setEditing] = useState<Package | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [importError, setImportError] = useState('');

  const load = useCallback(async () => {
    const api = getApi();
    try {
      const res = await fetch(`${api}/config/packages`);
      const d = await res.json();
      const val = d.value;
      setPackages(Array.isArray(val) ? val : (Array.isArray(val?.packages) ? val.packages : []));
    } catch { setPackages([]); }
    finally { setLoading(false); }
  }, []);

  const persist = async (updated: Package[]) => {
    const api = getApi();
    setSaving(true);
    try {
      await fetch(`${api}/config/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setPackages(updated);
      setStatus('✓ Saved');
      setTimeout(() => setStatus(''), 2500);
    } catch { setStatus('⚠ Save failed'); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const openNew = () => setEditing({ ...BLANK, id: `pkg-${Date.now()}` });
  const openEdit = (p: Package) => setEditing({ ...p });

  const confirmEdit = () => {
    if (!editing || !editing.name.trim()) return;
    const updated = packages.some(p => p.id === editing.id)
      ? packages.map(p => p.id === editing.id ? editing : p)
      : [...packages, editing];
    persist(updated);
    setEditing(null);
  };

  const deletePackage = (id: string) => {
    if (!confirm('Delete this package?')) return;
    persist(packages.filter(p => p.id !== id));
  };

  const toggleActive = (id: string) => {
    persist(packages.map(p => p.id === id ? { ...p, active: !p.active } : p));
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const incoming: Package[] = Array.isArray(json) ? json : (Array.isArray(json.packages) ? json.packages : []);
        if (!incoming.length) { setImportError('No packages found in JSON'); return; }
        const map = new Map(packages.map(p => [p.id, p]));
        incoming.forEach(pkg => {
          const existing = packages.find(p => p.id === pkg.id || p.name === pkg.name);
          if (existing) {
            map.set(existing.id, { ...existing, ...pkg, id: existing.id });
          } else {
            const newId = pkg.id || `pkg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            map.set(newId, { ...BLANK, ...pkg, id: newId });
          }
        });
        persist(Array.from(map.values()));
      } catch { setImportError('Invalid JSON file'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(packages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'packages.json'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'920px', color: C.t1 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Packages</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Creator offers the AI auto-pitches via Telegram</p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <label style={{ padding:'9px 14px', borderRadius:'11px', background: C.s2, border:`1px solid ${C.sep}`, color: C.t2, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              ⬆ Import JSON
              <input type="file" accept=".json" style={{ display:'none' }} onChange={handleJsonImport} />
            </label>
            <button onClick={exportJson} style={{ padding:'9px 14px', borderRadius:'11px', background: C.s2, border:`1px solid ${C.sep}`, color: C.t2, fontSize:'13px', fontWeight:600, cursor:'pointer' }}>⬇ Export</button>
            <button onClick={openNew} style={{ padding:'9px 18px', borderRadius:'11px', background: C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>+ New Package</button>
          </div>
        </div>

        {importError && <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', background:'rgba(255,69,58,0.1)', color: C.red, fontSize:'13px', border:'1px solid rgba(255,69,58,0.2)' }}>⚠ {importError}</div>}
        {status && <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', background:'rgba(48,209,88,0.08)', color: C.green, fontSize:'13px', border:'1px solid rgba(48,209,88,0.2)' }}>{status}</div>}

        {loading ? (
          <div style={{ textAlign:'center', padding:'80px', color: C.t3 }}>Loading…</div>
        ) : packages.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px', color: C.t3 }}>
            <div style={{ fontSize:'48px', marginBottom:'14px' }}>📦</div>
            <div style={{ fontSize:'15px', fontWeight:600, color: C.t2, marginBottom:'8px' }}>No packages yet</div>
            <div style={{ fontSize:'13px', marginBottom:'20px' }}>Create your first package — the AI will pitch it automatically based on keywords or message count.</div>
            <button onClick={openNew} style={{ padding:'11px 24px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>+ Create Package</button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {packages.map(pkg => (
              <div key={pkg.id} style={{ background: C.s1, borderRadius:'16px', border:`1px solid ${pkg.active ? C.sep : 'rgba(255,255,255,0.04)'}`, padding:'18px 20px', display:'flex', gap:'16px', alignItems:'flex-start', opacity: pkg.active ? 1 : 0.55 }}>
                <div style={{ flexShrink:0, textAlign:'center', background: C.s2, borderRadius:'12px', padding:'10px 14px', minWidth:'80px' }}>
                  <div style={{ fontSize:'18px', fontWeight:700, color: C.green }}>{pkg.currency} {pkg.price || '—'}</div>
                  <div style={{ fontSize:'10px', color: C.t3, textTransform:'capitalize', marginTop:'2px' }}>{pkg.period}</div>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px', flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:'15px' }}>{pkg.name}</span>
                    {pkg.tagline && <span style={{ fontSize:'12px', color: C.t3 }}>{pkg.tagline}</span>}
                    <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px', background: pkg.active ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.06)', color: pkg.active ? C.green : C.t3, border:`1px solid ${pkg.active ? 'rgba(48,209,88,0.25)' : C.sep}` }}>
                      {pkg.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  {pkg.description && <div style={{ fontSize:'13px', color: C.t2, marginBottom:'8px' }}>{pkg.description}</div>}
                  <div style={{ display:'flex', gap:'16px', fontSize:'12px', color: C.t3, flexWrap:'wrap' }}>
                    {pkg.keywords && <span>🔑 <span style={{ color: C.blue }}>{pkg.keywords}</span></span>}
                    {pkg.send_after_messages > 0 && <span>⏱ Pitch after {pkg.send_after_messages} msgs</span>}
                    {pkg.welcome_message && <span>💬 Has pitch message</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px', flexShrink:0, flexWrap:'wrap' }}>
                  <button onClick={() => toggleActive(pkg.id)} style={{ padding:'6px 12px', borderRadius:'9px', background: C.s3, border:'none', color: C.t2, fontSize:'12px', cursor:'pointer' }}>
                    {pkg.active ? 'Pause' : 'Enable'}
                  </button>
                  <button onClick={() => openEdit(pkg)} style={{ padding:'6px 12px', borderRadius:'9px', background: C.s3, border:'none', color: C.t2, fontSize:'12px', cursor:'pointer' }}>Edit</button>
                  <button onClick={() => deletePackage(pkg.id)} style={{ padding:'6px 10px', borderRadius:'9px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.2)', color: C.red, fontSize:'12px', cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', overflowY:'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'520px', border:`1px solid ${C.sep}` }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {packages.some(p => p.id === editing.id) ? 'Edit Package' : 'New Package'}
            </h3>

            {(['name','tagline','description'] as const).map(field => (
              <label key={field} style={{ display:'block', marginBottom:'13px' }}>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px', textTransform:'capitalize' }}>{field}</div>
                <input value={(editing as any)[field]} onChange={e => setEditing({...editing, [field]: e.target.value})}
                  placeholder={field==='name' ? 'e.g. Premium Pack' : field==='tagline' ? 'Short subtitle' : 'Describe what they get'}
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }} />
              </label>
            ))}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 1fr', gap:'10px', marginBottom:'13px' }}>
              {(['price','currency'] as const).map((f,i) => (
                <label key={f}>
                  <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px', textTransform:'capitalize' }}>{f}</div>
                  <input value={(editing as any)[f]} onChange={e => setEditing({...editing, [f]: e.target.value})}
                    placeholder={f==='price' ? '49' : 'USD'}
                    style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }} />
                </label>
              ))}
              <label>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Billing</div>
                <select value={editing.period} onChange={e => setEditing({...editing, period: e.target.value})}
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Keywords (comma-separated)</div>
              <input value={editing.keywords} onChange={e => setEditing({...editing, keywords: e.target.value})}
                placeholder="buy, price, package, subscription"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }} />
              <div style={{ fontSize:'11px', color: C.t3, marginTop:'4px' }}>AI pitches this package when these words appear in a message</div>
            </label>

            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Auto-pitch after N messages (0 = off)</div>
              <input type="number" min="0" value={editing.send_after_messages}
                onChange={e => setEditing({...editing, send_after_messages: parseInt(e.target.value)||0})}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }} />
            </label>

            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Welcome / pitch message</div>
              <textarea value={editing.welcome_message} onChange={e => setEditing({...editing, welcome_message: e.target.value})}
                placeholder="Hey! 👋 I'd love to share our Premium Pack with you…" rows={3}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical' }} />
            </label>

            <label style={{ display:'block', marginBottom:'20px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Features (one per line)</div>
              <textarea value={editing.features} onChange={e => setEditing({...editing, features: e.target.value})}
                placeholder={"50 exclusive photos\nInstant delivery\nLifetime access"} rows={3}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical' }} />
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background: C.s3, border:'none', color: C.t2, fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={confirmEdit} disabled={saving || !editing.name.trim()}
                style={{ flex:2, padding:'11px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:(saving||!editing.name.trim())?0.5:1 }}>
                {saving ? 'Saving…' : 'Save Package'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
