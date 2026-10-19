import React, { useEffect, useRef, useState } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import SpaceAvatar from './SpaceAvatar.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';

function Flyout({ anchor, onClose, title, children, inline }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (inline || !anchor) return undefined;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: Math.min(rect.top, window.innerHeight - 420), left: rect.right + 6 });
    const close = (e) => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [anchor, inline, onClose]);
  if (inline) return <div className="app-flyout app-flyout-inline">{children}</div>;
  if (!pos) return null;
  return (
    <div ref={ref} className="app-flyout" style={{ top: Math.max(8, pos.top), left: pos.left }} role="dialog" aria-label={title}>
      <div className="app-flyout-title">{title}</div>
      {children}
    </div>
  );
}

function BoardRow({ board, active, starred, onNavigate, showTeam }) {
  const { t } = useLocalization();
  return (
    <div className={`app-nav-item app-nav-board ${active ? 'is-active' : ''}`}>
      <Link to={`/board/${board.id}`} className="app-nav-link" onClick={onNavigate} title={board.name}>
        <SpaceAvatar id={board.id} name={board.name} size={20} />
        <span className="app-nav-text">
          <span className="app-nav-label">{board.name}</span>
          {showTeam && board.teamName && <span className="app-nav-sub">{board.teamName}</span>}
        </span>
      </Link>
      <button
        type="button"
        className={`app-nav-star ${starred ? 'is-starred' : ''}`}
        aria-label={starred ? t('Убрать из отмеченных') : t('Отметить')}
        title={starred ? t('Убрать из отмеченных') : t('Отметить')}
        onClick={() => toggleStarredBoard({ id: board.id, name: board.name, teamName: board.teamName })}
      >
        <NavIcon name="star" size={14} filled={starred} />
      </button>
    </div>
  );
}

export default function AppSidebar({ teamsWithBoards, activeBoardId, pathname, onNavigate, inline = false }) {
  const { t } = useLocalization();
  const { recentBoards, starredBoards, viewedIssues } = useNavHistory();
  const [flyout, setFlyout] = useState(null);
  const anchors = useRef({});

  const allBoards = teamsWithBoards.flatMap(({ team, boards }) => boards.map((b) => ({ ...b, teamName: team.name, teamId: team.id })));
  const boardById = new Map(allBoards.map((b) => [b.id, b]));
  const starredIds = new Set(starredBoards.map((b) => b.id));
  const recent = recentBoards.map((b) => boardById.get(b.id)).filter(Boolean);
  const sidebarRecent = (recent.length ? recent : allBoards).slice(0, 4);
  const starred = starredBoards.map((b) => boardById.get(b.id)).filter(Boolean);

  const toggleFlyout = (name) => setFlyout((current) => (current === name ? null : name));
  const closeFlyout = () => setFlyout(null);
  const navigate = () => { closeFlyout(); onNavigate?.(); };

  const item = (to, icon, label, { exact = false, active } = {}) => {
    const isActive = active ?? (exact ? pathname === to : pathname.startsWith(to));
    return (
      <Link to={to} className={`app-nav-item app-nav-link ${isActive ? 'is-active' : ''}`} onClick={navigate}>
        <NavIcon name={icon} />
        <span className="app-nav-label">{t(label)}</span>
      </Link>
    );
  };

  const flyoutItem = (name, icon, label, content) => (
    <>
      <button
        type="button"
        ref={(el) => { anchors.current[name] = el; }}
        className={`app-nav-item app-nav-link app-nav-flyout-trigger ${flyout === name ? 'is-open' : ''}`}
        aria-expanded={flyout === name}
        onClick={() => toggleFlyout(name)}
      >
        <NavIcon name={icon} />
        <span className="app-nav-label">{t(label)}</span>
        <NavIcon name={inline && flyout === name ? 'chevronDown' : 'chevronRight'} size={14} className="app-nav-chevron" />
      </button>
      {flyout === name && (
        <Flyout anchor={anchors.current[name]} onClose={closeFlyout} title={t(label)} inline={inline}>{content}</Flyout>
      )}
    </>
  );

  const recentContent = (
    <>
      <div className="app-flyout-section">{t('Разделы')}</div>
      {recent.slice(0, 5).map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred={starredIds.has(b.id)} onNavigate={navigate} showTeam />)}
      {recent.length === 0 && <p className="app-flyout-empty">{t('Здесь появятся недавно открытые разделы.')}</p>}
      <div className="app-flyout-section">{t('Задачи')}</div>
      {viewedIssues.slice(0, 6).map((issue) => (
        <Link key={issue.id} to={`/board/${issue.boardId}/issue/${issue.id}`} className="app-nav-item app-nav-link" onClick={navigate} title={issue.title}>
          <IssueTypeIcon issueType={issue.issueType} size={16} />
          <span className="app-nav-text">
            <span className="app-nav-label">{issue.title}</span>
            <span className="app-nav-sub">{[issue.issueKey, boardById.get(issue.boardId)?.name].filter(Boolean).join(' • ')}</span>
          </span>
        </Link>
      ))}
      {viewedIssues.length === 0 && <p className="app-flyout-empty">{t('Здесь появятся недавно просмотренные задачи.')}</p>}
      <Link to="/?tab=viewed" className="app-flyout-footer" onClick={navigate}>{t('Показать все недавние')}</Link>
    </>
  );

  const starredContent = (
    <>
      {starred.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred onNavigate={navigate} showTeam />)}
      {starred.length === 0 && <p className="app-flyout-empty">{t('Отмечайте разделы звёздочкой, чтобы быстро находить их здесь.')}</p>}
    </>
  );

  const otherSpacesContent = (
    <>
      {teamsWithBoards.map(({ team, boards }) => (
        <div key={team.id}>
          <div className="app-flyout-section">{team.name}</div>
          {boards.map((b) => (
            <BoardRow key={b.id} board={{ ...b, teamName: team.name }} active={b.id === activeBoardId} starred={starredIds.has(b.id)} onNavigate={navigate} />
          ))}
          {boards.length === 0 && <p className="app-flyout-empty">{t('Нет досок')}</p>}
        </div>
      ))}
      {teamsWithBoards.length === 0 && <p className="app-flyout-empty">{t('Нет команд')}</p>}
      <Link to="/spaces" className="app-flyout-footer" onClick={navigate}>{t('Смотреть все разделы')}</Link>
    </>
  );

  return (
    <nav className="app-sidebar-nav" aria-label={t('Навигация')}>
      {item('/', 'forYou', 'Для вас', { exact: true })}
      {flyoutItem('recent', 'recent', 'Недавние', recentContent)}
      {flyoutItem('starred', 'star', 'Отмеченные', starredContent)}

      <div className="app-nav-group-header">
        <Link to="/spaces" className={`app-nav-item app-nav-link ${pathname.startsWith('/spaces') ? 'is-active' : ''}`} onClick={navigate}>
          <NavIcon name="spaces" />
          <span className="app-nav-label">{t('Разделы')}</span>
        </Link>
        <Link to="/spaces?create=1" className="app-nav-icon-btn" onClick={navigate} aria-label={t('Создать раздел')} title={t('Создать раздел')}>
          <NavIcon name="plus" size={14} />
        </Link>
      </div>
      <div className="app-nav-section">{t('Недавние')}</div>
      {sidebarRecent.map((b) => (
        <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred={starredIds.has(b.id)} onNavigate={navigate} />
      ))}
      {allBoards.length === 0 && <p className="app-flyout-empty">{t('Нет досок')}</p>}
      {flyoutItem('spaces', 'backlog', 'Другие разделы', otherSpacesContent)}

      {item('/issues', 'filters', 'Фильтры')}
      {item('/dashboards', 'dashboards', 'Дашборды')}

      <div className="app-nav-divider" />
      {item('/users', 'teams', 'Команды')}
    </nav>
  );
}
