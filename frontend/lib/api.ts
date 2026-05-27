import { UserResponse, MessageResponse, LeadResponse } from '@/types/api';

const _rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_BASE_URL = _rawUrl.endsWith('/api/v1') ? _rawUrl : `${_rawUrl}/api/v1`;
const API_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000');

// ==================== HTTP CLIENT ====================

class APIClient {
  private baseURL: string;
  private timeout: number;
  private authToken: string | null = null;

  constructor(baseURL: string = API_BASE_URL, timeout: number = API_TIMEOUT) {
    this.baseURL = baseURL;
    this.timeout = timeout;
    this.loadAuthToken();
  }

  private loadAuthToken(): void {
    // Load from localStorage or secure cookie
    if (typeof window !== 'undefined') {
      this.authToken = localStorage.getItem('authToken');
    }
  }

  setAuthToken(token: string): void {
    this.authToken = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
    }
  }

  clearAuthToken(): void {
    this.authToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  async request<T = any>(
    method: string,
    path: string,
    options: {
      data?: any;
      params?: Record<string, any>;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseURL}${path}`);

    // Add query parameters
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this.getHeaders(),
        body: options.data ? JSON.stringify(options.data) : undefined,
        signal: options.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle errors
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new APIError(
          error.detail || error.error || 'Request failed',
          response.status,
          error
        );
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return null as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw new APIError(String(error), 0, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T = any>(path: string, options?: any): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  async post<T = any>(path: string, data?: any, options?: any): Promise<T> {
    return this.request<T>('POST', path, { ...options, data });
  }

  async put<T = any>(path: string, data?: any, options?: any): Promise<T> {
    return this.request<T>('PUT', path, { ...options, data });
  }

  async patch<T = any>(path: string, data?: any, options?: any): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, data });
  }

  async delete<T = any>(path: string, options?: any): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}

// ==================== ERROR HANDLING ====================

export class APIError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number = 0, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }

  isAuthError(): boolean {
    return this.status === 401;
  }

  isValidationError(): boolean {
    return this.status === 422;
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isConflict(): boolean {
    return this.status === 409;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}

// ==================== API ENDPOINT FUNCTIONS ====================

const api = new APIClient();

// ---- MESSAGES ----

export const messagesAPI = {
  list: (params?: { skip?: number; limit?: number; user_id?: string; direction?: string }) =>
    api.get<{ items: MessageResponse[]; total: number; has_more: boolean }>('/messages', { params }),

  get: (messageId: string) =>
    api.get<MessageResponse>(`/messages/${messageId}`),

  getUserHistory: (userId: string, limit: number = 100) =>
    api.get<MessageResponse[]>(`/messages/user/${userId}/history`, { params: { limit } }),

  search: (query: string, params?: any) =>
    api.get('/messages/search', { params: { q: query, ...params } }),
};

// ---- USERS ----

export const usersAPI = {
  list: (params?: { skip?: number; limit?: number; conversation_state?: string; min_lead_score?: number }) =>
    api.get<{ items: UserResponse[]; total: number; has_more: boolean }>('/users', { params }),

  get: (userId: string) =>
    api.get<UserResponse>(`/users/${userId}`),

  update: (userId: string, data: any) =>
    api.patch<UserResponse>(`/users/${userId}`, data),

  updateCRM: (userId: string, data: any) =>
    api.patch<UserResponse>(`/users/${userId}/crm`, data),
};

// ---- LEADS ----

export const leadsAPI = {
  list: (params?: { skip?: number; limit?: number; status?: string; funnel_stage?: string }) =>
    api.get<{ items: LeadResponse[]; total: number; has_more: boolean }>('/leads', { params }),

  get: (leadId: string) =>
    api.get<LeadResponse>(`/leads/${leadId}`),

  score: (userId: string) =>
    api.post('/leads/score', { user_id: userId }),

  update: (leadId: string, data: any) =>
    api.patch<LeadResponse>(`/leads/${leadId}`, data),
};

// ---- AI ----

export const aiAPI = {
  generateResponse: (userId: string, data?: any) =>
    api.post('/ai/generate-response', { user_id: userId, ...data }),

  toggleAI: (userId: string, enabled: boolean, overrideMinutes?: number) =>
    api.post(`/ai/toggle/${userId}`, { enabled, override_minutes: overrideMinutes }),

  analyzeSentiment: (text: string) =>
    api.post('/ai/analyze-sentiment', { text }),

  extractIntent: (text: string) =>
    api.post('/ai/extract-intent', { text }),
};

// ---- HEALTH ----

export const healthAPI = {
  check: () => api.get('/health'),
  detailed: () => api.get('/health/detailed'),
};

// Export client for custom requests
export { api, APIClient };

export default api;
