import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import QuickCreateIssue from './QuickCreateIssue.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('./IssueIcons.jsx', () => ({ IssueTypeIcon: ({ issueType, typeId }) => <i data-type={typeId || issueType} /> }));
jest.mock('./AssigneeAvatar.jsx', () => ({ displayName }) => <i>{displayName}</i>);

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const key = async (el, k) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); await flush(); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const button = (label) => container.querySelector(`button[aria-label="${label}"]`);

test('only the summary is needed: Enter creates the issue and keeps the composer open for the next one', async () => {
  const created = [];
  await act(async () => {
    root.render(<QuickCreateIssue members={[{ userId: 'u1', displayName: 'Max' }]} issueTypes={[]} onCreate={(v) => { created.push(v); return Promise.resolve(); }} onCancel={() => {}} />);
  });
  const input = container.querySelector('textarea[aria-label="Что нужно сделать?"]');
  expect(button('Создать').disabled).toBe(true);
  await type(input, 'Починить вход');
  await key(input, 'Enter');
  expect(created).toEqual([{ title: 'Починить вход', issueType: 2, issueTypeId: null, dueDate: null, assigneeIds: [] }]);
  expect(input.value).toBe('');

  await click(button('Тип задачи'));
  await click([...container.querySelectorAll('.qc-option')].find((b) => b.textContent.includes('Ошибка')));
  await click(button('Исполнитель'));
  await click([...container.querySelectorAll('.qc-option')].find((b) => b.textContent.includes('Max')));
  await type(input, 'Вторая');
  await key(input, 'Enter');
  expect(created[1]).toMatchObject({ title: 'Вторая', issueType: 3, assigneeIds: ['u1'] });
});

test('Escape cancels the composer', async () => {
  let cancelled = false;
  await act(async () => {
    root.render(<QuickCreateIssue onCreate={() => Promise.resolve()} onCancel={() => { cancelled = true; }} />);
  });
  await key(container.querySelector('textarea'), 'Escape');
  expect(cancelled).toBe(true);
});
