import React, { useCallback, useEffect, useState } from 'react';
import { search, savedFilters } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { Link } from '../i18n/navigation.jsx';
import './JiraPages.css';

const PAGE_SIZE = 25;

export default function IssueNavigatorPage() {
  const { t } = useLocalization();
  const [jql, setJql] = useState('');
  const [appliedJql, setAppliedJql] = useState('');
  const [issues, setIssues] = useState([]);
  const [filters, setFilters] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('updatedAt');
  const [direction, setDirection] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFilters = useCallback(() => {
    savedFilters.getAll().then((value) => setFilters(Array.isArray(value) ? value : value?.items || [])).catch(() => setFilters([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await search.issues({ jql: appliedJql, page, pageSize: PAGE_SIZE, sort, direction });
      setIssues(Array.isArray(result) ? result : result?.items || []);
      setTotal(Array.isArray(result) ? result.length : result?.total || 0);
    } catch (e) {
      setError(e.message || t('Не удалось выполнить поиск.'));
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, [appliedJql, direction, page, sort, t]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { load(); }, [load]);

  const apply = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedJql(jql.trim());
  };
  const saveFilter = async () => {
    const name = window.prompt(t('Название фильтра'));
    if (!name) return;
    await savedFilters.create({ name, jql: appliedJql, shared: false });
    loadFilters();
  };
  const changeSort = (field) => {
    if (sort === field) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDirection('asc'); }
    setPage(1);
  };

  return (
    <div className="page jira-page">
      <div className="jira-header">
        <h1>{t('Навигатор задач')}</h1>
        <button className="jira-button" type="button" onClick={saveFilter}>{t('Сохранить фильтр')}</button>
      </div>
      <form className="jira-toolbar" onSubmit={apply}>
        <input aria-label={t('JQL запрос')} value={jql} onChange={(e) => setJql(e.target.value)} placeholder={t('project = KAN AND status != Done ORDER BY updated DESC')} />
        <select aria-label={t('Сохранённые фильтры')} value="" onChange={(e) => {
          const filter = filters.find((item) => String(item.id) === e.target.value);
          if (filter) { setJql(filter.jql || ''); setAppliedJql(filter.jql || ''); setPage(1); }
        }}>
          <option value="">{t('Сохранённые и общие фильтры')}</option>
          {filters.map((filter) => <option key={filter.id} value={filter.id}>{filter.name}{filter.shared ? ` · ${t('общий')}` : ''}</option>)}
        </select>
        <button className="jira-button jira-button-primary" type="submit">{t('Искать')}</button>
      </form>
      {error && <p className="jira-error" role="alert">{error}</p>}
      {loading ? <div className="jira-state">{t('Загрузка...')}</div> : issues.length === 0 ? (
        <div className="jira-state">{t('Задачи не найдены.')}</div>
      ) : (
        <>
          <div className="jira-table-wrap">
            <table className="jira-table">
              <thead><tr>
                <th><button type="button" onClick={() => changeSort('issueKey')}>{t('Ключ')}</button></th>
                <th><button type="button" onClick={() => changeSort('title')}>{t('Название')}</button></th>
                <th>{t('Статус')}</th><th>{t('Исполнитель')}</th>
                <th><button type="button" onClick={() => changeSort('updatedAt')}>{t('Обновлено')}</button></th>
              </tr></thead>
              <tbody>{issues.map((issue) => <tr key={issue.id}>
                <td data-label={t('Ключ')}><Link to={`/board/${issue.boardId}/issue/${issue.id}`}>{issue.issueKey}</Link></td>
                <td data-label={t('Название')}>{issue.title}</td>
                <td data-label={t('Статус')}>{issue.statusName || issue.columnName || '—'}</td>
                <td data-label={t('Исполнитель')}>{issue.assigneeName || issue.assignees?.map((a) => a.displayName).join(', ') || '—'}</td>
                <td data-label={t('Обновлено')}>{issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="jira-pagination">
            <button className="jira-button" type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>{t('Назад')}</button>
            <span>{page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button className="jira-button" type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)}>{t('Далее')}</button>
          </div>
        </>
      )}
    </div>
  );
}
