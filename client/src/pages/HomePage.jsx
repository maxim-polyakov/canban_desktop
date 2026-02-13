import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boards, teams, character } from '../api.js';
import './HomePage.css';

export default function HomePage() {
  const [myTeamsWithBoards, setMyTeamsWithBoards] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [boardListByTeamId, setBoardListByTeamId] = useState([]);
  const [char, setChar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createBoardName, setCreateBoardName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [teamsRes, charRes] = await Promise.all([
          teams.getMyTeamsWithBoards().catch(() => []),
          character.getMe().catch(() => null),
        ]);
        if (!cancelled) {
          const list = Array.isArray(teamsRes) ? teamsRes : [];
          setMyTeamsWithBoards(list.map((item) => {
            const team = item.team ?? item.Team ?? {};
            const boardsList = item.boards ?? item.Boards ?? [];
            return {
              team: {
                id: team.id ?? team.Id,
                name: team.name ?? team.Name ?? 'Команда',
              },
              boards: boardsList.map((b) => ({
                id: b.id ?? b.Id,
                name: b.name ?? b.Name ?? 'Доска',
              })),
            };
          }));
          setChar(charRes);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!teamId) {
      setBoardListByTeamId([]);
      return;
    }
    let cancelled = false;
    boards.getByTeam(teamId).then((list) => {
      if (!cancelled) setBoardListByTeamId(Array.isArray(list) ? list : []);
    }).catch(() => { if (!cancelled) setBoardListByTeamId([]); });
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

  const loadTeams = async () => {
    try {
      const teamsRes = await teams.getMyTeamsWithBoards().catch(() => []);
      const list = Array.isArray(teamsRes) ? teamsRes : [];
      setMyTeamsWithBoards(list.map((item) => {
        const team = item.team ?? item.Team ?? {};
        const boardsList = item.boards ?? item.Boards ?? [];
        return {
          team: { id: team.id ?? team.Id, name: team.name ?? team.Name ?? 'Команда' },
          boards: boardsList.map((b) => ({ id: b.id ?? b.Id, name: b.name ?? b.Name ?? 'Доска' })),
        };
      }));
    } catch (_) {}
  };

  const handleInvite = async (e, teamId) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteError('');
    setInviting(true);
    try {
      const result = await teams.inviteByEmail(teamId, email);
      if (result.ok) {
        setInviteEmail('');
        setInviteTeamId(null);
        loadTeams();
      } else {
        setInviteError(result.error || 'Не удалось добавить.');
      }
    } catch (err) {
      setInviteError(err.message || 'Ошибка.');
    } finally {
      setInviting(false);
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
        <h2>Мои команды и доски</h2>
        {myTeamsWithBoards.length > 0 && (
          <ul className="home-teams-list">
            {myTeamsWithBoards.map((item) => (
              <li key={item.team?.id} className="home-team-block">
                <span className="home-team-name">{item.team?.name}</span>
                <ul className="home-team-boards">
                  {(item.boards ?? []).map((b) => (
                    <li key={b.id}>
                      <Link to={`/board/${b.id}`}>{b.name}</Link>
                    </li>
                  ))}
                </ul>
                {!(item.boards?.length) && <p className="home-empty">В команде пока нет досок.</p>}
                <div className="home-team-invite">
                  {inviteTeamId !== item.team?.id ? (
                    <button type="button" className="home-invite-btn" onClick={() => { setInviteTeamId(item.team?.id); setInviteError(''); }}>Добавить участника</button>
                  ) : (
                    <form className="home-invite-form" onSubmit={(e) => handleInvite(e, item.team?.id)}>
                      <input
                        type="email"
                        placeholder="Email участника"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        disabled={inviting}
                      />
                      <div className="home-invite-actions">
                        <button type="submit" disabled={inviting}>{inviting ? '…' : 'Добавить'}</button>
                        <button type="button" onClick={() => { setInviteTeamId(null); setInviteEmail(''); setInviteError(''); }} disabled={inviting}>Отмена</button>
                      </div>
                      {inviteError && <p className="home-invite-error">{inviteError}</p>}
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {myTeamsWithBoards.length === 0 && !loading && <p className="home-empty">Вы не состоите ни в одной команде. Создайте команду и доску.</p>}
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
        {boardListByTeamId.length > 0 && (
          <ul className="board-list">
            {boardListByTeamId.map((b) => (
              <li key={b.id}>
                <Link to={`/board/${b.id}`}>{b.name}</Link>
              </li>
            ))}
          </ul>
        )}
        {boardListByTeamId.length === 0 && teamId && <p className="home-empty">Досок не найдено.</p>}
      </section>
    </div>
  );
}
