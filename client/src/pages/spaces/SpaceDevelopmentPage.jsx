import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { spaceContent } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import './SpaceContent.css';

const METRICS = [
  ['completedThisWeek', 'Выполненные задачи', 'за эту неделю'],
  ['mergedThisWeek', 'Слитые pull request', 'за 7 дней'],
  ['commitsThisWeek', 'Коммиты', 'за 7 дней'],
  ['failedChecks', 'Упавшие проверки', 'по связанным задачам'],
  ['overdue', 'Задачи', 'просрочены'],
  ['reopened', 'Задачи', 'переоткрыты за 7 дней'],
  ['openBugs', 'Ошибки', 'открыты'],
  ['openPullRequests', 'Pull request', 'открыты'],
];

const TABS = [
  ['connections', 'Подключения'],
  ['pullRequests', 'Запросы pull'],
  ['branches', 'Ветки'],
  ['commits', 'Коммиты'],
  ['checks', 'Проверки'],
];

function LinkList({ items, boardId, t, language }) {
  if (!items?.length) return <p className="sc-muted sc-dev-empty">{t('Пока нет данных. Упоминайте ключ задачи (например, KAN-1) в названии ветки, коммита или pull request.')}</p>;
  return (
    <ul className="sc-dev-links">
      {items.map((item) => (
        <li key={item.id}>
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="sc-dev-link-title">{item.title}</a>
          {item.status && <span className={`settings-lozenge ${item.status === 'merged' || item.status === 'success' ? 'is-success' : item.status === 'failure' ? 'is-danger' : 'is-info'}`}>{item.status}</span>}
          <Link to={`/board/${boardId}/issue/${item.questId}`} className="sc-muted">{item.issueKey}</Link>
          <span className="sc-muted">{timeAgo(item.updatedAt, language)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SpaceDevelopmentPage() {
  const { boardId } = useParams();
  const { t, language } = useLocalization();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('connections');

  useEffect(() => {
    setData(null);
    spaceContent.development(boardId).then(setData).catch((e) => setError(e.message));
  }, [boardId]);

  if (!data) return <div className="sc-page">{error ? <p className="settings-save-status is-error">{error}</p> : <p className="settings-empty">{t('Загрузка...')}</p>}</div>;

  const connected = data.integrations.length > 0;
  const steps = [
    ['Управление исходным кодом', connected],
    ['Связь задач с кодом', data.pullRequests.length + data.branches.length + data.commits.length > 0],
    ['Проверки CI', data.checks.length > 0],
  ];

  return (
    <div className="sc-page sc-dev">
      <h2 className="sc-subhead">{t('Ключевые метрики')}</h2>
      <div className="sc-dev-metrics">
        {METRICS.map(([key, label, sub]) => (
          <div key={key} className="sc-dev-metric">
            <span>{t(label)}</span>
            <strong>{data.metrics[key] ?? 0}</strong>
            <span className="sc-muted">{t(sub)}</span>
          </div>
        ))}
      </div>

      <div className="sc-dev-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{t(label)}</button>
        ))}
      </div>

      <div className="sc-dev-layout">
        <div className="sc-dev-main">
          {tab === 'connections' && (
            <>
              <h3>{t('Управление исходным кодом')}</h3>
              <p className="sc-muted">{t('Привяжите репозиторий, чтобы автоматически сопоставлять ветки, коммиты и запросы pull с задачами.')}</p>
              <div className="sc-dev-cards">
                {data.integrations.map((repo) => (
                  <a key={repo.id} className="sc-dev-card is-connected" href={`https://github.com/${repo.owner}/${repo.name}`} target="_blank" rel="noopener noreferrer">
                    <NavIcon name="code" size={20} />
                    <strong>{repo.owner}/{repo.name}</strong>
                    <span className={`settings-lozenge ${repo.enabled ? 'is-success' : ''}`}>{t(repo.enabled ? 'Подключено' : 'Отключено')}</span>
                  </a>
                ))}
                <Link to={`/board/${boardId}/integrations`} className="sc-dev-card">
                  <NavIcon name="plus" size={20} />
                  <strong>{connected ? t('Подключить ещё репозиторий') : t('Подключить GitHub')}</strong>
                  <span className="sc-muted">{t('Настройки интеграций раздела')}</span>
                </Link>
              </div>
            </>
          )}
          {tab === 'pullRequests' && <LinkList items={data.pullRequests} boardId={boardId} t={t} language={language} />}
          {tab === 'branches' && <LinkList items={data.branches} boardId={boardId} t={t} language={language} />}
          {tab === 'commits' && <LinkList items={data.commits} boardId={boardId} t={t} language={language} />}
          {tab === 'checks' && <LinkList items={data.checks} boardId={boardId} t={t} language={language} />}
        </div>
        <aside className="sc-dev-steps">
          {steps.map(([label, done], index) => (
            <div key={label} className="sc-dev-step">
              <span className="sc-dev-step-num">{index + 1}</span>
              <span>{t(label)}</span>
              <span className={`settings-lozenge ${done ? 'is-success' : ''}`}>{t(done ? 'Настроено' : 'Не настроено')}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
