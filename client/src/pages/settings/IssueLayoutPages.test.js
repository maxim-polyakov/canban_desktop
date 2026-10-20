import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FieldConfigurationsPage, ScreensPage, SpaceLayoutSettings } from './IssueLayoutPages.jsx';
import { arrangeFields, fieldRule, onScreen } from '../../utils/issueLayout.js';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  ADMIN_NAV: {},
  default: ({ title, children }) => require('react').createElement('section', null, require('react').createElement('h1', null, title), children),
}));

const mockCalls = { created: [], updated: [], assigned: [] };
const mockCatalog = {
  teams: [{ id: 'team', name: 'Команда', canManage: true }],
  boards: [{ id: 'b1', teamId: 'team', name: 'Сайт' }],
  groups: [],
  types: [],
  fields: [{ id: 'f1', teamId: 'team', name: 'Окружение', fieldType: 'text', options: [], boards: [], issueTypes: [], contexts: [] }],
};
let mockLayouts;

jest.mock('../../api.js', () => ({
  issueConfig: { catalog: () => Promise.resolve(mockCatalog) },
  issueLayouts: {
    catalog: () => Promise.resolve(mockLayouts),
    create: (kind, data) => { mockCalls.created.push({ kind, ...data }); return Promise.resolve({ id: 'new', kind, ...data }); },
    update: (id, data) => { mockCalls.updated.push({ id, ...data }); return Promise.resolve({ id, ...data }); },
    remove: () => Promise.resolve(),
    assign: (boardId, data) => { mockCalls.assigned.push({ boardId, ...data }); return Promise.resolve({}); },
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.keys(mockCalls).forEach((key) => { mockCalls[key] = []; });
  mockLayouts = {
    teamId: 'team',
    canManage: true,
    objects: [
      { id: 's1', kind: 'screen', name: 'Экран багов', description: '', data: { tabs: [{ name: 'Поля', fields: ['summary', 'description'] }] }, usedBy: [] },
      { id: 'c1', kind: 'fieldconfig', name: 'Строгая', description: '', data: { items: {} }, usedBy: [] },
      { id: 'fs1', kind: 'fieldconfigscheme', name: 'Схема полей', description: '', data: { default: 'c1', types: {} }, usedBy: [{ kind: 'board', id: 'b1' }] },
    ],
    boards: [{ id: 'b1', name: 'Сайт', fieldConfigurationSchemeId: 'fs1', issueTypeScreenSchemeId: null }],
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async (element) => { await act(async () => { root.render(<MemoryRouter>{element}</MemoryRouter>); }); await flush(); };
async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent === text);

test('screen editor adds, reorders and removes fields', async () => {
  await render(<ScreensPage />);
  expect(container.textContent).toContain('Экран багов');
  await click(container.querySelector('button[aria-label="Изменить Экран багов"]'));
  await change(container.querySelector('select[aria-label="Добавить поле на вкладку Поля"]'), 'cf:f1');
  await click(container.querySelector('button[aria-label="Выше Окружение"]'));
  await click(container.querySelector('button[aria-label="Убрать с экрана Описание"]'));
  await submit(container.querySelector('form[role="dialog"]'));
  expect(mockCalls.updated[0]).toMatchObject({ id: 's1', teamId: 'team', data: { tabs: [{ name: 'Поля', fields: ['summary', 'cf:f1'] }] } });
});

test('field configuration makes fields required or hidden; hiding clears required', async () => {
  await render(<FieldConfigurationsPage />);
  await click(container.querySelector('button[aria-label="Изменить Строгая"]'));
  const summary = container.querySelector('input[aria-label="Обязательное: Сводка"]');
  expect(summary.checked).toBe(true);
  expect(summary.disabled).toBe(true);
  await click(container.querySelector('input[aria-label="Обязательное: Окружение"]'));
  await click(container.querySelector('input[aria-label="Обязательное: Срок"]'));
  await click(container.querySelector('input[aria-label="Скрытое: Срок"]'));
  await change(container.querySelector('input[aria-label="Подсказка: Окружение"]'), 'prod или stage');
  await submit(container.querySelector('form[role="dialog"]'));
  expect(mockCalls.updated[0].data.items).toEqual({
    'cf:f1': { required: true, hidden: false, description: 'prod или stage' },
    duedate: { required: false, hidden: true, description: '' },
  });
});

test('field configuration scheme maps issue types and in-use schemes cannot be deleted', async () => {
  await render(<FieldConfigurationsPage />);
  await click(button('Схемы конфигураций полей'));
  expect(container.textContent).toContain('Сайт');
  expect(container.querySelector('button[aria-label="Удалить Схема полей"]').disabled).toBe(true);
  await click(button('Создать схему конфигураций полей'));
  await change(container.querySelector('form[role="dialog"] input'), 'Для багов');
  await change(container.querySelector('select[aria-label="Для типа Ошибка"]'), 'c1');
  await submit(container.querySelector('form[role="dialog"]'));
  expect(mockCalls.created[0]).toMatchObject({ kind: 'fieldconfigscheme', name: 'Для багов', data: { types: { 3: 'c1' } } });
});

test('space settings assign schemes to the space', async () => {
  await render(<SpaceLayoutSettings boardId="b1" teamId="team" />);
  const select = container.querySelector('select');
  expect(select.value).toBe('');
  mockLayouts.objects.push({ id: 'ts1', kind: 'typescreenscheme', name: 'Экраны сайта', data: { default: 'x' }, usedBy: [] });
  await render(<SpaceLayoutSettings boardId="b1" teamId="other" />);
  await render(<SpaceLayoutSettings boardId="b1" teamId="team" />);
  await change(container.querySelector('select'), 'ts1');
  expect(mockCalls.assigned[0]).toEqual({ boardId: 'b1', fieldConfigurationSchemeId: 'fs1', issueTypeScreenSchemeId: 'ts1' });
});

test('layout helpers resolve rules, screens and tab order', () => {
  const layout = {
    fieldConfigs: { default: { duedate: { required: true } }, 1: { duedate: { hidden: true } } },
    screens: { default: { create: [{ name: 'A', fields: ['summary', 'cf:f1'] }], edit: [], view: [{ name: 'Main', fields: ['cf:f2', 'cf:f1'] }] } },
  };
  expect(fieldRule(layout, '0', 'duedate')).toMatchObject({ required: true });
  expect(fieldRule(layout, '1', 'duedate')).toMatchObject({ hidden: true });
  expect(onScreen(layout, '0', 'create', 'cf:f1')).toBe(true);
  expect(onScreen(layout, '0', 'create', 'cf:f2')).toBe(false);
  expect(onScreen(null, '0', 'create', 'cf:f2')).toBe(true);
  const groups = arrangeFields(layout, '0', 'view', [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);
  expect(groups.map((g) => [g.name, g.fields.map((f) => f.id)])).toEqual([[null, ['f2', 'f1']]]);
});
