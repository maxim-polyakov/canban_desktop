export const API_BASE = process.env.REACT_APP_API_URL || '';
export const PLAN_REQUIRED_EVENT = 'canban:plan-required';

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

const STATUS_MESSAGES = {
  400: 'Некорректный запрос.',
  401: 'Сессия истекла. Войдите снова.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Не найдено.',
  409: 'Конфликт данных. Обновите страницу.',
};

export function responseErrorMessage(status, text, statusText = '') {
  if (text) {
    try {
      const body = JSON.parse(text);
      const message = typeof body === 'string' ? body : body?.error || body?.message || body?.detail || body?.title;
      if (message) return String(message);
    } catch {
      return text;
    }
  }
  return STATUS_MESSAGES[status] || statusText || (status >= 500 ? 'Ошибка сервера. Попробуйте позже.' : `Ошибка ${status}`);
}

function responseError(response, text) {
  const error = new Error(responseErrorMessage(response.status, text, response.statusText));
  error.status = response.status;
  try {
    const body = JSON.parse(text);
    error.code = body?.code;
    error.requiredPlan = body?.requiredPlan;
  } catch {
    // A non-JSON error response has no structured billing metadata.
  }
  return error;
}

function handlePlanRequired(response, text) {
  if (response.status !== 402) return;
  let requiredPlan = 'standard';
  try { requiredPlan = JSON.parse(text)?.requiredPlan || requiredPlan; } catch { /* use the safe default */ }
  window.dispatchEvent(new CustomEvent(PLAN_REQUIRED_EVENT, {
    detail: { requiredPlan, returnTo: `${window.location.pathname}${window.location.search}` },
  }));
}

export async function apiJson(url, options = {}) {
  const response = await api(url, options);
  const text = await response.text();
  handlePlanRequired(response, text);
  if (!response.ok) throw responseError(response, text);
  return text ? JSON.parse(text) : null;
}

export async function apiForm(url, formData, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API_BASE + url, { ...options, method: options.method || 'POST', headers, body: formData });
  handleUnauthorized(response);
  const text = await response.text();
  handlePlanRequired(response, text);
  if (!response.ok) throw responseError(response, text);
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
