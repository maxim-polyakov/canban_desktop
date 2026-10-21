import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi, teams as teamsApi, character as characterApi, contributingTeams, notifications as notificationsApi, search as searchApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import ContributingTeamsDialog, { TeamAvatar } from './ContributingTeamsDialog.jsx';
import SpaceAvatar, { SpaceAvatarPicker } from './SpaceAvatar.jsx';
import AppSidebar, { CREATE_SPACE_EVENT, SPACES_CHANGED_EVENT } from './AppSidebar.jsx';
import CreateSpaceDialog from './CreateSpaceDialog.jsx';
import { isTeamsHubPath, TeamsHubSidebar } from '../pages/teams/TeamsPages.jsx';
import { CreateHomeItemDialog, HomeHubSidebar, isHomeHubPath } from '../pages/home/HomePages.jsx';

const APP_SWITCHER = [
  ['/for-you', 'board', 'Канбан', (p) => !isTeamsHubPath(p) && !isHomeHubPath(p) && !p.startsWith('/assets')],
  ['/teams', 'teams', 'Команды', (p) => isTeamsHubPath(p)],
  ['/goals', 'goals', 'Цели', (p) => p.startsWith('/goals')],
  ['/projects', 'projects', 'Проекты', (p) => p.startsWith('/projects')],
  ['/assets', 'assets', 'Активы', (p) => p.startsWith('/assets')],
];
import NotificationsPanel from './NotificationsPanel.jsx';
import HelpPanel from './HelpPanel.jsx';
import CreateIssueDialog from './CreateIssueDialog.jsx';
import { ProfileMenu, SettingsMenu } from './HeaderMenus.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { isBoardStarred, rememberBoard, toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';
import { ALL_TAB_KEYS, BOARD_CHANGED_EVENT, firstSpacePath, spaceTabs, startOnboarding } from '../utils/spaceFeatures.js';
import OnboardingButton from './SpaceOnboarding.jsx';
import { loadIssueCatalog } from '../utils/issueConfig.js';
import './Layout.css';

const BOARD_ROUTE_RE = /^\/board\/([^/]+)(?:\/([^/]+))?/;
const SPACE_SETTINGS = [
  ['settings', 'settings', 'Сведения'],
  ['access', 'eye', 'Доступ'],
  ['features', 'customize', 'Функции'],
  ['components', 'components', 'Компоненты'],
  ['workflow', 'workflow', 'Workflow'],
  ['permissions', 'lock', 'Разрешения'],
  ['automations', 'automation', 'Автоматизация'],
  ['integrations', 'integrations', 'Интеграции'],
  ['operations', 'operations', 'Операции'],
];
const ISSUE_KEY_RE = /^[A-Za-zА-Яа-я][\wА-Яа-я]*-\d+$/;
const POLL_MS = 60000;

function useActiveBoard(pathname) {
  return useMemo(() => {
    const match = pathname.match(BOARD_ROUTE_RE);
    if (!match) return { boardId: null, tab: null };
    const segment = match[2];
    const known = [...ALL_TAB_KEYS, ...SPACE_SETTINGS.map((x) => x[0])];
    return { boardId: match[1], tab: known.includes(segment) ? segment : 'board' };
  }, [pathname]);
}

function normalizeTeams(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const team = item.team ?? item.Team ?? {};
    return {
      team: { id: team.id ?? team.Id, name: team.name ?? team.Name ?? 'Команда', key: team.key ?? team.Key ?? 'KAN' },
      boards: (item.boards ?? item.Boards ?? []).map((b) => ({
        id: b.id ?? b.Id,
        name: b.name ?? b.Name ?? 'Доска',
        keyPrefix: b.keyPrefix ?? b.KeyPrefix ?? 'KAN',
        template: b.template ?? b.Template ?? 'kanban',
        access: b.access ?? b.Access ?? 'private',
        features: b.features ?? b.Features ?? '',
        avatarUrl: b.avatarUrl ?? b.AvatarUrl ?? null,
      })),
    };
  });
}

function isTypingTarget(target) {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
}

function useOutsideClose(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, open, close]);
}

function GlobalSearch({ inputRef, boardsById, onDone }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { viewedIssues, recentBoards } = useNavHistory();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(wrapRef, open, close);

  const needle = text.trim().toLowerCase();
  const matches = (value) => !needle || String(value || '').toLowerCase().includes(needle);
  const issues = viewedIssues.filter((x) => matches(x.title) || matches(x.issueKey)).slice(0, 6);
  const spaces = recentBoards.map((b) => boardsById.get(b.id)).filter(Boolean).filter((b) => matches(b.name)).slice(0, 3);

  const go = (path) => { setOpen(false); setText(''); inputRef.current?.blur(); onDone?.(); navigate(path); };

  const submit = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (ISSUE_KEY_RE.test(value)) {
      setBusy(true);
      try {
        const result = await searchApi.issues({ jql: `key = ${value.toUpperCase()}`, pageSize: 1 });
        const issue = (Array.isArray(result) ? result : result?.items || [])[0];
        if (issue) { go(`/board/${issue.boardId}/issue/${issue.id}`); return; }
      } catch {
        // fall through to the text search
      } finally {
        setBusy(false);
      }
    }
    go(`/issues?jql=${encodeURIComponent(`summary ~ "${value.replace(/"/g, '')}"`)}`);
  };

  return (
    <form className={`app-search ${open ? 'is-open' : ''}`} ref={wrapRef} onSubmit={submit} role="search">
      <NavIcon name="search" className="app-search-icon" />
      <input
        ref={inputRef}
        type="search"
        value={text}
        placeholder={t('Поиск')}
        aria-label={t('Поиск')}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
      />
      {busy && <span className="app-search-busy">…</span>}
      {open && (
        <div className="app-search-dropdown">
          {issues.length > 0 && <div className="app-flyout-section">{t('Недавно просмотренные задачи')}</div>}
          {issues.map((issue) => (
            <button key={issue.id} type="button" className="app-search-item" onClick={() => go(`/board/${issue.boardId}/issue/${issue.id}`)}>
              <IssueTypeIcon issueType={issue.issueType} typeId={issue.issueTypeId} size={16} />
              <span className="app-nav-text">
                <span className="app-nav-label">{issue.title}</span>
                <span className="app-nav-sub">{[issue.issueKey, boardsById.get(issue.boardId)?.name].filter(Boolean).join(' • ')}</span>
              </span>
            </button>
          ))}
          {spaces.length > 0 && <div className="app-flyout-section">{t('Недавние разделы')}</div>}
          {spaces.map((b) => (
            <button key={b.id} type="button" className="app-search-item" onClick={() => go(`/board/${b.id}`)}>
              <SpaceAvatar id={b.id} name={b.name} avatarUrl={b.avatarUrl} size={16} />
              <span className="app-nav-label">{b.name}</span>
            </button>
          ))}
          {issues.length === 0 && spaces.length === 0 && !needle && <p className="app-flyout-empty">{t('Введите ключ задачи (например KAN-12) или текст.')}</p>}
          {needle && (
            <button type="submit" className="app-search-item app-search-all">
              <NavIcon name="search" />
              <span className="app-nav-label">{t('Искать задачи')}: «{text.trim()}»</span>
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function SpaceHeader({ board, boardId, tab }) {
  const { t } = useLocalization();
  useNavHistory();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const ref = useRef(null);
  const close = useCallback(() => setMenuOpen(false), []);
  useOutsideClose(ref, menuOpen, close);
  const [teams, setTeams] = useState([]);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const closeTeams = useCallback(() => setTeamsOpen(false), []);
  useEffect(() => {
    if (!boardId) return undefined;
    let alive = true;
    setTeams([]);
    contributingTeams.get(boardId).then((res) => { if (alive) setTeams(res?.teams || []); }).catch(() => {});
    return () => { alive = false; };
  }, [boardId]);
  const starred = isBoardStarred(boardId);
  const name = board?.name || t('Доска');
  return (
    <div className="app-space-header">
      <div className="app-space-breadcrumbs"><Link to="/spaces">{t('Разделы')}</Link></div>
      <div className="app-space-title-row">
        <span className="app-space-avatar">
          <button type="button" className="app-space-avatar-btn" onClick={() => setPickerOpen((v) => !v)} aria-label={t('Изменить аватар')} title={t('Изменить аватар')}>
            <SpaceAvatar id={boardId} name={name} avatarUrl={board?.avatarUrl} size={24} />
          </button>
          {pickerOpen && (
            <SpaceAvatarPicker boardId={boardId} value={board?.avatarUrl} onClose={closePicker}
              onChange={() => { setPickerOpen(false); window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT)); }} />
          )}
        </span>
        <h1 className="app-space-title" title={name}>{name}</h1>
        <button
          type="button"
          className={`app-icon-btn app-space-star ${starred ? 'is-starred' : ''}`}
          aria-label={starred ? t('Убрать из отмеченных') : t('Отметить')}
          onClick={() => toggleStarredBoard({ id: boardId, name, teamName: board?.teamName })}
        >
          <NavIcon name="star" filled={starred} />
        </button>
        <OnboardingButton board={board} boardId={boardId} />
        <span className="app-space-teams">
          <button type="button" className={`app-icon-btn ${teams.length ? 'app-space-teams-btn' : ''}`} onClick={() => setTeamsOpen(true)}
            aria-label={t('Участвующие команды')} title={teams.length ? teams.map((x) => x.name).join(', ') : t('Привязать участвующие команды')}>
            {teams.length === 0 ? <NavIcon name="teams" /> : (
              <span className="app-space-teams-stack">
                {teams.slice(0, 3).map((team) => <TeamAvatar key={team.id} team={team} size={20} />)}
                {teams.length > 3 && <span className="app-space-teams-more">+{teams.length - 3}</span>}
              </span>
            )}
          </button>
        </span>
        {teamsOpen && <ContributingTeamsDialog boardId={boardId} onClose={closeTeams} onSaved={setTeams} />}
        <div className="app-space-more" ref={ref}>
          <button type="button" className="app-icon-btn" aria-label={t('Настройки раздела')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <NavIcon name="more" />
          </button>
          {menuOpen && (
            <div className="app-menu" role="menu">
              <div className="app-settings-heading">{t('Настройки раздела')}</div>
              {SPACE_SETTINGS.map(([segment, icon, label]) => (
                <Link key={segment} to={`/board/${boardId}/${segment}`} role="menuitem" className={`app-menu-item ${tab === segment ? 'is-active' : ''}`} onClick={close}>
                  <NavIcon name={icon} />{t(label)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <nav className="app-space-tabs" aria-label={t('Представления раздела')}>
        {spaceTabs(board).map(([feature, key, suffix, icon, label]) => (
          <Link key={feature} to={`/board/${boardId}${suffix}`} className={`app-space-tab ${tab === key ? 'is-active' : ''}`}>
            <NavIcon name={icon} size={14} />{t(label)}
          </Link>
        ))}
        <Link to={`/board/${boardId}/features`} className="app-space-tab app-space-tab-add" aria-label={t('Функции')} title={t('Функции')}>
          <NavIcon name="plus" size={14} />
        </Link>
        {SPACE_SETTINGS.some(([segment]) => segment === tab) && (
          <span className="app-space-tab is-active">
            <NavIcon name={SPACE_SETTINGS.find(([s]) => s === tab)[1]} size={14} />
            {t(SPACE_SETTINGS.find(([s]) => s === tab)[2])}
          </span>
        )}
      </nav>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLocalization();
  const location = useLocation();
  const { boardId, tab } = useActiveBoard(location.pathname);
  const searchRef = useRef(null);
  const settingsRef = useRef(null);
  const profileRef = useRef(null);
  const appsRef = useRef(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('canban.nav.collapsed') === '1');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [teamsWithBoards, setTeamsWithBoards] = useState([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [character, setCharacter] = useState(null);
  const [panel, setPanel] = useState(null);
  const [menu, setMenu] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [createSpace, setCreateSpace] = useState(null);
  const homeKind = isHomeHubPath(location.pathname) ? (location.pathname.startsWith('/goals') ? 'goals' : 'projects') : null;
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  const loadTeams = useCallback(() => {
    teamsApi.getMyTeamsWithBoards()
      .then((list) => setTeamsWithBoards(normalizeTeams(list)))
      .catch(() => setTeamsWithBoards([]))
      .finally(() => setTeamsLoaded(true));
  }, []);

  useEffect(() => {
    loadTeams();
    characterApi.getMe().then(setCharacter).catch(() => {});
    loadIssueCatalog().catch(() => {});
  }, [loadTeams]);

  useEffect(() => {
    if (['/', '/for-you', '/spaces', '/teams'].includes(location.pathname)) loadTeams();
  }, [location.pathname, loadTeams]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => notificationsApi.get({ unreadOnly: true })
      .then((list) => { if (!cancelled) setUnread(Array.isArray(list) ? list.length : 0); })
      .catch(() => {});
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const allBoards = useMemo(
    () => teamsWithBoards.flatMap(({ team, boards }) => boards.map((b) => ({ ...b, teamName: team.name }))),
    [teamsWithBoards],
  );
  const boardsById = useMemo(() => new Map(allBoards.map((b) => [b.id, b])), [allBoards]);
  const [outsideBoard, setOutsideBoard] = useState(null);
  const memberBoard = boardId ? boardsById.get(boardId) : null;
  const activeBoard = memberBoard || (outsideBoard?.id === boardId ? outsideBoard : null);

  useEffect(() => {
    if (!boardId || memberBoard || !teamsLoaded) return undefined;
    let alive = true;
    boardsApi.getById(boardId)
      .then((b) => { if (alive && b) setOutsideBoard({ id: b.id, name: b.name, keyPrefix: b.keyPrefix, template: b.template, access: b.access, features: b.features, avatarUrl: b.avatarUrl }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [boardId, memberBoard, teamsLoaded]);

  useEffect(() => {
    const onBoardChanged = (e) => {
      const changed = e.detail?.board;
      if (!changed) return;
      setTeamsWithBoards((list) => list.map((entry) => ({
        ...entry,
        boards: entry.boards.map((b) => (b.id === changed.id ? { ...b, ...changed } : b)),
      })));
      setOutsideBoard((current) => (current?.id === changed.id ? { ...current, ...changed } : current));
    };
    window.addEventListener(BOARD_CHANGED_EVENT, onBoardChanged);
    return () => window.removeEventListener(BOARD_CHANGED_EVENT, onBoardChanged);
  }, []);

  useEffect(() => {
    if (activeBoard) rememberBoard({ id: activeBoard.id, name: activeBoard.name, teamName: activeBoard.teamName });
  }, [activeBoard]);

  useEffect(() => {
    setMobileSidebarOpen(false);
    setMenu(null);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onCreateSpace = (e) => {
      if (e.detail?.template) setCreateSpace({ template: e.detail.template });
      else navigate('/spaces/templates');
    };
    window.addEventListener(CREATE_SPACE_EVENT, onCreateSpace);
    window.addEventListener(SPACES_CHANGED_EVENT, loadTeams);
    return () => {
      window.removeEventListener(CREATE_SPACE_EVENT, onCreateSpace);
      window.removeEventListener(SPACES_CHANGED_EVENT, loadTeams);
    };
  }, [loadTeams, navigate]);

  const handleSpaceCreated = (board, template) => {
    setCreateSpace(null);
    startOnboarding(board.id, template);
    window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT));
    const features = String(board.features || '').split(',').filter(Boolean);
    navigate(firstSpacePath(board.id, features.length ? features : ['board']));
  };

  const changeTemplate = () => {
    const current = createSpace?.template;
    setCreateSpace(null);
    navigate(current ? `/spaces/templates/${current}` : '/spaces/templates');
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  useOutsideClose(settingsRef, menu === 'settings', closeMenu);
  useOutsideClose(profileRef, menu === 'profile', closeMenu);
  useOutsideClose(appsRef, menu === 'apps', closeMenu);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenu(null); setPanel(null); setMobileSidebarOpen(false); setCreateOpen(false); setCreateSpace(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === '/') { e.preventDefault(); setMobileSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (e.key === 'c' || e.key === 'с') { e.preventDefault(); setCreateOpen(true); }
      else if (e.key === '?') { e.preventDefault(); setPanel('help'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 768px)').matches) { setMobileSidebarOpen((v) => !v); return; }
    setSidebarCollapsed((v) => {
      window.localStorage.setItem('canban.nav.collapsed', v ? '0' : '1');
      return !v;
    });
  };
  const togglePanel = (name) => { setMenu(null); setPanel((current) => (current === name ? null : name)); };
  const toggleMenu = (name) => setMenu((current) => (current === name ? null : name));

  const handleLogout = () => { setMenu(null); logout(); navigate('/login'); };

  const sidebar = (inline) => (isTeamsHubPath(location.pathname) ? (
    <TeamsHubSidebar pathname={location.pathname} onNavigate={() => setMobileSidebarOpen(false)} />
  ) : isHomeHubPath(location.pathname) ? (
    <HomeHubSidebar pathname={location.pathname} onNavigate={() => setMobileSidebarOpen(false)} />
  ) : (
    <AppSidebar
      teamsWithBoards={teamsWithBoards}
      activeBoardId={boardId}
      pathname={location.pathname}
      inline={inline}
      onNavigate={() => setMobileSidebarOpen(false)}
    />
  ));

  return (
    <div className={`layout-shell ${sidebarCollapsed ? 'layout-sidebar-collapsed' : ''} ${panel ? 'layout-has-panel' : ''}`}>
      <header className="layout-header">
        <div className="layout-header-left">
          <button type="button" className="app-icon-btn" aria-label={t('Боковая панель')} title={t('Боковая панель')} onClick={toggleSidebar}>
            <NavIcon name="sidebar" />
          </button>
          <div className="layout-menu-anchor" ref={appsRef}>
            <button type="button" className={`app-icon-btn ${menu === 'apps' ? 'is-active' : ''}`} aria-label={t('Приложения')} title={t('Приложения')} aria-expanded={menu === 'apps'} onClick={() => toggleMenu('apps')}>
              <NavIcon name="apps" />
            </button>
            {menu === 'apps' && (
              <div className="app-menu layout-apps-menu" role="menu">
                {APP_SWITCHER.map(([to, icon, label, isActive]) => (
                  <Link key={to} to={to} role="menuitem" className={`app-menu-item ${isActive(location.pathname) ? 'is-active' : ''}`} onClick={closeMenu}>
                    <span className="layout-apps-icon"><NavIcon name={icon} size={14} /></span>
                    {t(label)}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link to={isTeamsHubPath(location.pathname) ? '/teams' : '/'} className="layout-logo" aria-label="Канбан">
            <span className="layout-logo-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 3h3v10H3zM7.5 3h3v6h-3zM12 3h1.5v8H12z" fill="#fff" /></svg>
            </span>
            <span className="layout-logo-text">{isTeamsHubPath(location.pathname) ? t('Команды') : 'Канбан'}</span>
          </Link>
        </div>

        <div className={`layout-header-center ${mobileSearchOpen ? 'is-search-open' : ''}`}>
          <GlobalSearch inputRef={searchRef} boardsById={boardsById} onDone={() => setMobileSearchOpen(false)} />
          <button type="button" className="app-btn app-btn-primary layout-create" onClick={() => setCreateOpen(true)} title={`${t('Создать задачу')} (c)`}>
            <NavIcon name="plus" size={14} />
            <span className="layout-create-text">{t('Создать')}</span>
          </button>
        </div>

        <div className="layout-header-right">
          <button type="button" className="app-icon-btn layout-search-toggle" aria-label={t('Поиск')} onClick={() => { setMobileSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }}>
            <NavIcon name="search" />
          </button>
          <button type="button" className={`app-icon-btn ${panel === 'notifications' ? 'is-active' : ''}`} aria-label={t('Уведомления')} title={t('Уведомления')} onClick={() => togglePanel('notifications')}>
            <NavIcon name="bell" />
            {unread > 0 && <span className="app-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button type="button" className={`app-icon-btn layout-help-btn ${panel === 'help' ? 'is-active' : ''}`} aria-label={t('Справка')} title={t('Справка')} onClick={() => togglePanel('help')}>
            <NavIcon name="help" />
          </button>
          <div className="layout-menu-anchor" ref={settingsRef}>
            <button type="button" className={`app-icon-btn ${menu === 'settings' ? 'is-active' : ''}`} aria-label={t('Настройки')} title={t('Настройки')} aria-expanded={menu === 'settings'} onClick={() => toggleMenu('settings')}>
              <NavIcon name="settings" />
            </button>
            {menu === 'settings' && <SettingsMenu boardId={boardId} onClose={closeMenu} />}
          </div>
          <div className="layout-menu-anchor" ref={profileRef}>
            <button type="button" className="layout-avatar-btn" aria-label={t('Профиль')} aria-expanded={menu === 'profile'} onClick={() => toggleMenu('profile')}>
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="app-avatar" />
                : <span className="app-avatar app-avatar-placeholder">{user?.displayName?.charAt(0) || '?'}</span>}
            </button>
            {menu === 'profile' && (
              <ProfileMenu user={user} character={character} onClose={closeMenu} onLogout={handleLogout} onSwitchAccount={handleLogout} />
            )}
          </div>
        </div>
      </header>

      <div className="layout-body">
        <aside className="layout-sidebar">{sidebar(false)}</aside>

        {mobileSidebarOpen && (
          <div className="layout-mobile-sidebar-overlay" onClick={() => setMobileSidebarOpen(false)}>
            <aside className="layout-sidebar layout-sidebar-mobile" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="app-icon-btn layout-mobile-sidebar-close" onClick={() => setMobileSidebarOpen(false)} aria-label={t('Закрыть')}>
                <NavIcon name="close" />
              </button>
              {sidebar(true)}
            </aside>
          </div>
        )}

        <main className={`layout-main ${boardId ? 'has-space-header' : ''}`}>
          {boardId && <SpaceHeader board={activeBoard} boardId={boardId} tab={tab} />}
          <Outlet />
        </main>

        <NotificationsPanel open={panel === 'notifications'} onClose={() => setPanel(null)} onUnreadChange={setUnread} />
        <HelpPanel open={panel === 'help'} onClose={() => setPanel(null)} />
      </div>

      <CreateSpaceDialog
        open={Boolean(createSpace)}
        initialTemplate={createSpace?.template}
        teamsWithBoards={teamsWithBoards}
        onClose={() => setCreateSpace(null)}
        onCreated={handleSpaceCreated}
        onChangeTemplate={changeTemplate}
      />
      <CreateIssueDialog open={createOpen && !homeKind} onClose={() => setCreateOpen(false)} boards={allBoards} defaultBoardId={boardId} />
      <CreateHomeItemDialog open={createOpen && Boolean(homeKind)} kind={homeKind || 'projects'} onClose={closeCreate}
        onCreated={(created) => { setCreateOpen(false); navigate(`/${homeKind}/${created.item.id}`); }} />
    </div>
  );
}
