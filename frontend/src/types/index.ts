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
  fund_code: string | null;
  nav_history: NavPoint[] | null;
  source: string;
  nav_updated_at: string | null;
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

// ─── Training ───
export interface Persona {
  name: string;
  age?: number | null;
  gender?: string | null;
  occupation?: string | null;
  personality?: string | null;
  investment_experience?: string | null;
  wealth_level?: string | null;
  risk_preference?: string | null;
  goals?: string | null;
}

export interface TrainingSession {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  persona: Persona;
  scenario: string;
  scenario_context: string | null;
  status: 'pending' | 'active' | 'completed';
  coach_suggestions: CoachSuggestion[] | null;
  started_at: string;
  completed_at: string | null;
  message_count: number;
  has_review: boolean;
}

export interface CoachTip {
  strategy: string;
  phrasing: string;
  golden_quote: string;
  emotion: string;
}

export interface CoachSuggestion {
  message_index: number;
  tips: CoachTip;
  created_at: string;
}

export interface TrainingMessage {
  id: string;
  session_id: string;
  role: 'user' | 'customer' | 'coach';
  content: string;
  coach_tip: CoachTip | null;
  created_at: string;
}

export interface TrainingSessionDetail extends TrainingSession {
  messages: TrainingMessage[];
  review: TrainingReview | null;
}

export interface TrainingReview {
  id: string;
  session_id: string;
  scores: {
    expression_logic: number;
    professional_accuracy: number;
    emotional_eq: number;
    overall: number;
  };
  dimension_scores: Record<string, number>;
  overall_comment: string | null;
  weakness_analysis: { skill: string; level: string; suggestion: string }[] | null;
  highlights: { type: 'good' | 'bad'; message_content: string; comment: string; improved_version?: string }[] | null;
  next_steps: { priority: number; action: string }[] | null;
  created_at: string;
}

export interface SendMessageResult {
  user_message: TrainingMessage;
  customer_message: TrainingMessage;
  coach_tips: CoachTip | null;
  conversation_ending: boolean;
}

export interface SessionList {
  items: TrainingSession[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
