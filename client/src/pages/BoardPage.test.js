import { isBoardViewReady, moveActiveSprintQuest } from './BoardPage.jsx';

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
