import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { achievements as achievementsApi, search, spaces as spacesApi } from '../api.js';
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
