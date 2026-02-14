import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { boards, columns, quests, teams } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import './BoardPage.css';

export default function BoardPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [questDetailId, setQuestDetailId] = useState(null);
  const [questDetail, setQuestDetail] = useState(null);
  const [editQuestTitle, setEditQuestTitle] = useState('');
  const [editQuestDescription, setEditQuestDescription] = useState('');
  const [editQuestXpReward, setEditQuestXpReward] = useState(0);
  const [savingQuest, setSavingQuest] = useState(false);

  const loadBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const data = await boards.getById(boardId);
      setBoard(data);
      setEditBoardName(data?.name ?? '');
      setEditBoardDesc(data?.description ?? '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!board?.teamId) return;
    let cancelled = false;
    teams.getMembers(board.teamId).then((list) => {
      if (!cancelled) setMembers(Array.isArray(list) ? list : []);
    }).catch(() => { if (!cancelled) setMembers([]); });
    return () => { cancelled = true; };
  }, [board?.teamId]);

  const handleMoveQuest = async (questId, targetColumnId, newOrder) => {
    const col = board?.columns?.find((c) => c.id === targetColumnId);
    const questIds = (col?.quests ?? []).map((q) => q.id);
    const fromCol = board?.columns?.find((c) => (c.quests ?? []).some((q) => q.id === questId));
    const sameColumn = fromCol?.id === targetColumnId;
    try {
      if (sameColumn) {
        const reordered = [...questIds];
        const idx = reordered.indexOf(questId);
        if (idx !== -1) {
          reordered.splice(idx, 1);
          reordered.splice(Math.min(newOrder, reordered.length), 0, questId);
          await quests.reorder({ columnId: targetColumnId, questIdsInOrder: reordered });
        }
      } else {
        await quests.move({ questId, targetColumnId, newOrder });
      }
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignQuest = async (questId, assigneeId) => {
    try {
      await quests.update(questId, { assigneeId: assigneeId || null, assigneeIdSet: true });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
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
    if (!boardId || !window.confirm('Удалить доску? Это действие нельзя отменить.')) return;
    try {
      const result = await boards.delete(boardId);
      if (result === true) navigate('/');
      else if (result?.status === 403) window.alert('Удалить доску может только тот, кто её создал.');
      else console.error('Не удалось удалить доску');
    } catch (e) {
      console.error(e);
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
    if (!window.confirm('Удалить колонку и все квесты в ней?')) return;
    try {
      const ok = await columns.delete(columnId);
      if (ok) await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuest = async (questId) => {
    if (!window.confirm('Удалить квест?')) return;
    try {
      const ok = await quests.delete(questId);
      if (ok) { setQuestDetailId(null); setQuestDetail(null); await loadBoard(); }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!questDetailId) { setQuestDetail(null); return; }
    let cancelled = false;
    quests.get(questDetailId).then((q) => {
      if (!cancelled) {
        setQuestDetail(q);
        setEditQuestTitle(q?.title ?? '');
        setEditQuestDescription(q?.description ?? '');
        setEditQuestXpReward(typeof q?.xpReward === 'number' ? q.xpReward : 0);
      }
    }).catch(() => { if (!cancelled) setQuestDetail(null); });
    return () => { cancelled = true; };
  }, [questDetailId]);

  const handleSaveQuest = async () => {
    if (!questDetailId) return;
    setSavingQuest(true);
    try {
      const xp = Math.max(0, Math.min(9999, Number(editQuestXpReward) || 0));
      await quests.update(questDetailId, { title: editQuestTitle.trim(), description: editQuestDescription.trim(), xpReward: xp });
      const updated = await quests.get(questDetailId);
      setQuestDetail(updated);
      await loadBoard();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingQuest(false);
    }
  };

  if (loading) return <div className="page">Загрузка доски...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;
  if (!board) return <div className="page">Доска не найдена.</div>;

  const copyTeamId = () => {
    if (board.teamId) {
      navigator.clipboard.writeText(board.teamId);
    }
  };

  return (
    <div className="page board-page">
      <div className="board-header-row">
        <div>
          <h1 className="board-title">{board.name}</h1>
          {board.description && <p className="board-desc">{board.description}</p>}
        </div>
        <div className="board-actions">
          <button type="button" className="board-btn board-btn-edit" onClick={() => setEditBoardOpen(true)} title="Изменить доску">✎</button>
          {board.createdByUserId === user?.id && (
            <button type="button" className="board-btn board-btn-delete" onClick={handleDeleteBoard} title="Удалить доску">✕</button>
          )}
        </div>
      </div>
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
      {board.teamId && (
        <p className="board-meta">
          ID команды: <code className="board-id">{board.teamId}</code>
          <button type="button" className="board-copy-id" onClick={copyTeamId} title="Скопировать">Копировать</button>
        </p>
      )}
      <KanbanBoard
        boardId={boardId}
        columns={board.columns}
        members={members}
        onMoveQuest={handleMoveQuest}
        onAssignQuest={handleAssignQuest}
        onAddColumn={handleAddColumn}
        onColumnReorder={handleColumnReorder}
        onRefresh={loadBoard}
        onUpdateColumn={handleUpdateColumn}
        onUpdateColumnKind={handleUpdateColumnKind}
        onRefreshColumn={handleRefreshColumn}
        onRefreshColumnQuests={handleRefreshColumnQuests}
        onDeleteColumn={handleDeleteColumn}
        onDeleteQuest={handleDeleteQuest}
        onQuestClick={setQuestDetailId}
      />
      {questDetailId && (
        <div className="board-quest-modal-overlay" onClick={() => { setQuestDetailId(null); setQuestDetail(null); }}>
          <div className="board-quest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="board-quest-modal-header">
              <h3>Квест</h3>
              <button type="button" className="board-quest-modal-close" onClick={() => { setQuestDetailId(null); setQuestDetail(null); }}>✕</button>
            </div>
            {questDetail ? (
              <div className="board-quest-modal-body">
                <label className="board-quest-modal-field">
                  Название
                  <input value={editQuestTitle} onChange={(e) => setEditQuestTitle(e.target.value)} />
                </label>
                <label className="board-quest-modal-field">
                  Описание
                  <textarea value={editQuestDescription} onChange={(e) => setEditQuestDescription(e.target.value)} rows={3} placeholder="Описание квеста" />
                </label>
                {questDetail.assigneeName && <p>Исполнитель: {questDetail.assigneeName}</p>}
                {questDetail.dueDate && <p>Срок: {new Date(questDetail.dueDate).toLocaleDateString()}</p>}
                <label className="board-quest-modal-field">
                  Опыт (XP)
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={editQuestXpReward}
                    onChange={(e) => setEditQuestXpReward(Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0)))}
                  />
                </label>
                <p className="board-quest-modal-meta">Создан: {questDetail.createdAt ? new Date(questDetail.createdAt).toLocaleString() : ''}</p>
                <div className="board-quest-modal-actions">
                  <button type="button" onClick={handleSaveQuest} disabled={savingQuest || !editQuestTitle.trim()}>{savingQuest ? 'Сохранение…' : 'Сохранить'}</button>
                </div>
              </div>
            ) : (
              <div className="board-quest-modal-body">Загрузка…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
