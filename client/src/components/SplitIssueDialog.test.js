import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SplitIssueDialog, { buildSplit } from './SplitIssueDialog.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (text, params) => String(text).replace(/\$\{(\w+)\}/g, (_, key) => String(params?.[key] ?? '')) }),
}));
jest.mock('./IssueIcons.jsx', () => ({ IssueTypeIcon: () => null }));
jest.mock('./NavIcons.jsx', () => () => null);

const quest = { id: 'q1', issueKey: 'SCRUM-4', title: 'Большая задача', storyPoints: 8, columnId: 'c1', issueType: 2, priority: 3, sprintId: 's1', assigneeIds: ['u1'], labels: 'api', parentQuestId: 'e1' };

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
const setValue = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const byLabel = (label) => container.querySelector(`[aria-label="${label}"]`);
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));

test('builds the original update and copies fields to new issues', () => {
  const result = buildSplit(quest, { title: 'Часть 1', points: '5' }, [{ title: 'Часть 2', points: '3' }], '');
  expect(result.update).toEqual({ title: 'Часть 1', storyPoints: 5, storyPointsSet: true });
  expect(result.creates).toEqual([expect.objectContaining({ title: 'Часть 2', storyPoints: 3, sprintId: null, columnId: 'c1', priority: 3, assigneeIds: ['u1'], labels: 'api', parentQuestId: 'e1' })]);
  expect(buildSplit(quest, { title: 'Большая задача', points: 8 }, [], 's1').update).toEqual({});
});

test('splits into several issues placed in the chosen sprint', async () => {
  const onSplit = jest.fn().mockResolvedValue();
  await act(async () => { root.render(<SplitIssueDialog quest={quest} sprints={[{ id: 's1', name: 'Спринт 1' }, { id: 's2', name: 'Спринт 2' }]} onSplit={onSplit} onClose={() => {}} />); });
  expect(container.querySelector('[role="dialog"]').getAttribute('aria-label')).toBe('Разделить задачу SCRUM-4');
  await setValue(byLabel('Исходная задача: Примерная оценка сложности'), '5');
  await setValue(byLabel('Новая задача 1'), 'Тесты');
  await click(button('Добавить задачу'));
  await setValue(byLabel('Новая задача 2'), 'Документация');
  await setValue(byLabel('Новая задача 2: Примерная оценка сложности'), '1');
  await setValue(container.querySelector('select'), 's2');
  await click(button('Разделить'));
  const arg = onSplit.mock.calls[0][0];
  expect(arg.update).toEqual({ storyPoints: 5, storyPointsSet: true });
  expect(arg.creates.map((c) => [c.title, c.storyPoints, c.sprintId])).toEqual([['Тесты', null, 's2'], ['Документация', 1, 's2']]);
});

test('requires a summary for every new issue', async () => {
  const onSplit = jest.fn();
  await act(async () => { root.render(<SplitIssueDialog quest={quest} onSplit={onSplit} onClose={() => {}} />); });
  await click(button('Разделить'));
  expect(container.querySelector('[role="alert"]').textContent).toBe('Укажите название для каждой задачи.');
  expect(onSplit).not.toHaveBeenCalled();
});
