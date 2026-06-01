'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

// Matches MediaItem from media page
interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  tag: string;
  description: string;
  price: string;
  payment_link: string;
  message_to_user: string;
  addedAt: string;
}

interface PackageFile {
  media_id: string;
  name: string;
  type: string;
  duration?: string; // e.g. "2:34"
}

interface DynamicRules {
  videos: number;
  images: number;
}

interface Package {
  id: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  payment_link: string;
  banner_image_id: string;          // media item ID to use as banner
  media_files: PackageFile[];       // included files (used when dynamic=false)
  dynamic: boolean;                 // if true, files are picked by keyword at send time
  dynamic_rules: DynamicRules;      // how many videos/images to pick for dynamic packages
  description: string;              // internal notes / admin summary
  package_preview_description: string; // what the buyer will see — used by bot to answer questions
  package_text: string;             // full pitch text for the bot
  keywords: string;
  send_after_messages: number;
  active: boolean;
}

const BLANK: Package = {
  id: '', name: '', tagline: '', price: '', currency: '€',
  payment_link: '', banner_image_id: '',
  media_files: [], dynamic: false, dynamic_rules: { videos: 2, images: 8 },
  description: '', package_preview_description: '', package_text: '', keywords: '',
  send_after_messages: 0, active: true,
};

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
function iconFor(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf'))    return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function PackagesPage() {
  const { withCreator } = useCreator();
  const [packages,    setPackages]    = useState<Package[]>([]);
  const [mediaLib,    setMediaLib]    = useState<MediaItem[]>([]);
  const [editing,     setEditing]     = useState<Package | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [status,      setStatus]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [mediaPicker, setMediaPicker] = useState<'banner'|'files'|null>(null);

  const api = getApi();
  const toast = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 2800); };

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [pkgRes, libRes] = await Promise.all([
        fetch(withCreator(`${api}/config/packages`)),
        fetch(withCreator(`${api}/config/media_library`)),
      ]);
      const pkgData  = await pkgRes.json();
      const libData  = await libRes.json();
      const val = pkgData.value;
      // Migrate old package format to new format
      const rawPkgs: Package[] = (Array.isArray(val) ? val : (Array.isArray(val?.packages) ? val.packages : [])).map((p: any) => ({
        ...BLANK, ...p,
        media_files: p.media_files || [],
        banner_image_id: p.banner_image_id || '',
        payment_link: p.payment_link || '',
        package_text: p.package_text || p.welcome_message || '',
        currency: p.currency || '€',
        dynamic: p.dynamic ?? false,
        dynamic_rules: p.dynamic_rules || { videos: 2, images: 8 },
        package_preview_description: p.package_preview_description || '',
      }));
      setPackages(rawPkgs);
      setMediaLib(Array.isArray(libData.value) ? libData.value : []);
    } catch { setPackages([]); }
    finally { setLoading(false); }
  }, [api, withCreator]);

  const persist = async (updated: Package[]) => {
    setSaving(true);
    try {
      const res = await fetch(withCreator(`${api}/config/packages`), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setPackages(updated);
      toast('✓ Gespeichert');
    } catch { toast('⚠ Fehler beim Speichern'); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const openNew  = () => setEditing({ ...BLANK, id:`pkg-${Date.now()}` });
  const openEdit = (p: Package) => setEditing({ ...BLANK, ...p });

  const confirmEdit = () => {
    if (!editing || !editing.name.trim()) return;
    const updated = packages.some(p => p.id === editing.id)
      ? packages.map(p => p.id === editing.id ? editing : p)
      : [...packages, editing];
    persist(updated);
    setEditing(null);
  };

  const deletePackage = (id: string) => {
    if (!confirm('Paket löschen?')) return;
    persist(packages.filter(p => p.id !== id));
  };

  const toggleActive = (id: string) => persist(packages.map(p => p.id === id ? { ...p, active: !p.active } : p));

  // ── Media picker helpers ──────────────────────────────────────────────────
  const bannerItem   = editing ? mediaLib.find(m => m.id === editing.banner_image_id) : null;
  const pickableMeds = mediaLib.filter(m => m.type.startsWith('image') || m.type.startsWith('video'));

  const addFileToPackage = (item: MediaItem) => {
    if (!editing) return;
    if (editing.media_files.some(f => f.media_id === item.id)) return; // already added
    const pf: PackageFile = { media_id: item.id, name: item.name, type: item.type };
    setEditing({ ...editing, media_files: [...editing.media_files, pf] });
  };

  const removeFile = (mediaId: string) => {
    if (!editing) return;
    setEditing({ ...editing, media_files: editing.media_files.filter(f => f.media_id !== mediaId) });
  };

  // Generate package pitch text automatically from package data
  const generatePitchText = (pkg: Package) => {
    const lines: string[] = [];
    lines.push(`📦 *${pkg.name}*${pkg.tagline ? ` — ${pkg.tagline}` : ''}`);
    if (pkg.package_preview_description) lines.push(`\n${pkg.package_preview_description}`);
    else if (pkg.description) lines.push(`\n${pkg.description}`);
    if (pkg.media_files.length > 0) {
      lines.push('\n📂 *Inhalt:*');
      pkg.media_files.forEach(f => {
        const typeLabel = f.type.startsWith('video') ? '🎬 Video' : f.type.startsWith('image') ? '🖼️ Bild' : '📄 Datei';
        lines.push(`• ${typeLabel}: ${f.name}${f.duration ? ` (${f.duration})` : ''}`);
      });
    }
    if (pkg.price) lines.push(`\n💰 Preis: *${pkg.price} ${pkg.currency}*`);
    if (pkg.payment_link) lines.push(`\n🔗 Kaufen: ${pkg.payment_link}`);
    return lines.join('\n');
  };

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'960px', color: C.t1 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Pakete</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Angebote die der Bot automatisch pitcht — inkl. Vorschau, Dateien & Kauflink</p>
          </div>
          <button onClick={openNew} style={{ padding:'10px 18px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            + Neues Paket
          </button>
        </div>

        {status && (
          <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', fontSize:'13px',
            background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
            color: status.startsWith('✓') ? C.green : C.red,
            border:`1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.2)' : 'rgba(255,69,58,0.2)'}`,
          }}>{status}</div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:'80px', color: C.t3 }}>Laden…</div>
        ) : packages.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px' }}>
            <div style={{ fontSize:'48px', marginBottom:'14px' }}>📦</div>
            <div style={{ fontSize:'15px', fontWeight:600, color: C.t2, marginBottom:'8px' }}>Noch keine Pakete</div>
            <div style={{ fontSize:'13px', color: C.t3, marginBottom:'20px' }}>
              Erstelle dein erstes Paket — der Bot pitcht es automatisch sobald ein Lead in die Monetization-Phase wechselt.
            </div>
            <button onClick={openNew} style={{ padding:'11px 24px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
              + Paket erstellen
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
            {packages.map(pkg => {
              const banner = mediaLib.find(m => m.id === pkg.banner_image_id);
              return (
                <div key={pkg.id} style={{
                  background: C.s1, borderRadius:'18px', border:`1px solid ${pkg.active ? C.sep : 'rgba(255,255,255,0.04)'}`,
                  overflow:'hidden', opacity: pkg.active ? 1 : 0.55,
                }}>
                  <div style={{ display:'flex', gap:0 }}>
                    {/* Banner preview */}
                    <div style={{ width:'140px', flexShrink:0, background: C.s2, minHeight:'120px', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                      {banner?.dataUrl && banner.type.startsWith('image') ? (
                        <img src={banner.dataUrl} alt="banner" style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }} />
                      ) : banner?.dataUrl && banner.type.startsWith('video') ? (
                        <video src={banner.dataUrl} muted style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }} />
                      ) : (
                        <span style={{ fontSize:'36px' }}>📦</span>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex:1, padding:'16px 18px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'10px' }}>
                        <div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                            <span style={{ fontWeight:700, fontSize:'16px' }}>{pkg.name}</span>
                            {pkg.tagline && <span style={{ fontSize:'12px', color: C.t3 }}>{pkg.tagline}</span>}
                            <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'20px',
                              background: pkg.active ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.06)',
                              color: pkg.active ? C.green : C.t3, border:`1px solid ${pkg.active ? 'rgba(48,209,88,0.25)' : C.sep}`,
                            }}>
                              {pkg.active ? 'Aktiv' : 'Pausiert'}
                            </span>
                          </div>
                          {pkg.description && <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px', fontStyle:'italic' }}>{pkg.description}</div>}
                          {pkg.package_preview_description && (
                            <div style={{ fontSize:'13px', color: C.t2, marginBottom:'8px', padding:'6px 10px', borderRadius:'8px', background:`${C.teal}0A`, borderLeft:`2px solid ${C.teal}60` }}>
                              <span style={{ fontSize:'10px', color: C.teal, fontWeight:700, marginRight:'6px' }}>👁 WAS DER USER SIEHT</span>
                              {pkg.package_preview_description}
                            </div>
                          )}
                          {/* File list */}
                          {pkg.media_files.length > 0 && (
                            <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'8px' }}>
                              {pkg.media_files.map(f => (
                                <span key={f.media_id} style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'6px', background: C.s3, color: C.t2 }}>
                                  {iconFor(f.type)} {f.name}{f.duration ? ` · ${f.duration}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display:'flex', gap:'14px', fontSize:'12px', color: C.t3, flexWrap:'wrap' }}>
                            {pkg.price && <span style={{ color: C.orange, fontWeight:700 }}>💰 {pkg.price} {pkg.currency}</span>}
                            {pkg.keywords && <span>🔑 {pkg.keywords}</span>}
                            {pkg.payment_link && <span style={{ color: C.blue }}>🔗 Kauflink</span>}
                            {pkg.dynamic
                              ? <span style={{ color: C.teal }}>🎯 Dynamisch — {pkg.dynamic_rules?.videos ?? 0}V + {pkg.dynamic_rules?.images ?? 0}B</span>
                              : pkg.media_files.length > 0 && <span>📂 {pkg.media_files.length} Datei{pkg.media_files.length!==1?'en':''}</span>
                            }
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                          <button onClick={() => toggleActive(pkg.id)} style={{ padding:'6px 10px', borderRadius:'9px', background: C.s3, border:'none', color: C.t2, fontSize:'11px', cursor:'pointer' }}>
                            {pkg.active ? 'Pause' : 'Aktivieren'}
                          </button>
                          <button onClick={() => openEdit(pkg)} style={{ padding:'6px 10px', borderRadius:'9px', background: C.s3, border:'none', color: C.t2, fontSize:'11px', cursor:'pointer' }}>Bearbeiten</button>
                          <button onClick={() => deletePackage(pkg.id)} style={{ padding:'6px 9px', borderRadius:'9px', background:'rgba(255,69,58,0.1)', border:'1px solid rgba(255,69,58,0.2)', color: C.red, fontSize:'11px', cursor:'pointer' }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', overflowY:'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'560px', border:`1px solid ${C.sep}`, maxHeight:'92vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {packages.some(p => p.id === editing.id) ? 'Paket bearbeiten' : 'Neues Paket'}
            </h3>

            {/* Banner image */}
            <div style={{ marginBottom:'16px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'6px' }}>Vorschau-Banner (wird mit dem Paket gesendet)</div>
              <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                {/* Banner preview */}
                <div style={{ width:'80px', height:'60px', borderRadius:'10px', background: C.s2, overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {bannerItem?.dataUrl && bannerItem.type.startsWith('image') ? (
                    <img src={bannerItem.dataUrl} alt="banner" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : bannerItem?.dataUrl && bannerItem.type.startsWith('video') ? (
                    <video src={bannerItem.dataUrl} muted style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <span style={{ fontSize:'24px' }}>📦</span>
                  )}
                </div>
                <div style={{ flex:1 }}>
                  <button onClick={() => setMediaPicker('banner')} style={{ width:'100%', padding:'8px 12px', borderRadius:'10px', background: C.s2, border:`1px solid ${C.sep}`, color: C.blue, fontSize:'12px', fontWeight:600, cursor:'pointer', marginBottom:'4px' }}>
                    🖼️ Bild aus Media Library wählen
                  </button>
                  {editing.banner_image_id && (
                    <button onClick={() => setEditing({ ...editing, banner_image_id: '' })} style={{ width:'100%', padding:'5px', borderRadius:'8px', background:'none', border:'none', color: C.t3, fontSize:'11px', cursor:'pointer' }}>
                      ✕ Banner entfernen
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Name + tagline */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'13px' }}>
              <label>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Name *</div>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="z.B. Hot Bundle"
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Tagline</div>
                <input value={editing.tagline} onChange={e => setEditing({ ...editing, tagline: e.target.value })}
                  placeholder="Kurzer Untertitel"
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </label>
            </div>

            {/* Description (internal notes) */}
            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Beschreibung <span style={{ color: C.t3, fontWeight:400 }}>(interne Notiz)</span></div>
              <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="Interne Notiz zum Paket (wird dem Fan nicht gezeigt)"
                rows={2}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }} />
            </label>

            {/* Package preview description — what the buyer will see */}
            <label style={{ display:'block', marginBottom:'16px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>
                Was der User sieht <span style={{ color: C.teal }}>👁 (für Bot-Antworten + Paketmenü)</span>
              </div>
              <textarea
                value={editing.package_preview_description}
                onChange={e => setEditing({ ...editing, package_preview_description: e.target.value })}
                placeholder="Beschreibe kurz was der Käufer in diesem Paket zu sehen bekommt.&#10;z.B. Outfit, Stimmung, Setting, was passiert.&#10;&#10;Wenn ein Fan fragt 'Was ist im Paket?' antwortet der Bot NUR mit diesem Text."
                rows={4}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.teal}40`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}
              />
              <div style={{ fontSize:'11px', color: C.teal, marginTop:'4px' }}>
                🛡 Bot erfindet keine Details — er antwortet ausschließlich mit diesem Text wenn jemand fragt "was ist drin?"
              </div>
            </label>

            {/* Dynamic toggle */}
            <div style={{ marginBottom:'16px', padding:'14px', borderRadius:'12px', background: C.s2, border:`1px solid ${C.sep}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: editing.dynamic ? '14px' : '0' }}>
                <div>
                  <div style={{ fontSize:'13px', fontWeight:600, color: C.t1 }}>🎯 Dynamische Zusammenstellung</div>
                  <div style={{ fontSize:'11px', color: C.t3, marginTop:'2px' }}>
                    {editing.dynamic
                      ? 'Dateien werden per Keyword aus der Media Library gewählt'
                      : 'Feste Dateien — du wählst was im Paket ist'}
                  </div>
                </div>
                <button
                  onClick={() => setEditing({ ...editing, dynamic: !editing.dynamic })}
                  style={{
                    width:'42px', height:'24px', borderRadius:'12px', border:'none', cursor:'pointer',
                    background: editing.dynamic ? C.blue : C.s4, position:'relative', transition:'background 0.2s', flexShrink:0,
                  }}
                >
                  <div style={{
                    position:'absolute', top:'3px', left: editing.dynamic ? '21px' : '3px',
                    width:'18px', height:'18px', borderRadius:'50%', background:'#fff', transition:'left 0.2s',
                  }} />
                </button>
              </div>

              {editing.dynamic && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <label>
                    <div style={{ fontSize:'11px', color: C.t3, marginBottom:'4px' }}>Anzahl Videos</div>
                    <input
                      type="number" min="0" max="20"
                      value={editing.dynamic_rules.videos}
                      onChange={e => setEditing({ ...editing, dynamic_rules: { ...editing.dynamic_rules, videos: Math.max(0, parseInt(e.target.value)||0) } })}
                      style={{ width:'100%', background: C.s3, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'7px 10px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }}
                    />
                  </label>
                  <label>
                    <div style={{ fontSize:'11px', color: C.t3, marginBottom:'4px' }}>Anzahl Bilder</div>
                    <input
                      type="number" min="0" max="50"
                      value={editing.dynamic_rules.images}
                      onChange={e => setEditing({ ...editing, dynamic_rules: { ...editing.dynamic_rules, images: Math.max(0, parseInt(e.target.value)||0) } })}
                      style={{ width:'100%', background: C.s3, border:`1px solid ${C.sep}`, borderRadius:'8px', padding:'7px 10px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }}
                    />
                  </label>
                  <div style={{ gridColumn:'1/-1', fontSize:'11px', color: C.teal, padding:'6px 8px', background:'rgba(90,200,250,0.06)', borderRadius:'8px' }}>
                    💡 Der Bot sucht beim Senden automatisch passende Dateien aus der Media Library — basierend auf dem Keyword das der Fan erwähnt hat (z.B. "squirting" → Squirting-Videos + Bilder)
                  </div>
                </div>
              )}
            </div>

            {/* Media files (only shown for non-dynamic packages) */}
            {!editing.dynamic && (
            <div style={{ marginBottom:'16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' }}>
                <div style={{ fontSize:'12px', color: C.t3 }}>📂 Enthaltene Dateien ({editing.media_files.length})</div>
                <button onClick={() => setMediaPicker('files')} style={{ padding:'4px 10px', borderRadius:'8px', background: C.s2, border:`1px solid ${C.sep}`, color: C.blue, fontSize:'11px', fontWeight:600, cursor:'pointer' }}>
                  + Aus Media Library
                </button>
              </div>
              {editing.media_files.length === 0 ? (
                <div style={{ padding:'12px', borderRadius:'10px', background: C.s2, border:`1px dashed ${C.sep}`, textAlign:'center', fontSize:'12px', color: C.t3 }}>
                  Keine Dateien — klicke "Aus Media Library" um Dateien hinzuzufügen
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                  {editing.media_files.map(f => {
                    const libItem = mediaLib.find(m => m.id === f.media_id);
                    return (
                      <div key={f.media_id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', borderRadius:'10px', background: C.s2, border:`1px solid ${C.sep}` }}>
                        {libItem?.dataUrl && libItem.type.startsWith('image') && (
                          <img src={libItem.dataUrl} alt={f.name} style={{ width:'32px', height:'32px', borderRadius:'6px', objectFit:'cover', flexShrink:0 }} />
                        )}
                        <span style={{ fontSize:'16px', flexShrink:0 }}>{iconFor(f.type)}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize:'10px', color: C.t3 }}>{f.type.startsWith('video') ? '🎬 Video' : f.type.startsWith('image') ? '🖼️ Bild' : '📄 Datei'}{libItem ? ` · ${fmt(libItem.size)}` : ''}</div>
                        </div>
                        {/* Duration for video */}
                        {f.type.startsWith('video') && (
                          <input
                            value={f.duration || ''}
                            onChange={e => setEditing({ ...editing, media_files: editing.media_files.map(mf => mf.media_id === f.media_id ? { ...mf, duration: e.target.value } : mf) })}
                            placeholder="z.B. 2:34"
                            title="Videolänge (optional)"
                            style={{ width:'58px', background: C.s3, border:`1px solid ${C.sep}`, borderRadius:'6px', padding:'4px 6px', color: C.t2, fontSize:'11px', outline:'none', textAlign:'center' }}
                          />
                        )}
                        <button onClick={() => removeFile(f.media_id)} style={{ background:'none', border:'none', color: C.t3, cursor:'pointer', fontSize:'16px', flexShrink:0, padding:'0 2px' }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Price + currency + payment link */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 60px', gap:'10px', marginBottom:'13px' }}>
              <label>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Preis</div>
                <input value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })}
                  placeholder="29.99"
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Währung</div>
                <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}
                  style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 8px', color: C.t1, fontSize:'13px', outline:'none' }}>
                  {['€','$','£','CHF'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Kauflink</div>
              <input value={editing.payment_link} onChange={e => setEditing({ ...editing, payment_link: e.target.value })}
                placeholder="https://buy.stripe.com/…"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
            </label>

            {/* Package pitch text */}
            <div style={{ marginBottom:'13px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
                <div style={{ fontSize:'12px', color: C.t3 }}>Bot-Nachricht (wird an Fan gesendet)</div>
                <button onClick={() => setEditing({ ...editing, package_text: generatePitchText(editing) })} style={{ background:'none', border:'none', color: C.blue, cursor:'pointer', fontSize:'11px', fontWeight:600, padding:0 }}>
                  ✨ Auto-generieren
                </button>
              </div>
              <textarea value={editing.package_text} onChange={e => setEditing({ ...editing, package_text: e.target.value })}
                placeholder="Klicke '✨ Auto-generieren' oder schreibe den Text manuell"
                rows={5}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.5, boxSizing:'border-box' }} />
              <div style={{ fontSize:'11px', color: C.t3, marginTop:'3px' }}>Dieser Text wird gesendet wenn ein Fan das Paket anfragt oder der Bot es pitcht</div>
            </div>

            {/* Keywords */}
            <label style={{ display:'block', marginBottom:'13px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'4px' }}>Keywords (kommagetrennt)</div>
              <input value={editing.keywords} onChange={e => setEditing({ ...editing, keywords: e.target.value })}
                placeholder="kaufen, preis, paket, bundle, inhalt"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
            </label>

            <div style={{ display:'flex', gap:'10px', marginTop:'4px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background: C.s3, border:'none', color: C.t2, fontSize:'14px', cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={confirmEdit} disabled={saving || !editing.name.trim()} style={{
                flex:2, padding:'11px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff',
                fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:(saving||!editing.name.trim())?0.5:1,
              }}>
                {saving ? 'Speichern…' : 'Paket speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Media Picker Modal ─────────────────────────────────────────────────── */}
      {mediaPicker && editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
          onClick={e => { if (e.target === e.currentTarget) setMediaPicker(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'600px', border:`1px solid ${C.sep}`, maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'16px', fontWeight:700 }}>
                {mediaPicker === 'banner' ? '🖼️ Banner-Bild wählen' : '📂 Dateien zum Paket hinzufügen'}
              </h3>
              <button onClick={() => setMediaPicker(null)} style={{ background:'none', border:'none', color: C.t3, cursor:'pointer', fontSize:'20px' }}>✕</button>
            </div>
            {mediaLib.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px', color: C.t3 }}>
                <div style={{ fontSize:'32px', marginBottom:'10px' }}>📂</div>
                Noch keine Dateien in der Media Library — lade zuerst Dateien unter /media hoch
              </div>
            ) : (
              <div style={{ overflowY:'auto', flex:1 }}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'10px' }}>
                  {(mediaPicker === 'banner' ? pickableMeds : mediaLib).map(item => {
                    const alreadyAdded = mediaPicker === 'files' && editing.media_files.some(f => f.media_id === item.id);
                    const isBanner = mediaPicker === 'banner' && editing.banner_image_id === item.id;
                    return (
                      <div key={item.id}
                        onClick={() => {
                          if (mediaPicker === 'banner') {
                            setEditing({ ...editing, banner_image_id: isBanner ? '' : item.id });
                          } else {
                            if (!alreadyAdded) addFileToPackage(item);
                          }
                        }}
                        style={{
                          borderRadius:'12px', overflow:'hidden', cursor: alreadyAdded ? 'default' : 'pointer',
                          border:`2px solid ${(isBanner || alreadyAdded) ? C.green : C.sep}`,
                          position:'relative', opacity: alreadyAdded ? 0.6 : 1, transition:'border-color 0.15s',
                        }}>
                        <div style={{ height:'90px', background: C.s2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {item.dataUrl && item.type.startsWith('image') ? (
                            <img src={item.dataUrl} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          ) : item.dataUrl && item.type.startsWith('video') ? (
                            <video src={item.dataUrl} muted style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          ) : (
                            <span style={{ fontSize:'32px' }}>{iconFor(item.type)}</span>
                          )}
                        </div>
                        <div style={{ padding:'6px 8px', background: C.s1 }}>
                          <div style={{ fontSize:'10px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                          <div style={{ fontSize:'9px', color: C.t3 }}>{item.tag}</div>
                        </div>
                        {(isBanner || alreadyAdded) && (
                          <div style={{ position:'absolute', top:'6px', right:'6px', background: C.green, borderRadius:'50%', width:'18px', height:'18px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px' }}>✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {mediaPicker === 'files' && (
              <button onClick={() => setMediaPicker(null)} style={{ marginTop:'16px', padding:'10px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer', flexShrink:0 }}>
                ✓ Fertig ({editing.media_files.length} Datei{editing.media_files.length!==1?'en':''} ausgewählt)
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:600px) { div[style*="minmax(130px"]{grid-template-columns:repeat(3,1fr)!important} }
      `}</style>
    </DashboardLayout>
  );
}
