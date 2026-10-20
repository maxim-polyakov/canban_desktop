import {
  buildBoardColumns, draftFromLayout, draftProblem, draftToRequest, isScrumBoard, moveStatus, resolveLayoutDrop, shiftStatus,
} from './boardColumnLayout.js';

const statuses = [
  { id: 's1', title: 'To Do', kind: 0, quests: [{ id: 'q1', columnId: 's1' }] },
  { id: 's2', title: 'In Progress', kind: 1, quests: [{ id: 'q2', columnId: 's2' }] },
  { id: 's3', title: 'In Review', kind: 2, quests: [{ id: 'q3', columnId: 's3' }, { id: 'q4', columnId: 's3' }] },
  { id: 's4', title: 'Done', kind: 3, quests: [] },
];
const layout = {
  configured: true,
  columns: [
    { id: 'c1', name: 'Todo', statusIds: ['s1'] },
    { id: 'c2', name: 'Work', statusIds: ['s2', 's3'] },
  ],
  hidden: ['s4'],
  statuses,
};

test('without a layout statuses are the columns', () => {
  expect(buildBoardColumns(statuses, { configured: false })).toBe(statuses);
});

test('a layout column merges quests of its statuses and labels them', () => {
  const columns = buildBoardColumns(statuses, layout);
  expect(columns.map((c) => c.title)).toEqual(['Todo', 'Work']);
  expect(columns[1].quests.map((q) => q.id)).toEqual(['q2', 'q3', 'q4']);
  expect(columns[1].quests[1].statusLabel).toBe('In Review');
  expect(columns[0].quests[0].statusLabel).toBeUndefined();
  expect(columns[1].createColumnId).toBe('s2');
});

test('drops keep the status inside the column or take the first allowed one', () => {
  const columns = buildBoardColumns(statuses, layout);
  expect(resolveLayoutDrop(columns, statuses, 'q4', 'c2', 0)).toEqual({ statusId: 's3', order: 0 });
  expect(resolveLayoutDrop(columns, statuses, 'q4', 'c2', 3)).toEqual({ statusId: 's3', order: 1 });
  expect(resolveLayoutDrop(columns, statuses, 'q1', 'c2', 0)).toEqual({ statusId: 's2', order: 0 });
  expect(resolveLayoutDrop(columns, statuses, 'q1', 'c2', 3, (id) => id === 's3')).toEqual({ statusId: 's3', order: 2 });
});

test('statuses move between columns and the hidden lane', () => {
  let draft = draftFromLayout(layout);
  draft = shiftStatus(draft, 's1', -1);
  expect(draft.hidden).toEqual(['s4', 's1']);
  expect(draftProblem(draft)).toBe('Столбцы должны иметь хотя бы по одному статусу');
  draft = shiftStatus(draft, 's4', 1);
  expect(draft.columns[0].statusIds).toEqual(['s4']);
  draft = moveStatus(draft, 's3', null);
  expect(draft.columns[1].statusIds).toEqual(['s2']);
  expect(draftProblem(draft)).toBe('');
});

test('request sends new columns without ids and new statuses by key', () => {
  const draft = {
    columns: [{ id: 'c1', name: 'A', statusIds: ['s1'] }, { id: 'new-x', name: 'B', statusIds: ['status-1'] }],
    hidden: [],
    newStatuses: [{ id: 'status-1', title: 'QA', kind: 1 }],
  };
  expect(draftToRequest(draft)).toEqual({
    columns: [{ id: 'c1', name: 'A', statusIds: ['s1'] }, { id: null, name: 'B', statusIds: ['status-1'] }],
    newStatuses: [{ key: 'status-1', name: 'QA', kind: 1 }],
  });
});

test('scrum boards need the backlog feature', () => {
  expect(isScrumBoard({ template: 'scrum', features: 'board,backlog' })).toBe(true);
  expect(isScrumBoard({ template: 'scrum', features: 'board' })).toBe(false);
  expect(isScrumBoard({ template: 'kanban', features: '' })).toBe(false);
});
