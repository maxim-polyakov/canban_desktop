import { isBoardViewReady } from './BoardPage.jsx';

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
