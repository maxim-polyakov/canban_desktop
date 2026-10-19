export const DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_DURATION_DAYS = 7;

export function startOfDay(value) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(value, days) {
  const d = startOfDay(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

export function startOfWeek(value) {
  const d = startOfDay(value);
  return addDays(d, -((d.getDay() + 6) % 7));
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function toIsoDate(value) {
  const d = startOfDay(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date-only value sent to the server as UTC midnight, so it round-trips without timezone drift. */
export function toApiDate(value) {
  return `${toIsoDate(value)}T00:00:00Z`;
}

/** Reads a server date (UTC midnight for date-only values) as a local calendar day. */
export function fromApiDate(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return startOfDay(text);
}

/** Effective bar of an item: own dates, otherwise the span of its children, otherwise a default length before the due date. */
export function computeRanges(items) {
  const children = new Map();
  items.forEach((item) => {
    if (!item.parentId) return;
    if (!children.has(item.parentId)) children.set(item.parentId, []);
    children.get(item.parentId).push(item);
  });
  const ranges = new Map();
  const visiting = new Set();
  const resolve = (item) => {
    if (ranges.has(item.id)) return ranges.get(item.id);
    if (visiting.has(item.id)) return null;
    visiting.add(item.id);
    const start = fromApiDate(item.startDate);
    const due = fromApiDate(item.dueDate);
    let range = null;
    if (start && due) range = { start, end: due < start ? start : due, rollup: false };
    else if (start) range = { start, end: addDays(start, DEFAULT_DURATION_DAYS - 1), rollup: false, estimated: true };
    else if (due) range = { start: addDays(due, -(DEFAULT_DURATION_DAYS - 1)), end: due, rollup: false, estimated: true };
    if (!range || (range.estimated && children.has(item.id))) {
      const spans = (children.get(item.id) || []).map(resolve).filter(Boolean);
      if (spans.length) {
        range = {
          start: new Date(Math.min(...spans.map((r) => r.start.getTime()))),
          end: new Date(Math.max(...spans.map((r) => r.end.getTime()))),
          rollup: true,
        };
      }
    }
    visiting.delete(item.id);
    ranges.set(item.id, range);
    return range;
  };
  items.forEach(resolve);
  return ranges;
}

/** Hierarchical rows: epics with their children, then items without an epic. */
export function buildRows(items, groupBy, labels) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const childrenOf = new Map();
  const roots = [];
  items.forEach((item) => {
    if (item.parentId && byId.has(item.parentId)) {
      if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
      childrenOf.get(item.parentId).push(item);
    } else {
      roots.push(item);
    }
  });
  const order = (a, b) => (a.issueType === 0) - (b.issueType === 0) || String(a.issueKey).localeCompare(String(b.issueKey), undefined, { numeric: true });
  const sortedRoots = [...roots].sort((a, b) => (b.issueType === 0) - (a.issueType === 0) || order(a, b));
  const walk = (item, depth, out) => {
    const kids = (childrenOf.get(item.id) || []).sort(order);
    out.push({ type: 'item', item, depth, hasChildren: kids.length > 0 });
    kids.forEach((kid) => walk(kid, depth + 1, out));
    return out;
  };
  if (groupBy === 'none') return sortedRoots.flatMap((root) => walk(root, 0, []));
  const keyOf = (item) => (groupBy === 'team' ? item.planTeamId || '' : item.boardId);
  const groups = new Map();
  sortedRoots.forEach((root) => {
    const key = keyOf(root);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(root);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => String(labels(a)).localeCompare(String(labels(b))))
    .flatMap(([key, list]) => [
      { type: 'group', key, label: labels(key), count: list.length },
      ...list.flatMap((root) => walk(root, 0, [])),
    ]);
}

/** Hides rows below collapsed parents. */
export function visibleRows(rows, collapsed) {
  const out = [];
  let hideBelow = null;
  let hiddenGroup = false;
  rows.forEach((row) => {
    if (row.type === 'group') {
      hiddenGroup = collapsed.has(`group:${row.key}`);
      hideBelow = null;
      out.push(row);
      return;
    }
    if (hiddenGroup) return;
    if (hideBelow !== null && row.depth > hideBelow) return;
    hideBelow = null;
    out.push(row);
    if (row.hasChildren && collapsed.has(row.item.id)) hideBelow = row.depth;
  });
  return out;
}

export function iterations(from, days, count) {
  const start = startOfDay(from);
  return Array.from({ length: count }, (_, i) => {
    const s = addDays(start, i * days);
    return { start: s, end: addDays(s, days - 1) };
  });
}

/** Story points per team per iteration, bucketed by the end of each open item's bar. */
export function capacityTable(items, ranges, teams, from, count) {
  return teams.map((team) => {
    const slots = iterations(from, team.iterationDays || 14, count).map((slot) => ({ ...slot, points: 0, items: 0 }));
    items.forEach((item) => {
      if (item.planTeamId !== team.id || item.statusCategory === 'done' || item.issueType === 0) return;
      const range = ranges.get(item.id);
      if (!range) return;
      const slot = slots.find((s) => range.end >= s.start && range.end <= s.end);
      if (!slot) return;
      slot.points += item.storyPoints || 0;
      slot.items += 1;
    });
    return { team, slots };
  });
}

/** A dependency is broken when the blocked item starts before its blocker ends. */
export function dependencyConflicts(dependencies, ranges) {
  const result = new Set();
  dependencies.forEach((dep) => {
    const blocker = ranges.get(dep.blockerId);
    const blocked = ranges.get(dep.blockedId);
    if (blocker && blocked && blocked.start <= blocker.end) result.add(dep.id);
  });
  return result;
}

export function moveRange(range, mode, deltaDays) {
  if (mode === 'move') return { start: addDays(range.start, deltaDays), end: addDays(range.end, deltaDays) };
  if (mode === 'start') {
    const start = addDays(range.start, deltaDays);
    return { start: start > range.end ? range.end : start, end: range.end };
  }
  const end = addDays(range.end, deltaDays);
  return { start: range.start, end: end < range.start ? range.start : end };
}
