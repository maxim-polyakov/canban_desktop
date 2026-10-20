import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useParams, useNavigate } from '../i18n/navigation.jsx';
import { boards, bulk, quests, sprints as sprintsApi, teams } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon } from '../components/IssueIcons.jsx';
import AssigneeAvatar from '../components/AssigneeAvatar.jsx';
import IssueDetailDrawer from '../components/IssueDetailDrawer.jsx';
import StartSprintDialog from '../components/StartSprintDialog.jsx';
import IssueActionsMenu from '../components/IssueActionsMenu.jsx';
import BoardToolbar from '../components/BoardToolbar.jsx';
import { matchesBoardFilters } from '../utils/boardLanes.js';
import './BacklogPage.css';

const BACKLOG_COLUMN_KIND = 0;
const DONE_COLUMN_KIND = 3;
const ARCHIVE_COLUMN_KIND = 5;
const BACKLOG_DRAG_PREFIX = 'backlog-quest-';
const SPRINT_DROP_PREFIX = 'sprint-drop-';
const BACKLOG_DROP_ID = 'backlog-drop';
const EMPTY_FILTERS = { assigneeIds: [], types: [], priorities: [], labels: [] };

export const statusCategory = (kind) => (kind === DONE_COLUMN_KIND ? 'done' : kind === 1 || kind === 2 ? 'progress' : 'todo');

export const issueCountLabel = (count, t) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return t('${n} задача', { n: count });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('${n} задачи', { n: count });
  return t('${n} задач', { n: count });
};

/** Story points per status category, like the three lozenges in Jira's sprint header. */
export const pointsByCategory = (list, kindOf) => list.reduce((acc, q) => {
  acc[statusCategory(kindOf(q))] += Number(q.storyPoints) || 0;
  return acc;
}, { todo: 0, progress: 0, done: 0 });

export const matchesBacklogQuery = (quest, query) => {
  const q = query.trim().toLowerCase();
  return !q || String(quest.title ?? '').toLowerCase().includes(q) || String(quest.issueKey ?? '').toLowerCase().includes(q);
};

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4l-8.5 8.5-3.4.9.9-3.4 7.6-7.6zM10 4.4 4.2 10.2l-.4 1.4 1.4-.4L11 5.4 10 4.4z" /></svg>
);
const PersonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1.5c-2.7 0-5 1.4-5 3.2V14h10v-1.3c0-1.8-2.3-3.2-5-3.2z" /></svg>
);
const ChevronIcon = ({ open }) => (
  <svg className={`bl-chevron ${open ? 'is-open' : ''}`} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function EpicCell({ quest, epics, onUpdate, t }) {
  const pop = usePopover();
  const parentId = quest.parentQuestId ?? quest.parentEpicId ?? null;
  const epic = parentId ? epics.find((e) => e.id === parentId) : null;
  if (quest.issueType === 0 || quest.isEpic) return null;
  const choose = (id) => { pop.setOpen(false); onUpdate({ parentQuestId: id, parentQuestIdSet: true }); };
  return (
    <span className="bl-pop-wrap" ref={pop.ref} onPointerDown={(e) => e.stopPropagation()}>
      {epic ? (
        <button type="button" className="bl-epic-lozenge" title={epic.title} onClick={() => pop.setOpen((v) => !v)}>{epic.title}</button>
      ) : (
        <button type="button" className="bl-add-epic" aria-label={t('Добавить эпик')} onClick={() => pop.setOpen((v) => !v)}>+ {t('Эпик')}</button>
      )}
      {pop.open && (
        <div className="iam-menu bl-pop" role="menu" aria-label={t('Эпик')}>
          {epic && <button type="button" role="menuitem" onClick={() => choose(null)}>{t('Убрать родителя')}</button>}
          {epics.map((e) => (
            <button key={e.id} type="button" role="menuitemradio" aria-checked={e.id === parentId} onClick={() => choose(e.id)}>
              <IssueTypeIcon issueType={0} size={14} /><span className="iam-key">{e.issueKey}</span><span className="iam-ellipsis">{e.title}</span>
            </button>
          ))}
          {epics.length === 0 && <span className="iam-muted">{t('В этом пространстве нет эпиков.')}</span>}
        </div>
      )}
    </span>
  );
}

function StatusCell({ quest, columns, onMoveColumn, t }) {
  const column = columns.find((c) => c.id === quest.columnId);
  return (
    <select
      className={`bl-status is-${statusCategory(column?.kind)}`}
      value={quest.columnId}
      aria-label={t('Статус')}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => onMoveColumn(e.target.value)}
    >
      {columns.map((c) => <option key={c.id} value={c.id}>{c.title ?? c.name}</option>)}
    </select>
  );
}

function EstimateCell({ quest, onUpdate, t }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const start = () => { setValue(quest.storyPoints ?? ''); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const next = String(value).trim() === '' ? null : Number(value);
    if (next !== null && (!Number.isFinite(next) || next < 0)) return;
    if (next !== (quest.storyPoints ?? null)) onUpdate({ storyPoints: next, storyPointsSet: true });
  };
  if (editing) {
    return (
      <input
        className="bl-estimate-input"
        type="number"
        min="0"
        autoFocus
        value={value}
        aria-label={t('Примерная оценка сложности')}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      />
    );
  }
  return (
    <button type="button" className="bl-estimate" title={t('Примерная оценка сложности')} aria-label={t('Примерная оценка сложности')} onPointerDown={(e) => e.stopPropagation()} onClick={start}>
      {quest.storyPoints ?? '-'}
    </button>
  );
}

function AssigneeCell({ quest, members, onUpdate, t }) {
  const pop = usePopover();
  const assignee = (quest.assignees ?? [])[0];
  const choose = (ids) => { pop.setOpen(false); onUpdate({ assigneeIds: ids, assigneeIdsSet: true }); };
  return (
    <span className="bl-pop-wrap" ref={pop.ref} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="bl-assignee" title={assignee ? assignee.displayName : t('Не назначено')} aria-label={`${t('Исполнитель')}: ${assignee ? assignee.displayName : t('Не назначено')}`} onClick={() => pop.setOpen((v) => !v)}>
        {assignee
          ? <AssigneeAvatar userId={assignee.userId} displayName={assignee.displayName} avatarUrl={assignee.avatarUrl} size={24} />
          : <span className="bl-assignee-empty"><PersonIcon /></span>}
      </button>
      {pop.open && (
        <div className="iam-menu bl-pop" role="menu" aria-label={t('Исполнитель')}>
          <button type="button" role="menuitem" onClick={() => choose([])}><span className="bl-assignee-empty"><PersonIcon /></span>{t('Не назначено')}</button>
          {members.filter((m) => m.userId).map((m) => (
            <button key={m.userId} type="button" role="menuitem" onClick={() => choose([m.userId])}>
              <AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={20} />{m.displayName}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function IssueRow({ quest, active, columns, epics, members, onOpen, onUpdate, onMoveColumn, actions, selected, onSelect, t }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BACKLOG_DRAG_PREFIX + quest.id,
    data: { type: 'backlog-quest', questId: quest.id },
  });
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(quest.title);
  const saveTitle = () => {
    setRenaming(false);
    if (title.trim() && title.trim() !== quest.title) onUpdate({ title: title.trim() });
    else setTitle(quest.title);
  };
  return (
    <li
      ref={setNodeRef}
      className={`bl-row ${isDragging ? 'is-dragging' : ''} ${active ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${quest.flagged ? 'is-flagged' : ''}`}
      {...attributes}
      {...listeners}
      onClick={(e) => { if (e.target === e.currentTarget) onOpen(quest.id); }}
    >
      <input className="bl-check" type="checkbox" checked={selected} aria-label={t('Выбрать ${key}', { key: quest.issueKey })} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onSelect(quest.id, e.target.checked)} />
      <IssueTypeIcon issueType={quest.issueType} typeId={quest.issueTypeId} size={16} />
      <button type="button" className={`bl-key ${quest.completedAt ? 'is-done' : ''}`} onClick={() => onOpen(quest.id)}>{quest.issueKey}</button>
      {renaming ? (
        <input
          className="bl-title-input"
          autoFocus
          value={title}
          aria-label={t('Название')}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(quest.title); setRenaming(false); } }}
        />
      ) : (
        <span className="bl-title-wrap">
          <button type="button" className="bl-title" onClick={() => onOpen(quest.id)} title={quest.title}>{quest.title}</button>
          <button type="button" className="bl-rename" aria-label={t('Изменить название')} title={t('Изменить название')} onPointerDown={(e) => e.stopPropagation()} onClick={() => setRenaming(true)}><PencilIcon /></button>
        </span>
      )}
      <span className="bl-spacer" onClick={() => onOpen(quest.id)} />
      {quest.flagged && <span className="bl-flag" title={t('Флажок')} aria-label={t('Флажок')}>⚑</span>}
      <EpicCell quest={quest} epics={epics} onUpdate={onUpdate} t={t} />
      <StatusCell quest={quest} columns={columns} onMoveColumn={onMoveColumn} t={t} />
      <EstimateCell quest={quest} onUpdate={onUpdate} t={t} />
      <span className="bl-priority" title={t('Приоритет')}><PriorityIcon priority={quest.priority} size={16} /></span>
      <AssigneeCell quest={quest} members={members} onUpdate={onUpdate} t={t} />
      {actions(quest)}
    </li>
  );
}

function DropList({ id, data, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, data });
  return <ul ref={setNodeRef} className={`bl-list ${isOver ? 'is-over' : ''}`}>{children}</ul>;
}

function PointsLozenges({ points, t }) {
  return (
    <span className="bl-points" aria-label={t('Оценка по статусам')}>
      <span className="bl-points-todo" title={t('К выполнению')}>{points.todo}</span>
      <span className="bl-points-progress" title={t('В работе')}>{points.progress}</span>
      <span className="bl-points-done" title={t('Готово')}>{points.done}</span>
    </span>
  );
}

function SprintMenu({ sprint, onEdit, onDelete, t }) {
  const pop = usePopover();
  return (
    <span className="bl-pop-wrap" ref={pop.ref}>
      <button type="button" className="iam-trigger" aria-label={t('Действия со спринтом ${name}', { name: sprint.name })} aria-expanded={pop.open} onClick={() => pop.setOpen((v) => !v)}>⋯</button>
      {pop.open && (
        <div className="iam-menu bl-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => { pop.setOpen(false); onEdit(); }}>{t('Изменить спринт')}</button>
          <button type="button" role="menuitem" onClick={() => { pop.setOpen(false); onDelete(); }}>{t('Удалить спринт')}</button>
        </div>
      )}
    </span>
  );
}

function InlineCreate({ onCreate, t }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate(title.trim());
      setTitle('');
    } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="bl-create" onClick={() => setOpen(true)}>+ {t('Создать')}</button>;
  return (
    <form className="bl-create-form" onSubmit={submit}>
      <IssueTypeIcon issueType={2} size={16} />
      <input autoFocus value={title} disabled={busy} placeholder={t('Что нужно сделать?')} aria-label={t('Что нужно сделать?')}
        onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
        onBlur={() => { if (!title.trim()) setOpen(false); }} />
    </form>
  );
}

export default function BacklogPage() {
  const { boardId, questId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLocalization();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [sprintList, setSprintList] = useState([]);
  const [sprintQuests, setSprintQuests] = useState({});
  const [backlogQuests, setBacklogQuests] = useState([]);
  const [epics, setEpics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeDragId, setActiveDragId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [startingSprint, setStartingSprint] = useState(null);
  const [editingSprint, setEditingSprint] = useState(null);
  const [collapsed, setCollapsed] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [toast, setToast] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!boardId) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const boardData = await boards.getById(boardId);
      setBoard(boardData);
      if (boardData?.teamId) {
        teams.getMembers(boardData.teamId).then((list) => setMembers(Array.isArray(list) ? list : [])).catch(() => setMembers([]));
      }
      const [sprintsRes, backlogRes, epicRes] = await Promise.all([
        sprintsApi.getByBoard(boardId).catch(() => []),
        quests.getBacklog(boardId).catch(() => []),
        quests.filter(boardId, { issueType: 0 }).catch(() => []),
      ]);
      const sprintArr = Array.isArray(sprintsRes) ? sprintsRes.filter((s) => s.status !== 2) : [];
      setSprintList(sprintArr);
      setBacklogQuests(Array.isArray(backlogRes) ? backlogRes : []);
      setEpics(Array.isArray(epicRes) ? epicRes : []);
      const perSprint = {};
      await Promise.all(sprintArr.map(async (s) => {
        try {
          const list = await quests.filter(boardId, { sprintId: s.id });
          perSprint[s.id] = Array.isArray(list) ? list : [];
        } catch {
          perSprint[s.id] = [];
        }
      }));
      setSprintQuests(perSprint);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  const refresh = useCallback(() => loadAll({ quiet: true }), [loadAll]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const columns = useMemo(() => (board?.columns ?? []).filter((c) => c.kind !== ARCHIVE_COLUMN_KIND).sort((a, b) => a.order - b.order), [board]);
  const kindOf = useCallback((q) => columns.find((c) => c.id === q.columnId)?.kind, [columns]);
  const visible = useCallback((list) => list.filter((q) => matchesBacklogQuery(q, query) && matchesBoardFilters(q, filters)), [query, filters]);
  const labels = useMemo(() => [...new Set([...backlogQuests, ...Object.values(sprintQuests).flat()]
    .flatMap((q) => String(q.labels || '').split(',').map((x) => x.trim()).filter(Boolean)))].sort(), [backlogQuests, sprintQuests]);

  const report = (e, fallback) => setToast(t(e?.message || fallback));

  const handleCreateSprint = async () => {
    try {
      const prefix = board?.keyPrefix || board?.name || '';
      await sprintsApi.create(boardId, { name: `${prefix} ${t('Спринт')} ${sprintList.length + 1}`.trim(), goal: null });
      await refresh();
    } catch (e) { report(e, 'Не удалось создать спринт.'); }
  };

  const handleStartSprint = async (data) => {
    await sprintsApi.start(startingSprint.id, data);
    setStartingSprint(null);
    await refresh();
  };

  const handleEditSprint = async (data) => {
    await sprintsApi.update(editingSprint.id, data);
    setEditingSprint(null);
    await refresh();
  };

  const handleCompleteSprint = async (sprintId) => {
    if (!window.confirm(t('Завершить спринт? Незавершённые задачи вернутся в бэклог.'))) return;
    try {
      await sprintsApi.complete(sprintId, { moveIncompleteToBacklog: true });
      await refresh();
    } catch (e) { report(e, 'Не удалось завершить спринт.'); }
  };

  const handleDeleteSprint = async (sprintId) => {
    if (!window.confirm(t('Удалить спринт? Его задачи вернутся в бэклог.'))) return;
    try {
      await sprintsApi.delete(sprintId);
      await refresh();
    } catch (e) { report(e, 'Не удалось удалить спринт.'); }
  };

  const updateQuest = async (id, patch) => {
    try {
      await quests.update(id, patch);
      await refresh();
    } catch (e) { report(e, 'Не удалось сохранить задачу.'); }
  };

  const moveColumn = async (quest, columnId) => {
    try {
      await quests.move({ questId: quest.id, targetColumnId: columnId, newOrder: 0 });
      await refresh();
    } catch (e) { report(e, 'Не удалось изменить статус.'); }
  };

  const deleteQuest = async (quest) => {
    if (!window.confirm(t('Удалить задачу ${key}? Это действие нельзя отменить.', { key: quest.issueKey }))) return;
    if (!(await quests.delete(quest.id))) throw new Error('Не удалось удалить задачу.');
    if (questId === quest.id) navigate(`/board/${boardId}/backlog`);
    await refresh();
  };

  const createQuest = async (title, sprintId = null) => {
    const column = columns.find((c) => c.kind === BACKLOG_COLUMN_KIND) ?? columns[0];
    if (!column) return;
    try {
      await quests.create({ title, columnId: column.id, category: 0, xpReward: 10, isEpic: false, issueType: 2, priority: 2, sprintId });
      await refresh();
    } catch (e) { report(e, 'Не удалось создать задачу.'); }
  };

  const splitQuest = async (quest) => {
    const title = window.prompt(t('Название новой задачи, которая будет отделена от ${key}', { key: quest.issueKey }), quest.title);
    if (!title?.trim()) return;
    const created = await quests.create({
      title: title.trim(),
      columnId: quest.columnId,
      category: quest.category ?? 0,
      xpReward: quest.xpReward ?? 10,
      isEpic: false,
      issueType: quest.issueType,
      issueTypeId: quest.issueTypeId ?? null,
      priority: quest.priority,
      labels: quest.labels || null,
      sprintId: quest.sprintId ?? null,
      parentQuestId: quest.parentQuestId ?? null,
      assigneeIds: quest.assigneeIds ?? [],
    });
    setToast(t('Создана задача ${key}', { key: created?.issueKey ?? '' }));
    await refresh();
  };

  const loadEpics = useCallback(() => Promise.resolve(epics), [epics]);

  const renderActions = (quest) => (
    <IssueActionsMenu
      quest={quest}
      boardId={boardId}
      sprints={sprintList}
      members={members}
      loadEpics={loadEpics}
      onMove={(sprintId) => quests.update(quest.id, { sprintId, sprintIdSet: true }).then(refresh)}
      onUpdate={(patch) => quests.update(quest.id, patch).then(refresh)}
      onSplit={() => splitQuest(quest)}
      onDelete={() => deleteQuest(quest)}
      onNotify={setToast}
    />
  );

  const openIssue = (id) => navigate(`/board/${boardId}/backlog/issue/${id}`);
  const closeIssue = () => navigate(`/board/${boardId}/backlog`);

  const allQuests = [...backlogQuests, ...Object.values(sprintQuests).flat()];
  const draggedQuest = activeDragId ? allQuests.find((q) => BACKLOG_DRAG_PREFIX + q.id === activeDragId) : null;

  const handleDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    const dragData = active.data?.current;
    const overData = over?.data?.current;
    if (!dragData || dragData.type !== 'backlog-quest' || !overData) return;
    const quest = allQuests.find((q) => q.id === dragData.questId);
    const target = overData.type === 'sprint' ? overData.sprintId : null;
    if (!quest || (quest.sprintId ?? null) === target) return;
    updateQuest(quest.id, { sprintId: target, sprintIdSet: true });
  };

  const toggleSelected = (id, checked) => setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));
  const toggleSection = (list, checked) => setSelectedIds((current) => (checked ? [...new Set([...current, ...list.map((q) => q.id)])] : current.filter((id) => !list.some((q) => q.id === id))));
  const toggleCollapsed = (key) => setCollapsed((current) => (current.includes(key) ? current.filter((x) => x !== key) : [...current, key]));
  const applyBulk = async (fields) => {
    try {
      await bulk.update(boardId, selectedIds, fields);
      setSelectedIds([]);
      await refresh();
    } catch (e) { report(e, 'Не удалось выполнить массовое изменение.'); }
  };

  const formatDay = (value) => new Date(value).toLocaleDateString(language || 'ru', { day: 'numeric', month: 'short' });

  const renderRows = (list) => list.map((q) => (
    <IssueRow
      key={q.id}
      quest={q}
      active={q.id === questId}
      columns={columns}
      epics={epics}
      members={members}
      onOpen={openIssue}
      onUpdate={(patch) => updateQuest(q.id, patch)}
      onMoveColumn={(columnId) => moveColumn(q, columnId)}
      actions={renderActions}
      selected={selectedIds.includes(q.id)}
      onSelect={toggleSelected}
      t={t}
    />
  ));

  const sectionCheckbox = (list, label) => {
    const all = list.length > 0 && list.every((q) => selectedIds.includes(q.id));
    return <input className="bl-check" type="checkbox" checked={all} disabled={list.length === 0} aria-label={label} onChange={(e) => toggleSection(list, e.target.checked)} />;
  };

  if (loading) return <div className="page">{t('Загрузка бэклога...')}</div>;
  if (error) return <div className="page">{t('Ошибка')}: {error}</div>;

  const sprintRows = sprintList.map((sprint) => ({ sprint, all: sprintQuests[sprint.id] ?? [], shown: visible(sprintQuests[sprint.id] ?? []) }));
  const shownInSprints = sprintRows.reduce((n, r) => n + r.shown.length, 0);
  const totalInSprints = sprintRows.reduce((n, r) => n + r.all.length, 0);
  const shownPoints = sprintRows.reduce((n, r) => n + r.shown.reduce((s, q) => s + (Number(q.storyPoints) || 0), 0), 0);
  const totalPoints = sprintRows.reduce((n, r) => n + r.all.reduce((s, q) => s + (Number(q.storyPoints) || 0), 0), 0);
  const shownBacklog = visible(backlogQuests);
  const hasActive = sprintList.some((s) => s.status === 1);

  return (
    <div className={`page backlog-page ${questId ? 'has-issue-panel' : ''}`}>
      <BoardToolbar
        query={query}
        onQueryChange={setQuery}
        members={members}
        filters={filters}
        onFiltersChange={setFilters}
        labels={labels}
        searchPlaceholder="Поиск по бэклогу"
      />

      {selectedIds.length > 0 && <div className="backlog-bulk-bar" role="toolbar">
        <strong>{t('Выбрано')}: {selectedIds.length}</strong>
        <button type="button" onClick={() => applyBulk({ sprintId: null })}>{t('В бэклог')}</button>
        <select defaultValue="" onChange={(e) => { if (e.target.value) applyBulk({ sprintId: e.target.value }); }} aria-label={t('В спринт…')}>
          <option value="" disabled>{t('В спринт…')}</option>
          {sprintList.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
        </select>
        <button type="button" onClick={() => setSelectedIds([])}>{t('Снять выбор')}</button>
      </div>}

      <DndContext sensors={sensors} onDragStart={(event) => setActiveDragId(String(event.active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDragId(null)}>
        {sprintRows.map(({ sprint, all, shown }) => {
          const open = !collapsed.includes(sprint.id);
          return (
            <section key={sprint.id} className="bl-section bl-sprint">
              <header className="bl-section-header">
                {sectionCheckbox(shown, t('Выбрать все задачи спринта ${name}', { name: sprint.name }))}
                <button type="button" className="bl-collapse" aria-expanded={open} onClick={() => toggleCollapsed(sprint.id)}>
                  <ChevronIcon open={open} /><span className="bl-section-name">{sprint.name}</span>
                </button>
                {sprint.startDate && sprint.endDate ? (
                  <span className="bl-sprint-dates">{formatDay(sprint.startDate)} — {formatDay(sprint.endDate)}</span>
                ) : (
                  <button type="button" className="bl-add-dates" onClick={() => setEditingSprint(sprint)}><PencilIcon />{t('Добавить даты')}</button>
                )}
                <span className="bl-section-count">({issueCountLabel(all.length, t)})</span>
                {sprint.goal && <span className="bl-sprint-goal" title={sprint.goal}>{sprint.goal}</span>}
                <span className="bl-spacer" />
                <PointsLozenges points={pointsByCategory(all, kindOf)} t={t} />
                {sprint.status === 1
                  ? <button type="button" className="bl-btn" onClick={() => handleCompleteSprint(sprint.id)}>{t('Завершить спринт')}</button>
                  : <button type="button" className="bl-btn" disabled={all.length === 0} title={all.length === 0 ? t('Добавьте задачи в спринт, чтобы начать его') : undefined} onClick={() => setStartingSprint(sprint)}>{t('Начать спринт')}</button>}
                <SprintMenu sprint={sprint} onEdit={() => setEditingSprint(sprint)} onDelete={() => handleDeleteSprint(sprint.id)} t={t} />
              </header>
              {open && (
                <>
                  <DropList id={SPRINT_DROP_PREFIX + sprint.id} data={{ type: 'sprint', sprintId: sprint.id }}>
                    {renderRows(shown)}
                    {all.length === 0 && (
                      <li className="bl-empty">{t('Спланируйте спринт: перетащите задачи из раздела «Бэклог» или создайте новые. Нажмите «Начать спринт», когда будете готовы.')}</li>
                    )}
                    {all.length > 0 && shown.length === 0 && <li className="bl-empty">{t('Нет задач, соответствующих фильтрам.')}</li>}
                  </DropList>
                  <InlineCreate onCreate={(title) => createQuest(title, sprint.id)} t={t} />
                </>
              )}
            </section>
          );
        })}

        {sprintRows.length > 0 && (
          <p className="bl-summary">
            {t('Видимых задач')}: <strong>{shownInSprints}</strong> {t('из')} {totalInSprints} <span className="bl-summary-sep">|</span> {t('Оценка')}: <strong>{shownPoints}</strong> {t('из')} {totalPoints}
          </p>
        )}

        <section className="bl-section bl-backlog">
          <header className="bl-section-header">
            {sectionCheckbox(shownBacklog, t('Выбрать все задачи бэклога'))}
            <button type="button" className="bl-collapse" aria-expanded={!collapsed.includes('backlog')} onClick={() => toggleCollapsed('backlog')}>
              <ChevronIcon open={!collapsed.includes('backlog')} /><span className="bl-section-name">Backlog</span>
            </button>
            <span className="bl-section-count">({issueCountLabel(backlogQuests.length, t)})</span>
            <span className="bl-spacer" />
            <PointsLozenges points={pointsByCategory(backlogQuests, kindOf)} t={t} />
            <button type="button" className="bl-btn" onClick={handleCreateSprint}>{t('Создание спринта')}</button>
          </header>
          {!collapsed.includes('backlog') && (
            <>
              <DropList id={BACKLOG_DROP_ID} data={{ type: 'backlog' }}>
                {renderRows(shownBacklog)}
                {backlogQuests.length === 0 && <li className="bl-empty">{t('Бэклог пуст.')}</li>}
                {backlogQuests.length > 0 && shownBacklog.length === 0 && <li className="bl-empty">{t('Нет задач, соответствующих фильтрам.')}</li>}
              </DropList>
              <InlineCreate onCreate={(title) => createQuest(title)} t={t} />
            </>
          )}
        </section>

        <DragOverlay>
          {draggedQuest ? (
            <div className="bl-row bl-row-overlay">
              <IssueTypeIcon issueType={draggedQuest.issueType} typeId={draggedQuest.issueTypeId} size={16} />
              <span className="bl-key">{draggedQuest.issueKey}</span>
              <span className="bl-title">{draggedQuest.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toast && <div className="backlog-toast" role="status">{toast}</div>}

      {startingSprint && (
        <StartSprintDialog
          sprint={startingSprint}
          issueCount={(sprintQuests[startingSprint.id] ?? []).length}
          anotherActive={hasActive && startingSprint.status !== 1}
          onStart={handleStartSprint}
          onClose={() => setStartingSprint(null)}
        />
      )}
      {editingSprint && (
        <StartSprintDialog sprint={editingSprint} mode="edit" onStart={handleEditSprint} onClose={() => setEditingSprint(null)} />
      )}

      {questId && (
        <IssueDetailDrawer
          key={questId}
          variant="panel"
          questId={questId}
          members={members}
          columns={columns}
          onClose={closeIssue}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
