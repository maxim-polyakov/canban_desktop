import { buildTree, filterItems, groupByWeek, pluralRu, sortItems } from './homeItems.js';

const item = (id, extra = {}) => ({ id, kind: 'project', name: id, tags: [], goalIds: [], contributorIds: [], status: 'pending', ...extra });

test('pluralRu picks the right Russian form', () => {
  const forms = ['проект', 'проекта', 'проектов'];
  expect([1, 2, 5, 11, 21, 23, 112].map((n) => pluralRu(n, forms))).toEqual(['проект', 'проекта', 'проектов', 'проектов', 'проект', 'проекта', 'проектов']);
});

test('filterItems combines search, chips and views', () => {
  const items = [
    item('Alpha', { tags: ['Q4'], status: 'on_track', owner: { id: 'u1' }, isFollowing: true, goalIds: ['g1'] }),
    item('Beta', { tags: ['mobile'], status: 'at_risk', owner: { id: 'u2' }, contributorIds: ['u1'], isContributor: true }),
    item('Gamma', { status: 'done', owner: { id: 'u2' }, updateDue: true }),
  ];
  const names = (filters) => filterItems(items, filters, { userId: 'u1' }).map((i) => i.name);
  expect(names({ query: 'q4' })).toEqual(['Alpha']);
  expect(names({ tags: ['MOBILE'] })).toEqual(['Beta']);
  expect(names({ statuses: ['on_track', 'done'] })).toEqual(['Alpha', 'Gamma']);
  expect(names({ goalIds: ['g1'] })).toEqual(['Alpha']);
  expect(names({ contributorIds: ['u1'] })).toEqual(['Beta']);
  expect(names({ view: 'mine' })).toEqual(['Alpha', 'Beta']);
  expect(names({ followingOnly: true })).toEqual(['Alpha']);
  expect(names({ view: 'due' })).toEqual(['Gamma']);
  expect(names({ view: 'done' })).toEqual(['Gamma']);
});

test('sortItems supports following-first and columns', () => {
  const items = [
    item('b', { targetDate: '2026-12-01', isFollowing: false }),
    item('a', { isFollowing: false }),
    item('c', { targetDate: '2026-11-01', isFollowing: true }),
  ];
  expect(sortItems(items).map((i) => i.name)).toEqual(['a', 'b', 'c']);
  expect(sortItems(items, { key: 'targetDate' }).map((i) => i.name)).toEqual(['c', 'b', 'a']);
  expect(sortItems(items, { followingFirst: true }).map((i) => i.name)).toEqual(['c', 'a', 'b']);
});

test('buildTree nests goals and groups projects by goal', () => {
  const goals = [
    { id: 'g1', kind: 'goal', name: 'Root', parentId: null },
    { id: 'g2', kind: 'goal', name: 'Child', parentId: 'g1' },
    { id: 'g3', kind: 'goal', name: 'Orphan', parentId: 'missing' },
  ];
  expect(buildTree(goals).map((r) => [r.item.id, r.depth])).toEqual([['g1', 0], ['g2', 1], ['g3', 0]]);
  const projects = [item('p1', { goalIds: ['g2', 'g1'] }), item('p2')];
  const rows = buildTree(projects, goals);
  expect(rows.map((r) => (r.type === 'group' ? `#${r.goal?.id ?? 'none'}` : r.item.id))).toEqual(['#g2', 'p1', '#g1', 'p1', '#none', 'p2']);
});

test('groupByWeek starts weeks on Monday', () => {
  const groups = groupByWeek(['2026-10-19T10:00:00', '2026-10-18T10:00:00', '2026-10-12T09:00:00'], (x) => x);
  expect(groups.map((g) => g.entries.length)).toEqual([1, 2]);
});
