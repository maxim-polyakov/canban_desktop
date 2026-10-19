import { moveQuestInColumns } from './boardMoves.js';

const columns = [
  { id: 'a', quests: [{ id: 'q1', columnId: 'a' }, { id: 'q2', columnId: 'a' }] },
  { id: 'b', quests: [{ id: 'q3', columnId: 'b' }] },
];

test('moves quest to another column at the requested position', () => {
  const result = moveQuestInColumns(columns, 'q1', 'b', 0);
  expect(result[0].quests.map((q) => q.id)).toEqual(['q2']);
  expect(result[1].quests.map((q) => q.id)).toEqual(['q1', 'q3']);
  expect(result[1].quests[0].columnId).toBe('b');
});

test('reorders inside the same column and clamps the position', () => {
  const result = moveQuestInColumns(columns, 'q1', 'a', 10);
  expect(result[0].quests.map((q) => q.id)).toEqual(['q2', 'q1']);
  expect(result[1]).toBe(columns[1]);
});

test('returns columns unchanged for unknown quest or column', () => {
  expect(moveQuestInColumns(columns, 'missing', 'b', 0)).toBe(columns);
  expect(moveQuestInColumns(columns, 'q1', 'missing', 0)).toBe(columns);
});
