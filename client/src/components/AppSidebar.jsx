import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import SpaceAvatar from './SpaceAvatar.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { resolveBoardHistory, toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';
import { usePrefs } from '../utils/preferences.js';
import { PlansFlyoutContent } from '../pages/plans/PlansPages.jsx';
import { planIncludes, useAccessPlan } from '../utils/billing.js';
import { dashboards as dashboardsApi, spaces as spacesApi } from '../api.js';
import { DASHBOARDS_CHANGED_EVENT } from '../pages/dashboards/DashboardsPages.jsx';
import { DEFAULT_FILTERS } from '../utils/issueFilters.js';

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
  ['portal', 'help', 'Service Desk'],
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
  const { t } = useLocalization();
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
  return createPortal(
    <div ref={ref} className="app-flyout" style={{ top: Math.max(8, pos.top), left: pos.left }} role="dialog" aria-label={title}>
      <div className="app-flyout-title">
        <span>{title}</span>
        <button type="button" className="app-icon-btn app-flyout-close" aria-label={t('Закрыть')} title={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={14} /></button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

function SpaceSearch({ boards, activeBoardId, starredIds, onNavigate }) {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState([]);
  useEffect(() => {
    spacesApi.getMine().then((list) => setRemote(Array.isArray(list) ? list : [])).catch(() => setRemote([]));
  }, []);
  const needle = query.trim().toLowerCase();
  const all = new Map(boards.map((b) => [b.id, b]));
  remote.forEach((s) => { if (!all.has(s.id)) all.set(s.id, { id: s.id, name: s.name, teamName: s.teamName, keyPrefix: s.key }); });
  const results = needle
    ? [...all.values()].filter((b) => b.name.toLowerCase().includes(needle)
      || (b.keyPrefix || '').toLowerCase().includes(needle)
      || (b.teamName || '').toLowerCase().includes(needle)).slice(0, 12)
    : [];
  return (
    <>
      <label className="app-flyout-search">
        <NavIcon name="search" size={14} />
        <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск по всем разделам')} aria-label={t('Поиск по всем разделам')} />
      </label>
      {results.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} starred={starredIds.has(b.id)} onNavigate={onNavigate} showTeam />)}
      {needle && results.length === 0 && <p className="app-flyout-empty">{t('Разделы не найдены')}</p>}
      <Link to="/spaces" className="app-flyout-footer app-flyout-footer-icon" onClick={onNavigate}><NavIcon name="list" size={14} />{t('Просмотреть все разделы')}</Link>
    </>
  );
}

function BoardRow({ board, active, starred, onNavigate, showTeam, to }) {
  const { t } = useLocalization();
  return (
    <div className={`app-nav-item app-nav-board ${active ? 'is-active' : ''}`}>
      <Link to={to || `/board/${board.id}`} className="app-nav-link" onClick={onNavigate} title={board.name}>
        <SpaceAvatar id={board.id} name={board.name} avatarUrl={board.avatarUrl} size={20} />
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

function useExpanded(key, defaultOpen = false) {
  const [prefs, setPrefs] = usePrefs();
  const expanded = prefs.expandedNav || {};
  const open = expanded[key] ?? defaultOpen;
  const toggle = () => setPrefs({ expandedNav: { ...expanded, [key]: !open } });
  return [open, toggle];
}

/** Expandable sidebar entry: the row toggles its children, like Jira's Filters/Dashboards. */
function NavGroup({ id, icon, label, children, actions, depth = 0, defaultOpen = false }) {
  const { t } = useLocalization();
  const [open, toggle] = useExpanded(id, defaultOpen);
  return (
    <>
      <div className={`app-nav-group-header app-nav-tree-row depth-${depth}`}>
        <button type="button" className="app-nav-item app-nav-link app-nav-tree-toggle" aria-expanded={open} onClick={toggle}>
          <span className="app-nav-tree-icon">
            {icon && <NavIcon name={icon} className="app-nav-tree-glyph" />}
            <NavIcon name={open ? 'chevronDown' : 'chevronRight'} size={14} className="app-nav-tree-chevron" />
          </span>
          <span className="app-nav-label">{t(label)}</span>
        </button>
        {actions}
      </div>
      {open && <div className={`app-nav-tree depth-${depth}`}>{children}</div>}
    </>
  );
}

function FiltersNav({ onNavigate }) {
  const { t } = useLocalization();
  const location = useLocation();
  const { starredFilters } = useNavHistory();
  const current = location.pathname === '/issues' ? new URLSearchParams(location.search).get('filter') || '' : null;
  const row = (to, icon, label, active, key) => (
    <Link key={key || to} to={to} className={`app-nav-item app-nav-link ${active ? 'is-active' : ''}`} onClick={onNavigate} title={label}>
      <NavIcon name={icon} />
      <span className="app-nav-label">{label}</span>
    </Link>
  );
  return (
    <NavGroup id="filters" icon="filters" label="Фильтры">
      {row('/issues', 'search', t('Поиск задач'), current === '')}
      {starredFilters.length > 0 && (
        <>
          <div className="app-nav-section">{t('Отмеченные')}</div>
          {starredFilters.map((f) => row(`/issues?filter=${f.id}`, 'filters', f.isDefault ? t(f.name) : f.name, current === f.id, `star-${f.id}`))}
        </>
      )}
      <NavGroup id="filters-default" label="Фильтры по умолчанию" depth={1} defaultOpen>
        {DEFAULT_FILTERS.map((f) => row(`/issues?filter=${f.id}`, 'filters', t(f.name), current === f.id, f.id))}
      </NavGroup>
      {row('/filters', 'filters', t('Все фильтры'), location.pathname === '/filters')}
    </NavGroup>
  );
}

function DashboardsNav({ onNavigate }) {
  const { t } = useLocalization();
  const location = useLocation();
  const goTo = useNavigate();
  const { recentDashboards } = useNavHistory();
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => dashboardsApi.list().then((v) => { if (alive) setList(Array.isArray(v) ? v : []); }).catch(() => { if (alive) setList([]); });
    load();
    window.addEventListener(DASHBOARDS_CHANGED_EVENT, load);
    return () => { alive = false; window.removeEventListener(DASHBOARDS_CHANGED_EVENT, load); };
  }, []);
  const byId = new Map((list || []).map((d) => [d.id, d]));
  const starred = (list || []).filter((d) => d.starred);
  const starredIds = new Set(starred.map((d) => d.id));
  const recent = recentDashboards
    .filter((d) => !starredIds.has(d.id) && (list === null || byId.has(d.id)))
    .map((d) => byId.get(d.id) || d)
    .slice(0, 5);
  const activeId = /^\/dashboards\/([^/]+)/.exec(location.pathname)?.[1];
  const row = (d) => (
    <Link key={d.id} to={`/dashboards/${d.id}`} className={`app-nav-item app-nav-link ${activeId === d.id ? 'is-active' : ''}`} onClick={onNavigate} title={d.name}>
      <NavIcon name="dashboards" />
      <span className="app-nav-label">{d.name}</span>
    </Link>
  );
  const create = (
    <button type="button" className="app-nav-icon-btn" aria-label={t('Создать дашборд')} title={t('Создать дашборд')}
      onClick={() => { onNavigate?.(); goTo('/dashboards?create=1'); }}>
      <NavIcon name="plus" size={14} />
    </button>
  );
  return (
    <NavGroup id="dashboards" icon="dashboards" label="Дашборды" actions={create}>
      {starred.length > 0 && (
        <>
          <div className="app-nav-section">{t('Отмеченные')}</div>
          {starred.slice(0, 10).map(row)}
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className="app-nav-section">{t('Недавние')}</div>
          {recent.map(row)}
        </>
      )}
      {starred.length === 0 && recent.length === 0 && (
        <p className="app-nav-tree-hint">{t('Здесь будут отображаться дашборды, которые вы посетили или создали.')}</p>
      )}
      <Link to="/dashboards" className={`app-nav-item app-nav-link ${location.pathname === '/dashboards' ? 'is-active' : ''}`} onClick={onNavigate}>
        <NavIcon name="list" />
        <span className="app-nav-label">{t('Просмотреть все дашборды')}</span>
      </Link>
    </NavGroup>
  );
}

export default function AppSidebar({ teamsWithBoards, activeBoardId, pathname, onNavigate, inline = false }) {
  const { t } = useLocalization();
  const { recentBoards, starredBoards, viewedIssues } = useNavHistory();
  const [prefs] = usePrefs();
  const accessPlan = useAccessPlan();
  const standardLocked = accessPlan && !planIncludes(accessPlan, 'standard');
  const premiumLocked = accessPlan && !planIncludes(accessPlan, 'premium');
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
  const recent = resolveBoardHistory(recentBoards, boardById);
  const recentRow = (entry, showTeam) => (
    <BoardRow key={entry.id} board={entry} active={entry.id === activeBoardId} starred={starredIds.has(entry.id)} onNavigate={navigate} showTeam={showTeam} />
  );
  const sidebarRecent = (recent.length ? recent : allBoards).slice(0, 4);
  const starred = resolveBoardHistory(starredBoards, boardById);

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

  const flyoutItem = (name, icon, label, content, title = label) => (
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
        <Flyout anchor={anchors.current[name]} onClose={closeFlyout} title={t(title)} inline={inline}>{content}</Flyout>
      )}
    </>
  );

  const recentContent = (
    <>
      <div className="app-flyout-section">{t('Разделы')}</div>
      {recent.slice(0, 5).map((entry) => recentRow(entry, true))}
      {recent.length === 0 && <p className="app-flyout-empty">{t('Здесь появятся недавно открытые разделы.')}</p>}
      <div className="app-flyout-section">{t('Задачи')}</div>
      {viewedIssues.slice(0, 6).map((issue) => (
        <Link key={issue.id} to={`/board/${issue.boardId}/issue/${issue.id}`} className="app-nav-item app-nav-link" onClick={navigate} title={issue.title}>
          <IssueTypeIcon issueType={issue.issueType} typeId={issue.issueTypeId} size={16} />
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

  const plansContent = <PlansFlyoutContent onNavigate={navigate} />;

  const otherSpacesContent = <SpaceSearch boards={allBoards} activeBoardId={activeBoardId} starredIds={starredIds} onNavigate={navigate} />;

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
          {sidebarRecent.map((entry) => recentRow(entry, false))}
          {sidebarRecent.length === 0 && <p className="app-flyout-empty">{t('Нет досок')}</p>}
          {flyoutItem('spaces', 'backlog', 'Другие разделы', otherSpacesContent, 'Разделы')}
        </>
      )}

      {shown('portal') && item('/portal', 'help', 'Service Desk', { active: pathname.startsWith('/portal') })}

      {shown('recommended') && (
        <>
          <div className="app-nav-section">{t('Рекомендации')}</div>
          {item(
            standardLocked ? '/admin/billing/plans?required=standard&returnTo=%2Fspaces%2Ftemplates' : '/spaces/templates',
            'template',
            'Шаблоны',
            { badge: standardLocked ? 'Попробуйте' : undefined },
          )}
        </>
      )}

      {shown('filters') && <FiltersNav onNavigate={navigate} />}
      {shown('dashboards') && <DashboardsNav onNavigate={navigate} />}
      {shown('assets') && item(
        premiumLocked ? '/admin/billing/plans?required=premium&returnTo=%2Fassets' : '/assets',
        'assets',
        'Активы',
        { badge: premiumLocked ? 'Попробуйте' : undefined },
      )}
      {(shown('teams') || shown('goals') || shown('projects')) && <div className="app-nav-divider" />}
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
