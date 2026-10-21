import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ContributingTeamsDialog, { memberCountText } from './ContributingTeamsDialog.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s, vars) => (vars ? s.replace(/\$\{(\w+)\}/g, (_, k) => vars[k]) : s), locale: 'ru', language: 'ru' }),
}));

const mockCalls = [];
let mockState;
const backend = { id: 't1', name: 'Бэкенд', memberCount: 3, members: [{ userId: 'u1', displayName: 'Анна' }] };
const design = { id: 't2', name: 'Дизайн', memberCount: 1, members: [] };
jest.mock('../api.js', () => ({
  contributingTeams: {
    get: () => Promise.resolve(mockState),
    search: (boardId, q) => {
      mockCalls.push(['search', boardId, q]);
      return Promise.resolve({ teams: [backend, design].filter((x) => x.name.toLowerCase().includes(q.toLowerCase())) });
    },
    set: (boardId, ids) => { mockCalls.push(['set', boardId, ids]); return Promise.resolve({ canEdit: true, teams: ids.map((id) => ({ id, name: id, memberCount: 0, members: [] })) }); },
  },
  teams: { create: (data) => { mockCalls.push(['create', data]); return Promise.resolve({ id: 't9', name: data.name }); } },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  jest.useFakeTimers();
  mockCalls.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const flush = () => act(async () => { jest.advanceTimersByTime(250); await Promise.resolve(); await Promise.resolve(); });
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
};
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const input = () => container.querySelector('input[role="combobox"]');

test('pluralizes members like Jira', () => {
  const t = (s) => s;
  expect(memberCountText(1, t)).toBe('1 участник');
  expect(memberCountText(3, t)).toBe('3 участника');
  expect(memberCountText(11, t)).toBe('11 участников');
  expect(memberCountText(25, t)).toBe('25 участников');
});

test('searches, adds and saves contributing teams', async () => {
  mockState = { canEdit: true, teams: [] };
  const saved = [];
  const closed = [];
  await act(async () => { root.render(<ContributingTeamsDialog boardId="b1" onClose={() => closed.push(1)} onSaved={(x) => saved.push(x)} />); });
  await flush();
  expect(container.textContent).toContain('Привязка участвующих команд');
  expect(input().placeholder).toBe('Поиск и добавление команд');
  expect(button('Сохранить').disabled).toBe(true);

  await act(async () => { input().dispatchEvent(new FocusEvent('focus')); input().focus(); });
  await flush();
  expect(container.querySelectorAll('.ct-option')).toHaveLength(2);
  expect(container.querySelector('.ct-option').textContent).toContain('3 участника');

  await type(input(), 'бэк');
  expect(mockCalls).toContainEqual(['search', 'b1', 'бэк']);
  await click(button('Бэкенд'));
  expect(container.querySelector('.ct-chip').textContent).toContain('Бэкенд');

  await type(input(), 'Мобилки');
  await click(button('Создать команду «Мобилки»'));
  expect(mockCalls).toContainEqual(['create', { name: 'Мобилки' }]);
  expect([...container.querySelectorAll('.ct-chip')].map((c) => c.textContent)).toEqual(['Бэкенд', 'Мобилки']);

  await click(button('Сохранить'));
  expect(mockCalls).toContainEqual(['set', 'b1', ['t1', 't9']]);
  expect(saved[0].map((x) => x.id)).toEqual(['t1', 't9']);
  expect(closed).toHaveLength(1);
});

test('removes a linked team and shows a read-only list for non-admins', async () => {
  mockState = { canEdit: true, teams: [backend] };
  await act(async () => { root.render(<ContributingTeamsDialog boardId="b1" onClose={() => {}} />); });
  await flush();
  await click(container.querySelector('.ct-chip button'));
  expect(container.querySelector('.ct-chip')).toBeNull();
  await click(button('Сохранить'));
  expect(mockCalls).toContainEqual(['set', 'b1', []]);

  act(() => root.unmount());
  root = createRoot(container);
  mockState = { canEdit: false, teams: [backend] };
  await act(async () => { root.render(<ContributingTeamsDialog boardId="b1" onClose={() => {}} />); });
  await flush();
  expect(input()).toBeNull();
  expect(button('Сохранить')).toBeUndefined();
  expect(container.querySelector('.ct-list').textContent).toContain('Бэкенд');
  expect(container.textContent).toContain('Изменять команды раздела могут только его администраторы.');
});
