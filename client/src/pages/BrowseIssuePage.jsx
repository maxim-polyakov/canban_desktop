import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { quests } from '../api.js';

/** Permanent issue link like Jira's /browse/KEY-1: resolves the key and opens the issue in its space. */
export default function BrowseIssuePage() {
  const { issueKey } = useParams();
  const { t } = useLocalization();
  const [target, setTarget] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setTarget(null);
    setMissing(false);
    quests.resolveKey(issueKey)
      .then((found) => { if (alive) setTarget(found); })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [issueKey]);

  if (target) return <Navigate to={`/board/${target.boardId}/issue/${target.questId}`} replace />;
  if (missing) {
    return (
      <div className="page">
        <h1>{t('Задача не найдена')}</h1>
        <p>{t('Задачи ${issueKey} нет или у вас нет к ней доступа.', { issueKey: String(issueKey).toUpperCase() })}</p>
        <Link to="/issues">{t('Перейти к поиску задач')}</Link>
      </div>
    );
  }
  return <div className="page">{t('Загрузка...')}</div>;
}
