import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AuditLogPage, { auditQuery } from './AuditLogPage.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, formatDate: (value) => `at ${value}` }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  ADMIN_NAV: {},
  default: ({ title, actions, children }) => require('react').createElement('section', null, require('react').createElement('h1', null, title), actions, children),
}));

const calls = { list: [], exported: [] };
let mockResponse;

jest.mock('../../api.js', () => ({
  audit: {
    list: (params) => { calls.list.push(params); return Promise.resolve(mockResponse); },
    exportCsv: (params) => { calls.exported.push(params); return Promise.resolve(new Blob(['a,b'])); },
  },
}));

const event = {
  id: 'e1', teamId: 't1', teamName: 'Команда', boardId: 'b1', boardName: 'Сайт',
  actor: { id: 'u1', name: 'Анна', avatarUrl: null }, action: 'workflow.transition.save', category: 'workflow',
  objectType: 'transition', objectName: 'Начать', details: { request: { name: 'Начать', secret: '***' } },
  ipAddress: '10.0.0.1', createdAt: '2026-10-20T06:00:00Z',
};

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  calls.list = [];
  calls.exported = [];
  mockResponse = { total: 1, page: 1, pageSize: 50, teams: [{ id: 't1', name: 'Команда' }, { id: 't2', name: 'Вторая' }], actors: [{ id: 'u1', name: 'Анна' }], items: [event] };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async () => { await act(async () => { root.render(<AuditLogPage />); }); await flush(); };
async function choose(select, value) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
  await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
}

test('date range is sent as an inclusive local-day interval', () => {
  const query = auditQuery({ teamId: '', category: 'member', actorId: '', search: '  anna ', from: '2026-10-01', to: '2026-10-02' }, 3);
  expect(query).toMatchObject({ category: 'member', search: 'anna', page: 3, pageSize: 50, teamId: undefined });
  expect(new Date(query.from).getTime()).toBe(new Date('2026-10-01T00:00:00').getTime());
  expect(new Date(query.to).getTime()).toBe(new Date('2026-10-03T00:00:00').getTime());
});

test('shows events with readable actions and expandable details', async () => {
  await render();
  expect(calls.list[0]).toMatchObject({ page: 1, pageSize: 50 });
  expect(container.textContent).toContain('Переход сохранён');
  expect(container.textContent).toContain('Начать');
  expect(container.textContent).toContain('Анна');
  expect(container.textContent).toContain('Сайт');
  expect(container.querySelector('.audit-details')).toBeNull();
  await act(async () => { container.querySelector('.audit-event').click(); });
  expect(container.querySelector('.audit-details').textContent).toContain('"secret": "***"');
});

test('filters reload the log and export uses the same filters', async () => {
  await render();
  await choose(container.querySelector('select[aria-label="Категория"]'), 'workflow');
  await choose(container.querySelector('select[aria-label="Команда"]'), 't2');
  expect(calls.list[calls.list.length - 1]).toMatchObject({ category: 'workflow', teamId: 't2', page: 1 });

  URL.createObjectURL = () => 'blob:audit';
  URL.revokeObjectURL = () => {};
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Экспорт в CSV'));
  await act(async () => { button.click(); });
  await flush();
  expect(calls.exported[0]).toMatchObject({ category: 'workflow', teamId: 't2', page: undefined });
});

test('users without admin teams see an explanation instead of the log', async () => {
  mockResponse = { total: 0, page: 1, pageSize: 50, teams: [], actors: [], items: [] };
  await render();
  expect(container.textContent).toContain('Журнал аудита доступен владельцам и администраторам команд.');
  expect(container.querySelector('table')).toBeNull();
});
