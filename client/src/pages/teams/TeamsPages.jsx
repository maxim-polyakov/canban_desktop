import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { kudos as kudosApi, people as peopleApi, teams as teamsApi, users as usersApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import SpaceAvatar from '../../components/SpaceAvatar.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import { CreateTeamDialog, InvitePeopleDialog, kudosKindMeta, SendKudosDialog } from './TeamsDialogs.jsx';
import '../settings/Settings.css';
import '../ForYouPage.css';
import './Teams.css';

export const TEAMS_HUB_NAV = [
  ['/teams', 'forYou', 'Для вас', (p) => p === '/teams'],
  ['/teams/list', 'teams', 'Команды', (p) => p === '/teams/list' || /^\/teams\/(?!list$|manage$)[^/]+/.test(p)],
  ['/people', 'person', 'Люди', (p) => p.startsWith('/people')],
  ['/kudos', 'sparkle', 'Похвала', (p) => p.startsWith('/kudos')],
  ['/goals', 'goals', 'Goals', (p) => p.startsWith('/goals')],
  ['/projects', 'projects', 'Projects', (p) => p.startsWith('/projects')],
];

export const isTeamsHubPath = (pathname) => /^\/(teams|people|kudos|goals|projects)(\/|$)/.test(pathname) && pathname !== '/teams/manage';

export function TeamsHubSidebar({ pathname, onNavigate }) {
  const { t } = useLocalization();
  return (
    <nav className="app-sidebar-nav" aria-label={t('Команды')}>
      {TEAMS_HUB_NAV.map(([to, icon, label, isActive]) => (
        <Link key={to} to={to} className={`app-nav-item app-nav-link ${isActive(pathname) ? 'is-active' : ''}`} onClick={onNavigate}>
          <NavIcon name={icon} />
          <span className="app-nav-label">{t(label)}</span>
        </Link>
      ))}
      <div className="app-nav-divider" />
      <Link to="/for-you" className="app-nav-item app-nav-link" onClick={onNavigate}>
        <NavIcon name="apps" />
        <span className="app-nav-label">{t('Назад к Канбан')}</span>
      </Link>
    </nav>
  );
}

function Avatar({ url, name, size = 32 }) {
  return url
    ? <img src={url} alt="" className="teams-avatar" style={{ width: size, height: size }} />
    : <span className="teams-avatar teams-avatar-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }}>{(name || '?').charAt(0).toUpperCase()}</span>;
}

function PersonCard({ person, onKudos }) {
  const { t } = useLocalization();
  return (
    <div className="teams-person-card">
      <Link to={`/people/${person.id}`} className="teams-person-link">
        <Avatar url={person.avatarUrl} name={person.displayName} size={96} />
        <span className="teams-person-name">{person.displayName}</span>
        {person.sharedTeams > 0 && <span className="teams-person-sub">{t('Общих команд')}: {person.sharedTeams}</span>}
      </Link>
      {onKudos && (
        <button type="button" className="app-btn app-btn-subtle teams-person-kudos" onClick={() => onKudos(person)}>
          <NavIcon name="sparkle" size={14} />{t('Похвалить')}
        </button>
      )}
    </div>
  );
}

function TeamCard({ team, members }) {
  const { t } = useLocalization();
  return (
    <Link to={`/teams/${team.id}`} className="teams-team-card">
      <span className="teams-team-banner" style={{ background: `hsl(${[...team.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 70% 88%)` }} />
      <span className="teams-team-body">
        <span className="teams-team-name">{team.name}</span>
        <span className="teams-team-avatars">
          {(members || []).slice(0, 5).map((m) => <Avatar key={m.userId} url={m.avatarUrl} name={m.displayName} size={24} />)}
          <span className="teams-person-sub">{members ? `${members.length} ${t('участн.')}` : '…'}</span>
        </span>
      </span>
    </Link>
  );
}

function useMyTeams() {
  const [list, setList] = useState(null);
  const [members, setMembers] = useState({});
  const load = useCallback(() => {
    teamsApi.getMyTeamsWithBoards().then((data) => {
      const items = (Array.isArray(data) ? data : []).map((x) => ({ ...(x.team ?? x.Team), boards: x.boards ?? x.Boards ?? [] }));
      setList(items);
      items.forEach((team) => teamsApi.getMembers(team.id).then((m) => setMembers((cur) => ({ ...cur, [team.id]: m }))).catch(() => {}));
    }).catch(() => setList([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { teams: list, members, reload: load };
}

function TeamsIllustration() {
  return (
    <div className="teams-illustration" aria-hidden="true">
      <div className="teams-illustration-back" />
      <div className="teams-illustration-front">
        <div className="teams-illustration-top"><span className="is-yellow" /><span className="is-bar" /><span className="is-pill" /></div>
        <div className="teams-illustration-cols">
          <div className="teams-illustration-panel">
            <span className="is-line" /><span className="is-line short" /><span className="is-line" />
            <span className="is-gap" />
            {[0, 1, 2, 3].map((i) => <span key={i} className="is-person"><i /><b /></span>)}
          </div>
          <div className="teams-illustration-stack">
            <div className="teams-illustration-panel"><span className="is-row pink" /><span className="is-row green" /></div>
            <div className="teams-illustration-panel"><span className="is-row blue" /><span className="is-row purple" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamsHomePage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { teams, members, reload } = useMyTeams();
  const [peopleList, setPeopleList] = useState(null);
  const [invites, setInvites] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [kudosFor, setKudosFor] = useState(null);
  const [notice, setNotice] = useState('');

  const loadPeople = useCallback(() => {
    peopleApi.workWith().then((list) => setPeopleList(Array.isArray(list) ? list : [])).catch(() => setPeopleList([]));
    teamsApi.getMyInvites().then((list) => setInvites(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  const answerInvite = async (invite, accept) => {
    const ok = accept ? await teamsApi.acceptInvite(invite.id) : await teamsApi.declineInvite(invite.id);
    if (ok) {
      setInvites((list) => list.filter((x) => x.id !== invite.id));
      if (accept) { reload(); loadPeople(); window.dispatchEvent(new CustomEvent('canban:spaces-changed')); }
    }
  };

  const selfCard = user ? [{ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, sharedTeams: 0, self: true }] : [];
  const cards = [...selfCard, ...(peopleList || [])].slice(0, 8);

  return (
    <div className="teams-page">
      {invites.length > 0 && (
        <section className="teams-section">
          <div className="teams-section-header"><h2>{t('Приглашения в команды')}</h2></div>
          {invites.map((invite) => (
            <div key={invite.id} className="teams-invite">
              <span><strong>{invite.invitedByUserName}</strong> {t('приглашает вас в команду')} <strong>{invite.teamName}</strong></span>
              <span className="settings-actions">
                <button type="button" className="app-btn app-btn-primary" onClick={() => answerInvite(invite, true)}>{t('Принять')}</button>
                <button type="button" className="app-btn" onClick={() => answerInvite(invite, false)}>{t('Отклонить')}</button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="teams-section">
        <div className="teams-section-header">
          <h2>{t('Люди, с которыми вы работаете')}</h2>
          <button type="button" className="app-btn teams-small-btn" onClick={() => setInviteOpen(true)}>{t('Добавить пользователей')}</button>
          <Link to="/people" className="teams-see-all">{t('Просмотреть всех')} <span aria-hidden="true">→</span></Link>
        </div>
        {notice && <p className="app-modal-success">{notice}</p>}
        <div className="teams-people-grid">
          {cards.map((person) => <PersonCard key={person.id} person={person} onKudos={person.self ? null : setKudosFor} />)}
        </div>
        {peopleList && peopleList.length === 0 && (
          <p className="settings-row-desc">{t('Пока здесь только вы. Пригласите коллег в команду, и они появятся в этом списке.')}</p>
        )}
      </section>

      {teams && teams.length > 0 && (
        <section className="teams-section">
          <div className="teams-section-header">
            <h2>{t('Ваши команды')}</h2>
            <Link to="/teams/list" className="teams-see-all">{t('Просмотреть всех')} <span aria-hidden="true">→</span></Link>
          </div>
          <div className="teams-team-grid">
            {teams.slice(0, 4).map((team) => <TeamCard key={team.id} team={team} members={members[team.id]} />)}
          </div>
        </section>
      )}

      <section className="teams-promo">
        <TeamsIllustration />
        <div className="teams-promo-text">
          <h2>{t('Раскройте работу своей команды')}</h2>
          <p>{t('Расскажите об участниках команды, о том, над чем они работают и как можно получить помощь вашей команды. Профиль с этими данными можно использовать во всех разделах Канбан.')}</p>
          <button type="button" className="app-btn app-btn-primary" onClick={() => setCreateOpen(true)}>{t('Создать команду')}</button>
        </div>
      </section>

      <CreateTeamDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(team, failed) => {
          setCreateOpen(false);
          window.dispatchEvent(new CustomEvent('canban:spaces-changed'));
          navigate(`/teams/${team.id}${failed.length ? '?inviteErrors=1' : ''}`);
        }}
      />
      <InvitePeopleDialog open={inviteOpen} teams={teams || []} onClose={() => setInviteOpen(false)} onDone={loadPeople} />
      <SendKudosDialog
        open={Boolean(kudosFor)}
        defaultUserId={kudosFor?.id}
        currentUserId={user?.id}
        onClose={() => setKudosFor(null)}
        onSent={(sent) => { setKudosFor(null); setNotice(`${t('Похвала отправлена')}: ${sent.toName}`); }}
      />
    </div>
  );
}

export function TeamsListPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { teams, members } = useMyTeams();
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const rows = (teams || []).filter((team) => !query.trim() || team.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="teams-page">
      <div className="settings-title-row">
        <h1 className="settings-title">{t('Команды')}</h1>
        <div className="settings-actions">
          <Link to="/teams/manage" className="app-btn">{t('Расширенное управление')}</Link>
          <button type="button" className="app-btn app-btn-primary" onClick={() => setCreateOpen(true)}>{t('Создать команду')}</button>
        </div>
      </div>
      <div className="settings-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск команд')} aria-label={t('Поиск команд')} />
        </label>
      </div>
      <div className="teams-team-grid" style={{ marginTop: 16 }}>
        {rows.map((team) => <TeamCard key={team.id} team={team} members={members[team.id]} />)}
      </div>
      {teams && rows.length === 0 && <p className="settings-empty">{teams.length ? t('Нет команд, соответствующих поиску.') : t('Вы пока не состоите ни в одной команде.')}</p>}
      {!teams && <p className="settings-empty">{t('Загрузка...')}</p>}
      <CreateTeamDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(team) => { setCreateOpen(false); window.dispatchEvent(new CustomEvent('canban:spaces-changed')); navigate(`/teams/${team.id}`); }} />
    </div>
  );
}

export function TeamPage() {
  const { teamId } = useParams();
  const { t, locale } = useLocalization();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [boards, setBoards] = useState([]);
  const [members, setMembers] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [kudosFor, setKudosFor] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [message, setMessage] = useState(new URLSearchParams(search).get('inviteErrors') ? t('Команда создана, но часть приглашений не отправлена.') : '');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    teamsApi.get(teamId).then((data) => { setTeam(data); setForm({ name: data.name, description: data.description || '' }); }).catch((e) => setError(e.message || t('Команда не найдена')));
    teamsApi.getMembers(teamId).then(setMembers).catch(() => setMembers([]));
    teamsApi.getMyTeamsWithBoards().then((list) => {
      const entry = (list || []).find((x) => (x.team ?? x.Team)?.id === teamId);
      setBoards(entry?.boards ?? []);
    }).catch(() => {});
  }, [teamId, t]);
  useEffect(() => { load(); }, [load]);

  const isOwner = team && team.ownerId === user?.id;

  const save = async (e) => {
    e.preventDefault();
    try {
      const updated = await teamsApi.update(teamId, { name: form.name.trim(), description: form.description.trim() || null });
      setTeam(updated);
      setEditing(false);
      window.dispatchEvent(new CustomEvent('canban:spaces-changed'));
    } catch (err) {
      setError(err.message || t('Не удалось сохранить'));
    }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`${t('Удалить из команды')} ${member.displayName}?`)) return;
    const result = await teamsApi.removeMember(teamId, member.userId);
    if (result === true) setMembers((list) => list.filter((m) => m.userId !== member.userId));
    else setError(t('Не удалось удалить участника'));
  };

  const leave = async () => {
    if (!window.confirm(t('Покинуть команду?'))) return;
    if (await teamsApi.leaveTeam(teamId)) { window.dispatchEvent(new CustomEvent('canban:spaces-changed')); navigate('/teams/list'); }
    else setError(t('Владелец не может покинуть команду. Передайте права или удалите команду.'));
  };

  const removeTeam = async () => {
    if (!window.confirm(`${t('Удалить команду')} «${team.name}» ${t('вместе со всеми разделами?')}`)) return;
    if (await teamsApi.delete(teamId)) { window.dispatchEvent(new CustomEvent('canban:spaces-changed')); navigate('/teams/list'); }
    else setError(t('Не удалось удалить команду'));
  };

  if (error && !team) return <div className="teams-page"><p className="settings-empty">{error}</p></div>;
  if (!team) return <div className="teams-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;

  return (
    <div className="teams-page">
      <div className="teams-team-hero" style={{ background: `hsl(${[...team.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 70% 88%)` }} />
      <div className="settings-breadcrumbs"><Link to="/teams/list">{t('Команды')}</Link></div>
      {editing ? (
        <form className="teams-edit" onSubmit={save}>
          <label className="settings-field"><span>{t('Название команды')}</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></label>
          <label className="settings-field"><span>{t('Описание')}</span><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
          <div className="settings-actions">
            <button type="submit" className="app-btn app-btn-primary" disabled={!form.name.trim()}>{t('Сохранить')}</button>
            <button type="button" className="app-btn app-btn-subtle" onClick={() => setEditing(false)}>{t('Отмена')}</button>
          </div>
        </form>
      ) : (
        <div className="settings-title-row">
          <h1 className="settings-title">{team.name}</h1>
          <div className="settings-actions">
            <button type="button" className="app-btn app-btn-primary" onClick={() => setInviteOpen(true)}>{t('Добавить пользователей')}</button>
            {isOwner && <button type="button" className="app-btn" onClick={() => setEditing(true)}>{t('Изменить')}</button>}
            {!isOwner && <button type="button" className="app-btn" onClick={leave}>{t('Покинуть команду')}</button>}
            {isOwner && <button type="button" className="app-btn app-btn-danger" onClick={removeTeam}>{t('Удалить команду')}</button>}
          </div>
        </div>
      )}
      {!editing && <p className="settings-description">{team.description || t('Добавьте описание, чтобы рассказать, чем занимается команда.')}</p>}
      {message && <p className="app-modal-success">{message}</p>}
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}

      <section className="teams-section">
        <div className="teams-section-header"><h2>{t('Участники')} {members ? `(${members.length})` : ''}</h2></div>
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead><tr><th>{t('Имя')}</th><th className="hide-mobile">{t('Роль')}</th><th className="hide-mobile">{t('В команде с')}</th><th className="is-narrow" aria-label={t('Действия')} /></tr></thead>
            <tbody>
              {(members || []).map((m) => (
                <tr key={m.userId}>
                  <td><Link to={`/people/${m.userId}`} className="settings-table-person"><Avatar url={m.avatarUrl} name={m.displayName} size={24} />{m.displayName}</Link></td>
                  <td className="hide-mobile"><span className={`settings-lozenge ${m.role === 'Owner' ? 'is-info' : ''}`}>{t(m.role === 'Owner' ? 'Владелец' : 'Участник')}</span></td>
                  <td className="hide-mobile">{new Date(m.joinedAt).toLocaleDateString(locale)}</td>
                  <td className="is-narrow">
                    <div className="settings-actions">
                      {m.userId !== user?.id && <button type="button" className="app-btn app-btn-subtle" onClick={() => setKudosFor(m)}><NavIcon name="sparkle" size={14} />{t('Похвалить')}</button>}
                      {isOwner && m.userId !== user?.id && <button type="button" className="app-btn" onClick={() => removeMember(m)}>{t('Удалить')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="teams-section">
        <div className="teams-section-header"><h2>{t('Разделы команды')}</h2></div>
        <div className="teams-space-list">
          {boards.map((b) => (
            <Link key={b.id} to={`/board/${b.id}`} className="teams-space-item"><SpaceAvatar id={b.id} name={b.name} size={24} />{b.name}</Link>
          ))}
          {boards.length === 0 && <p className="settings-row-desc">{t('У команды пока нет разделов.')}</p>}
        </div>
      </section>

      <InvitePeopleDialog open={inviteOpen} teams={[team]} defaultTeamId={team.id} onClose={() => setInviteOpen(false)} onDone={() => setMessage(t('Приглашения отправлены'))} />
      <SendKudosDialog
        open={Boolean(kudosFor)}
        defaultUserId={kudosFor?.userId}
        currentUserId={user?.id}
        onClose={() => setKudosFor(null)}
        onSent={(sent) => { setKudosFor(null); setMessage(`${t('Похвала отправлена')}: ${sent.toName}`); }}
      />
    </div>
  );
}

export function PeoplePage() {
  const { t } = useLocalization();
  const { user } = useAuth();
  const { teams } = useMyTeams();
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [kudosFor, setKudosFor] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    usersApi.getAll().then((data) => setList(Array.isArray(data) ? data : [])).catch(() => setList([]));
  }, []);

  const rows = useMemo(() => (list || [])
    .filter((p) => !query.trim() || p.displayName.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName)), [list, query]);

  return (
    <div className="teams-page">
      <div className="settings-title-row">
        <h1 className="settings-title">{t('Люди')}</h1>
        <button type="button" className="app-btn app-btn-primary" onClick={() => setInviteOpen(true)}>{t('Добавить пользователей')}</button>
      </div>
      <div className="settings-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск людей')} aria-label={t('Поиск людей')} />
        </label>
      </div>
      {notice && <p className="app-modal-success">{notice}</p>}
      <div className="teams-people-grid" style={{ marginTop: 16 }}>
        {rows.map((p) => <PersonCard key={p.id} person={p} onKudos={p.id === user?.id ? null : setKudosFor} />)}
      </div>
      {list && rows.length === 0 && <p className="settings-empty">{t('Никого не найдено.')}</p>}
      {!list && <p className="settings-empty">{t('Загрузка...')}</p>}
      <InvitePeopleDialog open={inviteOpen} teams={teams || []} onClose={() => setInviteOpen(false)} />
      <SendKudosDialog open={Boolean(kudosFor)} defaultUserId={kudosFor?.id} currentUserId={user?.id} onClose={() => setKudosFor(null)} onSent={(sent) => { setKudosFor(null); setNotice(`${t('Похвала отправлена')}: ${sent.toName}`); }} />
    </div>
  );
}

export function PersonPage() {
  const { userId } = useParams();
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const [person, setPerson] = useState(null);
  const [received, setReceived] = useState([]);
  const [kudosOpen, setKudosOpen] = useState(false);

  const load = useCallback(() => {
    usersApi.getPublic(userId).then(setPerson).catch(() => setPerson({ id: userId, displayName: '?' }));
    kudosApi.get('received', userId).then((list) => setReceived(Array.isArray(list) ? list : [])).catch(() => {});
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (!person) return <div className="teams-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;
  return (
    <div className="teams-page">
      <div className="teams-profile-header">
        <Avatar url={person.avatarUrl} name={person.displayName} size={128} />
        <div>
          <h1 className="settings-title">{person.displayName}</h1>
          <div className="settings-actions" style={{ marginTop: 12 }}>
            <Link to={`/profile/${userId}`} className="app-btn">{t('Профиль и достижения')}</Link>
            {userId !== user?.id && <button type="button" className="app-btn app-btn-primary" onClick={() => setKudosOpen(true)}><NavIcon name="sparkle" size={14} />{t('Похвалить')}</button>}
          </div>
        </div>
      </div>
      <section className="teams-section">
        <div className="teams-section-header"><h2>{t('Полученная похвала')} ({received.length})</h2></div>
        <KudosList items={received} locale={locale} />
      </section>
      <SendKudosDialog open={kudosOpen} defaultUserId={userId} currentUserId={user?.id} onClose={() => setKudosOpen(false)} onSent={() => { setKudosOpen(false); load(); }} />
    </div>
  );
}

function KudosList({ items, locale }) {
  const { t } = useLocalization();
  if (items.length === 0) return <p className="settings-row-desc">{t('Пока нет похвалы.')}</p>;
  return (
    <div className="kudos-list">
      {items.map((k) => {
        const [, emoji, label] = kudosKindMeta(k.kind);
        return (
          <article key={k.id} className="kudos-card">
            <div className="kudos-card-emoji" aria-hidden="true">{emoji}</div>
            <div className="kudos-card-body">
              <div className="kudos-card-head">
                <Link to={`/people/${k.fromUserId}`} className="settings-table-person"><Avatar url={k.fromAvatarUrl} name={k.fromName} size={20} />{k.fromName}</Link>
                <span className="kudos-card-arrow">→</span>
                <Link to={`/people/${k.toUserId}`} className="settings-table-person"><Avatar url={k.toAvatarUrl} name={k.toName} size={20} />{k.toName}</Link>
                <span className="settings-lozenge is-info">{t(label)}</span>
              </div>
              <p className="kudos-card-message">{k.message}</p>
              <time className="teams-person-sub" dateTime={k.createdAt}>{timeAgo(k.createdAt, locale)}</time>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function KudosPage() {
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const [scope, setScope] = useState('received');
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    setItems(null);
    kudosApi.get(scope).then((list) => setItems(Array.isArray(list) ? list : [])).catch(() => setItems([]));
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="teams-page">
      <div className="settings-title-row">
        <h1 className="settings-title">{t('Похвала')}</h1>
        <button type="button" className="app-btn app-btn-primary" onClick={() => setOpen(true)}><NavIcon name="sparkle" size={14} />{t('Отправить похвалу')}</button>
      </div>
      <p className="settings-description">{t('Благодарите коллег за помощь и отличную работу. Получатель увидит похвалу в уведомлениях и в своём профиле.')}</p>
      <div className="foryou-tabs teams-tabs" role="tablist">
        {[['received', 'Полученные'], ['given', 'Отправленные'], ['all', 'Все']].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={scope === value} className={`foryou-tab ${scope === value ? 'is-active' : ''}`} onClick={() => setScope(value)}>{t(label)}</button>
        ))}
      </div>
      {items ? <KudosList items={items} locale={locale} /> : <p className="settings-empty">{t('Загрузка...')}</p>}
      <SendKudosDialog open={open} currentUserId={user?.id} onClose={() => setOpen(false)} onSent={() => { setOpen(false); setScope('given'); load(); }} />
    </div>
  );
}
