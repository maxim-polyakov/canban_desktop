import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { assets as assetsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import '../pages/assets/Assets.css';

/** Jira "Assets" issue field: objects linked to the work item, with search-and-link. */
export default function IssueAssetsField({ questId }) {
  const { t } = useLocalization();
  const [linked, setLinked] = useState([]);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => assetsApi.getForQuest(questId).then(setLinked).catch(() => setLinked([])), [questId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const text = query.trim();
    if (!text) { setOptions([]); return undefined; }
    const timer = setTimeout(() => {
      assetsApi.search({ aql: text, pageSize: 8 }).then((r) => setOptions(r.items || [])).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const link = async (objectId) => {
    setError('');
    try {
      await assetsApi.linkIssue(objectId, { questId });
      setQuery('');
      setOptions([]);
      load();
    } catch (e) { setError(e.message); }
  };
  const unlink = async (objectId) => {
    setError('');
    try { await assetsApi.unlinkIssue(objectId, questId); load(); } catch (e) { setError(e.message); }
  };
  const linkedIds = new Set(linked.map((o) => o.id));

  return (
    <section className="issue-drawer-section">
      <h4>{t('Активы')}</h4>
      <div className="issue-assets-picker">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Найти объект по названию, ключу или AQL')} aria-label={t('Найти объект')} />
        {options.length > 0 && (
          <ul className="issue-assets-options" role="listbox">
            {options.filter((o) => !linkedIds.has(o.id)).map((o) => (
              <li key={o.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => link(o.id)}>
                  <NavIcon name={o.typeIcon || 'box'} size={14} /> {o.label} <span className="issue-assets-key">{o.key}</span> <span className="issue-assets-type">{o.typeName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="issue-drawer-error" role="alert">{error}</p>}
      {linked.length === 0 ? <p className="issue-drawer-empty">{t('Активы не привязаны.')}</p> : (
        <ul className="issue-drawer-compact-list issue-assets-list">
          {linked.map((o) => (
            <li key={o.id}>
              <NavIcon name={o.typeIcon || 'box'} size={14} />
              <Link to={`/assets/object/${o.id}`}>{o.label}</Link>
              <span className="issue-assets-key">{o.key}</span>
              <button type="button" aria-label={t('Отвязать')} title={t('Отвязать')} onClick={() => unlink(o.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
