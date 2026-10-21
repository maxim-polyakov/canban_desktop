import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AiDescriptionAssist, AiSummary, resetAiStatus } from './AiAssist.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s, vars) => (vars ? s.replace(/\$\{(\w+)\}/g, (_, k) => vars[k]) : s), locale: 'ru', language: 'ru' }),
}));

const mockCalls = [];
let mockEnabled = true;
let mockFail = false;
jest.mock('../api.js', () => ({
  ai: {
    status: () => Promise.resolve({ enabled: mockEnabled }),
    description: (data) => {
      mockCalls.push(['description', data]);
      return mockFail ? Promise.reject(new Error('Лимит запросов к ИИ исчерпан.')) : Promise.resolve({ text: '## Шаги\n1. Открыть вход' });
    },
    summarize: (id, language) => { mockCalls.push(['summary', id, language]); return Promise.resolve({ text: 'Задача про вход, ждёт ревью.' }); },
  },
}));

let container;
let root;
beforeAll(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockCalls.length = 0;
  mockEnabled = true;
  mockFail = false;
  resetAiStatus();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const render = async (el) => { await act(async () => { root.render(el); }); await flush(); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text));

test('improves the description and applies it only after confirmation', async () => {
  const accepted = [];
  await render(<AiDescriptionAssist boardId="b1" title="Не работает вход" issueType={3} issueTypeName="Ошибка"
    description="падает" onAccept={(text) => accepted.push(text)} />);
  await click(button('Улучшить задачу типа «Ошибка»'));
  expect(mockCalls[0]).toEqual(['description', { boardId: 'b1', title: 'Не работает вход', issueType: 3, issueTypeName: 'Ошибка', description: 'падает', language: 'ru' }]);
  expect(container.querySelector('.ai-card').textContent).toContain('Открыть вход');
  expect(accepted).toEqual([]);

  await click(button('Ещё вариант'));
  expect(mockCalls).toHaveLength(2);
  await click(button('Заменить описание'));
  expect(accepted).toEqual(['## Шаги\n1. Открыть вход']);
  expect(container.querySelector('.ai-card')).toBeNull();
});

test('offers generation for an empty description and shows server errors', async () => {
  mockFail = true;
  await render(<AiDescriptionAssist boardId="b1" title="Экспорт" issueType={2} issueTypeName="Задача" description="" onAccept={() => {}} />);
  await click(button('Сгенерировать описание'));
  expect(container.querySelector('[role="alert"]').textContent).toBe('Лимит запросов к ИИ исчерпан.');
});

test('hides AI controls when the server has no model', async () => {
  mockEnabled = false;
  await render(<><AiSummary questId="q1" /><AiDescriptionAssist boardId="b1" title="x" description="" onAccept={() => {}} /></>);
  expect(container.querySelector('button')).toBeNull();
});

test('summarizes the issue on demand', async () => {
  await render(<AiSummary questId="q1" />);
  await click(button('Краткое содержание'));
  expect(mockCalls).toEqual([['summary', 'q1', 'ru']]);
  expect(container.querySelector('.ai-card').textContent).toContain('ждёт ревью');
  await click(button('Скрыть'));
  expect(container.querySelector('.ai-card')).toBeNull();
});
