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
  const fullUrl = API_BASE + url;
  let res;
  try {
    res = await fetch(fullUrl, { ...options, headers });
  } catch (err) {
    console.error('API request failed:', fullUrl, err);
    throw err;
  }
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
  login: async (data) => {
    const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
    const text = await res.text();
    if (res.status === 403) {
      const e = new Error(text || 'Подтвердите адрес почты.');
      e.status = 403;
      throw e;
    }
    if (!res.ok) throw new Error(text || res.statusText);
    return text ? JSON.parse(text) : null;
  },
  confirmEmail: (data) => apiJson('/api/auth/confirm-email', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (data) => apiJson('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (data) => apiJson('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (data) => apiJson('/api/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch((API_BASE || '') + '/api/auth/me/avatar', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    return text ? JSON.parse(text) : null;
  },
  deleteAvatar: async () => {
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch((API_BASE || '') + '/api/auth/me/avatar', {
      method: 'DELETE',
      headers,
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-logout'));
    }
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    return text ? JSON.parse(text) : null;
  },
};

export const boards = {
  getById: (id) => apiJson(`/api/boards/${id}`),
  getByTeam: (teamId) => apiJson(`/api/boards/team/${teamId}`),
  create: (data) => apiJson('/api/boards', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJson(`/api/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: async (id) => {
    const r = await api(`/api/boards/${id}`, { method: 'DELETE' });
    return r.ok ? true : { ok: false, status: r.status };
  },
};

export const columns = {
  get: (id) => apiJson(`/api/columns/${id}`),
  getByBoard: (boardId) => apiJson(`/api/columns/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/columns/board/${boardId}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJson(`/api/columns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  reorder: (boardId, columnIdsInOrder) =>
    apiJson(`/api/columns/board/${boardId}/reorder`, { method: 'PUT', body: JSON.stringify({ columnIdsInOrder }) }),
  delete: (id) => api(`/api/columns/${id}`, { method: 'DELETE' }).then((r) => r.ok),
};

export const quests = {
  get: (id) => apiJson(`/api/quests/${id}`),
  getByColumn: (columnId) => apiJson(`/api/quests/column/${columnId}`),
  create: (data) => apiJson('/api/quests', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJson(`/api/quests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  move: (data) => apiJson('/api/quests/move', { method: 'POST', body: JSON.stringify(data) }),
  reorder: (data) => apiJson('/api/quests/reorder', { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => api(`/api/quests/${id}`, { method: 'DELETE' }).then((r) => r.ok),
};

export const character = {
  getMe: () => apiJson('/api/characters/me'),
  getByUser: (userId) => apiJson(`/api/characters/user/${userId}`),
  getLevels: () => apiJson('/api/characters/levels'),
  getXpHistory: (limit = 50) => apiJson(`/api/characters/me/xp-history?limit=${limit}`),
};

export const users = {
  getPublic: (userId) => apiJson(`/api/users/${userId}`),
  getAll: () => apiJson('/api/users'),
};

export const teams = {
  get: (id) => apiJson(`/api/teams/${id}`),
  getMyTeamsWithBoards: () => apiJson('/api/teams/my'),
  getMembers: (teamId) => apiJson(`/api/teams/${teamId}/members`),
  create: (data) => apiJson('/api/teams', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiJson(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (teamId) => api(`/api/teams/${teamId}`, { method: 'DELETE' }).then((r) => r.ok),
  addMember: (teamId, userId) => api(`/api/teams/${teamId}/members/${userId}`, { method: 'POST' }).then((r) => r.ok),
  removeMember: async (teamId, userId) => {
    const r = await api(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
    return r.ok ? true : { ok: false, status: r.status };
  },
  leaveTeam: (teamId) => api(`/api/teams/${teamId}/leave`, { method: 'POST' }).then((r) => r.ok),
  inviteByEmail: async (teamId, email) => {
    const res = await api(`/api/teams/${teamId}/members/invite`, { method: 'POST', body: JSON.stringify({ email }) });
    if (res.ok) return { ok: true };
    const text = await res.text();
    if (res.status === 404) return { ok: false, error: text || 'Пользователь с таким email не найден.' };
    if (res.status === 400) return { ok: false, error: text || 'Пользователь уже в команде или приглашение уже отправлено.' };
    return { ok: false, error: text || 'Ошибка при отправке приглашения.' };
  },
  getMyInvites: () => apiJson('/api/teams/invites/my'),
  acceptInvite: (inviteId) => api(`/api/teams/invites/${inviteId}/accept`, { method: 'POST' }).then((r) => r.ok),
  declineInvite: (inviteId) => api(`/api/teams/invites/${inviteId}/decline`, { method: 'POST' }).then((r) => r.ok),
};

export const achievements = {
  getAll: () => apiJson('/api/achievements'),
  getMy: () => apiJson('/api/achievements/me'),
  getByUser: (userId) => apiJson(`/api/achievements/user/${userId}`),
};

export const skills = {
  getTree: () => apiJson('/api/skills/tree'),
  getUnlocked: () => apiJson('/api/skills/unlocked'),
  getTreeByUser: (userId) => apiJson(`/api/skills/user/${userId}/tree`),
  getUnlockedByUser: (userId) => apiJson(`/api/skills/user/${userId}/unlocked`),
};

export const leaderboard = {
  getTeam: (teamId, from, to, limit = 10) => {
    let url = `/api/leaderboard/team/${teamId}?limit=${limit}`;
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;
    return apiJson(url);
  },
  getTeamKpi: (teamId, from, to) => {
    const params = [];
    if (from) params.push(`from=${encodeURIComponent(from)}`);
    if (to) params.push(`to=${encodeURIComponent(to)}`);
    const query = params.length ? '?' + params.join('&') : '';
    return apiJson(`/api/leaderboard/team/${teamId}/kpi${query}`);
  },
};

export const activity = {
  getTeamFeed: (teamId, limit = 20, before = null) => {
    let url = `/api/activity/team/${teamId}?limit=${limit}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return apiJson(url);
  },
};
