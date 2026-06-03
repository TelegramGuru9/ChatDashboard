'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Package, ChevronLeft, X } from 'lucide-react';
import Link from 'next/link';

const getApi = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '') + '/api/v1';

interface PackageFile { media_id: string; name: string; type: string; duration?: string; }
interface DynamicRules { videos: number; images: number; }
interface Pkg {
  id: string; name: string; tagline: string; price: string; currency: string;
  payment_link: string; stripe_button_code: string; banner_image_id: string;
  media_files: PackageFile[]; dynamic: boolean; dynamic_rules: DynamicRules;
  description: string; package_preview_description: string; package_text: string;
  keywords: string; send_after_messages: number; active: boolean;
}
interface MediaItem {
  id: string; name: string; type: string; size: number;
  dataUrl?: string; fileUrl?: string; tag: string;
}

const BLANK: Pkg = {
  id: '', name: '', tagline: '', price: '', currency: '€',
  payment_link: '', stripe_button_code: '', banner_image_id: '',
  media_files: [], dynamic: false, dynamic_rules: { videos: 2, images: 8 },
  description: '', package_preview_description: '', package_text: '',
  keywords: '', send_after_messages: 0, active: true,
};

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}
function iconFor(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf')) return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}
function getMediaSrc(item: MediaItem) {
  if (item.fileUrl) return `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '')}${item.fileUrl}`;
  return item.dataUrl;
}

const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export default function PackageEditor({ slot, label }: { slot: number; label: string }) {
  const { withCreator } = useCreator();
  const api = getApi();

  const [pkg, setPkg] = useState<Pkg>({ ...BLANK, id: `pkg-${slot + 1}` });
  const [allPkgs, setAllPkgs] = useState<Pkg[]>([]);
  const [mediaLib, setMediaLib] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mediaPicker, setMediaPicker] = useState<'banner' | 'files' | null>(null);

  const load = useCallback(async () => {
    try {
      const [pkgRes, libRes] = await Promise.all([
        fetch(withCreator(`${api}/config/packages`)).then(r => r.json()).catch(() => ({ value: [] })),
        fetch(withCreator(`${api}/config/media_library`)).then(r => r.json()).catch(() => ({ value: [] })),
      ]);
      const val = pkgRes.value;
      const pkgs: Pkg[] = (Array.isArray(val) ? val : []).map((p: any) => ({ ...BLANK, ...p }));
      setAllPkgs(pkgs);
      if (pkgs[slot]) setPkg({ ...BLANK, ...pkgs[slot] });
      if (Array.isArray(libRes.value)) setMediaLib(libRes.value);
    } catch {}
    setLoading(false);
  }, [api, withCreator, slot]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      // Ensure the array is long enough
      const updated = [...allPkgs];
      while (updated.length <= slot) updated.push({ ...BLANK, id: `pkg-${updated.length + 1}` });
      updated[slot] = pkg;
      await fetch(withCreator(`${api}/config/packages`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setAllPkgs(updated);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const set = <K extends keyof Pkg>(k: K, v: Pkg[K]) => setPkg(p => ({ ...p, [k]: v }));

  const bannerItem = mediaLib.find(m => m.id === pkg.banner_image_id);
  const pickable = mediaPicker === 'banner'
    ? mediaLib.filter(m => m.type.startsWith('image') || m.type.startsWith('video'))
    : mediaLib;

  const generateText = () => {
    const lines = [`📦 *${pkg.name}*${pkg.tagline ? ` — ${pkg.tagline}` : ''}`];
    if (pkg.package_preview_description) lines.push(`\n${pkg.package_preview_description}`);
    else if (pkg.description) lines.push(`\n${pkg.description}`);
    if (pkg.price) lines.push(`\n💰 ${pkg.price} ${pkg.currency}`);
    if (pkg.payment_link) lines.push(`\n🔗 ${pkg.payment_link}`);
    set('package_text', lines.join('\n'));
  };

  const COLORS = ['bg-blue-500/10', 'bg-purple-500/10', 'bg-green-500/10'];
  const TEXT_COLORS = ['text-blue-400', 'text-purple-400', 'text-green-400'];
  const color = COLORS[slot] || 'bg-muted';
  const textColor = TEXT_COLORS[slot] || 'text-foreground';

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard/packages" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', color)}>
            <Package className={cn('h-4 w-4', textColor)} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{label}</h1>
            <p className="text-xs text-muted-foreground">Configure this package — the bot will pitch it automatically</p>
          </div>
          {/* Active toggle in header */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{pkg.active ? 'Active' : 'Paused'}</span>
            <button onClick={() => set('active', !pkg.active)}
              className={cn('w-10 h-5 rounded-full relative transition-colors', pkg.active ? 'bg-primary' : 'bg-muted-foreground/25')}>
              <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', pkg.active ? 'left-5' : 'left-0.5')} />
            </button>
          </div>
        </div>

        {/* Banner */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">Banner Image</div>
          <div className="p-4 flex gap-4 items-start">
            <div className="w-28 h-20 rounded-xl bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center border border-border">
              {(() => {
                const src = bannerItem ? getMediaSrc(bannerItem) : null;
                if (src && bannerItem?.type.startsWith('image')) return <img src={src} className="w-full h-full object-cover" />;
                if (src && bannerItem?.type.startsWith('video')) return <video src={src} muted className="w-full h-full object-cover" />;
                return <span className="text-3xl">📦</span>;
              })()}
            </div>
            <div className="flex-1 space-y-2">
              <button onClick={() => setMediaPicker('banner')}
                className="w-full py-2 rounded-lg border border-border bg-background text-xs font-medium hover:bg-accent transition-colors">
                🖼️ Choose from Media Library
              </button>
              {pkg.banner_image_id && (
                <button onClick={() => set('banner_image_id', '')}
                  className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ✕ Remove banner
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">Package Info</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Name *</span>
                <input value={pkg.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Hot Bundle" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Tagline</span>
                <input value={pkg.tagline} onChange={e => set('tagline', e.target.value)} placeholder="Short subtitle" className={inputCls} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Internal description (not shown to users)</span>
              <textarea value={pkg.description} onChange={e => set('description', e.target.value)}
                placeholder="Internal note…" rows={2} className={cn(inputCls, 'resize-y')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">
                <span className="text-cyan-400 font-semibold">👁 What the user sees</span> — used in bot replies
              </span>
              <textarea value={pkg.package_preview_description} onChange={e => set('package_preview_description', e.target.value)}
                placeholder={"What the buyer will see.\ne.g. Outfit, mood, setting."} rows={3}
                className={cn(inputCls, 'resize-y border-cyan-500/40')} />
            </label>
          </div>
        </div>

        {/* Pricing */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">Pricing & Payment</div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Price</span>
                <input value={pkg.price} onChange={e => set('price', e.target.value)} placeholder="29.99" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Currency</span>
                <select value={pkg.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                  {['€', '$', '£', 'CHF'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Buy link (buy.stripe.com or custom)</span>
              <input value={pkg.payment_link} onChange={e => set('payment_link', e.target.value)} placeholder="https://buy.stripe.com/…" className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Stripe Buy Button embed code</span>
              <textarea value={pkg.stripe_button_code} onChange={e => set('stripe_button_code', e.target.value)}
                placeholder={'<stripe-buy-button\n  buy-button-id="buy_btn_…"\n  publishable-key="pk_live_…"\n></stripe-buy-button>'}
                rows={3} className={cn(inputCls, 'resize-none font-mono text-xs')} />
            </label>
          </div>
        </div>

        {/* Content / files */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Content Files</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Dynamic</span>
                <button onClick={() => set('dynamic', !pkg.dynamic)}
                  className={cn('w-9 h-5 rounded-full relative transition-colors', pkg.dynamic ? 'bg-primary' : 'bg-muted-foreground/25')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', pkg.dynamic ? 'left-4' : 'left-0.5')} />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pkg.dynamic ? 'Files selected automatically by keyword from Media Library' : 'Fixed files — choose what\'s in this package'}
            </p>
          </div>
          <div className="p-4 space-y-3">
            {pkg.dynamic ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Videos</span>
                  <input type="number" min={0} max={20} value={pkg.dynamic_rules.videos}
                    onChange={e => set('dynamic_rules', { ...pkg.dynamic_rules, videos: Math.max(0, parseInt(e.target.value) || 0) })}
                    className={inputCls} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Images</span>
                  <input type="number" min={0} max={50} value={pkg.dynamic_rules.images}
                    onChange={e => set('dynamic_rules', { ...pkg.dynamic_rules, images: Math.max(0, parseInt(e.target.value) || 0) })}
                    className={inputCls} />
                </label>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">{pkg.media_files.length} file{pkg.media_files.length !== 1 ? 's' : ''} selected</span>
                  <button onClick={() => setMediaPicker('files')}
                    className="text-xs text-primary font-semibold hover:underline">+ Add from Media Library</button>
                </div>
                {pkg.media_files.length === 0 ? (
                  <div className="py-6 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground">No files added yet</div>
                ) : (
                  <div className="space-y-1.5">
                    {pkg.media_files.map(f => {
                      const li = mediaLib.find(m => m.id === f.media_id);
                      const src = li ? getMediaSrc(li) : null;
                      return (
                        <div key={f.media_id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted border border-border">
                          {src && li?.type.startsWith('image') && <img src={src} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />}
                          <span className="text-base flex-shrink-0">{iconFor(f.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold truncate">{f.name}</div>
                            <div className="text-[10px] text-muted-foreground">{li ? fmt(li.size) : ''}</div>
                          </div>
                          {f.type.startsWith('video') && (
                            <input value={f.duration || ''} onChange={e => set('media_files', pkg.media_files.map(mf => mf.media_id === f.media_id ? { ...mf, duration: e.target.value } : mf))}
                              placeholder="2:34" className="w-14 bg-background border border-border rounded-md px-1.5 py-1 text-[11px] outline-none text-center" />
                          )}
                          <button onClick={() => set('media_files', pkg.media_files.filter(mf => mf.media_id !== f.media_id))}
                            className="text-muted-foreground hover:text-foreground p-1">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bot message */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-semibold text-sm">Bot Message</div>
            <button onClick={generateText} className="text-xs text-primary font-semibold hover:underline">✨ Auto-generate</button>
          </div>
          <div className="p-4 space-y-3">
            <textarea value={pkg.package_text} onChange={e => set('package_text', e.target.value)}
              placeholder="Click ✨ Auto-generate or write manually" rows={5}
              className={cn(inputCls, 'resize-y leading-relaxed')} />
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">Trigger keywords (comma-separated)</span>
              <input value={pkg.keywords} onChange={e => set('keywords', e.target.value)} placeholder="buy, price, package" className={inputCls} />
            </label>
          </div>
        </div>

        {/* Save button */}
        <button onClick={save} disabled={saving || loading || !pkg.name.trim()}
          className={cn('w-full py-3 rounded-xl text-sm font-semibold transition-colors',
            saved ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40')}>
          {saved ? `✓ ${label} Saved` : saving ? 'Saving…' : `Save ${label}`}
        </button>

      </div>

      {/* Media Picker Modal */}
      {mediaPicker && (
        <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setMediaPicker(null); }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="font-bold text-base">{mediaPicker === 'banner' ? '🖼️ Choose Banner' : '📂 Add Files'}</h3>
              <button onClick={() => setMediaPicker(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {mediaLib.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No files yet — upload files under /media first</div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
                  {pickable.map(item => {
                    const already = mediaPicker === 'files' && pkg.media_files.some(f => f.media_id === item.id);
                    const isBanner = mediaPicker === 'banner' && pkg.banner_image_id === item.id;
                    const src = getMediaSrc(item);
                    return (
                      <div key={item.id} onClick={() => {
                        if (mediaPicker === 'banner') { set('banner_image_id', isBanner ? '' : item.id); }
                        else if (!already) set('media_files', [...pkg.media_files, { media_id: item.id, name: item.name, type: item.type }]);
                      }}
                        className={cn('rounded-xl overflow-hidden cursor-pointer border-2 relative transition-all',
                          (isBanner || already) ? 'border-green-500' : 'border-border hover:border-primary/50',
                          already && 'opacity-60 cursor-default')}>
                        <div className="h-20 bg-muted flex items-center justify-center">
                          {src && item.type.startsWith('image') ? <img src={src} className="w-full h-full object-cover" />
                            : src && item.type.startsWith('video') ? <video src={src} muted className="w-full h-full object-cover" />
                              : <span className="text-3xl">{iconFor(item.type)}</span>}
                        </div>
                        <div className="p-1.5">
                          <div className="text-[10px] font-semibold truncate">{item.name}</div>
                        </div>
                        {(isBanner || already) && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[11px] text-white">✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {mediaPicker === 'files' && (
              <button onClick={() => setMediaPicker(null)} className="mt-4 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex-shrink-0">
                ✓ Done ({pkg.media_files.length} file{pkg.media_files.length !== 1 ? 's' : ''})
              </button>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
