import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import { quests, questLinks, releases } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

export default function RoadmapPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const [issues, setIssues] = useState([]);
  const [versions, setVersions] = useState([]);
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [issueResult, releaseResult] = await Promise.all([quests.filter(boardId, {}), releases.getByBoard(boardId)]);
      const list = Array.isArray(issueResult) ? issueResult : [];
      setIssues(list);
      setVersions(Array.isArray(releaseResult) ? releaseResult : releaseResult?.items || []);
      const linked = await Promise.all(list.slice(0, 100).map((issue) => questLinks.get(issue.id).catch(() => [])));
      setLinks(linked.flat());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [boardId]);
  useEffect(() => { load(); }, [load]);
  const bounds = useMemo(() => {
    const dates = issues.flatMap((item) => [item.startDate, item.dueDate]).filter(Boolean).map(Date.parse);
    const min = dates.length ? Math.min(...dates) : Date.now();
    const max = dates.length ? Math.max(...dates) : min + 86400000 * 30;
    return { min, span: Math.max(86400000, max - min) };
  }, [issues]);
  return <div className="page jira-page">
    <div className="jira-header"><h1>{t('Roadmap и зависимости')}</h1><button className="jira-button" type="button" onClick={load}>{t('Обновить')}</button></div>
    {error && <p className="jira-error">{error}</p>}
    {loading ? <div className="jira-state">{t('Загрузка...')}</div> : issues.length === 0 ? <div className="jira-state">{t('Нет задач для roadmap.')}</div> : (
      <div className="jira-card jira-timeline">{issues.map((issue) => {
        const start = Date.parse(issue.startDate || issue.createdAt || bounds.min);
        const end = Date.parse(issue.dueDate || issue.updatedAt || start + 86400000);
        const left = Math.max(0, Math.min(95, ((start - bounds.min) / bounds.span) * 100));
        const width = Math.max(2, Math.min(100 - left, ((end - start) / bounds.span) * 100));
        const blockers = links.filter((link) => link.sourceQuestId === issue.id && /block/i.test(link.type || link.linkType || ''));
        return <div className="jira-timeline-row" key={issue.id}>
          <span><strong>{issue.issueKey}</strong> {issue.title}{blockers.length ? ` · ⛔ ${blockers.length}` : ''}</span>
          <div className="jira-timeline-track"><span className="jira-timeline-bar" style={{ left: `${left}%`, width: `${width}%` }} /></div>
        </div>;
      })}</div>
    )}
    <section className="jira-card" style={{ marginTop: '.8rem' }}><h2>{t('Релизы')}</h2>
      {versions.length === 0 ? <p>{t('Нет запланированных релизов.')}</p> : <ul className="jira-link-list">{versions.map((version) => <li key={version.id}>{version.name} · {version.releaseDate ? new Date(version.releaseDate).toLocaleDateString() : t('дата не задана')}</li>)}</ul>}
    </section>
  </div>;
}
