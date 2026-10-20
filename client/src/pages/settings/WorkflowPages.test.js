import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkflowDesignerPage, WorkflowsPage } from './WorkflowPages.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  ADMIN_NAV: {},
  default: ({ title, actions, children }) => require('react').createElement('section', null, require('react').createElement('h1', null, title), actions, children),
}));

const mockCalls = { created: [], updated: [] };
const mockWorkflow = {
  id: 'w1', teamId: 'team', kind: 'workflow', name: 'Разработка', description: '', usedBy: [{ kind: 'workflowscheme', id: 'ws1', name: 'Схема' }],
  data: { initial: 's1', statuses: [{ key: 's1', name: 'Новая', kind: 0, x: 40, y: 40 }], transitions: [] },
};

jest.mock('../../api.js', () => ({
  issueConfig: { catalog: () => Promise.resolve({ teams: [{ id: 'team', name: 'Команда', canManage: true }], boards: [], groups: [], types: [], fields: [] }) },
  sharedWorkflows: {
    catalog: () => Promise.resolve({
      teamId: 'team', canManage: true, screens: [], groups: [], boards: [{ id: 'b1', name: 'Сайт', workflowSchemeId: null }],
      objects: [mockWorkflow, { id: 'ws1', kind: 'workflowscheme', name: 'Схема', usedBy: [], data: { default: 'w1', types: { 3: 'w1' } } }],
    }),
    get: () => Promise.resolve(mockWorkflow),
    create: (kind, data) => { mockCalls.created.push({ kind, ...data }); return Promise.resolve({ id: 'new', kind, ...data }); },
    update: (id, data) => { mockCalls.updated.push({ id, ...data }); return Promise.resolve({ ...mockWorkflow, ...data }); },
    remove: () => Promise.resolve(),
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.keys(mockCalls).forEach((key) => { mockCalls[key] = []; });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
async function change(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await flush();
}
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

async function renderAt(path) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/issues/workflows" element={<WorkflowsPage />} />
          <Route path="/settings/issues/workflows/:id" element={<WorkflowDesignerPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
  await flush();
}

test('workflows list shows usage and creates a copy that opens in the designer', async () => {
  await renderAt('/settings/issues/workflows');
  expect(container.textContent).toContain('Разработка');
  expect(container.textContent).toContain('статусов: 1 · переходов: 0');
  expect(container.querySelector('button[aria-label="Удалить Разработка"]').disabled).toBe(true);

  await click(button('Создать workflow'));
  const form = container.querySelector('form');
  await change(form.querySelector('input'), 'Поддержка');
  await change(form.querySelector('select[aria-label="Основа"]'), 'w1');
  await submit(form);
  expect(mockCalls.created).toEqual([{ kind: 'workflow', teamId: 'team', name: 'Поддержка', data: mockWorkflow.data }]);
  expect(container.querySelector('input[value="Разработка"]')).not.toBeNull();
});

test('workflow schemes map issue types to workflows', async () => {
  await renderAt('/settings/issues/workflows');
  await click(button('Схемы workflow'));
  expect(container.textContent).toContain('по умолчанию: Разработка · Ошибка: Разработка');

  await click(button('Создать схему workflow'));
  const form = container.querySelector('form');
  await change(form.querySelector('input'), 'Новая схема');
  await change(form.querySelector('select[aria-label="Workflow по умолчанию"]'), 'w1');
  await submit(form);
  expect(mockCalls.created).toEqual([{ kind: 'workflowscheme', teamId: 'team', name: 'Новая схема', description: '', data: { default: 'w1' } }]);
});

test('designer page saves name and diagram changes', async () => {
  await renderAt('/settings/issues/workflows/w1');
  expect(container.textContent).toContain('Изменения сразу применяются ко всем пространствам');
  expect(button('Сохранить').disabled).toBe(true);
  await change(container.querySelector('.wf-designer-meta input'), 'Разработка 2');
  await click(button('Добавить статус'));
  expect(container.textContent).toContain('Есть несохранённые изменения');
  await click(button('Сохранить'));
  expect(mockCalls.updated).toHaveLength(1);
  expect(mockCalls.updated[0]).toMatchObject({ id: 'w1', teamId: 'team', name: 'Разработка 2' });
  expect(mockCalls.updated[0].data.statuses.map((s) => s.name)).toEqual(['Новая', 'Статус 2']);
  expect(container.textContent).toContain('Сохранено');
});
