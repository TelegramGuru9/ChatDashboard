'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  tag: string;              // "Free" | user-defined category name
  keywords: string;
  action: string;
  description: string;
  message_to_user: string;  // text sent alongside this file
  price: string;            // e.g. "29.99"
  payment_link: string;     // URL
  addedAt: string;
}

interface MediaSettings {
  no_repeat: boolean;
}

const ACTIONS = [
  { value: 'send_file',        label: '📤 Datei direkt senden' },
  { value: 'send_preview',     label: '👀 Vorschau + Kaufangebot' },
  { value: 'suggest_purchase', label: '💳 Kauflink pitchen' },
  { value: 'ask_interest',     label: '🤔 Erst nach Interesse fragen' },
];

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
function iconFor(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf'))     return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}
const CAT_PALETTE = [C.blue, C.purple, C.orange, C.teal, '#ff2d55', '#ffd60a', '#34c759', '#5e5ce6'];
function catColor(name: string, categories: string[]) {
  if (name === 'Free') return C.green;
  const idx = categories.indexOf(name);
  return CAT_PALETTE[idx % CAT_PALETTE.length] ?? C.t3;
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!on)} style={{
      width:'44px', height:'24px', borderRadius:'12px', background: on ? C.green : C.s3,
      cursor:'pointer', position:'relative', flexShrink:0, transition:'background 0.2s',
    }}>
      <div style={{
        position:'absolute', top:'3px', left: on ? '23px' : '3px',
        width:'18px', height:'18px', borderRadius:'50%', background:'#fff',
        transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  );
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

function emptyItem(overrides?: Partial<MediaItem>): MediaItem {
  return {
    id: '', name: '', type: '', size: 0, dataUrl: undefined,
    tag: 'Free', keywords: '', action: 'send_file',
    description: '', message_to_user: '', price: '', payment_link: '',
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

export default function MediaPage() {
  const [items,      setItems]      = useState<MediaItem[]>([]);
  const [settings,   setSettings]   = useState<MediaSettings>({ no_repeat: true });
  const [categories, setCategories] = useState<string[]>([]);  // user-defined (no "Free")
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('All');
  const [dragging,   setDragging]   = useState(false);
  const [editing,    setEditing]    = useState<MediaItem | null>(null);
  const [previewing, setPreviewing] = useState<MediaItem | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [status,     setStatus]     = useState('');
  const [catInput,   setCatInput]   = useState('');
  const [catOpen,    setCatOpen]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = apiBase();
  const { withCreator } = useCreator();

  const toast = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 2800); };

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [libRes, setRes, catRes] = await Promise.all([
        fetch(withCreator(`${api}/config/media_library`)),
        fetch(withCreator(`${api}/config/media_settings`)),
        fetch(withCreator(`${api}/config/media_categories`)),
      ]);
      const lib = await libRes.json();
      const set = await setRes.json();
      const cat = await catRes.json();
      // Migrate old items that may lack new fields
      const rawItems: MediaItem[] = (Array.isArray(lib.value) ? lib.value : []).map((i: any) => ({
        message_to_user: '', price: '', payment_link: '',
        ...i,
      }));
      setItems(rawItems);
      if (set.value && typeof set.value === 'object') setSettings({ no_repeat: set.value.no_repeat !== false });
      setCategories(Array.isArray(cat.value) ? cat.value : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const saveLib = async (updated: MediaItem[]) => {
    setSaving(true);
    try {
      const res = await fetch(withCreator(`${api}/config/media_library`), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setItems(updated);
    } catch { toast('⚠ Fehler beim Speichern'); }
    finally { setSaving(false); }
  };

  const saveSettings = async (updated: MediaSettings) => {
    setSettings(updated);
    fetch(withCreator(`${api}/config/media_settings`), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const saveCategories = async (updated: string[]) => {
    setCategories(updated);
    fetch(withCreator(`${api}/config/media_categories`), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  // ── File upload ───────────────────────────────────────────────────────────
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(f => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isMedia = f.type.startsWith('image') || f.type.startsWith('video');
      if (isMedia) {
        const reader = new FileReader();
        reader.onload = e => {
          setEditing(emptyItem({
            id, name: f.name, type: f.type, size: f.size,
            dataUrl: e.target?.result as string,
            tag: 'Free', action: 'send_teaser',
          }));
        };
        reader.readAsDataURL(f);
      } else {
        setEditing(emptyItem({
          id, name: f.name, type: f.type, size: f.size,
          tag: categories[0] || 'Free', action: 'send_file',
        }));
      }
    });
  };

  // ── Category management ───────────────────────────────────────────────────
  const addCategory = () => {
    const name = catInput.trim();
    if (!name || name.toLowerCase() === 'free' || categories.includes(name)) return;
    const updated = [...categories, name];
    saveCategories(updated);
    setCatInput('');
    toast(`✓ Kategorie "${name}" erstellt`);
  };

  const deleteCategory = (name: string) => {
    if (!confirm(`Kategorie "${name}" löschen? Dateien dieser Kategorie werden zu "Free" verschoben.`)) return;
    const newCats = categories.filter(c => c !== name);
    const newItems = items.map(i => i.tag === name ? { ...i, tag: 'Free' } : i);
    saveCategories(newCats);
    saveLib(newItems);
    if (filter === name) setFilter('All');
    toast(`✓ "${name}" gelöscht`);
  };

  // ── Confirm edit / delete ─────────────────────────────────────────────────
  const confirmEdit = () => {
    if (!editing) return;
    const updated = items.some(i => i.id === editing.id)
      ? items.map(i => i.id === editing.id ? editing : i)
      : [...items, editing];
    saveLib(updated);
    setEditing(null);
    toast('✓ Gespeichert');
  };

  const deleteItem = (id: string) => {
    if (!confirm('Datei löschen?')) return;
    saveLib(items.filter(i => i.id !== id));
    setPreviewing(null);
    toast('✓ Gelöscht');
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allTags   = ['Free', ...categories];
  const freeItems = items.filter(i => i.tag === 'Free');
  const visible   = filter === 'All' ? items : items.filter(i => i.tag === filter);

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1080px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'22px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Media Library</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>{items.length} Dateien · {freeItems.length} Gratis-Teaser</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} style={{
            padding:'10px 18px', borderRadius:'12px', background: C.blue, border:'none',
            color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer',
          }}>+ Datei hochladen</button>
        </div>

        {/* Free teaser banner */}
        <div style={{
          background:'rgba(48,209,88,0.06)', border:`1px solid rgba(48,209,88,0.18)`,
          borderRadius:'16px', padding:'18px 20px', marginBottom:'16px',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
            <span style={{ fontSize:'30px' }}>🎁</span>
            <div>
              <div style={{ fontWeight:700, fontSize:'14px', color: C.green }}>Gratis-Teaser</div>
              <div style={{ fontSize:'12px', color: C.t2, marginTop:'2px' }}>
                {freeItems.length === 0
                  ? 'Noch keine Teaser — Bot schickt keinen Teaser vor dem Paket-Pitch'
                  : `${freeItems.length} Teaser verfügbar — Bot wählt einen zufällig als Teaser (kein Kauflink!)` }
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', background: C.s2, padding:'10px 14px', borderRadius:'12px', border:`1px solid ${C.sep}` }}>
            <div>
              <div style={{ fontSize:'12px', fontWeight:600, marginBottom:'1px' }}>Nie zweimal dasselbe</div>
              <div style={{ fontSize:'10px', color: C.t3 }}>Pro Kontakt jeden Teaser nur einmal</div>
            </div>
            <Toggle on={settings.no_repeat} onChange={v => saveSettings({ ...settings, no_repeat: v })} />
          </div>
        </div>

        {/* Category manager */}
        <div style={{ background: C.s1, border:`1px solid ${C.sep}`, borderRadius:'14px', marginBottom:'16px', overflow:'hidden' }}>
          <button onClick={() => setCatOpen(v => !v)} style={{
            width:'100%', padding:'12px 16px', background:'none', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'space-between', color: C.t1,
          }}>
            <span style={{ fontSize:'13px', fontWeight:600 }}>🗂 Kategorien verwalten ({categories.length} benutzerdefiniert)</span>
            <span style={{ fontSize:'16px', color: C.t3, transform: catOpen ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>⌄</span>
          </button>
          {catOpen && (
            <div style={{ padding:'0 16px 16px', borderTop:`1px solid ${C.sep}` }}>
              {/* Existing categories */}
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'14px', marginBottom:'14px' }}>
                <span style={{ fontSize:'11px', padding:'4px 10px', borderRadius:'20px', background:'rgba(48,209,88,0.12)', color: C.green, border:'1px solid rgba(48,209,88,0.25)', fontWeight:600 }}>
                  🎁 Free (fest)
                </span>
                {categories.map(cat => (
                  <div key={cat} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'3px 8px 3px 10px', borderRadius:'20px', background:`${catColor(cat, categories)}14`, border:`1px solid ${catColor(cat, categories)}40`, fontSize:'11px', fontWeight:600, color: catColor(cat, categories) }}>
                    {cat}
                    <button onClick={() => deleteCategory(cat)} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.3)', fontSize:'12px', padding:'0 0 0 2px', lineHeight:1 }}>×</button>
                  </div>
                ))}
              </div>
              {/* Add category */}
              <div style={{ display:'flex', gap:'8px' }}>
                <input
                  value={catInput}
                  onChange={e => setCatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="Neue Kategorie (z.B. VIP, Outdoor, Lingerie…)"
                  style={{ flex:1, background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'8px 12px', color: C.t1, fontSize:'13px', outline:'none' }}
                />
                <button onClick={addCategory} style={{ padding:'8px 16px', borderRadius:'10px', background: C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
                  + Hinzufügen
                </button>
              </div>
            </div>
          )}
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
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging ? C.green : C.sep}`, borderRadius:'16px',
            padding:'24px 20px', textAlign:'center', cursor:'pointer', marginBottom:'18px',
            background: dragging ? 'rgba(48,209,88,0.05)' : C.s1, transition:'all 0.15s',
          }}
        >
          <div style={{ fontSize:'26px', marginBottom:'6px' }}>📁</div>
          <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'3px' }}>Dateien ablegen oder klicken</div>
          <div style={{ fontSize:'12px', color: C.t3 }}>Bilder & Videos → Standard: Gratis-Teaser · Sonstige → erste Kategorie</div>
        </div>

        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,application/pdf,audio/*" style={{ display:'none' }} onChange={e => addFiles(e.target.files)} />

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap', overflowX:'auto' }}>
          {['All', ...allTags].map(t => {
            const count = t === 'All' ? items.length : items.filter(i => i.tag === t).length;
            const active = filter === t;
            const col = catColor(t, categories);
            return (
              <button key={t} onClick={() => setFilter(t)} style={{
                padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
                cursor:'pointer', border:'1px solid', flexShrink:0, transition:'all 0.15s',
                background: active ? `${col}20` : 'transparent',
                borderColor: active ? col : C.sep,
                color: active ? col : C.t2,
              }}>
                {t === 'Free' ? '🎁 ' : ''}{t} ({count})
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>Lade…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>
            <div style={{ fontSize:'44px', marginBottom:'12px' }}>📂</div>
            <div style={{ fontSize:'15px', fontWeight:600, marginBottom:'6px', color: C.t2 }}>
              {filter === 'Free' ? 'Noch keine Gratis-Teaser' : `Keine Dateien in "${filter}"`}
            </div>
            <div style={{ fontSize:'13px' }}>Lade Dateien hoch um sie hier zu sehen</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px' }}>
            {visible.map(item => {
              const col = catColor(item.tag, categories);
              const isFree = item.tag === 'Free';
              const isVideo = item.type.startsWith('video');
              const isImage = item.type.startsWith('image');
              const hasMedia = !!item.dataUrl && (isVideo || isImage);
              return (
                <div key={item.id} style={{
                  background: C.s1, borderRadius:'14px',
                  border:`1px solid ${isFree ? 'rgba(48,209,88,0.25)' : C.sep}`,
                  overflow:'hidden', display:'flex', flexDirection:'column',
                  transition:'transform 0.1s, border-color 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor=isFree?'rgba(48,209,88,0.5)':C.blue; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.borderColor=isFree?'rgba(48,209,88,0.25)':C.sep; }}
                >
                  {/* ── Thumbnail — always visible ── */}
                  <div
                    onClick={() => setPreviewing(item)}
                    style={{ height:'150px', background: C.s2, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', cursor:'pointer', overflow:'hidden' }}
                  >
                    {isImage && item.dataUrl ? (
                      <img src={item.dataUrl} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    ) : isVideo && item.dataUrl ? (
                      <>
                        {/* video element as thumbnail frame */}
                        <video
                          src={item.dataUrl}
                          style={{ width:'100%', height:'100%', objectFit:'cover' }}
                          muted playsInline preload="metadata"
                        />
                        {/* Play button overlay — always visible on video */}
                        <div style={{
                          position:'absolute', inset:0,
                          background:'rgba(0,0,0,0.28)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          <div style={{
                            width:'44px', height:'44px', borderRadius:'50%',
                            background:'rgba(255,255,255,0.9)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            boxShadow:'0 2px 12px rgba(0,0,0,0.4)',
                          }}>
                            <span style={{ fontSize:'18px', marginLeft:'3px' }}>▶</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:'44px' }}>{iconFor(item.type)}</div>
                        <div style={{ fontSize:'10px', color:C.t3, marginTop:'4px' }}>{item.type.split('/')[1]?.toUpperCase() || 'FILE'}</div>
                      </div>
                    )}

                    {/* Tag badge */}
                    <span style={{
                      position:'absolute', top:'8px', left:'8px', fontSize:'10px', fontWeight:700,
                      padding:'2px 8px', borderRadius:'8px',
                      background: isFree ? 'rgba(48,209,88,0.92)' : 'rgba(0,0,0,0.65)',
                      color: isFree ? '#000' : '#fff',
                      backdropFilter: 'blur(4px)',
                    }}>
                      {isFree ? '🎁 Free' : item.tag}
                    </span>

                    {/* Price badge */}
                    {item.price && !isFree && (
                      <span style={{ position:'absolute', bottom:'8px', right:'8px', fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'8px', background:'rgba(0,0,0,0.75)', color: C.orange }}>
                        {item.price.includes('€') ? item.price : `${item.price} €`}
                      </span>
                    )}

                    {/* Fullscreen hint on image hover */}
                    {isImage && (
                      <div className="img-hover-hint" style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity='1'; (e.currentTarget as HTMLElement).style.background='rgba(0,0,0,0.3)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity='0'; (e.currentTarget as HTMLElement).style.background='rgba(0,0,0,0)'; }}>
                        <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:'rgba(255,255,255,0.85)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>⛶</div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ padding:'10px 12px', flex:1, display:'flex', flexDirection:'column' }}>
                    <div style={{ fontWeight:600, fontSize:'12px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'2px' }}>{item.name}</div>
                    <div style={{ fontSize:'10px', color: C.t3, marginBottom: item.description ? '4px' : 0 }}>
                      {isVideo ? '🎬 Video' : isImage ? '🖼️ Bild' : '📄 Datei'} · {fmt(item.size)}
                    </div>
                    {item.description && (
                      <div style={{ fontSize:'11px', color: C.t2, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', lineHeight:1.4 }}>
                        {item.description}
                      </div>
                    )}
                    <div style={{ marginTop:'auto', paddingTop:'8px', display:'flex', gap:'5px' }}>
                      <button
                        onClick={() => setPreviewing(item)}
                        style={{ flex:1, padding:'5px', borderRadius:'7px', background: C.blue + '20', border:`1px solid ${C.blue}40`, color: C.blue, fontSize:'11px', fontWeight:600, cursor:'pointer' }}
                      >
                        {isVideo ? '▶ Abspielen' : isImage ? '🔍 Ansehen' : '👁 Details'}
                      </button>
                      <button onClick={() => setEditing({ ...item })} style={{ padding:'5px 8px', borderRadius:'7px', background: C.s3, border:'none', color: C.t2, fontSize:'11px', cursor:'pointer' }}>✏</button>
                      <button onClick={() => deleteItem(item.id)} style={{ padding:'5px 8px', borderRadius:'7px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.2)', color: C.red, fontSize:'11px', cursor:'pointer' }}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stats footer */}
        {items.length > 0 && (
          <div style={{ marginTop:'24px', padding:'12px 18px', borderRadius:'12px', background: C.s1, border:`1px solid ${C.sep}`, display:'flex', gap:'20px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'12px', color: C.t3 }}><span style={{ color: C.green, fontWeight:700 }}>{freeItems.length}</span> Gratis-Teaser</span>
            <span style={{ fontSize:'12px', color: C.t3 }}><span style={{ color: C.blue, fontWeight:700 }}>{items.filter(i => i.tag !== 'Free').length}</span> andere Dateien</span>
            <span style={{ fontSize:'12px', color: C.t3 }}>Wiederholungsschutz: <span style={{ color: settings.no_repeat ? C.green : C.orange, fontWeight:600 }}>{settings.no_repeat ? 'An' : 'Aus'}</span></span>
          </div>
        )}
      </div>

      {/* ── Preview Modal — fullscreen ─────────────────────────────────────────── */}
      {previewing && (() => {
        const isVid = previewing.type.startsWith('video');
        const isImg = previewing.type.startsWith('image');
        const col   = catColor(previewing.tag, categories);
        return (
          <div
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:1200, display:'flex', flexDirection:'column' }}
            onKeyDown={e => e.key === 'Escape' && setPreviewing(null)}
          >
            {/* Top bar */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', flexShrink:0, borderBottom:`1px solid rgba(255,255,255,0.08)` }}>
              <div>
                <span style={{ fontWeight:700, fontSize:'15px', color:C.t1 }}>{previewing.name}</span>
                <span style={{ fontSize:'11px', color:C.t3, marginLeft:'10px' }}>{fmt(previewing.size)} · {isVid ? 'Video' : isImg ? 'Bild' : previewing.type}</span>
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <button
                  onClick={() => { setPreviewing(null); setEditing({ ...previewing }); }}
                  style={{ padding:'7px 14px', borderRadius:'10px', background:C.s2, border:`1px solid ${C.sep}`, color:C.t2, fontSize:'12px', fontWeight:600, cursor:'pointer' }}
                >✏ Bearbeiten</button>
                <button
                  onClick={() => setPreviewing(null)}
                  style={{ width:'34px', height:'34px', borderRadius:'10px', background:C.s2, border:`1px solid ${C.sep}`, color:C.t2, fontSize:'18px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                >✕</button>
              </div>
            </div>

            {/* Media area — takes all remaining height */}
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative', minHeight:0 }}
              onClick={e => { if (e.target === e.currentTarget) setPreviewing(null); }}
            >
              {isImg && previewing.dataUrl ? (
                <img
                  src={previewing.dataUrl}
                  alt={previewing.name}
                  style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', userSelect:'none' }}
                />
              ) : isVid && previewing.dataUrl ? (
                <video
                  src={previewing.dataUrl}
                  controls
                  autoPlay
                  style={{ maxWidth:'100%', maxHeight:'100%', outline:'none' }}
                />
              ) : (
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'72px', marginBottom:'16px' }}>{iconFor(previewing.type)}</div>
                  <div style={{ fontSize:'16px', color:C.t2 }}>{previewing.name}</div>
                  <div style={{ fontSize:'12px', color:C.t3, marginTop:'6px' }}>{fmt(previewing.size)}</div>
                </div>
              )}
            </div>

            {/* Bottom info strip */}
            <div style={{ flexShrink:0, padding:'12px 18px', borderTop:`1px solid rgba(255,255,255,0.08)`, display:'flex', gap:'12px', alignItems:'center', flexWrap:'wrap', background:'rgba(0,0,0,0.5)' }}>
              <span style={{ fontSize:'12px', padding:'3px 10px', borderRadius:'20px', background:`${col}20`, color:col, border:`1px solid ${col}40`, fontWeight:600 }}>
                {previewing.tag === 'Free' ? '🎁 ' : ''}{previewing.tag}
              </span>
              {previewing.price && previewing.tag !== 'Free' && (
                <span style={{ fontSize:'12px', fontWeight:700, color:C.orange }}>💰 {previewing.price.includes('€') ? previewing.price : `${previewing.price} €`}</span>
              )}
              {previewing.tag === 'Free' && (
                <span style={{ fontSize:'11px', color:C.green }}>Kein Kauflink — frei gesendet</span>
              )}
              {previewing.description && (
                <span style={{ fontSize:'12px', color:C.t2, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{previewing.description}</span>
              )}
              {previewing.message_to_user && (
                <span style={{ fontSize:'12px', color:C.teal }}>💬 {previewing.message_to_user}</span>
              )}
              {previewing.payment_link && previewing.tag !== 'Free' && (
                <a href={previewing.payment_link} target="_blank" rel="noreferrer"
                  style={{ fontSize:'12px', color:C.blue, fontWeight:600, textDecoration:'none', marginLeft:'auto' }}>
                  🔗 Kaufen →
                </a>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'500px', border:`1px solid ${C.sep}`, maxHeight:'92vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 18px', fontSize:'17px', fontWeight:700 }}>
              {items.some(i => i.id === editing.id) ? 'Datei bearbeiten' : 'Neue Datei konfigurieren'}
            </h3>

            {/* Inline preview */}
            {editing.dataUrl && editing.type.startsWith('image') && (
              <div style={{ marginBottom:'16px', borderRadius:'12px', overflow:'hidden', height:'150px', background: C.bg }}>
                <img src={editing.dataUrl} alt={editing.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              </div>
            )}
            {editing.dataUrl && editing.type.startsWith('video') && (
              <div style={{ marginBottom:'16px', borderRadius:'12px', overflow:'hidden', height:'150px', background: C.bg }}>
                <video src={editing.dataUrl} style={{ width:'100%', height:'100%', objectFit:'cover' }} muted />
              </div>
            )}

            {/* Category */}
            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Kategorie</div>
              <select
                value={editing.tag}
                onChange={e => setEditing({ ...editing, tag: e.target.value, action: e.target.value === 'Free' ? 'send_teaser' : (editing.action === 'send_teaser' ? 'send_file' : editing.action) })}
                style={{ width:'100%', background: C.s2, border:`1px solid ${editing.tag === 'Free' ? 'rgba(48,209,88,0.4)' : C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}
              >
                {allTags.map(t => <option key={t} value={t}>{t === 'Free' ? '🎁 Free (Gratis-Teaser)' : t}</option>)}
              </select>
              {editing.tag === 'Free' && (
                <div style={{ fontSize:'11px', color: C.green, marginTop:'4px' }}>
                  🎁 Wird als Teaser gesendet — kein Kauflink, keine Kosten für den Fan
                </div>
              )}
            </label>

            {/* Description */}
            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Beschreibung</div>
              <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="z.B. Exklusives Foto-Pack, 10 Bilder, hot & elegant"
                rows={2}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
            </label>

            {/* Message to user */}
            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Nachricht an User <span style={{ color: C.teal }}>(wird mit der Datei gesendet)</span></div>
              <textarea value={editing.message_to_user} onChange={e => setEditing({ ...editing, message_to_user: e.target.value })}
                placeholder="z.B. Hier ist dein exklusiver Inhalt 🔥 Viel Spaß!"
                rows={2}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
            </label>

            {/* Price + payment link (hidden for Free) */}
            {editing.tag !== 'Free' && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'13px' }}>
                  <label>
                    <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Preis</div>
                    <input value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })}
                      placeholder="z.B. 29.99"
                      style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </label>
                  <label>
                    <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Kauflink</div>
                    <input value={editing.payment_link} onChange={e => setEditing({ ...editing, payment_link: e.target.value })}
                      placeholder="https://…"
                      style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </label>
                </div>

                {/* Action */}
                <label style={{ display:'block', marginBottom:'13px' }}>
                  <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Bot-Aktion</div>
                  <select value={editing.action} onChange={e => setEditing({ ...editing, action: e.target.value })}
                    style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                    {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
              </>
            )}

            {/* Keywords */}
            <label style={{ display:'block', marginBottom:'18px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Keywords <span style={{ fontWeight:400 }}>(kommagetrennt, optional)</span></div>
              <input value={editing.keywords} onChange={e => setEditing({ ...editing, keywords: e.target.value })}
                placeholder="z.B. foto, content, zeig mir"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color: C.t3, marginTop:'3px' }}>
                {editing.tag === 'Free' ? 'Teaser werden automatisch gesendet — Keywords optional' : 'KI sendet diese Datei wenn Wörter im Chat erscheinen'}
              </div>
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background: C.s3, border:'none', color: C.t2, fontSize:'14px', cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={confirmEdit} disabled={saving} style={{
                flex:2, padding:'11px', borderRadius:'12px', border:'none', color:'#fff',
                background: editing.tag === 'Free' ? C.green : C.blue,
                fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:saving?0.6:1,
              }}>
                {saving ? 'Speichern…' : 'Datei speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:640px) { div[style*="minmax(210px"]{grid-template-columns:repeat(2,1fr)!important} }
      `}</style>
    </DashboardLayout>
  );
}
