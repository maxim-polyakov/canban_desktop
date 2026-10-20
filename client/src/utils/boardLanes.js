export const GROUP_OPTIONS = [['none', 'Нет'], ['assignee', 'Исполнитель'], ['epic', 'Эпик'], ['priority', 'Приоритет']];
export const UNASSIGNED = 'none';

const PRIORITY_NAMES = { 4: 'Высший', 3: 'Высокий', 2: 'Средний', 1: 'Низкий', 0: 'Низший' };
const questsOf = (column) => column?.quests ?? column?.Quests ?? [];

export const assigneesOf = (quest) => {
  const ids = quest?.assigneeIds?.length ? quest.assigneeIds : quest?.assigneeId ? [quest.assigneeId] : [];
  return ids.map(String);
};

export const labelsOf = (quest) => String(quest?.labels || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Jira's quick filters: people (with "unassigned"), issue types, priorities and labels; empty lists match everything. */
export function matchesBoardFilters(quest, { assigneeIds = [], types = [], priorities = [], labels = [] } = {}) {
  if (assigneeIds.length) {
    const ids = assigneesOf(quest);
    const unassignedOk = assigneeIds.includes(UNASSIGNED) && ids.length === 0;
    if (!unassignedOk && !ids.some((id) => assigneeIds.includes(id))) return false;
  }
  if (types.length && !types.includes(String(quest?.issueTypeId || quest?.issueType))) return false;
  if (priorities.length && !priorities.includes(Number(quest?.priority))) return false;
  if (labels.length && !labelsOf(quest).some((label) => labels.includes(label))) return false;
  return true;
}

export const activeBoardFilterCount = ({ types = [], priorities = [], labels = [] } = {}) => types.length + priorities.length + labels.length;

/** Splits board columns into swimlanes; every lane keeps all columns so cards line up under the shared headers. */
export function buildLanes(columns, groupBy, { members = [], t = (x) => x } = {}) {
  if (!groupBy || groupBy === 'none') return null;
  const all = columns.flatMap(questsOf);
  const lanes = new Map();
  const keyOf = (quest) => {
    if (groupBy === 'assignee') return assigneesOf(quest)[0] || UNASSIGNED;
    if (groupBy === 'priority') return String(quest?.priority ?? 2);
    const parent = quest?.parentEpicId || quest?.parentQuestId;
    const epic = parent && all.find((q) => q.id === parent && (q.isEpic || q.issueType === 0));
    return epic ? epic.id : UNASSIGNED;
  };
  const describe = (key) => {
    if (groupBy === 'assignee') {
      if (key === UNASSIGNED) return { title: t('Не назначено'), userId: null };
      const member = members.find((m) => String(m.userId) === key);
      const fromIssue = all.find((q) => assigneesOf(q)[0] === key);
      return { title: member?.displayName || fromIssue?.assigneeName || t('Пользователь'), userId: key, avatarUrl: member?.avatarUrl };
    }
    if (groupBy === 'priority') return { title: t(PRIORITY_NAMES[key] || 'Средний'), priority: Number(key) };
    if (key === UNASSIGNED) return { title: t('Задачи без эпика') };
    const epic = all.find((q) => q.id === key);
    return { title: [epic?.issueKey, epic?.title].filter(Boolean).join(' '), epicId: key };
  };
  for (const column of columns) {
    for (const quest of questsOf(column)) {
      const key = keyOf(quest);
      if (!lanes.has(key)) lanes.set(key, { key, ...describe(key), count: 0 });
      lanes.get(key).count += 1;
    }
  }
  const order = (lane) => {
    if (groupBy === 'priority') return -lane.priority;
    return lane.key === UNASSIGNED ? Number.MAX_SAFE_INTEGER : 0;
  };
  return [...lanes.values()]
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title))
    .map((lane) => ({
      ...lane,
      columns: columns.map((column) => ({ ...column, quests: questsOf(column).filter((q) => keyOf(q) === lane.key) })),
    }));
}
