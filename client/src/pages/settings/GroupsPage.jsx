import React, { useCallback, useEffect, useState } from 'react';
import { teams as teamsApi, userGroups } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { clearBoardIssueConfig } from '../../utils/issueConfig.js';
import { TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';

function GroupDialog({ teamId, group, members, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [selected, setSelected] = useState(() => (group?.members ?? []).map((m) => m.userId));
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const visible = members.filter((m) => !query.trim() || `${m.displayName} ${m.email}`.toLowerCase().includes(query.trim().toLowerCase()));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = group
        ? await userGroups.update(group.id, { teamId, name, description })
        : await userGroups.create({ teamId, name, description });
      await userGroups.setMembers(saved.id, selected);
      onSaved();
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить группу.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={t(group ? 'Изменить группу' : 'Создать группу')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t(group ? 'Изменить группу' : 'Создать группу')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <label className="app-field">
            <span>{t('Название')} <span className="app-required">*</span></span>
            <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required autoFocus />
          </label>
          <label className="app-field">
            <span>{t('Описание')}</span>
            <textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <fieldset className="settings-choice-list">
            <legend>{t('Участники')} ({selected.length})</legend>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск участников')} aria-label={t('Поиск участников')} />
            {visible.map((member) => (
              <label key={member.userId} className="custom-field-option">
                <input
                  type="checkbox"
                  checked={selected.includes(member.userId)}
                  onChange={(e) => setSelected((list) => (e.target.checked ? [...list, member.userId] : list.filter((id) => id !== member.userId)))}
                />
                {member.displayName} <span className="settings-table-sub">{member.email}</span>
              </label>
            ))}
            {members.length === 0 && <p className="settings-empty">{t('В команде пока нет участников.')}</p>}
          </fieldset>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t(group ? 'Сохранить' : 'Создать')}</button>
        </div>
      </form>
    </div>
  );
}

export default function GroupsPage() {
  const { t } = useLocalization();
  const { catalog, error: catalogError } = useIssueCatalog();
  const [teamId, setTeamId, team] = useTeamSelection(catalog?.teams);
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (!teamId) return;
    setError('');
    userGroups.list(teamId).then(setData).catch((e) => setError(e.message || 'Не удалось загрузить группы.'));
    teamsApi.getMembers(teamId).then((list) => setMembers(Array.isArray(list) ? list : [])).catch(() => setMembers([]));
  }, [teamId]);
  useEffect(() => { setData(null); load(); }, [load]);

  const canManage = !!data?.canManage;
  const groups = (data?.groups ?? []).filter((g) => !query.trim() || g.name.toLowerCase().includes(query.trim().toLowerCase()));

  const remove = async (group) => {
    if (!window.confirm(t('Удалить группу «{name}»? Поля и схемы, где она выбрана, перестанут её учитывать.').replace('{name}', group.name))) return;
    try {
      await userGroups.remove(group.id);
      clearBoardIssueConfig();
      load();
    } catch (e) {
      setError(e.message || 'Не удалось удалить группу.');
    }
  };

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Пользователи'], ['Группы']]}
      title={t('Группы')}
      description={t('Группы объединяют участников команды. Их можно выбирать в полях «Выбор группы» и использовать в схемах прав и уведомлений.')}
      actions={canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({})}>{t('Создать группу')}</button>}
    >
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Фильтр по имени')} aria-label={t('Фильтр по имени')} />
        </label>
      </div>
      {(catalogError || error) && <p className="settings-save-status is-error" role="alert">{t(catalogError || error)}</p>}
      {!data && !error && !catalogError && <p className="settings-empty">{t('Загрузка…')}</p>}
      {data && !canManage && team && <p className="settings-section-desc">{t('Управлять группами может только владелец или администратор команды.')}</p>}
      {data && (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('Группа')}</th>
                <th className="hide-mobile">{t('Участники')}</th>
                <th className="is-narrow">{t('Всего')}</th>
                {canManage && <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <span className="settings-table-name">{group.name}</span>
                    {group.description && <div className="settings-table-sub">{group.description}</div>}
                  </td>
                  <td className="hide-mobile">{group.members.slice(0, 5).map((m) => m.displayName).join(', ')}{group.members.length > 5 ? ` +${group.members.length - 5}` : ''}</td>
                  <td className="is-narrow">{group.members.length}</td>
                  {canManage && (
                    <td className="is-narrow">
                      <span className="settings-row-actions">
                        <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${group.name}`} onClick={() => setEditing(group)}><NavIcon name="edit" size={14} /></button>
                        <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${group.name}`} onClick={() => remove(group)}><NavIcon name="trash" size={14} /></button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && <p className="settings-empty">{t(query ? 'Нет групп, соответствующих фильтру.' : 'В этой команде пока нет групп.')}</p>}
        </div>
      )}
      {editing && (
        <GroupDialog
          teamId={teamId}
          group={editing.id ? editing : null}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); clearBoardIssueConfig(); load(); }}
        />
      )}
    </SettingsShell>
  );
}
