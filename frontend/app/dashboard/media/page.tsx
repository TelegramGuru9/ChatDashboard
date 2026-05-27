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
  dataUrl?: string;  // base64 preview (images)
  tag: string;
  keywords: string;  // comma-separated trigger words
  action: string;    // what AI does: send_preview | send_file | suggest_purchase
  description: string;
  addedAt: string;
}

const TAGS = ['Product', 'Promo', 'Docs', 'Video', 'Other'];
const ACTIONS = [
  { value: 'send_preview',   label: 'Send preview + offer to buy' },
  { value: 'send_file',      label: 'Send file directly' },
  { value: 'suggest_purchase', label: 'Pitch purchase link' },
  { value: 'ask_interest',   label: 'Ask if interested first' },
];

function fmt(bytes: number) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function icon(type: string) {
  if (type.startsWith('image')) return '🖼️';
  if (type.startsWith('video')) return '🎬';
  if (type.includes('pdf'))  return '📄';
  if (type.startsWith('audio')) return '🎵';
  return '📎';
}

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = apiBase();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}/config/media_library`);
      const d = await res.json();
      setItems(Array.isArray(d.value) ? d.value : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [api]);

  const save = async (updated: MediaItem[]) => {
    setSaving(true);
    try {
      await fetch(`${api}/config/media_library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setItems(updated);
    } catch { setStatus('⚠ Failed to save'); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, [load]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(f => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (f.type.startsWith('image')) {
        const reader = new FileReader();
        reader.onload = e => {
          const item: MediaItem = {
            id, name: f.name, type: f.type, size: f.size,
            dataUrl: e.target?.result as string,
            tag: 'Product', keywords: '', action: 'send_preview',
            description: '', addedAt: new Date().toISOString(),
          };
          setEditing(item); // Open edit modal immediately after upload
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
    save(updated);
    setEditing(null);
    setStatus('✓ Saved');
    setTimeout(() => setStatus(''), 2500);
  };

  const deleteItem = (id: string) => {
    if (!confirm('Delete this file?')) return;
    const updated = items.filter(i => i.id !== id);
    save(updated);
    setStatus('✓ Deleted');
    setTimeout(() => setStatus(''), 2500);
  };

  const visible = filter === 'All' ? items : items.filter(i => i.tag === filter);

  return (
    <DashboardLayout>
      <div style={{ padding:'28px 24px', maxWidth:'1000px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
          <div>
            <h1 style={{ fontSize:'26px', fontWeight:700, margin:0, letterSpacing:'-0.03em' }}>Media Library</h1>
            <p style={{ color: C.t2, fontSize:'14px', margin:'4px 0 0' }}>Files the AI sends automatically based on keywords</p>
          </div>
          <button onClick={() => fileInputRef.current?.click()} style={{
            padding:'10px 18px', borderRadius:'12px', background: C.blue, border:'none',
            color:'#fff', fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px',
          }}>+ Upload File</button>
        </div>

        {status && (
          <div style={{ padding:'8px 14px', borderRadius:'10px', marginBottom:'14px', fontSize:'13px',
            background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,149,10,0.1)',
            color: status.startsWith('✓') ? C.green : C.orange, border: `1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.2)' : 'rgba(255,149,10,0.2)'}`,
          }}>{status}</div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.blue : C.sep}`, borderRadius:'16px',
            padding:'32px 20px', textAlign:'center', cursor:'pointer', marginBottom:'20px',
            background: dragging ? 'rgba(10,132,255,0.06)' : C.s1,
            transition:'all 0.15s',
          }}
        >
          <div style={{ fontSize:'32px', marginBottom:'8px' }}>📁</div>
          <div style={{ fontWeight:600, fontSize:'14px', marginBottom:'4px' }}>Drop files here or click to upload</div>
          <div style={{ fontSize:'12px', color: C.t3 }}>Images, videos, PDFs, audio — any file the AI should auto-send</div>
        </div>

        <input ref={fileInputRef} type="file" multiple style={{ display:'none' }} onChange={e => addFiles(e.target.files)} />

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap' }}>
          {['All', ...TAGS].map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:500, cursor:'pointer', border:'1px solid',
              background: filter === t ? C.blue : 'transparent',
              borderColor: filter === t ? C.blue : C.sep,
              color: filter === t ? '#fff' : C.t2,
            }}>{t} {t !== 'All' ? `(${items.filter(i=>i.tag===t).length})` : `(${items.length})`}</button>
          ))}
        </div>

        {/* Items grid */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px', color: C.t3 }}>
            <div style={{ fontSize:'44px', marginBottom:'12px' }}>📂</div>
            <div style={{ fontSize:'15px', fontWeight:600, marginBottom:'6px', color: C.t2 }}>No files yet</div>
            <div style={{ fontSize:'13px' }}>Upload files and add keyword triggers — the AI will send them automatically</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'12px' }}>
            {visible.map(item => (
              <div key={item.id} style={{ background: C.s1, borderRadius:'14px', border:`1px solid ${C.sep}`, overflow:'hidden' }}>
                {/* Preview */}
                <div style={{ height:'120px', background: C.s2, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                  {item.dataUrl && item.type.startsWith('image') ? (
                    <img src={item.dataUrl} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <span style={{ fontSize:'44px' }}>{icon(item.type)}</span>
                  )}
                  <span style={{ position:'absolute', top:'8px', right:'8px', background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:'10px', padding:'2px 7px', borderRadius:'6px' }}>{item.tag}</span>
                </div>
                {/* Info */}
                <div style={{ padding:'12px' }}>
                  <div style={{ fontWeight:600, fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'4px' }}>{item.name}</div>
                  <div style={{ fontSize:'11px', color: C.t3, marginBottom:'8px' }}>{fmt(item.size)}</div>
                  {item.keywords && (
                    <div style={{ fontSize:'11px', color: C.blue, marginBottom:'6px' }}>
                      🔑 {item.keywords}
                    </div>
                  )}
                  {item.description && (
                    <div style={{ fontSize:'11px', color: C.t2, marginBottom:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description}</div>
                  )}
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={() => setEditing({ ...item })} style={{ flex:1, padding:'6px', borderRadius:'8px', background: C.s3, border:'none', color: C.t2, fontSize:'12px', cursor:'pointer' }}>Edit</button>
                    <button onClick={() => deleteItem(item.id)} style={{ padding:'6px 10px', borderRadius:'8px', background:'rgba(255,69,58,0.12)', border:'1px solid rgba(255,69,58,0.2)', color: C.red, fontSize:'12px', cursor:'pointer' }}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius:'20px', padding:'24px', width:'100%', maxWidth:'460px', border:`1px solid ${C.sep}` }}>
            <h3 style={{ margin:'0 0 20px', fontSize:'17px', fontWeight:700 }}>
              {items.some(i => i.id === editing.id) ? 'Edit File' : 'Configure New File'}
            </h3>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Category</div>
              <select value={editing.tag} onChange={e => setEditing({...editing, tag: e.target.value})}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Keywords (comma-separated)</div>
              <input value={editing.keywords} onChange={e => setEditing({...editing, keywords: e.target.value})}
                placeholder="e.g. photo, picture, content, buy"
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }} />
              <div style={{ fontSize:'11px', color: C.t3, marginTop:'4px' }}>AI triggers this file when these words appear in a message</div>
            </label>

            <label style={{ display:'block', marginBottom:'14px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>AI Action</div>
              <select value={editing.action} onChange={e => setEditing({...editing, action: e.target.value})}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none' }}>
                {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>

            <label style={{ display:'block', marginBottom:'20px' }}>
              <div style={{ fontSize:'12px', color: C.t3, marginBottom:'5px' }}>Description (shown to AI as context)</div>
              <textarea value={editing.description} onChange={e => setEditing({...editing, description: e.target.value})}
                placeholder="e.g. Premium photo pack, 50 exclusive images, $49"
                rows={3}
                style={{ width:'100%', background: C.s2, border:`1px solid ${C.sep}`, borderRadius:'10px', padding:'9px 12px', color: C.t1, fontSize:'13px', outline:'none', resize:'vertical' }} />
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex:1, padding:'11px', borderRadius:'12px', background: C.s3, border:'none', color: C.t2, fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={confirmEdit} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:'12px', background: C.blue, border:'none', color:'#fff', fontSize:'14px', fontWeight:600, cursor:'pointer', opacity:saving?0.6:1 }}>
                {saving ? 'Saving…' : 'Save File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
