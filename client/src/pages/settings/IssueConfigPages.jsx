import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { issueConfig } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { Link } from '../../i18n/navigation.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import {
  BASE_TYPES, FIELD_TYPES, clearBoardIssueConfig, forgetIssueType, loadIssueCatalog, rememberIssueTypes,
} from '../../utils/issueConfig.js';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import '../../components/CustomFields.css';

const TYPE_ICONS = ['📌', '🐞', '🔥', '🛠️', '🧪', '📄', '💡', '🎯', '🚀', '🔒', '📦', '🧩', '📣', '✅', '⚠️', '🔍'];
const TYPE_COLORS = ['#4bade8', '#63ba3c', '#e5493a', '#904ee2', '#ffab00', '#00b8d9', '#6b778c', '#ff7452'];
const LEVELS = { 0: 'Эпик', 4: 'Подзадача' };

export function useIssueCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    loadIssueCatalog(true).then((value) => { setCatalog(value); setError(''); }).catch((e) => setError(e.message || 'Не удалось загрузить настройки.'));
    clearBoardIssueConfig();
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { catalog, error, reload };
}

export function TeamPicker({ teams = [], value, onChange }) {
  const { t } = useLocalization();
  if (teams.length <= 1) return null;
  return (
    <label className="settings-team-picker">
      <span>{t('Команда')}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.canManage ? '' : ` (${t('только просмотр')})`}</option>)}
      </select>
    </label>
  );
}

export function useTeamSelection(teams = []) {
  const [teamId, setTeamId] = useState('');
  useEffect(() => {
    if (teams.length === 0 || teams.some((team) => team.id === teamId)) return;
    setTeamId((teams.find((team) => team.canManage) ?? teams[0]).id);
  }, [teams, teamId]);
  return [teamId, setTeamId, teams.find((team) => team.id === teamId) ?? null];
}

function Modal({ title, onClose, onSubmit, saving, error, submitLabel, children }) {
  const { t } = useLocalization();
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className="app-modal-header">
          <h2>{title}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          {children}
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function IssueTypeDialog({ teamId, type, onClose, onSaved }) {
  const { t } = useLocalization();
  const [form, setForm] = useState(() => ({
    name: type?.name ?? '',
    description: type?.description ?? '',
    baseType: type?.baseType ?? 2,
    icon: type?.icon ?? TYPE_ICONS[0],
    color: type?.color ?? TYPE_COLORS[0],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, teamId, baseType: Number(form.baseType) };
      const saved = type ? await issueConfig.updateType(type.id, payload) : await issueConfig.createType(payload);
      rememberIssueTypes([saved]);
      onSaved(saved);
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить тип задачи.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t(type ? 'Изменить тип задачи' : 'Создать тип задачи')} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={t(type ? 'Сохранить' : 'Создать')}>
      <label className="app-field">
        <span>{t('Название')} <span className="app-required">*</span></span>
        <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} required autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <label className="app-field">
        <span>{t('Уровень иерархии')}</span>
        <select value={form.baseType} onChange={(e) => set({ baseType: Number(e.target.value) })}>
          <option value={2}>{t('Стандартный')}</option>
          <option value={0}>{t('Эпик')}</option>
          <option value={4}>{t('Подзадача')}</option>
        </select>
      </label>
      <div className="app-field">
        <span>{t('Иконка')}</span>
        <div className="settings-icon-grid" role="radiogroup" aria-label={t('Иконка')}>
          {TYPE_ICONS.map((icon) => (
            <button key={icon} type="button" role="radio" aria-checked={form.icon === icon} className={form.icon === icon ? 'is-active' : ''} onClick={() => set({ icon })}>{icon}</button>
          ))}
        </div>
      </div>
      <div className="app-field">
        <span>{t('Цвет')}</span>
        <div className="settings-color-grid" role="radiogroup" aria-label={t('Цвет')}>
          {TYPE_COLORS.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={form.color === color} aria-label={color} className={form.color === color ? 'is-active' : ''} style={{ background: color }} onClick={() => set({ color })} />
          ))}
        </div>
      </div>
      <p className="settings-type-preview">
        <span className="issue-type-icon issue-type-icon-custom" style={{ width: 20, height: 20, background: form.color, fontSize: 14 }}>{form.icon}</span>
        {form.name || t('Новый тип')}
      </p>
    </Modal>
  );
}

export function CustomIssueTypesSection({ catalog, teamId, canManage, onChanged }) {
  const { t } = useLocalization();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const types = (catalog?.types || []).filter((type) => type.teamId === teamId);

  const remove = async (type) => {
    const warning = type.issueCount
      ? t('Задачи этого типа ({count}) станут задачами базового уровня. Удалить тип «{name}»?').replace('{count}', type.issueCount).replace('{name}', type.name)
      : t('Удалить тип «{name}»?').replace('{name}', type.name);
    if (!window.confirm(warning)) return;
    try {
      await issueConfig.deleteType(type.id);
      forgetIssueType(type.id);
      onChanged();
    } catch (e) {
      setError(t(e.message || 'Не удалось удалить тип задачи.'));
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-title-row">
        <h2 className="settings-section-title">{t('Свои типы задач')}</h2>
        {canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({})}>{t('Создать тип задачи')}</button>}
      </div>
      <p className="settings-section-desc">{t('Свои типы работают как стандартные на выбранном уровне иерархии, но у них своё название, иконка и набор полей.')}</p>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {types.length === 0 ? (
        <p className="settings-empty">{t('В этой команде пока нет своих типов задач.')}</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('Имя')}</th>
                <th className="hide-mobile">{t('Описание')}</th>
                <th>{t('Уровень иерархии')}</th>
                <th className="is-narrow">{t('Задачи')}</th>
                {canManage && <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id}>
                  <td><span className="settings-table-name"><IssueTypeIcon issueType={type.baseType} typeId={type.id} size={20} />{type.name}</span></td>
                  <td className="hide-mobile">{type.description}</td>
                  <td><span className="settings-lozenge">{t(LEVELS[type.baseType] ?? 'Стандартный')}</span></td>
                  <td className="is-narrow">
                    <Link to={`/issues?jql=${encodeURIComponent(`type = "${type.name}"`)}`}>{type.issueCount ?? 0}</Link>
                  </td>
                  {canManage && (
                    <td className="is-narrow">
                      <span className="settings-row-actions">
                        <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${type.name}`} onClick={() => setEditing(type)}><NavIcon name="edit" size={14} /></button>
                        <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${type.name}`} onClick={() => remove(type)}><NavIcon name="trash" size={14} /></button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <IssueTypeDialog
          teamId={teamId}
          type={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </section>
  );
}

function ChoiceList({ label, allLabel, options, value, onChange }) {
  const { t } = useLocalization();
  const all = value.length === 0;
  return (
    <fieldset className="settings-choice-list">
      <legend>{label}</legend>
      <label className="custom-field-option">
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? [] : options.slice(0, 1).map((o) => o.value))} />
        {allLabel}
      </label>
      {!all && options.map((option) => (
        <label key={option.value} className="custom-field-option">
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={(e) => onChange(e.target.checked ? [...value, option.value] : value.filter((x) => x !== option.value))}
          />
          {option.icon}{t(option.label)}
        </label>
      ))}
    </fieldset>
  );
}

function CustomFieldDialog({ teamId, field, boards, types, onClose, onSaved }) {
  const { t } = useLocalization();
  const [form, setForm] = useState(() => ({
    name: field?.name ?? '',
    description: field?.description ?? '',
    fieldType: field?.fieldType ?? 'text',
    options: (field?.options ?? []).join('\n'),
    boards: field?.boards ?? [],
    issueTypes: field?.issueTypes ?? [],
    required: field?.required ?? false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const hasOptions = form.fieldType === 'select' || form.fieldType === 'multiselect';
  const typeOptions = [
    ...BASE_TYPES.map((type) => ({ value: String(type.value), label: type.label, icon: <IssueTypeIcon issueType={type.value} size={14} /> })),
    ...types.map((type) => ({ value: type.id, label: type.name, icon: <IssueTypeIcon issueType={type.baseType} typeId={type.id} size={14} /> })),
  ];

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        teamId,
        name: form.name,
        description: form.description,
        fieldType: form.fieldType,
        options: hasOptions ? form.options.split('\n') : [],
        boards: form.boards,
        issueTypes: form.issueTypes,
        required: form.required,
      };
      const saved = field ? await issueConfig.updateField(field.id, payload) : await issueConfig.createField(payload);
      onSaved(saved);
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить поле.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t(field ? 'Изменить поле' : 'Создать поле')} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={t(field ? 'Сохранить' : 'Создать')}>
      <label className="app-field">
        <span>{t('Название')} <span className="app-required">*</span></span>
        <input value={form.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} required autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Тип поля')}</span>
        <select value={form.fieldType} disabled={!!field} onChange={(e) => set({ fieldType: e.target.value })}>
          {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{t(type.label)}</option>)}
        </select>
        {field && <small className="app-modal-hint">{t('Тип поля нельзя менять после создания')}</small>}
      </label>
      {hasOptions && (
        <label className="app-field">
          <span>{t('Варианты (каждый с новой строки)')} <span className="app-required">*</span></span>
          <textarea rows={4} value={form.options} onChange={(e) => set({ options: e.target.value })} />
        </label>
      )}
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={form.description} maxLength={500} placeholder={t('Подсказка, которую увидят при заполнении')} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <ChoiceList
        label={t('Пространства')}
        allLabel={t('Все пространства команды')}
        options={boards.map((board) => ({ value: board.id, label: board.name }))}
        value={form.boards}
        onChange={(value) => set({ boards: value })}
      />
      <ChoiceList label={t('Типы задач')} allLabel={t('Все типы задач')} options={typeOptions} value={form.issueTypes} onChange={(value) => set({ issueTypes: value })} />
      <label className="app-check">
        <input type="checkbox" checked={form.required} onChange={(e) => set({ required: e.target.checked })} />
        {t('Обязательное поле')}
      </label>
    </Modal>
  );
}

export function CustomFieldsPage() {
  const { t } = useLocalization();
  const { catalog, error, reload } = useIssueCatalog();
  const [teamId, setTeamId, team] = useTeamSelection(catalog?.teams);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState('');
  const canManage = !!team?.canManage;
  const boards = useMemo(() => (catalog?.boards || []).filter((board) => board.teamId === teamId), [catalog, teamId]);
  const types = useMemo(() => (catalog?.types || []).filter((type) => type.teamId === teamId), [catalog, teamId]);
  const fields = (catalog?.fields || [])
    .filter((field) => field.teamId === teamId)
    .filter((field) => !query.trim() || field.name.toLowerCase().includes(query.trim().toLowerCase()));

  const typeLabel = (token) => types.find((type) => type.id === token)?.name ?? t(BASE_TYPES.find((type) => String(type.value) === token)?.label ?? token);
  const remove = async (field) => {
    if (!window.confirm(t('Удалить поле «{name}» и все его значения в задачах?').replace('{name}', field.name))) return;
    try {
      await issueConfig.deleteField(field.id);
      reload();
    } catch (e) {
      setActionError(t(e.message || 'Не удалось удалить поле.'));
    }
  };

  return (
    <SettingsShell
      nav={ADMIN_NAV}
      wide
      breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], ['Поля задач']]}
      title={t('Поля задач')}
      description={t('Свои поля добавляют в задачи нужные вашей команде сведения: номер договора, платформу, окружение и т. п. Поля можно ограничить пространствами и типами задач и искать по ним в JQL.')}
      actions={canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({})}>{t('Создать поле')}</button>}
    >
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Фильтр по имени')} aria-label={t('Фильтр по имени')} />
        </label>
      </div>
      {(error || actionError) && <p className="settings-save-status is-error" role="alert">{t(error || actionError)}</p>}
      {!catalog && !error && <p className="settings-empty">{t('Загрузка…')}</p>}
      {catalog && !canManage && team && <p className="settings-section-desc">{t('Настраивать поля может только владелец или администратор команды.')}</p>}
      {catalog && (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('Имя')}</th>
                <th>{t('Тип поля')}</th>
                <th className="hide-mobile">{t('Пространства')}</th>
                <th className="hide-mobile">{t('Типы задач')}</th>
                <th className="is-narrow">{t('JQL')}</th>
                {canManage && <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id}>
                  <td>
                    <span className="settings-table-name">{field.name}{field.required && <span className="app-required"> *</span>}</span>
                    {field.description && <div className="settings-table-sub">{field.description}</div>}
                  </td>
                  <td>{t(FIELD_TYPES.find((type) => type.value === field.fieldType)?.label ?? field.fieldType)}</td>
                  <td className="hide-mobile">{field.boards.length ? field.boards.map((id) => boards.find((b) => b.id === id)?.name ?? id).join(', ') : t('Все')}</td>
                  <td className="hide-mobile">{field.issueTypes.length ? field.issueTypes.map(typeLabel).join(', ') : t('Все')}</td>
                  <td className="is-narrow"><code className="settings-code">{/\s/.test(field.name) ? `"${field.name}"` : field.name}</code></td>
                  {canManage && (
                    <td className="is-narrow">
                      <span className="settings-row-actions">
                        <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${field.name}`} onClick={() => setEditing(field)}><NavIcon name="edit" size={14} /></button>
                        <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${field.name}`} onClick={() => remove(field)}><NavIcon name="trash" size={14} /></button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {fields.length === 0 && <p className="settings-empty">{t(query ? 'Нет полей, соответствующих фильтру.' : 'В этой команде пока нет своих полей.')}</p>}
        </div>
      )}
      {editing && (
        <CustomFieldDialog
          teamId={teamId}
          field={editing.id ? editing : null}
          boards={boards}
          types={types}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </SettingsShell>
  );
}
