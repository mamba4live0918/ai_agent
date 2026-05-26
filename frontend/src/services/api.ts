const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

async function tauriFetch(): Promise<typeof globalThis.fetch> {
  if (isTauri()) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    return fetch as unknown as typeof globalThis.fetch;
  }
  return globalThis.fetch;
}

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const fetcher = await tauriFetch();
  const mergedHeaders: Record<string, string> = { ...authHeaders() };
  if (options?.body) mergedHeaders['Content-Type'] = 'application/json';
  if (options?.headers) Object.assign(mergedHeaders, options.headers);
  const { headers: _, ...rest } = options || {};
  const res = await fetcher(`${BASE}${url}`, {
    headers: mergedHeaders,
    ...rest,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ───
export const loginUser = (data: import('../types').LoginRequest) =>
  request<import('../types').TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) });

export const registerUser = (data: import('../types').RegisterRequest) =>
  request<import('../types').TokenResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) });

export const getCurrentUser = () =>
  request<import('../types').User>('/auth/me');

// ─── Instructor ───
export const getInstructorOverview = () =>
  request<import('../types').TrainingStatsOverview>('/instructor/statistics/overview');

export const getInstructorPerUserStats = () =>
  request<import('../types').PerUserStats[]>('/instructor/statistics/per-user');

export const getInstructorTrends = (granularity: 'weekly' | 'monthly' = 'weekly') =>
  request<import('../types').TrainingTrendPoint[]>(`/instructor/statistics/trends?granularity=${granularity}`);

export const exportReport = async (): Promise<void> => {
  const token = getToken();
  const fetcher = await tauriFetch();
  const res = await fetcher(`${BASE}/instructor/reports/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training_report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

// Categories
export const getCategories = () => request<import('../types').Category[]>('/knowledge/categories');
export const createCategory = (data: { name: string; description?: string; icon?: string }) =>
  request<import('../types').Category>('/knowledge/categories', { method: 'POST', body: JSON.stringify(data) });

// Documents
export const getDocuments = (categoryId?: string, q?: string) => {
  const params = new URLSearchParams();
  if (categoryId) params.set('category_id', categoryId);
  if (q) params.set('q', q);
  return request<import('../types').DocumentList>(`/knowledge/documents?${params}`);
};
export const getDocument = (id: string) =>
  request<import('../types').Document>(`/knowledge/documents/${id}`);
export const uploadDocument = async (file: File, categoryId: string, _onProgress?: (pct: number) => void) => {
  const form = new FormData();
  form.append('file', file);
  form.append('category_id', categoryId);
  const fetcher = await tauriFetch();
  const res = await fetcher(`${BASE}/knowledge/documents`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); }
    throw new Error('Upload failed');
  }
  return res.json();
};
export const deleteDocument = (id: string) =>
  request<void>(`/knowledge/documents/${id}`, { method: 'DELETE' });

// Customers
export const getCustomers = (q?: string, page = 1, pageSize = 10) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return request<import('../types').CustomerList>(`/customers?${params}`);
};
export const getCustomer = (id: string) =>
  request<import('../types').Customer>(`/customers/${id}`);
export const createCustomer = (data: { name: string; raw_input?: string; structured_data?: Record<string, unknown>; ai_profile?: Record<string, unknown>; scores?: Record<string, unknown> }) =>
  request<import('../types').Customer>('/customers', { method: 'POST', body: JSON.stringify(data) });
export const analyzeCustomer = (rawText: string) =>
  request<import('../types').CustomerProfile>('/customers/analyze', { method: 'POST', body: JSON.stringify({ raw_text: rawText }) });
export const generatePresalesPrep = (id: string) =>
  request<import('../types').Customer>(`/customers/${id}/presales-prep`, { method: 'POST' });
export const updateCustomer = (id: string, data: { name: string; raw_input?: string; structured_data?: Record<string, unknown>; ai_profile?: Record<string, unknown>; scores?: Record<string, unknown> }) =>
  request<import('../types').Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const regenerateProfile = (id: string, structuredData?: Record<string, unknown>) =>
  request<import('../types').Customer>(`/customers/${id}/regenerate-profile`, {
    method: 'POST',
    body: JSON.stringify({ structured_data: structuredData || null }),
  });
export const deleteCustomer = (id: string) =>
  request<void>(`/customers/${id}`, { method: 'DELETE' });

// Products
export const getProducts = (type?: string, riskLevel?: number, q?: string, page = 1, pageSize = 10) => {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (riskLevel !== undefined) params.set('risk_level', String(riskLevel));
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return request<import('../types').ProductList>(`/products?${params}`);
};
export const getProduct = (id: string) =>
  request<import('../types').Product>(`/products/${id}`);
export const createProduct = (data: Record<string, unknown>) =>
  request<import('../types').Product>('/products', { method: 'POST', body: JSON.stringify(data) });
export const importProductsCsv = async (file: File, _onProgress?: (pct: number) => void) => {
  const form = new FormData();
  form.append('file', file);
  const fetcher = await tauriFetch();
  const res = await fetcher(`${BASE}/products/batch`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); }
    throw new Error('Import failed');
  }
  return res.json();
};
export const updateProduct = (id: string, data: Record<string, unknown>) =>
  request<import('../types').Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const refreshProductNav = (id: string) =>
  request<import('../types').Product>(`/products/${id}/refresh-nav`, { method: 'POST' });
export const deleteProduct = (id: string) =>
  request<void>(`/products/${id}`, { method: 'DELETE' });

// Allocation
export const generateAllocationPlan = (id: string) =>
  request<import('../types').Customer>(`/customers/${id}/allocation-plan`, { method: 'POST' });
export const saveAllocationPlan = (id: string, userPlan: Record<string, unknown>, totalInvestable?: number) =>
  request<import('../types').Customer>(`/customers/${id}/allocation-plan`, {
    method: 'PUT',
    body: JSON.stringify({ user_plan: userPlan, total_investable: totalInvestable }),
  });

// Chat
export const sendMessage = (message: string, conversationId?: string) =>
  request<import('../types').ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversation_id: conversationId || null }),
  });

// Training
export const createTrainingSession = (data: { customer_id?: string; persona?: import('../types').Persona; scenario: string }) =>
  request<import('../types').TrainingSession>('/training/sessions', { method: 'POST', body: JSON.stringify(data) });
export const getTrainingSessions = (customerId?: string, status?: string, page = 1, pageSize = 20) => {
  const params = new URLSearchParams();
  if (customerId) params.set('customer_id', customerId);
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return request<import('../types').SessionList>(`/training/sessions?${params}`);
};
export const getTrainingSession = (id: string) =>
  request<import('../types').TrainingSessionDetail>(`/training/sessions/${id}`);
export const sendTrainingMessage = (id: string, content: string) =>
  request<import('../types').SendMessageResult>(`/training/sessions/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
export const getQuickReplies = (id: string) =>
  request<{ suggestions: string[] }>(`/training/sessions/${id}/quick-replies`, { method: 'POST' });
export const endTrainingSession = (id: string) =>
  request<import('../types').TrainingReview>(`/training/sessions/${id}/end`, { method: 'POST' });
export const getTrainingReview = (id: string) =>
  request<import('../types').TrainingReview>(`/training/sessions/${id}/review`);
export const deleteTrainingSession = (id: string) =>
  request<void>(`/training/sessions/${id}`, { method: 'DELETE' });

// ─── Post-Sales Analysis ───
export const createPostSalesSession = (customerId?: string) =>
  request<import('../types').PostSalesSession>('/post-sales/sessions', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId || null }),
  });

export const getPostSalesSessions = (customerId?: string, status?: string, page = 1, pageSize = 20) => {
  const params = new URLSearchParams();
  if (customerId) params.set('customer_id', customerId);
  if (status) params.set('status', status);
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return request<import('../types').PostSalesSessionList>(`/post-sales/sessions?${params}`);
};

export const getPostSalesSession = (id: string) =>
  request<import('../types').PostSalesSessionDetail>(`/post-sales/sessions/${id}`);

export const updatePostSalesSession = (id: string, data: { customer_id?: string | null }) =>
  request<import('../types').PostSalesSession>(`/post-sales/sessions/${id}`, {
    method: 'PATCH', body: JSON.stringify(data),
  });

export const addPostSalesMessage = (id: string, content: string) =>
  request<import('../types').PostSalesMessage>(`/post-sales/sessions/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

export const uploadPostSalesAudio = async (id: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  const fetcher = await tauriFetch();
  const res = await fetcher(`${BASE}/post-sales/sessions/${id}/audio`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); }
    throw new Error('Upload failed');
  }
  return res.json() as Promise<import('../types').PostSalesMessage[]>;
};

export const endPostSalesSession = (id: string) =>
  request<import('../types').PostSalesSessionDetail>(`/post-sales/sessions/${id}/end`, { method: 'POST' });

export const deletePostSalesSession = (id: string) =>
  request<void>(`/post-sales/sessions/${id}`, { method: 'DELETE' });

// ─── Feedback ───
export const submitFeedback = (data: import('../types').FeedbackRequest) =>
  request<import('../types').FeedbackResponse>('/feedback', { method: 'POST', body: JSON.stringify(data) });

export const getMyFeedback = () =>
  request<import('../types').FeedbackResponse[]>('/feedback/my');

export const getFeedbackStats = () =>
  request<import('../types').FeedbackStats>('/feedback/stats');
