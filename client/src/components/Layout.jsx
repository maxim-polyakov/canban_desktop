import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { teams as teamsApi, character as characterApi } from '../api.js';
import LanguageSelector from './LanguageSelector.jsx';
import './Layout.css';

const BOARD_ROUTE_RE = /^\/board\/([^/]+)(?:\/([^/]+))?/;

function useActiveBoard(pathname) {
  return useMemo(() => {
    const match = pathname.match(BOARD_ROUTE_RE);
    if (!match) return { boardId: null, tab: null };
    const tabSegment = match[2];
    const tab = ['backlog', 'reports', 'roadmap', 'components', 'releases', 'workflow', 'permissions', 'automations', 'integrations', 'operations', 'archive'].includes(tabSegment) ? tabSegment : 'board';
    return { boardId: match[1], tab };
  }, [pathname]);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLocalization();
  const location = useLocation();
  const { boardId, tab } = useActiveBoard(location.pathname);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [teamsWithBoards, setTeamsWithBoards] = useState([]);
  const [expandedTeamIds, setExpandedTeamIds] = useState(new Set());
  const [character, setCharacter] = useState(null);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    teamsApi.getMyTeamsWithBoards().then((list) => {
      if (cancelled) return;
      const normalized = (Array.isArray(list) ? list : []).map((item) => {
        const team = item.team ?? item.Team ?? {};
        const boardsList = item.boards ?? item.Boards ?? [];
        return {
          team: {
            id: team.id ?? team.Id,
            name: team.name ?? team.Name ?? 'Команда',
            key: team.key ?? team.Key ?? 'KAN',
          },
          boards: boardsList.map((b) => ({
            id: b.id ?? b.Id,
            name: b.name ?? b.Name ?? 'Доска',
            keyPrefix: b.keyPrefix ?? b.KeyPrefix ?? 'KAN',
          })),
        };
      });
      setTeamsWithBoards(normalized);
      setExpandedTeamIds(new Set(normalized.map((item) => item.team.id)));
    }).catch(() => setTeamsWithBoards([]));
    characterApi.getMe().then((c) => { if (!cancelled) setCharacter(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { setProfileMenuOpen(false); setMobileSidebarOpen(false); }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setProfileMenuOpen(false);
    logout();
    navigate('/login');
  };

  const toggleTeamExpanded = (teamId) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });
  };

  const levelChip = character && (
    <Link to="/profile" className="layout-level-chip" title={t('Персонаж')}>
      <span className="layout-level-chip-num">{character.levelNumber}</span>
      <span className="layout-level-chip-text">{character.totalXp} XP</span>
    </Link>
  );

  const sidebarContent = (
    <>
      <div className="layout-sidebar-header">
        <span className="layout-sidebar-title">{t('Проекты')}</span>
      </div>
      <nav className="layout-sidebar-projects">
        {teamsWithBoards.map(({ team, boards: teamBoards }) => (
          <div key={team.id} className="layout-sidebar-team">
            <button
              type="button"
              className="layout-sidebar-team-toggle"
              onClick={() => toggleTeamExpanded(team.id)}
            >
              <span className="layout-sidebar-team-key">{team.key}</span>
              <span className="layout-sidebar-team-name">{team.name}</span>
              <span className={`layout-sidebar-chevron ${expandedTeamIds.has(team.id) ? 'is-open' : ''}`}>▸</span>
            </button>
            {expandedTeamIds.has(team.id) && (
              <ul className="layout-sidebar-boards">
                {teamBoards.map((b) => (
                  <li key={b.id}>
                    <Link
                      to={`/board/${b.id}`}
                      className={`layout-sidebar-board-link ${boardId === b.id ? 'is-active' : ''}`}
                    >
                      <span className="layout-sidebar-board-chip">{b.keyPrefix}</span>
                      {b.name}
                    </Link>
                  </li>
                ))}
                {teamBoards.length === 0 && <li className="layout-sidebar-empty">{t('Нет досок')}</li>}
              </ul>
            )}
          </div>
        ))}
        {teamsWithBoards.length === 0 && <p className="layout-sidebar-empty">{t('Нет команд')}</p>}
      </nav>
      <div className="layout-sidebar-footer">
        <Link to="/users" className="layout-sidebar-footer-link">{t('Участники')}</Link>
      </div>
    </>
  );

  return (
    <div className={`layout-shell ${sidebarCollapsed ? 'layout-sidebar-collapsed' : ''}`}>
      <header className="layout-header">
        <button
          type="button"
          className="layout-hamburger"
          aria-label={t('Меню')}
          onClick={() => setMobileSidebarOpen((open) => !open)}
        >
          ☰
        </button>
        <button
          type="button"
          className="layout-sidebar-toggle"
          aria-label={t('Свернуть панель')}
          onClick={() => setSidebarCollapsed((v) => !v)}
          title={t('Свернуть панель')}
        >
          ⟨⟩
        </button>
        <Link to="/" className="layout-logo">Канбан</Link>
        <nav className="layout-nav">
          <Link to="/">{t('Моя работа')}</Link>
          <Link to="/issues">{t('Задачи')}</Link>
          <Link to="/dashboards">{t('Дашборды')}</Link>
        </nav>
        <div className="layout-user">
          {levelChip}
          <div className="layout-profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="layout-profile-trigger"
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="layout-avatar" />
              ) : (
                <span className="layout-avatar-placeholder">{user?.displayName?.charAt(0) || '?'}</span>
              )}
              <span className="layout-name">{user?.displayName}</span>
            </button>
            {profileMenuOpen && (
              <div className="layout-profile-popover">
                <Link to="/profile" className="layout-profile-link" onClick={() => setProfileMenuOpen(false)}>
                  {t('Профиль')}
                </Link>
                <LanguageSelector className="language-selector-profile" />
                <button type="button" className="layout-profile-logout" onClick={handleLogout}>
                  {t('Выйти')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {boardId && (
        <div className="layout-board-tabs">
          <Link to={`/board/${boardId}`} className={`layout-board-tab ${tab === 'board' ? 'is-active' : ''}`}>{t('Доска')}</Link>
          <Link to={`/board/${boardId}/backlog`} className={`layout-board-tab ${tab === 'backlog' ? 'is-active' : ''}`}>{t('Backlog')}</Link>
          <Link to={`/board/${boardId}/roadmap`} className={`layout-board-tab ${tab === 'roadmap' ? 'is-active' : ''}`}>{t('Roadmap')}</Link>
          <Link to={`/board/${boardId}/reports`} className={`layout-board-tab ${tab === 'reports' ? 'is-active' : ''}`}>{t('Отчёты')}</Link>
          <Link to={`/board/${boardId}/components`} className={`layout-board-tab ${tab === 'components' ? 'is-active' : ''}`}>{t('Компоненты')}</Link>
          <Link to={`/board/${boardId}/releases`} className={`layout-board-tab ${tab === 'releases' ? 'is-active' : ''}`}>{t('Релизы')}</Link>
          <Link to={`/board/${boardId}/workflow`} className={`layout-board-tab ${tab === 'workflow' ? 'is-active' : ''}`}>{t('Workflow')}</Link>
          <Link to={`/board/${boardId}/permissions`} className={`layout-board-tab ${tab === 'permissions' ? 'is-active' : ''}`}>{t('Разрешения')}</Link>
          <Link to={`/board/${boardId}/automations`} className={`layout-board-tab ${tab === 'automations' ? 'is-active' : ''}`}>{t('Автоматизация')}</Link>
          <Link to={`/board/${boardId}/integrations`} className={`layout-board-tab ${tab === 'integrations' ? 'is-active' : ''}`}>{t('Интеграции')}</Link>
          <Link to={`/board/${boardId}/operations`} className={`layout-board-tab ${tab === 'operations' ? 'is-active' : ''}`}>{t('Операции')}</Link>
          <Link to={`/board/${boardId}/archive`} className={`layout-board-tab ${tab === 'archive' ? 'is-active' : ''}`}>{t('Архив')}</Link>
        </div>
      )}

      <div className="layout-body">
        <aside className="layout-sidebar">
          {sidebarContent}
        </aside>

        {mobileSidebarOpen && (
          <div className="layout-mobile-sidebar-overlay" onClick={() => setMobileSidebarOpen(false)}>
            <aside className="layout-sidebar layout-sidebar-mobile" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="layout-mobile-sidebar-close" onClick={() => setMobileSidebarOpen(false)} aria-label={t('Закрыть')}>✕</button>
              {sidebarContent}
            </aside>
          </div>
        )}

        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
