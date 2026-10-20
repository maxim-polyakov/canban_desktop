import { spaceFeatures } from './spaceFeatures.js';

export const STATUS_CATEGORIES = [
  { kind: 0, label: 'К выполнению', tone: 'todo' },
  { kind: 1, label: 'В работе', tone: 'progress' },
  { kind: 3, label: 'Готово', tone: 'done' },
];

export function statusTone(kind) {
  if (kind === 3) return 'done';
  if (kind === 0) return 'todo';
  return 'progress';
}

export const isScrumBoard = (board) => board?.template === 'scrum' && spaceFeatures(board).includes('backlog');

export const activeSprintIds = (sprints) => new Set((sprints || []).filter((s) => s.status === 1).map((s) => s.id));

const questsOf = (column) => column?.quests ?? column?.Quests ?? [];

/** Board columns from a published layout; without one every status is its own column. */
export function buildBoardColumns(statuses, layout) {
  if (!layout?.configured) return statuses;
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return (layout.columns || [])
    .map((column) => {
      const members = column.statusIds.map((id) => byId.get(id)).filter(Boolean);
      if (!members.length) return null;
      const many = members.length > 1;
      return {
        id: column.id,
        title: column.name,
        kind: members[members.length - 1].kind,
        statusIds: members.map((s) => s.id),
        createColumnId: members[0].id,
        quests: members.flatMap((s) => questsOf(s).map((q) => (many ? { ...q, statusLabel: s.title, statusKind: s.kind } : q))),
      };
    })
    .filter(Boolean);
}

/** Maps a drop on a layout column to the status and position the server expects. */
export function resolveLayoutDrop(boardColumns, statuses, questId, targetColumnId, newOrder, allowed = () => true) {
  const target = boardColumns.find((c) => c.id === targetColumnId);
  if (!target?.statusIds) return { statusId: targetColumnId, order: newOrder };
  const current = statuses.find((s) => questsOf(s).some((q) => q.id === questId));
  const statusId = current && target.statusIds.includes(current.id)
    ? current.id
    : target.statusIds.find((id) => allowed(id)) ?? target.statusIds[0];
  const before = target.quests.slice(0, newOrder).filter((q) => q.id !== questId && q.columnId === statusId).length;
  return { statusId, order: before };
}

/** Editable draft for the "Настроить столбцы" dialog. */
export function draftFromLayout(layout) {
  return {
    columns: (layout?.columns || []).map((c) => ({ id: c.id, name: c.name, statusIds: [...c.statusIds] })),
    hidden: [...(layout?.hidden || [])],
    newStatuses: [],
  };
}

export function moveStatus(draft, statusId, toColumnId, index) {
  const strip = (ids) => ids.filter((id) => id !== statusId);
  const columns = draft.columns.map((c) => ({ ...c, statusIds: strip(c.statusIds) }));
  const hidden = strip(draft.hidden);
  if (toColumnId === null) {
    hidden.splice(index ?? hidden.length, 0, statusId);
    return { ...draft, columns, hidden };
  }
  return {
    ...draft,
    hidden,
    columns: columns.map((c) => {
      if (c.id !== toColumnId) return c;
      const ids = [...c.statusIds];
      ids.splice(index ?? ids.length, 0, statusId);
      return { ...c, statusIds: ids };
    }),
  };
}

/** Moves a status to the neighbouring column; the hidden lane sits left of the first column. */
export function shiftStatus(draft, statusId, step) {
  const lanes = [null, ...draft.columns.map((c) => c.id)];
  const from = draft.hidden.includes(statusId) ? null : draft.columns.find((c) => c.statusIds.includes(statusId))?.id;
  const next = lanes.indexOf(from ?? null) + step;
  if (next < 0 || next >= lanes.length) return draft;
  return moveStatus(draft, statusId, lanes[next]);
}

export function draftToRequest(draft) {
  return {
    columns: draft.columns.map((c) => ({ id: String(c.id).startsWith('new-') ? null : c.id, name: c.name, statusIds: c.statusIds })),
    newStatuses: draft.newStatuses.map((s) => ({ key: s.id, name: s.title, kind: s.kind })),
  };
}

export function draftProblem(draft) {
  if (!draft.columns.length) return 'На доске должен быть хотя бы один столбец';
  if (draft.columns.some((c) => !c.name.trim())) return 'Укажите название столбца';
  if (draft.columns.some((c) => !c.statusIds.length)) return 'Столбцы должны иметь хотя бы по одному статусу';
  return '';
}
