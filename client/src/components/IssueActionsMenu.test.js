import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IssueActionsMenu, { issueLink } from './IssueActionsMenu.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (text, params) => String(text).replace(/\$\{(\w+)\}/g, (_, key) => String(params?.[key] ?? '')) }),
}));
jest.mock('./IssueIcons.jsx', () => ({ IssueTypeIcon: () => null, PriorityIcon: () => null }));
jest.mock('./AssigneeAvatar.jsx', () => () => null);

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
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const item = (label) => [...container.querySelectorAll('[role^="menuitem"]')].find((el) => el.textContent.replace('✓', '').trim() === label);
const quest = { id: 'q1', issueKey: 'EEE-7', title: 'Задача', priority: 2, sprintId: 's1', assigneeIds: [], storyPoints: null, flagged: false, issueType: 2 };

const renderMenu = async (props = {}) => {
  const handlers = { onMove: jest.fn().mockResolvedValue(), onUpdate: jest.fn().mockResolvedValue(), onDelete: jest.fn().mockResolvedValue(), onNotify: jest.fn(), onSplit: jest.fn() };
  await act(async () => {
    root.render(<IssueActionsMenu quest={quest} boardId="b1" sprints={[{ id: 's1', name: 'Спринт 1' }, { id: 's2', name: 'Спринт 2' }]}
      members={[{ userId: 'u1', displayName: 'Анна' }]} loadEpics={() => Promise.resolve([{ id: 'e1', issueKey: 'EEE-1', title: 'Эпик' }])} {...handlers} {...props} />);
  });
  await click(container.querySelector('.iam-trigger'));
  return handlers;
};

test('builds an absolute issue link', () => {
  expect(issueLink('b1', 'q1', 'https://kanban.baxic.ru')).toBe('https://kanban.baxic.ru/board/b1/issue/q1');
});

test('lists Jira backlog actions and moves to another sprint or the backlog', async () => {
  const h = await renderMenu();
  const labels = [...container.querySelectorAll('.iam-menu > [role="menuitem"], .iam-parent > [role="menuitem"]')].map((el) => el.textContent.trim());
  expect(labels).toEqual(['Переместить задачу', 'Копировать ссылку', 'Копировать ключ', 'Добавить флажок', 'Исполнитель', 'Приоритет', 'Родительский элемент', 'Примерная оценка сложности', 'Разделить задачу типа «Задача»', 'Удалить']);
  expect(container.querySelectorAll('.iam-menu > .iam-sep')).toHaveLength(3);

  await click(item('Переместить задачу'));
  expect(item('Спринт 1')).toBeUndefined();
  await click(item('Бэклог'));
  expect(h.onMove).toHaveBeenCalledWith(null);
  expect(container.querySelector('.iam-menu')).toBeNull();
});

test('updates flag, assignee, priority, parent and story points', async () => {
  const h = await renderMenu();
  await click(item('Добавить флажок'));
  expect(h.onUpdate).toHaveBeenLastCalledWith({ flagged: true });

  await click(container.querySelector('.iam-trigger'));
  await click(item('Исполнитель'));
  await click(item('Анна'));
  expect(h.onUpdate).toHaveBeenLastCalledWith({ assigneeIds: ['u1'], assigneeIdsSet: true });

  await click(container.querySelector('.iam-trigger'));
  await click(item('Приоритет'));
  await click(item('Высший'));
  expect(h.onUpdate).toHaveBeenLastCalledWith({ priority: 4 });

  await click(container.querySelector('.iam-trigger'));
  await click(item('Родительский элемент'));
  await flush();
  await click(item('EEE-1Эпик'));
  expect(h.onUpdate).toHaveBeenLastCalledWith({ parentQuestId: 'e1', parentQuestIdSet: true });

  await click(container.querySelector('.iam-trigger'));
  await click(item('Примерная оценка сложности'));
  await click(item('5'));
  expect(h.onUpdate).toHaveBeenLastCalledWith({ storyPoints: 5, storyPointsSet: true });
});

test('copies the key and reports failures', async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.assign(navigator, { clipboard: { writeText } });
  const h = await renderMenu({ onUpdate: jest.fn().mockRejectedValue(new Error('Нет прав')) });
  await click(item('Копировать ключ'));
  expect(writeText).toHaveBeenCalledWith('EEE-7');
  expect(h.onNotify).toHaveBeenLastCalledWith('Ключ скопирован');

  await click(container.querySelector('.iam-trigger'));
  await click(item('Добавить флажок'));
  expect(h.onNotify).toHaveBeenLastCalledWith('Нет прав');
});
