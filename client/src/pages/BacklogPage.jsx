import React, { useCallback, useEffect, useState } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { useParams, useNavigate } from '../i18n/navigation.jsx';
import { boards, bulk, quests, sprints as sprintsApi, teams } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon, WatcherBadge } from '../components/IssueIcons.jsx';
import AssigneeAvatar from '../components/AssigneeAvatar.jsx';
import IssueDetailDrawer from '../components/IssueDetailDrawer.jsx';
import StartSprintDialog from '../components/StartSprintDialog.jsx';
import IssueActionsMenu from '../components/IssueActionsMenu.jsx';
import useMediaQuery from '../utils/useMediaQuery.js';
import './BacklogPage.css';

const BACKLOG_COLUMN_KIND = 0;
const ARCHIVE_COLUMN_KIND = 5;
const BACKLOG_DRAG_PREFIX = 'backlog-quest-';
const SPRINT_DROP_PREFIX = 'sprint-drop-';
const BACKLOG_DROP_ID = 'backlog-drop';

function IssueRow({ quest, onOpen, actions, dragDisabled, selected, onSelect }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: BACKLOG_DRAG_PREFIX + quest.id,
    data: { type: 'backlog-quest', questId: quest.id },
    disabled: dragDisabled,
  });
  return (
    <li
      ref={setNodeRef}
      className={`backlog-issue-row ${isDragging ? 'backlog-issue-row-dragging' : ''} ${quest.flagged ? 'backlog-issue-row-flagged' : ''}`}
      {...attributes}
      {...listeners}
    >
      <input className="backlog-issue-checkbox" type="checkbox" checked={selected} aria-label={`Select ${quest.issueKey}`} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onSelect?.(quest.id, e.target.checked)} />
      <IssueTypeIcon issueType={quest.issueType} typeId={quest.issueTypeId} size={16} />
      {quest.parentId && <span title="Subtask">↳</span>}
      <button type="button" className="backlog-issue-key" onClick={() => onOpen(quest.id)}>{quest.issueKey}</button>
      <button type="button" className="backlog-issue-title" onClick={() => onOpen(quest.id)} title={quest.title}>
        {quest.title}
      </button>
      <span className="backlog-issue-spacer" />
      {quest.flagged && <span className="backlog-issue-flag" title="Флажок" aria-label="Флажок">⚑</span>}
      {quest.labels && String(quest.labels).split(',').filter(Boolean).slice(0, 2).map((label) => (
        <span key={label} className="backlog-issue-label">{label.trim()}</span>
      ))}
      {quest.xpReward > 0 && <span className="backlog-issue-xp">+{quest.xpReward} XP</span>}
      <WatcherBadge count={(quest.notificationRecipientIds ?? []).length} />
      {(quest.linkCount > 0 || quest.hasBlockingLinks) && <span title="Linked or blocked">⛓{quest.hasBlockingLinks ? '⛔' : ''}</span>}
      <PriorityIcon priority={quest.priority} size={14} />
      <span className="backlog-issue-assignees">
        {(quest.assignees ?? []).slice(0, 3).map((a) => (
          <AssigneeAvatar key={a.userId} userId={a.userId} displayName={a.displayName} avatarUrl={a.avatarUrl} size={20} />
        ))}
      </span>
      {quest.storyPoints != null && <span className="backlog-issue-points" title="Story points">{quest.storyPoints}</span>}
      {actions?.(quest)}
    </li>
  );
}

function SprintActions({ sprint, isMobile, onStart, onComplete, onDelete }) {
  const [open, setOpen] = useState(false);
  const actions = [
    sprint.status === 0 && { key: 'start', label: 'Начать спринт', run: onStart },
    sprint.status === 1 && { key: 'complete', label: 'Завершить спринт', run: onComplete },
    { key: 'delete', label: 'Удалить', run: onDelete, danger: true },
  ].filter(Boolean);
  if (!isMobile) {
    return actions.map((action) => (
      <button key={action.key} type="button" className={`backlog-sprint-action${action.danger ? ' backlog-sprint-delete' : ''}`} onClick={action.run}>{action.label}</button>
    ));
  }
  return (
    <span className="backlog-sprint-more">
      <button type="button" className="backlog-sprint-more-btn" aria-label="Действия со спринтом" aria-expanded={open} onClick={() => setOpen((v) => !v)}>⋯</button>
      {open && (
        <>
          <span className="backlog-sprint-more-backdrop" onClick={() => setOpen(false)} />
          <span className="backlog-sprint-more-menu" role="menu">
            {actions.map((action) => (
              <button key={action.key} type="button" role="menuitem" className={action.danger ? 'is-danger' : ''} onClick={() => { setOpen(false); action.run(); }}>{action.label}</button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

/** Droppable wrapper around a sprint's issue list; accepts dragged backlog issues. */
function SprintDropList({ sprintId, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: SPRINT_DROP_PREFIX + sprintId,
    data: { type: 'sprint', sprintId },
  });
  return (
    <ul ref={setNodeRef} className={`backlog-issue-list ${isOver ? 'backlog-issue-list-over' : ''}`}>
      {children}
    </ul>
  );
}

/** Droppable wrapper around the backlog's issue list; accepts dragged sprint issues. */
function BacklogDropList({ children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: BACKLOG_DROP_ID,
    data: { type: 'backlog' },
  });
  return (
    <ul ref={setNodeRef} className={`backlog-issue-list ${isOver ? 'backlog-issue-list-over' : ''}`}>
      {children}
    </ul>
  );
}

export default function BacklogPage() {
  const { boardId, questId } = useParams();
  const navigate = useNavigate();
  const { t } = useLocalization();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [sprintList, setSprintList] = useState([]);
  const [sprintQuests, setSprintQuests] = useState({});
  const [backlogQuests, setBacklogQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [creatingSprint, setCreatingSprint] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [startingSprint, setStartingSprint] = useState(null);
  const [toast, setToast] = useState('');
  const isMobile = useMediaQuery();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const loadAll = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError('');
    try {
      const boardData = await boards.getById(boardId);
      setBoard(boardData);
      if (boardData?.teamId) {
        teams.getMembers(boardData.teamId).then((list) => setMembers(Array.isArray(list) ? list : [])).catch(() => setMembers([]));
      }
      const [sprintsRes, backlogRes] = await Promise.all([
        sprintsApi.getByBoard(boardId).catch(() => []),
        quests.getBacklog(boardId).catch(() => []),
      ]);
      const sprintArr = Array.isArray(sprintsRes) ? sprintsRes.filter((s) => s.status !== 2) : [];
      setSprintList(sprintArr);
      setBacklogQuests(Array.isArray(backlogRes) ? backlogRes : []);
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

  const handleCreateSprint = async (e) => {
    e.preventDefault();
    if (!newSprintName.trim() || !boardId) return;
    setCreatingSprint(true);
    try {
      await sprintsApi.create(boardId, { name: newSprintName.trim(), goal: newSprintGoal.trim() || null });
      setNewSprintName('');
      setNewSprintGoal('');
      setShowCreateSprint(false);
      await loadAll();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось создать спринт.'));
    } finally {
      setCreatingSprint(false);
    }
  };

  const handleStartSprint = async (data) => {
    await sprintsApi.start(startingSprint.id, data);
    setStartingSprint(null);
    await loadAll();
  };

  const handleCompleteSprint = async (sprintId) => {
    if (!window.confirm(t('Завершить спринт? Незавершённые задачи вернутся в бэклог.'))) return;
    try {
      await sprintsApi.complete(sprintId, { moveIncompleteToBacklog: true });
      await loadAll();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось завершить спринт.'));
    }
  };

  const handleDeleteSprint = async (sprintId) => {
    if (!window.confirm(t('Удалить спринт?'))) return;
    try {
      await sprintsApi.delete(sprintId);
      await loadAll();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось удалить спринт.'));
    }
  };

  const moveQuestToSprint = async (questIdToMove, sprintId) => {
    try {
      await quests.update(questIdToMove, { sprintId, sprintIdSet: true });
      await loadAll();
    } catch (e) {
      console.error(e);
    }
  };

  const moveQuestToBacklog = async (questIdToMove) => {
    try {
      await quests.update(questIdToMove, { sprintId: null, sprintIdSet: true });
      await loadAll();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateQuest = async (id, patch) => {
    await quests.update(id, patch);
    await loadAll();
  };

  const deleteQuest = async (quest) => {
    if (!window.confirm(t('Удалить задачу ${key}? Это действие нельзя отменить.', { key: quest.issueKey }))) return;
    if (!(await quests.delete(quest.id))) throw new Error('Не удалось удалить задачу.');
    await loadAll();
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
    await loadAll();
  };

  const loadEpics = useCallback(() => quests.filter(boardId, { issueType: 0 }), [boardId]);

  const renderActions = (quest) => (
    <IssueActionsMenu
      quest={quest}
      boardId={boardId}
      sprints={sprintList}
      members={members}
      loadEpics={loadEpics}
      onMove={(sprintId) => updateQuest(quest.id, { sprintId, sprintIdSet: true })}
      onUpdate={(patch) => updateQuest(quest.id, patch)}
      onSplit={() => splitQuest(quest)}
      onDelete={() => deleteQuest(quest)}
      onNotify={setToast}
    />
  );

  const handleCreateBacklogIssue = async (e) => {
    e.preventDefault();
    if (!newIssueTitle.trim() || !board) return;
    const backlogColumn = (board.columns ?? []).find((c) => c.kind === BACKLOG_COLUMN_KIND) ?? (board.columns ?? [])[0];
    if (!backlogColumn) return;
    setCreatingIssue(true);
    try {
      await quests.create({
        title: newIssueTitle.trim(),
        columnId: backlogColumn.id,
        category: 0,
        xpReward: 10,
        isEpic: false,
        issueType: 2,
        priority: 2,
      });
      setNewIssueTitle('');
      await loadAll();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось создать задачу.'));
    } finally {
      setCreatingIssue(false);
    }
  };

  const openIssue = (id) => navigate(`/board/${boardId}/backlog/issue/${id}`);
  const closeIssue = () => navigate(`/board/${boardId}/backlog`);

  const futureAndActiveSprints = sprintList;

  const allVisibleQuests = [...backlogQuests, ...Object.values(sprintQuests).flat()];
  const draggedQuest = activeDragId
    ? allVisibleQuests.find((q) => BACKLOG_DRAG_PREFIX + q.id === activeDragId)
    : null;

  const handleDragStart = (event) => setActiveDragId(String(event.active.id));

  const handleDragEnd = (event) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const dragData = active.data?.current;
    if (!dragData || dragData.type !== 'backlog-quest') return;
    const overData = over.data?.current;
    if (!overData) return;
    if (overData.type === 'sprint') {
      moveQuestToSprint(dragData.questId, overData.sprintId);
    } else if (overData.type === 'backlog') {
      moveQuestToBacklog(dragData.questId);
    }
  };

  const toggleSelected = (id, checked) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  const applyBulk = async (fields) => {
    try {
      await bulk.update(boardId, selectedIds, fields);
      setSelectedIds([]);
      await loadAll();
    } catch (e) { window.alert(t(e.message || 'Не удалось выполнить массовое изменение.')); }
  };

  if (loading) return <div className="page">Загрузка бэклога...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;

  return (
    <div className="page backlog-page">
      <div className="backlog-header">
        <h1>Backlog {board?.keyPrefix ? <span className="board-key-chip">{board.keyPrefix}</span> : null}</h1>
        <button type="button" className="backlog-create-sprint-btn" onClick={() => setShowCreateSprint((v) => !v)}>
          + Спринт
        </button>
      </div>

      {showCreateSprint && (
        <form className="backlog-create-sprint-form" onSubmit={handleCreateSprint}>
          <input
            type="text"
            placeholder="Название спринта"
            value={newSprintName}
            onChange={(e) => setNewSprintName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Цель спринта (необязательно)"
            value={newSprintGoal}
            onChange={(e) => setNewSprintGoal(e.target.value)}
          />
          <div className="backlog-create-sprint-actions">
            <button type="submit" disabled={creatingSprint || !newSprintName.trim()}>{creatingSprint ? '…' : 'Создать'}</button>
            <button type="button" onClick={() => setShowCreateSprint(false)}>Отмена</button>
          </div>
        </form>
      )}

      <p className="backlog-dnd-hint">
        Перетащите задачу между бэклогом и спринтом (поддерживается касание) или откройте меню «⋯» у задачи.
      </p>
      {selectedIds.length > 0 && <div className="backlog-bulk-bar" role="toolbar">
        <strong>{t('Выбрано')}: {selectedIds.length}</strong>
        <button type="button" onClick={() => applyBulk({ sprintId: null })}>{t('В бэклог')}</button>
        <select defaultValue="" onChange={(e) => { if (e.target.value) applyBulk({ sprintId: e.target.value }); }}>
          <option value="" disabled>{t('В спринт…')}</option>
          {futureAndActiveSprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}
        </select>
        <button type="button" onClick={() => setSelectedIds([])}>{t('Снять выбор')}</button>
      </div>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {futureAndActiveSprints.map((sprint) => (
          <section key={sprint.id} className="backlog-sprint-panel">
            <header className="backlog-sprint-header">
              <span className="backlog-sprint-name">{sprint.name}</span>
              {sprint.status === 1 && <span className="chip chip-accent">Активный</span>}
              {sprint.goal && <span className="backlog-sprint-goal">{sprint.goal}</span>}
              <span className="backlog-sprint-count">{(sprintQuests[sprint.id] ?? []).length} задач</span>
              <span className="backlog-issue-spacer" />
              <SprintActions
                sprint={sprint}
                isMobile={isMobile}
                onStart={() => setStartingSprint(sprint)}
                onComplete={() => handleCompleteSprint(sprint.id)}
                onDelete={() => handleDeleteSprint(sprint.id)}
              />
            </header>
            <SprintDropList sprintId={sprint.id}>
              {(sprintQuests[sprint.id] ?? []).map((q) => (
                <IssueRow key={q.id} quest={q} onOpen={openIssue} actions={renderActions} selected={selectedIds.includes(q.id)} onSelect={toggleSelected} />
              ))}
              {(sprintQuests[sprint.id] ?? []).length === 0 && <li className="backlog-empty">Нет задач в этом спринте. Перетащите сюда задачу из бэклога.</li>}
            </SprintDropList>
          </section>
        ))}

        <section className="backlog-sprint-panel backlog-backlog-panel">
          <header className="backlog-sprint-header">
            <span className="backlog-sprint-name">Бэклог</span>
            <span className="backlog-sprint-count">{backlogQuests.length} задач</span>
          </header>
          <BacklogDropList>
            {backlogQuests.map((q) => (
              <IssueRow
                key={q.id}
                quest={q}
                onOpen={openIssue}
                actions={renderActions}
                selected={selectedIds.includes(q.id)}
                onSelect={toggleSelected}
              />
            ))}
            {backlogQuests.length === 0 && <li className="backlog-empty">Бэклог пуст.</li>}
          </BacklogDropList>
          <form className="backlog-create-issue-form" onSubmit={handleCreateBacklogIssue}>
            <input
              type="text"
              placeholder="+ Создать задачу в бэклоге"
              value={newIssueTitle}
              onChange={(e) => setNewIssueTitle(e.target.value)}
              disabled={creatingIssue}
            />
            <button type="submit" disabled={creatingIssue || !newIssueTitle.trim()}>{creatingIssue ? '…' : 'Создать'}</button>
          </form>
        </section>

        <DragOverlay>
          {draggedQuest ? (
            <div className="backlog-issue-row backlog-issue-row-overlay">
              <IssueTypeIcon issueType={draggedQuest.issueType} typeId={draggedQuest.issueTypeId} size={16} />
              <span className="backlog-issue-title">{draggedQuest.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {toast && <div className="backlog-toast" role="status">{toast}</div>}

      {startingSprint && (
        <StartSprintDialog
          sprint={startingSprint}
          issueCount={(sprintQuests[startingSprint.id] ?? []).length}
          anotherActive={sprintList.some((s) => s.status === 1 && s.id !== startingSprint.id)}
          onStart={handleStartSprint}
          onClose={() => setStartingSprint(null)}
        />
      )}

      {questId && (
        <IssueDetailDrawer
          questId={questId}
          members={members}
          columns={(board?.columns ?? []).filter((c) => c.kind !== ARCHIVE_COLUMN_KIND)}
          onClose={closeIssue}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}
