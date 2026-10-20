import { issueCountLabel, matchesBacklogQuery, pointsByCategory, statusCategory } from './BacklogPage.jsx';

const t = (text, params) => String(text).replace(/\$\{(\w+)\}/g, (_, key) => String(params?.[key] ?? ''));

test('counts issues in Jira sprint headers', () => {
  expect(issueCountLabel(1, t)).toBe('1 задача');
  expect(issueCountLabel(2, t)).toBe('2 задачи');
  expect(issueCountLabel(0, t)).toBe('0 задач');
  expect(issueCountLabel(12, t)).toBe('12 задач');
});

test('sums story points per status category', () => {
  const kinds = { a: 0, b: 1, c: 2, d: 3, e: 4 };
  const list = [
    { columnId: 'a', storyPoints: 3 }, { columnId: 'b', storyPoints: 5 }, { columnId: 'c', storyPoints: 1 },
    { columnId: 'd', storyPoints: 8 }, { columnId: 'e', storyPoints: null },
  ];
  expect(pointsByCategory(list, (q) => kinds[q.columnId])).toEqual({ todo: 3, progress: 6, done: 8 });
  expect(statusCategory(undefined)).toBe('todo');
});

test('searches the backlog by summary and key', () => {
  const quest = { title: 'Молибден + отжиг', issueKey: 'SCRUM-4' };
  expect(matchesBacklogQuery(quest, '')).toBe(true);
  expect(matchesBacklogQuery(quest, 'отжиг')).toBe(true);
  expect(matchesBacklogQuery(quest, 'scrum-4')).toBe(true);
  expect(matchesBacklogQuery(quest, 'SCRUM-5')).toBe(false);
});
