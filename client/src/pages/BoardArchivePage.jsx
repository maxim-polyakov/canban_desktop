import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { boards, quests } from '../api.js';
import AssigneeSummary from '../components/AssigneeSummary.jsx';
import './BoardPage.css';

export default function BoardArchivePage() {
  const { boardId } = useParams();
  const [board, setBoard] = useState(null);
  const [archiveQuests, setArchiveQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadArchive = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setError('');
    try {
      const [boardData, archived] = await Promise.all([
        boards.getById(boardId),
        quests.getArchiveByBoard(boardId),
      ]);
      setBoard(boardData);
      setArchiveQuests(Array.isArray(archived) ? archived : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  if (loading) return <div className="page">Загрузка архива...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;

  return (
    <div className="page board-page">
      <div className="board-header-row">
        <div>
          <h1 className="board-title">Архив: {board?.name ?? 'доска'}</h1>
          <p className="board-desc">Здесь хранятся выполненные квесты, убранные с рабочей доски.</p>
        </div>
        <div className="board-actions">
          <Link to={`/board/${boardId}`} className="board-btn board-btn-link">К доске</Link>
          <button type="button" className="board-btn" onClick={loadArchive}>Обновить</button>
        </div>
      </div>

      {archiveQuests.length === 0 ? (
        <div className="board-archive-empty">В архиве пока нет квестов.</div>
      ) : (
        <ul className="board-archive-list">
          {archiveQuests.map((quest) => (
            <li key={quest.id} className="board-archive-item">
              <div className="board-archive-item-main">
                <span className="board-archive-item-title">{quest.title}</span>
                {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
              </div>
              {quest.description && <p className="board-archive-description">{quest.description}</p>}
              <div className="board-archive-meta">
                <AssigneeSummary assignees={quest.assignees} label="Исполнители:" />
                {quest.completedAt && <span>Выполнено: {new Date(quest.completedAt).toLocaleString()}</span>}
                {quest.dueDate && <span>Срок: {new Date(quest.dueDate).toLocaleDateString()}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
