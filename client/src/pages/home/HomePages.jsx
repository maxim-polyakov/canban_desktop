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

function Avatar({ user, size = 24 }) {
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

function ItemIcon({ item, size = 24 }) {
  const isGoal = item.kind === 'goal';
  return (
    <span className={`home-item-icon ${isGoal ? 'is-goal' : ''}`} style={{ width: size, height: size, fontSize: size * 0.55 }}>
      {item.icon || <NavIcon name={isGoal ? 'goals' : 'projects'} size={Math.round(size * 0.6)} />}
    </span>
  );
}

function formatDate(value, locale) {
  if (!value) return '';
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const toInputDate = (value) => (value ? String(value).slice(0, 10) : '');
const fromInputDate = (value) => (value ? `${value}T00:00:00Z` : null);

function usePeople() {
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

function useMyTeams() {
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

function useOutsideClose(open, onClose) {
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

function FollowButton({ item, onChanged, compact = false }) {
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

function Progress({ done, total }) {
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

const ICONS = ['', '🚀', '🎯', '📈', '🛠️', '💡', '📦', '🌱', '🔒', '🧭', '⭐', '🏁'];

function TagInput({ value, onChange, id }) {
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

export function CreateHomeItemDialog({ open, kind, goals, onClose, onCreated }) {
  const cfg = HOME_KINDS[kind];
  const { t } = useLocalization();
  const { user } = useAuth();
  const peopleList = usePeople();
  const myTeams = useMyTeams();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setForm({ name: '', icon: '', ownerUserId: user?.id || '', teamId: '', targetDate: '', startDate: '', goalId: '', tags: [], isPrivate: false });
      setError('');
    }
  }, [open, user]);
  if (!open) return null;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await homeApi.create(kind, {
        name: form.name.trim(),
        icon: form.icon || null,
        ownerUserId: form.ownerUserId || null,
        teamId: form.teamId || null,
        targetDate: fromInputDate(form.targetDate),
        startDate: kind === 'projects' ? fromInputDate(form.startDate) : null,
        parentId: kind === 'goals' ? form.goalId || null : null,
        goalId: kind === 'projects' ? form.goalId || null : null,
        tags: form.tags,
        isPrivate: form.isPrivate,
      });
      onCreated(created);
    } catch (err) {
      setError(err.message || t('Не удалось сохранить'));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal home-modal" role="dialog" aria-modal="true" aria-label={t(cfg.create)} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t(cfg.create)}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <label className="app-field">
            <span>{t('Название')} <span className="app-required">*</span></span>
            <input autoFocus value={form.name} maxLength={200} onChange={set('name')} placeholder={t(kind === 'goals' ? 'Например, Увеличить удержание клиентов' : 'Например, Новое мобильное приложение')} />
          </label>
          <div className="app-field">
            <span>{t('Значок')}</span>
            <div className="home-icon-picker">
              {ICONS.map((icon) => (
                <button key={icon || 'none'} type="button" className={`home-icon-option ${form.icon === icon ? 'is-selected' : ''}`} aria-pressed={form.icon === icon} onClick={() => set('icon')(icon)}>
                  {icon || <NavIcon name={cfg.icon} size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="home-form-grid">
            <label className="app-field">
              <span>{t('Владелец')}</span>
              <select value={form.ownerUserId} onChange={set('ownerUserId')}>
                {peopleList.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </label>
            <label className="app-field">
              <span>{t('Команда')}</span>
              <select value={form.teamId} onChange={set('teamId')}>
                <option value="">{t('Без команды')}</option>
                {myTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            {kind === 'projects' && (
              <label className="app-field">
                <span>{t('Дата начала')}</span>
                <input type="date" value={form.startDate} onChange={set('startDate')} />
              </label>
            )}
            <label className="app-field">
              <span>{t('Срок')}</span>
              <input type="date" value={form.targetDate} min={form.startDate || undefined} onChange={set('targetDate')} />
            </label>
          </div>
          <label className="app-field">
            <span>{t(kind === 'goals' ? 'Родительская цель' : 'Цель, на которую работает проект')}</span>
            <select value={form.goalId} onChange={set('goalId')}>
              <option value="">{t('Не выбрано')}</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <div className="app-field">
            <label htmlFor="home-create-tags">{t('Теги')}</label>
            <TagInput id="home-create-tags" value={form.tags} onChange={set('tags')} />
          </div>
          <label className="home-toggle">
            <input type="checkbox" checked={form.isPrivate} onChange={set('isPrivate')} />
            {t('Частный: видят только владелец, участники, подписчики и команда')}
          </label>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving || !form.name.trim()}>{saving ? '…' : t('Создать')}</button>
        </div>
      </form>
    </div>
  );
}

function StatusUpdateComposer({ item, onPosted, onCancel }) {
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

function UpdateCard({ update, kind, item, canDelete, onDelete }) {
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

function PersonPicker({ people, exclude, onPick, label }) {
  const { t } = useLocalization();
  const options = people.filter((p) => !exclude.includes(p.id));
  if (!options.length) return null;
  return (
    <select className="home-inline-select" value="" aria-label={t(label)} onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{t(label)}</option>
      {options.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select>
  );
}

export function HomeItemPage({ kind }) {
  const cfg = HOME_KINDS[kind];
  const { itemId } = useParams();
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const peopleList = usePeople();
  const myTeams = useMyTeams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [composing, setComposing] = useState(() => new URLSearchParams(location.search).get('update') === '1');
  const [editingAbout, setEditingAbout] = useState(false);
  const [about, setAbout] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [workKey, setWorkKey] = useState('');
  const [actionError, setActionError] = useState('');
  const [relatedOptions, setRelatedOptions] = useState([]);
  const [goalOptions, setGoalOptions] = useState([]);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useOutsideClose(menuOpen, closeMenu);

  const load = useCallback(() => {
    homeApi.get(itemId).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [itemId]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    homeApi.list(cfg.other).then((list) => setRelatedOptions(Array.isArray(list) ? list : [])).catch(() => setRelatedOptions([]));
    if (kind === 'goals') homeApi.list('goals').then((list) => setGoalOptions(Array.isArray(list) ? list : [])).catch(() => setGoalOptions([]));
  }, [cfg.other, kind]);

  const run = async (action) => {
    setActionError('');
    try { await action(); load(); } catch (e) { setActionError(e.message || t('Не удалось сохранить')); }
  };
  const save = (patch) => run(() => homeApi.update(itemId, patch));

  if (error) {
    return (
      <div className="settings-shell"><section className="settings-content">
        <div className="settings-breadcrumbs"><Link to={`/${kind}`}>{t(cfg.title)}</Link></div>
        <p className="settings-save-status is-error">{error}</p>
      </section></div>
    );
  }
  if (!data) return <div className="settings-shell"><section className="settings-content"><p className="settings-empty">{t('Загрузка...')}</p></section></div>;

  const item = data.item;
  const canEdit = item.canEdit;
  const isGoal = item.kind === 'goal';
  const contributorIds = data.contributors.map((c) => c.id);
  const linkedIds = data.linked.map((l) => l.id);
  const latest = data.updates[0];
  const tabs = [
    ['overview', 'Обзор'],
    ['updates', `${t('Обновления')} (${data.updates.length})`],
    isGoal ? ['children', `${t('Подцели')} (${data.children.length})`] : ['work', `${t('Работа')} (${data.work.total})`],
    ['linked', `${t(isGoal ? 'Проекты' : 'Цели')} (${data.linked.length})`],
  ];

  const descendantIds = new Set([item.id]);
  for (let grew = true; grew;) {
    grew = false;
    goalOptions.forEach((g) => {
      if (g.parentId && descendantIds.has(g.parentId) && !descendantIds.has(g.id)) { descendantIds.add(g.id); grew = true; }
    });
  }
  const parentChoices = goalOptions.filter((g) => !descendantIds.has(g.id));

  return (
    <div className="settings-shell">
      <section className="settings-content is-wide home-page">
        <div className="settings-breadcrumbs">
          <Link to={`/${kind}`}>{t(cfg.title)}</Link>
          {data.parent && <><span>/</span><Link to={`/goals/${data.parent.id}`}>{data.parent.name}</Link></>}
          <span>/</span><span>{item.name}</span>
        </div>
        <div className="home-item-head">
          <ItemIcon item={item} size={40} />
          <div className="home-item-title">
            <h1 className="settings-title">{item.name}</h1>
            <div className="home-item-sub">
              <HomeStatus status={item.status} score={item.score} kind={item.kind} />
              {item.targetDate && <span className="home-muted">{t('Срок')}: {formatDate(item.targetDate, locale)}</span>}
              {item.isArchived && <span className="settings-lozenge">{t('В архиве')}</span>}
              {item.isPrivate && <span className="settings-lozenge">{t('Частный')}</span>}
            </div>
          </div>
          <div className="settings-actions">
            <FollowButton item={item} onChanged={load} />
            {canEdit && !item.isArchived && <button type="button" className="app-btn app-btn-primary" onClick={() => { setTab('overview'); setComposing(true); }}>{t('Написать обновление')}</button>}
            {canEdit && (
              <div className="home-chip-wrap" ref={menuRef}>
                <button type="button" className="app-icon-btn" aria-label={t('Ещё')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><NavIcon name="more" /></button>
                {menuOpen && (
                  <div className="home-popover is-right" role="menu">
                    <button type="button" role="menuitem" className="home-popover-item" onClick={() => { setMenuOpen(false); run(() => homeApi.archive(item.id, !item.isArchived)); }}>
                      {t(item.isArchived ? 'Восстановить из архива' : 'Архивировать')}
                    </button>
                    {data.canDelete && (
                      <button type="button" role="menuitem" className="home-popover-item is-danger" onClick={async () => {
                        setMenuOpen(false);
                        if (!window.confirm(t('Удалить без возможности восстановления?'))) return;
                        try { await homeApi.delete(item.id); navigate(`/${kind}`); } catch (e) { setActionError(e.message); }
                      }}>{t('Удалить')}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {actionError && <p className="settings-save-status is-error" role="alert">{actionError}</p>}
        {item.updateDue && canEdit && !composing && (
          <div className="home-due-banner">
            <span>{t(item.lastUpdateAt ? 'Пора написать еженедельное обновление статуса.' : 'Напишите первое обновление статуса, чтобы подписчики знали, как идут дела.')}</span>
            <button type="button" className="app-btn app-btn-subtle" onClick={() => { setTab('overview'); setComposing(true); }}>{t('Написать обновление')}</button>
          </div>
        )}

        <div className="home-detail">
          <div className="home-main">
            <div className="home-tabs" role="tablist">
              {tabs.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={`home-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{t(label)}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <>
                {composing && canEdit && <StatusUpdateComposer item={item} onCancel={() => setComposing(false)} onPosted={() => { setComposing(false); load(); }} />}
                <div className="home-card">
                  <div className="home-card-head">
                    <h3>{t(cfg.about)}</h3>
                    {canEdit && !editingAbout && <button type="button" className="app-btn app-btn-subtle" onClick={() => { setAbout(data.description || ''); setEditingAbout(true); }}>{t('Изменить')}</button>}
                  </div>
                  {editingAbout ? (
                    <>
                      <textarea className="home-textarea" rows={6} value={about} onChange={(e) => setAbout(e.target.value)} placeholder={t('Зачем это нужно, что входит в работу и как понять, что всё готово')} aria-label={t(cfg.about)} />
                      <div className="home-composer-actions">
                        <button type="button" className="app-btn app-btn-subtle" onClick={() => setEditingAbout(false)}>{t('Отмена')}</button>
                        <button type="button" className="app-btn app-btn-primary" onClick={() => { setEditingAbout(false); save({ description: about }); }}>{t('Сохранить')}</button>
                      </div>
                    </>
                  ) : (
                    <p className="home-update-text">{data.description || <span className="home-muted">{t('Описание пока не добавлено.')}</span>}</p>
                  )}
                </div>
                <h3 className="home-section-title">{t('Последнее обновление')}</h3>
                {latest
                  ? <UpdateCard update={latest} kind={item.kind} canDelete={latest.author?.id === user?.id} onDelete={() => run(() => homeApi.deleteUpdate(item.id, latest.id))} />
                  : <p className="home-muted">{t('Обновлений пока нет.')}</p>}
              </>
            )}

            {tab === 'updates' && (
              <>
                {canEdit && !composing && <button type="button" className="app-btn app-btn-subtle" onClick={() => setComposing(true)}>{t('Написать обновление')}</button>}
                {composing && canEdit && <StatusUpdateComposer item={item} onCancel={() => setComposing(false)} onPosted={() => { setComposing(false); load(); }} />}
                {data.updates.map((u) => (
                  <UpdateCard key={u.id} update={u} kind={item.kind} canDelete={u.author?.id === user?.id || item.owner?.id === user?.id} onDelete={() => run(() => homeApi.deleteUpdate(item.id, u.id))} />
                ))}
                {data.updates.length === 0 && <p className="home-muted">{t('Обновлений пока нет.')}</p>}
              </>
            )}

            {tab === 'work' && (
              <div className="home-card">
                <div className="home-card-head">
                  <h3>{t('Связанные задачи')}</h3>
                  <Progress done={data.work.done} total={data.work.total} />
                </div>
                {canEdit && (
                  <form className="home-inline-form" onSubmit={(e) => { e.preventDefault(); if (workKey.trim()) run(async () => { await homeApi.addWork(item.id, { issueKey: workKey.trim() }); setWorkKey(''); }); }}>
                    <input value={workKey} onChange={(e) => setWorkKey(e.target.value)} placeholder={t('Ключ задачи или эпика, например ABC-12')} aria-label={t('Ключ задачи')} />
                    <button type="submit" className="app-btn app-btn-subtle" disabled={!workKey.trim()}>{t('Добавить')}</button>
                  </form>
                )}
                <ul className="home-list">
                  {data.work.items.map((w) => (
                    <li key={w.id}>
                      <IssueTypeIcon issueType={w.issueType} size={14} />
                      <Link to={`/board/${w.boardId}/issue/${w.id}`} className="home-key">{w.issueKey}</Link>
                      <span className="home-list-title">{w.title}</span>
                      <span className={`tpl-status tpl-status-${w.statusCategory}`}>{w.status}</span>
                      {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать')} onClick={() => run(() => homeApi.removeWork(item.id, w.id))}><NavIcon name="close" size={12} /></button>}
                    </li>
                  ))}
                </ul>
                {data.work.items.length < data.work.total && <p className="home-muted">{t('Часть задач скрыта: у вас нет доступа к их разделам.')}</p>}
                {data.work.total === 0 && <p className="home-muted">{t('Добавьте задачи или эпики, чтобы видеть прогресс работы.')}</p>}
              </div>
            )}

            {tab === 'children' && (
              <div className="home-card">
                <div className="home-card-head"><h3>{t('Подцели')}</h3></div>
                <ul className="home-list">
                  {data.children.map((c) => (
                    <li key={c.id}>
                      <Link to={`/goals/${c.id}`} className="home-name is-inline"><ItemIcon item={c} size={20} />{c.name}</Link>
                      <HomeStatus status={c.status} score={c.score} kind="goal" />
                    </li>
                  ))}
                </ul>
                {data.children.length === 0 && <p className="home-muted">{t('Подцелей нет. Укажите эту цель как родительскую при создании новой цели.')}</p>}
              </div>
            )}

            {tab === 'linked' && (
              <div className="home-card">
                <div className="home-card-head">
                  <h3>{t(isGoal ? 'Проекты, которые работают на цель' : 'Цели, на которые работает проект')}</h3>
                  {canEdit && (
                    <select className="home-inline-select" value="" aria-label={t(isGoal ? 'Связать проект' : 'Связать с целью')} onChange={(e) => e.target.value && run(() => homeApi.link(item.id, e.target.value))}>
                      <option value="">{t(isGoal ? 'Связать проект' : 'Связать с целью')}</option>
                      {relatedOptions.filter((o) => !linkedIds.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                </div>
                <ul className="home-list">
                  {data.linked.map((l) => (
                    <li key={l.id}>
                      <Link to={`/${l.kind === 'goal' ? 'goals' : 'projects'}/${l.id}`} className="home-name is-inline"><ItemIcon item={l} size={20} />{l.name}</Link>
                      <HomeStatus status={l.status} score={l.score} kind={l.kind} />
                      {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать связь')} onClick={() => run(() => homeApi.unlink(item.id, l.id))}><NavIcon name="close" size={12} /></button>}
                    </li>
                  ))}
                </ul>
                {data.linked.length === 0 && <p className="home-muted">{t('Связей пока нет.')}</p>}
              </div>
            )}
          </div>

          <aside className="home-side">
            <div className="home-side-field">
              <span className="home-side-label">{t('Владелец')}</span>
              {canEdit ? (
                <select className="home-inline-select" value={item.owner?.id || ''} onChange={(e) => save({ ownerUserId: e.target.value })} aria-label={t('Владелец')}>
                  {!peopleList.some((p) => p.id === item.owner?.id) && item.owner && <option value={item.owner.id}>{item.owner.displayName}</option>}
                  {peopleList.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              ) : <span className="home-person"><Avatar user={item.owner} />{item.owner?.displayName}</span>}
            </div>
            <div className="home-side-field">
              <span className="home-side-label">{t('Команда')}</span>
              {canEdit ? (
                <select className="home-inline-select" value={item.team?.id || ''} onChange={(e) => save(e.target.value ? { teamId: e.target.value } : { clearTeam: true })} aria-label={t('Команда')}>
                  <option value="">{t('Без команды')}</option>
                  {item.team && !myTeams.some((tm) => tm.id === item.team.id) && <option value={item.team.id}>{item.team.name}</option>}
                  {myTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              ) : <span>{item.team?.name || '—'}</span>}
            </div>
            {!isGoal && (
              <div className="home-side-field">
                <span className="home-side-label">{t('Дата начала')}</span>
                {canEdit
                  ? <input type="date" className="home-inline-select" value={toInputDate(item.startDate ?? data.startDate)} aria-label={t('Дата начала')} onChange={(e) => save(e.target.value ? { startDate: fromInputDate(e.target.value) } : { clearStartDate: true })} />
                  : <span>{formatDate(data.startDate, locale) || '—'}</span>}
              </div>
            )}
            <div className="home-side-field">
              <span className="home-side-label">{t('Срок')}</span>
              {canEdit
                ? <input type="date" className="home-inline-select" value={toInputDate(item.targetDate)} aria-label={t('Срок')} onChange={(e) => save(e.target.value ? { targetDate: fromInputDate(e.target.value) } : { clearTargetDate: true })} />
                : <span>{formatDate(item.targetDate, locale) || '—'}</span>}
            </div>
            {isGoal && (
              <div className="home-side-field">
                <span className="home-side-label">{t('Родительская цель')}</span>
                {canEdit ? (
                  <select className="home-inline-select" value={item.parentId || ''} aria-label={t('Родительская цель')} onChange={(e) => save(e.target.value ? { parentId: e.target.value } : { clearParent: true })}>
                    <option value="">{t('Нет')}</option>
                    {data.parent && !parentChoices.some((g) => g.id === data.parent.id) && <option value={data.parent.id}>{data.parent.name}</option>}
                    {parentChoices.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                ) : data.parent ? <Link to={`/goals/${data.parent.id}`}>{data.parent.name}</Link> : <span>—</span>}
              </div>
            )}
            <div className="home-side-field">
              <span className="home-side-label">{t('Участники')}</span>
              <ul className="home-people">
                {data.contributors.map((c) => (
                  <li key={c.id}>
                    <span className="home-person"><Avatar user={c} />{c.displayName}</span>
                    {(canEdit || c.id === user?.id) && <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${c.displayName}`} onClick={() => run(() => homeApi.removeContributor(item.id, c.id))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {canEdit && <PersonPicker people={peopleList} exclude={contributorIds} label="Добавить участника" onPick={(id) => run(() => homeApi.addContributor(item.id, id))} />}
            </div>
            <div className="home-side-field">
              <span className="home-side-label">{t('Подписчики')} · {data.followers.length}</span>
              <span className="home-avatars">{data.followers.slice(0, 12).map((f) => <Avatar key={f.id} user={f} />)}</span>
            </div>
            <div className="home-side-field">
              <label className="home-side-label" htmlFor="home-item-tags">{t('Теги')}</label>
              {canEdit
                ? <TagInput id="home-item-tags" value={item.tags} onChange={(tags) => save({ tags })} />
                : <span className="home-tags">{item.tags.map((tag) => <span key={tag} className="home-tag">{tag}</span>)}</span>}
            </div>
            {canEdit && (
              <label className="home-toggle">
                <input type="checkbox" checked={item.isPrivate} onChange={(e) => save({ isPrivate: e.target.checked })} />
                {t('Частный')}
              </label>
            )}
            <p className="home-muted home-side-meta">{t('Создано')} {timeAgo(item.createdAt, locale)}</p>
          </aside>
        </div>
      </section>
    </div>
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
