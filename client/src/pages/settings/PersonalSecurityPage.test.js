import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PersonalSecurityPage from './PersonalSecurityPage.jsx';

jest.mock('../../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, formatDate: (value) => `on ${String(value).slice(0, 10)}` }),
}));

jest.mock('./SettingsShell.jsx', () => ({
  __esModule: true,
  PERSONAL_NAV: {},
  SettingsSection: ({ title, children }) => require('react').createElement('div', null, require('react').createElement('h2', null, title), children),
  default: ({ actions, children }) => require('react').createElement('section', null, actions, children),
}));

const mockCalls = { created: [], revoked: [] };
let mockTokens;

jest.mock('../../api.js', () => ({
  API_BASE: 'https://api.test',
  apiTokens: {
    list: () => Promise.resolve(mockTokens),
    create: (data) => {
      mockCalls.created.push(data);
      mockTokens = [{ id: 'n', name: data.name, hint: 'kbn_AbCd…', createdAt: '2026-10-20T00:00:00Z', expiresAt: '2026-10-27T00:00:00Z', lastUsedAt: null, expired: false, scopes: data.scopes }, ...mockTokens];
      return Promise.resolve({ token: mockTokens[0], secret: 'kbn_AbCdEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd' });
    },
    revoke: (id) => { mockCalls.revoked.push(id); mockTokens = mockTokens.filter((x) => x.id !== id); return Promise.resolve(); },
    revokeAll: () => Promise.resolve({ revoked: 0 }),
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockCalls.created = [];
  mockCalls.revoked = [];
  mockTokens = [
    { id: 't1', name: 'CI', hint: 'kbn_Zz12…', createdAt: '2026-09-01T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z', lastUsedAt: '2026-09-30T10:00:00Z', lastUsedIp: '10.1.1.1', expired: true },
  ];
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
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };

test('lists tokens with expiry and last use', async () => {
  await act(async () => { root.render(<PersonalSecurityPage />); });
  await flush();
  expect(container.textContent).toContain('CI');
  expect(container.textContent).toContain('kbn_Zz12…');
  expect(container.textContent).toContain('Истёк on 2026-10-01');
  expect(container.textContent).toContain('10.1.1.1');
  expect(container.querySelector('.token-example').textContent).toContain('curl -u you@example.com:<token> https://api.test/api/search/issues');
  expect(container.textContent).toContain('Полный доступ');
});

test('creates a token and shows the secret once', async () => {
  await act(async () => { root.render(<PersonalSecurityPage />); });
  await flush();
  await click(button('Создать API-токен'));
  const input = container.querySelector('.app-modal input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Deploy bot');
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })); });
  const select = container.querySelector('.app-modal select');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '7');
  expect([...select.options].map((o) => o.value)).not.toContain('');
  await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { container.querySelectorAll('input[name="token-kind"]')[1].click(); });
  const write = [...container.querySelectorAll('.token-scopes input')][1];
  await act(async () => { write.click(); });
  await act(async () => { container.querySelector('.app-modal form, form.app-modal').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  expect(mockCalls.created).toEqual([{ name: 'Deploy bot', expiresInDays: 7, scopes: ['read:jira-work', 'write:jira-work'] }]);
  expect(container.querySelector('[data-testid="token-secret"]').textContent).toMatch(/^kbn_/);
  expect(container.textContent).toContain('Deploy bot');
  await click(button('Готово'));
  expect(container.querySelector('[data-testid="token-secret"]')).toBeNull();
});

test('revokes a token after confirmation', async () => {
  window.confirm = () => true;
  await act(async () => { root.render(<PersonalSecurityPage />); });
  await flush();
  await click(button('Отозвать'));
  expect(mockCalls.revoked).toEqual(['t1']);
  expect(container.textContent).toContain('У вас пока нет API-токенов.');
});
