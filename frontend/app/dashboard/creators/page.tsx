'use client';

import { useState } from 'react';
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

type AuthStep = 'enter_phone' | 'enter_code' | 'success';
interface AuthWizard {
  creatorId: string;
  creatorName: string;
  step: AuthStep;
  phone: string;
  code: string;
  password: string;
  loading: boolean;
  error: string;
}

const BLANK: EditState = {
  name: '', display_name: '', color: '#0a84ff', emoji: '🎭',
  telegram_phone: '', telegram_session: '', is_active: true,
};

function Avatar({ creator, size = 44 }: { creator: any; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25),
      background: creator.color || C.blue, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.45),
      boxShadow: `0 2px 8px ${creator.color || C.blue}55`,
    }}>
      {creator.emoji || '🎭'}
    </div>
  );
}

function ConnectionBadge({ connected, accountName }: { connected?: boolean; accountName?: string | null }) {
  if (connected) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(48,209,88,0.12)', color: C.green, border: '1px solid rgba(48,209,88,0.25)' }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.green, boxShadow: `0 0 5px ${C.green}` }} />
      {accountName || 'Verbunden'}
    </span>
  );
  return (
    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(255,255,255,0.04)', color: C.t3, border: `1px solid ${C.sep}` }}>
      ○ Getrennt
    </span>
  );
}

function AuthWizardModal({ wizard, onUpdate, onClose, onSuccess }: {
  wizard: AuthWizard;
  onUpdate: (w: Partial<AuthWizard>) => void;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const api = getApiBase();

  const requestCode = async () => {
    if (!wizard.phone.trim()) { onUpdate({ error: 'Bitte Telefonnummer eingeben' }); return; }
    onUpdate({ loading: true, error: '' });
    try {
      const r = await fetch(`${api}/creators/${wizard.creatorId}/request-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: wizard.phone.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      onUpdate({ step: 'enter_code', loading: false, error: '' });
    } catch (e: any) {
      onUpdate({ loading: false, error: e.message || 'Fehler beim Senden des Codes' });
    }
  };

  const submitCode = async () => {
    if (!wizard.code.trim()) { onUpdate({ error: 'Bitte Code eingeben' }); return; }
    onUpdate({ loading: true, error: '' });
    try {
      const r = await fetch(`${api}/creators/${wizard.creatorId}/submit-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: wizard.code.trim(), password: wizard.password.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      onSuccess(d.account_name || wizard.phone);
    } catch (e: any) {
      onUpdate({ loading: false, error: e.message || 'Fehler beim Verifizieren' });
    }
  };

  const inputStyle = (mono = false): React.CSSProperties => ({
    width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px',
    padding: '11px 14px', color: C.t1, fontSize: mono ? '18px' : '14px',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: mono ? 'monospace' : 'inherit',
    letterSpacing: mono ? '0.3em' : 'normal',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.s1, borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', border: `1px solid ${C.sep}` }}>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700 }}>
            {wizard.step === 'success' ? '✅ Verbunden!' : '📱 Telegram Login'}
          </div>
          <div style={{ fontSize: '13px', color: C.t3, marginTop: '4px' }}>
            {wizard.step === 'enter_phone' && wizard.creatorName}
            {wizard.step === 'enter_code'  && `Code gesendet an ${wizard.phone}`}
            {wizard.step === 'success'     && 'Session gespeichert & Creator verbunden'}
          </div>
        </div>

        {wizard.step === 'enter_phone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Telefonnummer (mit Ländercode)</div>
              <input value={wizard.phone} onChange={e => onUpdate({ phone: e.target.value })}
                placeholder="+49 123 456789" type="tel" style={inputStyle()} />
            </div>
            {wizard.error && <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,69,58,0.1)', color: C.red, fontSize: '12px' }}>{wizard.error}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: C.s3, border: 'none', color: C.t2, fontSize: '14px', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={requestCode} disabled={wizard.loading} style={{ flex: 2, padding: '11px', borderRadius: '12px', background: C.blue, border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: wizard.loading ? 0.5 : 1 }}>
                {wizard.loading ? '⏳ Sende…' : '📨 Code senden'}
              </button>
            </div>
          </div>
        )}

        {wizard.step === 'enter_code' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Telegram-Code (aus der App oder SMS)</div>
              <input value={wizard.code} onChange={e => onUpdate({ code: e.target.value })}
                placeholder="1 2 3 4 5" maxLength={8} style={inputStyle(true)}
                onKeyDown={e => { if (e.key === 'Enter') submitCode(); }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>2FA-Passwort <span style={{ color: C.t3, fontWeight: 400 }}>(nur falls aktiviert)</span></div>
              <input value={wizard.password} onChange={e => onUpdate({ password: e.target.value })}
                placeholder="Leer lassen wenn kein 2FA" type="password" style={inputStyle()} />
            </div>
            {wizard.error && <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,69,58,0.1)', color: C.red, fontSize: '12px' }}>{wizard.error}</div>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => onUpdate({ step: 'enter_phone', code: '', error: '' })} style={{ padding: '11px 14px', borderRadius: '12px', background: C.s3, border: 'none', color: C.t2, fontSize: '14px', cursor: 'pointer' }}>← Zurück</button>
              <button onClick={submitCode} disabled={wizard.loading} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: C.green, border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: wizard.loading ? 0.5 : 1 }}>
                {wizard.loading ? '⏳ Prüfe…' : '✅ Bestätigen'}
              </button>
            </div>
            <button onClick={requestCode} disabled={wizard.loading} style={{ background: 'none', border: 'none', color: C.blue, fontSize: '12px', cursor: 'pointer', padding: '4px 0' }}>
              Code erneut senden
            </button>
          </div>
        )}

        {wizard.step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
            <div style={{ fontSize: '14px', color: C.t2, marginBottom: '20px' }}>
              Erfolgreich als <strong style={{ color: C.green }}>{wizard.creatorName}</strong> verbunden.
            </div>
            <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: C.green, border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreatorsPage() {
  const { creators, selected, switchCreator, reload } = useCreator();
  const [editing, setEditing]         = useState<EditState | null>(null);
  const [saving, setSaving]           = useState(false);
  const [status, setStatus]           = useState('');
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [showSession, setShowSession] = useState(false);
  const [connecting, setConnecting]   = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [authWizard, setAuthWizard]   = useState<AuthWizard | null>(null);

  const api = getApiBase();
  const toast = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 4000); };

  const openNew  = () => { setEditing({ ...BLANK }); setShowSession(false); };
  const openEdit = (c: Creator) => {
    setEditing({ id: c.id, name: c.name, display_name: c.display_name, color: c.color, emoji: c.emoji || '🎭', telegram_phone: c.telegram_phone || '', telegram_session: '', is_active: c.is_active });
    setShowSession(false);
  };
  const openAuthWizard = (c: Creator) => {
    setAuthWizard({ creatorId: c.id, creatorName: c.display_name || c.name, step: 'enter_phone', phone: c.telegram_phone || '', code: '', password: '', loading: false, error: '' });
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      const isNew = !editing.id;
      const res = await fetch(isNew ? `${api}/creators` : `${api}/creators/${editing.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast(isNew ? '✓ Creator erstellt' : '✓ Gespeichert');
      setEditing(null); await reload();
    } catch { toast('⚠ Fehler beim Speichern'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('Creator löschen?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`${api}/creators/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await reload(); toast('✓ Gelöscht');
    } catch (e: any) { toast(`⚠ ${e.message}`); } finally { setDeleting(null); }
  };

  const connect = async (c: Creator) => {
    setConnecting(c.id);
    try {
      const res = await fetch(`${api}/creators/${c.id}/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
      toast(`✓ Verbunden als ${d.account_name || 'Telegram'}`); await reload();
    } catch (e: any) { toast(`⚠ ${e.message}`); } finally { setConnecting(null); }
  };

  const disconnect = async (c: Creator) => {
    if (!confirm(`Verbindung trennen?`)) return;
    setDisconnecting(c.id);
    try {
      await fetch(`${api}/creators/${c.id}/disconnect`, { method: 'POST' });
      toast('Verbindung getrennt'); await reload();
    } catch { toast('⚠ Fehler'); } finally { setDisconnecting(null); }
  };

  return (
    <DashboardLayout>
      <div style={{ padding: '28px 24px', maxWidth: '800px', color: C.t1 }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.03em' }}>Creators</h1>
            <p style={{ color: C.t2, fontSize: '14px', margin: '4px 0 0' }}>Mehrere Telegram-Accounts — jeder Creator hat eigene Kontakte, Pakete und Einstellungen</p>
          </div>
          <button onClick={openNew} style={{ padding: '10px 18px', borderRadius: '12px', background: C.blue, border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Creator hinzufügen
          </button>
        </div>

        {status && (
          <div style={{ padding: '8px 14px', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', background: status.startsWith('✓') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)', color: status.startsWith('✓') ? C.green : C.red, border: `1px solid ${status.startsWith('✓') ? 'rgba(48,209,88,0.25)' : 'rgba(255,69,58,0.25)'}` }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {creators.map(c => (
            <div key={c.id} style={{ background: C.s1, borderRadius: '16px', border: `1px solid ${c.id === selected?.id ? (c.color || C.blue) + '55' : C.sep}`, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <Avatar creator={c} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{c.display_name || c.name}</span>
                    {c.is_default && <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: 'rgba(10,132,255,0.15)', color: C.blue, border: '1px solid rgba(10,132,255,0.25)' }}>Standard</span>}
                    <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: c.is_active ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)', color: c.is_active ? C.green : C.t3, border: `1px solid ${c.is_active ? 'rgba(48,209,88,0.2)' : C.sep}` }}>
                      {c.is_active ? 'Aktiv' : 'Pausiert'}
                    </span>
                    <ConnectionBadge connected={c.is_connected} accountName={c.account_name} />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: C.t3, flexWrap: 'wrap' }}>
                    {c.telegram_phone && <span>📱 {c.telegram_phone}</span>}
                    <span style={{ color: c.has_session ? C.teal : C.t3 }}>{c.has_session ? '🔑 Session gespeichert' : '○ Keine Session'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {c.id !== selected?.id
                    ? <button onClick={() => switchCreator(c.id)} style={{ padding: '6px 12px', borderRadius: '9px', background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.2)', color: C.blue, fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Wechseln</button>
                    : <span style={{ padding: '6px 10px', fontSize: '11px', color: C.blue, fontWeight: 600 }}>● Aktiv</span>
                  }

                  {c.is_connected
                    ? <button onClick={() => disconnect(c)} disabled={disconnecting === c.id} style={{ padding: '6px 12px', borderRadius: '9px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.25)', color: C.red, fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: disconnecting === c.id ? 0.5 : 1 }}>
                        {disconnecting === c.id ? '…' : '⏏ Trennen'}
                      </button>
                    : <button onClick={() => connect(c)} disabled={connecting === c.id || !c.has_session} title={!c.has_session ? 'Erst 📱 Auth ausführen' : 'Mit gespeicherter Session verbinden'} style={{ padding: '6px 12px', borderRadius: '9px', background: c.has_session ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${c.has_session ? 'rgba(48,209,88,0.25)' : C.sep}`, color: c.has_session ? C.green : C.t3, fontSize: '11px', fontWeight: 600, cursor: c.has_session ? 'pointer' : 'not-allowed', opacity: connecting === c.id ? 0.5 : 1 }}>
                        {connecting === c.id ? '⏳ Verbinde…' : '⚡ Verbinden'}
                      </button>
                  }

                  {/* Primary: Re-auth button */}
                  <button onClick={() => openAuthWizard(c)} title="Neu per Telefon + SMS-Code einloggen" style={{ padding: '6px 12px', borderRadius: '9px', background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.3)', color: C.orange, fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    📱 Auth
                  </button>

                  <button onClick={() => openEdit(c)} style={{ padding: '6px 10px', borderRadius: '9px', background: C.s3, border: 'none', color: C.t2, fontSize: '11px', cursor: 'pointer' }}>✏️</button>
                  {!c.is_default && <button onClick={() => del(c.id)} disabled={deleting === c.id} style={{ padding: '6px 9px', borderRadius: '9px', background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)', color: C.red, fontSize: '11px', cursor: 'pointer', opacity: deleting === c.id ? 0.5 : 1 }}>🗑</button>}
                </div>
              </div>

              {/* Status hint */}
              {!c.is_connected && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${C.sep}`, fontSize: '11px', color: C.t3 }}>
                  {c.has_session
                    ? <>Session gespeichert — klicke <strong style={{ color: C.green }}>⚡ Verbinden</strong> (nutzt gespeicherte Session) oder <strong style={{ color: C.orange }}>📱 Auth</strong> für Neu-Login.</>
                    : <>Noch keine Session — klicke <strong style={{ color: C.orange }}>📱 Auth</strong>, gib Telefonnummer + SMS-Code ein und du bist verbunden.</>
                  }
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

        <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', background: 'rgba(255,159,10,0.05)', border: '1px solid rgba(255,159,10,0.2)', fontSize: '12px', color: C.t2, lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, color: C.orange, marginBottom: '8px' }}>📱 So funktioniert die Authentifizierung</div>
          <ol style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Klicke <strong style={{ color: C.orange }}>📱 Auth</strong> beim gewünschten Creator</li>
            <li>Telefonnummer eingeben → <em>Code senden</em> klicken</li>
            <li>Den Code aus Telegram (oder SMS) eingeben → <em>Bestätigen</em></li>
            <li>Falls 2FA aktiviert: Passwort zusätzlich eingeben</li>
            <li>Session wird automatisch gespeichert — Creator ist sofort verbunden ✅</li>
          </ol>
          <div style={{ marginTop: '8px', color: C.t3 }}>Bei Verbindungsabbruch nach Railway-Neustart: erst <strong style={{ color: C.green }}>⚡ Verbinden</strong> versuchen — klappt das nicht, erneut <strong style={{ color: C.orange }}>📱 Auth</strong>.</div>
        </div>
      </div>

      {/* Auth Wizard */}
      {authWizard && (
        <AuthWizardModal
          wizard={authWizard}
          onUpdate={partial => setAuthWizard(prev => prev ? { ...prev, ...partial } : null)}
          onClose={async () => { setAuthWizard(null); await reload(); }}
          onSuccess={async (name) => {
            setAuthWizard(prev => prev ? { ...prev, step: 'success', creatorName: name } : null);
            await reload();
          }}
        />
      )}

      {/* Edit / Create Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div style={{ background: C.s1, borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '500px', border: `1px solid ${C.sep}`, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', fontWeight: 700 }}>{editing.id ? 'Creator bearbeiten' : 'Neuer Creator'}</h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '14px', borderRadius: '12px', background: C.s2 }}>
              <Avatar creator={editing} size={56} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{editing.display_name || editing.name || 'Creator Name'}</div>
                {editing.telegram_phone && <div style={{ fontSize: '12px', color: C.t3, marginTop: '2px' }}>{editing.telegram_phone}</div>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
              {[['Name (intern) *', 'name', 'z.B. nika'], ['Anzeigename', 'display_name', 'z.B. Nika 🔥']].map(([label, field, ph]) => (
                <label key={field}>
                  <div style={{ fontSize: '12px', color: C.t3, marginBottom: '4px' }}>{label}</div>
                  <input value={(editing as any)[field]} onChange={e => setEditing({ ...editing, [field]: e.target.value })} placeholder={ph}
                    style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </label>
              ))}
            </div>

            <div style={{ marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Avatar Emoji</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {EMOJIS.map(em => <button key={em} onClick={() => setEditing({ ...editing, emoji: em })} style={{ width: '36px', height: '36px', borderRadius: '9px', border: `2px solid ${editing.emoji === em ? C.blue : C.sep}`, background: editing.emoji === em ? 'rgba(10,132,255,0.15)' : C.s2, cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{em}</button>)}
              </div>
            </div>

            <div style={{ marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '6px' }}>Avatar Farbe</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {COLORS.map(col => <button key={col} onClick={() => setEditing({ ...editing, color: col })} style={{ width: '28px', height: '28px', borderRadius: '50%', background: col, border: `3px solid ${editing.color === col ? C.t1 : 'transparent'}`, cursor: 'pointer' }} />)}
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '13px' }}>
              <div style={{ fontSize: '12px', color: C.t3, marginBottom: '4px' }}>Telegram Telefonnummer</div>
              <input value={editing.telegram_phone} onChange={e => setEditing({ ...editing, telegram_phone: e.target.value })} placeholder="+49123456789"
                style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
            </label>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', color: C.t3 }}>Session String (manuell)</div>
                <button onClick={() => setShowSession(s => !s)} style={{ background: 'none', border: 'none', color: C.blue, fontSize: '11px', cursor: 'pointer', padding: 0 }}>
                  {showSession ? 'Verbergen' : editing.id ? 'Ändern' : 'Eingeben'}
                </button>
              </div>
              {showSession
                ? <textarea value={editing.telegram_session} onChange={e => setEditing({ ...editing, telegram_session: e.target.value })} placeholder="1BVtsOK8BwB… (Telethon StringSession)" rows={3}
                    style={{ width: '100%', background: C.s2, border: `1px solid ${C.sep}`, borderRadius: '10px', padding: '9px 12px', color: C.t1, fontSize: '11px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                : <div style={{ padding: '9px 12px', borderRadius: '10px', background: C.s2, border: `1px solid ${C.sep}`, fontSize: '12px', color: C.t3 }}>
                    {editing.id ? '●●●●●●●● (gespeichert)' : 'Einfacher: nutze 📱 Auth statt manuellem Session-String'}
                  </div>
              }
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', padding: '10px 12px', borderRadius: '10px', background: C.s2 }}>
              <span style={{ fontSize: '13px', color: C.t2 }}>Creator aktiv</span>
              <button onClick={() => setEditing({ ...editing, is_active: !editing.is_active })} style={{ width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: editing.is_active ? C.green : C.s4, position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: '3px', left: editing.is_active ? '21px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: C.s3, border: 'none', color: C.t2, fontSize: '14px', cursor: 'pointer' }}>Abbrechen</button>
              <button onClick={save} disabled={saving || !editing.name.trim()} style={{ flex: 2, padding: '11px', borderRadius: '12px', background: C.blue, border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: (saving || !editing.name.trim()) ? 0.5 : 1 }}>
                {saving ? 'Speichern…' : editing.id ? 'Änderungen speichern' : 'Creator erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
