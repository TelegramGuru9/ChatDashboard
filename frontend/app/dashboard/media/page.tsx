'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Upload, ChevronDown, X } from 'lucide-react';

interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  fileUrl?: string;
  tag: string;
  keywords: string;
  action: string;
  description: string;
  message_to_user: string;
  price: string;
  payment_link: string;
  addedAt: string;
}

interface MediaSettings { no_repeat: boolean; }

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

const CAT_COLORS = ['text-blue-400', 'text-purple-400', 'text-orange-400', 'text-cyan-400', 'text-pink-400', 'text-yellow-400', 'text-emerald-400', 'text-indigo-400'];
const CAT_BG     = ['bg-blue-400/10', 'bg-purple-400/10', 'bg-orange-400/10', 'bg-cyan-400/10', 'bg-pink-400/10', 'bg-yellow-400/10', 'bg-emerald-400/10', 'bg-indigo-400/10'];
const CAT_BORDER = ['border-blue-400/30', 'border-purple-400/30', 'border-orange-400/30', 'border-cyan-400/30', 'border-pink-400/30', 'border-yellow-400/30', 'border-emerald-400/30', 'border-indigo-400/30'];

function catClasses(name: string, categories: string[]) {
  if (name === 'Free') return { text: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' };
  const idx = categories.indexOf(name);
  const i   = idx < 0 ? 0 : idx % CAT_COLORS.length;
  return { text: CAT_COLORS[i], bg: CAT_BG[i], border: CAT_BORDER[i] };
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative w-11 h-6 rounded-full flex-shrink-0 cursor-pointer transition-colors duration-200",
        on ? "bg-green-500" : "bg-muted"
      )}
    >
      <div className={cn(
        "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200",
        on ? "left-6" : "left-1"
      )} />
    </button>
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
  const [categories, setCategories] = useState<string[]>([]);
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

  const LARGE_FILE_THRESHOLD = 500 * 1024;

  const uploadFileToServer = async (file: File): Promise<{ url: string; filename: string } | null> => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${api}/media/upload/file`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text().catch(() => res.status.toString()));
      return await res.json();
    } catch (e) { console.warn(`[media-upload] ${e}`); return null; }
  };

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
      const rawItems: MediaItem[] = (Array.isArray(lib.value) ? lib.value : []).map((i: any) => ({
        message_to_user: '', price: '', payment_link: '', ...i,
      }));
      setItems(rawItems);
      if (set.value && typeof set.value === 'object') setSettings({ no_repeat: set.value.no_repeat !== false });
      setCategories(Array.isArray(cat.value) ? cat.value : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  const saveLib = async (updated: MediaItem[]) => {
    setSaving(true);
    try {
      const forDb = updated.map(item => item.fileUrl ? { ...item, dataUrl: undefined } : item);
      const res = await fetch(withCreator(`${api}/config/media_library`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forDb),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.status.toString()));
      setItems(updated);
    } catch (e) {
      toast(`⚠ Fehler beim Speichern: ${e instanceof Error ? e.message : e}`);
    } finally { setSaving(false); }
  };

  const saveSettings = async (updated: MediaSettings) => {
    setSettings(updated);
    fetch(withCreator(`${api}/config/media_settings`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const saveCategories = async (updated: string[]) => {
    setCategories(updated);
    fetch(withCreator(`${api}/config/media_categories`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(f => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isMedia = f.type.startsWith('image') || f.type.startsWith('video');
      if (isMedia && f.size > LARGE_FILE_THRESHOLD) {
        toast('⏳ Datei wird hochgeladen…');
        uploadFileToServer(f).then(result => {
          if (!result) { toast('⚠ Upload fehlgeschlagen'); return; }
          setEditing(emptyItem({ id, name: f.name, type: f.type, size: f.size, fileUrl: result.url }));
          toast('✓ Datei hochgeladen — Details ausfüllen & speichern');
        });
      } else if (isMedia) {
        const reader = new FileReader();
        reader.onload = e => setEditing(emptyItem({ id, name: f.name, type: f.type, size: f.size, dataUrl: e.target?.result as string }));
        reader.readAsDataURL(f);
      } else {
        setEditing(emptyItem({ id, name: f.name, type: f.type, size: f.size, tag: categories[0] || 'Free', action: 'send_file' }));
      }
    });
  };

  const addCategory = () => {
    const name = catInput.trim();
    if (!name || name.toLowerCase() === 'free' || categories.includes(name)) return;
    saveCategories([...categories, name]);
    setCatInput(''); toast(`✓ Kategorie "${name}" erstellt`);
  };

  const deleteCategory = (name: string) => {
    if (!confirm(`Kategorie "${name}" löschen?`)) return;
    saveCategories(categories.filter(c => c !== name));
    saveLib(items.map(i => i.tag === name ? { ...i, tag: 'Free' } : i));
    if (filter === name) setFilter('All');
    toast(`✓ "${name}" gelöscht`);
  };

  const confirmEdit = () => {
    if (!editing) return;
    const updated = items.some(i => i.id === editing.id)
      ? items.map(i => i.id === editing.id ? editing : i)
      : [...items, editing];
    saveLib(updated); setEditing(null); toast('✓ Gespeichert');
  };

  const deleteItem = (id: string) => {
    if (!confirm('Datei löschen?')) return;
    const target = items.find(i => i.id === id);
    if (target?.fileUrl) {
      const filename = target.fileUrl.split('/').pop();
      if (filename) fetch(`${api}/media/files/${filename}`, { method: 'DELETE' }).catch(() => {});
    }
    saveLib(items.filter(i => i.id !== id)); setPreviewing(null); toast('✓ Gelöscht');
  };

  const allTags   = ['Free', ...categories];
  const freeItems = items.filter(i => i.tag === 'Free');
  const visible   = filter === 'All' ? items : items.filter(i => i.tag === filter);

  const getMediaSrc = (item: MediaItem) => {
    if (item.fileUrl) {
      const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace('/api/v1', '');
      return `${base}${item.fileUrl}`;
    }
    return item.dataUrl;
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
            <p className="text-sm text-muted-foreground mt-1">{items.length} Dateien · {freeItems.length} Gratis-Teaser</p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="mr-1.5" />
            Datei hochladen
          </Button>
        </div>

        {/* Free teaser banner */}
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <span className="text-3xl">🎁</span>
                <div>
                  <div className="font-bold text-sm text-green-400">Gratis-Teaser</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {freeItems.length === 0
                      ? 'Noch keine Teaser — Bot schickt keinen Teaser vor dem Paket-Pitch'
                      : `${freeItems.length} Teaser verfügbar — Bot wählt einen zufällig`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2">
                <div>
                  <div className="text-xs font-semibold">Nie zweimal dasselbe</div>
                  <div className="text-[10px] text-muted-foreground">Pro Kontakt jeden Teaser nur einmal</div>
                </div>
                <Toggle on={settings.no_repeat} onChange={v => saveSettings({ ...settings, no_repeat: v })} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category manager */}
        <Card>
          <button
            onClick={() => setCatOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors rounded-xl"
          >
            <span>🗂 Kategorien verwalten ({categories.length} benutzerdefiniert)</span>
            <ChevronDown size={16} className={cn("text-muted-foreground transition-transform", catOpen && "rotate-180")} />
          </button>
          {catOpen && (
            <CardContent className="pt-0 pb-4 border-t border-border">
              <div className="flex gap-2 flex-wrap mt-3 mb-3">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-400/10 text-green-400 border border-green-400/30">🎁 Free (fest)</span>
                {categories.map(cat => {
                  const cls = catClasses(cat, categories);
                  return (
                    <div key={cat} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold", cls.bg, cls.border, cls.text)}>
                      {cat}
                      <button onClick={() => deleteCategory(cat)} className="text-muted-foreground hover:text-foreground ml-0.5 leading-none text-xs">×</button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  value={catInput}
                  onChange={e => setCatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                  placeholder="Neue Kategorie (z.B. VIP, Outdoor…)"
                  className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none"
                />
                <Button size="sm" onClick={addCategory}>+ Hinzufügen</Button>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Status toast */}
        {status && (
          <div className={cn(
            "px-3.5 py-2.5 rounded-xl text-sm border",
            status.startsWith('✓') ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-orange-500/10 border-orange-500/20 text-orange-400"
          )}>{status}</div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
            dragging ? "border-green-500 bg-green-500/5" : "border-border hover:border-primary/50 bg-card"
          )}
        >
          <div className="text-3xl mb-2">📁</div>
          <div className="font-semibold text-sm mb-1">Dateien ablegen oder klicken</div>
          <div className="text-xs text-muted-foreground">Bilder & Videos → Standard: Gratis-Teaser</div>
        </div>

        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,application/pdf,audio/*" className="hidden" onChange={e => addFiles(e.target.files)} />

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {['All', ...allTags].map(t => {
            const count  = t === 'All' ? items.length : items.filter(i => i.tag === t).length;
            const active = filter === t;
            const cls    = catClasses(t, categories);
            return (
              <button key={t} onClick={() => setFilter(t)} className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex-shrink-0",
                active ? cn(cls.bg, cls.border, cls.text) : "border-border text-muted-foreground hover:border-muted-foreground"
              )}>
                {t === 'Free' ? '🎁 ' : ''}{t} ({count})
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Lade…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📂</div>
            <div className="font-semibold mb-1">{filter === 'Free' ? 'Noch keine Gratis-Teaser' : `Keine Dateien in "${filter}"`}</div>
            <div className="text-sm text-muted-foreground">Lade Dateien hoch um sie hier zu sehen</div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {visible.map(item => {
              const isFree   = item.tag === 'Free';
              const isVideo  = item.type.startsWith('video');
              const isImage  = item.type.startsWith('image');
              const mediaSrc = getMediaSrc(item);
              const cls      = catClasses(item.tag, categories);
              return (
                <Card key={item.id} className={cn(
                  "overflow-hidden transition-all duration-150 hover:-translate-y-0.5",
                  isFree ? "border-green-500/25 hover:border-green-500/50" : "hover:border-primary/40"
                )}>
                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewing(item)}
                    className="relative h-36 bg-muted flex items-center justify-center cursor-pointer overflow-hidden"
                  >
                    {isImage && mediaSrc ? (
                      <img src={mediaSrc} alt={item.name} className="w-full h-full object-cover" />
                    ) : isVideo && mediaSrc ? (
                      <>
                        <video src={mediaSrc} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <span className="text-base ml-0.5">▶</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <div className="text-4xl">{iconFor(item.type)}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{item.type.split('/')[1]?.toUpperCase() || 'FILE'}</div>
                      </div>
                    )}
                    {/* Tag badge */}
                    <span className={cn(
                      "absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-lg backdrop-blur",
                      isFree ? "bg-green-400/90 text-black" : "bg-black/65 text-white"
                    )}>
                      {isFree ? '🎁 Free' : item.tag}
                    </span>
                    {item.price && !isFree && (
                      <span className="absolute bottom-2 right-2 text-xs font-bold px-2 py-0.5 rounded-lg bg-black/75 text-orange-400">
                        {item.price.includes('€') ? item.price : `${item.price} €`}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <CardContent className="pt-2.5 pb-3">
                    <div className="font-semibold text-xs truncate mb-0.5">{item.name}</div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      {isVideo ? '🎬 Video' : isImage ? '🖼️ Bild' : '📄 Datei'} · {fmt(item.size)}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setPreviewing(item)}
                        className="flex-1 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
                      >
                        {isVideo ? '▶ Abspielen' : isImage ? '🔍 Ansehen' : '👁 Details'}
                      </button>
                      <button
                        onClick={() => setEditing({ ...item })}
                        className="px-2 py-1 rounded-lg bg-muted text-muted-foreground text-[11px] hover:text-foreground transition-colors"
                      >✏</button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] hover:bg-red-500/20 transition-colors"
                      >🗑</button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Stats footer */}
        {items.length > 0 && (
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
                <span><span className="text-green-400 font-bold">{freeItems.length}</span> Gratis-Teaser</span>
                <span><span className="text-primary font-bold">{items.filter(i => i.tag !== 'Free').length}</span> andere Dateien</span>
                <span>Wiederholungsschutz: <span className={cn("font-semibold", settings.no_repeat ? "text-green-400" : "text-orange-400")}>{settings.no_repeat ? 'An' : 'Aus'}</span></span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview Modal */}
      {previewing && (() => {
        const isVid = previewing.type.startsWith('video');
        const isImg = previewing.type.startsWith('image');
        const previewSrc = getMediaSrc(previewing);
        const cls = catClasses(previewing.tag, categories);
        return (
          <div className="fixed inset-0 bg-black/95 z-[1200] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              <div>
                <span className="font-bold text-sm">{previewing.name}</span>
                <span className="text-[11px] text-muted-foreground ml-3">{fmt(previewing.size)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setPreviewing(null); setEditing({ ...previewing }); }}>✏ Bearbeiten</Button>
                <Button variant="ghost" size="icon" onClick={() => setPreviewing(null)}><X size={16} /></Button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0"
              onClick={e => { if (e.target === e.currentTarget) setPreviewing(null); }}>
              {isImg && previewSrc ? (
                <img src={previewSrc} alt={previewing.name} className="max-w-full max-h-full object-contain select-none" />
              ) : isVid && previewSrc ? (
                <video src={previewSrc} controls autoPlay className="max-w-full max-h-full outline-none" />
              ) : (
                <div className="text-center">
                  <div className="text-7xl mb-4">{iconFor(previewing.type)}</div>
                  <div className="text-base text-muted-foreground">{previewing.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{fmt(previewing.size)}</div>
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 bg-black/50 flex gap-3 items-center flex-wrap">
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border", cls.bg, cls.border, cls.text)}>
                {previewing.tag === 'Free' ? '🎁 ' : ''}{previewing.tag}
              </span>
              {previewing.price && previewing.tag !== 'Free' && (
                <span className="text-xs font-bold text-orange-400">💰 {previewing.price.includes('€') ? previewing.price : `${previewing.price} €`}</span>
              )}
              {previewing.payment_link && previewing.tag !== 'Free' && (
                <a href={previewing.payment_link} target="_blank" rel="noreferrer"
                  className="ml-auto text-xs text-primary font-semibold hover:underline">
                  🔗 Kaufen →
                </a>
              )}
            </div>
          </div>
        );
      })()}

      {/* Edit Modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/75 z-[1100] flex items-center justify-center p-5"
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">
              {items.some(i => i.id === editing.id) ? 'Datei bearbeiten' : 'Neue Datei konfigurieren'}
            </h3>

            {/* Inline preview */}
            {(() => {
              const editSrc = getMediaSrc(editing);
              return (
                <>
                  {editSrc && editing.type.startsWith('image') && (
                    <div className="mb-4 rounded-xl overflow-hidden h-36 bg-muted">
                      <img src={editSrc} alt={editing.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {editSrc && editing.type.startsWith('video') && (
                    <div className="mb-4 rounded-xl overflow-hidden h-36 bg-muted">
                      <video src={editSrc} className="w-full h-full object-cover" muted />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Category */}
            <label className="block mb-3">
              <div className="text-xs text-muted-foreground mb-1">Kategorie</div>
              <select
                value={editing.tag}
                onChange={e => setEditing({ ...editing, tag: e.target.value })}
                className={cn(
                  "w-full bg-muted border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer",
                  editing.tag === 'Free' ? "border-green-500/40" : "border-border"
                )}
              >
                {allTags.map(t => <option key={t} value={t}>{t === 'Free' ? '🎁 Free (Gratis-Teaser)' : t}</option>)}
              </select>
              {editing.tag === 'Free' && (
                <div className="text-[11px] text-green-400 mt-1">🎁 Wird als Teaser gesendet — kein Kauflink</div>
              )}
            </label>

            {/* Price + link (not for Free) */}
            {editing.tag !== 'Free' && (
              <>
                <div className="grid grid-cols-2 gap-2.5 mb-3">
                  <label>
                    <div className="text-xs text-muted-foreground mb-1">Preis</div>
                    <input value={editing.price} onChange={e => setEditing({ ...editing, price: e.target.value })}
                      placeholder="z.B. 29.99"
                      className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>
                  <label>
                    <div className="text-xs text-muted-foreground mb-1">Kauflink</div>
                    <input value={editing.payment_link} onChange={e => setEditing({ ...editing, payment_link: e.target.value })}
                      placeholder="https://…"
                      className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
                  </label>
                </div>
                <label className="block mb-3">
                  <div className="text-xs text-muted-foreground mb-1">Bot-Aktion</div>
                  <select value={editing.action} onChange={e => setEditing({ ...editing, action: e.target.value })}
                    className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer">
                    {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
              </>
            )}

            {/* Keywords */}
            <label className="block mb-5">
              <div className="text-xs text-muted-foreground mb-1">Keywords <span className="font-normal">(kommagetrennt, optional)</span></div>
              <input value={editing.keywords} onChange={e => setEditing({ ...editing, keywords: e.target.value })}
                placeholder="z.B. foto, content, zeig mir"
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none" />
            </label>

            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Abbrechen</Button>
              <Button className="flex-[2]" onClick={confirmEdit} disabled={saving}>
                {saving ? 'Speichern…' : 'Datei speichern'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
