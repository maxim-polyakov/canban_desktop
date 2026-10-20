import { activeBoardFilterCount, buildLanes, matchesBoardFilters } from './boardLanes.js';

const quests = [
  { id: 'e1', title: 'Вход', issueKey: 'K-1', issueType: 0, isEpic: true, priority: 3, assigneeIds: [] },
  { id: 'a', title: 'A', issueType: 2, priority: 4, assigneeIds: ['u1'], parentEpicId: 'e1', labels: 'ui, api' },
  { id: 'b', title: 'B', issueType: 3, priority: 1, assigneeIds: [], labels: '' },
];
const columns = [{ id: 'todo', quests: [quests[0], quests[1]] }, { id: 'done', quests: [quests[2]] }];

test('quick filters combine people, unassigned, types, priorities and labels', () => {
  expect(matchesBoardFilters(quests[1], { assigneeIds: ['u1'] })).toBe(true);
  expect(matchesBoardFilters(quests[2], { assigneeIds: ['u1'] })).toBe(false);
  expect(matchesBoardFilters(quests[2], { assigneeIds: ['u1', 'none'] })).toBe(true);
  expect(matchesBoardFilters(quests[1], { types: ['3'] })).toBe(false);
  expect(matchesBoardFilters(quests[1], { priorities: [4], labels: ['api'] })).toBe(true);
  expect(activeBoardFilterCount({ types: ['2'], priorities: [1, 2], labels: [] })).toBe(3);
});

test('groups by assignee with unassigned last', () => {
  const lanes = buildLanes(columns, 'assignee', { members: [{ userId: 'u1', displayName: 'Анна' }] });
  expect(lanes.map((l) => [l.title, l.count])).toEqual([['Анна', 1], ['Не назначено', 2]]);
  expect(lanes[0].columns.map((c) => c.quests.map((q) => q.id))).toEqual([['a'], []]);
});

test('groups by epic and by priority', () => {
  expect(buildLanes(columns, 'epic').map((l) => l.title)).toEqual(['K-1 Вход', 'Задачи без эпика']);
  expect(buildLanes(columns, 'priority').map((l) => l.title)).toEqual(['Высший', 'Высокий', 'Низкий']);
  expect(buildLanes(columns, 'none')).toBeNull();
});
