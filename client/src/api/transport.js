export const API_BASE = process.env.REACT_APP_API_URL || '';

export function getToken() {
  return localStorage.getItem('token');
}

function handleUnauthorized(response) {
  if (response.status !== 401) return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth-logout'));
}

export async function api(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API_BASE + url, { ...options, headers });
  handleUnauthorized(response);
  return response;
}

export async function apiJson(url, options = {}) {
  const response = await api(url, options);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || response.statusText);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

export async function apiForm(url, formData, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API_BASE + url, { ...options, method: options.method || 'POST', headers, body: formData });
  handleUnauthorized(response);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || response.statusText);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

export function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else query.set(key, String(value));
  });
  const result = query.toString();
  return result ? `?${result}` : '';
}
