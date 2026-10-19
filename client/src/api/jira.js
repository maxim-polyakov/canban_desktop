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
};

export const savedFilters = {
  getAll: () => apiJson('/api/savedFilters'),
  create: (data) => apiJson('/api/savedFilters', json('POST', data)),
  update: (id, data) => apiJson(`/api/savedFilters/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/savedFilters/${id}`),
};

export const automations = {
  getByBoard: (boardId) => apiJson(`/api/automations/board/${boardId}`),
  create: (boardId, data) => apiJson(`/api/automations/board/${boardId}`, json('POST', data)),
  update: (boardId, id, data) => apiJson(`/api/automations/board/${boardId}/${id}`, json('PUT', data)),
  run: (boardId, id, issueKeys) => apiJson(`/api/automations/board/${boardId}/${id}/run`, json('POST', { issueKeys })),
  delete: (boardId, id) => remove(`/api/automations/board/${boardId}/${id}`),
};

export const integrations = {
  getByBoard: (boardId) => apiJson(`/api/integrations/board/${boardId}`),
  saveGithub: (boardId, data, id) => apiJson(`/api/integrations/board/${boardId}/github${buildQuery({ id })}`, json('PUT', data)),
  deleteGithub: (boardId, id) => remove(`/api/integrations/board/${boardId}/github/${id}`),
  createWebhook: (boardId, data) => apiJson(`/api/integrations/board/${boardId}/webhooks`, json('POST', data)),
  deleteWebhook: (boardId, id) => remove(`/api/integrations/board/${boardId}/webhooks/${id}`),
  getDevelopment: (questId) => apiJson(`/api/integrations/github/quests/${questId}`),
  syncDevelopment: (questId) => apiJson(`/api/integrations/github/quests/${questId}/sync`, json('POST')),
};

export function toBulkEditRequest(questIds, fields = {}) {
  const request = { questIds };
  if ('sprintId' in fields) { request.sprintId = fields.sprintId || null; request.sprintIdSet = true; }
  if ('assigneeIds' in fields) { request.assigneeIds = fields.assigneeIds || []; request.assigneeIdsSet = true; }
  ['columnId', 'labels', 'priority', 'issueType'].forEach((key) => {
    if (fields[key] !== undefined && fields[key] !== '') request[key] = fields[key];
  });
  return request;
}

export const bulk = {
  update: (boardId, questIds, fields) => apiJson(`/api/bulk/quests${buildQuery({ boardId })}`, json('PUT', toBulkEditRequest(questIds, fields))),
  delete: (boardId, questIds) => apiJson(`/api/bulk/quests/delete${buildQuery({ boardId })}`, json('POST', { questIds })),
};

export const importExport = {
  exportBoard: async (boardId, format = 'json') => {
    const response = await api(`/api/importExport/boards/${boardId}/export${buildQuery({ format })}`);
    const text = await response.text();
    if (!response.ok) throw new Error(text || response.statusText);
    return text;
  },
  preview: (format, content) => apiJson('/api/importExport/preview', json('POST', { format, content })),
  importBoard: (boardId, file, columnId) => {
    const form = new FormData();
    form.append('file', file);
    return apiForm(`/api/importExport/boards/${boardId}/import${buildQuery({ columnId })}`, form);
  },
};

export const clone = {
  quest: (questId, data = {}) => apiJson(`/api/clone/quests/${questId}`, json('POST', data)),
};

export const reports = {
  get: (boardId, type, params) => apiJson(`/api/reports/boards/${boardId}/${type}${buildQuery(params)}`),
};

export function parseGadgets(dashboard) {
  try {
    const parsed = JSON.parse(dashboard?.layoutJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const saveLayout = (dashboard, gadgets) => apiJson(`/api/dashboards/${dashboard.id}`, json('PUT', {
  name: dashboard.name, shared: Boolean(dashboard.shared), layoutJson: JSON.stringify(gadgets),
}));

export const dashboards = {
  getAll: () => apiJson('/api/dashboards'),
  create: (data) => apiJson('/api/dashboards', json('POST', { shared: false, layoutJson: '[]', ...data })),
  update: (id, data) => apiJson(`/api/dashboards/${id}`, json('PUT', data)),
  addGadget: (dashboard, gadget) => saveLayout(dashboard, [...parseGadgets(dashboard), { id: `g-${Date.now()}`, ...gadget }]),
  deleteGadget: (dashboard, gadgetId) => saveLayout(dashboard, parseGadgets(dashboard).filter((g) => g.id !== gadgetId)),
};

export const permissions = {
  getByBoard: (boardId) => apiJson(`/api/permissions/board/${boardId}`),
};
