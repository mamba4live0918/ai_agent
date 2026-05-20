const BASE = 'http://localhost:8000/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

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
export const uploadDocument = (file: File, categoryId: string, onProgress?: (pct: number) => void) => {
  return new Promise<import('../types').Document>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('category_id', categoryId);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Upload failed'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('POST', `${BASE}/knowledge/documents`);
    xhr.send(form);
  });
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
export const regenerateProfile = (id: string) =>
  request<import('../types').Customer>(`/customers/${id}/regenerate-profile`, { method: 'POST' });
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
export const importProductsCsv = (file: File, onProgress?: (pct: number) => void) => {
  return new Promise<import('../types').ProductList>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Import failed'));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Import failed')));
    xhr.open('POST', `${BASE}/products/batch`);
    xhr.send(form);
  });
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
