'use client';

import { useState, useCallback } from 'react';
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
      background: (creator as any).color || C.blue, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45),
      boxShadow: `0 2px 8px ${(creator as any).color || C.blue}55`,
    }}>
      {(creator as any).emoji || '🎭'}
    </div>
  );
}

function ConnectionBadge({ connected, accountName }: { connected?: boolean; accountName?: string | null }) {
  if (connected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
          background: 'rgba(48,209,88,0.12)', color: C.green,
          border: '1px solid rgba(48,209,88,0.25)',
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
          {accountName || 'Verbunden'}
        </span>
      </div>
    );
  }
  return (
    <span style={{
      fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
      background: 'rgba(255,255,255,0.04)', color: C.t3,
      border: `1px solid ${C.sep}`,
    }}>
      ○ Getrennt
    </span>
  );
}

export default function CreatorsPage() {
  const { creators, selected, switchCreator, reload } = useCreator();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showSession, setShowSession] = useState(false);
  const [connecting, setConnecting]   = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const api = getApiBase();
  const toast = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 4000); };

  const openNew  = () => { setEditing({ ...BLANK }); setShowSession(false); };
  const openEdit = (c: Creator) => {
    setEditing({
      id: c.id, name: c.name, display_name: c.display_name, color: c.color,
      emoji: c.emoji || '🎭', telegram_phone: c.telegram_phone || '',
      telegram_session: '', is_active: c.is_active,
    });
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
    } catch { toast('⚠ Fehler beim Speichern'); }
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
      toast(`⚠ ${e.message || 'Fehler'}`);
    } finally { setDeleting(null); }
  };

  const connect = async (c: Creator) => {
    setConnecting(c.id);
    try {
      const res = await fetch(`${api}/creators/${c.id}/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      toast(`✓ Verbunden als ${d.account_name || 'Telegram'}`);
      await reload();
    } catch (e: any) {
      toast(`⚠ Verbindung fehlgeschlagen: ${e.message}`);
    } finally { setConnecting(null); }
  };

  const disconnect = async (c: Creator) => {
    if (!confirm(`Telegram-Verbindung von "${c.display_name || c.name}" trennen?`)) return;
    setDisconnecting(c.id);
    try {
      await fetch(`${api}/creators/${c.id}/disconnect`, { method: 'POST' });
      toast('Verbindung getrennt');
      await reload();
    } catch { toast('⚠ Fehler beim Trennen'); }
    finally { setDisconnecting(null); }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '800px', color: C.t1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.03em' }}>Creators</h1>
            <p style={{ color: C.t2, fontSize: '14px', margin: '4px 0 0' }}>
              Mehrere Telegram-Accounts — jeder Creator hat eigene Kontakte, Pakete und Einstellungen
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
              border: `1px solid ${c.id === selected?.id ? (c.color || C.blue) + '55' : C.sep}`,
              padding: '16px 18px',
              transition: 'border-color 0.2s',
            }}>
              {/* Top row: avatar + info + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <Avatar creator={c} size={48} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
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
                    <ConnectionBadge connected={c.is_connected} accountName={c.account_name} />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: C.t3, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.telegram_phone && <span>📱 {c.telegram_phone}</span>}
                    <span style={{ color: c.has_session ? C.teal : C.t3 }}>
                      {c.has_session ? '🔑 Session gespeichert' : '○ Keine Session'}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Switch creator */}
                  {c.id !== selected?.id ? (
                    <button onClick={() => switchCreator(c.id)} style={{
                      padding: '6px 12px', borderRadius: '9px', background: 'rgba(10,132,255,0.1)',
                      border: '1px solid rgba(10,132,255,0.2)', color: C.blue, fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    }}>
                      Wechseln
                    </button>
                  ) : (
                    <span style={{ padding: '6px 10px', fontSize: '11px', color: C.blue, fontWeight: 600 }}>● Aktiv</span>
                  )}

                  {/* Connect / Disconnect */}
                  {c.is_connected ? (
                    <button
                      onClick={() => disconnect(c)}
                      disabled={disconnecting === c.id}
                      style={{
                        padding: '6px 12px', borderRadius: '9px',
                        background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.25)',
                        color: C.red, fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        opacity: disconnecting === c.id ? 0.5 : 1,
                      }}
                    >
                      {disconnecting === c.id ? '…' : '⏏ Trennen'}
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(c)}
                      disabled={connecting === c.id || !c.has_session}
                      title={!c.has_session ? 'Erst Session String speichern' : 'Mit Telegram verbinden'}
                      style={{
                        padding: '6px 12px', borderRadius: '9px',
                        background: c.has_session ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${c.has_session ? 'rgba(48,209,88,0.25)' : C.sep}`,
                        color: c.has_session ? C.green : C.t3,
                        fontSize: '11px', fontWeight: 600, cursor: c.has_session ? 'pointer' : 'not-allowed',
                        opacity: connecting === c.id ? 0.5 : 1,
                      }}
                    >
                      {connecting === c.id ? '⏳ Verbinde…' : '⚡ Verbinden'}
                    </button>
                  )}

                  <button onClick={() => openEdit(c)} style={{
                    padding: '6px 10px', borderRadius: '9px', background: C.s3, border: 'none', color: C.t2, fontSize: '11px', cursor: 'pointer',
                  }}>✏️</button>
                  {!c.is_default && (
                    <button onClick={() => del(c.id)} disabled={deleting === c.id} style={{
                      padding: '6px 9px', borderRadius: '9px', background: 'rgba(255,69,58,0.08)',
                      border: '1px solid rgba(255,69,58,0.15)', color: C.red, fontSize: '11px', cursor: 'pointer',
                      opacity: deleting === c.id ? 0.5 : 1,
                    }}>🗑</button>
                  )}
                </div>
              </div>

              {/* Connection note when not connected but has session */}
              {!c.is_connected && c.has_session && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.sep}`, fontSize: '11px', color: C.t3 }}>
                  Session gespeichert — klicke <strong style={{ color: C.green }}>⚡ Verbinden</strong> um diesen Account zu aktivieren.
                </div>
              )}
              {!c.is_connected && !c.has_session && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.sep}`, fontSize: '11px', color: C.t3 }}>
                  Noch keine Session — klicke <strong style={{ color: C.blue }}>✏️</strong> um einen Telethon Session String einzugeben, dann Verbinden.
                </div>
              )}
            </div>
          ))}

          {creators.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: C.t3 }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎭</div>
              <div style={{ fontSize: '14px' }}>Noch keine Creators — füge deinen ersten hinzu</div>
            </div>
          )}
        </div>

        {/* How-to box */}
        <div style={{
          marginTop: '24px', padding: '16px', borderRadius: '12px',
          background: 'rgba(10,132,255,0.05)', border: '1px solid rgba(10,132,255,0.15)',
          fontSize: '12px', color: C.t2, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: C.blue, marginBottom: '8px' }}>So verbindest du einen neuen Creator</div>
          <ol style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Erstelle einen Creator und gib Emoji + Farbe ein</li>
            <li>Klicke <strong>✏️ Bearbeiten</strong> → „Telegram Session String" → klicke „Ändern"</li>
            <li>Füge den Telethon <code style={{ background: C.s3, padding: '1px 5px', borderRadius: '4px' }}>StringSession</code> ein (Railway: <code style={{ background: C.s3, padding: '1px 5px', borderRadius: '4px' }}>TELEGRAM_SESSION_STRING</code>)</li>
            <li>Speichern → <strong style={{ color: C.green }}>⚡ Verbinden</strong> klicken</li>
            <li>Das System verbindet automatisch und lädt den Telegram-Profilnamen</li>
          </ol>
          <div style={{ marginTop: '10px', fontSize: '11px', color: C.t3 }}>
            Jeder Creator empfängt Nachrichten auf seinem eigenen Account und hat separate Kontakte, Pakete, Medien und Autopilot-Einstellungen.
          </div>
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
                    width: '28px', height: '28px', borderRadius: '50%', background: col,
                    border: `3px solid ${editing.color === col ? C.t1 : 'transparent'}`,
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
                  {showSession ? 'Verbergen' : editing.id ? 'Ändern / Anzeigen' : 'Eingeben'}
                </button>
              </div>
              {showSession ? (
                <>
                  <textarea value={editing.telegram_session} onChange={e => setEditing({ ...editing, telegram_session: e.target.value })}
                    placeholder="1BVtsOK8BwB... (Telethon StringSession)"
                    rows={3}
                    style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '11px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '10px', color: C.t3, marginTop: '4px', lineHeight: 1.5 }}>
                    Erzeuge einen Session String mit: <code style={{ background: C.s3, padding: '1px 4px', borderRadius: '3px' }}>python3 -c "from telethon.sync import TelegramClient; from telethon.sessions import StringSession; import os; c = TelegramClient(StringSession(), int(os.environ['TELEGRAM_API_ID']), os.environ['TELEGRAM_API_HASH']); c.start(); print(c.session.save())"</code>
                  </div>
                </>
              ) : (
                <div style={{ padding: '9px 12px', borderRadius: '10px', background: C.s2, border: `1px solid ${C.sep}`, fontSize: '12px', color: C.t3 }}>
                  {editing.id ? '●●●●●●●●●●●●●●●● (gespeichert)' : 'Klicke "Eingeben" um eine Session hinzuzufügen'}
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
