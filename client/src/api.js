const API_BASE = process.env.REACT_APP_API_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth-logout'));
  }
  return res;
}

export async function apiJson(url, options = {}) {
  const res = await api(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  return text ? JSON.parse(text) : null;
}

export const auth = {
  register: (data) => apiJson('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (data) => apiJson('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

export const boards = {
  getById: (id) => apiJson(`/api/boards/${id}`),
  getByTeam: (teamId) => apiJson(`/api/boards/team/${teamId}`),
  create: (data) => apiJson('/api/boards', { method: 'POST', body: JSON.stringify(data) }),
};

export const columns = {
  getByBoard: (boardId) => apiJson(`/api/columns/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/columns/board/${boardId}`, { method: 'POST', body: JSON.stringify(data) }),
};

export const quests = {
  getByColumn: (columnId) => apiJson(`/api/quests/column/${columnId}`),
  create: (data) => apiJson('/api/quests', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJson(`/api/quests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  move: (data) => apiJson('/api/quests/move', { method: 'POST', body: JSON.stringify(data) }),
};

export const character = {
  getMe: () => apiJson('/api/characters/me'),
  getLevels: () => apiJson('/api/characters/levels'),
};

export const teams = {
  get: (id) => apiJson(`/api/teams/${id}`),
  getMyTeamsWithBoards: () => apiJson('/api/teams/my'),
  getMembers: (teamId) => apiJson(`/api/teams/${teamId}/members`),
  create: (data) => apiJson('/api/teams', { method: 'POST', body: JSON.stringify(data) }),
  inviteByEmail: async (teamId, email) => {
    const res = await api(`/api/teams/${teamId}/members/invite`, { method: 'POST', body: JSON.stringify({ email }) });
    if (res.ok) return { ok: true };
    const text = await res.text();
    if (res.status === 404) return { ok: false, error: text || 'Пользователь с таким email не найден.' };
    if (res.status === 400) return { ok: false, error: text || 'Пользователь уже в команде.' };
    return { ok: false, error: text || 'Ошибка при добавлении.' };
  },
};
