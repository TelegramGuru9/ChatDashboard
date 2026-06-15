'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Save, Plus, Trash2, MessageSquare, Loader2, Check, Zap } from 'lucide-react';

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '');
};

type TriggerType = 'first_message' | 'after_package_sent' | 'after_list_sent' | 'status_hot' | 'inactive_days';

interface AutoMessage {
  id:            string;
  name:          string;
  trigger:       TriggerType;
  message:       string;
  active:        boolean;
  inactive_days: number;
}

const TRIGGERS: Record<TriggerType, { label: string; desc: string; cardCls: string; badgeCls: string }> = {
  first_message:      { label: 'Erste Nachricht',   desc: 'Wenn User zum ersten Mal schreibt',                  cardCls: 'border-blue-200 bg-blue-50/40',   badgeCls: 'bg-blue-100 text-blue-700'   },
  after_package_sent: { label: 'Nach Paket',         desc: 'Direkt nachdem ein Paket-Keyword gesendet wurde',    cardCls: 'border-purple-200 bg-purple-50/40', badgeCls: 'bg-purple-100 text-purple-700' },
  after_list_sent:    { label: 'Nach Liste',         desc: 'Direkt nachdem die Listennachricht gesendet wurde',  cardCls: 'border-brand-200 bg-brand-50/40',  badgeCls: 'bg-brand-100 text-brand-700'  },
  status_hot:         { label: 'Status → HOT',       desc: 'Wenn User auf HOT gesetzt wird',                    cardCls: 'border-orange-200 bg-orange-50/40', badgeCls: 'bg-orange-100 text-orange-700' },
  inactive_days:      { label: 'Inaktiv',            desc: 'Nach X Tagen ohne Nachricht',                       cardCls: 'border-border bg-background/40',    badgeCls: 'bg-muted text-muted-foreground'   },
};

const mkNew = (): AutoMessage => ({
  id:            `am-${Date.now()}`,
  name:          '',
  trigger:       'first_message',
  message:       '',
  active:        true,
  inactive_days: 5,
});

function SaveBtn({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
        saved ? 'bg-emerald-500 text-white' : 'bg-brand-500 hover:bg-brand-600 text-white',
        saving && 'opacity-60 cursor-wait'
      )}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : saved  ? <Check className="h-3.5 w-3.5" />
              : <Save className="h-3.5 w-3.5" />}
      {saving ? 'Speichern…' : saved ? 'Gespeichert' : 'Speichern'}
    </button>
  );
}

export default function AutoMessagesPage() {
  const { withCreator } = useCreator();
  const [items,   setItems]   = useState<AutoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<Record<string, boolean>>({});
  const [saved,   setSaved]   = useState<Record<string, boolean>>({});

  const base = apiBase();
  const api  = `${base}/api/v1`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(withCreator(`${api}/config/automessages`));
      const data = await res.json();
      const val  = data?.value;
      if (Array.isArray(val) && val.length > 0) {
        setItems(val.map((am: any) => ({
          id:            am.id            || `am-${Date.now()}-${Math.random()}`,
          name:          am.name          || '',
          trigger:       am.trigger       || 'first_message',
          message:       am.message       || '',
          active:        am.active        !== false,
          inactive_days: Number(am.inactive_days ?? 5),
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  const persist = async (id: string, list: AutoMessage[]) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await fetch(withCreator(`${api}/config/automessages`), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(list),
      });
      setSaved(s => ({ ...s, [id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2500);
    } finally {
      setSaving(s => ({ ...s, [id]: false }));
    }
  };

  const update = (id: string, field: keyof AutoMessage, val: any) =>
    setItems(prev => prev.map(am => am.id === id ? { ...am, [field]: val } : am));

  const add = () => setItems(prev => [...prev, mkNew()]);

  const remove = async (id: string) => {
    const next = items.filter(am => am.id !== id);
    setItems(next);
    await fetch(withCreator(`${api}/config/automessages`), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(next),
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 flex items-center gap-2 text-muted-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Lade Automatisierungen…</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-4xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">Automatische Nachrichten</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Vorgefertigte Nachrichten die bei bestimmten Ereignissen automatisch und exakt so gesendet werden — kein AI-Eingriff.
            </p>
          </div>
          <button
            onClick={add}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Hinzufügen
          </button>
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-theme-sm">
            <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">Noch keine Automatisierungen</p>
            <p className="text-xs text-muted-foreground/60 mt-1 mb-4">Klick auf "Hinzufügen" um eine neue Automatisierung zu erstellen.</p>
            <button onClick={add} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
              <Plus className="h-3.5 w-3.5" />Erste Automatisierung
            </button>
          </div>
        )}

        {/* Cards */}
        <div className="space-y-4">
          {items.map(am => {
            const t = TRIGGERS[am.trigger] || TRIGGERS.first_message;
            return (
              <div key={am.id} className={cn('rounded-2xl border p-5 shadow-theme-sm transition-shadow hover:shadow-theme-md', t.cardCls)}>

                {/* Card header */}
                <div className="flex items-start gap-3 mb-4">
                  <span className={cn('mt-0.5 px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 whitespace-nowrap', t.badgeCls)}>
                    {t.label}
                  </span>
                  <input
                    value={am.name}
                    onChange={e => update(am.id, 'name', e.target.value)}
                    placeholder="Name dieser Automatisierung…"
                    className="flex-1 min-w-0 text-sm font-semibold text-foreground bg-transparent border-none outline-none focus:underline decoration-brand-400 placeholder:text-muted-foreground/60"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Active toggle */}
                    <button
                      type="button"
                      onClick={() => update(am.id, 'active', !am.active)}
                      title={am.active ? 'Deaktivieren' : 'Aktivieren'}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-all flex-shrink-0 focus-visible:ring-2 focus-visible:ring-brand-400',
                        am.active ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-all',
                        am.active ? 'left-[18px]' : 'left-0.5'
                      )} />
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => remove(am.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-500 text-muted-foreground/60 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <form onSubmit={e => { e.preventDefault(); persist(am.id, items); }} className="space-y-3">

                  {/* Trigger selector */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Trigger</label>
                    <select
                      value={am.trigger}
                      onChange={e => update(am.id, 'trigger', e.target.value as TriggerType)}
                      className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                    >
                      {(Object.entries(TRIGGERS) as [TriggerType, typeof TRIGGERS[TriggerType]][]).map(([val, info]) => (
                        <option key={val} value={val}>{info.label} — {info.desc}</option>
                      ))}
                    </select>
                  </div>

                  {/* Inactive days */}
                  {am.trigger === 'inactive_days' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nach wie vielen Tagen inaktiv?</label>
                      <div className="relative w-[150px]">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={am.inactive_days}
                          onChange={e => update(am.id, 'inactive_days', Number(e.target.value))}
                          className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60 pointer-events-none">Tage</span>
                      </div>
                    </div>
                  )}

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      <MessageSquare className="h-3 w-3 inline mr-1" />Nachricht (wird exakt so gesendet — copy-paste)
                    </label>
                    <textarea
                      value={am.message}
                      onChange={e => update(am.id, 'message', e.target.value)}
                      rows={5}
                      placeholder="Nachricht die automatisch gesendet wird — inklusive Links falls nötig…"
                      className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <SaveBtn saving={!!saving[am.id]} saved={!!saved[am.id]} />
                  </div>
                </form>
              </div>
            );
          })}
        </div>

      </div>
    </DashboardLayout>
  );
}
