import { api, apiForm, apiJson, buildQuery } from './transport.js';

const json = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const remove = (url) => api(url, { method: 'DELETE' }).then((response) => {
  if (!response.ok) throw new Error(response.statusText);
  return true;
});

export const workflows = {
  getByBoard: (boardId) => apiJson(`/api/workflows/board/${boardId}`),
  save: (boardId, data) => apiJson(`/api/workflows/board/${boardId}`, json('PUT', data)),
  getTransitions: (questId) => apiJson(`/api/workflows/quests/${questId}/transitions`),
  transition: (questId, transitionId) => apiJson(`/api/workflows/quests/${questId}/transitions`, json('POST', { transitionId })),
};

export const questHierarchy = {
  get: (questId) => apiJson(`/api/quests/${questId}/hierarchy`),
  setParent: (questId, parentQuestId) => apiJson(`/api/quests/${questId}/parent`, json('PUT', { parentQuestId })),
};

export const questLinks = {
  get: (questId) => apiJson(`/api/quests/${questId}/links`),
  create: (questId, data) => apiJson(`/api/quests/${questId}/links`, json('POST', data)),
  delete: (questId, linkId) => remove(`/api/quests/${questId}/links/${linkId}`),
};

export const worklogs = {
  get: (questId) => apiJson(`/api/quests/${questId}/worklogs`),
  create: (questId, data) => apiJson(`/api/quests/${questId}/worklogs`, json('POST', data)),
  delete: (questId, worklogId) => remove(`/api/quests/${questId}/worklogs/${worklogId}`),
};

export const history = {
  get: (questId, params) => apiJson(`/api/quests/${questId}/history${buildQuery(params)}`),
};

export const notifications = {
  get: (params) => apiJson(`/api/notifications${buildQuery(params)}`),
  markRead: (id) => apiJson(`/api/notifications/${id}/read`, json('POST')),
  markAllRead: () => apiJson('/api/notifications/read-all', json('POST')),
};

export const components = {
  getByBoard: (boardId) => apiJson(`/api/components/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/components/board/${boardId}`, json('POST', data)),
  update: (id, data) => apiJson(`/api/components/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/components/${id}`),
};

export const releases = {
  getByBoard: (boardId) => apiJson(`/api/releases/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/releases/board/${boardId}`, json('POST', data)),
  update: (id, data) => apiJson(`/api/releases/${id}`, json('PUT', data)),
  release: (id) => apiJson(`/api/releases/${id}/release`, json('POST')),
  delete: (id) => remove(`/api/releases/${id}`),
};

export const search = {
  issues: (params) => apiJson(`/api/search/issues${buildQuery(params)}`),
  suggestions: (params) => apiJson(`/api/search/suggestions${buildQuery(params)}`),
};

export const savedFilters = {
  getAll: () => apiJson('/api/savedFilters'),
  create: (data) => apiJson('/api/savedFilters', json('POST', data)),
  update: (id, data) => apiJson(`/api/savedFilters/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/savedFilters/${id}`),
  share: (id, data) => apiJson(`/api/savedFilters/${id}/share`, json('PUT', data)),
};

export const automations = {
  getByBoard: (boardId) => apiJson(`/api/automations/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/automations/board/${boardId}`, json('POST', data)),
  update: (id, data) => apiJson(`/api/automations/${id}`, json('PUT', data)),
  run: (id) => apiJson(`/api/automations/${id}/run`, json('POST')),
  delete: (id) => remove(`/api/automations/${id}`),
};

export const integrations = {
  getByBoard: (boardId) => apiJson(`/api/integrations/board/${boardId}`),
  saveGithub: (boardId, data) => apiJson(`/api/integrations/board/${boardId}/github`, json('PUT', data)),
  createWebhook: (boardId, data) => apiJson(`/api/integrations/board/${boardId}/webhooks`, json('POST', data)),
  deleteWebhook: (boardId, id) => remove(`/api/integrations/board/${boardId}/webhooks/${id}`),
  getDevelopment: (questId) => apiJson(`/api/integrations/github/quests/${questId}`),
};

export const bulk = {
  update: (data) => apiJson('/api/bulk/quests', json('PUT', data)),
  delete: (questIds) => apiJson('/api/bulk/quests/delete', json('POST', { questIds })),
};

export const importExport = {
  exportBoard: (boardId, format = 'json') => apiJson(`/api/importExport/boards/${boardId}/export${buildQuery({ format })}`),
  importBoard: (boardId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiForm(`/api/importExport/boards/${boardId}/import`, form);
  },
};

export const clone = {
  quest: (questId, data = {}) => apiJson(`/api/clone/quests/${questId}`, json('POST', data)),
};

export const reports = {
  get: (boardId, type, params) => apiJson(`/api/reports/boards/${boardId}/${type}${buildQuery(params)}`),
};

export const dashboards = {
  getAll: () => apiJson('/api/dashboards'),
  get: (id) => apiJson(`/api/dashboards/${id}`),
  create: (data) => apiJson('/api/dashboards', json('POST', data)),
  update: (id, data) => apiJson(`/api/dashboards/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/dashboards/${id}`),
  addGadget: (id, data) => apiJson(`/api/dashboards/${id}/gadgets`, json('POST', data)),
  updateGadget: (id, gadgetId, data) => apiJson(`/api/dashboards/${id}/gadgets/${gadgetId}`, json('PUT', data)),
  deleteGadget: (id, gadgetId) => remove(`/api/dashboards/${id}/gadgets/${gadgetId}`),
};

export const permissions = {
  getByBoard: (boardId) => apiJson(`/api/permissions/board/${boardId}`),
  save: (boardId, data) => apiJson(`/api/permissions/board/${boardId}`, json('PUT', data)),
};
