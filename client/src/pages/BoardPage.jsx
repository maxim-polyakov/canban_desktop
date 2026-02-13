import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { boards, quests, teams } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import './BoardPage.css';

export default function BoardPage() {
  const { boardId } = useParams();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const data = await boards.getById(boardId);
      setBoard(data);
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
    try {
      await quests.move({ questId, targetColumnId, newOrder });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignQuest = async (questId, assigneeId) => {
    try {
      await quests.update(questId, { assigneeId: assigneeId || null });
      await loadBoard();
    } catch (e) {
      console.error(e);
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
      <h1 className="board-title">{board.name}</h1>
      {board.description && <p className="board-desc">{board.description}</p>}
      {board.teamId && (
        <p className="board-meta">
          ID команды: <code className="board-id">{board.teamId}</code>
          <button type="button" className="board-copy-id" onClick={copyTeamId} title="Скопировать">Копировать</button>
        </p>
      )}
      <KanbanBoard
        columns={board.columns}
        members={members}
        onMoveQuest={handleMoveQuest}
        onAssignQuest={handleAssignQuest}
        onRefresh={loadBoard}
      />
    </div>
  );
}
