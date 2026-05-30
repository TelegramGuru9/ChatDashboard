'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator, Creator } from '@/contexts/CreatorContext';

const C = {
  bg:'#0a0a0a', s1:'#111113', s2:'#1c1c1e', s3:'#2c2c2e', s4:'#3a3a3c',
  sep:'rgba(255,255,255,0.07)', t1:'#fff', t2:'rgba(235,235,245,0.65)', t3:'rgba(235,235,245,0.35)',
  blue:'#0a84ff', green:'#30d158', red:'#ff453a', orange:'#ff9f0a', purple:'#bf5af2', teal:'#5ac8fa',
};

const COLORS = ['#0a84ff','#30d158','#ff9f0a','#bf5af2','#ff453a','#5ac8fa','#ff6b6b','#4ecdc4','#ffd93d','#6bcb77'];
const EMOJIS = ['🎭','🌟','💎','🔥','👑','🎬','💫','🎯','⚡','🦋','🎪','🌈'];

const getApiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

interface EditState {
  id?: string;
  name: string;
  display_name: string;
  color: string;
  emoji: string;
  telegram_phone: string;
  telegram_session: string;
  is_active: boolean;
}

const BLANK: EditState = {
  name: '', display_name: '', color: '#0a84ff', emoji: '🎭',
  telegram_phone: '', telegram_session: '', is_active: true,
};

function Avatar({ creator, size = 44 }: { creator: Creator | EditState; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      background: creator.color || C.blue, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45), boxShadow: `0 2px 8px ${creator.color || C.blue}55`,
    }}>
      {creator.emoji || '🎭'}
    </div>
  );
}

export default function CreatorsPage() {
  const { creators, selected, switchCreator, reload } = useCreator();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showSession, setShowSession] = useState(false);

  const api = getApiBase();
  const toast = (msg: string, ok = true) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  };

  const openNew  = () => { setEditing({ ...BLANK }); setShowSession(false); };
  const openEdit = (c: Creator) => {
    setEditing({ id: c.id, name: c.name, display_name: c.display_name, color: c.color,
      emoji: c.emoji || '🎭', telegram_phone: c.telegram_phone || '', telegram_session: '', is_active: c.is_active });
    setShowSession(false);
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const url   = isNew ? `${api}/creators` : `${api}/creators/${editing.id}`;
      const res   = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast(isNew ? '✓ Creator erstellt' : '✓ Gespeichert');
      setEditing(null);
      await reload();
    } catch { toast('⚠ Fehler beim Speichern', false); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Creator löschen? Alle zugehörigen Daten bleiben erhalten.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`${api}/creators/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await reload();
      toast('✓ Gelöscht');
    } catch (e: any) {
      toast(`⚠ ${e.message || 'Fehler'}`, false);
    } finally { setDeleting(null); }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '800px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.03em' }}>Creators</h1>
            <p style={{ color: C.t2, fontSize: '14px', margin: '4px 0 0' }}>
              Verwalte mehrere Telegram-Accounts — jeder Creator hat eigene Kontakte, Pakete und Einstellungen
            </p>
          </div>
          <button onClick={openNew} style={{
            padding: '10px 18px', borderRadius: '12px', background: C.blue, border: 'none',
            color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            + Creator hinzufügen
          </button>
        </div>

        {status && (
          <div style={{
            padding: '8px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '13px',
            background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
            color: status.startsWith('✓') ? C.green : C.red,
            border: `1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.25)' : 'rgba(255,69,58,0.25)'}`,
          }}>{status}</div>
        )}

        {/* Creator list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {creators.map(c => (
            <div key={c.id} style={{
              background: C.s1, borderRadius: '16px',
              border: `1px solid ${c.id === selected?.id ? c.color + '55' : C.sep}`,
              padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              <Avatar creator={c} size={48} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{c.display_name || c.name}</span>
                  {c.is_default && (
                    <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: 'rgba(10,132,255,0.15)', color: C.blue, border: '1px solid rgba(10,132,255,0.25)' }}>
                      Standard
                    </span>
                  )}
                  <span style={{
                    fontSize: '10px', padding: '1px 7px', borderRadius: '20px',
                    background: c.is_active ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)',
                    color: c.is_active ? C.green : C.t3,
                    border: `1px solid ${c.is_active ? 'rgba(48,209,88,0.2)' : C.sep}`,
                  }}>
                    {c.is_active ? 'Aktiv' : 'Pausiert'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: C.t3, flexWrap: 'wrap' }}>
                  {c.telegram_phone && <span>📱 {c.telegram_phone}</span>}
                  <span style={{ color: c.has_session ? C.green : C.t3 }}>
                    {c.has_session ? '✓ Session verbunden' : '○ Keine Session'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {c.id !== selected?.id && (
                  <button onClick={() => switchCreator(c.id)} style={{
                    padding: '6px 12px', borderRadius: '9px', background: 'rgba(10,132,255,0.1)',
                    border: '1px solid rgba(10,132,255,0.2)', color: C.blue, fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  }}>
                    Wechseln
                  </button>
                )}
                {c.id === selected?.id && (
                  <span style={{ padding: '6px 12px', fontSize: '11px', color: C.t3 }}>Aktiv</span>
                )}
                <button onClick={() => openEdit(c)} style={{
                  padding: '6px 10px', borderRadius: '9px', background: C.s3, border: 'none', color: C.t2, fontSize: '11px', cursor: 'pointer',
                }}>Bearbeiten</button>
                {!c.is_default && (
                  <button onClick={() => del(c.id)} disabled={deleting === c.id} style={{
                    padding: '6px 9px', borderRadius: '9px', background: 'rgba(255,69,58,0.1)',
                    border: '1px solid rgba(255,69,58,0.2)', color: C.red, fontSize: '11px', cursor: 'pointer',
                    opacity: deleting === c.id ? 0.5 : 1,
                  }}>🗑</button>
                )}
              </div>
            </div>
          ))}

          {creators.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: C.t3 }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎭</div>
              <div style={{ fontSize: '14px' }}>Noch keine Creators — füge deinen ersten hinzu</div>
            </div>
          )}
        </div>

        {/* Info box */}
        <div style={{
          marginTop: '24px', padding: '14px 16px', borderRadius: '12px',
          background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.15)',
          fontSize: '12px', color: C.t2, lineHeight: 1.6,
        }}>
          <strong style={{ color: C.blue }}>So funktioniert Multi-Creator:</strong><br />
          Jeder Creator hat seinen eigenen Telegram-Account (Session), eigene Kontakte, Pakete, Medien und Autopilot-Einstellungen.
          Wechsle den aktiven Creator über das Dropdown im Seitenmenü — alle Seiten laden dann automatisch die Daten des gewählten Accounts.
          Die Telegram-Session findest du in deiner Railway-Umgebungsvariable <code style={{ background: C.s3, padding: '1px 5px', borderRadius: '4px' }}>TELETHON_SESSION</code>.
        </div>
      </div>

      {/* ── Edit / Create Modal ─────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '500px', border: `1px solid ${C.sep}`, maxHeight: '90vh', overflowY: 'auto' }}>

            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>
              {editing.id ? 'Creator bearbeiten' : 'Neuer Creator'}
            </h3>

            {/* Preview avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '14px', borderRadius: '12px', background: C.s2 }}>
              <Avatar creator={editing} size={56} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: C.t1 }}>{editing.display_name || editing.name || 'Creator Name'}</div>
                {editing.telegram_phone && <div style={{ fontSize: '12px', color: C.t3, marginTop: '2px' }}>{editing.telegram_phone}</div>}
              </div>
            </div>

            {/* Name + Display name */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              <label>
                <div style={{ fontSize: '12px', color: C.t3, marginBottom: '4px' }}>Name (intern) *</div>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="z.B. nika"
                  style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </label>
              <label>
                <div style={{ fontSize: '12px', color: C.t3, marginBottom: '4px' }}>Anzeigename</div>
                <input value={editing.display_name} onChange={e => setEditing({ ...editing, display_name: e.target.value })}
                  placeholder="z.B. Nika 🔥"
                  style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </label>
            </div>

            {/* Emoji picker */}
            <div style={{ marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Avatar Emoji</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => setEditing({ ...editing, emoji: em })} style={{
                    width: '36px', height: '36px', borderRadius: '9px', border: `2px solid ${editing.emoji === em ? C.blue : C.sep}`,
                    background: editing.emoji === em ? 'rgba(10,132,255,0.15)' : C.s2,
                    cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{em}</button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div style={{ marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Avatar Farbe</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {COLORS.map(col => (
                  <button key={col} onClick={() => setEditing({ ...editing, color: col })} style={{
                    width: '28px', height: '28px', borderRadius: '50%', background: col, border: `3px solid ${editing.color === col ? C.t1 : 'transparent'}`,
                    cursor: 'pointer', transition: 'border-color 0.1s',
                  }} />
                ))}
              </div>
            </div>

            {/* Phone */}
            <label style={{ display: 'block', marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '4px' }}>Telegram Telefonnummer</div>
              <input value={editing.telegram_phone} onChange={e => setEditing({ ...editing, telegram_phone: e.target.value })}
                placeholder="+49123456789"
                style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </label>

            {/* Telegram Session */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', color: C.t3 }}>Telegram Session String</div>
                <button onClick={() => setShowSession(s => !s)} style={{ background: 'none', border: 'none', color: C.blue, fontSize: '11px', cursor: 'pointer', padding: 0 }}>
                  {showSession ? 'Verbergen' : editing.id ? 'Ändern' : 'Anzeigen'}
                </button>
              </div>
              {showSession ? (
                <>
                  <textarea value={editing.telegram_session} onChange={e => setEditing({ ...editing, telegram_session: e.target.value })}
                    placeholder="1BVtsOK8... (Telethon StringSession aus TELETHON_SESSION env var)"
                    rows={3}
                    style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '11px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '10px', color: C.t3, marginTop: '3px' }}>
                    Die Session findest du als Railway-Umgebungsvariable TELETHON_SESSION
                  </div>
                </>
              ) : (
                <div style={{ padding: '9px 12px', borderRadius: '10px', background: C.s2, border: `1px solid ${C.sep}`, fontSize: '12px', color: C.t3 }}>
                  {editing.id ? (editing.telegram_session ? '●●●●●●●●●●●●●●●●' : 'Noch keine Session') : 'Klicke "Anzeigen" um eine Session einzugeben'}
                </div>
              )}
            </div>

            {/* Active toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '10px 12px', borderRadius: '10px', background: C.s2 }}>
              <span style={{ fontSize: '13px', color: C.t2 }}>Creator aktiv</span>
              <button onClick={() => setEditing({ ...editing, is_active: !editing.is_active })} style={{
                width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: editing.is_active ? C.green : C.s4, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: '3px', left: editing.is_active ? '21px' : '3px',
                  width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                }} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: C.s3, border: 'none', color: C.t2, fontSize: '14px', cursor: 'pointer' }}>
                Abbrechen
              </button>
              <button onClick={save} disabled={saving || !editing.name.trim()} style={{
                flex: 2, padding: '11px', borderRadius: '12px', background: C.blue, border: 'none',
                color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                opacity: (saving || !editing.name.trim()) ? 0.5 : 1,
              }}>
                {saving ? 'Speichern…' : editing.id ? 'Änderungen speichern' : 'Creator erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
