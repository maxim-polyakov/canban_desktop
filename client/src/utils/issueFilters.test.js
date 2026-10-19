import { buildJql, DEFAULT_FILTERS, defaultFilterJql, emptyCriteria, parseBasicJql, viewedIssuesJql } from './issueFilters.js';

describe('issueFilters', () => {
  it('parses every default filter into basic criteria', () => {
    DEFAULT_FILTERS.forEach((filter) => {
      const jql = defaultFilterJql(filter, [{ issueKey: 'KAN-1' }]);
      const criteria = parseBasicJql(jql);
      expect(criteria).not.toBeNull();
      expect(buildJql(criteria)).toBe(jql);
    });
  });

  it('round-trips combined criteria', () => {
    const criteria = {
      ...emptyCriteria(),
      text: 'say "hi", AND go',
      spaces: ['KAN', 'OPS'],
      assignees: ['currentUser', 'empty'],
      types: ['Bug'],
      statuses: ['new', 'indeterminate'],
      resolution: 'unresolved',
      created: '-2w',
      order: 'created DESC',
    };
    const jql = buildJql(criteria);
    expect(jql).toBe('text ~ "say \\"hi\\", AND go" AND project in (KAN, OPS) AND (assignee = currentUser() OR assignee IS EMPTY) AND type = Bug AND statusCategory in ("To Do", "In Progress") AND resolution = Unresolved AND created >= -2w ORDER BY created DESC');
    expect(parseBasicJql(jql)).toEqual(criteria);
  });

  it('returns null for queries the basic editor cannot show', () => {
    expect(parseBasicJql('priority = High OR type = Bug')).toBeNull();
    expect(parseBasicJql('labels ~ api')).toBeNull();
  });

  it('builds a never-matching key list when nothing was viewed', () => {
    expect(viewedIssuesJql([])).toBe('key in (__none__) ORDER BY updated DESC');
    expect(parseBasicJql(viewedIssuesJql([])).keys).toEqual([]);
  });
});
