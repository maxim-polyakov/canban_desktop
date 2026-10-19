import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { achievements as achievementsApi, components as componentsApi, releases as releasesApi, search, spaces as spacesApi } from '../api.js';
import NavIcon from '../components/NavIcons.jsx';
import SpaceAvatar from '../components/SpaceAvatar.jsx';
import { IssueTypeIcon } from '../components/IssueIcons.jsx';
import './settings/Settings.css';

function PageFrame({ title, description, actions, children }) {
  return (
    <div className="settings-shell">
      <section className="settings-content is-wide">
        <div className="settings-title-row">
          <h1 className="settings-title">{title}</h1>
          {actions && <div className="settings-actions">{actions}</div>}
        </div>
        {description && <p className="settings-description">{description}</p>}
        {children}
      </section>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="settings-search">
      <NavIcon name="search" size={14} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

function Progress({ done, total }) {
  const { t } = useLocalization();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="workspace-progress" title={`${done}/${total}`}>
      <span className="workspace-progress-bar"><span style={{ width: `${pct}%` }} /></span>
      <span className="workspace-progress-text">{total ? `${pct}%` : t('Нет задач')}</span>
    </span>
  );
}

/** Jira "Projects" ↗ maps to epics across all spaces with roll-up progress of their child issues. */
export function ProjectsPage() {
  const { t, formatDate } = useLocalization();
  const [epics, setEpics] = useState(null);
  const [children, setChildren] = useState([]);
  const [spaceNames, setSpaceNames] = useState(new Map());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('open');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      search.issues({ jql: 'type = Epic ORDER BY created DESC', pageSize: 200 }),
      search.issues({ jql: 'type != Epic', pageSize: 200 }),
      spacesApi.getMine(),
    ]).then(([epicResult, childResult, spaceList]) => {
      setEpics(epicResult?.items || []);
      setChildren(childResult?.items || []);
      setSpaceNames(new Map(spaceList.map((s) => [s.id, s.name])));
    }).catch((e) => { setError(e.message || t('Не удалось загрузить проекты')); setEpics([]); });
  }, [t]);

  const progress = useMemo(() => {
    const map = new Map();
    children.forEach((issue) => {
      const parent = issue.parentQuestId || issue.parentEpicId;
      if (!parent) return;
      const entry = map.get(parent) || { done: 0, total: 0 };
      entry.total += 1;
      if (issue.completedAt) entry.done += 1;
      map.set(parent, entry);
    });
    return map;
  }, [children]);

  const rows = (epics || []).filter((e) => {
    const needle = query.trim().toLowerCase();
    if (needle && !e.title.toLowerCase().includes(needle) && !e.issueKey.toLowerCase().includes(needle)) return false;
    if (status === 'open') return !e.completedAt;
    if (status === 'done') return Boolean(e.completedAt);
    return true;
  });

  return (
    <PageFrame
      title={t('Проекты')}
      description={t('Крупные инициативы (эпики) во всех ваших разделах и прогресс по входящим в них задачам.')}
      actions={<Link to={`/issues?jql=${encodeURIComponent('type = Epic')}`} className="app-btn">{t('Открыть в фильтрах')}</Link>}
    >
      <div className="settings-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder={t('Поиск по проектам')} />
        <select className="app-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Статус')}>
          <option value="open">{t('Активные')}</option>
          <option value="done">{t('Завершённые')}</option>
          <option value="all">{t('Все')}</option>
        </select>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Проект')}</th>
              <th className="hide-mobile">{t('Раздел')}</th>
              <th className="hide-mobile">{t('Исполнитель')}</th>
              <th>{t('Прогресс')}</th>
              <th className="hide-mobile">{t('Срок')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((epic) => {
              const p = progress.get(epic.id) || { done: 0, total: 0 };
              return (
                <tr key={epic.id}>
                  <td>
                    <Link to={`/board/${epic.boardId}/issue/${epic.id}`} className="settings-table-name">
                      <IssueTypeIcon issueType={0} size={16} />
                      <span>{epic.title}</span>
                      <span className="settings-row-desc">{epic.issueKey}</span>
                    </Link>
                  </td>
                  <td className="hide-mobile">
                    <Link to={`/board/${epic.boardId}/roadmap`} className="settings-table-name">
                      <SpaceAvatar id={epic.boardId} name={spaceNames.get(epic.boardId) || '?'} size={20} />{spaceNames.get(epic.boardId) || '—'}
                    </Link>
                  </td>
                  <td className="hide-mobile">{epic.assignees?.[0]?.displayName || epic.assigneeName || '—'}</td>
                  <td><Progress done={p.done} total={p.total} /></td>
                  <td className="hide-mobile">{epic.dueDate ? formatDate(epic.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!epics && <p className="settings-empty">{t('Загрузка...')}</p>}
        {epics && rows.length === 0 && <p className="settings-empty">{t('Нет проектов. Создайте задачу с типом «Эпик», чтобы начать.')}</p>}
      </div>
    </PageFrame>
  );
}

/** Jira "Goals" ↗ maps to the gamification achievements: each one is a goal with a clear way to reach it. */
export function GoalsPage() {
  const { t, formatDate } = useLocalization();
  const [all, setAll] = useState(null);
  const [mine, setMine] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([achievementsApi.getAll(), achievementsApi.getMy().catch(() => [])])
      .then(([list, my]) => { setAll(Array.isArray(list) ? list : []); setMine(Array.isArray(my) ? my : []); })
      .catch(() => setAll([]));
  }, []);

  const unlocked = new Map(mine.map((a) => [a.achievementId, a]));
  const rows = (all || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((a) => filter === 'all' || (filter === 'done') === unlocked.has(a.id));

  return (
    <PageFrame
      title={t('Цели')}
      description={t('Личные цели и достижения. Выполняйте задачи, чтобы достигать целей и получать бонусный опыт.')}
      actions={<Link to="/profile" className="app-btn">{t('Профиль')}</Link>}
    >
      <div className="settings-cards">
        <div className="settings-card"><div className="settings-card-label">{t('Достигнуто')}</div><div className="settings-card-value">{unlocked.size}</div></div>
        <div className="settings-card"><div className="settings-card-label">{t('Всего целей')}</div><div className="settings-card-value">{all ? all.length : '…'}</div></div>
      </div>
      <div className="settings-toolbar">
        <select className="app-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('Статус')}>
          <option value="all">{t('Все')}</option>
          <option value="open">{t('В процессе')}</option>
          <option value="done">{t('Достигнуто')}</option>
        </select>
      </div>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Цель')}</th>
              <th className="hide-mobile">{t('Как достичь')}</th>
              <th className="is-narrow">{t('Бонус')}</th>
              <th className="is-narrow">{t('Статус')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((goal) => {
              const done = unlocked.get(goal.id);
              return (
                <tr key={goal.id}>
                  <td>
                    <span className="settings-table-name">
                      {goal.iconUrl ? <img src={goal.iconUrl} alt="" width={24} height={24} /> : <NavIcon name="goals" size={20} />}
                      <span>{goal.name}{goal.description && <span className="settings-row-desc" style={{ display: 'block' }}>{goal.description}</span>}</span>
                    </span>
                  </td>
                  <td className="hide-mobile">{goal.howToObtain || '—'}</td>
                  <td className="is-narrow">{goal.xpBonus ? `+${goal.xpBonus} XP` : '—'}</td>
                  <td className="is-narrow">
                    {done
                      ? <span className="settings-lozenge is-success" title={formatDate(done.unlockedAt, { dateStyle: 'medium' })}>{t('Достигнуто')}</span>
                      : <span className="settings-lozenge is-info">{t('В процессе')}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!all && <p className="settings-empty">{t('Загрузка...')}</p>}
        {all && rows.length === 0 && <p className="settings-empty">{t('Нет целей в этой категории.')}</p>}
      </div>
    </PageFrame>
  );
}

/** Jira "Assets" maps to the managed catalog of components and releases across spaces. */
export function AssetsPage() {
  const { t, formatDate } = useLocalization();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [spaceList, setSpaceList] = useState([]);
  const [target, setTarget] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  useEffect(() => {
    spacesApi.getMine().then(async (list) => {
      setSpaceList(list);
      setTarget(list[0]?.id || '');
      const perSpace = await Promise.all(list.map(async (space) => {
        const [comps, rels] = await Promise.all([
          componentsApi.getByBoard(space.id).catch(() => []),
          releasesApi.getByBoard(space.id).catch(() => []),
        ]);
        return [
          ...comps.map((c) => ({ id: c.id, kind: 'component', name: c.name, description: c.description, archived: c.archived, space })),
          ...rels.map((r) => ({ id: r.id, kind: 'release', name: r.name, description: r.description, status: r.status, date: r.releaseDate, space })),
        ];
      }));
      setItems(perSpace.flat());
    }).catch(() => setItems([]));
  }, []);

  const rows = (items || []).filter((item) => {
    const needle = query.trim().toLowerCase();
    if (kind !== 'all' && item.kind !== kind) return false;
    return !needle || item.name.toLowerCase().includes(needle) || (item.description || '').toLowerCase().includes(needle);
  });

  const releaseStatus = (s) => (s === 1 ? ['Выпущен', 'is-success'] : s === 2 ? ['В архиве', ''] : ['Не выпущен', 'is-info']);

  return (
    <PageFrame
      title={t('Активы')}
      description={t('Каталог компонентов и релизов во всех разделах: что вы разрабатываете и поставляете.')}
      actions={spaceList.length > 0 && (
        <>
          <select className="app-select" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('Раздел')}>
            {spaceList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="app-btn" disabled={!target} onClick={() => navigate(`/board/${target}/releases`)}>{t('Создать релиз')}</button>
          <button type="button" className="app-btn app-btn-primary" disabled={!target} onClick={() => navigate(`/board/${target}/components`)}>{t('Создать компонент')}</button>
        </>
      )}
    >
      <div className="settings-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder={t('Поиск по активам')} />
        <select className="app-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('Тип')}>
          <option value="all">{t('Все типы')}</option>
          <option value="component">{t('Компоненты')}</option>
          <option value="release">{t('Релизы')}</option>
        </select>
      </div>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Имя')}</th>
              <th className="is-narrow">{t('Тип')}</th>
              <th className="hide-mobile">{t('Описание')}</th>
              <th>{t('Раздел')}</th>
              <th className="is-narrow">{t('Статус')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const [label, tone] = item.kind === 'release' ? releaseStatus(item.status) : item.archived ? ['В архиве', ''] : ['Активен', 'is-success'];
              const jql = item.kind === 'release' ? `fixVersion = "${item.name}"` : `component = "${item.name}"`;
              return (
                <tr key={`${item.kind}-${item.id}`}>
                  <td>
                    <Link to={`/issues?jql=${encodeURIComponent(jql)}`} className="settings-table-name">
                      <NavIcon name={item.kind === 'release' ? 'releases' : 'components'} />{item.name}
                    </Link>
                  </td>
                  <td className="is-narrow">{t(item.kind === 'release' ? 'Релиз' : 'Компонент')}</td>
                  <td className="hide-mobile">{item.description || (item.date ? formatDate(item.date, { dateStyle: 'medium' }) : '—')}</td>
                  <td><Link to={`/board/${item.space.id}/${item.kind === 'release' ? 'releases' : 'components'}`}>{item.space.name}</Link></td>
                  <td className="is-narrow"><span className={`settings-lozenge ${tone}`}>{t(label)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items && <p className="settings-empty">{t('Загрузка...')}</p>}
        {items && rows.length === 0 && <p className="settings-empty">{t('Активов пока нет. Создайте компонент или релиз в разделе.')}</p>}
      </div>
    </PageFrame>
  );
}
