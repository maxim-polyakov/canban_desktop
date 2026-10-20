import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateHomeItemDialog, HomeDirectoryPage } from './HomePages.jsx';
import { HomeItemPage } from './HomeItemPage.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Me', email: 'me@example.com' } }),
}));

const owner = { id: 'u1', displayName: 'Me', avatarUrl: null };
const item = {
  id: 'p1', key: 'PROJ-7', kind: 'project', name: 'Новый проект', icon: '😎', status: 'pending', score: null, startDate: null, targetDate: null, parentId: null,
  isPrivate: false, isArchived: false, archivedAt: null, lastUpdateAt: null, createdAt: '2026-10-20T04:36:04Z', updatedAt: '2026-10-20T04:36:04Z',
  owner, team: null, tags: [], followers: 1, contributors: 0, contributorIds: [], isFollowing: true, isStarred: false, isContributor: false,
  goalIds: [], projectIds: [], workTotal: 0, workDone: 0, updateDue: false, canEdit: true,
};
const risk = { id: 'r1', type: 'risk', title: 'Поставщик задерживает API', body: 'План Б', resolved: false, createdAt: '2026-10-20T05:00:00Z', author: owner };

jest.mock('../../api.js', () => ({
  home: {
    get: () => Promise.resolve({
      item, description: null, why: 'Чтобы ускорить релизы', success: null, startDate: null, ownerUser: owner,
      contributors: [], followers: [owner], parent: null, children: [], linked: [], updates: [],
      learnings: [], risks: [risk], decisions: [], comments: [], links: [], related: [],
      work: { total: 0, done: 0, items: [] }, canDelete: true,
    }),
    list: () => Promise.resolve([item]),
    tags: () => Promise.resolve([]),
  },
  people: { workWith: () => Promise.resolve([]) },
  teams: { getMyTeamsWithBoards: () => Promise.resolve([]) },
}));

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

async function render(path, routePath, element) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path={routePath} element={element} /></Routes></MemoryRouter>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));

test('quick create asks for name, emoji and access', async () => {
  await render('/projects', '/projects', <CreateHomeItemDialog open kind="projects" onClose={() => {}} onCreated={() => {}} />);
  const form = container.querySelector('.home-create-pop');
  expect(form.querySelector('input')).not.toBeNull();
  expect(form.querySelector('.home-create-emoji-current').textContent).toBe('😎');
  expect(form.querySelector('select').value).toBe('open');
  expect(form.querySelector('button[type=submit]').disabled).toBe(true);
});

test('project page shows Atlassian-style header, about sections and sidebar', async () => {
  await render('/projects/p1', '/projects/:itemId/:tab?', <HomeItemPage kind="projects" />);
  const text = container.textContent;
  expect(text).toContain('PROJ-7');
  expect(text).toContain('Новый проект');
  ['Сведения', 'Обновления', 'Выводы', 'Риски (1)', 'Решения'].forEach((tab) => expect(text).toContain(tab));
  ['Чем мы занимаемся', 'Зачем мы этим занимаемся', 'Чтобы ускорить релизы', 'Как будет определяться успех', 'Комментарии'].forEach((s) => expect(text).toContain(s));
  ['Владелец', 'Участники', 'Подписчики', 'Участие в целях', 'Связанные проекты', 'Задачи Jira', 'Ссылки', 'Теги', 'Дата начала'].forEach((s) => expect(text).toContain(s));
  expect(container.querySelector('.home-status-button').textContent).toContain('В ожидании');
});

test('status menu lists Atlassian statuses', async () => {
  await render('/projects/p1', '/projects/:itemId/:tab?', <HomeItemPage kind="projects" />);
  await click(container.querySelector('.home-status-button'));
  const labels = [...container.querySelectorAll('.home-status-menu .home-status')].map((s) => s.textContent);
  expect(labels).toEqual(['В ожидании', 'По графику', 'В зоне риска', 'С отставанием от графика', 'Выполнено', 'Приостановлено', 'Отменено']);
});

test('risks tab lists risks and empty tabs invite to add', async () => {
  await render('/projects/p1/risks', '/projects/:itemId/:tab?', <HomeItemPage kind="projects" />);
  expect(container.textContent).toContain('Поставщик задерживает API');
  expect(button('Снять риск')).toBeTruthy();
  act(() => root.unmount());
  root = createRoot(container);
  await render('/projects/p1/decisions', '/projects/:itemId/:tab?', <HomeItemPage kind="projects" />);
  expect(container.textContent).toContain('Сообщайте о важных решениях');
  expect(button('Добавить новое решение')).toBeTruthy();
});

test('share dialog has access, followers and channels tabs', async () => {
  await render('/projects/p1', '/projects/:itemId/:tab?', <HomeItemPage kind="projects" />);
  await click(button('Поделиться'));
  const dialog = container.querySelector('.home-share');
  expect(dialog.textContent).toContain('Предоставление доступа');
  expect(dialog.textContent).toContain('Владелец');
  await click([...dialog.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('Каналы')));
  expect(dialog.textContent).toContain('Добавьте канал, чтобы расширить свою аудиторию');
});

test('project catalog lists projects', async () => {
  await render('/projects', '/projects', <HomeDirectoryPage kind="projects" />);
  expect(container.textContent).toContain('Новый проект');
});
