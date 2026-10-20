export const HOME_STATUSES = [
  ['on_track', 'По графику', 'is-success'],
  ['at_risk', 'В зоне риска', 'is-warning'],
  ['off_track', 'С отставанием от графика', 'is-danger'],
  ['pending', 'В ожидании', ''],
  ['paused', 'Приостановлено', 'is-paused'],
  ['done', 'Выполнено', 'is-info'],
  ['cancelled', 'Отменено', 'is-muted'],
];

export const statusMeta = (status) => HOME_STATUSES.find(([id]) => id === status) || HOME_STATUSES[3];

const statusRank = (status) => {
  const index = HOME_STATUSES.findIndex(([id]) => id === status);
  return index < 0 ? HOME_STATUSES.length : index;
};

export const HOME_COLUMNS = [
  ['status', 'Статус', true],
  ['targetDate', 'Срок', true],
  ['owner', 'Владелец', true],
  ['following', 'Отслеживаемые', true],
  ['lastUpdate', 'Последнее обновление', true],
  ['team', 'Команда', false],
  ['tags', 'Теги', false],
  ['progress', 'Прогресс', false],
];

export const defaultColumns = () => HOME_COLUMNS.filter(([, , on]) => on).map(([id]) => id);

/** Russian plural form: 1 проект, 2 проекта, 5 проектов. */
export function pluralRu(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const formatScore = (score) => (score == null ? '' : Number(score).toFixed(1));

const anyOf = (selected, values) => !selected?.length || values.some((v) => selected.includes(v));

export function filterItems(items, filters, { userId } = {}) {
  const needle = (filters.query || '').trim().toLowerCase();
  return items.filter((item) => {
    if (needle && !item.name.toLowerCase().includes(needle) && !(item.tags || []).some((tag) => tag.toLowerCase().includes(needle))) return false;
    if (filters.tags?.length && !(item.tags || []).some((tag) => filters.tags.some((f) => f.toLowerCase() === tag.toLowerCase()))) return false;
    if (filters.statuses?.length && !filters.statuses.includes(item.status)) return false;
    if (filters.goalIds?.length) {
      const related = item.kind === 'goal' ? (item.parentId ? [item.parentId] : []) : item.goalIds || [];
      if (!anyOf(filters.goalIds, related)) return false;
    }
    if (filters.teamIds?.length && !filters.teamIds.includes(item.team?.id)) return false;
    if (filters.ownerIds?.length && !filters.ownerIds.includes(item.owner?.id)) return false;
    if (filters.contributorIds?.length && !anyOf(filters.contributorIds, item.contributorIds || [])) return false;
    if (filters.followingOnly && !item.isFollowing) return false;
    if (filters.view === 'mine' && item.owner?.id !== userId && !item.isContributor) return false;
    if (filters.view === 'following' && !item.isFollowing) return false;
    if (filters.view === 'due' && !item.updateDue) return false;
    if (filters.view === 'done' && item.status !== 'done' && item.status !== 'cancelled') return false;
    return true;
  });
}

const sortValue = (item, key) => {
  switch (key) {
    case 'status': return statusRank(item.status);
    case 'targetDate': return item.targetDate ? new Date(item.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
    case 'owner': return (item.owner?.displayName || '').toLowerCase();
    case 'following': return -(item.followers || 0);
    case 'lastUpdate': return -(item.lastUpdateAt ? new Date(item.lastUpdateAt).getTime() : 0);
    case 'team': return (item.team?.name || '~').toLowerCase();
    case 'progress': return -(item.workTotal ? item.workDone / item.workTotal : -1);
    default: return item.name.toLowerCase();
  }
};

export function sortItems(items, { key = 'name', desc = false, followingFirst = false } = {}) {
  return [...items].sort((a, b) => {
    if (followingFirst && a.isFollowing !== b.isFollowing) return a.isFollowing ? -1 : 1;
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const cmp = va < vb ? -1 : va > vb ? 1 : a.name.localeCompare(b.name);
    return desc ? -cmp : cmp;
  });
}

/**
 * Hierarchy view. Goals nest under their parent goals; projects are grouped under the goals they contribute to
 * (a project contributing to several goals appears under each).
 */
export function buildTree(items, goals = []) {
  if (!items.length) return [];
  if (items[0].kind === 'goal') {
    const ids = new Set(items.map((i) => i.id));
    const children = new Map();
    items.forEach((item) => {
      const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    });
    const rows = [];
    const seen = new Set();
    const walk = (parent, depth) => (children.get(parent) || []).forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      rows.push({ type: 'item', item, depth, hasChildren: children.has(item.id) });
      walk(item.id, depth + 1);
    });
    walk(null, 0);
    return rows;
  }
  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const groups = new Map();
  const loose = [];
  items.forEach((item) => {
    const related = (item.goalIds || []).filter((id) => goalsById.has(id));
    if (!related.length) loose.push(item);
    related.forEach((id) => {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(item);
    });
  });
  const rows = [];
  [...groups.keys()]
    .sort((a, b) => goalsById.get(a).name.localeCompare(goalsById.get(b).name))
    .forEach((id) => {
      rows.push({ type: 'group', goal: goalsById.get(id), count: groups.get(id).length });
      groups.get(id).forEach((item) => rows.push({ type: 'item', item, depth: 1, key: `${id}:${item.id}` }));
    });
  if (loose.length) {
    rows.push({ type: 'group', goal: null, count: loose.length });
    loose.forEach((item) => rows.push({ type: 'item', item, depth: 1, key: `none:${item.id}` }));
  }
  return rows;
}

/** Monday-based week start, used to group the status update feed. */
export function weekStart(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function groupByWeek(entries, getDate) {
  const groups = [];
  entries.forEach((entry) => {
    const start = weekStart(getDate(entry)).getTime();
    const last = groups[groups.length - 1];
    if (last && last.start === start) last.entries.push(entry);
    else groups.push({ start, entries: [entry] });
  });
  return groups;
}
