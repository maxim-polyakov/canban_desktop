import { apiJson, PLAN_REQUIRED_EVENT, responseErrorMessage } from './transport.js';

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

test('publishes a structured plan-required event for HTTP 402', async () => {
  const handler = jest.fn();
  const originalFetch = global.fetch;
  window.addEventListener(PLAN_REQUIRED_EVENT, handler);
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 402,
    statusText: 'Payment Required',
    text: () => Promise.resolve('{"error":"Нужен Premium","code":"plan_required","requiredPlan":"premium"}'),
  });
  await expect(apiJson('/api/assets/schemas')).rejects.toMatchObject({
    status: 402,
    code: 'plan_required',
    requiredPlan: 'premium',
  });
  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler.mock.calls[0][0].detail).toMatchObject({ requiredPlan: 'premium' });
  window.removeEventListener(PLAN_REQUIRED_EVENT, handler);
  global.fetch = originalFetch;
});
