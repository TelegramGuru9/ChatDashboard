'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import Script from 'next/script';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface MediaItem {
  id: string; name: string; type: string; size: number; dataUrl?: string; fileUrl?: string;
  tag: string; description: string; price: string; payment_link: string; message_to_user: string; addedAt: string;
}
interface PackageFile { media_id: string; name: string; type: string; duration?: string; }
interface DynamicRules { videos: number; images: number; }
interface Package {
  id: string; name: string; tagline: string; price: string; currency: string;
  payment_link: string; stripe_button_code: string; banner_image_id: string;
  media_files: PackageFile[]; dynamic: boolean; dynamic_rules: DynamicRules;
  description: string; package_preview_description: string; package_text: string;
  keywords: string; send_after_messages: number; active: boolean;
}

const BLANK: Package = {
  id: '', name: '', tagline: '', price: '', currency: '€',
  payment_link: '', stripe_button_code: '', banner_image_id: '',
  media_files: [], dynamic: false, dynamic_rules: { videos: 2, images: 8 },
  description: '', package_preview_description: '', package_text: '', keywords: '',
  send_after_messages: 0, active: true,
};

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes/1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes/1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
function iconFor(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf'))    return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}
function getMediaSrc(item: MediaItem) {
  if (item.fileUrl) return `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace('/api/v1','').replace('/api/v1','')}${item.fileUrl}`;
  return item.dataUrl;
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

  const load = useCallback(async () => {
    try {
      const [pkgRes, libRes] = await Promise.all([
        fetch(withCreator(`${api}/config/packages`)),
        fetch(withCreator(`${api}/config/media_library`)),
      ]);
      const pkgData = await pkgRes.json();
      const libData = await libRes.json();
      const val = pkgData.value;
      const rawPkgs: Package[] = (Array.isArray(val) ? val : (Array.isArray(val?.packages) ? val.packages : [])).map((p: any) => ({
        ...BLANK, ...p,
        media_files: p.media_files || [], banner_image_id: p.banner_image_id || '',
        payment_link: p.payment_link || '', package_text: p.package_text || p.welcome_message || '',
        currency: p.currency || '€', dynamic: p.dynamic ?? false,
        dynamic_rules: p.dynamic_rules || { videos: 2, images: 8 },
        package_preview_description: p.package_preview_description || '',
        stripe_button_code: p.stripe_button_code || '',
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setPackages(updated); toast('✓ Gespeichert');
    } catch { toast('⚠ Fehler beim Speichern'); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const confirmEdit = () => {
    if (!editing || !editing.name.trim()) return;
    const updated = packages.some(p => p.id === editing.id)
      ? packages.map(p => p.id === editing.id ? editing : p)
      : [...packages, editing];
    persist(updated); setEditing(null);
  };

  const addFileToPackage = (item: MediaItem) => {
    if (!editing || editing.media_files.some(f => f.media_id === item.id)) return;
    setEditing({ ...editing, media_files: [...editing.media_files, { media_id: item.id, name: item.name, type: item.type }] });
  };

  const generatePitchText = (pkg: Package) => {
    const lines = [`📦 *${pkg.name}*${pkg.tagline ? ` — ${pkg.tagline}` : ''}`];
    if (pkg.package_preview_description) lines.push(`\n${pkg.package_preview_description}`);
    else if (pkg.description) lines.push(`\n${pkg.description}`);
    if (pkg.media_files.length > 0) {
      lines.push('\n📂 *Inhalt:*');
      pkg.media_files.forEach(f => lines.push(`• ${f.type.startsWith('video') ? '🎬' : '🖼️'} ${f.name}${f.duration ? ` (${f.duration})` : ''}`));
    }
    if (pkg.price) lines.push(`\n💰 Preis: *${pkg.price} ${pkg.currency}*`);
    if (pkg.payment_link) lines.push(`\n🔗 Kaufen: ${pkg.payment_link}`);
    return lines.join('\n');
  };

  const bannerItem   = editing ? mediaLib.find(m => m.id === editing.banner_image_id) : null;
  const pickableMeds = mediaLib.filter(m => m.type.startsWith('image') || m.type.startsWith('video'));

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pakete</h1>
            <p className="text-sm text-muted-foreground mt-1">Angebote die der Bot automatisch pitcht</p>
          </div>
          <Button onClick={() => setEditing({ ...BLANK, id:`pkg-${Date.now()}` })}>+ Neues Paket</Button>
        </div>

        {status && (
          <div className={cn("px-3.5 py-2.5 rounded-xl text-sm border", status.startsWith('✓') ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400")}>
            {status}
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Laden…</div>
        ) : packages.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">📦</div>
            <div className="font-semibold mb-1">Noch keine Pakete</div>
            <div className="text-sm text-muted-foreground mb-5">Der Bot pitcht Pakete automatisch sobald ein Lead in die Monetization-Phase wechselt.</div>
            <Button onClick={() => setEditing({ ...BLANK, id:`pkg-${Date.now()}` })}>+ Paket erstellen</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {packages.map(pkg => {
              const banner = mediaLib.find(m => m.id === pkg.banner_image_id);
              const bannerSrc = banner ? getMediaSrc(banner) : null;
              return (
                <Card key={pkg.id} className={cn("overflow-hidden", !pkg.active && "opacity-55")}>
                  <div className="flex">
                    {/* Banner */}
                    <div className="w-32 flex-shrink-0 bg-muted flex items-center justify-center min-h-[100px] relative overflow-hidden">
                      {bannerSrc && banner?.type.startsWith('image') ? (
                        <img src={bannerSrc} alt="banner" className="absolute inset-0 w-full h-full object-cover" />
                      ) : bannerSrc && banner?.type.startsWith('video') ? (
                        <video src={bannerSrc} muted className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">📦</span>
                      )}
                    </div>
                    {/* Content */}
                    <CardContent className="flex-1 py-3 px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-base">{pkg.name}</span>
                            {pkg.tagline && <span className="text-xs text-muted-foreground">{pkg.tagline}</span>}
                            <Badge variant="outline" className={cn("text-xs", pkg.active ? "text-green-400 border-green-400/30 bg-green-400/10" : "text-muted-foreground")}>
                              {pkg.active ? 'Aktiv' : 'Pausiert'}
                            </Badge>
                          </div>
                          {pkg.package_preview_description && (
                            <div className="text-sm text-muted-foreground mb-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/5 border-l-2 border-cyan-500/40">
                              <span className="text-[10px] text-cyan-400 font-bold mr-1.5">👁 WAS DER USER SIEHT</span>
                              {pkg.package_preview_description}
                            </div>
                          )}
                          {pkg.media_files.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap mb-2">
                              {pkg.media_files.map(f => (
                                <span key={f.media_id} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  {iconFor(f.type)} {f.name}{f.duration ? ` · ${f.duration}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                            {pkg.price && <span className="text-orange-400 font-bold">💰 {pkg.price} {pkg.currency}</span>}
                            {pkg.keywords && <span>🔑 {pkg.keywords}</span>}
                            {pkg.payment_link && <span className="text-primary">🔗 Kauflink</span>}
                            {pkg.dynamic ? <span className="text-cyan-400">🎯 Dynamisch — {pkg.dynamic_rules?.videos}V + {pkg.dynamic_rules?.images}B</span>
                              : pkg.media_files.length > 0 && <span>📂 {pkg.media_files.length} Datei{pkg.media_files.length!==1?'en':''}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <Button variant="outline" size="sm" onClick={() => persist(packages.map(p => p.id === pkg.id ? { ...p, active: !p.active } : p))}>
                            {pkg.active ? 'Pause' : 'Aktivieren'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditing({ ...BLANK, ...pkg })}>Bearbeiten</Button>
                          <Button variant="destructive" size="sm" onClick={() => { if(confirm('Paket löschen?')) persist(packages.filter(p => p.id !== pkg.id)); }}>🗑</Button>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto my-auto">
            <h3 className="font-bold text-base mb-5">
              {packages.some(p => p.id === editing.id) ? 'Paket bearbeiten' : 'Neues Paket'}
            </h3>

            {/* Banner */}
            <div className="mb-4">
              <div className="text-xs text-muted-foreground mb-1.5">Vorschau-Banner</div>
              <div className="flex gap-2.5 items-center">
                <div className="w-20 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {(() => { const src = bannerItem ? getMediaSrc(bannerItem) : null; return src && bannerItem?.type.startsWith('image') ? <img src={src} className="w-full h-full object-cover" /> : src && bannerItem?.type.startsWith('video') ? <video src={src} muted className="w-full h-full object-cover" /> : <span className="text-2xl">📦</span>; })()}
                </div>
                <div className="flex-1 space-y-1.5">
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setMediaPicker('banner')}>🖼️ Bild wählen</Button>
                  {editing.banner_image_id && <button onClick={() => setEditing({ ...editing, banner_image_id: '' })} className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors">✕ Banner entfernen</button>}
                </div>
              </div>
            </div>

            {/* Name + tagline */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <label>
                <div className="text-xs text-muted-foreground mb-1">Name *</div>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="z.B. Hot Bundle"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
              <label>
                <div className="text-xs text-muted-foreground mb-1">Tagline</div>
                <input value={editing.tagline} onChange={e => setEditing({ ...editing, tagline: e.target.value })} placeholder="Kurzer Untertitel"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
            </div>

            {/* Internal description */}
            <label className="block mb-3">
              <div className="text-xs text-muted-foreground mb-1">Beschreibung <span className="font-normal">(interne Notiz)</span></div>
              <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="Interne Notiz (wird dem Fan nicht gezeigt)" rows={2}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none resize-y font-inherit" />
            </label>

            {/* Preview description */}
            <label className="block mb-4">
              <div className="text-xs text-muted-foreground mb-1">Was der User sieht <span className="text-cyan-400">👁 (für Bot-Antworten)</span></div>
              <textarea value={editing.package_preview_description} onChange={e => setEditing({ ...editing, package_preview_description: e.target.value })}
                placeholder={"Was der Käufer sehen bekommt.\nz.B. Outfit, Stimmung, Setting."}
                rows={3}
                className="w-full bg-muted border border-cyan-500/40 rounded-xl px-3 py-2 text-sm outline-none resize-y font-inherit" />
            </label>

            {/* Dynamic toggle */}
            <div className="mb-4 p-3.5 rounded-xl bg-muted border border-border">
              <div className={cn("flex items-center justify-between", editing.dynamic && "mb-3")}>
                <div>
                  <div className="text-sm font-semibold">🎯 Dynamische Zusammenstellung</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{editing.dynamic ? 'Dateien per Keyword aus Media Library' : 'Feste Dateien — du wählst was im Paket ist'}</div>
                </div>
                <div onClick={() => setEditing({ ...editing, dynamic: !editing.dynamic })}
                  className={cn("w-10 h-6 rounded-full relative cursor-pointer transition-colors", editing.dynamic ? "bg-primary" : "bg-muted-foreground/30")}>
                  <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all", editing.dynamic ? "left-5" : "left-1")} />
                </div>
              </div>
              {editing.dynamic && (
                <div className="grid grid-cols-2 gap-2.5">
                  <label>
                    <div className="text-[11px] text-muted-foreground mb-1">Videos</div>
                    <input type="number" min="0" max="20" value={editing.dynamic_rules.videos}
                      onChange={e => setEditing({ ...editing, dynamic_rules: { ...editing.dynamic_rules, videos: Math.max(0, parseInt(e.target.value)||0) } })}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none" />
                  </label>
                  <label>
                    <div className="text-[11px] text-muted-foreground mb-1">Bilder</div>
                    <input type="number" min="0" max="50" value={editing.dynamic_rules.images}
                      onChange={e => setEditing({ ...editing, dynamic_rules: { ...editing.dynamic_rules, images: Math.max(0, parseInt(e.target.value)||0) } })}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none" />
                  </label>
                </div>
              )}
            </div>

            {/* Media files */}
            {!editing.dynamic && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-muted-foreground">📂 Enthaltene Dateien ({editing.media_files.length})</div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setMediaPicker('files')}>+ Aus Media Library</Button>
                </div>
                {editing.media_files.length === 0 ? (
                  <div className="py-3 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground">Keine Dateien</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {editing.media_files.map(f => {
                      const li = mediaLib.find(m => m.id === f.media_id);
                      const src = li ? getMediaSrc(li) : null;
                      return (
                        <div key={f.media_id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted border border-border">
                          {src && li?.type.startsWith('image') && <img src={src} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />}
                          <span className="text-base flex-shrink-0">{iconFor(f.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground">{f.type.startsWith('video') ? '🎬' : '🖼️'}{li ? ` · ${fmt(li.size)}` : ''}</div>
                          </div>
                          {f.type.startsWith('video') && (
                            <input value={f.duration||''} onChange={e => setEditing({ ...editing, media_files: editing.media_files.map(mf => mf.media_id===f.media_id ? { ...mf, duration: e.target.value } : mf) })}
                              placeholder="2:34" title="Videolänge"
                              className="w-14 bg-card border border-border rounded-md px-1.5 py-1 text-[11px] outline-none text-center" />
                          )}
                          <button onClick={() => setEditing({ ...editing, media_files: editing.media_files.filter(mf => mf.media_id!==f.media_id) })} className="text-muted-foreground hover:text-foreground text-base px-1">×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Price + currency */}
            <div className="grid grid-cols-[1fr_70px] gap-2.5 mb-3">
              <label>
                <div className="text-xs text-muted-foreground mb-1">Preis</div>
                <input value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })} placeholder="29.99"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
              <label>
                <div className="text-xs text-muted-foreground mb-1">Währung</div>
                <select value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })}
                  className="w-full bg-muted border border-border rounded-xl px-2 py-2 text-sm outline-none cursor-pointer">
                  {['€','$','£','CHF'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            {/* Stripe */}
            <div className="p-3.5 rounded-xl bg-green-500/5 border border-green-500/20 mb-3 space-y-2.5">
              <div className="text-[11px] font-bold text-green-500 uppercase tracking-wide">💳 Stripe Zahlung</div>
              <label className="block">
                <div className="text-xs text-muted-foreground mb-1">Kauflink (buy.stripe.com)</div>
                <input value={editing.payment_link} onChange={e => setEditing({ ...editing, payment_link: e.target.value })} placeholder="https://buy.stripe.com/…"
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
              </label>
              <label className="block">
                <div className="text-xs text-muted-foreground mb-1">Stripe Buy Button Code</div>
                <textarea value={editing.stripe_button_code} onChange={e => setEditing({ ...editing, stripe_button_code: e.target.value })}
                  placeholder={'<stripe-buy-button\n  buy-button-id="buy_btn_…"\n  publishable-key="pk_live_…"\n></stripe-buy-button>'}
                  rows={3} className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-[11px] outline-none resize-none font-mono leading-relaxed" />
                {editing.stripe_button_code?.includes('buy-button-id') && (
                  <div className="mt-2 bg-muted border border-border rounded-xl p-4 flex justify-center min-h-14">
                    <Script src="https://js.stripe.com/v3/buy-button.js" strategy="lazyOnload" />
                    <div dangerouslySetInnerHTML={{ __html: editing.stripe_button_code }} />
                  </div>
                )}
              </label>
            </div>

            {/* Pitch text */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-muted-foreground">Bot-Nachricht</div>
                <button onClick={() => setEditing({ ...editing, package_text: generatePitchText(editing) })} className="text-[11px] text-primary font-semibold hover:underline">✨ Auto-generieren</button>
              </div>
              <textarea value={editing.package_text} onChange={e => setEditing({ ...editing, package_text: e.target.value })}
                placeholder="Klicke ✨ Auto-generieren oder schreibe manuell" rows={4}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none resize-y font-inherit leading-relaxed" />
            </div>

            {/* Keywords */}
            <label className="block mb-5">
              <div className="text-xs text-muted-foreground mb-1">Keywords (kommagetrennt)</div>
              <input value={editing.keywords} onChange={e => setEditing({ ...editing, keywords: e.target.value })} placeholder="kaufen, preis, paket"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
            </label>

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Abbrechen</Button>
              <Button className="flex-[2]" onClick={confirmEdit} disabled={saving || !editing.name.trim()}>
                {saving ? 'Speichern…' : 'Paket speichern'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Media Picker */}
      {mediaPicker && editing && (
        <div className="fixed inset-0 bg-black/85 z-[1100] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setMediaPicker(null); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="font-bold text-base">{mediaPicker === 'banner' ? '🖼️ Banner wählen' : '📂 Dateien hinzufügen'}</h3>
              <Button variant="ghost" size="icon" onClick={() => setMediaPicker(null)}><X size={16} /></Button>
            </div>
            {mediaLib.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">Noch keine Dateien — lade zuerst Dateien unter /media hoch</div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <div className="grid gap-2.5" style={{ gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))' }}>
                  {(mediaPicker === 'banner' ? pickableMeds : mediaLib).map(item => {
                    const alreadyAdded = mediaPicker === 'files' && editing.media_files.some(f => f.media_id === item.id);
                    const isBanner = mediaPicker === 'banner' && editing.banner_image_id === item.id;
                    const src = getMediaSrc(item);
                    return (
                      <div key={item.id} onClick={() => {
                        if (mediaPicker === 'banner') setEditing({ ...editing, banner_image_id: isBanner ? '' : item.id });
                        else if (!alreadyAdded) addFileToPackage(item);
                      }}
                        className={cn("rounded-xl overflow-hidden cursor-pointer border-2 relative transition-all",
                          (isBanner || alreadyAdded) ? "border-green-500" : "border-border hover:border-primary/50",
                          alreadyAdded && "opacity-60 cursor-default"
                        )}>
                        <div className="h-20 bg-muted flex items-center justify-center">
                          {src && item.type.startsWith('image') ? <img src={src} className="w-full h-full object-cover" />
                            : src && item.type.startsWith('video') ? <video src={src} muted className="w-full h-full object-cover" />
                            : <span className="text-3xl">{iconFor(item.type)}</span>}
                        </div>
                        <div className="p-1.5 bg-card">
                          <div className="text-[10px] font-semibold truncate">{item.name}</div>
                          <div className="text-[9px] text-muted-foreground">{item.tag}</div>
                        </div>
                        {(isBanner || alreadyAdded) && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[11px] text-white">✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {mediaPicker === 'files' && (
              <Button className="mt-4 flex-shrink-0" onClick={() => setMediaPicker(null)}>
                ✓ Fertig ({editing.media_files.length} Datei{editing.media_files.length!==1?'en':''})
              </Button>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
