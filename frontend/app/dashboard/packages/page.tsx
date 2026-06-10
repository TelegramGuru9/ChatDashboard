'use client';

import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useCreator } from '@/contexts/CreatorContext';
import { cn } from '@/lib/utils';
import { Save, MessageSquare, Hash, ListOrdered, Loader2, Check } from 'lucide-react';

const apiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '');
};

interface Package {
  id: string;
  name: string;
  message: string;
  keywords: string;
}

interface ListMessage {
  message: string;
  keywords: string;
  auto_send_at: number;
  active: boolean;
}

const EMPTY_PACKAGES: Package[] = [
  { id: 'pkg-1', name: 'Paket 1', message: '', keywords: '' },
  { id: 'pkg-2', name: 'Paket 2', message: '', keywords: '' },
  { id: 'pkg-3', name: 'Paket 3', message: '', keywords: '' },
  { id: 'pkg-4', name: 'Paket 4', message: '', keywords: '' },
];

const EMPTY_LIST: ListMessage = {
  message: '',
  keywords: '',
  auto_send_at: 30,
  active: true,
};

function SaveButton({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
        saved
          ? 'bg-emerald-500 text-white'
          : 'bg-brand-500 hover:bg-brand-600 text-white',
        saving && 'opacity-60 cursor-wait'
      )}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Save className="h-3.5 w-3.5" />
      )}
      {saving ? 'Speichern…' : saved ? 'Gespeichert' : 'Speichern'}
    </button>
  );
}

export default function PackagesPage() {
  const { withCreator } = useCreator();
  const [packages,   setPackages]   = useState<Package[]>(EMPTY_PACKAGES);
  const [listMsg,    setListMsg]    = useState<ListMessage>(EMPTY_LIST);
  const [loading,    setLoading]    = useState(true);
  const [pkgSaving,  setPkgSaving]  = useState<Record<string, boolean>>({});
  const [pkgSaved,   setPkgSaved]   = useState<Record<string, boolean>>({});
  const [listSaving, setListSaving] = useState(false);
  const [listSaved,  setListSaved]  = useState(false);

  const base = apiBase();
  const api  = `${base}/api/v1`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, listRes] = await Promise.allSettled([
        fetch(withCreator(`${api}/config/packages`)).then(r => r.json()),
        fetch(withCreator(`${api}/config/list_message`)).then(r => r.json()),
      ]);

      if (pkgRes.status === 'fulfilled') {
        const val = pkgRes.value?.value;
        const raw: any[] = Array.isArray(val)
          ? val
          : Array.isArray(val?.packages) ? val.packages : [];
        // Always show exactly 4 slots — merge DB data on top of defaults
        const merged = EMPTY_PACKAGES.map((def, i) => {
          const db = raw[i];
          if (!db) return def;
          return {
            id:       db.id       || def.id,
            name:     db.name     || def.name,
            message:  db.message  || '',
            keywords: db.keywords || '',
          };
        });
        setPackages(merged);
      }

      if (listRes.status === 'fulfilled') {
        const val = listRes.value?.value;
        if (val && typeof val === 'object') {
          setListMsg({
            message:      val.message      || '',
            keywords:     val.keywords     || '',
            auto_send_at: Number(val.auto_send_at ?? 30),
            active:       val.active !== false,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [api, withCreator]);

  useEffect(() => { load(); }, [load]);

  const savePkg = async (idx: number) => {
    const key = packages[idx].id;
    setPkgSaving(s => ({ ...s, [key]: true }));
    try {
      await fetch(withCreator(`${api}/config/packages`), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(packages),   // always persist the full array
      });
      setPkgSaved(s => ({ ...s, [key]: true }));
      setTimeout(() => setPkgSaved(s => ({ ...s, [key]: false })), 2500);
    } finally {
      setPkgSaving(s => ({ ...s, [key]: false }));
    }
  };

  const saveList = async () => {
    setListSaving(true);
    try {
      await fetch(withCreator(`${api}/config/list_message`), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(listMsg),
      });
      setListSaved(true);
      setTimeout(() => setListSaved(false), 2500);
    } finally {
      setListSaving(false);
    }
  };

  const updatePkg = (idx: number, field: keyof Package, val: string) =>
    setPackages(ps => {
      const n = [...ps];
      n[idx] = { ...n[idx], [field]: val };
      return n;
    });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Lade Pakete…</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-4xl">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Pakete</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vorgefertigte Nachrichten — werden automatisch gesendet wenn Keywords erkannt werden. Kein AI-Eingriff.
          </p>
        </div>

        {/* ── Listennachricht ── */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/30 p-5 shadow-theme-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
              <ListOrdered className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-gray-900">Listennachricht</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Bei Keywords sofort gesendet — und automatisch einmalig bei ~{listMsg.auto_send_at} Nachrichten (pro Nutzer).
              </p>
            </div>
          </div>

          <form onSubmit={e => { e.preventDefault(); saveList(); }} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Nachricht (copy-paste — exakt so wie sie gesendet wird)
              </label>
              <textarea
                value={listMsg.message}
                onChange={e => setListMsg(m => ({ ...m, message: e.target.value }))}
                rows={6}
                placeholder="Hier deine Listennachricht mit allen Paketen und Links eintragen..."
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none leading-relaxed"
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Hash className="h-3 w-3 inline mr-1" />Keywords (komma-getrennt)
                </label>
                <input
                  value={listMsg.keywords}
                  onChange={e => setListMsg(m => ({ ...m, keywords: e.target.value }))}
                  placeholder="liste, pakete, was hast du, angebote"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
                />
              </div>
              <div className="w-[140px]">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Auto-Senden bei</label>
                <div className="relative">
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={listMsg.auto_send_at}
                    onChange={e => setListMsg(m => ({ ...m, auto_send_at: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    Msg
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <SaveButton saving={listSaving} saved={listSaved} />
            </div>
          </form>
        </div>

        {/* ── 4 Package Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((pkg, idx) => (
            <div
              key={pkg.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm hover:shadow-theme-md transition-shadow"
            >
              {/* Editable name */}
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-3.5 w-3.5 text-brand-600" />
                </div>
                <input
                  value={pkg.name}
                  onChange={e => updatePkg(idx, 'name', e.target.value)}
                  className="flex-1 text-sm font-semibold text-gray-900 bg-transparent border-none outline-none hover:underline focus:underline decoration-brand-400 placeholder:text-gray-400"
                  placeholder={`Paket ${idx + 1}`}
                />
              </div>

              <form onSubmit={e => { e.preventDefault(); savePkg(idx); }} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Nachricht an Kunde (copy-paste)
                  </label>
                  <textarea
                    value={pkg.message}
                    onChange={e => updatePkg(idx, 'message', e.target.value)}
                    rows={6}
                    placeholder="Schreib die Nachricht exakt so wie sie gesendet wird — inklusive deinem Link..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none leading-relaxed focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    <Hash className="h-3 w-3 inline mr-1" />Keywords (komma-getrennt)
                  </label>
                  <input
                    value={pkg.keywords}
                    onChange={e => updatePkg(idx, 'keywords', e.target.value)}
                    placeholder={`paket ${idx + 1}, p${idx + 1}`}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent focus:bg-white transition-colors"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <SaveButton saving={!!pkgSaving[pkg.id]} saved={!!pkgSaved[pkg.id]} />
                </div>
              </form>
            </div>
          ))}
        </div>

      </div>
    </DashboardLayout>
  );
}
