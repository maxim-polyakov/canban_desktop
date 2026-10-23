import {
  getCachedBoard, getRecentBoards, getStarredBoards, getViewedIssues, isBoardStarred,
  rememberBoard, rememberIssue, toggleStarredBoard,
} from './navHistory.js';

beforeEach(() => window.localStorage.clear());

test('recent boards are most-recent-first without duplicates and capped', () => {
  for (let i = 0; i < 12; i += 1) rememberBoard({ id: `b${i}`, name: `Board ${i}` });
  rememberBoard({ id: 'b5', name: 'Board 5' });
  const ids = getRecentBoards().map((b) => b.id);
  expect(ids[0]).toBe('b5');
  expect(ids).toHaveLength(10);
  expect(new Set(ids).size).toBe(ids.length);
});

test('starring toggles a board on and off', () => {
  toggleStarredBoard({ id: 'b1', name: 'One' });
  expect(isBoardStarred('b1')).toBe(true);
  toggleStarredBoard({ id: 'b1', name: 'One' });
  expect(isBoardStarred('b1')).toBe(false);
  expect(getStarredBoards()).toEqual([]);
});

test('returns board metadata immediately from navigation cache', () => {
  rememberBoard({ id: 'b1', name: 'My Software Team', features: 'board,backlog', avatarUrl: '/avatar.png' });
  expect(getCachedBoard('b1')).toEqual(expect.objectContaining({
    id: 'b1',
    name: 'My Software Team',
    features: 'board,backlog',
    avatarUrl: '/avatar.png',
  }));
  expect(getCachedBoard('missing')).toBeNull();
});

test('viewed issues keep the latest view first and ignore items without id', () => {
  rememberIssue({ id: 'q1', title: 'A' });
  rememberIssue({ id: 'q2', title: 'B' });
  rememberIssue({ id: 'q1', title: 'A' });
  rememberIssue({ title: 'no id' });
  expect(getViewedIssues().map((x) => x.id)).toEqual(['q1', 'q2']);
});

test('corrupted storage falls back to an empty list', () => {
  window.localStorage.setItem('canban.nav.recentBoards', '{oops');
  expect(getRecentBoards()).toEqual([]);
});
