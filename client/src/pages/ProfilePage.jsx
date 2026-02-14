import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { auth, character, achievements, skills, users } from '../api.js';
import './ProfilePage.css';

export default function ProfilePage() {
  const { userId: routeUserId } = useParams();
  const { user, setUserFromResponse } = useAuth();
  const fileInputRef = useRef(null);
  const [profileUser, setProfileUser] = useState(null);
  const [char, setChar] = useState(null);
  const [xpHistory, setXpHistory] = useState([]);
  const [myAchievements, setMyAchievements] = useState([]);
  const [allAchievements, setAllAchievements] = useState([]);
  const [skillTree, setSkillTree] = useState(null);
  const [unlockedSkills, setUnlockedSkills] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarDeleting, setAvatarDeleting] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const isOwnProfile = !routeUserId || routeUserId === user?.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isOwnProfile) {
          const [charRes, xpRes, myAchRes, allAchRes, treeRes, unlockedRes, levelsRes] = await Promise.all([
            character.getMe().catch(() => null),
            character.getXpHistory(50).catch(() => []),
            achievements.getMy().catch(() => []),
            achievements.getAll().catch(() => []),
            skills.getTree().catch(() => null),
            skills.getUnlocked().catch(() => []),
            character.getLevels().catch(() => []),
          ]);
          if (!cancelled) {
            setChar(charRes);
            setXpHistory(Array.isArray(xpRes) ? xpRes : []);
            setMyAchievements(Array.isArray(myAchRes) ? myAchRes : []);
            setAllAchievements(Array.isArray(allAchRes) ? allAchRes : []);
            setSkillTree(treeRes);
            setUnlockedSkills(Array.isArray(unlockedRes) ? unlockedRes : []);
            setLevels(Array.isArray(levelsRes) ? levelsRes : []);
          }
        } else {
          const targetUserId = routeUserId;
          const [userRes, charRes, myAchRes, allAchRes, treeRes, unlockedRes, levelsRes] = await Promise.all([
            users.getPublic(targetUserId).catch(() => null),
            character.getByUser(targetUserId).catch(() => null),
            achievements.getByUser(targetUserId).catch(() => []),
            achievements.getAll().catch(() => []),
            skills.getTreeByUser(targetUserId).catch(() => null),
            skills.getUnlockedByUser(targetUserId).catch(() => []),
            character.getLevels().catch(() => []),
          ]);
          if (!cancelled) {
            setProfileUser(userRes);
            setChar(charRes);
            setXpHistory([]);
            setMyAchievements(Array.isArray(myAchRes) ? myAchRes : []);
            setAllAchievements(Array.isArray(allAchRes) ? allAchRes : []);
            setSkillTree(treeRes);
            setUnlockedSkills(Array.isArray(unlockedRes) ? unlockedRes : []);
            setLevels(Array.isArray(levelsRes) ? levelsRes : []);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [routeUserId, isOwnProfile]);

  if (loading) return <div className="page">Загрузка профиля...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;
  if (!isOwnProfile && !profileUser && !char) return <div className="page">Пользователь не найден.</div>;

  const myAchIds = new Set((myAchievements || []).map((a) => a.achievementId || a.achievementid));

  const handleAvatarChange = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const res = await auth.uploadAvatar(file);
      if (res) setUserFromResponse(res);
    } catch (err) {
      setAvatarError(err.message || 'Ошибка загрузки');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!user?.avatarUrl) return;
    if (!window.confirm('Удалить аватар?')) return;
    setAvatarError('');
    setAvatarDeleting(true);
    try {
      const res = await auth.deleteAvatar();
      if (res) setUserFromResponse(res);
    } catch (err) {
      setAvatarError(err.message || 'Ошибка удаления');
    } finally {
      setAvatarDeleting(false);
    }
  };

  const displayUser = isOwnProfile ? user : profileUser;
  const displayName = displayUser?.displayName ?? displayUser?.DisplayName ?? char?.name ?? '—';
  const avatarUrl = displayUser?.avatarUrl ?? displayUser?.AvatarUrl ?? null;

  return (
    <div className="page profile-page">
      <h1>
        {isOwnProfile ? 'Профиль и прогресс' : 'Профиль'}
        {!isOwnProfile && (
          <Link to="/profile" className="profile-back-link">← Мой профиль</Link>
        )}
      </h1>

      <section className="profile-section profile-avatar-section">
        <h2>Аватар</h2>
        <div className="profile-avatar-row">
          <div className="profile-avatar-preview">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-placeholder">{displayName?.charAt(0) || '?'}</span>
            )}
          </div>
          {isOwnProfile && (
            <div className="profile-avatar-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="profile-avatar-input"
                disabled={avatarUploading}
              />
              <button
                type="button"
                className="profile-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading || avatarDeleting}
              >
                {avatarUploading ? 'Загрузка…' : 'Загрузить аватар'}
              </button>
              {user?.avatarUrl && (
                <button
                  type="button"
                  className="profile-avatar-btn profile-avatar-delete-btn"
                  onClick={handleDeleteAvatar}
                  disabled={avatarUploading || avatarDeleting}
                >
                  {avatarDeleting ? 'Удаление…' : 'Удалить аватар'}
                </button>
              )}
              <p className="profile-avatar-hint">JPEG, PNG, WebP или GIF, до 2 МБ</p>
              {avatarError && <p className="profile-avatar-error">{avatarError}</p>}
            </div>
          )}
        </div>
      </section>

      {char && (
        <section className="profile-section profile-character">
          <h2>Персонаж</h2>
          <p><strong>Уровень {char.levelNumber}</strong> · {char.totalXp} XP всего</p>
          {char.levelTitle && <span className="profile-badge">{char.levelTitle}</span>}
        </section>
      )}

      {levels.length > 0 && (
        <section className="profile-section">
          <h2>Таблица уровней</h2>
          <ul className="profile-levels-list">
            {(levels || []).map((lvl) => (
              <li key={lvl.id ?? lvl.levelNumber} className={char && char.levelNumber === lvl.levelNumber ? 'profile-level-current' : ''}>
                Уровень {lvl.levelNumber}: от {lvl.xpRequired ?? 0} XP {lvl.title ? `— ${lvl.title}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isOwnProfile && (
        <section className="profile-section">
          <h2>История XP</h2>
          <ul className="profile-xp-list">
            {(xpHistory || []).map((tx) => (
              <li key={tx.id}>
                <span className="profile-xp-amount">{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
                <span className="profile-xp-source">{tx.source}</span>
                {tx.description && <span className="profile-xp-desc"> — {tx.description}</span>}
                <span className="profile-xp-date">{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : ''}</span>
              </li>
            ))}
          </ul>
          {(!xpHistory || !xpHistory.length) && <p className="profile-empty">Пока нет записей</p>}
        </section>
      )}

      <section className="profile-section">
        <h2>Достижения</h2>
        <p className="profile-sub">Список всех достижений и как их получить. Получено: {myAchievements?.length ?? 0} из {allAchievements?.length ?? 0}</p>
        <ul className="profile-achievements-list">
          {(allAchievements || []).map((a) => {
            const unlocked = myAchIds.has(a.id);
            const userAch = (myAchievements || []).find((u) => (u.achievementId || u.achievementid) === a.id);
            return (
              <li key={a.id} className={'profile-achievement-item' + (unlocked ? ' profile-achievement-unlocked' : '')}>
                {a.iconUrl ? <img src={a.iconUrl} alt="" className="profile-achievement-icon" /> : <span className="profile-achievement-icon-placeholder">?</span>}
                <div>
                  <strong>{a.name}</strong>
                  {a.description && <p className="profile-achievement-desc">{a.description}</p>}
                  {(a.howToObtain || a.howtoobtain) && (
                    <p className="profile-achievement-how">Как получить: {(a.howToObtain ?? a.howtoobtain)}</p>
                  )}
                  {a.xpBonus > 0 && <span className="profile-achievement-xp">+{a.xpBonus} XP</span>}
                  {unlocked && userAch?.unlockedAt && <span className="profile-achievement-date">Получено: {new Date(userAch.unlockedAt).toLocaleDateString()}</span>}
                  {!unlocked && <span className="profile-achievement-locked">Не получено</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {(!allAchievements || !allAchievements.length) && <p className="profile-empty">Нет достижений в системе</p>}
      </section>

      <section className="profile-section">
        <h2>Навыки</h2>
        <p className="profile-sub">Навыки открываются за достижения. Разблокировано: {unlockedSkills?.length ?? 0}</p>
        <ul className="profile-skills-list">
          {(unlockedSkills || []).map((s) => (
            <li key={s.id} className="profile-skill-item">
              {s.iconUrl ? <img src={s.iconUrl} alt="" className="profile-skill-icon" /> : <span className="profile-skill-icon-placeholder">?</span>}
              <div>
                <strong>{s.name}</strong>
                {s.description && <p className="profile-skill-desc">{s.description}</p>}
              </div>
            </li>
          ))}
        </ul>
        {skillTree?.skills?.length > 0 && (
          <details className="profile-skill-tree-details" open>
            <summary>Вся дерево навыков ({skillTree.skills.length})</summary>
            <ul className="profile-skills-tree-list">
              {(skillTree.skills || []).map((s) => (
                <li key={s.id} className={s.unlocked ? 'profile-skill-unlocked' : 'profile-skill-locked'}>
                  <span>{s.name}</span> {s.unlocked ? <span className="profile-skill-check">✓</span> : <span className="profile-skill-dash">—</span>}
                  {(s.howToUnlock || s.howtounlock) && <span className="profile-skill-how"> · {(s.howToUnlock ?? s.howtounlock)}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
        {(!unlockedSkills?.length && !skillTree?.skills?.length) && <p className="profile-empty">Нет навыков в системе. Они появятся после добавления достижений и привязки к ним навыков.</p>}
      </section>
    </div>
  );
}
