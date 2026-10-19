import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { boards as boardsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { getIssueTypeMeta, getPriorityMeta, IssueTypeIcon, PriorityIcon } from '../../components/IssueIcons.jsx';
import { OnboardingChecklist, useOnboarding } from '../../components/SpaceOnboarding.jsx';
import {
  ACCESS_LEVELS, FEATURE_DESCRIPTIONS, FEATURE_TABS, markOnboardingStep, notifyBoardChanged, spaceFeatures,
} from '../../utils/spaceFeatures.js';
import '../settings/Settings.css';
import './SpaceTemplates.css';

const DAY = 24 * 60 * 60 * 1000;
const STATUS_COLORS = { 0: '#8590a2', 1: '#1d7afc', 2: '#6e5dc6', 3: '#22a06b', 4: '#e2b203' };

function useBoardIssues(boardId) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    boardsApi.getById(boardId)
      .then((b) => { setBoard(b); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [boardId]);
  useEffect(() => { load(); }, [load]);
  const issues = useMemo(() => (board?.columns || [])
    .filter((c) => c.kind !== 5)
    .flatMap((c) => (c.quests || []).map((q) => ({ ...q, statusTitle: c.title, statusKind: c.kind, columnOrder: c.order }))), [board]);
  return { board, issues, error, loading, reload: load };
}

function StatusLozenge({ issue }) {
  const { t } = useLocalization();
  const kind = issue.statusKind === 3 ? 'done' : issue.statusKind === 0 ? 'todo' : 'progress';
  return <span className={`tpl-status tpl-status-${kind}`}>{t(issue.statusTitle)}</span>;
}

function Person({ issue }) {
  const { t } = useLocalization();
  const name = issue.assigneeName || issue.assignees?.[0]?.displayName;
  if (!name) return <span className="sv-muted">{t('Не назначен')}</span>;
  const avatar = issue.assigneeAvatarUrl || issue.assignees?.[0]?.avatarUrl;
  return (
    <span className="settings-table-person">
      {avatar ? <img src={avatar} alt="" className="app-avatar" /> : <span className="app-avatar app-avatar-placeholder">{name.charAt(0)}</span>}
      {name}
    </span>
  );
}

function Shell({ title, children, actions }) {
  return (
    <div className="settings-shell">
      <section className="settings-content is-wide sv-page">
        <div className="settings-title-row">
          <h1 className="settings-title">{title}</h1>
          {actions && <div className="settings-actions">{actions}</div>}
        </div>
        {children}
      </section>
    </div>
  );
}

function Bars({ rows, total }) {
  const { t } = useLocalization();
  return (
    <ul className="sv-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="sv-bar-label">{row.icon}{t(row.label)}</span>
          <span className="sv-bar-track"><span style={{ width: `${total ? (row.count / total) * 100 : 0}%`, background: row.color }} /></span>
          <span className="sv-bar-value">{total ? Math.round((row.count / total) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

function Donut({ parts, total }) {
  const { t } = useLocalization();
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="sv-donut">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={t('Обзор статусов')}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--chip-bg)" strokeWidth="18" />
        {total > 0 && parts.map((part) => {
          const length = (part.count / total) * circumference;
          const circle = (
            <circle key={part.key} cx="70" cy="70" r={radius} fill="none" stroke={part.color} strokeWidth="18"
              strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += length;
          return circle;
        })}
        <text x="70" y="66" textAnchor="middle" className="sv-donut-total">{total}</text>
        <text x="70" y="86" textAnchor="middle" className="sv-donut-caption">{t('Всего задач')}</text>
      </svg>
      <ul className="sv-legend">
        {parts.map((part) => (
          <li key={part.key}><span className="sv-dot" style={{ background: part.color }} />{t(part.label)}: {part.count}</li>
        ))}
      </ul>
    </div>
  );
}

export function SpaceSummaryPage() {
  const { t, locale } = useLocalization();
  const { boardId } = useParams();
  const { board, issues, error, loading } = useBoardIssues(boardId);
  const onboarding = useOnboarding(boardId);
  const now = Date.now();

  const stats = useMemo(() => {
    const within = (date, from, to) => date && new Date(date).getTime() >= from && new Date(date).getTime() <= to;
    return {
      done: issues.filter((q) => within(q.completedAt, now - 7 * DAY, now)).length,
      created: issues.filter((q) => within(q.createdAt, now - 7 * DAY, now)).length,
      due: issues.filter((q) => q.statusKind !== 3 && within(q.dueDate, now, now + 7 * DAY)).length,
      overdue: issues.filter((q) => q.statusKind !== 3 && q.dueDate && new Date(q.dueDate).getTime() < now).length,
    };
  }, [issues, now]);

  const statusParts = (board?.columns || []).filter((c) => c.kind !== 5).map((c) => ({
    key: c.id, label: c.title, color: STATUS_COLORS[c.kind] || STATUS_COLORS[4], count: (c.quests || []).length,
  }));
  const countBy = (field, values, meta, Icon) => values.map((value) => ({
    key: value, label: meta(value).label, color: meta(value).color, count: issues.filter((q) => q[field] === value).length,
    icon: <Icon {...{ [field]: value }} size={14} />,
  })).filter((row) => row.count > 0);
  const workload = Object.values(issues.reduce((acc, q) => {
    const name = q.assigneeName || q.assignees?.[0]?.displayName || t('Не назначен');
    acc[name] = acc[name] || { key: name, label: name, count: 0, color: 'var(--accent)' };
    acc[name].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count).slice(0, 8);
  const recent = [...issues].sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt)).slice(0, 8);

  if (loading && !board) return <Shell title={t('Сводка')}><p className="settings-empty">{t('Загрузка...')}</p></Shell>;
  if (error) return <Shell title={t('Сводка')}><p className="settings-save-status is-error">{error}</p></Shell>;

  const tiles = [
    ['check', stats.done, 'выполнено', 'за последние 7 дней'],
    ['edit', stats.created, 'создано', 'за последние 7 дней'],
    ['calendar', stats.due, 'со сроком', 'в ближайшие 7 дней'],
    ['recent', stats.overdue, 'просрочено', 'срок уже прошёл'],
  ];

  return (
    <Shell title={t('Сводка')}>
      <div className="sv-tiles">
        {tiles.map(([icon, value, label, sub]) => (
          <div key={label} className="sv-tile">
            <span className="sv-tile-icon"><NavIcon name={icon} size={18} /></span>
            <span><strong>{value} {t(label)}</strong><span className="sv-muted">{t(sub)}</span></span>
          </div>
        ))}
      </div>
      <div className="sv-grid">
        {onboarding && !onboarding.dismissed && (
          <div className="sv-card"><OnboardingChecklist board={board} boardId={boardId} /></div>
        )}
        <div className="sv-card">
          <h2>{t('Обзор статусов')}</h2>
          <p className="sv-muted">{t('Сколько задач в каждом статусе')}</p>
          <Donut parts={statusParts} total={issues.length} />
        </div>
        <div className="sv-card">
          <h2>{t('Недавняя активность')}</h2>
          {recent.length === 0 && <p className="sv-muted">{t('В разделе пока нет задач.')}</p>}
          <ul className="sv-activity">
            {recent.map((q) => (
              <li key={q.id}>
                <IssueTypeIcon issueType={q.issueType} size={16} />
                <Link to={`/board/${boardId}/issue/${q.id}`}>{q.issueKey} {q.title}</Link>
                <StatusLozenge issue={q} />
                <span className="sv-muted">{new Date(q.completedAt || q.createdAt).toLocaleDateString(locale)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="sv-card">
          <h2>{t('Разбивка по приоритетам')}</h2>
          <Bars rows={countBy('priority', [4, 3, 2, 1, 0], getPriorityMeta, PriorityIcon)} total={issues.length} />
        </div>
        <div className="sv-card">
          <h2>{t('Типы работ')}</h2>
          <Bars rows={countBy('issueType', [0, 1, 2, 3, 4], getIssueTypeMeta, IssueTypeIcon)} total={issues.length} />
        </div>
        <div className="sv-card">
          <h2>{t('Загрузка команды')}</h2>
          <Bars rows={workload} total={issues.length} />
        </div>
      </div>
    </Shell>
  );
}

const LIST_COLUMNS = [
  ['issueType', 'Тип', (q) => q.issueType],
  ['issueKey', 'Ключ', (q) => q.issueNumber],
  ['title', 'Название', (q) => q.title.toLowerCase()],
  ['status', 'Статус', (q) => q.columnOrder],
  ['assignee', 'Исполнитель', (q) => (q.assigneeName || '').toLowerCase()],
  ['priority', 'Приоритет', (q) => -q.priority],
  ['dueDate', 'Срок', (q) => (q.dueDate ? new Date(q.dueDate).getTime() : Infinity)],
  ['createdAt', 'Создано', (q) => new Date(q.createdAt).getTime()],
];

export function SpaceListPage() {
  const { t, locale } = useLocalization();
  const navigate = useNavigate();
  const { boardId } = useParams();
  const { board, issues, error, loading } = useBoardIssues(boardId);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ by: 'issueKey', dir: -1 });

  useEffect(() => { markOnboardingStep(boardId, 'list'); }, [boardId]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const getter = LIST_COLUMNS.find(([id]) => id === sort.by)[2];
    return issues
      .filter((q) => status === 'all' || q.columnId === status)
      .filter((q) => !needle || q.title.toLowerCase().includes(needle) || q.issueKey.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = getter(a); const y = getter(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [issues, query, status, sort]);

  return (
    <Shell title={t('Список')}>
      <div className="settings-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск по списку')} aria-label={t('Поиск по списку')} />
        </label>
        <select className="app-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Статус')}>
          <option value="all">{t('Все статусы')}</option>
          {(board?.columns || []).filter((c) => c.kind !== 5).map((c) => <option key={c.id} value={c.id}>{t(c.title)}</option>)}
        </select>
        <span className="sv-muted">{rows.length} {t('задач')}</span>
      </div>
      {error && <p className="settings-save-status is-error">{error}</p>}
      <div className="settings-table-wrap">
        <table className="settings-table sv-list">
          <thead>
            <tr>
              {LIST_COLUMNS.map(([id, label]) => (
                <th key={id} className={['assignee', 'createdAt', 'priority'].includes(id) ? 'hide-mobile' : ''}>
                  <button type="button" onClick={() => setSort((s) => ({ by: id, dir: s.by === id ? -s.dir : 1 }))} aria-sort={sort.by === id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                    {t(label)}
                    {sort.by === id && <NavIcon name="chevronDown" size={12} className={sort.dir > 0 ? '' : 'is-flipped'} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const overdue = q.dueDate && q.statusKind !== 3 && new Date(q.dueDate).getTime() < Date.now();
              return (
                <tr key={q.id} className="sv-row" onClick={() => navigate(`/board/${boardId}/issue/${q.id}`)}>
                  <td><IssueTypeIcon issueType={q.issueType} size={16} /></td>
                  <td><Link to={`/board/${boardId}/issue/${q.id}`} onClick={(e) => e.stopPropagation()}>{q.issueKey}</Link></td>
                  <td>{q.title}</td>
                  <td><StatusLozenge issue={q} /></td>
                  <td className="hide-mobile"><Person issue={q} /></td>
                  <td className="hide-mobile"><span className="sv-inline"><PriorityIcon priority={q.priority} size={14} />{t(getPriorityMeta(q.priority).label)}</span></td>
                  <td className={overdue ? 'sv-overdue' : ''}>{q.dueDate ? new Date(q.dueDate).toLocaleDateString(locale) : '—'}</td>
                  <td className="hide-mobile">{new Date(q.createdAt).toLocaleDateString(locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="settings-empty">{issues.length ? t('Нет задач, соответствующих фильтру.') : t('В разделе пока нет задач.')}</div>}
        {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
      </div>
    </Shell>
  );
}

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - shift);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function SpaceCalendarPage() {
  const { t, locale } = useLocalization();
  const { boardId } = useParams();
  const { issues, error, loading } = useBoardIssues(boardId);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });

  useEffect(() => { markOnboardingStep(boardId, 'calendar'); }, [boardId]);

  const days = monthMatrix(cursor.year, cursor.month);
  const byDay = useMemo(() => issues.filter((q) => q.dueDate).reduce((acc, q) => {
    const key = dayKey(new Date(q.dueDate));
    (acc[key] = acc[key] || []).push(q);
    return acc;
  }, {}), [issues]);
  const unscheduled = issues.filter((q) => !q.dueDate && q.statusKind !== 3).length;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));
  const move = (delta) => setCursor((c) => {
    const d = new Date(c.year, c.month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const todayKey = dayKey(new Date());

  return (
    <Shell
      title={t('Календарь')}
      actions={(
        <>
          <button type="button" className="app-btn" onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); }}>{t('Сегодня')}</button>
          <button type="button" className="app-icon-btn" aria-label={t('Предыдущий месяц')} onClick={() => move(-1)}><NavIcon name="chevronRight" className="is-flipped-h" /></button>
          <strong className="sv-month">{new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="app-icon-btn" aria-label={t('Следующий месяц')} onClick={() => move(1)}><NavIcon name="chevronRight" /></button>
        </>
      )}
    >
      {error && <p className="settings-save-status is-error">{error}</p>}
      {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
      <p className="sv-muted">{t('Задачи без срока')}: {unscheduled}</p>
      <div className="sv-calendar" role="grid">
        {weekdays.map((w) => <div key={w} className="sv-weekday" role="columnheader">{w}</div>)}
        {days.map((d) => {
          const items = byDay[dayKey(d)] || [];
          return (
            <div key={d.toISOString()} role="gridcell" className={`sv-day ${d.getMonth() !== cursor.month ? 'is-other' : ''} ${dayKey(d) === todayKey ? 'is-today' : ''}`}>
              <span className="sv-day-num">{d.getDate()}</span>
              {items.slice(0, 4).map((q) => (
                <Link key={q.id} to={`/board/${boardId}/issue/${q.id}`} className={`sv-event ${q.statusKind === 3 ? 'is-done' : ''}`} title={`${q.issueKey} ${q.title}`}>
                  <IssueTypeIcon issueType={q.issueType} size={12} />
                  <span>{q.title}</span>
                </Link>
              ))}
              {items.length > 4 && <span className="sv-more">+{items.length - 4}</span>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export function SpaceFeaturesPage({ mode }) {
  const { t } = useLocalization();
  const { boardId } = useParams();
  const [board, setBoard] = useState(null);
  const [features, setFeatures] = useState([]);
  const [access, setAccess] = useState('private');
  const [status, setStatus] = useState({ type: '', text: '' });

  useEffect(() => {
    boardsApi.getById(boardId).then((b) => {
      setBoard(b);
      setFeatures(spaceFeatures(b));
      setAccess(b.access || 'private');
    }).catch((e) => setStatus({ type: 'error', text: e.message }));
    if (mode === 'features') markOnboardingStep(boardId, 'features');
  }, [boardId, mode]);

  const save = async (patch) => {
    setStatus({ type: '', text: '…' });
    try {
      const updated = await boardsApi.update(boardId, patch);
      notifyBoardChanged({ id: boardId, features: updated.features, access: updated.access });
      setStatus({ type: 'ok', text: t('Сохранено') });
    } catch (e) {
      setStatus({ type: 'error', text: e.message || t('Не удалось сохранить') });
    }
  };

  const toggle = (feature) => {
    if (feature === 'board') return;
    const next = features.includes(feature) ? features.filter((f) => f !== feature) : [...features, feature];
    setFeatures(next);
    save({ features: next.join(',') });
  };

  if (!board) return <Shell title={t(mode === 'access' ? 'Доступ' : 'Функции')}>{status.text && <p className="settings-save-status is-error">{status.text}</p>}</Shell>;

  return (
    <Shell title={t(mode === 'access' ? 'Доступ' : 'Функции')}>
      <div className="settings-breadcrumbs">
        <Link to="/spaces">{t('Разделы')}</Link><span>/</span><Link to={`/board/${boardId}`}>{board.name}</Link><span>/</span><span>{t('Настройки раздела')}</span>
      </div>
      {mode === 'access' ? (
        <div className="sv-options">
          <p className="sv-muted">{t('Кто может находить этот раздел и работать в нём. Участники команды всегда имеют доступ по своей роли.')}</p>
          {ACCESS_LEVELS.map(([id, label, description]) => (
            <label key={id} className={`sv-option ${access === id ? 'is-selected' : ''}`}>
              <input type="radio" name="access" checked={access === id} onChange={() => { setAccess(id); save({ access: id }); }} />
              <span><strong>{t(label)}</strong><span className="sv-muted">{t(description)}</span></span>
            </label>
          ))}
        </div>
      ) : (
        <div className="sv-options">
          <p className="sv-muted">{t('Включите представления, которые нужны команде. Они появятся вкладками в разделе.')}</p>
          {FEATURE_TABS.map(([feature, , , icon, label]) => (
            <label key={feature} className={`sv-option ${features.includes(feature) ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={features.includes(feature)} disabled={feature === 'board'} onChange={() => toggle(feature)} />
              <span className="tpl-feature-icon"><NavIcon name={icon} size={16} /></span>
              <span><strong>{t(label)}</strong><span className="sv-muted">{t(FEATURE_DESCRIPTIONS[feature])}</span></span>
            </label>
          ))}
        </div>
      )}
      {status.text && <p className={`settings-save-status ${status.type === 'error' ? 'is-error' : ''}`} role="status">{status.text}</p>}
    </Shell>
  );
}
