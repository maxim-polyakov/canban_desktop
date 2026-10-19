import { dayBucket, groupByDay, timeAgo } from './timeAgo.js';

const now = new Date(2026, 9, 19, 12, 0, 0);

test('timeAgo formats hours and falls back for invalid dates', () => {
  expect(timeAgo(now.getTime() - 4 * 3600 * 1000, 'en', now.getTime())).toBe('4 hours ago');
  expect(timeAgo('nope', 'en', now.getTime())).toBe('');
});

test('dayBucket uses calendar days', () => {
  expect(dayBucket(new Date(2026, 9, 19, 0, 5), now)).toBe('Сегодня');
  expect(dayBucket(new Date(2026, 9, 18, 23, 0), now)).toBe('Вчера');
  expect(dayBucket(new Date(2026, 9, 14), now)).toBe('На этой неделе');
  expect(dayBucket(new Date(2026, 8, 30), now)).toBe('В этом месяце');
  expect(dayBucket(new Date(2026, 0, 1), now)).toBe('Ранее');
});

test('groupByDay keeps order and merges consecutive buckets', () => {
  const items = [new Date(2026, 9, 19, 11), new Date(2026, 9, 19, 9), new Date(2026, 9, 18, 9)];
  const groups = groupByDay(items, (x) => x, now);
  expect(groups.map((g) => [g.label, g.items.length])).toEqual([['Сегодня', 2], ['Вчера', 1]]);
});
