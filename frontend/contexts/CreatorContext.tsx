'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface Creator {
  id: string;
  name: string;
  display_name: string;
  color: string;
  emoji: string;
  telegram_phone: string | null;
  has_session: boolean;
  is_active: boolean;
  is_default: boolean;
  is_connected?: boolean;
  account_name?: string | null;
}

interface CreatorContextValue {
  creators: Creator[];
  selected: Creator | null;
  selectedId: string | null;
  switchCreator: (id: string) => void;
  reload: () => Promise<void>;
  /** Append ?creator_id=... to any API URL (no-op for default creator) */
  withCreator: (url: string) => string;
}

const CreatorContext = createContext<CreatorContextValue>({
  creators: [], selected: null, selectedId: null,
  switchCreator: () => {}, reload: async () => {},
  withCreator: (u) => u,
});

const getApiBase = () => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return raw.replace(/\/api\/v1\/?$/, '') + '/api/v1';
};

export function CreatorProvider({ children }: { children: ReactNode }) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/creators`);
      if (!res.ok) return;
      const data: Creator[] = await res.json();
      setCreators(data);

      // Restore or default selection
      const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedCreatorId') : null;
      if (stored && data.some(c => c.id === stored)) {
        setSelectedId(stored);
      } else {
        const def = data.find(c => c.is_default) || data[0];
        if (def) {
          setSelectedId(def.id);
          localStorage.setItem('selectedCreatorId', def.id);
        }
      }
    } catch (e) {
      console.warn('Failed to load creators:', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchCreator = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem('selectedCreatorId', id);
  }, []);

  const defaultCreator = creators.find(c => c.is_default);
  const selected = creators.find(c => c.id === selectedId) ?? null;

  const withCreator = useCallback((url: string): string => {
    if (!selectedId) return url;
    // Default creator uses original (unscoped) keys — no param needed
    if (defaultCreator && selectedId === defaultCreator.id) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}creator_id=${selectedId}`;
  }, [selectedId, defaultCreator]);

  return (
    <CreatorContext.Provider value={{ creators, selected, selectedId, switchCreator, reload: load, withCreator }}>
      {children}
    </CreatorContext.Provider>
  );
}

export function useCreator() {
  return useContext(CreatorContext);
}
