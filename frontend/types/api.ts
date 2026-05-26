export interface UserResponse {
  id: string;
  user_id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  phone?: string;
  bio?: string;
  is_bot: boolean;
  conversation_state: string;
  lead_score: number;
  ai_enabled: boolean;
  total_messages: number;
  total_interactions: number;
  last_message_at?: string;
  first_message_at?: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface MessageResponse {
  id: string;
  message_id: number;
  user_id: string;
  text?: string;
  has_media: boolean;
  media_type?: string;
  media_url?: string;
  direction: 'incoming' | 'outgoing';
  is_ai_generated: boolean;
  is_manual_override: boolean;
  processed: boolean;
  has_embedding: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface LeadResponse {
  id: string;
  user_id: string;
  status: string;
  qualified: boolean;
  lead_score: number;
  funnel_stage: string;
  total_interactions: number;
  engagement_score: number;
  converted: boolean;
  source?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
}
