import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from '../i18n/navigation.jsx';
import { boards, quests, sprints as sprintsApi, teams } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon } from '../components/IssueIcons.jsx';
import AssigneeAvatar from '../components/AssigneeAvatar.jsx';
import IssueDetailDrawer from '../components/IssueDetailDrawer.jsx';
import './BacklogPage.css';

const BACKLOG_COLUMN_KIND = 0;

function IssueRow({ quest, onOpen, sprintOptions, onMoveToSprint, onMoveToBacklog }) {
  return (
    <li className="backlog-issue-row">
      <IssueTypeIcon issueType={quest.issueType} size={16} />
      <button type="button" className="backlog-issue-key" onClick={() => onOpen(quest.id)}>{quest.issueKey}</button>
      <button type="button" className="backlog-issue-title" onClick={() => onOpen(quest.id)} title={quest.title}>
        {quest.title}
      </button>
      <span className="backlog-issue-spacer" />
      {quest.labels && String(quest.labels).split(',').filter(Boolean).slice(0, 2).map((label) => (
        <span key={label} className="backlog-issue-label">{label.trim()}</span>
      ))}
      {quest.xpReward > 0 && <span className="backlog-issue-xp">+{quest.xpReward} XP</span>}
      <PriorityIcon priority={quest.priority} size={14} />
      <span className="backlog-issue-assignees">
        {(quest.assignees ?? []).slice(0, 3).map((a) => (
          <AssigneeAvatar key={a.userId} userId={a.userId} displayName={a.displayName} avatarUrl={a.avatarUrl} size={20} />
        ))}
      </span>
      {onMoveToBacklog ? (
        <button type="button" className="backlog-issue-move-btn" onClick={() => onMoveToBacklog(quest.id)}>В бэклог</button>
      ) : (
        sprintOptions && sprintOptions.length > 0 && (
          <select
            className="backlog-issue-move-select"
            defaultValue=""
            onChange={(e) => { if (e.target.value) { onMoveToSprint(quest.id, e.target.value); e.target.value = ''; } }}
          >
            <option value="" disabled>В спринт…</option>
            {sprintOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )
      )}
    </li>
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

  const handleStartSprint = async (sprintId) => {
    try {
      await sprintsApi.start(sprintId, {});
      await loadAll();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось запустить спринт.'));
    }
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

      {futureAndActiveSprints.map((sprint) => (
        <section key={sprint.id} className="backlog-sprint-panel">
          <header className="backlog-sprint-header">
            <span className="backlog-sprint-name">{sprint.name}</span>
            {sprint.status === 1 && <span className="chip chip-accent">Активный</span>}
            {sprint.goal && <span className="backlog-sprint-goal">{sprint.goal}</span>}
            <span className="backlog-sprint-count">{(sprintQuests[sprint.id] ?? []).length} задач</span>
            <span className="backlog-issue-spacer" />
            {sprint.status === 0 && (
              <button type="button" className="backlog-sprint-action" onClick={() => handleStartSprint(sprint.id)}>Начать спринт</button>
            )}
            {sprint.status === 1 && (
              <button type="button" className="backlog-sprint-action" onClick={() => handleCompleteSprint(sprint.id)}>Завершить спринт</button>
            )}
            <button type="button" className="backlog-sprint-action backlog-sprint-delete" onClick={() => handleDeleteSprint(sprint.id)}>Удалить</button>
          </header>
          <ul className="backlog-issue-list">
            {(sprintQuests[sprint.id] ?? []).map((q) => (
              <IssueRow key={q.id} quest={q} onOpen={openIssue} onMoveToBacklog={moveQuestToBacklog} />
            ))}
            {(sprintQuests[sprint.id] ?? []).length === 0 && <li className="backlog-empty">Нет задач в этом спринте.</li>}
          </ul>
        </section>
      ))}

      <section className="backlog-sprint-panel backlog-backlog-panel">
        <header className="backlog-sprint-header">
          <span className="backlog-sprint-name">Бэклог</span>
          <span className="backlog-sprint-count">{backlogQuests.length} задач</span>
        </header>
        <ul className="backlog-issue-list">
          {backlogQuests.map((q) => (
            <IssueRow
              key={q.id}
              quest={q}
              onOpen={openIssue}
              sprintOptions={futureAndActiveSprints}
              onMoveToSprint={moveQuestToSprint}
            />
          ))}
          {backlogQuests.length === 0 && <li className="backlog-empty">Бэклог пуст.</li>}
        </ul>
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

      {questId && (
        <IssueDetailDrawer
          questId={questId}
          members={members}
          onClose={closeIssue}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}
