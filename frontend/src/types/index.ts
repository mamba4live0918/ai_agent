export interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  document_count: number;
}

export interface Document {
  id: string;
  title: string;
  category_id: string;
  file_type: string;
  content_preview: string | null;
  chunk_count: number;
  created_at: string;
  category_name: string | null;
}

export interface DocumentList {
  items: Document[];
  total: number;
}

export interface Customer {
  id: string;
  name: string;
  raw_input: string | null;
  structured_data: Record<string, unknown> | null;
  ai_profile: Record<string, unknown> | null;
  scores: Record<string, { value: number; reasoning: string }> | null;
  created_at: string;
  updated_at: string;
}

export interface ScoreDimension {
  key: string;
  label: string;
  value: number;
  reasoning: string;
  color: string;
}

export interface CustomerList {
  items: Customer[];
  total: number;
}

export interface CustomerProfile {
  name: string;
  structured_data: Record<string, unknown>;
  ai_profile: Record<string, unknown>;
  scores: Record<string, { value: number; reasoning: string }> | null;
}

export interface ChatResponse {
  answer: string;
  conversation_id: string;
  sources: { filename: string; page: string; preview: string }[];
}
