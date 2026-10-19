import {
  automations, bulk, components, dashboards, importExport, integrations, parseGadgets, questLinks, search, toBulkEditRequest, workflows,
} from './jira.js';

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

test('bulk edit sends boardId and flat DTO with explicit sprint clearing', async () => {
  expect(toBulkEditRequest(['a'], { sprintId: null })).toEqual({ questIds: ['a'], sprintId: null, sprintIdSet: true });
  expect(toBulkEditRequest(['a'], { columnId: 'c1', priority: 2 })).toEqual({ questIds: ['a'], columnId: 'c1', priority: 2 });
  await bulk.update('b1', ['a'], { columnId: 'c1' });
  expect(fetch.mock.calls[0][0]).toBe('/api/bulk/quests?boardId=b1');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ questIds: ['a'], columnId: 'c1' });
  await bulk.delete('b1', ['a']);
  expect(fetch.mock.calls[1][0]).toBe('/api/bulk/quests/delete?boardId=b1');
});

test('import passes target column and export returns raw text', async () => {
  await importExport.importBoard('b1', new Blob(['[]']), 'col1');
  expect(fetch.mock.calls[0][0]).toBe('/api/importExport/boards/b1/import?columnId=col1');
  fetch.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('key,title\n') });
  await expect(importExport.exportBoard('b1', 'csv')).resolves.toBe('key,title\n');
});

test('automation and integration routes are board scoped', async () => {
  await automations.run('b1', 'r1', ['KAN-1']);
  expect(fetch.mock.calls[0][0]).toBe('/api/automations/board/b1/r1/run');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ issueKeys: ['KAN-1'] });
  await automations.delete('b1', 'r1');
  expect(fetch.mock.calls[1][0]).toBe('/api/automations/board/b1/r1');
  await integrations.deleteGithub('b1', 'g1');
  expect(fetch.mock.calls[2][0]).toBe('/api/integrations/board/b1/github/g1');
  await integrations.syncDevelopment('q1');
  expect(fetch.mock.calls[3][0]).toBe('/api/integrations/github/quests/q1/sync');
});

test('dashboard gadgets are persisted in layoutJson', async () => {
  const dashboard = { id: 'd1', name: 'Main', shared: false, layoutJson: '[{"id":"g1","type":"velocity"}]' };
  expect(parseGadgets(dashboard)).toHaveLength(1);
  expect(parseGadgets({ layoutJson: 'broken' })).toEqual([]);
  await dashboards.deleteGadget(dashboard, 'g1');
  expect(fetch.mock.calls[0][0]).toBe('/api/dashboards/d1');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ name: 'Main', shared: false, layoutJson: '[]' });
});
