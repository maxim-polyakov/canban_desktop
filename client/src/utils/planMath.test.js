import {
  addDays, buildRows, capacityTable, computeRanges, dependencyConflicts, fromApiDate, moveRange, toApiDate, visibleRows,
} from './planMath.js';

const d = (s) => fromApiDate(s);

describe('planMath', () => {
  test('date-only values round-trip without timezone drift', () => {
    expect(toApiDate(d('2026-03-05T00:00:00Z'))).toBe('2026-03-05T00:00:00Z');
    expect(d('2026-03-05T00:00:00Z').getDate()).toBe(5);
  });

  test('ranges use own dates, estimate from due date and roll up epics', () => {
    const ranges = computeRanges([
      { id: 'e', issueType: 0 },
      { id: 'a', parentId: 'e', startDate: '2026-01-05', dueDate: '2026-01-09' },
      { id: 'b', parentId: 'e', dueDate: '2026-01-20' },
      { id: 'c' },
    ]);
    expect(ranges.get('a')).toMatchObject({ start: d('2026-01-05'), end: d('2026-01-09') });
    expect(ranges.get('b')).toMatchObject({ start: d('2026-01-14'), end: d('2026-01-20'), estimated: true });
    expect(ranges.get('e')).toMatchObject({ start: d('2026-01-05'), end: d('2026-01-20'), rollup: true });
    expect(ranges.get('c')).toBeNull();
  });

  test('rows nest children under epics and group by space', () => {
    const items = [
      { id: 'e', issueType: 0, issueKey: 'A-1', boardId: 'x' },
      { id: 't', issueType: 2, issueKey: 'A-2', parentId: 'e', boardId: 'x' },
      { id: 'o', issueType: 2, issueKey: 'B-1', boardId: 'y' },
    ];
    const rows = buildRows(items, 'space', (k) => k);
    expect(rows.map((r) => (r.type === 'group' ? `g:${r.key}` : `${r.item.id}@${r.depth}`))).toEqual(['g:x', 'e@0', 't@1', 'g:y', 'o@0']);
    expect(visibleRows(rows, new Set(['e'])).map((r) => r.item?.id || r.key)).toEqual(['x', 'e', 'y', 'o']);
  });

  test('capacity buckets open items by bar end', () => {
    const items = [
      { id: '1', planTeamId: 't', storyPoints: 5, dueDate: '2026-01-07', statusCategory: 'todo' },
      { id: '2', planTeamId: 't', storyPoints: 8, dueDate: '2026-01-16', statusCategory: 'progress' },
      { id: '3', planTeamId: 't', storyPoints: 3, dueDate: '2026-01-07', statusCategory: 'done' },
    ];
    const [row] = capacityTable(items, computeRanges(items), [{ id: 't', capacity: 10, iterationDays: 14 }], d('2026-01-05'), 2);
    expect(row.slots.map((s) => s.points)).toEqual([13, 0]);
  });

  test('conflicts and drag math', () => {
    const ranges = new Map([['a', { start: d('2026-01-01'), end: d('2026-01-10') }], ['b', { start: d('2026-01-08'), end: d('2026-01-12') }]]);
    expect([...dependencyConflicts([{ id: 'l', blockerId: 'a', blockedId: 'b' }], ranges)]).toEqual(['l']);
    const range = { start: d('2026-01-01'), end: d('2026-01-05') };
    expect(moveRange(range, 'move', 3)).toEqual({ start: addDays(range.start, 3), end: addDays(range.end, 3) });
    expect(moveRange(range, 'start', 10).start).toEqual(range.end);
  });
});
