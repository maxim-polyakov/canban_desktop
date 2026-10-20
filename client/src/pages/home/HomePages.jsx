import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { home as homeApi, people as peopleApi, teams as teamsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import {
  buildTree, defaultColumns, filterItems, formatScore, groupByWeek, HOME_COLUMNS, HOME_STATUSES, pluralRu, sortItems, statusMeta,
} from '../../utils/homeItems.js';
import '../settings/Settings.css';
import './Home.css';

export const HOME_KINDS = {
  projects: {
    kind: 'projects', other: 'goals', icon: 'projects', title: 'Проекты', catalog: 'Каталог проектов', all: 'Все проекты', mine: 'Мои проекты',
    create: 'Создать проект', first: 'Создайте свой первый проект', learn: 'Подробнее о проектах', search: 'Поиск проектов', column: 'Проект',
    forms: ['проект', 'проекта', 'проектов'], about: 'О проекте', empty: 'Проектов пока нет',
    banner: 'Используйте проекты, чтобы держать всех в курсе событий с помощью еженедельных обновлений статуса, и показывайте, как ваша работа связана с целями.',
    learnText: 'Проект — это работа с владельцем, сроком и статусом. Раз в неделю владелец или участники публикуют обновление: что сделано, что дальше и есть ли риски. Подписчики получают обновления в ленте, а связь с целями показывает, на что работает проект.',
  },
  goals: {
    kind: 'goals', other: 'projects', icon: 'goals', title: 'Цели', catalog: 'Каталог целей', all: 'Все цели', mine: 'Мои цели',
    create: 'Создать цель', first: 'Создайте свою первую цель', learn: 'Подробнее о целях', search: 'Поиск целей', column: 'Цель',
    forms: ['цель', 'цели', 'целей'], about: 'О цели', empty: 'Целей пока нет',
    banner: 'Используйте цели, чтобы договориться о самом важном, отслеживать прогресс с помощью оценки и видеть, какие проекты на них работают.',
    learnText: 'Цель описывает результат, к которому вы идёте. Её можно разбить на подцели, привязать к ней проекты и раз в неделю обновлять статус и оценку от 0.0 до 1.0.',
  },
};

const kindOf = (pathname) => (pathname.startsWith('/goals') ? HOME_KINDS.goals : HOME_KINDS.projects);

export const isHomeHubPath = (pathname) => /^\/(projects|goals)(\/|$)/.test(pathname);

export function HomeHubSidebar({ pathname, onNavigate }) {
  const { t } = useLocalization();
  const cfg = kindOf(pathname);
  const base = `/${cfg.kind}`;
  const nav = [
    [base, cfg.icon, cfg.catalog, (p) => p === base || (/^\/(projects|goals)\/[0-9a-f-]{36}$/.test(p))],
    [`${base}/following`, 'star', 'Отслеживаемые', (p) => p === `${base}/following`],
    [`${base}/updates`, 'activity', 'Обновления статуса', (p) => p === `${base}/updates`],
    [`${base}/archived`, 'archive', 'Архивированные', (p) => p === `${base}/archived`],
  ];
  const other = HOME_KINDS[cfg.other];
  return (
    <nav className="app-sidebar-nav" aria-label={t(cfg.title)}>
      {nav.map(([to, icon, label, isActive]) => (
        <Link key={to} to={to} className={`app-nav-item app-nav-link ${isActive(pathname) ? 'is-active' : ''}`} onClick={onNavigate}>
          <NavIcon name={icon} />
          <span className="app-nav-label">{t(label)}</span>
        </Link>
      ))}
      <div className="app-nav-divider" />
      <Link to="/teams" className="app-nav-item app-nav-link" onClick={onNavigate}>
        <NavIcon name="teams" />
        <span className="app-nav-label">{t('Команды')}</span>
      </Link>
      <Link to={`/${other.kind}`} className="app-nav-item app-nav-link" onClick={onNavigate}>
        <NavIcon name={other.icon} />
        <span className="app-nav-label">{t(other.title)}</span>
      </Link>
      <div className="app-nav-divider" />
      <Link to="/for-you" className="app-nav-item app-nav-link" onClick={onNavigate}>
        <NavIcon name="apps" />
        <span className="app-nav-label">{t('Назад к Канбан')}</span>
      </Link>
    </nav>
  );
}

export function Avatar({ user, size = 24 }) {
  if (!user) return null;
  return user.avatarUrl
    ? <img src={user.avatarUrl} alt="" className="home-avatar" style={{ width: size, height: size }} title={user.displayName} />
    : <span className="home-avatar is-placeholder" style={{ width: size, height: size, fontSize: size * 0.42 }} title={user.displayName}>{(user.displayName || '?').charAt(0).toUpperCase()}</span>;
}

export function HomeStatus({ status, score, kind }) {
  const { t } = useLocalization();
  const [, label, tone] = statusMeta(status);
  return (
    <span className="home-status-wrap">
      {kind === 'goal' && score != null && <span className={`home-score ${tone}`}>{formatScore(score)}</span>}
      <span className={`home-status ${tone}`}>{t(label)}</span>
    </span>
  );
}

export function ItemIcon({ item, size = 24 }) {
  const isGoal = item.kind === 'goal';
  return (
    <span className={`home-item-icon ${isGoal ? 'is-goal' : ''}`} style={{ width: size, height: size, fontSize: size * 0.55 }}>
      {item.icon || <NavIcon name={isGoal ? 'goals' : 'projects'} size={Math.round(size * 0.6)} />}
    </span>
  );
}

export function formatDate(value, locale) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const toInputDate = (value) => (value ? String(value).slice(0, 10) : '');
export const fromInputDate = (value) => (value ? `${value}T00:00:00Z` : null);

export function usePeople() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  useEffect(() => {
    peopleApi.workWith().then((data) => setList(Array.isArray(data) ? data : [])).catch(() => setList([]));
  }, []);
  return useMemo(() => {
    const me = user ? [{ id: user.id, displayName: user.displayName || user.email, avatarUrl: user.avatarUrl }] : [];
    return [...me, ...list.filter((p) => p.id !== user?.id)];
  }, [list, user]);
}

export function useMyTeams() {
  const [list, setList] = useState([]);
  useEffect(() => {
    teamsApi.getMyTeamsWithBoards()
      .then((data) => setList((Array.isArray(data) ? data : []).map((x) => x.team ?? x.Team).filter(Boolean)))
      .catch(() => setList([]));
  }, []);
  return list;
}

function useHomeList(kind, archived = false) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    homeApi.list(kind, archived).then((data) => { setItems(Array.isArray(data) ? data : []); setError(''); })
      .catch((e) => { setItems([]); setError(e.message); });
  }, [kind, archived]);
  useEffect(() => { load(); }, [load]);
  return { items, setItems, error, reload: load };
}

export function useOutsideClose(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return ref;
}

function FilterChip({ label, options, value, onChange, searchable = false }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const needle = query.trim().toLowerCase();
  const shown = options.filter(([, text]) => !needle || String(text).toLowerCase().includes(needle));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="home-chip-wrap" ref={ref}>
      <button type="button" className={`home-chip ${value.length ? 'is-active' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t(label)}{value.length > 0 && <span className="home-chip-count">{value.length}</span>}
        <NavIcon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="home-popover" role="dialog" aria-label={t(label)}>
          {searchable && <input className="home-popover-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск')} aria-label={t('Поиск')} />}
          <div className="home-popover-list">
            {shown.map(([id, text, extra]) => (
              <label key={id} className="home-popover-option">
                <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} />
                {extra}<span>{text}</span>
              </label>
            ))}
            {shown.length === 0 && <p className="home-muted">{t('Ничего не найдено')}</p>}
          </div>
          {value.length > 0 && <button type="button" className="app-btn app-btn-subtle home-popover-clear" onClick={() => onChange([])}>{t('Очистить')}</button>}
        </div>
      )}
    </div>
  );
}

function ColumnsMenu({ columns, onChange }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <div className="home-chip-wrap" ref={ref}>
      <button type="button" className="app-btn app-btn-subtle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <NavIcon name="columns" size={14} />{t('Столбцы')}
      </button>
      {open && (
        <div className="home-popover is-right" role="dialog" aria-label={t('Столбцы')}>
          {HOME_COLUMNS.map(([id, label]) => (
            <label key={id} className="home-popover-option">
              <input type="checkbox" checked={columns.includes(id)} onChange={() => onChange(columns.includes(id) ? columns.filter((c) => c !== id) : [...columns, id])} />
              <span>{t(label)}</span>
            </label>
          ))}
          <button type="button" className="app-btn app-btn-subtle home-popover-clear" onClick={() => onChange(defaultColumns())}>{t('По умолчанию')}</button>
        </div>
      )}
    </div>
  );
}

export function FollowButton({ item, onChanged, compact = false }) {
  const { t } = useLocalization();
  const [busy, setBusy] = useState(false);
  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      if (item.isFollowing) await homeApi.unfollow(item.id); else await homeApi.follow(item.id);
      onChanged?.(!item.isFollowing);
    } catch { /* keeps the previous state */ }
    setBusy(false);
  };
  const label = item.isFollowing ? t('Не отслеживать') : t('Отслеживать');
  if (compact) {
    return (
      <button type="button" className={`home-follow ${item.isFollowing ? 'is-on' : ''}`} disabled={busy} onClick={toggle} title={label} aria-label={label} aria-pressed={item.isFollowing}>
        <NavIcon name="star" size={14} /><span>{item.followers}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`app-btn ${item.isFollowing ? 'app-btn-subtle is-following' : 'app-btn-subtle'}`} disabled={busy} onClick={toggle} aria-pressed={item.isFollowing}>
      <NavIcon name="star" size={14} />{item.isFollowing ? t('Вы отслеживаете') : t('Отслеживать')}
    </button>
  );
}

function LastUpdate({ item }) {
  const { t, locale } = useLocalization();
  if (item.updateDue) return <span className="home-due">{item.lastUpdateAt ? t('Требуется обновление') : t('Нет обновлений')}</span>;
  return <span className="home-muted">{item.lastUpdateAt ? timeAgo(item.lastUpdateAt, locale) : '—'}</span>;
}

export function Progress({ done, total }) {
  const { t } = useLocalization();
  if (!total) return <span className="home-muted">{t('Нет задач')}</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <span className="home-progress" title={`${done}/${total}`}>
      <span className="home-progress-bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="home-muted">{pct}%</span>
    </span>
  );
}

const loadColumns = (kind) => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(`canban.home.columns.${kind}`) || 'null');
    if (Array.isArray(saved)) return saved.filter((c) => HOME_COLUMNS.some(([id]) => id === c));
  } catch { /* falls back to defaults */ }
  return defaultColumns();
};

const EMPTY_FILTERS = { tags: [], statuses: [], goalIds: [], teamIds: [], ownerIds: [], contributorIds: [] };

export function HomeDirectoryPage({ kind, view: fixedView }) {
  const cfg = HOME_KINDS[kind];
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const view = fixedView || params.get('view') || 'all';
  const archived = view === 'archived';
  const { items, setItems, error, reload } = useHomeList(kind, archived);
  const goals = useHomeList('goals').items;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [tree, setTree] = useState(false);
  const [followingFirst, setFollowingFirst] = useState(false);
  const [sort, setSort] = useState({ key: 'name', desc: false });
  const [columns, setColumns] = useState(() => loadColumns(kind));
  const [createOpen, setCreateOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(() => window.localStorage.getItem(`canban.home.banner.${kind}`) === '1');
  const closeOther = useCallback(() => setOtherOpen(false), []);
  const otherRef = useOutsideClose(otherOpen, closeOther);

  useEffect(() => { setColumns(loadColumns(kind)); setFilters(EMPTY_FILTERS); setQuery(''); }, [kind]);
  const changeColumns = (next) => {
    setColumns(next);
    window.localStorage.setItem(`canban.home.columns.${kind}`, JSON.stringify(next));
  };
  const hideBanner = () => { setBannerHidden(true); window.localStorage.setItem(`canban.home.banner.${kind}`, '1'); };

  const list = useMemo(() => items || [], [items]);
  const visible = useMemo(() => sortItems(
    filterItems(list, { ...filters, query, followingOnly, view: archived ? 'all' : view }, { userId: user?.id }),
    { ...sort, followingFirst },
  ), [list, filters, query, followingOnly, view, archived, user, sort, followingFirst]);
  const rows = useMemo(
    () => (tree ? buildTree(visible, goals || []) : visible.map((item) => ({ type: 'item', item, depth: 0 }))),
    [tree, visible, goals],
  );

  const options = useMemo(() => {
    const unique = (pairs) => [...new Map(pairs.filter(([id]) => id).map((p) => [p[0], p])).values()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    return {
      tags: unique(list.flatMap((i) => (i.tags || []).map((tag) => [tag, tag]))),
      statuses: HOME_STATUSES.map(([id, label]) => [id, t(label)]),
      goals: unique((goals || []).map((g) => [g.id, g.name])),
      teams: unique(list.map((i) => [i.team?.id, i.team?.name])),
      owners: unique(list.map((i) => [i.owner?.id, i.owner?.displayName, <Avatar key="a" user={i.owner} size={18} />])),
    };
  }, [list, goals, t]);
  const peopleList = usePeople();
  const contributorOptions = useMemo(
    () => peopleList.map((p) => [p.id, p.displayName, <Avatar key="a" user={p} size={18} />]),
    [peopleList],
  );

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const anyFilter = query || followingOnly || Object.values(filters).some((v) => v.length);
  const updateItem = (id, patch) => setItems((cur) => (cur || []).map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const toggleSort = (key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }));
  const sortMark = (key) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '');

  const tabs = [
    ['all', cfg.all, `/${kind}`],
    ['mine', cfg.mine, `/${kind}?view=mine`],
    ['archived', 'Архивированные', `/${kind}/archived`],
  ];
  const otherViews = [
    ['following', 'Отслеживаемые', `/${kind}/following`],
    ['due', 'Требуют обновления', `/${kind}?view=due`],
    ['done', 'Завершённые', `/${kind}?view=done`],
  ];
  const otherActive = otherViews.find(([id]) => id === view);
  const showBanner = !bannerHidden && items !== null && !archived && list.length < 3;
  const count = visible.length;

  return (
    <div className="settings-shell">
      <section className="settings-content is-wide home-page">
        {showBanner && (
          <div className="home-banner">
            <div className="home-banner-art" aria-hidden="true"><NavIcon name={cfg.icon} size={40} /></div>
            <div className="home-banner-body">
              <p>{t(cfg.banner)}</p>
              <div className="home-banner-actions">
                <button type="button" className="app-btn app-btn-primary" onClick={() => setCreateOpen(true)}>{t(cfg.first)}</button>
                <button type="button" className="app-btn app-btn-subtle" onClick={() => setLearnOpen((v) => !v)} aria-expanded={learnOpen}>{t(cfg.learn)}</button>
              </div>
              {learnOpen && <p className="home-learn">{t(cfg.learnText)}</p>}
            </div>
            <button type="button" className="app-icon-btn home-banner-close" aria-label={t('Скрыть')} onClick={hideBanner}><NavIcon name="close" size={14} /></button>
          </div>
        )}
        <div className="settings-title-row">
          <h1 className="settings-title">{t(cfg.title)}</h1>
          <div className="settings-actions">
            <button type="button" className="app-btn app-btn-primary" onClick={() => setCreateOpen(true)}>{t(cfg.create)}</button>
          </div>
        </div>
        <div className="home-tabs" role="tablist">
          {tabs.map(([id, label, to]) => (
            <Link key={id} to={to} role="tab" aria-selected={view === id} className={`home-tab ${view === id ? 'is-active' : ''}`}>{t(label)}</Link>
          ))}
          <div className="home-chip-wrap" ref={otherRef}>
            <button type="button" role="tab" aria-selected={!!otherActive} className={`home-tab ${otherActive ? 'is-active' : ''}`} onClick={() => setOtherOpen((v) => !v)}>
              {otherActive ? t(otherActive[1]) : t('Другие представления')}<NavIcon name="chevronDown" size={12} />
            </button>
            {otherOpen && (
              <div className="home-popover" role="menu">
                {otherViews.map(([id, label, to]) => (
                  <button key={id} type="button" role="menuitem" className={`home-popover-item ${view === id ? 'is-active' : ''}`} onClick={() => { setOtherOpen(false); navigate(to); }}>{t(label)}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="home-toolbar">
          <label className="settings-search">
            <NavIcon name="search" size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(cfg.search)} aria-label={t(cfg.search)} />
          </label>
          <FilterChip label="Фильтр по тегу" options={options.tags} value={filters.tags} onChange={setFilter('tags')} searchable />
          <FilterChip label="Статус" options={options.statuses} value={filters.statuses} onChange={setFilter('statuses')} />
          <FilterChip label={kind === 'goals' ? 'Родительская цель' : 'Цель'} options={options.goals} value={filters.goalIds} onChange={setFilter('goalIds')} searchable />
          <FilterChip label="Команда" options={options.teams} value={filters.teamIds} onChange={setFilter('teamIds')} />
          <FilterChip label="Владелец" options={options.owners} value={filters.ownerIds} onChange={setFilter('ownerIds')} searchable />
          <FilterChip label="Участник" options={contributorOptions} value={filters.contributorIds} onChange={setFilter('contributorIds')} searchable />
          <button type="button" className={`home-chip ${followingOnly ? 'is-active' : ''}`} aria-pressed={followingOnly} onClick={() => setFollowingOnly((v) => !v)}>{t('Отслеживаемые')}</button>
          <button type="button" className={`home-chip ${tree ? 'is-active' : ''}`} aria-pressed={tree} onClick={() => setTree((v) => !v)}>{t('Порядок подчиненности')}</button>
          {anyFilter && <button type="button" className="app-btn app-btn-subtle" onClick={() => { setFilters(EMPTY_FILTERS); setQuery(''); setFollowingOnly(false); }}>{t('Сбросить')}</button>}
        </div>

        <div className="home-meta-row">
          <span className="home-muted">{count} {t(pluralRu(count, cfg.forms))}</span>
          <div className="home-meta-actions">
            <label className="home-toggle">
              <input type="checkbox" checked={followingFirst} onChange={(e) => setFollowingFirst(e.target.checked)} />
              {t('Сортировать по отслеживаемым')}
            </label>
            <ColumnsMenu columns={columns} onChange={changeColumns} />
          </div>
        </div>

        {error && <p className="settings-save-status is-error">{error}</p>}
        <div className="settings-table-wrap">
          <table className="settings-table home-table">
            <thead>
              <tr>
                <th><button type="button" className="home-sort" onClick={() => toggleSort('name')}>{t(cfg.column)}{sortMark('name')}</button></th>
                {HOME_COLUMNS.filter(([id]) => columns.includes(id)).map(([id, label]) => (
                  <th key={id} className={id === 'owner' || id === 'team' || id === 'tags' ? 'hide-mobile' : ''}>
                    <button type="button" className="home-sort" onClick={() => toggleSort(id)}>{t(label)}{sortMark(id)}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (row.type === 'group' ? (
                <tr key={`g:${row.goal?.id ?? 'none'}`} className="home-group-row">
                  <td colSpan={columns.length + 1}>
                    {row.goal
                      ? <Link to={`/goals/${row.goal.id}`} className="home-name"><ItemIcon item={row.goal} size={20} /><span>{row.goal.name}</span></Link>
                      : <span className="home-muted">{t('Без цели')}</span>}
                    <span className="home-muted"> · {row.count}</span>
                  </td>
                </tr>
              ) : (
                <tr key={row.key || row.item.id}>
                  <td>
                    <Link to={`/${kind}/${row.item.id}`} className="home-name" style={{ paddingLeft: row.depth * 20 }}>
                      <ItemIcon item={row.item} />
                      <span className="home-name-text">
                        <span>{row.item.name}</span>
                        {row.item.isPrivate && <span className="home-muted"> · {t('Частный')}</span>}
                      </span>
                    </Link>
                  </td>
                  {columns.includes('status') && <td><HomeStatus status={row.item.status} score={row.item.score} kind={row.item.kind} /></td>}
                  {columns.includes('targetDate') && <td>{row.item.targetDate ? formatDate(row.item.targetDate, locale) : <span className="home-muted">—</span>}</td>}
                  {columns.includes('owner') && <td className="hide-mobile"><span className="home-person"><Avatar user={row.item.owner} />{row.item.owner?.displayName}</span></td>}
                  {columns.includes('following') && <td><FollowButton compact item={row.item} onChanged={(on) => updateItem(row.item.id, { isFollowing: on, followers: row.item.followers + (on ? 1 : -1) })} /></td>}
                  {columns.includes('lastUpdate') && <td><LastUpdate item={row.item} /></td>}
                  {columns.includes('team') && <td className="hide-mobile">{row.item.team?.name || <span className="home-muted">—</span>}</td>}
                  {columns.includes('tags') && <td className="hide-mobile"><span className="home-tags">{(row.item.tags || []).map((tag) => <span key={tag} className="home-tag">{tag}</span>)}</span></td>}
                  {columns.includes('progress') && <td><Progress done={row.item.workDone} total={row.item.workTotal} /></td>}
                </tr>
              )))}
            </tbody>
          </table>
          {items !== null && rows.length === 0 && (
            <div className="settings-empty">
              {list.length ? t('Ничего не найдено. Измените фильтры.') : t(archived ? 'В архиве пусто' : cfg.empty)}
            </div>
          )}
          {items === null && <p className="settings-empty">{t('Загрузка...')}</p>}
        </div>
      </section>
      <CreateHomeItemDialog
        open={createOpen}
        kind={kind}
        goals={goals || []}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => { setCreateOpen(false); reload(); navigate(`/${kind}/${created.item.id}`); }}
      />
    </div>
  );
}

export const ICONS = ['', '🚀', '🎯', '📈', '🛠️', '💡', '📦', '🌱', '🔒', '🧭', '⭐', '🏁'];

export function TagInput({ value, onChange, id }) {
  const { t } = useLocalization();
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim().replace(/^#/, '');
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase()) && value.length < 10) onChange([...value, tag.slice(0, 40)]);
    setDraft('');
  };
  return (
    <div className="home-taginput">
      {value.map((tag) => (
        <span key={tag} className="home-tag">{tag}<button type="button" aria-label={`${t('Удалить')} ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))}>×</button></span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={value.length ? '' : t('Введите тег и нажмите Enter')}
      />
    </div>
  );
}

export function CreateHomeItemDialog({ open, ...props }) {
  return open ? <CreateHomeItemForm {...props} /> : null;
}

export const DEFAULT_ICON = { projects: '😎', goals: '🎯' };

/** Atlassian-style quick create: name, emoji and access; everything else is filled in on the item page. */
function CreateHomeItemForm({ kind, onClose, onCreated }) {
  const cfg = HOME_KINDS[kind];
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON[kind] || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      onCreated(await homeApi.create(kind, { name: name.trim(), icon: icon || null, isPrivate, tags: [] }));
    } catch (err) {
      setError(err.message || t('Не удалось сохранить'));
      setSaving(false);
    }
  };

  return (
    <form ref={ref} className="home-create-pop" role="dialog" aria-modal="true" aria-label={t(cfg.create)} onSubmit={submit}>
      <div className="home-create-head">
        <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="chevronLeft" size={14} /></button>
        <NavIcon name={cfg.icon} size={16} />
        <strong>{t(kind === 'goals' ? 'Цель' : 'Проект')}</strong>
      </div>
      <p className="home-muted">{t('Обязательные поля отмечены звездочкой')} <span className="app-required">*</span></p>
      <label className="app-field">
        <span>{t('Имя')} <span className="app-required">*</span></span>
        <input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="app-field">
        <span>{t('Выберите эмодзи')}</span>
        <div className="home-create-emoji">
          <span className="home-create-emoji-current" aria-hidden="true">{icon || <NavIcon name={cfg.icon} size={16} />}</span>
          <button type="button" className="app-icon-btn" aria-label={t('Выберите эмодзи')} aria-expanded={pickerOpen} onClick={() => setPickerOpen((v) => !v)}>☺</button>
        </div>
        {pickerOpen && (
          <div className="home-icon-picker">
            {ICONS.map((option) => (
              <button key={option || 'none'} type="button" className={`home-icon-option ${icon === option ? 'is-selected' : ''}`} aria-pressed={icon === option}
                onClick={() => { setIcon(option); setPickerOpen(false); }}>
                {option || <NavIcon name={cfg.icon} size={16} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="app-field">
        <span>{t('Доступ')}</span>
        <select value={isPrivate ? 'private' : 'open'} onChange={(e) => setIsPrivate(e.target.value === 'private')}>
          <option value="open">{t('Открытый')}</option>
          <option value="private">{t('Частный')}</option>
        </select>
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
      <div className="home-create-actions">
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !name.trim()}>{saving ? '…' : t('Создать')}</button>
      </div>
    </form>
  );
}

export function StatusUpdateComposer({ item, onPosted, onCancel }) {
  const { t } = useLocalization();
  const isGoal = item.kind === 'goal';
  const [status, setStatus] = useState(item.status === 'pending' ? 'on_track' : item.status);
  const [score, setScore] = useState(item.score ?? 0);
  const [targetDate, setTargetDate] = useState(toInputDate(item.targetDate));
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    setError('');
    try {
      await homeApi.addUpdate(item.id, {
        status,
        score: isGoal ? Number(score) : null,
        targetDate: targetDate !== toInputDate(item.targetDate) ? fromInputDate(targetDate) : null,
        summary: summary.trim(),
      });
      setSummary('');
      onPosted();
    } catch (err) {
      setError(err.message || t('Не удалось сохранить'));
    }
    setSaving(false);
  };
  return (
    <form className="home-card home-composer" onSubmit={submit}>
      <h3>{t('Обновление статуса')}</h3>
      <div className="home-status-picker" role="radiogroup" aria-label={t('Статус')}>
        {HOME_STATUSES.filter(([id]) => id !== 'pending').map(([id, label, tone]) => (
          <button key={id} type="button" role="radio" aria-checked={status === id} className={`home-status ${tone} ${status === id ? 'is-picked' : ''}`} onClick={() => setStatus(id)}>{t(label)}</button>
        ))}
      </div>
      <div className="home-form-grid">
        {isGoal && (
          <label className="app-field">
            <span>{t('Оценка')}: <strong>{formatScore(score)}</strong></span>
            <input type="range" min="0" max="1" step="0.1" value={score} onChange={(e) => setScore(e.target.value)} />
          </label>
        )}
        <label className="app-field">
          <span>{t('Срок')}</span>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
      </div>
      <label className="app-field">
        <span>{t('Что изменилось за неделю?')} <span className="app-required">*</span></span>
        <textarea rows={5} value={summary} maxLength={10000} onChange={(e) => setSummary(e.target.value)} placeholder={t('Что сделано, что дальше, есть ли риски или блокеры')} />
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
      <div className="home-composer-actions">
        {onCancel && <button type="button" className="app-btn app-btn-subtle" onClick={onCancel}>{t('Отмена')}</button>}
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !summary.trim()}>{saving ? '…' : t('Опубликовать')}</button>
      </div>
    </form>
  );
}

export function UpdateCard({ update, kind, item, canDelete, onDelete }) {
  const { t, locale } = useLocalization();
  const statusChanged = update.previousStatus && update.previousStatus !== update.status;
  const dateChanged = toInputDate(update.previousTargetDate) !== toInputDate(update.targetDate);
  return (
    <article className="home-card home-update">
      <header className="home-update-head">
        <Avatar user={update.author} size={28} />
        <div className="home-update-who">
          <strong>{update.author?.displayName}</strong>
          {item && <Link to={`/${item.kind === 'goal' ? 'goals' : 'projects'}/${item.id}`} className="home-name is-inline"><ItemIcon item={item} size={18} />{item.name}</Link>}
          <span className="home-muted">{timeAgo(update.createdAt, locale)}</span>
        </div>
        {canDelete && <button type="button" className="app-icon-btn" aria-label={t('Удалить обновление')} title={t('Удалить обновление')} onClick={onDelete}><NavIcon name="trash" size={14} /></button>}
      </header>
      <div className="home-update-status">
        {statusChanged && <><HomeStatus status={update.previousStatus} kind={kind} /><span aria-hidden="true">→</span></>}
        <HomeStatus status={update.status} score={update.score} kind={kind} />
        {dateChanged && update.targetDate && (
          <span className="home-muted">{t('Срок')}: {update.previousTargetDate ? <s>{formatDate(update.previousTargetDate, locale)}</s> : null} {formatDate(update.targetDate, locale)}</span>
        )}
      </div>
      <p className="home-update-text">{update.summary}</p>
    </article>
  );
}

export function HomeUpdatesPage({ kind }) {
  const cfg = HOME_KINDS[kind];
  const { t, locale } = useLocalization();
  const [scope, setScope] = useState('following');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    homeApi.feed(kind, scope).then((d) => { setData(d); setError(''); }).catch((e) => { setData({ updates: [], due: [] }); setError(e.message); });
  }, [kind, scope]);
  useEffect(() => { load(); }, [load]);
  const weeks = useMemo(() => groupByWeek(data?.updates || [], (e) => e.update.createdAt), [data]);
  return (
    <div className="settings-shell">
      <section className="settings-content is-wide home-page">
        <div className="settings-title-row"><h1 className="settings-title">{t('Обновления статуса')}</h1></div>
        <p className="home-muted">{t(kind === 'goals' ? 'Еженедельные обновления целей: статус, оценка и что изменилось.' : 'Еженедельные обновления проектов: статус, сроки и что изменилось.')}</p>
        <div className="home-tabs" role="tablist">
          {[['following', 'Отслеживаемые'], ['all', 'Все']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={scope === id} className={`home-tab ${scope === id ? 'is-active' : ''}`} onClick={() => setScope(id)}>{t(label)}</button>
          ))}
        </div>
        {error && <p className="settings-save-status is-error">{error}</p>}
        {data?.due?.length > 0 && (
          <div className="home-card home-due-list">
            <h3>{t('Ждут вашего обновления')}</h3>
            <ul className="home-list">
              {data.due.map((i) => (
                <li key={i.id}>
                  <Link to={`/${kind}/${i.id}`} className="home-name is-inline"><ItemIcon item={i} size={20} />{i.name}</Link>
                  <HomeStatus status={i.status} score={i.score} kind={i.kind} />
                  <Link to={`/${kind}/${i.id}?update=1`} className="app-btn app-btn-subtle">{t('Написать обновление')}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data === null && <p className="settings-empty">{t('Загрузка...')}</p>}
        {data && weeks.length === 0 && (
          <div className="settings-empty">
            {t(scope === 'following' ? 'Нет обновлений по тому, что вы отслеживаете.' : 'Обновлений пока нет.')}
            {' '}<Link to={`/${kind}`}>{t(cfg.catalog)}</Link>
          </div>
        )}
        {weeks.map((week) => (
          <section key={week.start} className="home-week">
            <h3 className="home-section-title">{t('Неделя с')} {new Date(week.start).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</h3>
            {week.entries.map(({ update, item }) => (
              <UpdateCard key={update.id} update={update} item={item} kind={item.kind} canDelete={false} onDelete={() => {}} />
            ))}
          </section>
        ))}
      </section>
    </div>
  );
}
