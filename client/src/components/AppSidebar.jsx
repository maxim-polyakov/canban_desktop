import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import SpaceAvatar from './SpaceAvatar.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';
import { usePrefs } from '../utils/preferences.js';

export const CREATE_SPACE_EVENT = 'canban:create-space';
export const SPACES_CHANGED_EVENT = 'canban:spaces-changed';
export const openCreateSpace = (detail = {}) => window.dispatchEvent(new CustomEvent(CREATE_SPACE_EVENT, { detail }));

/** Items that can be hidden from "Настроить боковую панель", in sidebar order. */
export const CUSTOMIZABLE_NAV = [
  ['forYou', 'forYou', 'Для вас'],
  ['recent', 'recent', 'Недавние'],
  ['starred', 'star', 'Отмеченные'],
  ['apps', 'appsAdd', 'Приложения'],
  ['plans', 'plans', 'Планы'],
  ['spaces', 'spaces', 'Разделы'],
  ['recommended', 'template', 'Рекомендации'],
  ['filters', 'filters', 'Фильтры'],
  ['dashboards', 'dashboards', 'Дашборды'],
  ['assets', 'assets', 'Активы'],
  ['teams', 'teams', 'Команды'],
  ['goals', 'goals', 'Цели'],
  ['projects', 'projects', 'Проекты'],
];

function useDismiss(ref, open, onClose, anchor) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [ref, open, onClose, anchor]);
}

function Flyout({ anchor, onClose, title, children, inline }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (inline || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: Math.min(rect.top, window.innerHeight - 420), left: rect.right + 6 });
  }, [anchor, inline]);
  useDismiss(ref, !inline, onClose, anchor);
  if (inline) return <div className="app-flyout app-flyout-inline">{children}</div>;
  if (!pos) return null;
  return (
    <div ref={ref} className="app-flyout" style={{ top: Math.max(8, pos.top), left: pos.left }} role="dialog" aria-label={title}>
      <div className="app-flyout-title">{title}</div>
      {children}
    </div>
  );
}

function BoardRow({ board, active, starred, onNavigate, showTeam, to }) {
  const { t } = useLocalization();
  return (
    <div className={`app-nav-item app-nav-board ${active ? 'is-active' : ''}`}>
      <Link to={to || `/board/${board.id}`} className="app-nav-link" onClick={onNavigate} title={board.name}>
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

export function SidebarCustomizeDialog({ open, onClose }) {
  const { t } = useLocalization();
  const [prefs, setPrefs] = usePrefs();
  if (!open) return null;
  const hidden = new Set(prefs.hiddenNav || []);
  const toggle = (key) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setPrefs({ hiddenNav: [...next] });
  };
  return (
    <div className="app-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="app-modal app-customize-modal" role="dialog" aria-modal="true" aria-labelledby="customize-nav-title">
        <div className="app-modal-header">
          <h2 id="customize-nav-title">{t('Настроить боковую панель')}</h2>
          <button type="button" className="app-icon-btn" onClick={onClose} aria-label={t('Закрыть')}><NavIcon name="close" /></button>
        </div>
        <p className="app-modal-hint">{t('Выберите, какие пункты показывать на боковой панели. Скрытые пункты остаются доступны по прямым ссылкам.')}</p>
        <ul className="app-customize-list">
          {CUSTOMIZABLE_NAV.map(([key, icon, label]) => {
            const visible = !hidden.has(key);
            return (
              <li key={key} className={`app-customize-row ${visible ? '' : 'is-hidden'}`}>
                <NavIcon name={icon} />
                <span className="app-customize-label">{t(label)}</span>
                <button
                  type="button"
                  className="app-icon-btn"
                  aria-pressed={visible}
                  aria-label={visible ? `${t('Скрыть')}: ${t(label)}` : `${t('Показать')}: ${t(label)}`}
                  title={visible ? t('Скрыть') : t('Показать')}
                  onClick={() => toggle(key)}
                >
                  <NavIcon name={visible ? 'eye' : 'eyeOff'} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="app-modal-footer">
          <button type="button" className="app-btn" onClick={() => setPrefs({ hiddenNav: [] })} disabled={hidden.size === 0}>{t('Показать все')}</button>
          <button type="button" className="app-btn app-btn-primary" onClick={onClose}>{t('Готово')}</button>
        </div>
      </div>
    </div>
  );
}

function SpacesMoreMenu({ onClose, onCustomize, anchor }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const ref = useRef(null);
  useDismiss(ref, true, onClose, anchor);
  const go = (path) => { onClose(); navigate(path); };
  return (
    <div className="app-menu app-nav-more-menu" role="menu" ref={ref}>
      <button type="button" className="app-menu-item" role="menuitem" onClick={() => go('/spaces')}><NavIcon name="spaces" />{t('Управление разделами')}</button>
      <button type="button" className="app-menu-item" role="menuitem" onClick={() => { onClose(); openCreateSpace(); }}><NavIcon name="plus" />{t('Создать раздел')}</button>
      <button type="button" className="app-menu-item" role="menuitem" onClick={() => go('/spaces/templates')}><NavIcon name="template" />{t('Шаблоны разделов')}</button>
      <div className="app-menu-divider" />
      <button type="button" className="app-menu-item" role="menuitem" onClick={() => { onClose(); onCustomize(); }}><NavIcon name="customize" />{t('Настроить боковую панель')}</button>
    </div>
  );
}

export default function AppSidebar({ teamsWithBoards, activeBoardId, pathname, onNavigate, inline = false }) {
  const { t } = useLocalization();
  const { recentBoards, starredBoards, viewedIssues } = useNavHistory();
  const [prefs] = usePrefs();
  const [flyout, setFlyout] = useState(null);
  const [spacesMenu, setSpacesMenu] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const anchors = useRef({});
  const spacesMoreRef = useRef(null);

  const hidden = new Set(prefs.hiddenNav || []);
  const shown = (key) => !hidden.has(key);

  const allBoards = teamsWithBoards.flatMap(({ team, boards }) => boards.map((b) => ({ ...b, teamName: team.name, teamId: team.id })));
  const boardById = new Map(allBoards.map((b) => [b.id, b]));
  const starredIds = new Set(starredBoards.map((b) => b.id));
  const recent = recentBoards.map((b) => boardById.get(b.id)).filter(Boolean);
  const sidebarRecent = (recent.length ? recent : allBoards).slice(0, 4);
  const starred = starredBoards.map((b) => boardById.get(b.id)).filter(Boolean);

  const toggleFlyout = (name) => setFlyout((current) => (current === name ? null : name));
  const closeFlyout = () => setFlyout(null);
  const navigate = () => { closeFlyout(); onNavigate?.(); };

  const item = (to, icon, label, { exact = false, active, external = false, badge } = {}) => {
    const isActive = active ?? (exact ? pathname === to : pathname.startsWith(to.split('?')[0]));
    return (
      <Link to={to} className={`app-nav-item app-nav-link ${isActive ? 'is-active' : ''}`} onClick={navigate}>
        <NavIcon name={icon} />
        <span className="app-nav-label">{t(label)}</span>
        {badge && <span className="app-nav-lozenge">{t(badge)}</span>}
        {external && <NavIcon name="external" size={12} className="app-nav-external" />}
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
      <Link to="/for-you?tab=viewed" className="app-flyout-footer" onClick={navigate}>{t('Показать все недавние')}</Link>
    </>
  );

  const starredContent = (
    <>
      {starred.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred onNavigate={navigate} showTeam />)}
      {starred.length === 0 && <p className="app-flyout-empty">{t('Отмечайте разделы звёздочкой, чтобы быстро находить их здесь.')}</p>}
      <Link to="/for-you?tab=starred" className="app-flyout-footer" onClick={navigate}>{t('Показать все отмеченные')}</Link>
    </>
  );

  const plansContent = (
    <>
      <div className="app-flyout-section">{t('Планы разделов')}</div>
      {allBoards.map((b) => (
        <BoardRow key={b.id} board={b} to={`/board/${b.id}/roadmap`} active={pathname === `/board/${b.id}/roadmap`} starred={starredIds.has(b.id)} onNavigate={navigate} showTeam />
      ))}
      {allBoards.length === 0 && <p className="app-flyout-empty">{t('Создайте раздел, чтобы планировать работу на временной шкале.')}</p>}
      <Link to="/spaces" className="app-flyout-footer" onClick={navigate}>{t('Смотреть все разделы')}</Link>
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
      {shown('forYou') && item('/for-you', 'forYou', 'Для вас', { active: pathname === '/' || pathname === '/for-you' })}
      {shown('recent') && flyoutItem('recent', 'recent', 'Недавние', recentContent)}
      {shown('starred') && flyoutItem('starred', 'star', 'Отмеченные', starredContent)}
      {shown('apps') && item('/admin/apps', 'appsAdd', 'Приложения')}
      {shown('plans') && flyoutItem('plans', 'plans', 'Планы', plansContent)}

      {shown('spaces') && (
        <>
          <div className="app-nav-group-header">
            <Link to="/spaces" className={`app-nav-item app-nav-link ${pathname === '/spaces' ? 'is-active' : ''}`} onClick={navigate}>
              <NavIcon name="spaces" />
              <span className="app-nav-label">{t('Разделы')}</span>
            </Link>
            <button type="button" className="app-nav-icon-btn" onClick={() => { navigate(); openCreateSpace(); }} aria-label={t('Создать раздел')} title={t('Создать раздел')}>
              <NavIcon name="plus" size={14} />
            </button>
            <span className="app-nav-more-anchor">
              <button
                type="button"
                ref={spacesMoreRef}
                className={`app-nav-icon-btn ${spacesMenu ? 'is-open' : ''}`}
                aria-label={t('Другие действия с разделами')}
                title={t('Другие действия')}
                aria-expanded={spacesMenu}
                onClick={() => setSpacesMenu((v) => !v)}
              >
                <NavIcon name="more" size={14} />
              </button>
              {spacesMenu && <SpacesMoreMenu anchor={spacesMoreRef.current} onClose={() => setSpacesMenu(false)} onCustomize={() => setCustomizeOpen(true)} />}
            </span>
          </div>
          <div className="app-nav-section">{t('Недавние')}</div>
          {sidebarRecent.map((b) => (
            <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred={starredIds.has(b.id)} onNavigate={navigate} />
          ))}
          {allBoards.length === 0 && <p className="app-flyout-empty">{t('Нет досок')}</p>}
          {flyoutItem('spaces', 'backlog', 'Другие разделы', otherSpacesContent)}
        </>
      )}

      {shown('recommended') && (
        <>
          <div className="app-nav-section">{t('Рекомендации')}</div>
          {item('/spaces/templates', 'template', 'Шаблоны', { badge: 'Попробуйте' })}
        </>
      )}

      {shown('filters') && item('/issues', 'filters', 'Фильтры')}
      {shown('dashboards') && item('/dashboards', 'dashboards', 'Дашборды')}
      {shown('assets') && item('/assets', 'assets', 'Активы', { badge: 'Попробуйте' })}
      {shown('teams') && item('/teams', 'teams', 'Команды', { external: true })}
      {shown('goals') && item('/goals', 'goals', 'Цели', { external: true })}
      {shown('projects') && item('/projects', 'projects', 'Проекты', { external: true })}

      <button type="button" className="app-nav-item app-nav-link app-nav-customize" onClick={() => setCustomizeOpen(true)}>
        <NavIcon name="customize" />
        <span className="app-nav-label">{t('Настроить боковую панель')}</span>
      </button>
      <SidebarCustomizeDialog open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
    </nav>
  );
}
