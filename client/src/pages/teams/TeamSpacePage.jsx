import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { search as searchApi, teams as teamsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import SpaceAvatar from '../../components/SpaceAvatar.jsx';
import AssigneeAvatar from '../../components/AssigneeAvatar';
import TeamAvatar, { TeamAvatarPicker } from '../../components/TeamAvatar.jsx';
import { IssueTypeIcon, PriorityIcon } from '../../components/IssueIcons.jsx';
import { openCreateSpace, SPACES_CHANGED_EVENT } from '../../components/AppSidebar.jsx';
import { rememberTeam } from '../../utils/navHistory.js';
import { timeAgo } from '../../utils/timeAgo.js';
import { InvitePeopleDialog } from './TeamsDialogs.jsx';
import '../settings/Settings.css';
import './Teams.css';
import './TeamSpacePage.css';

const TABS = [
  ['', 'summary', 'Сводка'],
  ['/backlog', 'backlog', 'Бэклог'],
  ['/board', 'board', 'Доска'],
  ['/members', 'teams', 'Участники'],
  ['/spaces', 'spaces', 'Разделы'],
];

const COLUMNS = [
  ['new', 'К выполнению'],
  ['indeterminate', 'В работе'],
  ['done', 'Готово'],
];

const issueLink = (issue) => `/board/${issue.boardId}/issue/${issue.id}`;

function EmptyState({ canCreate, onCreate, onInvite, t }) {
  return (
    <div className="team-space-empty">
      <span className="team-space-empty-icon" aria-hidden="true"><NavIcon name="board" size={16} /></span>
      <h2>{t('Начните работу в разделе')}</h2>
      <p>{t('Создайте раздел для команды, чтобы планировать задачи и видеть их здесь.')}</p>
      <div className="team-space-empty-actions">
        {canCreate && <button type="button" className="app-btn app-btn-primary" onClick={onCreate}>{t('Создать раздел')}</button>}
        <button type="button" className="app-btn" onClick={onInvite}>{t('Пригласить участников')}</button>
      </div>
    </div>
  );
}

function IssueCard({ issue }) {
  const people = issue.assignees?.length ? issue.assignees : issue.assigneeId ? [{ userId: issue.assigneeId, displayName: issue.assigneeName, avatarUrl: issue.assigneeAvatarUrl }] : [];
  return (
    <Link to={issueLink(issue)} className="team-space-card">
      <span className="team-space-card-title">{issue.title}</span>
      <span className="team-space-card-foot">
        <IssueTypeIcon issueType={issue.issueType} size={14} />
        <span className="team-space-card-key">{issue.issueKey}</span>
        <span className="team-space-card-spacer" />
        <PriorityIcon priority={issue.priority} size={14} />
        {people.slice(0, 2).map((p) => <AssigneeAvatar key={p.userId} userId={p.userId} displayName={p.displayName} avatarUrl={p.avatarUrl} size={20} />)}
      </span>
    </Link>
  );
}

export default function TeamSpacePage() {
  const { teamId } = useParams();
  const { pathname } = useLocation();
  const { t, language, locale } = useLocalization();
  const { user } = useAuth();
  const tab = pathname.match(/\/team\/[^/]+\/(backlog|board|members|spaces)/)?.[1] || 'summary';

  const [team, setTeam] = useState(null);
  const [boards, setBoards] = useState([]);
  const [members, setMembers] = useState([]);
  const [issues, setIssues] = useState(null);
  const [details, setDetails] = useState({});
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const menuRef = useRef(null);

  const load = useCallback(() => {
    setError('');
    teamsApi.get(teamId).then((data) => { setTeam(data); rememberTeam(data); }).catch((e) => setError(e?.message || t('Команда не найдена')));
    teamsApi.getMembers(teamId).then((list) => setMembers(Array.isArray(list) ? list : [])).catch(() => setMembers([]));
    teamsApi.getMyTeamsWithBoards().then((list) => {
      const entry = (list || []).find((x) => (x.team ?? x.Team)?.id === teamId);
      const teamBoards = entry?.boards ?? entry?.Boards ?? [];
      setBoards(teamBoards);
      if (!teamBoards.length) { setIssues([]); return; }
      const jql = `project in (${teamBoards.map((b) => `"${b.id}"`).join(', ')}) ORDER BY updated DESC`;
      searchApi.issues({ jql, pageSize: 100 })
        .then((res) => {
          setIssues(res?.items || []);
          setDetails(Object.fromEntries((res?.details || []).map((d) => [d.id, d])));
        })
        .catch(() => setIssues([]));
    }).catch(() => { setBoards([]); setIssues([]); });
  }, [teamId, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(SPACES_CHANGED_EVENT, load);
    return () => window.removeEventListener(SPACES_CHANGED_EVENT, load);
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const me = members.find((m) => m.userId === user?.id);
  const canManage = Boolean(team && (team.ownerId === user?.id || me?.role === 'Admin'));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (issues || []).filter((q) => (!needle || q.title.toLowerCase().includes(needle) || (q.issueKey || '').toLowerCase().includes(needle))
      && (!onlyMine || q.assigneeId === user?.id || (q.assignees || []).some((a) => a.userId === user?.id)));
  }, [issues, query, onlyMine, user?.id]);
  const statusOf = (issue) => details[issue.id]?.statusCategory || 'new';
  const counts = useMemo(() => Object.fromEntries(COLUMNS.map(([key]) => [key, (issues || []).filter((q) => (details[q.id]?.statusCategory || 'new') === key).length])), [issues, details]);

  if (error && !team) return <div className="team-space"><p className="settings-empty">{error}</p></div>;
  if (!team) return <div className="team-space"><p className="settings-empty">{t('Загрузка...')}</p></div>;

  const createSpace = () => openCreateSpace({ template: 'kanban', teamId });
  const base = `/team/${teamId}`;
  const noSpaces = boards.length === 0;

  const toolbar = (
    <div className="team-space-toolbar">
      <label className="team-space-search">
        <NavIcon name="search" size={14} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск задач')} aria-label={t('Поиск задач')} />
      </label>
      <span className="team-space-people">
        {members.slice(0, 5).map((m) => <AssigneeAvatar key={m.userId} userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={24} />)}
      </span>
      <button type="button" className={`app-btn ${onlyMine ? 'is-selected' : ''}`} aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
        <NavIcon name="filters" size={14} />{t('Только мои задачи')}
      </button>
    </div>
  );

  return (
    <div className="team-space">
      <div className="app-space-header">
        <div className="app-space-breadcrumbs"><Link to="/spaces">{t('Разделы')}</Link></div>
        <div className="app-space-title-row">
          <div className="team-space-avatar">
            <button type="button" className="team-space-avatar-btn" onClick={() => canManage && setPickerOpen((v) => !v)} disabled={!canManage}
              aria-label={t('Изменить аватар')} title={canManage ? t('Изменить аватар') : team.name}>
              <TeamAvatar id={team.id} avatarUrl={team.avatarUrl} name={team.name} size={24} />
            </button>
            {pickerOpen && (
              <TeamAvatarPicker
                teamId={teamId}
                value={team.avatarUrl}
                onChange={(avatarUrl) => { setTeam((cur) => ({ ...cur, avatarUrl })); setPickerOpen(false); window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT)); }}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </div>
          <h1 className="app-space-title" title={team.name}>{team.name}</h1>
          <div className="app-space-more" ref={menuRef}>
            <button type="button" className="app-icon-btn" aria-label={t('Действия')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <NavIcon name="more" />
            </button>
            {menuOpen && (
              <div className="app-menu" role="menu">
                <button type="button" role="menuitem" className="app-menu-item" onClick={() => { setMenuOpen(false); setInviteOpen(true); }}><NavIcon name="person" />{t('Пригласить участников')}</button>
                {canManage && <button type="button" role="menuitem" className="app-menu-item" onClick={() => { setMenuOpen(false); createSpace(); }}><NavIcon name="plus" />{t('Создать раздел')}</button>}
                {canManage && <button type="button" role="menuitem" className="app-menu-item" onClick={() => { setMenuOpen(false); setPickerOpen(true); }}><NavIcon name="edit" />{t('Изменить аватар')}</button>}
                <Link to={`/teams/${teamId}`} role="menuitem" className="app-menu-item" onClick={() => setMenuOpen(false)}><NavIcon name="settings" />{t('Настройки команды')}</Link>
              </div>
            )}
          </div>
        </div>
        <nav className="app-space-tabs" aria-label={t('Представления раздела')}>
          {TABS.map(([suffix, icon, label]) => {
            const key = suffix.slice(1) || 'summary';
            return (
              <Link key={key} to={`${base}${suffix}`} className={`app-space-tab ${tab === key ? 'is-active' : ''}`}>
                <NavIcon name={icon} size={14} />{t(label)}
              </Link>
            );
          })}
          {canManage && (
            <button type="button" className="app-space-tab app-space-tab-add" aria-label={t('Создать раздел')} title={t('Создать раздел')} onClick={createSpace}>
              <NavIcon name="plus" size={14} />
            </button>
          )}
        </nav>
      </div>

      <div className="team-space-body">
        {tab === 'summary' && (
          <div className="team-space-summary">
            <section className="team-space-panel">
              <h2>{t('О команде')}</h2>
              <p className="settings-row-desc">{team.description || t('Добавьте описание, чтобы рассказать, чем занимается команда.')}</p>
            </section>
            <section className="team-space-panel">
              <h2>{t('Статус задач')}</h2>
              {noSpaces ? <p className="settings-row-desc">{t('Пока нет задач.')}</p> : (
                <div className="team-space-stats">
                  {COLUMNS.map(([key, label]) => (
                    <div key={key} className={`team-space-stat is-${key}`}><strong>{counts[key] ?? 0}</strong><span>{t(label)}</span></div>
                  ))}
                </div>
              )}
            </section>
            <section className="team-space-panel">
              <div className="team-space-panel-head"><h2>{t('Недавние задачи')}</h2><Link to={`${base}/backlog`}>{t('Все')}</Link></div>
              {(issues || []).slice(0, 6).map((q) => (
                <Link key={q.id} to={issueLink(q)} className="team-space-row">
                  <IssueTypeIcon issueType={q.issueType} size={16} />
                  <span className="team-space-row-title">{q.title}</span>
                  <span className="team-space-row-meta">{q.issueKey}</span>
                  {details[q.id]?.updatedAt && <span className="team-space-row-meta">{timeAgo(details[q.id].updatedAt, language)}</span>}
                </Link>
              ))}
              {issues && issues.length === 0 && <p className="settings-row-desc">{t('Пока нет задач.')}</p>}
            </section>
            <section className="team-space-panel">
              <div className="team-space-panel-head"><h2>{t('Участники')} ({members.length})</h2><Link to={`${base}/members`}>{t('Все')}</Link></div>
              <div className="team-space-people-list">
                {members.slice(0, 8).map((m) => (
                  <Link key={m.userId} to={`/people/${m.userId}`} className="settings-table-person">
                    <AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={24} />{m.displayName}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'board' && (noSpaces
          ? <EmptyState canCreate={canManage} onCreate={createSpace} onInvite={() => setInviteOpen(true)} t={t} />
          : (
            <>
              {toolbar}
              <div className="team-space-board">
                {COLUMNS.map(([key, label]) => {
                  const cards = visible.filter((q) => statusOf(q) === key);
                  return (
                    <section key={key} className="team-space-column">
                      <h3>{t(label)} <span>{cards.length}</span></h3>
                      {cards.map((q) => <IssueCard key={q.id} issue={q} />)}
                    </section>
                  );
                })}
              </div>
            </>
          ))}

        {tab === 'backlog' && (noSpaces
          ? <EmptyState canCreate={canManage} onCreate={createSpace} onInvite={() => setInviteOpen(true)} t={t} />
          : (
            <>
              {toolbar}
              <div className="team-space-list">
                {visible.map((q) => (
                  <Link key={q.id} to={issueLink(q)} className="team-space-row">
                    <IssueTypeIcon issueType={q.issueType} size={16} />
                    <span className="team-space-row-key">{q.issueKey}</span>
                    <span className="team-space-row-title">{q.title}</span>
                    <span className={`team-space-status is-${statusOf(q)}`}>{details[q.id]?.statusName || '—'}</span>
                    <PriorityIcon priority={q.priority} size={14} />
                    {q.assigneeId ? <AssigneeAvatar userId={q.assigneeId} displayName={q.assigneeName} avatarUrl={q.assigneeAvatarUrl} size={22} /> : <span className="team-space-row-unassigned" />}
                  </Link>
                ))}
                {issues && visible.length === 0 && <p className="settings-empty">{t('Задачи не найдены.')}</p>}
                {!issues && <p className="settings-empty">{t('Загрузка...')}</p>}
              </div>
            </>
          ))}

        {tab === 'members' && (
          <>
            <div className="team-space-panel-head">
              <h2>{t('Участники')} ({members.length})</h2>
              <button type="button" className="app-btn app-btn-primary" onClick={() => setInviteOpen(true)}>{t('Пригласить участников')}</button>
            </div>
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead><tr><th>{t('Имя')}</th><th>{t('Роль')}</th><th className="hide-mobile">{t('В команде с')}</th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}>
                      <td><Link to={`/people/${m.userId}`} className="settings-table-person"><AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={24} />{m.displayName}</Link></td>
                      <td><span className={`settings-lozenge ${team.ownerId === m.userId || m.role === 'Admin' ? 'is-info' : ''}`}>{t(team.ownerId === m.userId ? 'Владелец' : m.role === 'Admin' ? 'Администратор' : m.role === 'Viewer' ? 'Наблюдатель' : 'Участник')}</span></td>
                      <td className="hide-mobile">{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(locale) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'spaces' && (
          <>
            <div className="team-space-panel-head">
              <h2>{t('Разделы команды')} ({boards.length})</h2>
              {canManage && <button type="button" className="app-btn app-btn-primary" onClick={createSpace}>{t('Создать раздел')}</button>}
            </div>
            {noSpaces ? <EmptyState canCreate={canManage} onCreate={createSpace} onInvite={() => setInviteOpen(true)} t={t} /> : (
              <div className="team-space-list">
                {boards.map((b) => (
                  <Link key={b.id} to={`/board/${b.id}`} className="team-space-row">
                    <SpaceAvatar id={b.id} name={b.name} size={24} />
                    <span className="team-space-row-title">{b.name}</span>
                    <span className="team-space-row-meta">{b.keyPrefix}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <InvitePeopleDialog open={inviteOpen} teams={[team]} defaultTeamId={teamId} onClose={() => setInviteOpen(false)} onDone={load} />
    </div>
  );
}
