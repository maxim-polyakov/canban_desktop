import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams, Link, useNavigate } from '../i18n/navigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { auth, character, achievements, skills, kudos as kudosApi, people as peopleApi } from '../api.js';
import NavIcon from '../components/NavIcons.jsx';
import SpaceAvatar from '../components/SpaceAvatar.jsx';
import { IssueTypeIcon, getIssueTypeMeta } from '../components/IssueIcons.jsx';
import { timeAgo } from '../utils/timeAgo.js';
import { Avatar, KudosList } from './teams/TeamsPages.jsx';
import { CreateTeamDialog, EditProfileDialog, SendKudosDialog } from './teams/TeamsDialogs.jsx';
import './settings/Settings.css';
import './ForYouPage.css';
import './teams/Teams.css';
import './ProfilePage.css';

const TABS = [
  ['overview', 'Обзор'],
  ['levels', 'Уровни'],
  ['achievements', 'Достижения'],
  ['skills', 'Навыки'],
  ['kudos', 'Похвала'],
];

const list = (value) => (Array.isArray(value) ? value : []);

function bannerHue(id = '') {
  return [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
}

function levelProgress(char, levels) {
  if (!char) return null;
  const sorted = [...levels].sort((a, b) => a.levelNumber - b.levelNumber);
  const current = sorted.find((l) => l.levelNumber === char.levelNumber);
  const next = sorted.find((l) => l.levelNumber > char.levelNumber);
  const from = current?.xpRequired ?? 0;
  if (!next) return { from, to: null, percent: 100, left: 0, next: null };
  const span = Math.max(1, next.xpRequired - from);
  const done = Math.min(span, Math.max(0, char.totalXp - from));
  return { from, to: next.xpRequired, percent: Math.round((done / span) * 100), left: next.xpRequired - char.totalXp, next };
}

function LevelCard({ char, progress, t }) {
  if (!char) return null;
  return (
    <div className="profile-level-card">
      <div className="profile-level-badge" aria-hidden="true">
        {char.badgeUrl ? <img src={char.badgeUrl} alt="" /> : <span>{char.levelNumber}</span>}
      </div>
      <div className="profile-level-body">
        <div className="profile-level-title">
          <strong>{t('Уровень')} {char.levelNumber}</strong>
          {char.levelTitle && <span className="settings-lozenge is-info">{char.levelTitle}</span>}
        </div>
        <div className="profile-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress?.percent ?? 0}>
          <span style={{ width: `${progress?.percent ?? 0}%` }} />
        </div>
        <div className="profile-level-meta">
          <span>{char.totalXp} XP</span>
          {progress?.next
            ? <span>{t('До уровня')} {progress.next.levelNumber}: {progress.left} XP</span>
            : <span>{t('Максимальный уровень')}</span>}
        </div>
      </div>
    </div>
  );
}

function WorkRow({ item, language, t }) {
  return (
    <Link to={`/board/${item.boardId}/issue/${item.questId}`} className="foryou-row">
      <IssueTypeIcon issueType={item.issueType} size={16} />
      <span className="foryou-row-main">
        <span className={`foryou-row-title ${item.done ? 'is-done' : ''}`}>{item.title}</span>
        <span className="foryou-row-meta">{[t(getIssueTypeMeta(item.issueType).label), item.issueKey, item.boardName].filter(Boolean).join(' • ')}</span>
      </span>
      <span className="foryou-row-time">{timeAgo(item.activityAt, language)}</span>
    </Link>
  );
}

function AchievementCard({ achievement, unlockedAt, locale, t }) {
  const how = achievement.howToObtain ?? achievement.howtoobtain;
  return (
    <li className={`profile-ach-card ${unlockedAt ? 'is-unlocked' : ''}`}>
      {achievement.iconUrl
        ? <img src={achievement.iconUrl} alt="" className="profile-ach-icon" />
        : <span className="profile-ach-icon is-placeholder" aria-hidden="true">{unlockedAt ? '🏆' : '🔒'}</span>}
      <div className="profile-ach-body">
        <strong>{achievement.name}</strong>
        {achievement.description && <p>{achievement.description}</p>}
        {how && <p className="profile-ach-how">{t('Как получить')}: {how}</p>}
        <div className="profile-ach-meta">
          {achievement.xpBonus > 0 && <span className="settings-lozenge is-success">+{achievement.xpBonus} XP</span>}
          {unlockedAt
            ? <span>{t('Получено')}: {new Date(unlockedAt).toLocaleDateString(locale)}</span>
            : <span>{t('Не получено')}</span>}
        </div>
      </div>
    </li>
  );
}

export default function ProfilePage() {
  const { userId: routeUserId } = useParams();
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const { user, setUserFromResponse } = useAuth();
  const { locale, language, t } = useLocalization();
  const fileInputRef = useRef(null);
  const avatarRef = useRef(null);
  const userId = routeUserId || user?.id;
  const isOwn = Boolean(user?.id) && userId === user.id;
  const requestedTab = new URLSearchParams(search).get('tab');
  const tab = TABS.some(([key]) => key === requestedTab) ? requestedTab : 'overview';

  const [profile, setProfile] = useState(null);
  const [char, setChar] = useState(null);
  const [levels, setLevels] = useState([]);
  const [xpHistory, setXpHistory] = useState([]);
  const [userAchievements, setUserAchievements] = useState([]);
  const [allAchievements, setAllAchievements] = useState([]);
  const [skillTree, setSkillTree] = useState(null);
  const [unlockedSkills, setUnlockedSkills] = useState([]);
  const [received, setReceived] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [kudosOpen, setKudosOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const loadKudos = useCallback(() => {
    if (!userId) return;
    kudosApi.get('received', userId).then((items) => setReceived(list(items))).catch(() => setReceived([]));
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setProfile(null);
    setError('');
    const own = userId === user?.id;
    Promise.all([
      peopleApi.getProfile(userId),
      (own ? character.getMe() : character.getByUser(userId)).catch(() => null),
      character.getLevels().catch(() => []),
      own ? character.getXpHistory(50).catch(() => []) : Promise.resolve([]),
      (own ? achievements.getMy() : achievements.getByUser(userId)).catch(() => []),
      achievements.getAll().catch(() => []),
      (own ? skills.getTree() : skills.getTreeByUser(userId)).catch(() => null),
      (own ? skills.getUnlocked() : skills.getUnlockedByUser(userId)).catch(() => []),
    ]).then(([profileRes, charRes, levelsRes, xpRes, userAchRes, allAchRes, treeRes, unlockedRes]) => {
      if (cancelled) return;
      setProfile(profileRes);
      setChar(charRes);
      setLevels(list(levelsRes));
      setXpHistory(list(xpRes));
      setUserAchievements(list(userAchRes));
      setAllAchievements(list(allAchRes));
      setSkillTree(treeRes);
      setUnlockedSkills(list(unlockedRes));
    }).catch((e) => { if (!cancelled) setError(e?.message || t('Пользователь не найден.')); });
    loadKudos();
    return () => { cancelled = true; };
  }, [userId, user?.id, loadKudos, t]);

  useEffect(() => {
    if (!avatarMenu) return undefined;
    const close = (e) => { if (!avatarRef.current?.contains(e.target)) setAvatarMenu(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAvatarMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [avatarMenu]);

  const progress = useMemo(() => levelProgress(char, levels), [char, levels]);
  const unlockedById = useMemo(() => new Map(userAchievements.map((a) => [a.achievementId || a.achievementid, a.unlockedAt])), [userAchievements]);
  const recentAchievements = useMemo(() => allAchievements
    .filter((a) => unlockedById.has(a.id))
    .sort((a, b) => new Date(unlockedById.get(b.id) || 0) - new Date(unlockedById.get(a.id) || 0))
    .slice(0, 3), [allAchievements, unlockedById]);

  const setTab = (key) => navigate(key === 'overview' ? pathname : `${pathname}?tab=${key}`, { replace: true });

  const uploadAvatar = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setAvatarMenu(false);
    setAvatarError('');
    setAvatarBusy(true);
    try {
      const res = await auth.uploadAvatar(file);
      if (res) { setUserFromResponse(res); setProfile((p) => ({ ...p, avatarUrl: res.avatarUrl ?? res.user?.avatarUrl ?? p.avatarUrl })); }
    } catch (err) {
      setAvatarError(err.message || t('Ошибка загрузки'));
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAvatar = async () => {
    setAvatarMenu(false);
    if (!window.confirm(t('Удалить аватар?'))) return;
    setAvatarError('');
    setAvatarBusy(true);
    try {
      const res = await auth.deleteAvatar();
      if (res) setUserFromResponse(res);
      setProfile((p) => ({ ...p, avatarUrl: null }));
    } catch (err) {
      setAvatarError(err.message || t('Ошибка удаления'));
    } finally {
      setAvatarBusy(false);
    }
  };

  if (error) return <div className="teams-page"><p className="settings-empty">{error}</p></div>;
  if (!profile) return <div className="teams-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;

  const avatarUrl = isOwn ? (user?.avatarUrl ?? profile.avatarUrl) : profile.avatarUrl;
  const roleLine = [profile.jobTitle, profile.department, profile.organization].filter(Boolean).join(' · ');
  const hue = bannerHue(profile.id);
  const details = [
    ['Электронная почта', profile.email],
    ['Должность', profile.jobTitle],
    ['Отдел', profile.department],
    ['Организация', profile.organization],
    ['Местоположение', profile.location],
    ['В Канбане с', profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString(locale) : null],
  ].filter(([, value]) => value);

  return (
    <div className="profile-jira">
      <div className="profile-cover" style={{ '--cover-hue': hue }} aria-hidden="true">
        <span className="profile-cover-shape is-a" />
        <span className="profile-cover-shape is-b" />
        <span className="profile-cover-shape is-c" />
      </div>

      <div className="profile-shell">
        <header className="profile-head">
          <div className="profile-head-avatar" ref={avatarRef}>
            {isOwn ? (
              <button type="button" className="profile-avatar-button" onClick={() => setAvatarMenu((v) => !v)} aria-haspopup="menu" aria-expanded={avatarMenu} aria-label={t('Изменить аватар')} disabled={avatarBusy}>
                <Avatar url={avatarUrl} name={profile.displayName} size={128} />
                <span className="profile-avatar-overlay"><NavIcon name="upload" size={20} /></span>
              </button>
            ) : <Avatar url={avatarUrl} name={profile.displayName} size={128} />}
            {avatarMenu && (
              <div className="app-menu profile-avatar-menu" role="menu">
                <button type="button" role="menuitem" className="app-menu-item" onClick={() => fileInputRef.current?.click()}>{t('Загрузить аватар')}</button>
                {avatarUrl && <button type="button" role="menuitem" className="app-menu-item" onClick={deleteAvatar}>{t('Удалить аватар')}</button>}
              </div>
            )}
            {isOwn && <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAvatar} hidden />}
          </div>
          <div className="profile-head-main">
            <div className="profile-head-row">
              <h1 className="profile-name">{profile.displayName}</h1>
              {char && <button type="button" className="profile-level-pill" onClick={() => setTab('levels')}>{t('Уровень')} {char.levelNumber}{char.levelTitle ? ` · ${char.levelTitle}` : ''}</button>}
              <div className="profile-head-actions">
                {isOwn
                  ? <Link to="/settings/personal/general" className="app-btn">{t('Настройки аккаунта')}</Link>
                  : <button type="button" className="app-btn app-btn-primary" onClick={() => setKudosOpen(true)}><NavIcon name="sparkle" size={14} />{t('Похвалить')}</button>}
              </div>
            </div>
            {roleLine
              ? <p className="profile-role">{roleLine}{isOwn && <button type="button" className="profile-inline-edit" onClick={() => setEditing('role')} aria-label={t('Изменить')}><NavIcon name="edit" size={12} /></button>}</p>
              : isOwn && <button type="button" className="profile-add-role" onClick={() => setEditing('role')}><NavIcon name="plus" size={12} />{t('Добавить сведения о роли')}</button>}
            {avatarError && <p className="settings-save-status is-error" role="alert">{avatarError}</p>}
          </div>
        </header>

        <nav className="profile-tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`profile-tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
              {t(label)}
              {key === 'achievements' && allAchievements.length > 0 && <span className="foryou-tab-count">{unlockedById.size}</span>}
              {key === 'kudos' && received.length > 0 && <span className="foryou-tab-count">{received.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="profile-shell profile-columns">
        <main className="profile-main">
          {tab === 'overview' && (
            <>
              <section className="profile-block">
                <h2>{t('Работа со мной')}</h2>
                {profile.aboutMe
                  ? <p className="profile-about">{profile.aboutMe}</p>
                  : isOwn
                    ? <button type="button" className="profile-placeholder" onClick={() => setEditing('about')}>{t('Например: предпочитаю асинхронные обновления в задачах. По срочным вопросам пишите с 9:00 до 18:00.')}</button>
                    : <p className="profile-muted">{t('Пользователь пока ничего не рассказал о себе.')}</p>}
                {profile.aboutMe && isOwn && <button type="button" className="app-btn app-btn-subtle profile-small" onClick={() => setEditing('about')}><NavIcon name="edit" size={12} />{t('Изменить')}</button>}
              </section>

              <section className="profile-block">
                <div className="profile-block-head">
                  <h2>{t('Уровень и опыт')}</h2>
                  <button type="button" className="profile-link" onClick={() => setTab('levels')}>{t('Все уровни')} <span aria-hidden="true">→</span></button>
                </div>
                {char ? <LevelCard char={char} progress={progress} t={t} /> : <p className="profile-muted">{t('Персонаж ещё не создан.')}</p>}
              </section>

              <section className="profile-block">
                <div className="profile-block-head">
                  <h2>{t('Недавние задачи')}</h2>
                  <span className="profile-hint" title={t('Задачи, над которыми человек работал за последние 90 дней в доступных вам разделах.')}><NavIcon name="info" size={14} /></span>
                </div>
                {profile.recentWork?.length
                  ? <div className="profile-work">{profile.recentWork.map((item) => <WorkRow key={item.questId} item={item} language={language} t={t} />)}</div>
                  : <p className="profile-muted">{t('Нет недавних задач.')}</p>}
                {isOwn && <Link to="/for-you" className="profile-link">{t('Просмотреть все недавние задачи')} <span aria-hidden="true">→</span></Link>}
              </section>

              <section className="profile-block">
                <div className="profile-block-head">
                  <h2>{t('Последние достижения')}</h2>
                  <button type="button" className="profile-link" onClick={() => setTab('achievements')}>{t('Все достижения')} ({unlockedById.size}/{allAchievements.length}) <span aria-hidden="true">→</span></button>
                </div>
                {recentAchievements.length
                  ? <ul className="profile-ach-grid">{recentAchievements.map((a) => <AchievementCard key={a.id} achievement={a} unlockedAt={unlockedById.get(a.id)} locale={locale} t={t} />)}</ul>
                  : <p className="profile-muted">{t('Пока нет полученных достижений.')}</p>}
              </section>
            </>
          )}

          {tab === 'levels' && (
            <>
              <section className="profile-block">
                <h2>{t('Текущий уровень')}</h2>
                {char ? <LevelCard char={char} progress={progress} t={t} /> : <p className="profile-muted">{t('Персонаж ещё не создан.')}</p>}
              </section>
              <section className="profile-block">
                <h2>{t('Таблица уровней')}</h2>
                <ol className="profile-ladder">
                  {[...levels].sort((a, b) => a.levelNumber - b.levelNumber).map((lvl) => {
                    const state = !char ? '' : lvl.levelNumber < char.levelNumber ? 'is-passed' : lvl.levelNumber === char.levelNumber ? 'is-current' : 'is-locked';
                    return (
                      <li key={lvl.id ?? lvl.levelNumber} className={`profile-ladder-step ${state}`}>
                        <span className="profile-ladder-dot">{state === 'is-passed' ? <NavIcon name="check" size={12} /> : lvl.levelNumber}</span>
                        <span className="profile-ladder-name">{t('Уровень')} {lvl.levelNumber}{lvl.title ? ` — ${lvl.title}` : ''}</span>
                        <span className="profile-ladder-xp">{t('от')} {lvl.xpRequired ?? 0} XP</span>
                      </li>
                    );
                  })}
                </ol>
                {levels.length === 0 && <p className="profile-muted">{t('Уровни не настроены.')}</p>}
              </section>
              {isOwn && (
                <section className="profile-block">
                  <h2>{t('История XP')}</h2>
                  {xpHistory.length ? (
                    <ul className="profile-xp">
                      {xpHistory.map((tx) => (
                        <li key={tx.id}>
                          <span className={`profile-xp-amount ${tx.amount < 0 ? 'is-negative' : ''}`}>{tx.amount > 0 ? '+' : ''}{tx.amount}</span>
                          <span className="profile-xp-text">{tx.description || tx.source}</span>
                          <time className="profile-muted" dateTime={tx.createdAt}>{timeAgo(tx.createdAt, language)}</time>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="profile-muted">{t('Пока нет записей')}</p>}
                </section>
              )}
            </>
          )}

          {tab === 'achievements' && (
            <section className="profile-block">
              <h2>{t('Достижения')}</h2>
              <p className="profile-muted">{t('Получено')}: {unlockedById.size} {t('из')} {allAchievements.length}</p>
              {allAchievements.length ? (
                <ul className="profile-ach-grid">
                  {[...allAchievements]
                    .sort((a, b) => Number(unlockedById.has(b.id)) - Number(unlockedById.has(a.id)))
                    .map((a) => <AchievementCard key={a.id} achievement={a} unlockedAt={unlockedById.get(a.id)} locale={locale} t={t} />)}
                </ul>
              ) : <p className="profile-muted">{t('Нет достижений в системе')}</p>}
            </section>
          )}

          {tab === 'skills' && (
            <section className="profile-block">
              <h2>{t('Навыки')}</h2>
              <p className="profile-muted">{t('Навыки открываются за достижения.')} {t('Разблокировано')}: {unlockedSkills.length}</p>
              {skillTree?.skills?.length ? (
                <ul className="profile-skill-grid">
                  {skillTree.skills.map((s) => (
                    <li key={s.id} className={`profile-skill ${s.unlocked ? 'is-unlocked' : ''}`}>
                      {s.iconUrl ? <img src={s.iconUrl} alt="" /> : <span className="profile-skill-mark" aria-hidden="true">{s.unlocked ? '✓' : '🔒'}</span>}
                      <div>
                        <strong>{s.name}</strong>
                        {s.description && <p>{s.description}</p>}
                        {!s.unlocked && (s.howToUnlock || s.howtounlock) && <p className="profile-ach-how">{s.howToUnlock ?? s.howtounlock}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : unlockedSkills.length ? (
                <ul className="profile-skill-grid">
                  {unlockedSkills.map((s) => (
                    <li key={s.id} className="profile-skill is-unlocked">
                      {s.iconUrl ? <img src={s.iconUrl} alt="" /> : <span className="profile-skill-mark" aria-hidden="true">✓</span>}
                      <div><strong>{s.name}</strong>{s.description && <p>{s.description}</p>}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="profile-muted">{t('Нет навыков в системе. Они появятся после добавления достижений и привязки к ним навыков.')}</p>}
            </section>
          )}

          {tab === 'kudos' && (
            <section className="profile-block">
              <div className="profile-block-head">
                <h2>{t('Полученная похвала')}</h2>
                {!isOwn && <button type="button" className="app-btn teams-small-btn" onClick={() => setKudosOpen(true)}>{t('Похвалить')}</button>}
              </div>
              <KudosList items={received} locale={locale} />
            </section>
          )}
        </main>

        <aside className="profile-aside">
          <section className="profile-aside-block">
            <h2>{t('Подробная информация')}</h2>
            <dl className="profile-details">
              {details.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt>{t(label)}</dt>
                  <dd>{label === 'Электронная почта' ? <a href={`mailto:${value}`}>{value}</a> : value}</dd>
                </React.Fragment>
              ))}
              {char && <><dt>{t('Опыт')}</dt><dd>{char.totalXp} XP</dd></>}
            </dl>
            {isOwn && <button type="button" className="app-btn app-btn-subtle profile-small" onClick={() => setEditing('role')}><NavIcon name="edit" size={12} />{t('Изменить сведения')}</button>}
          </section>

          <section className="profile-aside-block">
            <h2>{t('Команды')}</h2>
            {profile.teams?.length ? (
              <ul className="profile-aside-list">
                {profile.teams.map((team) => (
                  <li key={team.id}>
                    <Link to={`/teams/${team.id}`} className="profile-aside-item">
                      <span className="profile-team-mark" style={{ background: `hsl(${bannerHue(team.id)} 70% 88%)` }}><NavIcon name="teams" size={14} /></span>
                      <span className="profile-aside-text"><span>{team.name}</span><small>{team.memberCount} {t('участн.')}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="profile-teams-empty">
                <span className="profile-teams-empty-art" aria-hidden="true"><NavIcon name="teams" size={22} /><i>+</i></span>
                <strong>{isOwn ? t('Просмотр всех команд, в которых вы работаете') : t('Нет общих команд')}</strong>
                {isOwn && <p>{t('Объедините участников в команды, которые можно @упоминать и фильтровать и которым можно назначать задачи.')}</p>}
                {isOwn && (
                  <div className="profile-teams-empty-actions">
                    <button type="button" className="app-btn" onClick={() => setCreateTeamOpen(true)}><NavIcon name="plus" size={12} />{t('Создать команду')}</button>
                    <Link to="/teams/list" className="profile-link">{t('Просмотреть команды')}</Link>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="profile-aside-block">
            <h2>{t('Часто используемые разделы')}</h2>
            {profile.frequentSpaces?.length ? (
              <ul className="profile-aside-list">
                {profile.frequentSpaces.map((space) => (
                  <li key={space.id}>
                    <Link to={`/board/${space.id}`} className="profile-aside-item">
                      <SpaceAvatar id={space.id} name={space.name} size={24} />
                      <span className="profile-aside-text"><span>{space.name}</span><small>{t('Раздел')} · {space.keyPrefix}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="profile-muted">{t('Пока нет активности в разделах.')}</p>}
          </section>
        </aside>
      </div>

      <EditProfileDialog
        open={Boolean(editing)}
        focusAbout={editing === 'about'}
        profile={profile}
        onClose={() => setEditing(null)}
        onSaved={(saved) => { setProfile((p) => ({ ...p, ...saved })); setEditing(null); }}
      />
      <SendKudosDialog open={kudosOpen} defaultUserId={userId} currentUserId={user?.id} onClose={() => setKudosOpen(false)} onSent={() => { setKudosOpen(false); loadKudos(); setTab('kudos'); }} />
      <CreateTeamDialog open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} onCreated={(team) => { setCreateTeamOpen(false); window.dispatchEvent(new CustomEvent('canban:spaces-changed')); navigate(`/teams/${team.id}`); }} />
    </div>
  );
}
