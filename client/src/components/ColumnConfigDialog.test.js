import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ColumnConfigDialog from './ColumnConfigDialog.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('./NavIcons.jsx', () => () => null);

const mockCalls = [];
jest.mock('../api.js', () => ({
  boards: {
    publishColumnLayout: (id, data) => { mockCalls.push(['publish', id, data]); return Promise.resolve({ configured: true, columns: [], hidden: [], statuses: [] }); },
    resetColumnLayout: (id) => { mockCalls.push(['reset', id]); return Promise.resolve({ configured: false }); },
  },
}));

const layout = {
  configured: false,
  columns: [
    { id: 's1', name: 'To Do', statusIds: ['s1'] },
    { id: 's2', name: 'In Progress', statusIds: ['s2'] },
  ],
  hidden: [],
  statuses: [{ id: 's1', title: 'К выполнению', kind: 0 }, { id: 's2', title: 'В работе', kind: 1 }],
};

let container;
let root;
let published;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockCalls.length = 0;
  published = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async () => {
  await act(async () => { root.render(<ColumnConfigDialog boardId="b1" layout={layout} onClose={() => {}} onPublished={(x) => { published = x; }} />); });
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
};
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const lane = (name) => container.querySelector(`section[aria-label="${name}"]`);

test('a new column needs a status before publishing, and new statuses are sent by key', async () => {
  await render();
  expect(lane('Скрытые статусы').textContent).toContain('Задачи с этими статусами не будут отображаться.');
  expect(button('Опубликовать').disabled).toBe(true);

  await click(container.querySelector('button[aria-label="Добавить столбец"]'));
  await type(container.querySelector('input[aria-label="Название столбца"]'), '123');
  await submit(container.querySelector('.ccd-new-column form'));

  expect(lane('123').textContent).toContain('Столбцы должны иметь хотя бы по одному статусу.');
  expect(button('Опубликовать').disabled).toBe(true);

  await type(lane('123').querySelector('input[aria-label="Имя статуса"]'), 'QA');
  await type(lane('123').querySelector('select[aria-label="Категория статуса"]'), '3');
  await submit(lane('123').querySelector('form'));

  expect(lane('123').querySelector('.ccd-lozenge').textContent).toBe('QA');
  expect(button('Опубликовать').disabled).toBe(false);
  await click(button('Опубликовать'));

  const [, boardId, request] = mockCalls[0];
  expect(boardId).toBe('b1');
  expect(request.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', '123']);
  expect(request.columns[2].id).toBeNull();
  expect(request.newStatuses).toEqual([{ key: request.columns[2].statusIds[0], name: 'QA', kind: 3 }]);
  expect(published.configured).toBe(true);
});

test('status menu moves a status right and hides it', async () => {
  await render();
  const menuOf = (laneName) => lane(laneName).querySelector('.ccd-status button[aria-label="Действия со статусом"]');

  await click(menuOf('To Do'));
  await click(button('Переместить статус вправо'));
  expect(lane('In Progress').querySelectorAll('.ccd-status')).toHaveLength(2);
  expect(lane('To Do').textContent).toContain('Столбцы должны иметь хотя бы по одному статусу.');

  await click(lane('In Progress').querySelector('.ccd-status button[aria-label="Действия со статусом"]'));
  await click(button('Скрыть статус'));
  expect(lane('Скрытые статусы').textContent).toContain('В работе');

  await click(lane('To Do').querySelector('button[aria-label="Действия со столбцом"]'));
  await click(button('Удалить столбец'));
  expect(lane('To Do')).toBeNull();
  expect(button('Опубликовать').disabled).toBe(false);
  await click(button('Опубликовать'));
  expect(mockCalls[0][2].columns).toEqual([{ id: 's2', name: 'In Progress', statusIds: ['s1'] }]);
});
