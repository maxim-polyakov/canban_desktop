import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CreateHomeItemDialog, HomeDirectoryPage, HomeItemPage } from './HomePages.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));
jest.mock('../../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1', displayName: 'Me', email: 'me@example.com' } }),
}));

const item = {
  id: 'p1', kind: 'project', name: 'Новый проект', icon: '', status: 'pending', score: null, startDate: null, targetDate: null, parentId: null,
  isPrivate: false, isArchived: false, archivedAt: null, lastUpdateAt: null, createdAt: '2026-10-20T04:36:04Z', updatedAt: '2026-10-20T04:36:04Z',
  owner: { id: 'u1', displayName: 'Me', avatarUrl: null }, team: null, tags: [], followers: 1, contributors: 0, contributorIds: [],
  isFollowing: true, isContributor: false, goalIds: [], projectIds: [], workTotal: 0, workDone: 0, updateDue: false, canEdit: true,
};

jest.mock('../../api.js', () => ({
  home: {
    get: () => Promise.resolve({
      item, description: null, startDate: null, contributors: [], followers: [item.owner], parent: null, children: [], linked: [], updates: [],
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

test('create dialog renders as soon as it opens', async () => {
  await render('/projects', '/projects', <CreateHomeItemDialog open kind="projects" goals={[]} onClose={() => {}} onCreated={() => {}} />);
  expect(container.querySelector('.home-modal input')).not.toBeNull();
  expect(container.querySelector('.home-modal button[type=submit]').disabled).toBe(true);
});

test('project page renders a freshly created project', async () => {
  await render('/projects/p1', '/projects/:itemId', <HomeItemPage kind="projects" />);
  expect(container.textContent).toContain('Новый проект');
});

test('project catalog lists projects', async () => {
  await render('/projects', '/projects', <HomeDirectoryPage kind="projects" />);
  expect(container.textContent).toContain('Новый проект');
});
