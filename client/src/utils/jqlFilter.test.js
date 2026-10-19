import {
  parseIssueQuery,
  resolveAssigneeId,
  resolveSprintId,
  buildQuestFilter,
  NO_MATCH,
} from './jqlFilter.js';

describe('parseIssueQuery', () => {
  test('parses a single token with no leftover text', () => {
    expect(parseIssueQuery('assignee:me')).toEqual({
      text: '', assignee: 'me', priority: null, issueType: null, label: null, sprint: null,
    });
  });

  test('parses multiple tokens plus free text in any order', () => {
    const result = parseIssueQuery('priority:high login bug type:bug fix');
    expect(result.priority).toBe(3);
    expect(result.issueType).toBe(3);
    expect(result.text).toBe('login bug fix');
  });

  test('maps priority aliases to numeric values', () => {
    expect(parseIssueQuery('priority:highest').priority).toBe(4);
    expect(parseIssueQuery('priority:low').priority).toBe(1);
    expect(parseIssueQuery('priority:lowest').priority).toBe(0);
    expect(parseIssueQuery('priority:2').priority).toBe(2);
  });

  test('maps issue type aliases to numeric values', () => {
    expect(parseIssueQuery('type:epic').issueType).toBe(0);
    expect(parseIssueQuery('type:story').issueType).toBe(1);
    expect(parseIssueQuery('type:subtask').issueType).toBe(4);
  });

  test('parses label and sprint tokens', () => {
    expect(parseIssueQuery('label:foo').label).toBe('foo');
    expect(parseIssueQuery('sprint:active').sprint).toBe('active');
    expect(parseIssueQuery('sprint:"Sprint 1"').sprint).toBe('Sprint 1');
  });

  test('ignores unknown keys but strips them from free text', () => {
    const result = parseIssueQuery('foo:bar widget');
    expect(result.text).toBe('widget');
    expect(result.label).toBeNull();
  });

  test('treats plain text with no tokens as a free-text search', () => {
    expect(parseIssueQuery('fix login bug')).toEqual({
      text: 'fix login bug', assignee: null, priority: null, issueType: null, label: null, sprint: null,
    });
  });

  test('handles empty/undefined input gracefully', () => {
    expect(parseIssueQuery('').text).toBe('');
    expect(parseIssueQuery(undefined).text).toBe('');
  });
});

describe('resolveAssigneeId', () => {
  const members = [
    { userId: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com' },
    { userId: 'u2', displayName: 'Grace Hopper', email: 'grace@example.com' },
  ];

  test('resolves "me" to the current user id', () => {
    expect(resolveAssigneeId('me', { currentUserId: 'u1', members })).toBe('u1');
  });

  test('returns NO_MATCH for "me" without a current user', () => {
    expect(resolveAssigneeId('me', { members })).toBe(NO_MATCH);
  });

  test('matches a member by exact display name (case-insensitive)', () => {
    expect(resolveAssigneeId('grace hopper', { members })).toBe('u2');
  });

  test('matches a member by email substring', () => {
    expect(resolveAssigneeId('ada@', { members })).toBe('u1');
  });

  test('returns NO_MATCH when nothing matches', () => {
    expect(resolveAssigneeId('nobody', { members })).toBe(NO_MATCH);
  });

  test('returns null when no token was given', () => {
    expect(resolveAssigneeId(null, { members })).toBeNull();
  });
});

describe('resolveSprintId', () => {
  const sprints = [
    { id: 's1', name: 'Sprint 1', status: 2 },
    { id: 's2', name: 'Sprint 2', status: 1 },
  ];

  test('resolves "active" to the sprint with status 1', () => {
    expect(resolveSprintId('active', { sprints })).toBe('s2');
  });

  test('returns NO_MATCH when there is no active sprint', () => {
    expect(resolveSprintId('active', { sprints: [{ id: 's1', status: 0 }] })).toBe(NO_MATCH);
  });

  test('matches a sprint by name', () => {
    expect(resolveSprintId('Sprint 1', { sprints })).toBe('s1');
  });

  test('returns null when no token was given', () => {
    expect(resolveSprintId(undefined, { sprints })).toBeNull();
  });
});

describe('buildQuestFilter', () => {
  const members = [{ userId: 'u1', displayName: 'Ada Lovelace', email: 'ada@example.com' }];
  const sprints = [{ id: 's1', name: 'Sprint 1', status: 1 }];

  test('filters by assignee:me', () => {
    const filter = buildQuestFilter('assignee:me', { currentUserId: 'u1', members, sprints });
    expect(filter({ assigneeIds: ['u1'] })).toBe(true);
    expect(filter({ assigneeIds: ['u2'] })).toBe(false);
  });

  test('filters by priority and type together', () => {
    const filter = buildQuestFilter('priority:high type:bug', { members, sprints });
    expect(filter({ priority: 3, issueType: 3 })).toBe(true);
    expect(filter({ priority: 2, issueType: 3 })).toBe(false);
    expect(filter({ priority: 3, issueType: 2 })).toBe(false);
  });

  test('filters by label substring', () => {
    const filter = buildQuestFilter('label:foo', {});
    expect(filter({ labels: 'foo, bar' })).toBe(true);
    expect(filter({ labels: 'baz' })).toBe(false);
  });

  test('filters by sprint:active', () => {
    const filter = buildQuestFilter('sprint:active', { sprints });
    expect(filter({ sprintId: 's1' })).toBe(true);
    expect(filter({ sprintId: 's2' })).toBe(false);
  });

  test('falls back to free text search over key and title', () => {
    const filter = buildQuestFilter('login', {});
    expect(filter({ issueKey: 'KAN-1', title: 'Fix login bug' })).toBe(true);
    expect(filter({ issueKey: 'KAN-2', title: 'Unrelated' })).toBe(false);
  });

  test('uses dropdown fallback filters when the query has no matching token', () => {
    const filter = buildQuestFilter('', { fallback: { assigneeId: 'u1', priority: '3', issueType: '2' } });
    expect(filter({ assigneeIds: ['u1'], priority: 3, issueType: 2 })).toBe(true);
    expect(filter({ assigneeIds: ['u2'], priority: 3, issueType: 2 })).toBe(false);
  });

  test('an unmatched assignee token yields zero matches regardless of fallback', () => {
    const filter = buildQuestFilter('assignee:ghost', { members, fallback: { assigneeId: 'u1' } });
    expect(filter({ assigneeIds: ['u1'] })).toBe(false);
  });
});
