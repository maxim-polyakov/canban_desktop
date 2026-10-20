import React, { useCallback, useEffect, useRef, useState } from 'react';
import { search, savedFilters, spaces as spacesApi, people as peopleApi } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import NavIcon from '../components/NavIcons.jsx';
import FilterSubscriptionsDialog from '../components/FilterSubscriptionsDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { IssueTypeIcon, PriorityIcon, getIssueTypeMeta, getPriorityMeta } from '../components/IssueIcons.jsx';
import { isFilterStarred, toggleStarredFilter, useNavHistory } from '../utils/navHistory.js';
import {
  buildJql, defaultFilterJql, emptyCriteria, getDefaultFilter, ISSUE_TYPES, parseBasicJql, periodLabel,
  RELATIVE_PERIODS, STATUS_CATEGORIES,
} from '../utils/issueFilters.js';
import { loadIssueCatalog } from '../utils/issueConfig.js';
import './IssueNavigator.css';

const PAGE_SIZE = 50;

function useOutsideClose(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  return ref;
}

function Dropdown({ label, active, summary, children, onClear }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <span className="inav-chip-wrap" ref={ref}>
      <button type="button" className={`inav-chip ${active ? 'is-active' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {active && summary ? <><b>{label}</b><span className="inav-chip-op">=</span><span>{summary}</span></> : label}
        <NavIcon name="chevronDown" size={12} />
      </button>
      {active && onClear && (
        <button type="button" className="inav-chip-clear" aria-label={label} onClick={onClear}><NavIcon name="close" size={10} /></button>
      )}
      {open && <div className="inav-popover" role="dialog" aria-label={label}>{typeof children === 'function' ? children(close) : children}</div>}
    </span>
  );
}

function CheckList({ options, selected, onChange, searchable, placeholder }) {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <>
      {searchable && <input className="inav-popover-search" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />}
      <div className="inav-checklist">
        {visible.map((o) => (
          <label key={o.id} className="inav-check">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.icon}
            <span>{o.label}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="inav-muted">{t('Ничего не найдено')}</p>}
      </div>
    </>
  );
}

function Person({ name, avatarUrl, empty }) {
  const { t } = useLocalization();
  if (empty) return <span className="inav-person is-empty"><span className="inav-avatar"><NavIcon name="person" size={12} /></span>{t('Не назначено')}</span>;
  return (
    <span className="inav-person">
      {avatarUrl ? <img className="inav-avatar" src={avatarUrl} alt="" /> : <span className="inav-avatar">{(name || '?').slice(0, 1).toUpperCase()}</span>}
      <span>{name}</span>
    </span>
  );
}

const STATUS_CLASS = { new: 'is-new', indeterminate: 'is-progress', done: 'is-done' };

export default function IssueNavigatorPage() {
  const { t, locale } = useLocalization();
  const location = useLocation();
  const navigate = useNavigate();
  const { viewedIssues } = useNavHistory();
  const params = new URLSearchParams(location.search);
  const filterParam = params.get('filter') || '';
  const jqlParam = params.get('jql');
  const defaultFilter = getDefaultFilter(filterParam);

  const [saved, setSaved] = useState(null);
  const [spaceList, setSpaceList] = useState([]);
  const [peopleList, setPeopleList] = useState([]);
  const [customTypes, setCustomTypes] = useState([]);
  useEffect(() => { loadIssueCatalog().then((c) => setCustomTypes(c?.types || [])).catch(() => {}); }, []);
  const wantsSaved = !defaultFilter && Boolean(filterParam);
  const savedFilter = wantsSaved ? (saved || []).find((f) => f.id === filterParam) : null;
  const { user } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const missingFilter = wantsSaved && saved !== null && !savedFilter;

  let sourceJql = jqlParam ?? '';
  if (defaultFilter) sourceJql = defaultFilterJql(defaultFilter, viewedIssues);
  else if (wantsSaved) sourceJql = savedFilter ? savedFilter.jql || '' : null;

  const [mode, setMode] = useState('basic');
  const [criteria, setCriteria] = useState(emptyCriteria());
  const [jqlText, setJqlText] = useState('');
  const [appliedJql, setAppliedJql] = useState(null);
  const [result, setResult] = useState({ items: [], details: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    savedFilters.getAll().then((v) => setSaved(Array.isArray(v) ? v : v?.items || [])).catch(() => setSaved([]));
  }, []);
  useEffect(() => {
    spacesApi.getMine().then((v) => setSpaceList(Array.isArray(v) ? v : [])).catch(() => setSpaceList([]));
    peopleApi.workWith().then((v) => setPeopleList(Array.isArray(v) ? v : [])).catch(() => setPeopleList([]));
  }, []);

  useEffect(() => {
    if (sourceJql == null) { setAppliedJql(null); return; }
    const parsed = parseBasicJql(sourceJql);
    setCriteria(parsed || emptyCriteria());
    setMode(parsed ? 'basic' : 'jql');
    setJqlText(sourceJql);
    setAppliedJql(sourceJql);
    setPage(1);
    setNotice('');
  }, [sourceJql]);

  const load = useCallback(async () => {
    if (appliedJql == null) { setLoading(!missingFilter); return; }
    setLoading(true);
    setError('');
    try {
      const value = await search.issues({ jql: appliedJql, page, pageSize: PAGE_SIZE });
      setResult({ items: value?.items || [], details: value?.details || [], total: value?.total || 0 });
    } catch (e) {
      setError(e.message || t('Не удалось выполнить поиск.'));
      setResult({ items: [], details: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [appliedJql, page, t, missingFilter]);

  useEffect(() => { load(); }, [load]);

  const updateCriteria = (patch) => {
    const next = { ...criteria, ...patch };
    setCriteria(next);
    const jql = buildJql(next);
    setJqlText(jql);
    setAppliedJql(jql);
    setPage(1);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'jql') { setJqlText(appliedJql ?? ''); setMode('jql'); return; }
    const parsed = parseBasicJql(jqlText);
    if (!parsed) { setNotice(t('Этот запрос слишком сложен для базового режима. Измените его в JQL.')); return; }
    setNotice('');
    setCriteria(parsed);
    setAppliedJql(buildJql(parsed));
    setMode('basic');
  };

  const runJql = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedJql(jqlText.trim());
  };

  const sortBy = (field) => {
    const current = (mode === 'basic' ? criteria.order : /ORDER\s+BY\s+(.+)$/i.exec(appliedJql || '')?.[1] || '').trim();
    const [currentField, currentDir] = current.split(/[\s,]+/);
    const dir = currentField?.toLowerCase() === field.toLowerCase() && (currentDir || 'ASC').toUpperCase() === 'DESC' ? 'ASC' : 'DESC';
    if (mode === 'basic') { updateCriteria({ order: `${field} ${dir}` }); return; }
    const where = (appliedJql || '').replace(/\s*ORDER\s+BY\s+.+$/i, '').trim();
    const jql = [where, `ORDER BY ${field} ${dir}`].filter(Boolean).join(' ');
    setJqlText(jql);
    setAppliedJql(jql);
  };
  const sortField = ((mode === 'basic' ? criteria.order : /ORDER\s+BY\s+(.+)$/i.exec(appliedJql || '')?.[1]) || '').split(/[\s,]+/);
  const sortIcon = (field) => (sortField[0]?.toLowerCase() === field.toLowerCase()
    ? <NavIcon name={(sortField[1] || 'ASC').toUpperCase() === 'DESC' ? 'arrowDown' : 'arrowUp'} size={12} /> : null);

  const isDirty = (appliedJql ?? '') !== sourceJql;
  const title = defaultFilter ? t(defaultFilter.name) : savedFilter ? savedFilter.name : t('Поиск задач');
  const starId = defaultFilter ? defaultFilter.id : savedFilter?.id;
  const starred = starId ? isFilterStarred(starId) : false;

  const saveAsNew = async (suggested) => {
    const name = window.prompt(t('Название фильтра'), suggested || '');
    if (!name?.trim()) return;
    try {
      const created = await savedFilters.create({ name: name.trim(), jql: appliedJql || '', shared: false });
      setSaved((list) => [...(list || []), created]);
      navigate(`/issues?filter=${created.id}`);
    } catch (e) {
      setError(e.message || t('Не удалось сохранить фильтр.'));
    }
  };
  const saveExisting = async () => {
    if (!savedFilter) return;
    try {
      const updated = await savedFilters.update(savedFilter.id, { name: savedFilter.name, jql: appliedJql || '', boardId: savedFilter.boardId, shared: savedFilter.shared });
      setSaved((list) => (list || []).map((f) => (f.id === updated.id ? updated : f)));
    } catch (e) {
      setError(e.message || t('Не удалось сохранить фильтр.'));
    }
  };
  const reset = () => {
    const parsed = parseBasicJql(sourceJql);
    setCriteria(parsed || emptyCriteria());
    setJqlText(sourceJql);
    setAppliedJql(sourceJql);
    setPage(1);
  };

  const detailsById = new Map(result.details.map((d) => [d.id, d]));
  const fmtDate = (value) => (value ? new Date(value).toLocaleString(locale || undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

  const spaceOptions = spaceList.map((s) => ({ id: s.id, label: s.name }));
  const assigneeOptions = [
    { id: 'currentUser', label: t('Текущий пользователь') },
    { id: 'empty', label: t('Не назначено') },
    ...peopleList.map((p) => ({ id: p.id, label: p.displayName || p.email })),
  ];
  const typeOptions = [
    ...ISSUE_TYPES.map((name, i) => ({ id: name, label: t(getIssueTypeMeta(i).label), icon: <IssueTypeIcon issueType={i} size={14} /> })),
    ...[...new Set(customTypes.map((type) => type.name))].map((name) => {
      const type = customTypes.find((x) => x.name === name);
      return { id: name, label: name, icon: <IssueTypeIcon issueType={type.baseType} typeId={type.id} size={14} /> };
    }),
  ];
  const statusOptions = STATUS_CATEGORIES.map((s) => ({ id: s.id, label: t(s.label) }));
  const summarize = (options, selected) => {
    const first = options.find((o) => o.id === selected[0])?.label || selected[0];
    return selected.length > 1 ? `${first} +${selected.length - 1}` : first;
  };
  const periodChip = (field, label) => (
    <Dropdown key={field} label={label} active={Boolean(criteria[field])} summary={periodLabel(criteria[field]) && t(periodLabel(criteria[field]))} onClear={() => updateCriteria({ [field]: '' })}>
      {(close) => (
        <div className="inav-checklist">
          {RELATIVE_PERIODS.map((p) => (
            <label key={p.id} className="inav-check">
              <input type="radio" name={field} checked={criteria[field] === p.id} onChange={() => { updateCriteria({ [field]: p.id }); close(); }} />
              <span>{t(p.label)}</span>
            </label>
          ))}
        </div>
      )}
    </Dropdown>
  );
  const extraFields = [
    { id: 'resolution', label: t('Решение'), on: criteria.resolution === 'unresolved', enable: () => updateCriteria({ resolution: 'unresolved' }) },
    { id: 'reporter', label: t('Автор'), on: criteria.reporter === 'currentUser', enable: () => updateCriteria({ reporter: 'currentUser' }) },
    { id: 'voter', label: t('Голосовал я'), on: criteria.voter === 'currentUser', enable: () => updateCriteria({ voter: 'currentUser' }) },
    { id: 'watcher', label: t('Наблюдаю'), on: criteria.watcher === 'currentUser', enable: () => updateCriteria({ watcher: 'currentUser' }) },
    { id: 'created', label: t('Создано'), on: Boolean(criteria.created), enable: () => updateCriteria({ created: '-1w' }) },
    { id: 'resolved', label: t('Решено'), on: Boolean(criteria.resolved), enable: () => updateCriteria({ resolved: '-1w' }) },
    { id: 'updated', label: t('Обновлено'), on: Boolean(criteria.updated), enable: () => updateCriteria({ updated: '-1w' }) },
  ];

  return (
    <div className="page inav-page">
      <div className="inav-header">
        <div className="inav-title">
          <h1>{title}</h1>
          {starId && (
            <button type="button" className={`inav-star ${starred ? 'is-starred' : ''}`}
              aria-label={starred ? t('Убрать из отмеченных') : t('Отметить')} title={starred ? t('Убрать из отмеченных') : t('Отметить')}
              onClick={() => toggleStarredFilter({ id: starId, name: defaultFilter ? defaultFilter.name : savedFilter.name, isDefault: Boolean(defaultFilter) })}>
              <NavIcon name="star" size={16} filled={starred} />
            </button>
          )}
        </div>
        <div className="inav-actions">
          {savedFilter && isDirty && <button type="button" className="inav-btn inav-btn-primary" onClick={saveExisting}>{t('Сохранить')}</button>}
          <button type="button" className="inav-btn" onClick={() => saveAsNew(savedFilter || defaultFilter ? `${title} (${t('копия')})` : '')}>
            {savedFilter || defaultFilter ? t('Сохранить как') : t('Сохранить фильтр')}
          </button>
          {savedFilter && <button type="button" className="inav-btn" onClick={() => setSubscribing(true)}>{t('Подписки')}</button>}
          <Link className="inav-btn" to="/filters">{t('Все фильтры')}</Link>
        </div>
      </div>
      {subscribing && savedFilter && (
        <FilterSubscriptionsDialog filter={savedFilter} currentUserId={user?.id} onClose={() => setSubscribing(false)} />
      )}

      <div className="inav-toolbar">
        <div className="inav-segment" role="tablist" aria-label={t('Режим поиска')}>
          <button type="button" role="tab" aria-selected={mode === 'basic'} className={mode === 'basic' ? 'is-active' : ''} onClick={() => switchMode('basic')}>{t('Базовый')}</button>
          <button type="button" role="tab" aria-selected={mode === 'jql'} className={mode === 'jql' ? 'is-active' : ''} onClick={() => switchMode('jql')}>JQL</button>
        </div>
        {mode === 'basic' ? (
          <>
            <label className="inav-search">
              <NavIcon name="search" size={14} />
              <input type="search" value={criteria.text} placeholder={t('Поиск работы')} aria-label={t('Поиск работы')}
                onChange={(e) => setCriteria({ ...criteria, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') updateCriteria({ text: criteria.text }); }}
                onBlur={() => { if (buildJql(criteria) !== appliedJql) updateCriteria({ text: criteria.text }); }} />
            </label>
            <Dropdown label={t('Раздел')} active={criteria.spaces.length > 0} summary={summarize(spaceOptions, criteria.spaces)} onClear={() => updateCriteria({ spaces: [] })}>
              <CheckList options={spaceOptions} selected={criteria.spaces} onChange={(spaces) => updateCriteria({ spaces })} searchable placeholder={t('Поиск разделов')} />
            </Dropdown>
            <Dropdown label={t('Исполнитель')} active={criteria.assignees.length > 0} summary={summarize(assigneeOptions, criteria.assignees)} onClear={() => updateCriteria({ assignees: [] })}>
              <CheckList options={assigneeOptions} selected={criteria.assignees} onChange={(assignees) => updateCriteria({ assignees })} searchable placeholder={t('Поиск пользователей')} />
            </Dropdown>
            <Dropdown label={t('Тип')} active={criteria.types.length > 0} summary={summarize(typeOptions, criteria.types)} onClear={() => updateCriteria({ types: [] })}>
              <CheckList options={typeOptions} selected={criteria.types} onChange={(types) => updateCriteria({ types })} />
            </Dropdown>
            <Dropdown label={t('Статус')} active={criteria.statuses.length > 0} summary={summarize(statusOptions, criteria.statuses)} onClear={() => updateCriteria({ statuses: [] })}>
              <CheckList options={statusOptions} selected={criteria.statuses} onChange={(statuses) => updateCriteria({ statuses })} />
            </Dropdown>
            {criteria.resolution === 'unresolved' && (
              <span className="inav-chip-wrap"><span className="inav-chip is-active"><b>{t('Решение')}</b><span className="inav-chip-op">=</span><span>{t('Нет решения')}</span></span>
                <button type="button" className="inav-chip-clear" aria-label={t('Решение')} onClick={() => updateCriteria({ resolution: '' })}><NavIcon name="close" size={10} /></button></span>
            )}
            {criteria.reporter === 'currentUser' && (
              <span className="inav-chip-wrap"><span className="inav-chip is-active"><b>{t('Автор')}</b><span className="inav-chip-op">=</span><span>{t('Текущий пользователь')}</span></span>
                <button type="button" className="inav-chip-clear" aria-label={t('Автор')} onClick={() => updateCriteria({ reporter: '' })}><NavIcon name="close" size={10} /></button></span>
            )}
            {['voter', 'watcher'].filter((field) => criteria[field] === 'currentUser').map((field) => {
              const label = field === 'voter' ? t('Голосовал') : t('Наблюдатель');
              return (<span key={field} className="inav-chip-wrap"><span className="inav-chip is-active"><b>{label}</b><span className="inav-chip-op">=</span><span>{t('Текущий пользователь')}</span></span>
                <button type="button" className="inav-chip-clear" aria-label={label} onClick={() => updateCriteria({ [field]: '' })}><NavIcon name="close" size={10} /></button></span>);
            })}
            {criteria.created && periodChip('created', t('Создано'))}
            {criteria.resolved && periodChip('resolved', t('Решено'))}
            {criteria.updated && periodChip('updated', t('Обновлено'))}
            {Array.isArray(criteria.keys) && (
              <span className="inav-chip-wrap"><span className="inav-chip is-active" title={criteria.keys.join(', ')}><b>{t('Ключ')}</b>{criteria.keys.length > 0 && <span className="inav-chip-count">{criteria.keys.length}</span>}</span>
                <button type="button" className="inav-chip-clear" aria-label={t('Ключ')} onClick={() => updateCriteria({ keys: null })}><NavIcon name="close" size={10} /></button></span>
            )}
            {extraFields.some((f) => !f.on) && (
              <Dropdown label={t('Другие фильтры')}>
                {(close) => (
                  <div className="inav-checklist">
                    {extraFields.filter((f) => !f.on).map((f) => (
                      <button key={f.id} type="button" className="inav-menu-item" onClick={() => { f.enable(); close(); }}>{f.label}</button>
                    ))}
                  </div>
                )}
              </Dropdown>
            )}
            {isDirty && <button type="button" className="inav-link" onClick={reset}>{t('Сбросить фильтры')}</button>}
          </>
        ) : (
          <form className="inav-jql" onSubmit={runJql}>
            <input value={jqlText} onChange={(e) => setJqlText(e.target.value)} aria-label={t('JQL запрос')}
              placeholder="project = KAN AND statusCategory != Done ORDER BY updated DESC" spellCheck={false} />
            <button type="submit" className="inav-btn inav-btn-primary">{t('Искать')}</button>
            {isDirty && <button type="button" className="inav-link" onClick={reset}>{t('Сбросить фильтры')}</button>}
          </form>
        )}
      </div>
      {notice && <p className="inav-notice" role="status">{notice}</p>}
      {missingFilter && <p className="inav-error" role="alert">{t('Фильтр не найден или у вас нет к нему доступа.')}</p>}
      {error && <p className="inav-error" role="alert">{error}</p>}

      <div className="inav-table-card">
        <div className="inav-table-scroll">
          <table className="inav-table">
            <thead>
              <tr>
                <th className="is-wide"><button type="button" onClick={() => sortBy('key')}>{t('Задачи')}{sortIcon('key')}</button></th>
                <th><button type="button" onClick={() => sortBy('assignee')}>{t('Исполнитель')}{sortIcon('assignee')}</button></th>
                <th>{t('Автор')}</th>
                <th><button type="button" onClick={() => sortBy('priority')}>{t('Приоритет')}{sortIcon('priority')}</button></th>
                <th><button type="button" onClick={() => sortBy('status')}>{t('Статус')}{sortIcon('status')}</button></th>
                <th>{t('Решение')}</th>
                <th><button type="button" onClick={() => sortBy('created')}>{t('Создано')}{sortIcon('created')}</button></th>
                <th><button type="button" onClick={() => sortBy('updated')}>{t('Обновлено')}{sortIcon('updated')}</button></th>
                <th className="is-number"><button type="button" onClick={() => sortBy('votes')}>{t('Голоса')}{sortIcon('votes')}</button></th>
              </tr>
            </thead>
            {!loading && result.items.length > 0 && (
              <tbody>
                {result.items.map((issue) => {
                  const d = detailsById.get(issue.id) || {};
                  const assignee = issue.assignees?.[0];
                  return (
                    <tr key={issue.id}>
                      <td className="is-wide">
                        <span className="inav-issue">
                          <IssueTypeIcon issueType={issue.issueType} typeId={issue.issueTypeId} size={16} />
                          <Link to={`/board/${issue.boardId}/issue/${issue.id}`} className="inav-key">{issue.issueKey}</Link>
                          <span className="inav-summary" title={issue.title}>{issue.title}</span>
                        </span>
                      </td>
                      <td>{assignee || issue.assigneeName
                        ? <Person name={assignee?.displayName || issue.assigneeName} avatarUrl={assignee?.avatarUrl || issue.assigneeAvatarUrl} />
                        : <Person empty />}</td>
                      <td>{d.reporterName ? <Person name={d.reporterName} avatarUrl={d.reporterAvatarUrl} /> : <span className="inav-muted">—</span>}</td>
                      <td><span className="inav-priority"><PriorityIcon priority={issue.priority} size={14} />{t(getPriorityMeta(issue.priority).label)}</span></td>
                      <td><span className={`inav-status ${STATUS_CLASS[d.statusCategory] || ''}`}>{d.statusName || '—'}</span></td>
                      <td>{issue.completedAt ? t('Готово') : t('Не решено')}</td>
                      <td className="is-date">{fmtDate(issue.createdAt)}</td>
                      <td className="is-date">{fmtDate(d.updatedAt || issue.createdAt)}</td>
                      <td className="is-number">{d.votes ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
          {loading && <div className="inav-state">{t('Загрузка...')}</div>}
          {!loading && result.items.length === 0 && (
            <div className="inav-empty">
              <h2>{t('Здесь пока нет задач')}</h2>
              <p>{t('У вас нет задач, или существующие задачи не соответствуют текущим фильтрам.')}</p>
            </div>
          )}
        </div>
        {!loading && result.total > 0 && (
          <div className="inav-footer">
            {result.total > PAGE_SIZE && (
              <button type="button" className="inav-icon-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label={t('Назад')}><NavIcon name="chevronLeft" size={14} /></button>
            )}
            <span>{t('${from}–${to} из ${total}', {
              from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, result.total), total: result.total,
            })}</span>
            {result.total > PAGE_SIZE && (
              <button type="button" className="inav-icon-btn" disabled={page * PAGE_SIZE >= result.total} onClick={() => setPage((p) => p + 1)} aria-label={t('Далее')}><NavIcon name="chevronRight" size={14} /></button>
            )}
            <button type="button" className="inav-icon-btn" onClick={load} aria-label={t('Обновить')} title={t('Обновить')}><NavIcon name="refresh" size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
