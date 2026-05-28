'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2',
};

interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;   // base64 preview / send data
  tag: string;        // "Free" | "Product" | "Promo" | …
  keywords: string;   // comma-separated trigger words
  action: string;
  description: string;
  addedAt: string;
}

interface MediaSettings {
  no_repeat: boolean;   // never send same file to same user twice
}

// "Free" is first and special — everything else follows
const TAGS     = ['Free', 'Product', 'Promo', 'Docs', 'Video', 'Other'];
const TAG_META: Record<string, { color: string; emoji: string; desc: string }> = {
  Free:    { color: C.green,  emoji: '🎁', desc: 'Teaser content the bot sends before pitching a package' },
  Product: { color: C.blue,   emoji: '📦', desc: 'Product images & files' },
  Promo:   { color: C.orange, emoji: '🎉', desc: 'Promotional material' },
  Docs:    { color: C.teal,   emoji: '📄', desc: 'Documents & PDFs' },
  Video:   { color: C.purple, emoji: '🎬', desc: 'Video files' },
  Other:   { color: C.t3,     emoji: '📎', desc: 'Everything else' },
};
const ACTIONS = [
  { value: 'send_teaser',      label: '🎁 Send as teaser (before pitch)' },
  { value: 'send_preview',     label: '👀 Send preview + offer to buy' },
  { value: 'send_file',        label: '📤 Send file directly' },
  { value: 'suggest_purchase', label: '💳 Pitch purchase link' },
  { value: 'ask_interest',     label: '🤔 Ask if interested first' },
];

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
function icon(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf'))     return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!on)} style={{
      width:'44px', height:'24px', borderRadius:'12px', background: on ? C.green : C.s3,
      cursor:'pointer', position:'relative', flexShrink:0, transition:'background 0.2s',
    }}>
      <div style={{
        position:'absolute', top:'3px', left: on ? '23px' : '3px', width:'18px', height:'18px',
        borderRadius:'50%', background:'#fff', transition:'left 0.2s',
        boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  );
}

export default function MediaPage() {
  const [items,    setItems]    = useState<MediaItem[]>([]);
  const [settings, setSettings] = useState<MediaSettings>({ no_repeat: true });
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('All');
  const [dragging, setDragging] = useState(false);
  const [editing,  setEditing]  = useState<MediaItem | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [status,   setStatus]   = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = apiBase();

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [libRes, setRes] = await Promise.all([
        fetch(`${api}/config/media_library`),
        fetch(`${api}/config/media_settings`),
      ]);
      const lib = await libRes.json();
      const set = await setRes.json();
      setItems(Array.isArray(lib.value) ? lib.value : []);
      if (set.value && typeof set.value === 'object') {
        setSettings({ no_repeat: set.value.no_repeat !== false }); // default true
      }
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [api]);

  // ── Save library ──────────────────────────────────────────────────────────
  const saveLib = async (updated: MediaItem[]) => {
    setSaving(true);
    try {
      const res = await fetch(`${api}/config/media_library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setItems(updated);
    } catch { setStatus('⚠ Fehler beim Speichern'); }
    finally { setSaving(false); }
  };

  // ── Save settings ─────────────────────────────────────────────────────────
  const saveSettings = async (updated: MediaSettings) => {
    setSettings(updated);
    try {
      await fetch(`${api}/config/media_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch { /* silent */ }
  };

  useEffect(() => { load(); }, [load]);

  // ── File add ──────────────────────────────────────────────────────────────
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(f => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (f.type.startsWith('image') || f.type.startsWith('video')) {
        const reader = new FileReader();
        reader.onload = e => {
          const item: MediaItem = {
            id, name: f.name, type: f.type, size: f.size,
            dataUrl: e.target?.result as string,
            tag: 'Free', keywords: '', action: 'send_teaser',
            description: '', addedAt: new Date().toISOString(),
          };
          setEditing(item);
        };
        reader.readAsDataURL(f);
      } else {
        const item: MediaItem = {
          id, name: f.name, type: f.type, size: f.size,
          tag: 'Product', keywords: '', action: 'send_file',
          description: '', addedAt: new Date().toISOString(),
        };
        setEditing(item);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const confirmEdit = () => {
    if (!editing) return;
    const updated = items.some(i => i.id === editing.id)
      ? items.map(i => i.id === editing.id ? editing : i)
      : [...items, editing];
    saveLib(updated);
    setEditing(null);
    setStatus('✓ Gespeichert');
    setTimeout(() => setStatus(''), 2500);
  };

  const deleteItem = (id: string) => {
    if (!confirm('Datei löschen?')) return;
    saveLib(items.filter(i => i.id !== id));
    setStatus('✓ Gelöscht');
    setTimeout(() => setStatus(''), 2500);
  };

  const freeItems  = items.filter(i => i.tag === 'Free');
  const otherItems = items.filter(i => i.tag !== 'Free');
  const visible    = filter === 'All'  ? items
                   : filter === 'Free' ? freeItems
                   : items.filter(i => i.tag === filter);

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1040px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Media Library</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Dateien die der Bot automatisch sendet</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} style={{
            padding:'10px 18px', borderRadius:'12px', background: C.blue, border:'none',
            color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer',
          }}>+ Datei hochladen</button>
        </div>

        {/* ── Free Teaser Banner ──────────────────────────────────────────── */}
        <div style={{
          background:'rgba(48,209,88,0.06)', border:`1px solid rgba(48,209,88,0.18)`,
          borderRadius:'16px', padding:'18px 20px', marginBottom:'20px',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
            <span style={{ fontSize:'32px' }}>🎁</span>
            <div>
              <div style={{ fontWeight:700, fontSize:'15px', color: C.green }}>Gratis-Teaser</div>
              <div style={{ fontSize:'13px', color: C.t2, marginTop:'2px' }}>
                {freeItems.length === 0
                  ? 'Noch keine Teaser hochgeladen — der Bot schickt keinen Teaser vor dem Paket-Pitch'
                  : `${freeItems.length} Teaser verfügbar — Bot wählt einen zufällig vor dem Paket-Pitch`}
              </div>
            </div>
          </div>

          {/* No-repeat setting */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', background: C.s2, padding:'10px 14px', borderRadius:'12px', border:`1px solid ${C.sep}` }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'2px' }}>Nie zweimal dasselbe senden</div>
              <div style={{ fontSize:'11px', color: C.t3 }}>Pro Kontakt jeden Teaser nur einmal verwenden</div>
            </div>
            <Toggle on={settings.no_repeat} onChange={v => saveSettings({ ...settings, no_repeat: v })} />
          </div>
        </div>

        {/* Status toast */}
        {status && (
          <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', fontSize:'13px',
            background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,149,10,0.1)',
            color: status.startsWith('✓') ? C.green : C.orange,
            border:`1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.2)' : 'rgba(255,149,10,0.2)'}`,
          }}>{status}</div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging ? C.green : C.sep}`, borderRadius:'16px',
            padding:'28px 20px', textAlign:'center', cursor:'pointer', marginBottom:'20px',
            background: dragging ? 'rgba(48,209,88,0.05)' : C.s1, transition:'all 0.15s',
          }}
        >
          <div style={{ fontSize:'28px', marginBottom:'6px' }}>📁</div>
          <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'3px' }}>Dateien ablegen oder klicken</div>
          <div style={{ fontSize:'12px', color: C.t3 }}>Bilder & Videos → automatisch als Gratis-Teaser kategorisiert</div>
        </div>

        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,application/pdf,audio/*" style={{ display:'none' }} onChange={e => addFiles(e.target.files)} />

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap' }}>
          {['All', ...TAGS].map(t => {
            const meta = TAG_META[t];
            const count = t === 'All' ? items.length : items.filter(i => i.tag === t).length;
            const active = filter === t;
            const col = meta?.color ?? C.blue;
            return (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'1px solid',
                background: active ? (t === 'Free' ? 'rgba(48,209,88,0.15)' : `${col}22`) : 'transparent',
                borderColor: active ? col : C.sep,
                color: active ? (t === 'Free' ? C.green : col) : C.t2,
              }}>
                {meta?.emoji} {t} ({count})
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>Lade…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>
            <div style={{ fontSize:'44px', marginBottom:'12px' }}>
              {filter === 'Free' ? '🎁' : '📂'}
            </div>
            <div style={{ fontSize:'15px', fontWeight:600, marginBottom:'6px', color: C.t2 }}>
              {filter === 'Free' ? 'Noch keine Teaser' : 'Keine Dateien'}
            </div>
            <div style={{ fontSize:'13px' }}>
              {filter === 'Free'
                ? 'Lade Bilder oder Videos hoch — der Bot schickt sie vor dem Paket-Pitch als Vorschau'
                : 'Lade Dateien hoch und füge Keywords hinzu — die KI schickt sie automatisch'}
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px' }}>
            {visible.map(item => {
              const meta = TAG_META[item.tag] ?? TAG_META.Other;
              return (
                <div key={item.id} style={{
                  background: C.s1, borderRadius:'14px',
                  border:`1px solid ${item.tag === 'Free' ? 'rgba(48,209,88,0.2)' : C.sep}`,
                  overflow:'hidden',
                }}>
                  {/* Preview */}
                  <div style={{ height:'130px', background: C.s2, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                    {item.dataUrl && item.type.startsWith('image') ? (
                      <img src={item.dataUrl} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    ) : item.dataUrl && item.type.startsWith('video') ? (
                      <video src={item.dataUrl} style={{ width:'100%', height:'100%', objectFit:'cover' }} muted />
                    ) : (
                      <span style={{ fontSize:'44px' }}>{icon(item.type)}</span>
                    )}
                    {/* Tag badge */}
                    <span style={{
                      position:'absolute', top:'8px', left:'8px', fontSize:'10px', fontWeight:600,
                      padding:'2px 8px', borderRadius:'8px',
                      background: item.tag === 'Free' ? 'rgba(48,209,88,0.9)' : 'rgba(0,0,0,0.65)',
                      color: item.tag === 'Free' ? '#000' : '#fff',
                    }}>
                      {meta.emoji} {item.tag}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ padding:'12px' }}>
                    <div style={{ fontWeight:600, fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'4px' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize:'11px', color: C.t3, marginBottom:'6px' }}>{fmt(item.size)}</div>

                    {item.tag === 'Free' && (
                      <div style={{ fontSize:'11px', color: C.green, marginBottom:'6px' }}>
                        🎁 Wird vor dem Paket-Pitch gesendet
                      </div>
                    )}

                    {item.keywords && (
                      <div style={{ fontSize:'11px', color: C.blue, marginBottom:'6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        🔑 {item.keywords}
                      </div>
                    )}
                    {item.description && (
                      <div style={{ fontSize:'11px', color: C.t2, marginBottom:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.description}
                      </div>
                    )}

                    <div style={{ display:'flex', gap:'6px' }}>
                      <button onClick={() => setEditing({ ...item })} style={{ flex:1, padding:'6px', borderRadius:'8px', background: C.s3, border:'none', color: C.t2, fontSize:'12px', cursor:'pointer' }}>
                        Bearbeiten
                      </button>
                      <button onClick={() => deleteItem(item.id)} style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(255,69,58,0.12)', border:'1px solid rgba(255,69,58,0.2)', color: C.red, fontSize:'12px', cursor:'pointer' }}>
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats footer */}
        {items.length > 0 && (
          <div style={{ marginTop:'24px', padding:'14px 18px', borderRadius:'12px', background: C.s1, border:`1px solid ${C.sep}`, display:'flex', gap:'24px', flexWrap:'wrap' }}>
            <div style={{ fontSize:'12px', color: C.t3 }}>
              <span style={{ color: C.green, fontWeight:700 }}>{freeItems.length}</span> Gratis-Teaser
            </div>
            <div style={{ fontSize:'12px', color: C.t3 }}>
              <span style={{ color: C.blue, fontWeight:700 }}>{otherItems.length}</span> andere Dateien
            </div>
            <div style={{ fontSize:'12px', color: C.t3 }}>
              Wiederholungsschutz: <span style={{ color: settings.no_repeat ? C.green : C.orange, fontWeight:600 }}>{settings.no_repeat ? 'An' : 'Aus'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'480px', border:`1px solid ${C.sep}`, maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {items.some(i => i.id === editing.id) ? 'Datei bearbeiten' : 'Neue Datei konfigurieren'}
            </h3>

            {/* Preview */}
            {editing.dataUrl && editing.type.startsWith('image') && (
              <div style={{ marginBottom:'16px', borderRadius:'12px', overflow:'hidden', height:'160px' }}>
                <img src={editing.dataUrl} alt={editing.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              </div>
            )}

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Kategorie</div>
              <select value={editing.tag} onChange={e => setEditing({...editing, tag: e.target.value, action: e.target.value === 'Free' ? 'send_teaser' : editing.action})}
                style={{ width:'100%', background: C.s2, border:`1px solid ${editing.tag === 'Free' ? 'rgba(48,209,88,0.4)' : C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                {TAGS.map(t => <option key={t} value={t}>{TAG_META[t]?.emoji} {t}</option>)}
              </select>
              {editing.tag === 'Free' && (
                <div style={{ fontSize:'11px', color: C.green, marginTop:'4px' }}>
                  🎁 Diese Datei wird als Teaser gesendet bevor Nika ein Paket pitcht
                </div>
              )}
            </label>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Keywords (kommagetrennt)</div>
              <input value={editing.keywords} onChange={e => setEditing({...editing, keywords: e.target.value})}
                placeholder="z.B. foto, content, zeig mir, vorschau"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color: C.t3, marginTop:'4px' }}>
                {editing.tag === 'Free' ? 'Leer lassen — Teaser werden bei Preisanfragen automatisch gesendet' : 'KI sendet diese Datei wenn diese Wörter in einer Nachricht erscheinen'}
              </div>
            </label>

            {editing.tag !== 'Free' && (
              <label style={{ display:'block', marginBottom:'14px' }}>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>KI-Aktion</div>
                <select value={editing.action} onChange={e => setEditing({...editing, action: e.target.value})}
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                  {ACTIONS.filter(a => a.value !== 'send_teaser').map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
            )}

            <label style={{ display:'block', marginBottom:'20px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Beschreibung (Kontext für die KI)</div>
              <textarea value={editing.description} onChange={e => setEditing({...editing, description: e.target.value})}
                placeholder="z.B. Exklusives Foto-Pack, 10 Bilder, sexy und elegant"
                rows={3}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background: C.s3, border:'none', color: C.t2, fontSize:'14px', cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={confirmEdit} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:'12px', background: editing.tag === 'Free' ? C.green : C.blue, border:'none', color: editing.tag === 'Free' ? '#000' : '#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:saving?0.6:1 }}>
                {saving ? 'Speichern…' : 'Datei speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
