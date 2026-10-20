import { api, apiForm, apiJson, buildQuery, responseErrorMessage } from './transport.js';

const json = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const okOrThrow = async (response) => {
  if (!response.ok) throw new Error(responseErrorMessage(response.status, await response.text(), response.statusText));
  return true;
};
const remove = (url) => api(url, { method: 'DELETE' }).then(okOrThrow);

export const workflows = {
  getByBoard: (boardId) => apiJson(`/api/workflows/board/${boardId}`),
  save: (boardId, data) => apiJson(`/api/workflows/board/${boardId}`, json('PUT', data)),
  getTransitions: (questId) => apiJson(`/api/workflows/quests/${questId}/transitions`),
  transition: (questId, transitionId) => apiJson(`/api/workflows/quests/${questId}/transitions`, json('POST', { transitionId })),
};

const spaceUrl = (boardId, path) => `/api/spaces/${boardId}/${path}`;
export const spaceContent = {
  listDocs: (boardId) => apiJson(spaceUrl(boardId, 'docs')),
  getDoc: (boardId, id) => apiJson(spaceUrl(boardId, `docs/${id}`)),
  createDoc: (boardId, data) => apiJson(spaceUrl(boardId, 'docs'), json('POST', data)),
  updateDoc: (boardId, id, data) => apiJson(spaceUrl(boardId, `docs/${id}`), json('PUT', data)),
  deleteDoc: (boardId, id) => remove(spaceUrl(boardId, `docs/${id}`)),
  listForms: (boardId) => apiJson(spaceUrl(boardId, 'forms')),
  getForm: (boardId, id) => apiJson(spaceUrl(boardId, `forms/${id}`)),
  createForm: (boardId, data) => apiJson(spaceUrl(boardId, 'forms'), json('POST', data)),
  updateForm: (boardId, id, data) => apiJson(spaceUrl(boardId, `forms/${id}`), json('PUT', data)),
  deleteForm: (boardId, id) => remove(spaceUrl(boardId, `forms/${id}`)),
  submitForm: (boardId, id, answers) => apiJson(spaceUrl(boardId, `forms/${id}/submit`), json('POST', { answers })),
  activity: (boardId, limit = 20) => apiJson(spaceUrl(boardId, `activity?limit=${limit}`)),
  development: (boardId) => apiJson(spaceUrl(boardId, 'development')),
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
  markAllRead: () => apiJson('/api/notifications/read-all', json('POST')),
};

export const personalSettings = {
  get: () => apiJson('/api/me/settings'),
  save: (data) => apiJson('/api/me/settings', json('PUT', data)),
};

export const spaces = {
  getMine: () => apiJson('/api/me/spaces'),
};

export const people = {
  workWith: () => apiJson('/api/me/people'),
  getProfile: (userId) => apiJson(`/api/people/${userId}/profile`),
  saveMyProfile: (data) => apiJson('/api/me/profile', json('PUT', data)),
};

export const kudos = {
  get: (scope = 'all', userId) => apiJson(`/api/kudos${buildQuery({ scope, userId })}`),
  send: (data) => apiJson('/api/kudos', json('POST', data)),
};

export const assets = {
  getSchemas: () => apiJson('/api/assets/schemas'),
  createSchema: (data) => apiJson('/api/assets/schemas', json('POST', data)),
  getSchema: (id) => apiJson(`/api/assets/schemas/${id}`),
  updateSchema: (id, data) => apiJson(`/api/assets/schemas/${id}`, json('PUT', data)),
  deleteSchema: (id) => remove(`/api/assets/schemas/${id}`),
  createType: (schemaId, data) => apiJson(`/api/assets/schemas/${schemaId}/types`, json('POST', data)),
  updateType: (id, data) => apiJson(`/api/assets/types/${id}`, json('PUT', data)),
  deleteType: (id) => remove(`/api/assets/types/${id}`),
  createAttribute: (typeId, data) => apiJson(`/api/assets/types/${typeId}/attributes`, json('POST', data)),
  updateAttribute: (id, data) => apiJson(`/api/assets/attributes/${id}`, json('PUT', data)),
  deleteAttribute: (id) => remove(`/api/assets/attributes/${id}`),
  search: (params) => apiJson(`/api/assets/objects${buildQuery(params)}`),
  getObject: (id) => apiJson(`/api/assets/objects/${id}`),
  createObject: (data) => apiJson('/api/assets/objects', json('POST', data)),
  updateObject: (id, data) => apiJson(`/api/assets/objects/${id}`, json('PUT', data)),
  deleteObject: (id) => remove(`/api/assets/objects/${id}`),
  getGraph: (id, depth = 2) => apiJson(`/api/assets/objects/${id}/graph${buildQuery({ depth })}`),
  linkIssue: (id, data) => apiJson(`/api/assets/objects/${id}/issues`, json('POST', data)),
  unlinkIssue: (id, questId) => remove(`/api/assets/objects/${id}/issues/${questId}`),
  getForQuest: (questId) => apiJson(`/api/assets/quests/${questId}`),
  importCsv: (typeId, content) => apiJson(`/api/assets/types/${typeId}/import`, json('POST', { content })),
  exportCsv: async (typeId) => {
    const response = await api(`/api/assets/types/${typeId}/export`);
    if (!response.ok) throw new Error((await response.text()) || response.statusText);
    return response.blob();
  },
};

export const adminInfo = {
  system: () => apiJson('/api/admin/system'),
};

export const myWork = {
  get: (kind, ids) => apiJson(`/api/me/work${buildQuery({ kind, ids: ids?.length ? ids.join(',') : undefined })}`),
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

export const plans = {
  list: () => apiJson('/api/plans'),
  create: (data) => apiJson('/api/plans', json('POST', data)),
  get: (id) => apiJson(`/api/plans/${id}`),
  update: (id, data) => apiJson(`/api/plans/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/plans/${id}`),
  timeline: (id, scenarioId) => apiJson(`/api/plans/${id}/timeline${buildQuery({ scenarioId })}`),
  addTeam: (id, data) => apiJson(`/api/plans/${id}/teams`, json('POST', data)),
  updateTeam: (id, teamId, data) => apiJson(`/api/plans/${id}/teams/${teamId}`, json('PUT', data)),
  deleteTeam: (id, teamId) => remove(`/api/plans/${id}/teams/${teamId}`),
  addScenario: (id, data) => apiJson(`/api/plans/${id}/scenarios`, json('POST', data)),
  updateScenario: (id, scenarioId, data) => apiJson(`/api/plans/${id}/scenarios/${scenarioId}`, json('PUT', data)),
  deleteScenario: (id, scenarioId) => remove(`/api/plans/${id}/scenarios/${scenarioId}`),
  applyScenario: (id, scenarioId) => apiJson(`/api/plans/${id}/scenarios/${scenarioId}/apply`, json('POST')),
  schedule: (id, scenarioId, questId, data) => apiJson(`/api/plans/${id}/scenarios/${scenarioId}/items/${questId}`, json('PUT', data)),
  resetSchedule: (id, scenarioId, questId) => remove(`/api/plans/${id}/scenarios/${scenarioId}/items/${questId}`),
  exclude: (id, questId) => api(`/api/plans/${id}/exclusions`, json('POST', { questId })).then((r) => r.ok),
  include: (id, questId) => remove(`/api/plans/${id}/exclusions/${questId}`),
  addDependency: (id, data) => apiJson(`/api/plans/${id}/dependencies`, json('POST', data)),
  removeDependency: (id, linkId) => remove(`/api/plans/${id}/dependencies/${linkId}`),
};

export const home = {
  list: (kind, archived = false) => apiJson(`/api/home/${kind}${buildQuery({ archived: archived || undefined })}`),
  create: (kind, data) => apiJson(`/api/home/${kind}`, json('POST', data)),
  get: (id) => apiJson(`/api/home/items/${id}`),
  update: (id, data) => apiJson(`/api/home/items/${id}`, json('PUT', data)),
  delete: (id) => remove(`/api/home/items/${id}`),
  archive: (id, archived) => apiJson(`/api/home/items/${id}/archive`, json('POST', { archived })),
  follow: (id) => api(`/api/home/items/${id}/follow`, { method: 'POST' }).then(okOrThrow),
  unfollow: (id) => remove(`/api/home/items/${id}/follow`),
  addContributor: (id, userId) => api(`/api/home/items/${id}/contributors`, json('POST', { userId })).then(okOrThrow),
  removeContributor: (id, userId) => remove(`/api/home/items/${id}/contributors/${userId}`),
  link: (id, targetId) => api(`/api/home/items/${id}/links`, json('POST', { targetId })).then(okOrThrow),
  unlink: (id, targetId) => remove(`/api/home/items/${id}/links/${targetId}`),
  addWork: (id, data) => apiJson(`/api/home/items/${id}/work`, json('POST', data)),
  removeWork: (id, questId) => remove(`/api/home/items/${id}/work/${questId}`),
  addUpdate: (id, data) => apiJson(`/api/home/items/${id}/updates`, json('POST', data)),
  deleteUpdate: (id, updateId) => remove(`/api/home/items/${id}/updates/${updateId}`),
  addFollower: (id, userId) => api(`/api/home/items/${id}/followers`, json('POST', { userId })).then(okOrThrow),
  removeFollower: (id, userId) => remove(`/api/home/items/${id}/followers/${userId}`),
  star: (id) => api(`/api/home/items/${id}/star`, { method: 'POST' }).then(okOrThrow),
  unstar: (id) => remove(`/api/home/items/${id}/star`),
  clone: (id) => apiJson(`/api/home/items/${id}/clone`, json('POST')),
  addEntry: (id, data) => apiJson(`/api/home/items/${id}/entries`, json('POST', data)),
  updateEntry: (id, entryId, data) => apiJson(`/api/home/items/${id}/entries/${entryId}`, json('PUT', data)),
  deleteEntry: (id, entryId) => remove(`/api/home/items/${id}/entries/${entryId}`),
  feed: (kind, scope) => apiJson(`/api/home/updates${buildQuery({ kind, scope })}`),
  tags: () => apiJson('/api/home/tags'),
};

export const billing = {
  get: () => apiJson('/api/billing'),
  quote: (plan, cycle) => apiJson(`/api/billing/quote${buildQuery({ plan, cycle })}`),
  change: (plan, cycle) => apiJson('/api/billing/plan', json('PUT', { plan, cycle })),
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
  getRepositories: (questId) => apiJson(`/api/integrations/github/quests/${questId}/repositories`),
  createBranch: (questId, data) => apiJson(`/api/integrations/github/quests/${questId}/branches`, json('POST', data)),
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

export const dashboards = {
  list: (trash = false) => apiJson(`/api/dashboards${buildQuery({ trash: trash || undefined })}`),
  create: (data) => apiJson('/api/dashboards', json('POST', data)),
  get: (id) => apiJson(`/api/dashboards/${id}`),
  update: (id, data) => apiJson(`/api/dashboards/${id}`, json('PUT', data)),
  data: (id) => apiJson(`/api/dashboards/${id}/data`),
  copy: (id, name) => apiJson(`/api/dashboards/${id}/copy`, json('POST', { name })),
  trash: (id) => remove(`/api/dashboards/${id}`),
  restore: (id) => api(`/api/dashboards/${id}/restore`, { method: 'POST' }).then(okOrThrow),
  purge: (id) => remove(`/api/dashboards/${id}/purge`),
  star: (id, starred) => api(`/api/dashboards/${id}/star`, { method: starred ? 'PUT' : 'DELETE' }).then(okOrThrow),
};

export const permissions = {
  getByBoard: (boardId) => apiJson(`/api/permissions/board/${boardId}`),
};
