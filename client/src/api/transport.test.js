import { responseErrorMessage } from './transport.js';

test('uses error field from JSON body', () => {
  expect(responseErrorMessage(400, '{"error":"Transition is not allowed by workflow"}')).toBe('Transition is not allowed by workflow');
});

test('uses ProblemDetails title and plain text bodies', () => {
  expect(responseErrorMessage(400, '{"title":"One or more validation errors occurred."}')).toBe('One or more validation errors occurred.');
  expect(responseErrorMessage(400, 'Board not found')).toBe('Board not found');
});

test('falls back to a readable message for empty bodies', () => {
  expect(responseErrorMessage(403, '')).toBe('Недостаточно прав для этого действия.');
  expect(responseErrorMessage(502, '')).toBe('Ошибка сервера. Попробуйте позже.');
});
