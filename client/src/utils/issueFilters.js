export const NO_MATCH_KEY = '__none__';

export const STATUS_CATEGORIES = [
  { id: 'new', jql: 'To Do', label: 'К выполнению' },
  { id: 'indeterminate', jql: 'In Progress', label: 'В работе' },
  { id: 'done', jql: 'Done', label: 'Готово' },
];

export const ISSUE_TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Subtask'];

export const RELATIVE_PERIODS = [
  { id: '-1d', label: 'За последний 1 день' },
  { id: '-1w', label: 'За последнюю 1 неделю' },
  { id: '-2w', label: 'За последние 2 недели' },
  { id: '-4w', label: 'За последние 4 недели' },
];

export const DEFAULT_FILTERS = [
  { id: '-1', name: 'Мои открытые задачи', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC' },
  { id: '-2', name: 'Сообщено мной', jql: 'reporter = currentUser() ORDER BY created DESC' },
  { id: '-4', name: 'Все задачи', jql: 'ORDER BY created DESC' },
  { id: '-5', name: 'Открытые задачи', jql: 'resolution = Unresolved ORDER BY priority DESC, updated DESC' },
  { id: '-9', name: 'Завершенные задачи', jql: 'statusCategory = Done ORDER BY updated DESC' },
  { id: '-3', name: 'Недавно просмотренные', viewed: true },
  { id: '-6', name: 'Недавно созданные', jql: 'created >= -1w ORDER BY created DESC' },
  { id: '-7', name: 'Недавно решенные', jql: 'resolved >= -1w ORDER BY updated DESC' },
  { id: '-8', name: 'Недавно обновленные', jql: 'updated >= -1w ORDER BY updated DESC' },
];

export const getDefaultFilter = (id) => DEFAULT_FILTERS.find((f) => f.id === String(id));

export function viewedIssuesJql(viewedIssues) {
  const keys = (viewedIssues || []).map((x) => x.issueKey).filter(Boolean).slice(0, 50);
  return `key in (${(keys.length ? keys : [NO_MATCH_KEY]).map(quoteIfNeeded).join(', ')}) ORDER BY updated DESC`;
}

export function defaultFilterJql(filter, viewedIssues) {
  if (!filter) return '';
  return filter.viewed ? viewedIssuesJql(viewedIssues) : filter.jql;
}

export const emptyCriteria = () => ({
  text: '', spaces: [], assignees: [], types: [], statuses: [],
  resolution: '', reporter: '', voter: '', watcher: '', created: '', resolved: '', updated: '', keys: null, order: '',
});

const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
function quoteIfNeeded(value) {
  return /^[\w.-]+$/.test(String(value)) ? String(value) : quote(value);
}
const list = (field, values) => (values.length === 1 ? `${field} = ${quoteIfNeeded(values[0])}` : `${field} in (${values.map(quoteIfNeeded).join(', ')})`);

function assigneeClause(value) {
  if (value === 'currentUser') return 'assignee = currentUser()';
  if (value === 'empty') return 'assignee IS EMPTY';
  return `assignee = ${quoteIfNeeded(value)}`;
}

export function buildJql(criteria) {
  const c = { ...emptyCriteria(), ...criteria };
  const clauses = [];
  if (c.text.trim()) clauses.push(`text ~ ${quote(c.text.trim())}`);
  if (c.spaces.length) clauses.push(list('project', c.spaces));
  if (c.assignees.length) {
    const parts = c.assignees.map(assigneeClause);
    clauses.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`);
  }
  if (c.types.length) clauses.push(list('type', c.types));
  if (c.statuses.length) {
    const names = c.statuses.map((id) => STATUS_CATEGORIES.find((s) => s.id === id)?.jql).filter(Boolean);
    if (names.length) clauses.push(list('statusCategory', names));
  }
  if (c.resolution === 'unresolved') clauses.push('resolution = Unresolved');
  if (c.reporter === 'currentUser') clauses.push('reporter = currentUser()');
  if (c.voter === 'currentUser') clauses.push('voter = currentUser()');
  if (c.watcher === 'currentUser') clauses.push('watcher = currentUser()');
  ['created', 'resolved', 'updated'].forEach((field) => { if (c[field]) clauses.push(`${field} >= ${c[field]}`); });
  if (Array.isArray(c.keys)) clauses.push(`key in (${(c.keys.length ? c.keys : [NO_MATCH_KEY]).map(quoteIfNeeded).join(', ')})`);
  const where = clauses.join(' AND ');
  const order = c.order.trim() ? `ORDER BY ${c.order.trim()}` : '';
  return [where, order].filter(Boolean).join(' ');
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let inQuote = null;
  let start = 0;
  const pattern = new RegExp(`^\\s+${separator}\\s+`, 'i');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '\\') i += 1;
      else if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0) {
      const match = pattern.exec(text.slice(i));
      if (match) {
        parts.push(text.slice(start, i).trim());
        i += match[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

function splitList(text) {
  const parts = [];
  let current = '';
  let inQuote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < text.length) { i += 1; current += text[i]; } else if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") { inQuote = ch; current += ch; } else if (ch === ',') { parts.push(current.trim()); current = ''; } else current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1).replace(/\\(.)/g, '$1');
  return v;
}

function parseValues(clause, field) {
  const inMatch = new RegExp(`^${field}\\s+in\\s*\\((.*)\\)$`, 'i').exec(clause);
  if (inMatch) return splitList(inMatch[1]).map(unquote);
  const eqMatch = new RegExp(`^${field}\\s*=\\s*(.+)$`, 'i').exec(clause);
  return eqMatch ? [unquote(eqMatch[1])] : null;
}

/** Parses JQL produced by buildJql back into criteria; returns null when the query needs the JQL editor. */
export function parseBasicJql(jql) {
  const criteria = emptyCriteria();
  const text = (jql || '').trim();
  const orderMatch = /(?:^|\s)ORDER\s+BY\s+(.+)$/i.exec(text);
  if (orderMatch) criteria.order = orderMatch[1].trim();
  const where = orderMatch ? text.slice(0, orderMatch.index).trim() : text;
  if (!where) return criteria;
  for (const raw of splitTopLevel(where, 'AND')) {
    const clause = raw.trim();
    let m;
    if ((m = /^text\s*~\s*(".*"|'.*')$/i.exec(clause))) { criteria.text = unquote(m[1]); continue; }
    if (/^project\b/i.test(clause)) { const v = parseValues(clause, 'project'); if (!v) return null; criteria.spaces = v; continue; }
    if (/^\(?\s*assignee\b/i.test(clause)) {
      const inner = clause.startsWith('(') && clause.endsWith(')') ? clause.slice(1, -1) : clause;
      const values = [];
      for (const part of splitTopLevel(inner, 'OR')) {
        if (/^assignee\s*=\s*currentUser\(\)$/i.test(part)) values.push('currentUser');
        else if (/^assignee\s+IS\s+EMPTY$/i.test(part)) values.push('empty');
        else if ((m = /^assignee\s*=\s*(.+)$/i.exec(part))) values.push(unquote(m[1]));
        else return null;
      }
      criteria.assignees = values;
      continue;
    }
    if (/^(type|issuetype)\b/i.test(clause)) { const v = parseValues(clause, '(?:type|issuetype)'); if (!v) return null; criteria.types = v; continue; }
    if (/^statusCategory\b/i.test(clause)) {
      const v = parseValues(clause, 'statusCategory');
      if (!v) return null;
      const ids = v.map((name) => STATUS_CATEGORIES.find((s) => s.jql.toLowerCase() === name.toLowerCase())?.id);
      if (ids.some((id) => !id)) return null;
      criteria.statuses = ids;
      continue;
    }
    if (/^resolution\s*=\s*Unresolved$/i.test(clause)) { criteria.resolution = 'unresolved'; continue; }
    if (/^reporter\s*=\s*currentUser\(\)$/i.test(clause)) { criteria.reporter = 'currentUser'; continue; }
    if ((m = /^(voter|watcher)\s*=\s*currentUser\(\)$/i.exec(clause))) { criteria[m[1].toLowerCase()] = 'currentUser'; continue; }
    if ((m = /^(created|resolved|updated)\s*>=\s*(-\d+[mhdwMy])$/.exec(clause))) { criteria[m[1]] = m[2]; continue; }
    if (/^key\b/i.test(clause)) {
      const v = parseValues(clause, 'key');
      if (!v) return null;
      criteria.keys = v.filter((k) => k !== NO_MATCH_KEY);
      continue;
    }
    return null;
  }
  return criteria;
}

export function periodLabel(value) {
  return RELATIVE_PERIODS.find((p) => p.id === value)?.label || value;
}
