import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import WorkflowEditor, { describeTransition, formToTransition, transitionToForm } from './WorkflowEditor.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

const calls = { save: [], update: [], copy: [], column: [], assign: [] };
let mockSchemeId = null;
let mockMigrations = [];
const columns = [
  { id: 'c1', title: 'К выполнению', order: 0, kind: 0 },
  { id: 'c2', title: 'В работе', order: 1, kind: 1 },
  { id: 'c3', title: 'Готово', order: 2, kind: 3 },
];
const transitions = [
  { id: 't1', name: 'Начать', sourceColumnId: 'c1', targetColumnId: 'c2', allowedIssueTypes: '', allowedRoles: '', conditionsJson: '{"requireAssignee":true}', postFunctionsJson: '{"assignee":"currentUser"}', enabled: true, fromAnyStatus: false },
  { id: 't2', name: 'Закрыть', sourceColumnId: 'c3', targetColumnId: 'c3', allowedIssueTypes: '', allowedRoles: 'Manage', conditionsJson: null, postFunctionsJson: null, enabled: false, fromAnyStatus: true },
];

jest.mock('../../api.js', () => ({
  boards: { getById: () => Promise.resolve({ teamId: 'team', columns }) },
  columns: { update: (id, data) => { calls.column.push({ id, data }); return Promise.resolve({}); } },
  teams: { getMyTeamsWithBoards: () => Promise.resolve([{ team: { name: 'Команда' }, boards: [{ id: 'b1', name: 'Этот' }, { id: 'b2', name: 'Другой' }] }]) },
  workflows: {
    getByBoard: () => Promise.resolve(transitions),
    save: (boardId, data) => { calls.save.push(data); return Promise.resolve({}); },
    update: (boardId, id, data) => { calls.update.push({ id, data }); return Promise.resolve({}); },
    remove: () => Promise.resolve(true),
    copy: (boardId, source) => { calls.copy.push(source); return Promise.resolve([]); },
  },
  sharedWorkflows: {
    catalog: () => Promise.resolve({
      teamId: 'team', canManage: true, screens: [], groups: [],
      boards: [{ id: 'b1', name: 'Этот', workflowSchemeId: mockSchemeId }],
      objects: [
        { id: 'w1', kind: 'workflow', name: 'Разработка', usedBy: [], data: { initial: 's1', statuses: [{ key: 's1', name: 'Новая', kind: 0, x: 40, y: 40 }, { key: 's2', name: 'Готово', kind: 3, x: 300, y: 40 }], transitions: [{ key: 't1', name: 'Сделано', from: ['s1'], to: 's2' }] } },
        { id: 'ws1', kind: 'workflowscheme', name: 'Схема', usedBy: [], data: { default: 'w1', types: {} } },
      ],
    }),
    preview: () => Promise.resolve({ migrations: mockMigrations }),
    assign: (boardId, data) => { calls.assign.push(data); mockSchemeId = data.workflowSchemeId; return Promise.resolve({}); },
  },
  issueConfig: { catalog: () => Promise.resolve({ teams: [{ id: 'team', name: 'Команда', canManage: true }], types: [], fields: [] }), forBoard: () => Promise.resolve({ types: [{ id: 'inc', name: 'Инцидент', baseType: 3, icon: '🔥', color: '#e5493a' }], fields: [{ id: 'f1', name: 'Критичность' }] }) },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.keys(calls).forEach((k) => { calls[k] = []; });
  mockSchemeId = null;
  mockMigrations = [];
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
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}

test('transition forms round-trip conditions and post functions', () => {
  const form = transitionToForm({
    name: 'Решить', sourceColumnId: 'c2', targetColumnId: 'c3', allowedIssueTypes: '3,inc', allowedRoles: 'Manage',
    conditionsJson: '{"onlyAssignee":true,"requiredFields":["cf:f1","duedate"]}', postFunctionsJson: '{"assignee":"unassigned","priority":4}', enabled: true,
  });
  expect(form).toMatchObject({ issueTypes: ['3', 'inc'], role: 'Manage', onlyAssignee: true, requiredFields: ['cf:f1', 'duedate'], assignee: 'unassigned', priority: '4' });
  const payload = formToTransition(form);
  expect(JSON.parse(payload.conditionsJson)).toEqual({ onlyAssignee: true, requiredFields: ['cf:f1', 'duedate'] });
  expect(JSON.parse(payload.postFunctionsJson)).toEqual({ assignee: 'unassigned', priority: 4 });
  expect(formToTransition({ ...form, fromAnyStatus: true }).sourceColumnId).toBe('c3');

  const info = describeTransition({ ...payload, allowedIssueTypes: '3,inc' }, { config: { types: [{ id: 'inc', name: 'Инцидент' }], fields: [{ id: 'f1', name: 'Критичность' }] }, t: (s) => s });
  expect(info.conditions.join(' ')).toContain('Типы: Ошибка, Инцидент');
  expect(info.conditions.join(' ')).toContain('Поля: Критичность, Срок');
  expect(info.actions).toEqual(['Снять исполнителя', 'Приоритет: Высший']);
});

test('editor shows statuses, diagram and transitions, and adds a global transition', async () => {
  await act(async () => { root.render(<MemoryRouter><WorkflowEditor boardId="b1" /></MemoryRouter>); });
  await flush();
  expect(container.querySelectorAll('.wf-status-card')).toHaveLength(3);
  expect(container.querySelectorAll('.wf-diagram .wf-edge')).toHaveLength(2);
  expect(container.textContent).toContain('Нужен исполнитель');
  expect(container.textContent).toContain('Назначить на того, кто выполняет переход');
  expect(container.textContent).toContain('Любой статус');

  await change(container.querySelector('select[aria-label="Категория В работе"]'), '3');
  expect(calls.column).toEqual([{ id: 'c2', data: { kind: 3 } }]);

  await click(button('Добавить переход'));
  const dialog = container.querySelector('.wf-dialog');
  expect(dialog.textContent).toContain('Инцидент');
  expect(dialog.textContent).toContain('Критичность');
  await change(dialog.querySelector('input[maxlength="200"]'), 'Отменить');
  await click(dialog.querySelector('input[type="checkbox"]'));
  expect(dialog.querySelector('select[aria-label="Из статуса"]')).toBeNull();
  await change(dialog.querySelector('select[aria-label="В статус"]'), 'c3');
  await act(async () => { dialog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  expect(calls.save).toHaveLength(1);
  expect(calls.save[0]).toMatchObject({ name: 'Отменить', fromAnyStatus: true, sourceColumnId: 'c3', targetColumnId: 'c3', enabled: true });
});

test('workflow can be copied from another space', async () => {
  window.confirm = () => true;
  await act(async () => { root.render(<MemoryRouter><WorkflowEditor boardId="b1" /></MemoryRouter>); });
  await flush();
  const select = container.querySelector('select[aria-label="Пространство-источник"]');
  expect([...select.options].map((o) => o.value)).toEqual(['', 'b2']);
  await change(select, 'b2');
  await click(button('Скопировать workflow'));
  expect(calls.copy).toEqual(['b2']);
});

test('space switches to a shared workflow scheme, migrating issues whose status is missing', async () => {
  mockMigrations = [{ issueType: '2', columnId: 'c2', columnTitle: 'В работе', count: 3, statuses: ['Новая', 'Готово'] }];
  await act(async () => { root.render(<MemoryRouter><WorkflowEditor boardId="b1" /></MemoryRouter>); });
  await flush();
  await change(container.querySelector('select[aria-label="Схема workflow"]'), 'ws1');
  const dialog = container.querySelector('form[aria-label="Перенос задач в новый workflow"]');
  expect(dialog.textContent).toContain('Задача');
  await change(dialog.querySelector('select[aria-label="Новый статус: В работе"]'), 'Готово');
  await act(async () => { dialog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  await flush();
  expect(calls.assign).toEqual([{ workflowSchemeId: 'ws1', migrations: [{ issueType: '2', columnId: 'c2', status: 'Готово' }] }]);
  expect(container.querySelector('.wf-status-card')).toBeNull();
  expect(container.querySelector('select[aria-label="Пространство-источник"]')).toBeNull();
  expect(container.textContent).toContain('Разработка');
  expect(container.querySelector('g[aria-label="Статус Новая"]')).not.toBeNull();
});