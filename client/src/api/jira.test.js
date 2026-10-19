import { components, questLinks, search, workflows } from './jira.js';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve('[]'),
  });
  localStorage.clear();
});

test('maps workflow transitions to the expected quest namespace', async () => {
  await workflows.getTransitions('q 1');
  expect(fetch.mock.calls[0][0]).toBe('/api/workflows/quests/q 1/transitions');
});

test('maps project components and serializes create payload', async () => {
  await components.create('b1', { name: 'API' });
  expect(fetch.mock.calls[0][0]).toBe('/api/components/board/b1');
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"name":"API"}' });
});

test('encodes search parameters and link deletion', async () => {
  await search.issues({ jql: 'status = "In Progress"', page: 2 });
  expect(fetch.mock.calls[0][0]).toContain('/api/search/issues?');
  expect(fetch.mock.calls[0][0]).toContain('page=2');
  await questLinks.delete('q1', 'l1');
  expect(fetch.mock.calls[1][0]).toBe('/api/quests/q1/links/l1');
  expect(fetch.mock.calls[1][1].method).toBe('DELETE');
});
