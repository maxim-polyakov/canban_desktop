import React, { useCallback, useEffect, useState } from 'react';
import { audit } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';

export const AUDIT_CATEGORIES = [
  ['auth', 'Вход и API-токены'],
  ['user', 'Профили пользователей'],
  ['audit', 'Журнал аудита'],
  ['team', 'Команды'],
  ['member', 'Участники'],
  ['group', 'Группы'],
  ['space', 'Пространства'],
  ['workflow', 'Workflow'],
  ['issueconfig', 'Типы и поля задач'],
  ['issue', 'Задачи'],
  ['sprint', 'Спринты'],
  ['component', 'Компоненты'],
  ['release', 'Релизы'],
  ['automation', 'Автоматизация'],
  ['integration', 'Интеграции'],
  ['assets', 'Ресурсы'],
];

export const AUDIT_ACTIONS = {
  'auth.login': 'Вход в систему',
  'auth.token.create': 'API-токен создан',
  'auth.token.revoke': 'API-токен отозван',
  'auth.token.revokeall': 'Все API-токены отозваны',
  'user.profile': 'Профиль изменён',
  'audit.retention': 'Срок хранения журнала изменён',
  'team.create': 'Команда создана',
  'team.update': 'Команда изменена',
  'team.delete': 'Команда удалена',
  'member.add': 'Участник добавлен',
  'member.role': 'Роль участника изменена',
  'member.invite': 'Приглашение отправлено',
  'member.remove': 'Участник исключён',
  'member.leave': 'Участник покинул команду',
  'group.create': 'Группа создана',
  'group.update': 'Группа изменена',
  'group.members': 'Состав группы изменён',
  'group.delete': 'Группа удалена',
  'space.create': 'Пространство создано',
  'space.update': 'Пространство изменено',
  'space.delete': 'Пространство удалено',
  'space.clone': 'Пространство скопировано',
  'space.import': 'Задачи импортированы',
  'space.layout': 'Экраны и поля пространства изменены',
  'issueconfig.layout.create': 'Экран или конфигурация полей создана',
  'issueconfig.layout.update': 'Экран или конфигурация полей изменена',
  'issueconfig.layout.delete': 'Экран или конфигурация полей удалена',
  'workflow.status.create': 'Статус создан',
  'workflow.status.update': 'Статус изменён',
  'workflow.status.reorder': 'Порядок статусов изменён',
  'workflow.status.delete': 'Статус удалён',
  'workflow.transition.save': 'Переход сохранён',
  'workflow.transition.delete': 'Переход удалён',
  'workflow.copy': 'Workflow скопирован',
  'issueconfig.workflow.create': 'Общий workflow или схема workflow создана',
  'issueconfig.workflow.update': 'Общий workflow или схема workflow изменена',
  'issueconfig.workflow.delete': 'Общий workflow или схема workflow удалена',
  'space.workflowscheme': 'Схема workflow пространства изменена',
  'issueconfig.permissionscheme.create': 'Схема прав создана',
  'issueconfig.permissionscheme.update': 'Схема прав изменена',
  'issueconfig.permissionscheme.delete': 'Схема прав удалена',
  'space.permissionscheme': 'Схема прав раздела изменена',
  'issueconfig.notificationscheme.create': 'Схема уведомлений создана',
  'issueconfig.notificationscheme.update': 'Схема уведомлений изменена',
  'issueconfig.notificationscheme.delete': 'Схема уведомлений удалена',
  'space.notificationscheme': 'Схема уведомлений раздела изменена',
  'issueconfig.type.create': 'Тип задачи создан',
  'issueconfig.type.update': 'Тип задачи изменён',
  'issueconfig.type.delete': 'Тип задачи удалён',
  'issueconfig.field.create': 'Поле создано',
  'issueconfig.field.update': 'Поле изменено',
  'issueconfig.field.delete': 'Поле удалено',
  'issue.delete': 'Задача удалена',
  'issue.bulkedit': 'Массовое изменение задач',
  'issue.bulkdelete': 'Массовое удаление задач',
  'sprint.create': 'Спринт создан',
  'sprint.start': 'Спринт начат',
  'sprint.complete': 'Спринт завершён',
  'sprint.delete': 'Спринт удалён',
  'component.create': 'Компонент создан',
  'component.update': 'Компонент изменён',
  'component.delete': 'Компонент удалён',
  'release.create': 'Релиз создан',
  'release.update': 'Релиз изменён',
  'release.release': 'Релиз выпущен',
  'release.delete': 'Релиз удалён',
  'automation.create': 'Правило автоматизации создано',
  'automation.update': 'Правило автоматизации изменено',
  'automation.delete': 'Правило автоматизации удалено',
  'automation.run': 'Правило автоматизации запущено вручную',
  'integration.github.save': 'Репозиторий GitHub подключён',
  'integration.github.delete': 'Репозиторий GitHub отключён',
  'integration.webhook.create': 'Webhook создан',
  'integration.webhook.update': 'Webhook изменён',
  'integration.webhook.delete': 'Webhook удалён',
  'assets.schema.create': 'Схема ресурсов создана',
  'assets.schema.update': 'Схема ресурсов изменена',
  'assets.schema.delete': 'Схема ресурсов удалена',
};

export const FIELD_LABELS = {
  Name: 'Название', Title: 'Название', Description: 'Описание', Key: 'Ключ', KeyPrefix: 'Ключ', Kind: 'Категория статуса', Order: 'Порядок',
  Role: 'Роль', Enabled: 'Включено', SourceColumnId: 'Из статуса', TargetColumnId: 'В статус', FromAnyStatus: 'Из любого статуса',
  AllowedIssueTypes: 'Типы задач', AllowedRoles: 'Роли', ConditionsJson: 'Условия', PostFunctionsJson: 'Действия после перехода',
  BaseType: 'Уровень иерархии', Icon: 'Иконка', Color: 'Цвет', FieldType: 'Тип поля', OptionsJson: 'Варианты', Boards: 'Пространства',
  IssueTypes: 'Типы задач', Required: 'Обязательное', Url: 'URL', Events: 'События', SecretConfigurationKey: 'Ключ секрета',
  RepositoryOwner: 'Владелец репозитория', RepositoryName: 'Репозиторий', TriggerType: 'Триггер', ActionsJson: 'Действия',
  StartDate: 'Начало', EndDate: 'Окончание', ReleaseDate: 'Дата релиза', Released: 'Выпущен', Goal: 'Цель', State: 'Состояние', Status: 'Состояние',
  RetentionDays: 'Срок хранения (дней)', IssueKey: 'Ключ задачи', Priority: 'Приоритет', IssueType: 'Тип задачи', AssigneeId: 'Исполнитель',
  DueDate: 'Срок', StoryPoints: 'Story points', Labels: 'Метки', OwnerId: 'Владелец', AvatarUrl: 'Аватар',
};

export const RETENTION_LABELS = { 30: '1 месяц', 90: '3 месяца', 180: '6 месяцев', 365: '1 год', 730: '2 года', 1095: '3 года', 1825: '5 лет', 2555: '7 лет', 3650: '10 лет' };

const PAGE_SIZE = 50;
const EMPTY_FILTER = { teamId: '', category: '', actorId: '', search: '', from: '', to: '' };

export function auditQuery(filter, page) {
  const nextDay = (value) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + 1);
    return date.toISOString();
  };
  return {
    teamId: filter.teamId || undefined,
    category: filter.category || undefined,
    actorId: filter.actorId || undefined,
    search: filter.search.trim() || undefined,
    from: filter.from ? new Date(`${filter.from}T00:00:00`).toISOString() : undefined,
    to: filter.to ? nextDay(filter.to) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
}

export function Details({ value }) {
  const { t } = useLocalization();
  if (!value || typeof value !== 'object') return null;
  const { changes, ...request } = value;
  const empty = <span className="settings-table-sub">—</span>;
  return (
    <div className="audit-details">
      {Array.isArray(changes) && changes.length > 0 && (
        <table className="audit-changes">
          <thead>
            <tr><th>{t('Поле')}</th><th>{t('Было')}</th><th>{t('Стало')}</th></tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.field}>
                <td>{t(FIELD_LABELS[change.field] || change.field)}</td>
                <td className="audit-from">{change.from ?? empty}</td>
                <td className="audit-to">{change.to ?? empty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {Object.keys(request).length > 0 && (
        <details className="audit-request">
          <summary>{t('Параметры запроса')}</summary>
          <pre>{JSON.stringify(request, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function RetentionDialog({ teams, onClose }) {
  const { t } = useLocalization();
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [settings, setSettings] = useState(null);
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!teamId) return;
    setSettings(null);
    audit.settings(teamId).then((value) => { setSettings(value); setDays(String(value.retentionDays)); }).catch((e) => setError(e.message || 'Не удалось загрузить настройки.'));
  }, [teamId]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await audit.saveSettings(teamId, { retentionDays: Number(days) });
      onClose();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить настройки.');
      setSaving(false);
    }
  };
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={t('Срок хранения журнала')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t('Срок хранения журнала')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          {teams.length > 1 && (
            <label className="app-field">
              <span>{t('Команда')}</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
          <label className="app-field">
            <span>{t('Хранить события')}</span>
            <select value={days} onChange={(e) => setDays(e.target.value)} disabled={!settings} aria-label={t('Хранить события')}>
              {(settings?.options || []).map((option) => <option key={option} value={option}>{t(RETENTION_LABELS[option] || ``)}</option>)}
            </select>
          </label>
          <p className="app-modal-hint">{t('События старше этого срока удаляются автоматически.')}</p>
          {error && <p className="app-modal-error" role="alert">{t(error)}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving || !settings}>{saving ? '…' : t('Сохранить')}</button>
        </div>
      </form>
    </div>
  );
}

export default function AuditLogPage() {
  const { t, formatDate } = useLocalization();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [retention, setRetention] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter((current) => (current.search === search ? current : { ...current, search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    let cancelled = false;
    audit.list(auditQuery(filter, page))
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Не удалось загрузить журнал аудита.'); });
    return () => { cancelled = true; };
  }, [filter, page]);
  useEffect(() => load(), [load]);

  const update = (patch) => {
    setFilter((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await audit.exportCsv({ ...auditQuery(filter, 1), page: undefined, pageSize: undefined });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || 'Не удалось выгрузить журнал.');
    } finally {
      setExporting(false);
    }
  };

  const teams = data?.teams || [];
  const items = data?.items || [];
  const total = data?.total || 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const hasFilter = Object.entries(filter).some(([, value]) => value);
  const noAccess = data && teams.length === 0;
  const when = (value) => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Безопасность'], ['Журнал аудита']]}
      title={t('Журнал аудита')}
      description={t('Журнал показывает, кто и когда менял настройки команд и пространств: участников, workflow, поля, интеграции, автоматизацию, а также удаление задач. Значения секретов в журнал не попадают.')}
      actions={!noAccess && data && (
        <>
          <button type="button" className="app-btn app-btn-subtle" onClick={() => setRetention(true)}>
            <NavIcon name="settings" size={14} /> {t('Срок хранения')}
          </button>
          <button type="button" className="app-btn app-btn-subtle" onClick={exportCsv} disabled={exporting || total === 0}>
            <NavIcon name="download" size={14} /> {t(exporting ? 'Выгрузка…' : 'Экспорт в CSV')}
          </button>
        </>
      )}
    >
      {noAccess ? (
        <p className="settings-empty">{t('Журнал аудита доступен владельцам и администраторам команд.')}</p>
      ) : (
        <>
          <div className="settings-toolbar audit-toolbar">
            <label className="settings-search">
              <NavIcon name="search" size={14} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Поиск по объекту, автору, пространству')} aria-label={t('Поиск по журналу')} />
            </label>
            {teams.length > 1 && (
              <select value={filter.teamId} onChange={(e) => update({ teamId: e.target.value })} aria-label={t('Команда')}>
                <option value="">{t('Все команды')}</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            )}
            <select value={filter.category} onChange={(e) => update({ category: e.target.value })} aria-label={t('Категория')}>
              <option value="">{t('Все категории')}</option>
              {AUDIT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
            <select value={filter.actorId} onChange={(e) => update({ actorId: e.target.value })} aria-label={t('Автор')}>
              <option value="">{t('Все авторы')}</option>
              {(data?.actors || []).map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
            </select>
            <label className="audit-date">
              <span>{t('С')}</span>
              <input type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => update({ from: e.target.value })} aria-label={t('С даты')} />
            </label>
            <label className="audit-date">
              <span>{t('По')}</span>
              <input type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => update({ to: e.target.value })} aria-label={t('По дату')} />
            </label>
            {hasFilter && (
              <button type="button" className="app-btn app-btn-subtle" onClick={() => { setSearch(''); setFilter(EMPTY_FILTER); setPage(1); }}>{t('Сбросить')}</button>
            )}
          </div>
          {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
          {!data && !error && <p className="settings-empty">{t('Загрузка…')}</p>}
          {data && items.length === 0 && (
            <p className="settings-empty">{t(hasFilter ? 'По этим условиям событий не найдено.' : 'Событий пока нет. Они появятся, когда кто-то изменит настройки.')}</p>
          )}
          {items.length > 0 && (
            <div className="settings-table-wrap">
              <table className="settings-table audit-table">
                <thead>
                  <tr>
                    <th>{t('Дата')}</th>
                    <th>{t('Автор')}</th>
                    <th>{t('Событие')}</th>
                    <th className="hide-mobile">{t('Где')}</th>
                    <th className="hide-mobile is-narrow">{t('IP-адрес')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const expanded = open === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={expanded ? 'is-open' : undefined}>
                          <td className="audit-when">{when(item.createdAt)}</td>
                          <td>
                            {item.actor ? (
                              <span className="audit-actor">
                                {item.actor.avatarUrl
                                  ? <img src={item.actor.avatarUrl} alt="" />
                                  : <span className="audit-actor-initial" aria-hidden="true">{(item.actor.name || '?').slice(0, 1).toUpperCase()}</span>}
                                {item.actor.name}
                              </span>
                            ) : <span className="settings-table-sub">{t('Система')}</span>}
                          </td>
                          <td>
                            <button type="button" className="audit-event" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)} disabled={!item.details}>
                              <span className="settings-table-name">{t(AUDIT_ACTIONS[item.action] || item.action)}</span>
                              {item.objectName && <span className="audit-object">{item.objectName}</span>}
                              {item.details && <NavIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />}
                            </button>
                          </td>
                          <td className="hide-mobile">
                            {item.boardName || item.teamName}
                            {item.boardName && item.teamName && <div className="settings-table-sub">{item.teamName}</div>}
                          </td>
                          <td className="hide-mobile is-narrow"><span className="settings-table-sub">{item.ipAddress || '—'}</span></td>
                        </tr>
                        {expanded && (
                          <tr className="audit-details-row">
                            <td colSpan={5}><Details value={item.details} /></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="audit-pager">
              <span>{t('{first}–{last} из {total}').replace('{first}', first).replace('{last}', last).replace('{total}', total)}</span>
              <button type="button" className="app-btn app-btn-subtle" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Назад')}</button>
              <button type="button" className="app-btn app-btn-subtle" disabled={last >= total} onClick={() => setPage(page + 1)}>{t('Далее')}</button>
            </div>
          )}
        </>
      )}
      {retention && <RetentionDialog teams={teams} onClose={() => setRetention(false)} />}
    </SettingsShell>
  );
}
