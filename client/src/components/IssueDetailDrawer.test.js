import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IssueDetailDrawer from './IssueDetailDrawer.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1', displayName: 'Max' } }) }));
jest.mock('./IssueIcons.jsx', () => ({ IssueTypeIcon: () => <i />, PriorityIcon: () => <i /> }));
jest.mock('./AssigneeAvatar.jsx', () => () => <i />);
jest.mock('./AssigneeSelect.jsx', () => () => <div />);
jest.mock('./NotificationRecipientPicker.jsx', () => () => <div />);
jest.mock('./IssueVotes.jsx', () => () => <div />);
jest.mock('./IssueAssetsField.jsx', () => () => <div />);
jest.mock('./CreateBranchPanel.jsx', () => () => <div />);
jest.mock('./CustomFields.jsx', () => () => <div />);
jest.mock('./TransitionScreenDialog.jsx', () => () => <div />);
jest.mock('../utils/navHistory.js', () => ({ rememberIssue: () => {} }));
jest.mock('../utils/issueConfig.js', () => ({
  BASE_TYPES: [{ value: 2, label: 'Задача' }, { value: 3, label: 'Ошибка' }],
  typeChoice: (issueType, issueTypeId) => issueTypeId || String(issueType ?? 2),
  useBoardIssueConfig: () => ({ types: [], fields: [], versions: [], groups: [], layout: null, workflow: null }),
}));

const mockCalls = [];
const mockQuest = {
  id: 'q1', boardId: 'b1', columnId: 'c1', issueKey: 'KAN-1', title: 'Fix login', description: '', priority: 2,
  issueType: 2, xpReward: 10, assigneeIds: [], labels: '', notificationRecipientIds: [], createdAt: '2026-10-20T10:00:00Z',
};
jest.mock('../api.js', () => {
  const ok = (value) => () => Promise.resolve(value);
  return {
    quests: {
      get: () => Promise.resolve({ ...mockQuest }),
      update: (id, data) => { mockCalls.push(['update', id, data]); return Promise.resolve({}); },
      move: (data) => { mockCalls.push(['move', data]); return Promise.resolve({}); },
      getComments: ok([]),
      addComment: (id, text) => { mockCalls.push(['comment', id, text]); return Promise.resolve({ id: 'm1', authorUserId: 'u1', authorName: 'Max', text, createdAt: '2026-10-20T11:00:00Z' }); },
      getAttachments: ok([]),
      create: (data) => { mockCalls.push(['create', data]); return Promise.resolve({ id: 'q2' }); },
    },
    workflows: { getTransitions: ok([]) },
    questHierarchy: { get: ok({ parent: null, children: [], reporter: { id: 'u1', displayName: 'Max' } }) },
    questLinks: { get: ok([]) },
    worklogs: { get: ok([]) },
    history: { get: ok([]) },
    integrations: { getDevelopment: ok(null) },
    sprints: { getByBoard: ok([]) },
    components: { getByBoard: ok([]) },
    releases: { getByBoard: ok([]) },
    clone: {},
  };
});

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockCalls.length = 0;
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
const change = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
};
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const columns = [{ id: 'c1', title: 'To Do', kind: 0, quests: [] }, { id: 'c2', title: 'Done', kind: 3, quests: [] }];

const render = async () => {
  await act(async () => { root.render(<IssueDetailDrawer questId="q1" columns={columns} members={[{ userId: 'u1', displayName: 'Max' }]} onClose={() => {}} />); });
  await flush();
};

test('looks like the Jira issue view and saves fields as soon as they change', async () => {
  await render();
  expect(container.querySelector('.iv-title').value).toBe('Fix login');
  expect(button('KAN-1')).toBeTruthy();
  expect(container.textContent).toContain('Редактировать описание');
  expect(container.textContent).toContain('Добавить подзадачу');
  expect(container.textContent).toContain('Добавить связанную задачу');
  expect(container.textContent).toContain('Сведения');
  expect(container.querySelector('.iv-person').textContent).toContain('Max');
  expect(button('Сохранить')).toBeUndefined();

  await change(container.querySelector('select[aria-label="Приоритет"]'), '4');
  expect(mockCalls[0][0]).toBe('update');
  expect(mockCalls[0][2]).toMatchObject({ priority: 4, title: 'Fix login' });

  await change(container.querySelector('input[aria-label="Дата начала"]'), '2026-11-02');
  expect(mockCalls[1][2]).toMatchObject({ startDate: '2026-11-02T00:00:00Z', startDateSet: true, dueDate: null, dueDateSet: true });
});

test('status button moves the issue and the comment box saves comments', async () => {
  await render();
  const status = container.querySelector('button[aria-label="Статус"]');
  expect(status.textContent).toContain('To Do');
  await click(status);
  await click([...container.querySelectorAll('.iv-menu-item')].find((b) => b.textContent.includes('Done')));
  expect(mockCalls.find((c) => c[0] === 'move')[1]).toMatchObject({ questId: 'q1', targetColumnId: 'c2' });

  await click(button('Кто работает над этим...?'));
  const box = container.querySelector('textarea[aria-label="Добавить комментарий…"]');
  expect(box.value).toBe('Кто работает над этим ');
  await change(box, 'Кто работает над этим? Я');
  await click(button('Сохранить'));
  expect(mockCalls.find((c) => c[0] === 'comment')).toEqual(['comment', 'q1', 'Кто работает над этим? Я']);
  expect(container.querySelector('.iv-comment-text').textContent).toBe('Кто работает над этим? Я');
});

test('subtasks are created from the issue with only a summary', async () => {
  await render();
  await click(button('Добавить подзадачу'));
  await change(container.querySelector('input[aria-label="Что нужно сделать?"]'), 'Шаг 1');
  await act(async () => { container.querySelector('.iv-inline-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  expect(mockCalls.find((c) => c[0] === 'create')[1]).toMatchObject({ title: 'Шаг 1', issueType: 4, parentQuestId: 'q1', columnId: 'c1' });
});
