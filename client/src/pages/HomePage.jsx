import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { boards, teams, character, leaderboard, activity } from '../api.js';
import './HomePage.css';

export default function HomePage() {
  const { user } = useAuth();
  const [myTeamsWithBoards, setMyTeamsWithBoards] = useState([]);
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
  const [editTeamId, setEditTeamId] = useState(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamDesc, setEditTeamDesc] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState({});
  const [teamLeaderboard, setTeamLeaderboard] = useState({});
  const [teamActivity, setTeamActivity] = useState({});
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteUserIdError, setInviteUserIdError] = useState('');
  const [addingByUserId, setAddingByUserId] = useState(false);
  const [userCharacter, setUserCharacter] = useState({});
  const [addBoardTeamId, setAddBoardTeamId] = useState(null);
  const [addBoardName, setAddBoardName] = useState('');
  const [addBoardError, setAddBoardError] = useState('');
  const [addingBoard, setAddingBoard] = useState(false);
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
                description: team.description ?? team.Description ?? '',
                ownerId: team.ownerId ?? team.OwnerId ?? null,
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
          team: { id: team.id ?? team.Id, name: team.name ?? team.Name ?? 'Команда', description: team.description ?? team.Description ?? '', ownerId: team.ownerId ?? team.OwnerId ?? null },
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
        loadTeamMembers(teamId);
      } else {
        setInviteError(result.error || 'Не удалось добавить.');
      }
    } catch (err) {
      setInviteError(err.message || 'Ошибка.');
    } finally {
      setInviting(false);
    }
  };

  const loadTeamMembers = async (teamId) => {
    if (!teamId) return;
    try {
      const list = await teams.getMembers(teamId);
      setTeamMembers((prev) => ({ ...prev, [teamId]: Array.isArray(list) ? list : [] }));
    } catch (_) {
      setTeamMembers((prev) => ({ ...prev, [teamId]: [] }));
    }
  };

  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    if (!editTeamId || !editTeamName.trim()) return;
    try {
      await teams.update(editTeamId, { name: editTeamName.trim(), description: editTeamDesc.trim() || undefined });
      setEditTeamId(null);
      loadTeams();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (teamId, userId) => {
    if (!window.confirm('Исключить участника из команды?')) return;
    try {
      const ok = await teams.removeMember(teamId, userId);
      if (ok) loadTeamMembers(teamId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Удалить команду и все её доски? Это действие нельзя отменить.')) return;
    try {
      const ok = await teams.delete(teamId);
      if (ok) loadTeams();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBoardToTeam = async (e, teamId) => {
    e.preventDefault();
    const name = addBoardName.trim();
    if (!name) {
      setAddBoardError('Введите название доски.');
      return;
    }
    setAddBoardError('');
    setAddingBoard(true);
    try {
      const board = await boards.create({ name, description: '', teamId });
      setAddBoardTeamId(null);
      setAddBoardName('');
      await loadBoardsForTeam(teamId);
      navigate(`/board/${board.id}`);
    } catch (err) {
      setAddBoardError(err.message || 'Не удалось создать доску.');
    } finally {
      setAddingBoard(false);
    }
  };

  const loadLeaderboard = async (teamId) => {
    if (!teamId) return;
    try {
      const list = await leaderboard.getTeam(teamId);
      const arr = Array.isArray(list) ? list : [];
      setTeamLeaderboard((prev) => ({ ...prev, [teamId]: arr }));
      arr.forEach((entry) => loadUserCharacter(entry.userId));
    } catch (_) {
      setTeamLeaderboard((prev) => ({ ...prev, [teamId]: [] }));
    }
  };

  const loadActivity = async (teamId) => {
    if (!teamId) return;
    try {
      const list = await activity.getTeamFeed(teamId);
      setTeamActivity((prev) => ({ ...prev, [teamId]: Array.isArray(list) ? list : [] }));
    } catch (_) {
      setTeamActivity((prev) => ({ ...prev, [teamId]: [] }));
    }
  };

  const loadBoardsForTeam = async (teamId) => {
    if (!teamId) return;
    try {
      const boardsList = await boards.getByTeam(teamId);
      setMyTeamsWithBoards((prev) => prev.map((item) =>
        item.team?.id === teamId
          ? { ...item, boards: Array.isArray(boardsList) ? boardsList.map((b) => ({ id: b.id ?? b.Id, name: b.name ?? b.Name ?? 'Доска' })) : item.boards }
          : item
      ));
    } catch (_) {}
  };

  const loadTeamDetails = async (teamId) => {
    if (!teamId) return;
    try {
      const t = await teams.get(teamId);
      setEditTeamName(t?.name ?? '');
      setEditTeamDesc(t?.description ?? '');
      setEditTeamId(teamId);
    } catch (_) {
      setEditTeamName(myTeamsWithBoards.find((i) => i.team?.id === teamId)?.team?.name ?? '');
      setEditTeamDesc(myTeamsWithBoards.find((i) => i.team?.id === teamId)?.team?.description ?? '');
      setEditTeamId(teamId);
    }
  };

  const handleAddByUserId = async (e, teamId) => {
    e.preventDefault();
    const uid = inviteUserId.trim();
    if (!uid) return;
    setInviteUserIdError('');
    setAddingByUserId(true);
    try {
      const ok = await teams.addMember(teamId, uid);
      if (ok) {
        setInviteUserId('');
        loadTeamMembers(teamId);
      } else {
        setInviteUserIdError('Не удалось добавить.');
      }
    } catch (err) {
      setInviteUserIdError(err.message || 'Ошибка.');
    } finally {
      setAddingByUserId(false);
    }
  };

  const loadUserCharacter = (userId) => {
    if (userCharacter[userId] !== undefined) return;
    setUserCharacter((prev) => ({ ...prev, [userId]: null }));
    character.getByUser(userId).then((c) => setUserCharacter((prev) => ({ ...prev, [userId]: c }))).catch(() => setUserCharacter((prev) => ({ ...prev, [userId]: null })));
  };

  const toggleExpand = (teamId) => {
    const next = expandedTeamId === teamId ? null : teamId;
    setExpandedTeamId(next);
    if (next && !teamMembers[next]) loadTeamMembers(next);
    if (next && teamLeaderboard[next] === undefined) loadLeaderboard(next);
    if (next && teamActivity[next] === undefined) loadActivity(next);
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
                <div className="home-team-header">
                  {editTeamId === item.team?.id ? (
                    <form className="home-team-edit-form" onSubmit={handleUpdateTeam}>
                      <input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="Название команды" />
                      <input value={editTeamDesc} onChange={(e) => setEditTeamDesc(e.target.value)} placeholder="Описание" />
                      <div className="home-team-edit-actions">
                        <button type="submit">Сохранить</button>
                        <button type="button" onClick={() => { setEditTeamId(null); }}>Отмена</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="home-team-name">{item.team?.name}</span>
                      <button type="button" className="home-team-btn home-team-edit-btn" onClick={() => loadTeamDetails(item.team?.id)} title="Изменить команду">✎</button>
                      <button type="button" className="home-team-btn home-team-refresh-boards" onClick={() => loadBoardsForTeam(item.team?.id)} title="Обновить список досок">↻</button>
                      {item.team?.ownerId && user?.id && item.team.ownerId === user.id && (
                        <button type="button" className="home-team-btn home-team-delete-btn" onClick={() => handleDeleteTeam(item.team?.id)} title="Удалить команду">🗑</button>
                      )}
                    </>
                  )}
                </div>
                <ul className="home-team-boards">
                  {(item.boards ?? []).map((b) => (
                    <li key={b.id}>
                      <Link to={`/board/${b.id}`}>{b.name}</Link>
                    </li>
                  ))}
                </ul>
                {!(item.boards?.length) && <p className="home-empty">В команде пока нет досок.</p>}
                <div className="home-add-board">
                  {addBoardTeamId !== item.team?.id ? (
                    <button type="button" className="home-add-board-btn" onClick={() => { setAddBoardTeamId(item.team?.id); setAddBoardName(''); setAddBoardError(''); }}>
                      + Добавить доску
                    </button>
                  ) : (
                    <form className="home-add-board-form" onSubmit={(e) => handleAddBoardToTeam(e, item.team?.id)}>
                      <input
                        type="text"
                        placeholder="Название доски"
                        value={addBoardName}
                        onChange={(e) => setAddBoardName(e.target.value)}
                        disabled={addingBoard}
                        autoFocus
                      />
                      <div className="home-add-board-actions">
                        <button type="submit" disabled={addingBoard || !addBoardName.trim()}>{addingBoard ? '…' : 'Создать'}</button>
                        <button type="button" onClick={() => { setAddBoardTeamId(null); setAddBoardName(''); setAddBoardError(''); }} disabled={addingBoard}>Отмена</button>
                      </div>
                      {addBoardError && <p className="home-add-board-error">{addBoardError}</p>}
                    </form>
                  )}
                </div>
                <div className="home-team-invite">
                  {inviteTeamId !== item.team?.id ? (
                    <button type="button" className="home-invite-btn" onClick={() => { setInviteTeamId(item.team?.id); setInviteError(''); }}>Добавить участника</button>
                  ) : (
                    <>
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
                      <form className="home-invite-form home-invite-by-id" onSubmit={(e) => handleAddByUserId(e, item.team?.id)}>
                        <input type="text" placeholder="ID пользователя (GUID)" value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} disabled={addingByUserId} />
                        <div className="home-invite-actions">
                          <button type="submit" disabled={addingByUserId || !inviteUserId.trim()}>{addingByUserId ? '…' : 'Добавить по ID'}</button>
                        </div>
                        {inviteUserIdError && <p className="home-invite-error">{inviteUserIdError}</p>}
                      </form>
                    </>
                  )}
                </div>
                <div className="home-team-expand">
                  <button type="button" className="home-expand-btn" onClick={() => toggleExpand(item.team?.id)}>
                    {expandedTeamId === item.team?.id ? '▼ Свернуть' : '▶ Участники, рейтинг, лента'}
                  </button>
                </div>
                {expandedTeamId === item.team?.id && (
                  <div className="home-team-details">
                    <div className="home-detail-section">
                      <h4>Участники</h4>
                      <ul className="home-members-list">
                        {(teamMembers[item.team?.id] ?? []).map((m) => (
                          <li key={m.userId} className="home-member-item">
                            {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="home-member-avatar" /> : <span className="home-member-avatar-placeholder">{m.displayName?.charAt(0)}</span>}
                            <span>{m.displayName}</span>
                            <button type="button" className="home-member-level" onClick={() => loadUserCharacter(m.userId)} title="Показать уровень">
                              {userCharacter[m.userId] !== undefined ? (userCharacter[m.userId] ? `Ур.${userCharacter[m.userId].levelNumber}` : '—') : '…'}
                            </button>
                            {m.userId !== user?.id && (
                              <button type="button" className="home-member-remove" onClick={() => handleRemoveMember(item.team?.id, m.userId)} title="Исключить">✕</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="home-detail-section">
                      <h4>Рейтинг (неделя)</h4>
                      <ol className="home-leaderboard-list">
                        {(teamLeaderboard[item.team?.id] ?? []).map((entry) => (
                          <li key={entry.userId}>
                            #{entry.rank} {entry.userName} — {entry.totalXpGained} XP
                            {userCharacter[entry.userId] != null && <span className="home-leaderboard-level"> (ур. {userCharacter[entry.userId].levelNumber})</span>}
                          </li>
                        ))}
                      </ol>
                      {(!teamLeaderboard[item.team?.id]?.length) && <p className="home-empty">Нет данных</p>}
                    </div>
                    <div className="home-detail-section">
                      <h4>Лента активностей</h4>
                      <ul className="home-activity-list">
                        {(teamActivity[item.team?.id] ?? []).map((a) => (
                          <li key={a.id} className="home-activity-item">
                            <strong>{a.title}</strong>
                            {a.description && <span> — {a.description}</span>}
                          </li>
                        ))}
                      </ul>
                      {(!teamActivity[item.team?.id]?.length) && <p className="home-empty">Нет записей</p>}
                    </div>
                  </div>
                )}
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
      </section>
    </div>
  );
}
