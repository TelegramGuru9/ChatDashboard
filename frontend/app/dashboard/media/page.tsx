'use client';

import { useState, useRef } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';

const ios = {
  surface: '#1c1c1e', surface2: '#2c2c2e',
  border: 'rgba(255,255,255,0.08)', accent: '#0a84ff',
  green: '#30d158', red: '#ff453a', amber: '#ffd60a', purple: '#bf5af2',
  text: '#fff', text2: 'rgba(255,255,255,0.55)', text3: 'rgba(255,255,255,0.3)',
};

interface MediaItem {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  preview?: string;
  addedAt: string;
  tag?: string;
}

const DEMO: MediaItem[] = [
  { id: '1', name: 'product-hero.jpg', type: 'image/jpeg', size: 284000, url: '#', addedAt: new Date().toISOString(), tag: 'Product' },
  { id: '2', name: 'brochure.pdf', type: 'application/pdf', size: 1240000, url: '#', addedAt: new Date().toISOString(), tag: 'Docs' },
  { id: '3', name: 'promo-video.mp4', type: 'video/mp4', size: 8400000, url: '#', addedAt: new Date().toISOString(), tag: 'Promo' },
];

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fileIcon(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf')) return '📄';
  return '📎';
}

const TAGS = ['All', 'Product', 'Promo', 'Docs', 'Other'];

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>(DEMO);
  const [tag, setTag] = useState('All');
  const [dragging, setDragging] = useState(false);
  const [newTag, setNewTag] = useState('Product');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(f => {
      const reader = new FileReader();
      reader.onload = e => {
        setItems(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          name: f.name, type: f.type, size: f.size,
          url: e.target?.result as string,
          preview: f.type.startsWith('image') ? e.target?.result as string : undefined,
          addedAt: new Date().toISOString(),
          tag: newTag,
        }]);
      };
      reader.readAsDataURL(f);
    });
  };

  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const filtered = tag === 'All' ? items : items.filter(i => i.tag === tag);

  return (
    <DashboardLayout>
      <div style={{ padding: '24px 20px', maxWidth: '900px', color: ios.text }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Media Library</h1>
        <p style={{ color: ios.text2, fontSize: '13px', marginBottom: '24px' }}>
          Upload images, videos and documents to share with leads via auto-reply
        </p>

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? ios.accent : ios.border}`,
            borderRadius: '18px', padding: '40px', textAlign: 'center',
            cursor: 'pointer', marginBottom: '20px',
            background: dragging ? 'rgba(10,132,255,0.06)' : ios.surface,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>📤</div>
          <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>
            Drop files here or tap to upload
          </div>
          <div style={{ color: ios.text3, fontSize: '12px' }}>
            Images, videos, PDFs — up to 50 MB each
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
            <span style={{ fontSize: '12px', color: ios.text2 }}>Tag as:</span>
            <select
              value={newTag}
              onChange={e => { e.stopPropagation(); setNewTag(e.target.value); }}
              onClick={e => e.stopPropagation()}
              style={{ background: ios.surface2, border: `1px solid ${ios.border}`, borderRadius: '8px', color: ios.text, fontSize: '12px', padding: '4px 8px' }}
            >
              {TAGS.filter(t => t !== 'All').map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*,.pdf" style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />

        {/* Tag filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {TAGS.map(t => (
            <button key={t} onClick={() => setTag(t)} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: '1px solid',
              background: tag === t ? ios.accent : ios.surface,
              borderColor: tag === t ? ios.accent : ios.border,
              color: tag === t ? '#fff' : ios.text2,
            }}>{t}</button>
          ))}
        </div>

        {/* Media grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: ios.text3 }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🗂️</div>
            No media files yet — upload something above
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {filtered.map(item => (
              <div key={item.id} style={{
                background: ios.surface, borderRadius: '14px', overflow: 'hidden',
                border: `1px solid ${ios.border}`, position: 'relative',
              }}>
                {/* Preview */}
                <div style={{
                  height: '120px', background: ios.surface2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {item.preview
                    ? <img src={item.preview} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: '40px' }}>{fileIcon(item.type)}</span>
                  }
                </div>
                {/* Info */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: ios.text, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: ios.text3 }}>{fmt(item.size)}</span>
                    {item.tag && (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'rgba(10,132,255,0.15)', color: ios.accent }}>{item.tag}</span>
                    )}
                  </div>
                </div>
                {/* Delete */}
                <button
                  onClick={() => remove(item.id)}
                  style={{
                    position: 'absolute', top: '6px', right: '6px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', border: 'none',
                    color: '#fff', cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '20px', padding: '14px 16px', borderRadius: '12px', background: ios.surface, border: `1px solid ${ios.border}`, fontSize: '12px', color: ios.text3 }}>
          💡 <strong style={{ color: ios.text2 }}>Tip:</strong> Tag media as "Product" or "Promo" then reference the tag in Auto-Reply rules to automatically send the right file when a lead asks about it.
        </div>
      </div>
    </DashboardLayout>
  );
}
