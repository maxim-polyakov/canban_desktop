import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PermissionSchemesPage, SpacePermissionScheme, grantLabel } from './PermissionSchemePages.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  ADMIN_NAV: {},
  default: ({ title, actions, children }) => require('react').createElement('section', null, require('react').createElement('h1', null, title), actions, children),
}));

const mockCalls = { created: [], updated: [], assigned: [], removed: [] };
const mockPermissions = [
  { key: 'BROWSE_PROJECTS', name: 'Просмотр пространства', category: 'Пространство', issueScoped: false },
  { key: 'EDIT_ISSUES', name: 'Изменение задач', category: 'Задачи', issueScoped: true },
];
const mockScheme = {
  id: 'ps1', teamId: 'team', kind: 'permissionscheme', name: 'Строгая', description: '', usedBy: ['b1'],
  data: { grants: { BROWSE_PROJECTS: [{ type: 'role', value: 'viewer' }], EDIT_ISSUES: [{ type: 'role', value: 'lead' }] } },
};
const mockState = {
  teamId: 'team', canManage: true, permissions: mockPermissions, roles: ['viewer', 'member', 'lead', 'admin'],
  defaultData: { grants: { BROWSE_PROJECTS: [{ type: 'role', value: 'viewer' }], EDIT_ISSUES: [{ type: 'role', value: 'member' }] } },
  objects: [mockScheme, { ...mockScheme, id: 'ps2', name: 'Свободная', usedBy: [] }],
  groups: [{ id: 'g1', name: 'QA' }],
  users: [{ id: 'u1', displayName: 'Анна', email: 'anna@example.com' }],
  boards: [{ id: 'b1', name: 'Сайт', permissionSchemeId: 'ps1' }, { id: 'b2', name: 'Мобайл', permissionSchemeId: null }],
};

jest.mock('../../api.js', () => ({
  issueConfig: { catalog: () => Promise.resolve({ teams: [{ id: 'team', name: 'Команда', canManage: true }], boards: [], groups: [], types: [], fields: [] }) },
  permissionSchemes: {
    catalog: () => Promise.resolve(mockState),
    create: (data) => { mockCalls.created.push(data); return Promise.resolve({ id: 'new', usedBy: [], ...data }); },
    update: (id, data) => { mockCalls.updated.push({ id, ...data }); return Promise.resolve({ ...mockScheme, ...data }); },
    remove: (id) => { mockCalls.removed.push(id); return Promise.resolve(); },
    assign: (boardId, id) => { mockCalls.assigned.push({ boardId, id }); return Promise.resolve({ boardId, permissionSchemeId: id }); },
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.keys(mockCalls).forEach((key) => { mockCalls[key] = []; });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const byLabel = (label) => container.querySelector(`[aria-label="${label}"]`);
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const render = async (element) => { await act(async () => { root.render(<MemoryRouter>{element}</MemoryRouter>); }); await flush(); await flush(); };

test('lists schemes with the default one and where they are used', async () => {
  await render(<PermissionSchemesPage />);
  expect(container.textContent).toContain('Схема прав по умолчанию');
  expect(container.textContent).toContain('Мобайл');
  expect(container.textContent).toContain('Строгая');
  expect(byLabel('Удалить Строгая').disabled).toBe(true);
  expect(byLabel('Удалить Свободная').disabled).toBe(false);
});

test('creates a scheme from the default grants', async () => {
  await render(<PermissionSchemesPage />);
  await click(button('Создать схему прав'));
  await change(container.querySelector('.app-modal input'), 'Подрядчики');
  await submit(container.querySelector('.app-modal'));
  expect(mockCalls.created).toEqual([{ teamId: 'team', name: 'Подрядчики', description: '', data: mockState.defaultData }]);
});

test('copies another scheme', async () => {
  await render(<PermissionSchemesPage />);
  await click(button('Создать схему прав'));
  await change(container.querySelector('.app-modal input'), 'Копия');
  await change(byLabel('Основа'), 'ps1');
  await submit(container.querySelector('.app-modal'));
  expect(mockCalls.created[0].data).toEqual(mockScheme.data);
});

test('edits grants: removes a role, adds the reporter and a group', async () => {
  await render(<PermissionSchemesPage />);
  await click(button('Строгая'));
  expect(container.textContent).toContain('Роль: Руководитель');
  await click(byLabel('Убрать Роль: Руководитель: Изменение задач'));
  expect(container.textContent).toContain('Никому');

  await change(byLabel('Кому выдать: Изменение задач'), 'reporter');
  expect(byLabel('Значение: Изменение задач')).toBeNull();
  await click(container.querySelectorAll('.perm-add button')[1]);
  await change(byLabel('Кому выдать: Изменение задач'), 'group');
  await click(container.querySelectorAll('.perm-add button')[1]);

  const browseTypes = [...byLabel('Кому выдать: Просмотр пространства').options].map((o) => o.value);
  expect(browseTypes).not.toContain('reporter');

  await click(button('Сохранить'));
  expect(mockCalls.updated).toHaveLength(1);
  expect(mockCalls.updated[0].data.grants.EDIT_ISSUES).toEqual([{ type: 'reporter', value: null }, { type: 'group', value: 'g1' }]);
});

test('deletes an unused scheme after confirmation', async () => {
  window.confirm = jest.fn(() => true);
  await render(<PermissionSchemesPage />);
  await click(byLabel('Удалить Свободная'));
  expect(mockCalls.removed).toEqual(['ps2']);
});

test('space picks its permission scheme', async () => {
  await render(<SpacePermissionScheme boardId="b2" teamId="team" />);
  const select = container.querySelector('select[aria-label="Схема прав"]');
  expect(select.value).toBe('');
  await change(select, 'ps2');
  expect(mockCalls.assigned).toEqual([{ boardId: 'b2', id: 'ps2' }]);
  expect(container.textContent).toContain('Сохранено');
  await change(select, '');
  expect(mockCalls.assigned[1]).toEqual({ boardId: 'b2', id: null });
});

test('grant labels name roles, groups, users and issue roles', () => {
  const t = (s) => s;
  expect(grantLabel({ type: 'role', value: 'member' }, mockState, t)).toBe('Роль: Участник');
  expect(grantLabel({ type: 'group', value: 'g1' }, mockState, t)).toBe('Группа: QA');
  expect(grantLabel({ type: 'user', value: 'u1' }, mockState, t)).toBe('Пользователь: Анна');
  expect(grantLabel({ type: 'assignee' }, mockState, t)).toBe('Исполнитель задачи');
  expect(grantLabel({ type: 'anyone' }, mockState, t)).toBe('Любой, у кого есть доступ к разделу');
});
