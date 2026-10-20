import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '../../i18n/navigation.jsx';
import { notificationSchemes, permissionSchemes } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';
import { LayoutModal } from './IssueLayoutPages.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import '../../components/CustomFields.css';

export const ROLE_LABELS = { viewer: 'Наблюдатель', member: 'Участник', lead: 'Руководитель', admin: 'Администратор' };
const RECIPIENT_LABELS = {
  role: 'Роль в команде',
  group: 'Группа',
  user: 'Пользователь',
  reporter: 'Автор задачи',
  assignee: 'Исполнитель задачи',
  anyone: 'Любой, у кого есть доступ к разделу',
  watchers: 'Все наблюдатели',
};
const VALUE_TYPES = ['role', 'group', 'user'];

/** Shared by permission and notification schemes: what the rows are, who can be added and the texts. */
export const PERMISSION_CONFIG = {
  api: permissionSchemes,
  rowsKey: 'permissions',
  dataKey: 'grants',
  schemeKey: 'permissionSchemeId',
  types: (row) => ['role', 'group', 'user', ...(row.issueScoped ? ['reporter', 'assignee'] : []), 'anyone'],
  path: '/settings/issues/permission-schemes',
  title: 'Схемы прав',
  single: 'Схема прав',
  create: 'Создать схему прав',
  defaultName: 'Схема прав по умолчанию',
  defaultSummary: 'Встроенная: просмотр — наблюдателям, работа с задачами — участникам, удаление и администрирование — руководителям и администраторам.',
  all: 'Все схемы прав',
  rowHeader: 'Право',
  addLabel: 'Кому выдать',
  manage: 'Управление схемами прав',
  loadError: 'Не удалось загрузить схемы прав.',
  adminOnly: 'Настраивать схемы прав может только владелец или администратор команды.',
  assignAdminOnly: 'Менять схему прав может только владелец или администратор команды.',
  editorNote: 'Владелец и администраторы команды всегда могут просматривать и администрировать раздел, чтобы не потерять к нему доступ.',
  description: 'Схема прав определяет, кто может просматривать раздел, создавать, менять, переводить и удалять задачи, комментировать, прикладывать файлы и вести учёт времени. Права выдаются ролям, группам, отдельным людям, автору и исполнителю задачи. Одну схему можно назначить нескольким разделам; без схемы раздел использует права по умолчанию.',
  spaceDescription: 'Кто и что может делать в разделе: просматривать, создавать, менять, переводить и удалять задачи, комментировать и прикладывать файлы.',
};

export const NOTIFICATION_CONFIG = {
  api: notificationSchemes,
  rowsKey: 'events',
  dataKey: 'events',
  schemeKey: 'notificationSchemeId',
  types: () => ['watchers', 'reporter', 'assignee', 'role', 'group', 'user'],
  path: '/settings/issues/notification-schemes',
  title: 'Схемы уведомлений',
  single: 'Схема уведомлений',
  create: 'Создать схему уведомлений',
  defaultName: 'Схема уведомлений по умолчанию',
  defaultSummary: 'Встроенная: о каждом событии узнают наблюдатели, автор и исполнитель задачи.',
  all: 'Все схемы уведомлений',
  rowHeader: 'Событие',
  addLabel: 'Кого уведомлять',
  manage: 'Управление схемами уведомлений',
  loadError: 'Не удалось загрузить схемы уведомлений.',
  adminOnly: 'Настраивать схемы уведомлений может только владелец или администратор команды.',
  assignAdminOnly: 'Менять схему уведомлений может только владелец или администратор команды.',
  editorNote: 'Уведомления получают только те, кто может просматривать раздел. Свои изменения и письма по ролям каждый настраивает в персональных настройках.',
  description: 'Схема уведомлений определяет, кто узнаёт о событиях задачи: создании, изменении, назначении, смене статуса, решении, переоткрытии, архивации и комментариях. Получатели — наблюдатели, автор, исполнитель, роли, группы и отдельные люди. Без схемы раздел уведомляет наблюдателей, автора и исполнителя.',
  spaceDescription: 'Кто получает письма и уведомления о событиях задач этого раздела.',
};

export function useSchemeCatalog(config, teamId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!teamId) return;
    config.api.catalog(teamId).then((value) => { setState(value); setError(''); })
      .catch((e) => setError(e.message || config.loadError));
  }, [config, teamId]);
  useEffect(() => { setState(null); reload(); }, [reload]);
  return { state, error, reload };
}

export function grantLabel(grant, state, t) {
  switch (grant.type) {
    case 'role': return `${t('Роль')}: ${t(ROLE_LABELS[grant.value] ?? grant.value)}`;
    case 'group': return `${t('Группа')}: ${state.groups.find((g) => g.id === grant.value)?.name ?? '—'}`;
    case 'user': {
      const user = state.users.find((u) => u.id === grant.value);
      return `${t('Пользователь')}: ${user?.displayName || user?.email || '—'}`;
    }
    default: return t(RECIPIENT_LABELS[grant.type] ?? grant.type);
  }
}

function AddGrant({ config, row, state, onAdd }) {
  const { t } = useLocalization();
  const types = config.types(row);
  const [type, setType] = useState(types[0]);
  const initial = (next) => (next === 'role' ? 'member' : next === 'group' ? state.groups[0]?.id ?? '' : next === 'user' ? state.users[0]?.id ?? '' : '');
  const [value, setValue] = useState(initial(types[0]));
  const options = type === 'role' ? state.roles.map((r) => [r, t(ROLE_LABELS[r] ?? r)])
    : type === 'group' ? state.groups.map((g) => [g.id, g.name])
      : type === 'user' ? state.users.map((u) => [u.id, u.displayName || u.email]) : [];
  const needsValue = VALUE_TYPES.includes(type);
  return (
    <span className="perm-add">
      <select aria-label={`${t(config.addLabel)}: ${t(row.name)}`} value={type} onChange={(e) => { setType(e.target.value); setValue(initial(e.target.value)); }}>
        {types.map((id) => <option key={id} value={id}>{t(RECIPIENT_LABELS[id])}</option>)}
      </select>
      {needsValue && (
        <select aria-label={`${t('Значение')}: ${t(row.name)}`} value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      )}
      <button type="button" className="app-btn app-btn-subtle" disabled={needsValue && !value}
        onClick={() => onAdd({ type, value: needsValue ? value : null })}>{t('Добавить')}</button>
    </span>
  );
}

/** Rows (permissions or events) with who holds each one; permissions are grouped by category. */
export function GrantsEditor({ config, data, onChange, state, readOnly }) {
  const { t } = useLocalization();
  const grants = data[config.dataKey] || {};
  const rows = state[config.rowsKey];
  const categories = [...new Set(rows.map((r) => r.category ?? ''))];
  const same = (a, b) => a.type === b.type && (a.value ?? null) === (b.value ?? null);
  const setList = (key, list) => onChange({ ...data, [config.dataKey]: { ...grants, [key]: list } });
  return (
    <div className="settings-table-wrap">
      <table className="settings-table perm-table">
        <thead><tr><th>{t(config.rowHeader)}</th><th>{t(config.dataKey === 'grants' ? 'Кому выдано' : 'Кого уведомлять')}</th></tr></thead>
        {categories.map((category) => (
          <tbody key={category}>
            {category && <tr className="perm-category"><th colSpan={2} scope="colgroup">{t(category)}</th></tr>}
            {rows.filter((r) => (r.category ?? '') === category).map((row) => {
              const list = grants[row.key] || [];
              return (
                <tr key={row.key}>
                  <td><span className="settings-table-name">{t(row.name)}</span><div className="settings-table-sub">{row.key}</div></td>
                  <td>
                    <span className="perm-grants">
                      {list.length === 0 && <span className="settings-table-sub">{t('Никому')}</span>}
                      {list.map((g) => (
                        <span key={`${g.type}:${g.value ?? ''}`} className="perm-chip">
                          {grantLabel(g, state, t)}
                          {!readOnly && (
                            <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${grantLabel(g, state, t)}: ${t(row.name)}`}
                              onClick={() => setList(row.key, list.filter((x) => !same(x, g)))}>
                              <NavIcon name="close" size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </span>
                    {!readOnly && <AddGrant config={config} row={row} state={state} onAdd={(g) => { if (!list.some((x) => same(x, g))) setList(row.key, [...list, g]); }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function CreateSchemeDialog({ config, teamId, state, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const data = source ? state.objects.find((o) => o.id === source)?.data : state.defaultData;
      onSaved(await config.api.create({ teamId, name, description, data }));
    } catch (e) {
      setError(t(e.message || 'Не удалось создать схему.'));
      setSaving(false);
    }
  };
  return (
    <LayoutModal title={t(config.create)} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <label className="app-field">
        <span>{t('Название')} <span className="app-required">*</span></span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="app-field">
        <span>{t('Основа')}</span>
        <select aria-label={t('Основа')} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t(config.defaultName)}</option>
          {state.objects.map((o) => <option key={o.id} value={o.id}>{`${t('Копия')}: ${o.name}`}</option>)}
        </select>
      </label>
    </LayoutModal>
  );
}

function SchemeEditor({ config, item, state, onBack, onSaved }) {
  const { t } = useLocalization();
  const [draft, setDraft] = useState({ name: item.name, description: item.description ?? '', data: item.data });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const dirty = draft.name !== item.name || draft.description !== (item.description ?? '') || JSON.stringify(draft.data) !== JSON.stringify(item.data);
  const save = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved = await config.api.update(item.id, { teamId: item.teamId, ...draft });
      setDraft({ name: saved.name, description: saved.description ?? '', data: saved.data });
      setStatus(t('Сохранено'));
      onSaved(saved);
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="settings-section" aria-label={item.name}>
      <div className="settings-title-row">
        <button type="button" className="app-btn app-btn-subtle" onClick={onBack}>{`← ${t(config.all)}`}</button>
        {state.canManage && (
          <span className="settings-row-actions">
            {status && !dirty && <span className="settings-save-status" role="status">{status}</span>}
            {dirty && <span className="settings-save-status">{t('Есть несохранённые изменения')}</span>}
            <button type="button" className="app-btn app-btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? '…' : t('Сохранить')}</button>
          </span>
        )}
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="perm-meta">
        <label className="app-field">
          <span>{t('Название')}</span>
          <input value={draft.name} maxLength={100} disabled={!state.canManage} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="app-field">
          <span>{t('Описание')}</span>
          <input value={draft.description} maxLength={500} disabled={!state.canManage} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
      </div>
      {item.usedBy.length > 0 && <p className="settings-section-desc">{t('Изменения сразу применяются ко всем разделам, которые используют эту схему.')}</p>}
      <p className="settings-section-desc">{t(config.editorNote)}</p>
      <GrantsEditor config={config} data={draft.data} onChange={(data) => setDraft((d) => ({ ...d, data }))} state={state} readOnly={!state.canManage} />
    </section>
  );
}

function SchemesPage({ config }) {
  const { t } = useLocalization();
  const { catalog, error: catalogError } = useIssueCatalog();
  const [teamId, setTeamId] = useTeamSelection(catalog?.teams);
  const { state, error, reload } = useSchemeCatalog(config, teamId);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState('');
  const selectedItem = state?.objects.find((o) => o.id === selected);
  useEffect(() => { setSelected(null); }, [teamId]);

  const usedBy = (item) => (item.usedBy.length === 0 ? t('Не используется')
    : item.usedBy.map((id) => state.boards.find((b) => b.id === id)?.name).filter(Boolean).join(', '));
  const remove = async (item) => {
    if (!window.confirm(t('Удалить «{name}»?').replace('{name}', item.name))) return;
    try { await config.api.remove(item.id); reload(); } catch (e) { setActionError(t(e.message || 'Не удалось удалить.')); }
  };

  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], [config.title]]} title={t(config.title)}
      description={t(config.description)}>
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
      </div>
      {(catalogError || error || actionError) && <p className="settings-save-status is-error" role="alert">{t(catalogError || error || actionError)}</p>}
      {!state && !error && !catalogError && <p className="settings-empty">{t('Загрузка…')}</p>}
      {state && !state.canManage && <p className="settings-section-desc">{t(config.adminOnly)}</p>}
      {state && selectedItem && (
        <SchemeEditor key={selectedItem.id} config={config} item={selectedItem} state={state} onBack={() => setSelected(null)} onSaved={() => reload()} />
      )}
      {state && !selectedItem && (
        <section className="settings-section">
          <div className="settings-title-row">
            <h2 className="settings-section-title">{t(config.title)}</h2>
            {state.canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setCreating(true)}>{t(config.create)}</button>}
          </div>
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>{t('Имя')}</th>
                  <th className="hide-mobile">{t('Используется')}</th>
                  {state.canManage && <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="settings-table-name">{t(config.defaultName)}</span>
                    <div className="settings-table-sub">{t(config.defaultSummary)}</div>
                  </td>
                  <td className="hide-mobile">{state.boards.filter((b) => !b[config.schemeKey]).map((b) => b.name).join(', ') || t('Не используется')}</td>
                  {state.canManage && <td className="is-narrow" />}
                </tr>
                {state.objects.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="settings-table-name settings-link-btn" onClick={() => setSelected(item.id)}>{item.name}</button>
                      {item.description && <div className="settings-table-sub">{item.description}</div>}
                    </td>
                    <td className="hide-mobile">{usedBy(item)}</td>
                    {state.canManage && (
                      <td className="is-narrow">
                        <span className="settings-row-actions">
                          <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${item.name}`} onClick={() => setSelected(item.id)}>
                            <NavIcon name="edit" size={14} />
                          </button>
                          <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${item.name}`} disabled={item.usedBy.length > 0}
                            title={item.usedBy.length > 0 ? t('Используется — удалить нельзя') : undefined} onClick={() => remove(item)}>
                            <NavIcon name="trash" size={14} />
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {creating && state && (
        <CreateSchemeDialog config={config} teamId={teamId} state={state} onClose={() => setCreating(false)}
          onSaved={(item) => { setCreating(false); reload(); setSelected(item.id); }} />
      )}
    </SettingsShell>
  );
}

export const PermissionSchemesPage = () => <SchemesPage config={PERMISSION_CONFIG} />;
export const NotificationSchemesPage = () => <SchemesPage config={NOTIFICATION_CONFIG} />;

/** Space settings: which shared scheme the space uses. */
function SpaceScheme({ config, boardId, teamId }) {
  const { t } = useLocalization();
  const { state, error, reload } = useSchemeCatalog(config, teamId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  if (!teamId) return null;
  const schemeId = state?.boards.find((b) => b.id === boardId)?.[config.schemeKey] ?? '';
  const choose = async (next) => {
    setBusy(true);
    setStatus({ type: '', text: '' });
    try {
      await config.api.assign(boardId, next || null);
      setStatus({ type: 'ok', text: t('Сохранено') });
      reload();
    } catch (e) {
      setStatus({ type: 'error', text: t(e.message || 'Не удалось сменить схему.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sv-permission-scheme" aria-label={t(config.single)}>
      <h2>{t(config.single)}</h2>
      <p className="sv-muted">{t(config.spaceDescription)}</p>
      {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
      {state && (
        <div className="perm-picker">
          <select aria-label={t(config.single)} value={schemeId} disabled={busy || !state.canManage} onChange={(e) => choose(e.target.value)}>
            <option value="">{t(config.defaultName)}</option>
            {state.objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Link className="app-btn app-btn-subtle" to={config.path}>{t(config.manage)}</Link>
        </div>
      )}
      {state && !state.canManage && <p className="sv-muted">{t(config.assignAdminOnly)}</p>}
      {status.text && <p className={`settings-save-status ${status.type === 'error' ? 'is-error' : ''}`} role="status">{status.text}</p>}
    </section>
  );
}

export const SpacePermissionScheme = (props) => <SpaceScheme config={PERMISSION_CONFIG} {...props} />;
export const SpaceNotificationScheme = (props) => <SpaceScheme config={NOTIFICATION_CONFIG} {...props} />;
