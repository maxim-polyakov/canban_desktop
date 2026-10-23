import { isBoardViewReady, loadActiveSprintIssues, moveActiveSprintQuest } from './BoardPage.jsx';

test('does not render data left from the previously opened template', () => {
  expect(isBoardViewReady('new-board', 'old-board', true, 'new-board')).toBe(false);
  expect(isBoardViewReady('new-board', 'new-board', true, 'old-board')).toBe(false);
  expect(isBoardViewReady('new-board', 'new-board', false, 'new-board')).toBe(false);
});

test('renders any template only after its board and sprint state are current', () => {
  ['kanban', 'scrum', 'bugs', 'project-management', 'recruitment'].forEach((template) => {
    const boardId = `${template}-board`;
    expect(isBoardViewReady(boardId, boardId, true, boardId)).toBe(true);
  });
});

test('moves an active sprint issue optimistically between board columns', () => {
  const issues = [
    { id: 'a', columnId: 'todo' },
    { id: 'b', columnId: 'doing' },
    { id: 'c', columnId: 'doing' },
  ];

  const moved = moveActiveSprintQuest(issues, 'a', 'doing', 1);

  expect(moved.filter((issue) => issue.columnId === 'doing').map((issue) => issue.id))
    .toEqual(['b', 'a', 'c']);
  expect(issues[0].columnId).toBe('todo');
});

test('loads active sprint issues with an explicit server-side sprint filter', async () => {
  const filter = jest.fn()
    .mockResolvedValueOnce([{ id: 'a', sprintId: 'active' }])
    .mockResolvedValueOnce([{ id: 'a', sprintId: 'active' }, { id: 'b', sprintId: 'active-2' }]);

  const issues = await loadActiveSprintIssues('board', [
    { id: 'future', status: 0 },
    { id: 'active', status: 1 },
    { id: 'active-2', status: 1 },
  ], filter);

  expect(filter.mock.calls).toEqual([
    ['board', { sprintId: 'active' }],
    ['board', { sprintId: 'active-2' }],
  ]);
  expect(issues.map((issue) => issue.id)).toEqual(['a', 'b']);
});
