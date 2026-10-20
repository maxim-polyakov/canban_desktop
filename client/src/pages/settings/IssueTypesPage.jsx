import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { search } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { getIssueTypeMeta, IssueTypeIcon } from '../../components/IssueIcons.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import { CustomIssueTypesSection, TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';

export const ISSUE_TYPE_ROWS = [
  { type: 0, jql: 'Epic', level: 1, description: 'Большой объём работы, который объединяет истории, задачи и ошибки.' },
  { type: 1, jql: 'Story', level: 0, description: 'Функциональность или требование, сформулированное с точки зрения пользователя.' },
  { type: 2, jql: 'Task', level: 0, description: 'Небольшая отдельная единица работы.' },
  { type: 3, jql: 'Bug', level: 0, description: 'Проблема, которая мешает работе или нарушает функциональность.' },
  { type: 4, jql: 'Subtask', level: -1, description: 'Небольшая часть работы, входящая в состав другой задачи.' },
];

const LEVEL_LABELS = { 1: 'Эпик', 0: 'Стандартный', '-1': 'Подзадача' };

export default function IssueTypesPage() {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState({});
  const { catalog, reload } = useIssueCatalog();
  const [teamId, setTeamId, team] = useTeamSelection(catalog?.teams);

  useEffect(() => {
    let cancelled = false;
    ISSUE_TYPE_ROWS.forEach((row) => {
      search.issues({ jql: `type = ${row.jql}`, pageSize: 1 })
        .then((result) => { if (!cancelled) setCounts((c) => ({ ...c, [row.type]: result?.total ?? 0 })); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ISSUE_TYPE_ROWS.filter((row) => !needle
      || t(getIssueTypeMeta(row.type).label).toLowerCase().includes(needle)
      || row.jql.toLowerCase().includes(needle));
  }, [query, t]);

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], ['Типы задач']]}
      title={t('Типы задач')}
      description={t('Типы задач определяют, какую работу можно отслеживать в разделах, и их место в иерархии: эпики объединяют стандартные задачи, а подзадачи входят в стандартные.')}
    >
      <div className="settings-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Фильтр по имени')} aria-label={t('Фильтр по имени')} />
        </label>
      </div>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Имя')}</th>
              <th className="hide-mobile">{t('Описание')}</th>
              <th>{t('Уровень иерархии')}</th>
              <th className="is-narrow">{t('Задачи')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = t(getIssueTypeMeta(row.type).label);
              return (
                <tr key={row.type}>
                  <td><span className="settings-table-name"><IssueTypeIcon issueType={row.type} size={20} />{label}</span></td>
                  <td className="hide-mobile">{t(row.description)}</td>
                  <td><span className="settings-lozenge">{row.level} · {t(LEVEL_LABELS[row.level])}</span></td>
                  <td className="is-narrow">
                    <Link to={`/issues?jql=${encodeURIComponent(`type = ${row.jql}`)}`}>{counts[row.type] ?? '…'}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="settings-empty">{t('Нет типов задач, соответствующих фильтру.')}</p>}
      </div>
      {catalog?.teams?.length > 0 && (
        <>
          <div className="settings-toolbar"><TeamPicker teams={catalog.teams} value={teamId} onChange={setTeamId} /></div>
          <CustomIssueTypesSection catalog={catalog} teamId={teamId} canManage={!!team?.canManage} onChanged={reload} />
        </>
      )}
    </SettingsShell>
  );
}
