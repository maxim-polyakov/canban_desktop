import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boards, teams, character } from '../api.js';
import './HomePage.css';

export default function HomePage() {
  const [teamId, setTeamId] = useState('');
  const [boardList, setBoardList] = useState([]);
  const [char, setChar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createBoardName, setCreateBoardName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [boardsRes, charRes] = await Promise.all([
          teamId ? boards.getByTeam(teamId) : Promise.resolve([]),
          character.getMe().catch(() => null),
        ]);
        if (!cancelled) {
          setBoardList(Array.isArray(boardsRes) ? boardsRes : []);
          setChar(charRes);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [teamId]);

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    setCreateError('');
    const teamName = createTeamName.trim();
    const boardName = createBoardName.trim();
    if (!teamName || !boardName) {
      setCreateError('Введите название команды и доски.');
      return;
    }
    setCreating(true);
    try {
      const team = await teams.create({ name: teamName, description: '' });
      const board = await boards.create({ name: boardName, description: '', teamId: team.id });
      setShowCreate(false);
      setCreateTeamName('');
      setCreateBoardName('');
      navigate(`/board/${board.id}`);
    } catch (err) {
      setCreateError(err.message || 'Не удалось создать доску.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="page">Загрузка...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;

  return (
    <div className="page home-page">
      {char && (
        <section className="home-character">
          <h2>Персонаж</h2>
          <p>Уровень {char.levelNumber} · {char.totalXp} XP</p>
          {char.levelTitle && <span className="home-badge">{char.levelTitle}</span>}
        </section>
      )}
      <section className="home-boards">
        <h2>Доски</h2>
        {!showCreate ? (
          <button type="button" className="home-create-btn" onClick={() => setShowCreate(true)}>
            Создать команду и доску
          </button>
        ) : (
          <form className="home-create-form" onSubmit={handleCreateBoard}>
            <h3>Новая доска</h3>
            {createError && <p className="home-create-error">{createError}</p>}
            <label>
              Название команды
              <input
                type="text"
                placeholder="Например: Наша команда"
                value={createTeamName}
                onChange={(e) => setCreateTeamName(e.target.value)}
                disabled={creating}
              />
            </label>
            <label>
              Название доски
              <input
                type="text"
                placeholder="Например: Канбан проекта"
                value={createBoardName}
                onChange={(e) => setCreateBoardName(e.target.value)}
                disabled={creating}
              />
            </label>
            <div className="home-create-actions">
              <button type="submit" disabled={creating}>{creating ? 'Создание…' : 'Создать'}</button>
              <button type="button" onClick={() => { setShowCreate(false); setCreateError(''); }} disabled={creating}>Отмена</button>
            </div>
          </form>
        )}
        <p className="home-hint">Или укажите ID команды и загрузите список досок.</p>
        <input
          type="text"
          placeholder="ID команды (UUID)"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setTeamId(e.target.value)}
          className="home-team-input"
        />
        <ul className="board-list">
          {boardList.map((b) => (
            <li key={b.id}>
              <Link to={`/board/${b.id}`}>{b.name}</Link>
            </li>
          ))}
        </ul>
        {boardList.length === 0 && teamId && <p className="home-empty">Досок не найдено.</p>}
      </section>
    </div>
  );
}
