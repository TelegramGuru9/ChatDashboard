import { useState, useEffect, useCallback, useRef } from 'react';
import { api, messagesAPI, usersAPI, leadsAPI } from '@/lib/api';

// ==================== useMessages HOOK ====================

export const useMessages = (params?: { user_id?: string; skip?: number; limit?: number }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await messagesAPI.list(params);
      setMessages(data.items);
      setTotal(data.total);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchMessages();
    
    // Auto-refresh interval (5 seconds)
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  return { messages, loading, error, total, hasMore, refetch: fetchMessages };
};

// ==================== useUser HOOK ====================

export const useUser = (userId: string) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersAPI.get(userId);
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [userId, fetchUser]);

  const updateUser = useCallback(async (updateData: any) => {
    try {
      const updated = await usersAPI.update(userId, updateData);
      setUser(updated);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
      throw err;
    }
  }, [userId]);

  return { user, loading, error, refetch: fetchUser, updateUser };
};

// ==================== useConversation HOOK ====================

export const useConversation = (userId: string, limit: number = 100) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await messagesAPI.getUserHistory(userId, limit);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [userId, fetchHistory]);

  return { messages, loading, error, refetch: fetchHistory };
};

// ==================== useWebSocket HOOK ====================

export const useWebSocket = (userId: string, onMessageUpdate?: (message: any) => void) => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number>();
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connect = useCallback(() => {
    if (ws.current) return;

    try {
      const wsUrl = new URL(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000');
      wsUrl.pathname = '/ws/messages';
      wsUrl.searchParams.append('user_id', userId);

      ws.current = new WebSocket(wsUrl.toString());

      ws.current.onopen = () => {
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        console.log('WebSocket connected');
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message_new') {
            onMessageUpdate?.(data.message);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.current.onclose = () => {
        setConnected(false);
        ws.current = null;

        // Attempt to reconnect
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current += 1;
          reconnectTimeout.current = window.setTimeout(connect, delay);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [userId, onMessageUpdate]);

  const send = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [userId, connect]);

  return { connected, error, send };
};

// ==================== useLeadScoring HOOK ====================

export const useLeadScoring = (userId: string) => {
  const [score, setScore] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateScore = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await leadsAPI.score(userId);
      setScore(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to calculate score';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    calculateScore();
  }, [userId, calculateScore]);

  return { score, loading, error, recalculate: calculateScore };
};

// ==================== useDebounce HOOK ====================

export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// ==================== useSearch HOOK ====================

export const useSearch = (searchFn: (query: string) => Promise<any[]>, delay: number = 300) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, delay);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }

    const search = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await searchFn(debouncedQuery);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    };

    search();
  }, [debouncedQuery, searchFn]);

  return { query, setQuery, results, loading, error };
};

// ==================== usePagination HOOK ====================

export const usePagination = (initialPage: number = 1, pageSize: number = 50) => {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const skip = (currentPage - 1) * pageSize;

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, page));
  };

  const nextPage = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const prevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  return {
    currentPage,
    skip,
    limit: pageSize,
    goToPage,
    nextPage,
    prevPage,
  };
};

// ==================== useLocalStorage HOOK ====================

export const useLocalStorage = <T,>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Initialize from localStorage
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.error(`Error reading localStorage key \"${key}\":`, error);
    }
  }, [key]);

  // Update localStorage when value changes
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key \"${key}\":`, error);
    }
  };

  return [storedValue, setValue] as const;
};

export default {
  useMessages,
  useUser,
  useConversation,
  useWebSocket,
  useLeadScoring,
  useDebounce,
  useSearch,
  usePagination,
  useLocalStorage,
};
