import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IssueVotes from './IssueVotes.jsx';

jest.mock('../i18n/LocalizationContext.jsx', () => ({
  useLocalization: () => ({ t: (s) => s, locale: 'ru', language: 'ru' }),
}));

const mockCalls = [];
let mockState;
jest.mock('../api.js', () => ({
  votes: {
    get: () => Promise.resolve(mockState),
    vote: (id) => { mockCalls.push(['vote', id]); mockState = { ...mockState, votes: mockState.votes + 1, hasVoted: true }; return Promise.resolve(mockState); },
    unvote: (id) => { mockCalls.push(['unvote', id]); mockState = { ...mockState, votes: mockState.votes - 1, hasVoted: false }; return Promise.resolve(mockState); },
  },
}));

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
const render = async (props = {}) => { await act(async () => { root.render(<IssueVotes questId="q1" statusKey="c1" {...props} />); }); await flush(); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await flush(); };
const toggle = () => container.querySelector('button[aria-pressed]');

test('votes and removes the vote, and lists voters for space workers', async () => {
  mockState = { votes: 1, hasVoted: false, canVote: true, blockedReason: null, voters: [{ userId: 'u2', displayName: 'Анна', avatarUrl: null }] };
  await render();
  expect(container.querySelector('.issue-votes-count').textContent).toBe('1');
  expect(toggle().textContent).toBe('+ Голосовать');

  await click(toggle());
  expect(mockCalls).toEqual([['vote', 'q1']]);
  expect(container.querySelector('.issue-votes-count').textContent).toBe('2');
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  expect(toggle().textContent).toBe('✓ Отменить голос');

  await click(toggle());
  expect(mockCalls).toEqual([['vote', 'q1'], ['unvote', 'q1']]);

  expect(container.querySelector('.issue-votes-voters')).toBeNull();
  await click(container.querySelector('.issue-votes-link'));
  expect(container.querySelector('.issue-votes-voters').textContent).toContain('Анна');
});

test('explains why voting is unavailable and hides voters from viewers', async () => {
  mockState = { votes: 3, hasVoted: false, canVote: false, blockedReason: 'Нельзя голосовать за задачу, которую вы создали', voters: null };
  await render();
  expect(toggle().disabled).toBe(true);
  expect(container.textContent).toContain('Нельзя голосовать за задачу, которую вы создали');
  expect(container.querySelector('.issue-votes-link')).toBeNull();
});
