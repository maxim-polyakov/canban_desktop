import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '../../i18n/navigation.jsx';
import { permissionSchemes } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';
import { LayoutModal } from './IssueLayoutPages.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import '../../components/CustomFields.css';

export const ROLE_LABELS = { viewer: 'Наблюдатель', member: 'Участник', lead: 'Руководитель', admin: 'Администратор' };
const GRANT_TYPES = [
  ['role', 'Роль в команде'],
  ['group', 'Группа'],
  ['user', 'Пользователь'],
  ['reporter', 'Автор задачи'],
  ['assignee', 'Исполнитель задачи'],
  ['anyone', 'Любой, у кого есть доступ к разделу'],
];
const VALUE_TYPES = ['role', 'group', 'user'];

export function usePermissionCatalog(teamId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!teamId) return;
    permissionSchemes.catalog(teamId).then((value) => { setState(value); setError(''); })
      .catch((e) => setError(e.message || 'Не удалось загрузить схемы прав.'));
  }, [teamId]);
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
    default: return t(GRANT_TYPES.find(([type]) => type === grant.type)?.[1] ?? grant.type);
  }
}

function AddGrant({ permission, state, onAdd }) {
  const { t } = useLocalization();
  const [type, setType] = useState('role');
  const [value, setValue] = useState('member');
  const types = GRANT_TYPES.filter(([id]) => permission.issueScoped || (id !== 'reporter' && id !== 'assignee'));
  const options = type === 'role' ? state.roles.map((r) => [r, t(ROLE_LABELS[r] ?? r)])
    : type === 'group' ? state.groups.map((g) => [g.id, g.name])
      : type === 'user' ? state.users.map((u) => [u.id, u.displayName || u.email]) : [];
  const changeType = (next) => {
    setType(next);
    setValue(next === 'role' ? 'member' : next === 'group' ? state.groups[0]?.id ?? '' : next === 'user' ? state.users[0]?.id ?? '' : '');
  };
  const needsValue = VALUE_TYPES.includes(type);
  return (
    <span className="perm-add">
      <select aria-label={`${t('Кому выдать')}: ${t(permission.name)}`} value={type} onChange={(e) => changeType(e.target.value)}>
        {types.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
      </select>
      {needsValue && (
        <select aria-label={`${t('Значение')}: ${t(permission.name)}`} value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      )}
      <button type="button" className="app-btn app-btn-subtle" disabled={needsValue && !value}
        onClick={() => onAdd({ type, value: needsValue ? value : null })}>{t('Добавить')}</button>
    </span>
  );
}

/** Grants table: permissions grouped by category with who holds each one. */
export function PermissionGrantsEditor({ data, onChange, state, readOnly }) {
  const { t } = useLocalization();
  const grants = data.grants || {};
  const categories = [...new Set(state.permissions.map((p) => p.category))];
  const same = (a, b) => a.type === b.type && (a.value ?? null) === (b.value ?? null);
  const setList = (key, list) => onChange({ ...data, grants: { ...grants, [key]: list } });
  return (
    <div className="settings-table-wrap">
      <table className="settings-table perm-table">
        <thead><tr><th>{t('Право')}</th><th>{t('Кому выдано')}</th></tr></thead>
        {categories.map((category) => (
          <tbody key={category}>
            <tr className="perm-category"><th colSpan={2} scope="colgroup">{t(category)}</th></tr>
            {state.permissions.filter((p) => p.category === category).map((p) => {
              const list = grants[p.key] || [];
              return (
                <tr key={p.key}>
                  <td><span className="settings-table-name">{t(p.name)}</span><div className="settings-table-sub">{p.key}</div></td>
                  <td>
                    <span className="perm-grants">
                      {list.length === 0 && <span className="settings-table-sub">{t('Никому')}</span>}
                      {list.map((g) => (
                        <span key={`${g.type}:${g.value ?? ''}`} className="perm-chip">
                          {grantLabel(g, state, t)}
                          {!readOnly && (
                            <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${grantLabel(g, state, t)}: ${t(p.name)}`}
                              onClick={() => setList(p.key, list.filter((x) => !same(x, g)))}>
                              <NavIcon name="close" size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </span>
                    {!readOnly && <AddGrant permission={p} state={state} onAdd={(g) => { if (!list.some((x) => same(x, g))) setList(p.key, [...list, g]); }} />}
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

function CreateSchemeDialog({ teamId, state, onClose, onSaved }) {
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
      const item = await permissionSchemes.create({ teamId, name, description, data });
      onSaved(item);
    } catch (e) {
      setError(t(e.message || 'Не удалось создать схему.'));
      setSaving(false);
    }
  };
  return (
    <LayoutModal title={t('Создать схему прав')} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
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
          <option value="">{t('Схема прав по умолчанию')}</option>
          {state.objects.map((o) => <option key={o.id} value={o.id}>{`${t('Копия')}: ${o.name}`}</option>)}
        </select>
      </label>
    </LayoutModal>
  );
}

function SchemeEditor({ item, state, onBack, onSaved }) {
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
      const saved = await permissionSchemes.update(item.id, { teamId: item.teamId, ...draft });
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
        <button type="button" className="app-btn app-btn-subtle" onClick={onBack}>{`← ${t('Все схемы прав')}`}</button>
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
      <p className="settings-section-desc">{t('Владелец и администраторы команды всегда могут просматривать и администрировать раздел, чтобы не потерять к нему доступ.')}</p>
      <PermissionGrantsEditor data={draft.data} onChange={(data) => setDraft((d) => ({ ...d, data }))} state={state} readOnly={!state.canManage} />
    </section>
  );
}

export function PermissionSchemesPage() {
  const { t } = useLocalization();
  const { catalog, error: catalogError } = useIssueCatalog();
  const [teamId, setTeamId] = useTeamSelection(catalog?.teams);
  const { state, error, reload } = usePermissionCatalog(teamId);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState('');
  const selectedItem = state?.objects.find((o) => o.id === selected);
  useEffect(() => { setSelected(null); }, [teamId]);

  const usedBy = (item) => (item.usedBy.length === 0 ? t('Не используется')
    : item.usedBy.map((id) => state.boards.find((b) => b.id === id)?.name).filter(Boolean).join(', '));
  const remove = async (item) => {
    if (!window.confirm(t('Удалить «{name}»?').replace('{name}', item.name))) return;
    try { await permissionSchemes.remove(item.id); reload(); } catch (e) { setActionError(t(e.message || 'Не удалось удалить.')); }
  };

  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], ['Схемы прав']]} title={t('Схемы прав')}
      description={t('Схема прав определяет, кто может просматривать раздел, создавать, менять, переводить и удалять задачи, комментировать, прикладывать файлы и вести учёт времени. Права выдаются ролям, группам, отдельным людям, автору и исполнителю задачи. Одну схему можно назначить нескольким разделам; без схемы раздел использует права по умолчанию.')}>
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
      </div>
      {(catalogError || error || actionError) && <p className="settings-save-status is-error" role="alert">{t(catalogError || error || actionError)}</p>}
      {!state && !error && !catalogError && <p className="settings-empty">{t('Загрузка…')}</p>}
      {state && !state.canManage && <p className="settings-section-desc">{t('Настраивать схемы прав может только владелец или администратор команды.')}</p>}
      {state && selectedItem && (
        <SchemeEditor key={selectedItem.id} item={selectedItem} state={state} onBack={() => setSelected(null)} onSaved={() => reload()} />
      )}
      {state && !selectedItem && (
        <section className="settings-section">
          <div className="settings-title-row">
            <h2 className="settings-section-title">{t('Схемы прав')}</h2>
            {state.canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setCreating(true)}>{t('Создать схему прав')}</button>}
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
                    <span className="settings-table-name">{t('Схема прав по умолчанию')}</span>
                    <div className="settings-table-sub">{t('Встроенная: просмотр — наблюдателям, работа с задачами — участникам, удаление и администрирование — руководителям и администраторам.')}</div>
                  </td>
                  <td className="hide-mobile">{state.boards.filter((b) => !b.permissionSchemeId).map((b) => b.name).join(', ') || t('Не используется')}</td>
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
        <CreateSchemeDialog teamId={teamId} state={state} onClose={() => setCreating(false)}
          onSaved={(item) => { setCreating(false); reload(); setSelected(item.id); }} />
      )}
    </SettingsShell>
  );
}

/** Space access settings: which permission scheme the space uses. */
export function SpacePermissionScheme({ boardId, teamId }) {
  const { t } = useLocalization();
  const { state, error, reload } = usePermissionCatalog(teamId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  if (!teamId) return null;
  const board = state?.boards.find((b) => b.id === boardId);
  const schemeId = board?.permissionSchemeId ?? '';
  const choose = async (next) => {
    setBusy(true);
    setStatus({ type: '', text: '' });
    try {
      await permissionSchemes.assign(boardId, next || null);
      setStatus({ type: 'ok', text: t('Сохранено') });
      reload();
    } catch (e) {
      setStatus({ type: 'error', text: t(e.message || 'Не удалось сменить схему.') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sv-permission-scheme" aria-label={t('Схема прав')}>
      <h2>{t('Схема прав')}</h2>
      <p className="sv-muted">{t('Кто и что может делать в разделе: просматривать, создавать, менять, переводить и удалять задачи, комментировать и прикладывать файлы.')}</p>
      {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
      {state && (
        <div className="perm-picker">
          <select aria-label={t('Схема прав')} value={schemeId} disabled={busy || !state.canManage} onChange={(e) => choose(e.target.value)}>
            <option value="">{t('Схема прав по умолчанию')}</option>
            {state.objects.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Link className="app-btn app-btn-subtle" to="/settings/issues/permission-schemes">{t('Управление схемами прав')}</Link>
        </div>
      )}
      {state && !state.canManage && <p className="sv-muted">{t('Менять схему прав может только владелец или администратор команды.')}</p>}
      {status.text && <p className={`settings-save-status ${status.type === 'error' ? 'is-error' : ''}`} role="status">{status.text}</p>}
    </section>
  );
}
