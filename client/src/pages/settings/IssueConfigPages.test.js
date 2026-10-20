import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CustomFieldsPage } from './IssueConfigPages.jsx';
import GroupsPage from './GroupsPage.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  ADMIN_NAV: {},
  default: ({ title, actions, children }) => require('react').createElement('section', null, require('react').createElement('h1', null, title), actions, children),
}));

const mockCalls = { created: [], updated: [], groups: [], members: [] };
const mockRegion = {
  id: 'f-region', teamId: 'team', name: 'Регион', fieldType: 'cascading', options: ['Европа', 'Азия'],
  children: { Европа: ['Берлин'] }, defaultValue: null, boards: [], issueTypes: [], contexts: [], required: false, order: 0,
};
const mockCatalog = {
  teams: [{ id: 'team', name: 'Команда', canManage: true }],
  boards: [{ id: 'b1', teamId: 'team', name: 'Сайт' }, { id: 'b2', teamId: 'team', name: 'Мобильное' }],
  groups: [{ id: 'g1', teamId: 'team', name: 'Поддержка' }],
  types: [],
  fields: [mockRegion],
};
let mockGroups;

jest.mock('../../api.js', () => ({
  issueConfig: {
    catalog: () => Promise.resolve(mockCatalog),
    createField: (data) => { mockCalls.created.push(data); return Promise.resolve({ id: 'new', ...data }); },
    updateField: (id, data) => { mockCalls.updated.push({ id, ...data }); return Promise.resolve({ id, ...data }); },
  },
  userGroups: {
    list: () => Promise.resolve(mockGroups),
    create: (data) => { mockCalls.groups.push(data); return Promise.resolve({ id: 'g-new', ...data }); },
    update: (id, data) => { mockCalls.groups.push({ id, ...data }); return Promise.resolve({ id, ...data }); },
    setMembers: (id, userIds) => { mockCalls.members.push({ id, userIds }); return Promise.resolve({}); },
    remove: () => Promise.resolve(),
  },
  teams: {
    getMembers: () => Promise.resolve([
      { userId: 'u1', displayName: 'Анна', email: 'anna@example.com' },
      { userId: 'u2', displayName: 'Борис', email: 'boris@example.com' },
    ]),
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.keys(mockCalls).forEach((key) => { mockCalls[key] = []; });
  mockGroups = { teamId: 'team', canManage: true, groups: [] };
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
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent === text);

test('cascading field keeps child options per parent and a default value', async () => {
  await render(<CustomFieldsPage />);
  await click(container.querySelector('button[aria-label="Изменить Регион"]'));
  const children = container.querySelector('textarea[aria-label="Варианты второго уровня: Европа"]');
  expect(children.value).toBe('Берлин');
  await change(children, 'Берлин\nПариж');
  await change(container.querySelector('select[aria-label="Вариант первого уровня"]'), 'Азия');
  await change(container.querySelector('textarea[aria-label="Варианты второго уровня: Азия"]'), 'Токио');
  await change(container.querySelector('select[aria-label="Значение по умолчанию"]'), 'Европа');
  await submit(container.querySelector('form[aria-label="Изменить поле"]'));

  expect(mockCalls.updated[0]).toMatchObject({
    id: 'f-region',
    options: ['Европа', 'Азия'],
    children: { Европа: ['Берлин', 'Париж'], Азия: ['Токио'] },
    defaultValue: ['Европа'],
  });
});

test('contexts give chosen spaces their own options and lock spaces already taken', async () => {
  await render(<CustomFieldsPage />);
  await click(container.querySelector('button[aria-label="Контексты поля Регион"]'));
  await click(button('Добавить контекст'));
  await click(button('Добавить контекст'));
  const cards = container.querySelectorAll('fieldset.settings-context-card');
  expect(cards).toHaveLength(2);
  const boardBox = (card, name) => [...card.querySelectorAll('label')].find((l) => l.textContent === name).querySelector('input');
  await click(boardBox(cards[0], 'Мобильное'));
  expect(boardBox(cards[1], 'Мобильное').disabled).toBe(true);
  await click(container.querySelectorAll('button[aria-label^="Удалить Контекст"]')[1]);
  await change(container.querySelector('input[aria-label="Название контекста"]'), 'Мобильные');
  await change(container.querySelector('textarea[aria-label="Мобильные: Варианты"]'), 'iOS\nAndroid');
  await submit(container.querySelector('form[aria-label="Контексты поля «Регион»"]'));

  expect(mockCalls.updated).toHaveLength(1);
  expect(mockCalls.updated[0].contexts).toEqual([
    expect.objectContaining({ id: null, name: 'Мобильные', boards: ['b2'], issueTypes: [], options: ['iOS', 'Android'], children: { iOS: [], Android: [] } }),
  ]);
});

test('groups page creates a group with chosen members', async () => {
  await render(<GroupsPage />);
  expect(container.textContent).toContain('В этой команде пока нет групп.');
  await click(button('Создать группу'));
  const form = container.querySelector('form[aria-label="Создать группу"]');
  await change(form.querySelector('input[required]'), 'Поддержка');
  const boris = [...form.querySelectorAll('label')].find((l) => l.textContent.includes('Борис')).querySelector('input');
  await click(boris);
  await submit(form);
  expect(mockCalls.groups).toEqual([{ teamId: 'team', name: 'Поддержка', description: '' }]);
  expect(mockCalls.members).toEqual([{ id: 'g-new', userIds: ['u2'] }]);
});
