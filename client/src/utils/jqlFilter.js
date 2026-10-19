// Lightweight, client-side JQL-like query parser for the board search box.
// Supports: assignee:me, priority:high, type:bug, label:foo, sprint:active
// plus any remaining free text (matched against issue key/title).
//
// Kept framework-free (no React/DOM) so it is cheap to unit test.

export const TYPE_ALIASES = {
  epic: 0,
  story: 1,
  task: 2,
  bug: 3,
  subtask: 4,
  'sub-task': 4,
};

export const PRIORITY_ALIASES = {
  highest: 4,
  high: 3,
  medium: 2,
  normal: 2,
  low: 1,
  lowest: 0,
};

// key:value or key:"quoted value" / key:'quoted value'
const TOKEN_PATTERN = /(\w+):("[^"]*"|'[^']*'|\S+)/g;

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parses a raw query string into structured tokens and leftover free text.
 * Unknown/invalid key:value tokens are dropped from the structured result
 * but still stripped out of the free-text remainder (so e.g. "foo:bar widget"
 * only searches for "widget").
 *
 * @returns {{ text: string, assignee: string|null, priority: number|null,
 *   issueType: number|null, label: string|null, sprint: string|null }}
 */
export function parseIssueQuery(raw) {
  const query = String(raw || '');
  const tokens = [];
  let match;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(query)) !== null) {
    tokens.push({ key: match[1].toLowerCase(), value: unquote(match[2]) });
  }
  const text = query.replace(TOKEN_PATTERN, ' ').replace(/\s+/g, ' ').trim();

  const result = { text, assignee: null, priority: null, issueType: null, label: null, sprint: null };

  tokens.forEach(({ key, value }) => {
    const v = value.trim();
    if (!v) return;
    const lower = v.toLowerCase();
    switch (key) {
      case 'assignee':
        result.assignee = lower === 'me' ? 'me' : v;
        break;
      case 'priority':
        if (lower in PRIORITY_ALIASES) result.priority = PRIORITY_ALIASES[lower];
        else if (/^[0-4]$/.test(v)) result.priority = Number(v);
        break;
      case 'type':
        if (lower in TYPE_ALIASES) result.issueType = TYPE_ALIASES[lower];
        else if (/^[0-4]$/.test(v)) result.issueType = Number(v);
        break;
      case 'label':
        result.label = v;
        break;
      case 'sprint':
        result.sprint = lower === 'active' ? 'active' : v;
        break;
      default:
        break;
    }
  });

  return result;
}

/** Sentinel returned when a token was given but nothing matched (should yield zero results). */
export const NO_MATCH = '__jql_no_match__';

/**
 * Resolves an `assignee:` token to a concrete userId.
 * - "me" resolves to the current user's id.
 * - otherwise matches team members by displayName/email (exact, then substring).
 * Returns null when no assignee token was present, or NO_MATCH when the token
 * didn't resolve to any known member.
 */
export function resolveAssigneeId(assigneeToken, { currentUserId, members } = {}) {
  if (!assigneeToken) return null;
  if (assigneeToken === 'me') return currentUserId || NO_MATCH;
  const needle = assigneeToken.toLowerCase();
  const list = Array.isArray(members) ? members : [];
  const exact = list.find(
    (m) => m.displayName?.toLowerCase() === needle || m.email?.toLowerCase() === needle
  );
  if (exact) return exact.userId;
  const partial = list.find(
    (m) => m.displayName?.toLowerCase().includes(needle) || m.email?.toLowerCase().includes(needle)
  );
  return partial ? partial.userId : NO_MATCH;
}

/**
 * Resolves a `sprint:` token to a concrete sprintId.
 * - "active" resolves to the board's currently active sprint (status === 1).
 * - otherwise matches sprint names (exact, then substring).
 * Returns null when no sprint token was present, or NO_MATCH when nothing matched.
 */
export function resolveSprintId(sprintToken, { sprints } = {}) {
  if (!sprintToken) return null;
  const list = Array.isArray(sprints) ? sprints : [];
  if (sprintToken === 'active') {
    const active = list.find((s) => s.status === 1);
    return active ? active.id : NO_MATCH;
  }
  const needle = sprintToken.toLowerCase();
  const exact = list.find((s) => s.name?.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = list.find((s) => s.name?.toLowerCase().includes(needle));
  return partial ? partial.id : NO_MATCH;
}

/**
 * Builds a predicate `(quest) => boolean` from a raw query string plus
 * resolver context (current user, team members, board sprints) and optional
 * dropdown-selected fallback filters (used when the query doesn't specify a token).
 */
export function buildQuestFilter(raw, { currentUserId, members, sprints, fallback } = {}) {
  const parsed = parseIssueQuery(raw);
  const fallbackFilters = fallback || {};

  const assigneeId = parsed.assignee
    ? resolveAssigneeId(parsed.assignee, { currentUserId, members })
    : (fallbackFilters.assigneeId || null);
  const sprintId = parsed.sprint
    ? resolveSprintId(parsed.sprint, { sprints })
    : (fallbackFilters.sprintId || null);
  const issueType = parsed.issueType != null
    ? parsed.issueType
    : (fallbackFilters.issueType != null && fallbackFilters.issueType !== '' ? Number(fallbackFilters.issueType) : null);
  const priority = parsed.priority != null
    ? parsed.priority
    : (fallbackFilters.priority != null && fallbackFilters.priority !== '' ? Number(fallbackFilters.priority) : null);
  const label = parsed.label || fallbackFilters.label || '';
  const text = parsed.text || '';

  return (quest) => {
    if (text) {
      const needle = text.toLowerCase();
      const haystack = `${quest.issueKey ?? ''} ${quest.title ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (assigneeId) {
      if (assigneeId === NO_MATCH) return false;
      if (!(quest.assigneeIds ?? []).includes(assigneeId)) return false;
    }
    if (issueType != null && Number(quest.issueType) !== issueType) return false;
    if (priority != null && Number(quest.priority) !== priority) return false;
    if (label) {
      const needle = label.toLowerCase();
      const labels = String(quest.labels || '').toLowerCase().split(',').map((l) => l.trim());
      if (!labels.some((l) => l.includes(needle))) return false;
    }
    if (sprintId) {
      if (sprintId === NO_MATCH) return false;
      if (quest.sprintId !== sprintId) return false;
    }
    return true;
  };
}
