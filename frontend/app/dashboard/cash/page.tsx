'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DollarSign, Plus, Trash2, Send, RefreshCw } from 'lucide-react';

const getApi = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

type BtnStatus = 'idle' | 'sending' | 'success' | 'error';

interface TestEvent {
  id:         string;   // event_type sent to backend
  label:      string;   // button label
  previewMsg: string;   // preview of Telegram message
  color:      string;   // tailwind accent
  pkgName?:   string;   // optional package name loaded from config
}

export default function CashAlarmPage() {
  const { withCreator } = useCreator();
  const api = getApi();

  // Flow 1 — Package sent (cash_notify_users)
  const [users,   setUsers]   = useState<string[]>([]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Flow 2 — Sales Completed (sales_notify_users)
  const [salesUsers,   setSalesUsers]   = useState<string[]>([]);
  const [salesInput,   setSalesInput]   = useState('');
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesSaving,  setSalesSaving]  = useState(false);
  const [salesSaved,   setSalesSaved]   = useState(false);

  // Per-button test status
  const [btnStatus, setBtnStatus] = useState<Record<string, BtnStatus>>({});
  const [btnResult, setBtnResult] = useState<Record<string, string>>({});

  // Package names loaded from config
  const [pkgNames, setPkgNames] = useState<string[]>(['Paket 1', 'Paket 2', 'Paket 3']);

  /* ── Load users ─────────────────────────────────────────────────────────── */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(withCreator(`${api}/config/cash_notify_users`));
      const data = await res.json();
      if (Array.isArray(data?.value) && data.value.length > 0) setUsers(data.value);
    } catch {}
    finally { setLoading(false); }
  }, [api, withCreator]);

  const loadSalesUsers = useCallback(async () => {
    setSalesLoading(true);
    try {
      const res  = await fetch(withCreator(`${api}/config/sales_notify_users`));
      const data = await res.json();
      if (Array.isArray(data?.value) && data.value.length > 0) setSalesUsers(data.value);
    } catch {}
    finally { setSalesLoading(false); }
  }, [api, withCreator]);

  /* ── Load package names ─────────────────────────────────────────────────── */
  const loadPackages = useCallback(async () => {
    try {
      const res  = await fetch(withCreator(`${api}/config/packages`));
      const data = await res.json();
      const pkgs = Array.isArray(data?.value) ? data.value : [];
      if (pkgs.length > 0) {
        setPkgNames([
          pkgs[0]?.name || 'Paket 1',
          pkgs[1]?.name || 'Paket 2',
          pkgs[2]?.name || 'Paket 3',
        ]);
      }
    } catch {}
  }, [api, withCreator]);

  useEffect(() => { loadUsers(); loadSalesUsers(); loadPackages(); }, [loadUsers, loadSalesUsers, loadPackages]);

  /* ── Notify user management — Flow 1 ───────────────────────────────────── */
  const addUser = () => {
    const u = input.trim().replace(/^@/, '');
    if (u && !users.includes(u)) setUsers(prev => [...prev, u]);
    setInput('');
  };
  const removeUser = (u: string) => setUsers(prev => prev.filter(x => x !== u));
  const saveUsers = async () => {
    setSaving(true);
    try {
      await fetch(withCreator(`${api}/config/cash_notify_users`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(users),
      });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  /* ── Notify user management — Flow 2 (Sales Completed) ─────────────────── */
  const addSalesUser = () => {
    const u = salesInput.trim().replace(/^@/, '');
    if (u && !salesUsers.includes(u)) setSalesUsers(prev => [...prev, u]);
    setSalesInput('');
  };
  const removeSalesUser = (u: string) => setSalesUsers(prev => prev.filter(x => x !== u));
  const saveSalesUsers = async () => {
    setSalesSaving(true);
    try {
      await fetch(withCreator(`${api}/config/sales_notify_users`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salesUsers),
      });
      setSalesSaved(true); setTimeout(() => setSalesSaved(false), 3000);
    } catch {}
    setSalesSaving(false);
  };

  /* ── Fire a test alarm ──────────────────────────────────────────────────── */
  const fireTest = async (eventId: string, pkgName?: string) => {
    if (users.length === 0) {
      setBtnStatus(s => ({ ...s, [eventId]: 'error' }));
      setBtnResult(r => ({ ...r, [eventId]: 'Keine User konfiguriert — zuerst einen Username hinzufügen.' }));
      setTimeout(() => setBtnStatus(s => ({ ...s, [eventId]: 'idle' })), 4000);
      return;
    }
    setBtnStatus(s => ({ ...s, [eventId]: 'sending' }));
    setBtnResult(r => ({ ...r, [eventId]: '' }));
    try {
      const res  = await fetch(withCreator(`${api}/telegram/test-cash-alarm`), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventId, package_name: pkgName || '' }),
      });
      const data = await res.json();
      if (res.ok) {
        setBtnStatus(s => ({ ...s, [eventId]: 'success' }));
        setBtnResult(r => ({
          ...r,
          [eventId]: data.sent_to
            ? `✓ Gesendet an ${data.sent_to} User${data.sent_to > 1 ? 's' : ''}${data.failed ? ` (${data.failed} fehlgeschlagen)` : ''}`
            : '✓ Cash Alarm ausgelöst!',
        }));
      } else {
        setBtnStatus(s => ({ ...s, [eventId]: 'error' }));
        setBtnResult(r => ({ ...r, [eventId]: data.detail || data.error || 'Backend-Fehler.' }));
      }
    } catch (e: any) {
      setBtnStatus(s => ({ ...s, [eventId]: 'error' }));
      setBtnResult(r => ({ ...r, [eventId]: `Backend nicht erreichbar: ${e.message}` }));
    }
    setTimeout(() => {
      setBtnStatus(s => ({ ...s, [eventId]: 'idle' }));
      setBtnResult(r => ({ ...r, [eventId]: '' }));
    }, 6000);
  };

  /* ── Test event definitions ─────────────────────────────────────────────── */
  const testEvents: TestEvent[] = [
    {
      id:         'list_sent',
      label:      'Liste gesendet',
      previewMsg: '🌡️ Warm Lead — Liste angefragt!\n👤 Telegram ID: 123456',
      color:      'border-blue-200 bg-blue-50/50',
    },
    {
      id:         'package_1',
      label:      pkgNames[0],
      previewMsg: `🔥 HOT Lead — ${pkgNames[0]} gesendet!\n👤 Telegram ID: 123456`,
      color:      'border-purple-200 bg-purple-50/50',
      pkgName:    pkgNames[0],
    },
    {
      id:         'package_2',
      label:      pkgNames[1],
      previewMsg: `🔥 HOT Lead — ${pkgNames[1]} gesendet!\n👤 Telegram ID: 123456`,
      color:      'border-orange-200 bg-orange-50/50',
      pkgName:    pkgNames[1],
    },
    {
      id:         'package_3',
      label:      pkgNames[2],
      previewMsg: `🔥 HOT Lead — ${pkgNames[2]} gesendet!\n👤 Telegram ID: 123456`,
      color:      'border-emerald-200 bg-emerald-50/50',
      pkgName:    pkgNames[2],
    },
  ];

  const salesTestEvent: TestEvent = {
    id:         'sale',
    label:      'Sales Completed',
    previewMsg: '✅ Zahlung bestätigt — Sale abgeschlossen!\n👤 Telegram ID: 123456',
    color:      'border-green-200 bg-green-50/50',
  };

  const inputCls = "w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors";

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-yellow-400/15 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
            <DollarSign size={24} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cash Alarm</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bei diesen Ereignissen erhalten die konfigurierten Telegram-User sofort eine Benachrichtigung.
            </p>
          </div>
        </div>

        {/* How it works */}
        <Card className="border-yellow-400/15">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Wann wird der Cash Alarm ausgelöst?</div>
            <div className="space-y-2">
              {[
                { color: 'text-blue-400',   label: 'Listennachricht',  text: 'Bot sendet die Listennachricht → "Warm Lead - Liste angefragt"' },
                { color: 'text-purple-400', label: 'Paket 1 / 2 / 3', text: 'Bot sendet ein Paket-Keyword-Match → "HOT Lead — [Paketname] gesendet"' },
                { color: 'text-green-400',  label: 'Sales Completed',  text: 'Staff klickt "Payment Collected" im Chat → "Sales Completed" Alarm (eigene User-Liste)' },
              ].map(({ color, label, text }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 border", color, `border-current/30 bg-current/10`)}>
                    $
                  </div>
                  <div>
                    <span className={cn("text-xs font-semibold", color)}>{label}</span>
                    <span className="text-sm text-muted-foreground ml-2">{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notify Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Benachrichtigungs-User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="py-6 text-center text-muted-foreground text-sm">Laden…</div>
            ) : (
              <>
                <div className="space-y-2 min-h-[40px]">
                  {users.length === 0 && (
                    <div className="py-6 text-center text-muted-foreground text-sm rounded-xl border border-dashed border-border">
                      Noch keine User — füge unten einen Telegram-Username hinzu
                    </div>
                  )}
                  {users.map(u => (
                    <div key={u} className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 group">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-yellow-400/15 flex items-center justify-center">
                          <DollarSign size={13} className="text-yellow-400" />
                        </div>
                        <span className="font-semibold text-sm">@{u}</span>
                      </div>
                      <button
                        onClick={() => removeUser(u)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addUser()}
                    placeholder="@username oder username"
                    className={cn(inputCls, "flex-1")}
                  />
                  <Button onClick={addUser} size="sm" className="px-4 bg-yellow-400 text-black hover:bg-yellow-300 font-bold">
                    <Plus size={15} className="mr-1" /> Add
                  </Button>
                </div>

                <Button
                  onClick={saveUsers}
                  disabled={saving}
                  className={cn("w-full py-4 font-semibold transition-colors", saved ? "bg-green-500 hover:bg-green-500" : "")}
                >
                  {saved ? '✓ Gespeichert' : saving ? 'Speichern…' : '💾 User-Liste speichern'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* 4 Test Buttons */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Send size={15} className="text-primary" />
              <CardTitle className="text-sm font-semibold">Test-Alarme</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Schickt eine echte Nachricht an alle konfigurierten User — zum Testen ob die Verbindung funktioniert.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {testEvents.map(ev => {
              const st = btnStatus[ev.id] || 'idle';
              const result = btnResult[ev.id] || '';
              return (
                <div key={ev.id} className={cn("rounded-2xl border p-4 space-y-3", ev.color)}>
                  {/* Preview message */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Vorschau Telegram-Nachricht:</div>
                    <div className="font-mono text-xs leading-relaxed bg-black/5 rounded-xl px-3 py-2 whitespace-pre-line text-yellow-600">
                      {'💵💵💵 $ CASH CASH CASH $ 💵💵💵 (TEST)\n\n'}{ev.previewMsg}
                    </div>
                  </div>

                  {/* Fire button */}
                  <Button
                    onClick={() => fireTest(ev.id, ev.pkgName)}
                    disabled={st === 'sending'}
                    size="sm"
                    className={cn(
                      "w-full font-semibold gap-2 transition-colors",
                      st === 'success' ? "bg-green-500 hover:bg-green-500 text-white" :
                      st === 'error'   ? "bg-red-500 hover:bg-red-500 text-white" :
                      "bg-yellow-400 text-black hover:bg-yellow-300"
                    )}
                  >
                    {st === 'sending' ? (
                      <><RefreshCw size={13} className="animate-spin" /> Senden…</>
                    ) : st === 'success' ? (
                      <>✓ Gesendet!</>
                    ) : st === 'error' ? (
                      <>✗ Fehler</>
                    ) : (
                      <><Send size={13} /> Test — {ev.label}</>
                    )}
                  </Button>

                  {result && (
                    <div className={cn(
                      "px-3 py-2 rounded-xl text-xs border",
                      st === 'success' || result.startsWith('✓')
                        ? "bg-green-500/10 border-green-500/25 text-green-600"
                        : "bg-red-500/10 border-red-500/25 text-red-500"
                    )}>
                      {result}
                    </div>
                  )}
                </div>
              );
            })}

            {users.length === 0 && (
              <div className="text-xs text-muted-foreground text-center pt-1">
                ⚠️ Füge zuerst einen User hinzu und speichere, bevor du testest
              </div>
            )}
          </CardContent>
        </Card>

        {/* ══ FLOW 2 — Sales Completed ══ */}
        <div className="border-t border-border pt-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-green-400 text-lg font-bold">✅</span>
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Flow 2 — Sales Completed</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Wird ausgelöst wenn du im Chat auf <strong>"Payment Collected"</strong> klickst — separate User-Liste.
              </p>
            </div>
          </div>

          {/* Sales notify users */}
          <Card className="border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground">Sales-Team Benachrichtigungs-User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {salesLoading ? (
                <div className="py-6 text-center text-muted-foreground text-sm">Laden…</div>
              ) : (
                <>
                  <div className="space-y-2 min-h-[40px]">
                    {salesUsers.length === 0 && (
                      <div className="py-6 text-center text-muted-foreground text-sm rounded-xl border border-dashed border-border">
                        Noch keine User — füge unten einen Telegram-Username hinzu
                      </div>
                    )}
                    {salesUsers.map(u => (
                      <div key={u} className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 group">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center">
                            <span className="text-green-400 text-xs font-bold">✅</span>
                          </div>
                          <span className="font-semibold text-sm">@{u}</span>
                        </div>
                        <button
                          onClick={() => removeSalesUser(u)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={salesInput}
                      onChange={e => setSalesInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addSalesUser()}
                      placeholder="@username oder username"
                      className={cn(inputCls, "flex-1")}
                    />
                    <Button onClick={addSalesUser} size="sm" className="px-4 bg-green-500 text-white hover:bg-green-400 font-bold">
                      <Plus size={15} className="mr-1" /> Add
                    </Button>
                  </div>

                  <Button
                    onClick={saveSalesUsers}
                    disabled={salesSaving}
                    className={cn("w-full py-4 font-semibold transition-colors", salesSaved ? "bg-green-500 hover:bg-green-500" : "")}
                  >
                    {salesSaved ? '✓ Gespeichert' : salesSaving ? 'Speichern…' : '💾 Sales-User-Liste speichern'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Sales test button */}
          <Card className="border-green-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Send size={15} className="text-green-400" />
                <CardTitle className="text-sm font-semibold">Test — Sales Completed Alarm</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Schickt eine echte "Sales Completed" Nachricht an alle konfigurierten Sales-User.
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                const ev = salesTestEvent;
                const st = btnStatus[ev.id] || 'idle';
                const result = btnResult[ev.id] || '';
                return (
                  <div className={cn("rounded-2xl border p-4 space-y-3", ev.color)}>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Vorschau Telegram-Nachricht:</div>
                      <div className="font-mono text-xs leading-relaxed bg-black/5 rounded-xl px-3 py-2 whitespace-pre-line text-green-700">
                        {'💰💰💰 SALES COMPLETED 💰💰💰 (TEST)\n\n'}{ev.previewMsg}
                      </div>
                    </div>
                    <Button
                      onClick={() => fireTest(ev.id)}
                      disabled={st === 'sending'}
                      size="sm"
                      className={cn(
                        "w-full font-semibold gap-2 transition-colors",
                        st === 'success' ? "bg-green-500 hover:bg-green-500 text-white" :
                        st === 'error'   ? "bg-red-500 hover:bg-red-500 text-white" :
                        "bg-green-500 text-white hover:bg-green-400"
                      )}
                    >
                      {st === 'sending' ? (
                        <><RefreshCw size={13} className="animate-spin" /> Senden…</>
                      ) : st === 'success' ? (
                        <>✓ Gesendet!</>
                      ) : st === 'error' ? (
                        <>✗ Fehler</>
                      ) : (
                        <><Send size={13} /> Test — Sales Completed</>
                      )}
                    </Button>
                    {result && (
                      <div className={cn(
                        "px-3 py-2 rounded-xl text-xs border",
                        st === 'success' || result.startsWith('✓')
                          ? "bg-green-500/10 border-green-500/25 text-green-600"
                          : "bg-red-500/10 border-red-500/25 text-red-500"
                      )}>
                        {result}
                      </div>
                    )}
                  </div>
                );
              })()}
              {salesUsers.length === 0 && (
                <div className="text-xs text-muted-foreground text-center pt-3">
                  ⚠️ Füge zuerst einen Sales-User hinzu und speichere, bevor du testest
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </DashboardLayout>
  );
}
