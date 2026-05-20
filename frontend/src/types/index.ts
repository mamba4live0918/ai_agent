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
  presales_prep: Record<string, string> | null;
  allocation_plan: AllocationPlan | null;
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
  page: number;
  page_size: number;
  total_pages: number;
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

export interface Product {
  id: string;
  name: string;
  type: string;
  risk_level: number;
  expected_return: number;
  min_investment: number;
  description: string | null;
  issuer: string | null;
  target_tags: string[] | null;
  lock_period: string | null;
  nav_history: NavPoint[] | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NavPoint {
  date: string;
  nav: number;
  return_rate: number;
}

export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AllocationItem {
  product_id: string;
  product_name: string;
  ratio: number;
  amount: number;
  reason: string;
}

export interface AllocationSubPlan {
  plan_type: string;
  overall_rationale: string;
  risk_return_profile: string;
  allocations: AllocationItem[];
}

export interface AllocationPlan {
  ai_plan: Record<string, AllocationSubPlan>;
  user_plan: Record<string, AllocationSubPlan>;
  total_investable?: number;
  generated_at?: string;
}
