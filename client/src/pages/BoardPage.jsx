import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from '../i18n/navigation.jsx';
import * as signalR from '@microsoft/signalr';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards, bulk, columns, quests, sprints as sprintsApi, teams } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import IssueDetailDrawer from '../components/IssueDetailDrawer.jsx';
import { buildQuestFilter } from '../utils/jqlFilter.js';
import { moveQuestInColumns } from '../utils/boardMoves.js';
import useMediaQuery from '../utils/useMediaQuery.js';
import { useBoardIssueConfig } from '../utils/issueConfig.js';
import { issueWorkflow, needsTransitionDialog, transitionsTo } from '../utils/workflow.js';
import TransitionScreenDialog from '../components/TransitionScreenDialog.jsx';
import ColumnConfigDialog from '../components/ColumnConfigDialog.jsx';
import { activeSprintIds, buildBoardColumns, isScrumBoard, resolveLayoutDrop } from '../utils/boardColumnLayout.js';
import './BoardPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';
const ARCHIVE_COLUMN_KIND = 5;
const DONE_COLUMN_KIND = 3;

const ISSUE_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'Все типы' },
  { value: '0', label: 'Эпик' },
  { value: '1', label: 'История' },
  { value: '2', label: 'Задача' },
  { value: '3', label: 'Ошибка' },
  { value: '4', label: 'Подзадача' },
];
const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'Все приоритеты' },
  { value: '4', label: 'Высший' },
  { value: '3', label: 'Высокий' },
  { value: '2', label: 'Средний' },
  { value: '1', label: 'Низкий' },
  { value: '0', label: 'Низший' },
];

export default function BoardPage() {
  const { boardId, questId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLocalization();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [pendingTransition, setPendingTransition] = useState(null);
  const issueConfig = useBoardIssueConfig(boardId);
  const [boardSprints, setBoardSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [archiving, setArchiving] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [filterAssigneeId, setFilterAssigneeId] = useState('');
  const [filterIssueType, setFilterIssueType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [selectedQuestIds, setSelectedQuestIds] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [columnLayout, setColumnLayout] = useState(null);
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [sprintsLoaded, setSprintsLoaded] = useState(false);
  const isMobile = useMediaQuery();

  const loadSeqRef = useRef(0);
  const loadSprintsRef = useRef(null);
  const pendingMovesRef = useRef(0);

  const loadBoard = useCallback(async () => {
    if (!boardId) return;
    const seq = ++loadSeqRef.current;
    try {
      const [data, layout] = await Promise.all([boards.getById(boardId), boards.getColumnLayout(boardId).catch(() => null)]);
      // A stale response would snap an optimistically moved card back to its old column.
      if (seq !== loadSeqRef.current || pendingMovesRef.current > 0) return;
      setBoard(data);
      setColumnLayout(layout);
      setEditBoardName(data?.name ?? '');
      setEditBoardDesc(data?.description ?? '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const loadMembers = useCallback(async (teamId) => {
    if (!teamId) return;
    try {
      const list = await teams.getMembers(teamId);
      setMembers(Array.isArray(list) ? list : []);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Реалтайм: подписка на обновления доски (квест создан/изменён/удалён другим пользователем)
  const loadBoardRef = useRef(loadBoard);
  const loadMembersRef = useRef(loadMembers);
  const teamIdRef = useRef(board?.teamId);
  loadBoardRef.current = loadBoard;
  loadMembersRef.current = loadMembers;
  teamIdRef.current = board?.teamId;
  useEffect(() => {
    if (!boardId || !loadBoardRef.current) return;
    const token = localStorage.getItem('token');
    const hubUrl = API_BASE.replace(/\/$/, '') + '/hubs/board';
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token || '',
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();
    connection.on('BoardUpdated', () => {
      loadBoardRef.current?.();
      loadSprintsRef.current?.();
      loadMembersRef.current?.(teamIdRef.current);
    });
    connection.start()
      .then(() => connection.invoke('JoinBoard', boardId))
      .catch((err) => console.warn('Board hub connect:', err));
    return () => {
      connection.invoke('LeaveBoard', boardId).catch(() => {});
      connection.off('BoardUpdated');
      connection.stop().catch(() => {});
    };
  }, [boardId]);

  useEffect(() => {
    if (!board?.teamId) return;
    loadMembers(board.teamId);
  }, [board?.teamId, loadMembers]);

  const loadSprints = useCallback(() => {
    if (!boardId) { setBoardSprints([]); return; }
    sprintsApi.getByBoard(boardId)
      .then((list) => setBoardSprints(Array.isArray(list) ? list : []))
      .catch(() => setBoardSprints([]))
      .finally(() => setSprintsLoaded(true));
  }, [boardId]);
  loadSprintsRef.current = loadSprints;

  useEffect(() => {
    setSprintsLoaded(false);
    loadSprints();
  }, [loadSprints]);

  const handleMoveQuest = async (questIdMoved, targetColumnId, newOrder) => {
    const col = board?.columns?.find((c) => c.id === targetColumnId);
    const questIds = (col?.quests ?? []).map((q) => q.id);
    const fromCol = board?.columns?.find((c) => (c.quests ?? []).some((q) => q.id === questIdMoved));
    if (!fromCol) return;
    const sameColumn = fromCol.id === targetColumnId;
    const reordered = questIds.filter((id) => id !== questIdMoved);
    if (sameColumn) {
      reordered.splice(Math.min(newOrder, reordered.length), 0, questIdMoved);
      if (reordered.every((id, i) => id === questIds[i])) return;
    }
    let transition;
    if (!sameColumn && issueConfig.workflow) {
      const issue = { ...fromCol.quests.find((q) => q.id === questIdMoved), columnId: fromCol.id };
      const options = transitionsTo(issueConfig.workflow, issue, targetColumnId);
      if (options) {
        const own = issueWorkflow(issueConfig.workflow, issue);
        const toInitial = !own.statuses.includes(fromCol.id) && own.initial === targetColumnId;
        if (options.length === 0 && !toInitial) {
          window.alert(t('Этот переход запрещён workflow.'));
          return;
        }
        if (needsTransitionDialog(options)) {
          setPendingTransition({ issue, transitions: options, targetColumnId, newOrder, targetName: col?.title });
          return;
        }
        transition = options[0]?.key;
      }
    }

    setBoard((current) => current && { ...current, columns: moveQuestInColumns(current.columns, questIdMoved, targetColumnId, newOrder) });
    pendingMovesRef.current += 1;
    try {
      if (sameColumn) {
        await quests.reorder({ columnId: targetColumnId, questIdsInOrder: reordered });
      } else {
        await quests.move({ questId: questIdMoved, targetColumnId, newOrder, transition });
      }
    } catch (e) {
      console.error(e);
      if (/not allowed/i.test(e.message)) window.alert(t('Этот переход запрещён workflow.'));
      else if (issueConfig.workflow) window.alert(t(e.message));
    } finally {
      pendingMovesRef.current -= 1;
      if (pendingMovesRef.current === 0) loadBoard();
    }
  };

  const canEnterStatus = (questIdMoved, statusId) => {
    if (!issueConfig.workflow) return true;
    const fromCol = board?.columns?.find((c) => (c.quests ?? []).some((q) => q.id === questIdMoved));
    if (!fromCol) return true;
    const issue = { ...fromCol.quests.find((q) => q.id === questIdMoved), columnId: fromCol.id };
    const options = transitionsTo(issueConfig.workflow, issue, statusId);
    return !options || options.length > 0;
  };

  const handleAddColumn = async (title, isDoneColumn) => {
    if (!title?.trim() || !boardId) return;
    try {
      const order = (board?.columns?.length ?? 0);
      await columns.create(boardId, {
        title: title.trim(),
        order,
        kind: isDoneColumn ? 3 : 4,
      });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleColumnReorder = async (columnIdsInOrder) => {
    if (!boardId || !columnIdsInOrder?.length) return;
    try {
      await columns.reorder(boardId, columnIdsInOrder);
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateBoard = async (e) => {
    e.preventDefault();
    if (!boardId) return;
    try {
      await boards.update(boardId, { name: editBoardName.trim() || undefined, description: editBoardDesc.trim() || undefined });
      setEditBoardOpen(false);
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBoard = async () => {
    if (!boardId || !window.confirm(t('Удалить доску? Это действие нельзя отменить.'))) return;
    try {
      const result = await boards.delete(boardId);
      if (result === true) navigate('/');
      else if (result?.status === 403) window.alert(t('Удалить доску может только тот, кто её создал.'));
      else console.error('Не удалось удалить доску');
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveCompleted = async () => {
    if (!boardId || archiving) return;
    setArchiving(true);
    try {
      await quests.archiveCompleted(boardId);
      await loadBoard();
    } catch (e) {
      console.error(e);
    } finally {
      setArchiving(false);
    }
  };

  const handleUpdateColumn = async (columnId, title) => {
    if (!title?.trim()) return;
    try {
      await columns.update(columnId, { title: title.trim() });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateColumnKind = async (columnId, kind) => {
    try {
      await columns.update(columnId, { kind });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshColumn = async (columnId) => {
    try {
      const col = await columns.get(columnId);
      if (col && board) setBoard((prev) => ({ ...prev, columns: prev.columns.map((c) => c.id === col.id ? { ...c, ...col, quests: col.quests ?? col.Quests ?? c.quests } : c) }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshColumnQuests = async (columnId) => {
    try {
      const list = await quests.getByColumn(columnId);
      if (board) setBoard((prev) => ({ ...prev, columns: prev.columns.map((c) => c.id === columnId ? { ...c, quests: Array.isArray(list) ? list : c.quests } : c) }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm(t('Удалить колонку и все квесты в ней?'))) return;
    try {
      const ok = await columns.delete(columnId);
      if (ok) await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuest = async (questIdToDelete) => {
    if (!window.confirm(t('Удалить квест?'))) return;
    try {
      const ok = await quests.delete(questIdToDelete);
      if (ok) await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const openIssue = (id) => navigate(`/board/${boardId}/issue/${id}`);
  const closeIssue = () => navigate(`/board/${boardId}`);
  const toggleQuestSelection = (id, checked) => setSelectedQuestIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  const applyBulkUpdate = async (fields) => {
    try {
      await bulk.update(boardId, selectedQuestIds, fields);
      setSelectedQuestIds([]);
      await loadBoard();
    } catch (e) { window.alert(t(e.message || 'Не удалось выполнить массовое изменение.')); }
  };

  if (loading) return <div className="page">Загрузка доски...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;
  if (!board) return <div className="page">Доска не найдена.</div>;

  const boardColumns = (board.columns ?? []).filter((column) => column.kind !== ARCHIVE_COLUMN_KIND);
  const scrum = isScrumBoard(board);
  const sprintIds = activeSprintIds(boardSprints);
  const noActiveSprint = scrum && sprintsLoaded && sprintIds.size === 0;
  const visibleStatuses = scrum
    ? boardColumns.map((column) => ({ ...column, quests: (column.quests ?? column.Quests ?? []).filter((q) => sprintIds.has(q.sprintId)) }))
    : boardColumns;
  const layoutMode = !!columnLayout?.configured;
  const viewColumns = buildBoardColumns(visibleStatuses, columnLayout);
  const moveOnBoard = layoutMode
    ? (id, target, order) => {
      const drop = resolveLayoutDrop(viewColumns, visibleStatuses, id, target, order, (statusId) => canEnterStatus(id, statusId));
      return handleMoveQuest(id, drop.statusId, drop.order);
    }
    : handleMoveQuest;
  const completedQuestCount = boardColumns
    .filter((column) => column.kind === DONE_COLUMN_KIND)
    .reduce((total, column) => total + ((column.quests ?? column.Quests ?? []).length), 0);

  const activeFilterCount = [queryText, filterAssigneeId, filterIssueType, filterPriority].filter(Boolean).length;

  const questMatchesFilter = buildQuestFilter(queryText, {
    currentUserId: user?.id,
    members,
    sprints: boardSprints,
    fallback: { assigneeId: filterAssigneeId, issueType: filterIssueType, priority: filterPriority },
  });

  return (
    <div className="page board-page">
      {board.description && <p className="board-desc">{board.description}</p>}
      {editBoardOpen && (
        <form className="board-edit-form" onSubmit={handleUpdateBoard}>
          <label>Название <input value={editBoardName} onChange={(e) => setEditBoardName(e.target.value)} /></label>
          <label>Описание <input value={editBoardDesc} onChange={(e) => setEditBoardDesc(e.target.value)} /></label>
          <div className="board-edit-actions">
            <button type="submit">Сохранить</button>
            <button type="button" onClick={() => setEditBoardOpen(false)}>Отмена</button>
          </div>
        </form>
      )}

      <div className="board-toolbar">
        <div className="board-toolbar-search-wrap">
          <input
            type="text"
            className="board-toolbar-search"
            placeholder={isMobile ? 'Поиск задач' : 'Поиск: assignee:me priority:high type:bug label:… sprint:active текст'}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
          <button
            type="button"
            className="board-toolbar-help-btn"
            aria-label="Справка по синтаксису поиска"
            title={[
              'Поддерживаемый синтаксис поиска (можно сочетать с обычным текстом):',
              'assignee:me — мои задачи',
              'assignee:имя — задачи участника',
              'priority:highest|high|medium|low|lowest — приоритет',
              'type:epic|story|task|bug|subtask — тип задачи',
              'label:значение — задачи с меткой',
              'sprint:active — задачи активного спринта',
              'Остальной текст ищется по ключу и названию задачи.',
            ].join('\n')}
          >
            ?
          </button>
        </div>
        <button
          type="button"
          className={`board-toolbar-filter-btn ${filtersOpen ? 'is-open' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
          aria-label="Фильтры"
        >
          {isMobile ? (
            <svg className="board-toolbar-filter-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M3 5h18v2H3zm3 6h12v2H6zm4 6h4v2h-4z" />
            </svg>
          ) : 'Фильтры'}
          {activeFilterCount > 0 && <span className="board-toolbar-filter-count">{activeFilterCount}</span>}
        </button>
        <div className="board-more">
          <button type="button" className="board-btn board-more-btn" aria-label={t('Действия с доской')} title={t('Действия с доской')} aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>⋯</button>
          {moreOpen && (
            <>
              <div className="board-more-backdrop" onClick={() => setMoreOpen(false)} />
              <div className="board-more-menu" role="menu">
                <button type="button" role="menuitem" disabled={archiving || completedQuestCount === 0} onClick={() => { setMoreOpen(false); handleArchiveCompleted(); }}>
                  {archiving ? t('Архивация...') : `${t('Архивировать выполненные')} (${completedQuestCount})`}
                </button>
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setEditBoardOpen(true); }}>{t('Изменить название и описание')}</button>
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); setColumnConfigOpen(true); }}>{t('Настроить столбцы')}</button>
                <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); navigate(`/board/${boardId}/settings`); }}>{t('Настроить доску')}</button>
                {board.createdByUserId === user?.id && (
                  <button type="button" role="menuitem" className="board-more-danger" onClick={() => { setMoreOpen(false); handleDeleteBoard(); }}>{t('Удалить доску')}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {filtersOpen && (
        <div className="board-toolbar-filters">
          <label>
            Исполнитель
            <select value={filterAssigneeId} onChange={(e) => setFilterAssigneeId(e.target.value)}>
              <option value="">Все исполнители</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
            </select>
          </label>
          <label>
            Тип
            <select value={filterIssueType} onChange={(e) => setFilterIssueType(e.target.value)}>
              {ISSUE_TYPE_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          <label>
            Приоритет
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
              {PRIORITY_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="board-toolbar-filters-clear"
              onClick={() => { setQueryText(''); setFilterAssigneeId(''); setFilterIssueType(''); setFilterPriority(''); }}
            >
              Сбросить
            </button>
          )}
        </div>
      )}
      {selectedQuestIds.length > 0 && <div className="board-bulk-bar" role="toolbar">
        <strong>{t('Выбрано')}: {selectedQuestIds.length}</strong>
        <select defaultValue="" onChange={(e) => { if (e.target.value) applyBulkUpdate({ columnId: e.target.value }); }}>
          <option value="" disabled>{t('Изменить статус…')}</option>
          {boardColumns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
        </select>
        <select defaultValue="" onChange={(e) => { if (e.target.value !== '') applyBulkUpdate({ priority: Number(e.target.value) }); }}>
          <option value="" disabled>{t('Изменить приоритет…')}</option>
          {PRIORITY_FILTER_OPTIONS.filter((item) => item.value !== '').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button type="button" onClick={() => setSelectedQuestIds([])}>{t('Снять выбор')}</button>
      </div>}

      {noActiveSprint ? (
        <div className="board-empty-state" role="status">
          <h2>{t('Начните работу в бэклоге')}</h2>
          <p>{t('Запланируйте и начните спринт, чтобы увидеть здесь задачи.')}</p>
          <div className="board-empty-actions">
            <button type="button" className="app-btn app-btn-primary" onClick={() => navigate(`/board/${boardId}/backlog`)}>{t('Перейти в бэклог')}</button>
            <button type="button" className="app-btn app-btn-subtle" onClick={() => setColumnConfigOpen(true)}>{t('Настроить столбцы')}</button>
          </div>
        </div>
      ) : (
        <KanbanBoard
          boardId={boardId}
          columns={viewColumns}
          members={members}
          issueTypes={issueConfig.types}
          onMoveQuest={moveOnBoard}
          onAddColumn={layoutMode ? undefined : handleAddColumn}
          onColumnReorder={layoutMode ? undefined : handleColumnReorder}
          onRefresh={loadBoard}
          onUpdateColumn={layoutMode ? undefined : handleUpdateColumn}
          onUpdateColumnKind={layoutMode ? undefined : handleUpdateColumnKind}
          onRefreshColumn={layoutMode ? undefined : handleRefreshColumn}
          onRefreshColumnQuests={layoutMode || scrum ? undefined : handleRefreshColumnQuests}
          onDeleteColumn={layoutMode ? undefined : handleDeleteColumn}
          onDeleteQuest={handleDeleteQuest}
          onQuestClick={openIssue}
          questFilter={activeFilterCount > 0 ? questMatchesFilter : undefined}
          selectedQuestIds={selectedQuestIds}
          onSelectQuest={toggleQuestSelection}
          sprintId={scrum ? [...sprintIds][0] : undefined}
        />
      )}
      {columnConfigOpen && (
        <ColumnConfigDialog
          boardId={boardId}
          layout={columnLayout}
          issueConfig={issueConfig}
          onClose={() => setColumnConfigOpen(false)}
          onPublished={(saved) => { setColumnLayout(saved); setColumnConfigOpen(false); loadBoard(); }}
        />
      )}

      {questId && (
        <IssueDetailDrawer
          questId={questId}
          members={members}
          columns={boardColumns}
          onClose={closeIssue}
          onChanged={loadBoard}
        />
      )}
      {pendingTransition && (
        <TransitionScreenDialog
          issue={pendingTransition.issue}
          transitions={pendingTransition.transitions}
          targetName={pendingTransition.targetName}
          config={issueConfig}
          people={members}
          onCancel={() => setPendingTransition(null)}
          onSubmit={async (choice) => {
            const { issue, targetColumnId, newOrder } = pendingTransition;
            await quests.move({ questId: issue.id, targetColumnId, newOrder, ...choice });
            setPendingTransition(null);
            loadBoard();
          }}
        />
      )}
    </div>
  );
}
