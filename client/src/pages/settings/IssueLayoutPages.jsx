import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { issueLayouts } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { BASE_TYPES, clearBoardIssueConfig } from '../../utils/issueConfig.js';
import { SYSTEM_FIELDS, fieldKey } from '../../utils/issueLayout.js';
import { TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import '../../components/CustomFields.css';

export const LAYOUT_KINDS = {
  screen: { title: 'Экраны', one: 'экран', create: 'Создать экран', empty: 'Экранов пока нет.' },
  screenscheme: { title: 'Схемы экранов', one: 'схему экранов', create: 'Создать схему экранов', empty: 'Схем экранов пока нет.' },
  typescreenscheme: { title: 'Схемы экранов типов задач', one: 'схему экранов типов задач', create: 'Создать схему экранов типов задач', empty: 'Схем экранов типов задач пока нет.' },
  fieldconfig: { title: 'Конфигурации полей', one: 'конфигурацию полей', create: 'Создать конфигурацию полей', empty: 'Конфигураций полей пока нет.' },
  fieldconfigscheme: { title: 'Схемы конфигураций полей', one: 'схему конфигураций полей', create: 'Создать схему конфигураций полей', empty: 'Схем конфигураций полей пока нет.' },
};

const OPERATIONS = [['create', 'Создание задачи'], ['edit', 'Редактирование задачи'], ['view', 'Просмотр задачи']];

/** Every field a screen or configuration can arrange, with display names. */
function useFieldChoices(catalog, teamId) {
  return useMemo(() => [
    ...SYSTEM_FIELDS.map(([key, label]) => ({ key, label, system: true })),
    ...(catalog?.fields || []).filter((f) => f.teamId === teamId).map((f) => ({ key: fieldKey(f.id), label: f.name, system: false })),
  ], [catalog, teamId]);
}

function issueTypeOptions(catalog, teamId) {
  return [
    ...BASE_TYPES.map((type) => ({ value: String(type.value), label: type.label })),
    ...(catalog?.types || []).filter((type) => type.teamId === teamId).map((type) => ({ value: type.id, label: `${type.icon} ${type.name}` })),
  ];
}

function LayoutModal({ title, onClose, onSubmit, saving, error, children, wide }) {
  const { t } = useLocalization();
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={`app-modal ${wide ? 'app-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
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
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Сохранить')}</button>
        </div>
      </form>
    </div>
  );
}

function ScreenEditor({ data, onChange, fields }) {
  const { t } = useLocalization();
  const tabs = data.tabs?.length ? data.tabs : [{ name: t('Поля'), fields: ['summary'] }];
  const used = new Set(tabs.flatMap((tab) => tab.fields));
  const label = (key) => fields.find((f) => f.key === key)?.label ?? key;
  const setTabs = (next) => onChange({ ...data, tabs: next });
  const updateTab = (index, patch) => setTabs(tabs.map((tab, i) => (i === index ? { ...tab, ...patch } : tab)));
  const move = (index, from, to) => {
    const list = [...tabs[index].fields];
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    updateTab(index, { fields: list });
  };
  return (
    <div className="settings-screen-editor">
      {tabs.map((tab, index) => (
        <fieldset key={index} className="settings-context-card">
          <div className="settings-context-head">
            <input aria-label={t('Название вкладки')} value={tab.name} maxLength={60} onChange={(e) => updateTab(index, { name: e.target.value })} />
            {tabs.length > 1 && (
              <button type="button" className="app-icon-btn" aria-label={`${t('Удалить вкладку')} ${tab.name}`} onClick={() => setTabs(tabs.filter((_, i) => i !== index))}>
                <NavIcon name="trash" size={14} />
              </button>
            )}
          </div>
          <ol className="settings-screen-fields">
            {tab.fields.map((key, position) => (
              <li key={key}>
                <span>{t(label(key))}</span>
                <span className="settings-row-actions">
                  <button type="button" className="app-icon-btn" aria-label={`${t('Выше')} ${label(key)}`} disabled={position === 0} onClick={() => move(index, position, position - 1)}><NavIcon name="arrowUp" size={12} /></button>
                  <button type="button" className="app-icon-btn" aria-label={`${t('Ниже')} ${label(key)}`} disabled={position === tab.fields.length - 1} onClick={() => move(index, position, position + 1)}><NavIcon name="arrowDown" size={12} /></button>
                  <button type="button" className="app-icon-btn" aria-label={`${t('Убрать с экрана')} ${label(key)}`} onClick={() => updateTab(index, { fields: tab.fields.filter((x) => x !== key) })}><NavIcon name="close" size={12} /></button>
                </span>
              </li>
            ))}
          </ol>
          <select aria-label={`${t('Добавить поле на вкладку')} ${tab.name}`} value="" onChange={(e) => e.target.value && updateTab(index, { fields: [...tab.fields, e.target.value] })}>
            <option value="">{t('Добавить поле…')}</option>
            {fields.filter((f) => !used.has(f.key)).map((f) => <option key={f.key} value={f.key}>{t(f.label)}</option>)}
          </select>
        </fieldset>
      ))}
      <button type="button" className="app-btn app-btn-subtle" onClick={() => setTabs([...tabs, { name: `${t('Вкладка')} ${tabs.length + 1}`, fields: [] }])}>{t('Добавить вкладку')}</button>
      {!used.has('summary') && <p className="app-modal-hint">{t('Без сводки на экране создания задачу не получится создать.')}</p>}
    </div>
  );
}

function ObjectSelect({ label, value, onChange, options, emptyLabel, required }) {
  const { t } = useLocalization();
  return (
    <label className="app-field">
      <span>{t(label)}{required && <span className="app-required"> *</span>}</span>
      <select aria-label={t(label)} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} required={required}>
        <option value="">{t(emptyLabel)}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function ScreenSchemeEditor({ data, onChange, screens }) {
  return (
    <>
      <ObjectSelect label="Экран по умолчанию" required value={data.default} options={screens} emptyLabel="Выберите экран" onChange={(value) => onChange({ ...data, default: value })} />
      {OPERATIONS.map(([op, label]) => (
        <ObjectSelect key={op} label={label} value={data[op]} options={screens} emptyLabel="Экран по умолчанию" onChange={(value) => onChange({ ...data, [op]: value })} />
      ))}
    </>
  );
}

function TypeMappingEditor({ data, onChange, targets, typeOptions, defaultLabel, defaultEmpty, required }) {
  const { t } = useLocalization();
  const types = data.types || {};
  return (
    <>
      <ObjectSelect label={defaultLabel} required={required} value={data.default} options={targets} emptyLabel={defaultEmpty} onChange={(value) => onChange({ ...data, default: value })} />
      <fieldset className="settings-choice-list">
        <legend>{t('Для отдельных типов задач')}</legend>
        {typeOptions.map((type) => (
          <label key={type.value} className="settings-mapping-row">
            <span>{t(type.label)}</span>
            <select
              aria-label={`${t('Для типа')} ${t(type.label)}`}
              value={types[type.value] ?? ''}
              onChange={(e) => {
                const next = { ...types };
                if (e.target.value) next[type.value] = e.target.value; else delete next[type.value];
                onChange({ ...data, types: next });
              }}
            >
              <option value="">{t('Как по умолчанию')}</option>
              {targets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        ))}
      </fieldset>
    </>
  );
}

function FieldConfigEditor({ data, onChange, fields }) {
  const { t } = useLocalization();
  const items = data.items || {};
  const set = (key, patch) => {
    const current = { required: false, hidden: false, description: '', ...items[key], ...patch };
    if (patch.hidden) current.required = false;
    onChange({ ...data, items: { ...items, [key]: current } });
  };
  return (
    <div className="settings-table-wrap">
      <table className="settings-table">
        <thead>
          <tr><th>{t('Поле')}</th><th className="is-narrow">{t('Обязательное')}</th><th className="is-narrow">{t('Скрытое')}</th><th>{t('Подсказка')}</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const rule = items[field.key] || {};
            const locked = field.key === 'summary';
            return (
              <tr key={field.key}>
                <td>{t(field.label)}{field.system && <span className="settings-table-sub"> {t('системное')}</span>}</td>
                <td className="is-narrow">
                  <input type="checkbox" aria-label={`${t('Обязательное')}: ${t(field.label)}`} checked={locked || !!rule.required} disabled={locked || rule.hidden || field.key === 'sprint'} onChange={(e) => set(field.key, { required: e.target.checked })} />
                </td>
                <td className="is-narrow">
                  <input type="checkbox" aria-label={`${t('Скрытое')}: ${t(field.label)}`} checked={!!rule.hidden} disabled={locked} onChange={(e) => set(field.key, { hidden: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={`${t('Подсказка')}: ${t(field.label)}`} value={rule.description ?? ''} maxLength={500} onChange={(e) => set(field.key, { description: e.target.value })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LayoutDialog({ kind, item, teamId, objects, fields, typeOptions, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [data, setData] = useState(() => item?.data ?? (kind === 'screen' ? { tabs: [{ name: t('Поля'), fields: ['summary', 'description'] }] } : {}));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const of = (k) => objects.filter((o) => o.kind === k);
  const meta = LAYOUT_KINDS[kind];

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { teamId, name, description, data };
      if (item) await issueLayouts.update(item.id, payload); else await issueLayouts.create(kind, payload);
      onSaved();
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayoutModal title={`${t(item ? 'Изменить' : 'Создать')} ${t(meta.one)}`} onClose={onClose} onSubmit={submit} saving={saving} error={error} wide={kind === 'fieldconfig'}>
      <label className="app-field">
        <span>{t('Название')} <span className="app-required">*</span></span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {kind === 'screen' && <ScreenEditor data={data} onChange={setData} fields={fields} />}
      {kind === 'screenscheme' && <ScreenSchemeEditor data={data} onChange={setData} screens={of('screen')} />}
      {kind === 'typescreenscheme' && (
        <TypeMappingEditor data={data} onChange={setData} targets={of('screenscheme')} typeOptions={typeOptions} required
          defaultLabel="Схема экранов по умолчанию" defaultEmpty="Выберите схему экранов" />
      )}
      {kind === 'fieldconfigscheme' && (
        <TypeMappingEditor data={data} onChange={setData} targets={of('fieldconfig')} typeOptions={typeOptions}
          defaultLabel="Конфигурация полей по умолчанию" defaultEmpty="Системная (все поля, ничего не обязательно)" />
      )}
      {kind === 'fieldconfig' && <FieldConfigEditor data={data} onChange={setData} fields={fields} />}
    </LayoutModal>
  );
}

function summarize(kind, item, objects, fields, typeOptions, t) {
  const nameOf = (id) => objects.find((o) => o.id === id)?.name ?? '—';
  const data = item.data || {};
  if (kind === 'screen') {
    const tabs = data.tabs || [];
    return tabs.map((tab) => `${tab.name}: ${tab.fields.map((key) => t(fields.find((f) => f.key === key)?.label ?? key)).join(', ')}`).join(' · ');
  }
  if (kind === 'screenscheme') {
    return [`${t('по умолчанию')}: ${nameOf(data.default)}`, ...OPERATIONS.filter(([op]) => data[op]).map(([op, label]) => `${t(label)}: ${nameOf(data[op])}`)].join(' · ');
  }
  if (kind === 'fieldconfig') {
    const items = Object.entries(data.items || {});
    const required = items.filter(([, r]) => r.required).length;
    const hidden = items.filter(([, r]) => r.hidden).length;
    return `${t('обязательных')}: ${required} · ${t('скрытых')}: ${hidden}`;
  }
  const typeName = (token) => t(typeOptions.find((o) => o.value === token)?.label ?? token);
  return [
    `${t('по умолчанию')}: ${data.default ? nameOf(data.default) : t('системная')}`,
    ...Object.entries(data.types || {}).map(([token, id]) => `${typeName(token)}: ${nameOf(id)}`),
  ].join(' · ');
}

function LayoutSection({ kind, state, catalog, teamId, onChanged }) {
  const { t } = useLocalization();
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const fields = useFieldChoices(catalog, teamId);
  const typeOptions = issueTypeOptions(catalog, teamId);
  const objects = state.objects;
  const items = objects.filter((o) => o.kind === kind);
  const meta = LAYOUT_KINDS[kind];

  const remove = async (item) => {
    if (!window.confirm(t('Удалить «{name}»?').replace('{name}', item.name))) return;
    try {
      await issueLayouts.remove(item.id);
      onChanged();
    } catch (e) {
      setError(t(e.message || 'Не удалось удалить.'));
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-title-row">
        <h2 className="settings-section-title">{t(meta.title)}</h2>
        {state.canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({})}>{t(meta.create)}</button>}
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {items.length === 0 ? <p className="settings-empty">{t(meta.empty)}</p> : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t('Имя')}</th>
                <th className="hide-mobile">{t('Настройки')}</th>
                <th className="hide-mobile">{t('Используется')}</th>
                {state.canManage && <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="settings-table-name">{item.name}</span>
                    {item.description && <div className="settings-table-sub">{item.description}</div>}
                  </td>
                  <td className="hide-mobile settings-table-sub">{summarize(kind, item, objects, fields, typeOptions, t)}</td>
                  <td className="hide-mobile">
                    {item.usedBy.length === 0 ? t('Не используется') : item.usedBy.map((u) => (u.kind === 'board' ? state.boards.find((b) => b.id === u.id)?.name : u.name)).filter(Boolean).join(', ')}
                  </td>
                  {state.canManage && (
                    <td className="is-narrow">
                      <span className="settings-row-actions">
                        <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${item.name}`} onClick={() => setEditing(item)}><NavIcon name="edit" size={14} /></button>
                        <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${item.name}`} disabled={item.usedBy.length > 0} title={item.usedBy.length > 0 ? t('Используется — удалить нельзя') : undefined} onClick={() => remove(item)}><NavIcon name="trash" size={14} /></button>
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
        <LayoutDialog
          kind={kind}
          item={editing.id ? editing : null}
          teamId={teamId}
          objects={objects}
          fields={fields}
          typeOptions={typeOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </section>
  );
}

export function useLayoutCatalog(teamId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!teamId) return;
    issueLayouts.catalog(teamId).then((value) => { setState(value); setError(''); clearBoardIssueConfig(); })
      .catch((e) => setError(e.message || 'Не удалось загрузить настройки.'));
  }, [teamId]);
  useEffect(() => { setState(null); reload(); }, [reload]);
  return { state, error, reload };
}

function LayoutPage({ kinds, title, description, breadcrumb }) {
  const { t } = useLocalization();
  const { catalog, error: catalogError } = useIssueCatalog();
  const [teamId, setTeamId] = useTeamSelection(catalog?.teams);
  const { state, error, reload } = useLayoutCatalog(teamId);
  const [tab, setTab] = useState(kinds[0]);
  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], [breadcrumb]]} title={t(title)} description={t(description)}>
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
      </div>
      <div className="settings-tabs" role="tablist">
        {kinds.map((kind) => (
          <button key={kind} type="button" role="tab" aria-selected={tab === kind} className={tab === kind ? 'is-active' : ''} onClick={() => setTab(kind)}>{t(LAYOUT_KINDS[kind].title)}</button>
        ))}
      </div>
      {(catalogError || error) && <p className="settings-save-status is-error" role="alert">{t(catalogError || error)}</p>}
      {!state && !error && !catalogError && <p className="settings-empty">{t('Загрузка…')}</p>}
      {state && !state.canManage && <p className="settings-section-desc">{t('Настраивать экраны и поля может только владелец или администратор команды.')}</p>}
      {state && <LayoutSection key={tab} kind={tab} state={state} catalog={catalog} teamId={teamId} onChanged={reload} />}
    </SettingsShell>
  );
}

export function ScreensPage() {
  return (
    <LayoutPage
      kinds={['screen', 'screenscheme', 'typescreenscheme']}
      title="Экраны"
      breadcrumb="Экраны"
      description="Экран задаёт, какие поля и в каком порядке видны при создании, редактировании и просмотре задачи. Схема экранов связывает экраны с этими операциями, а схема экранов типов задач — с типами задач. Схему назначают пространству в его настройках."
    />
  );
}

export function FieldConfigurationsPage() {
  return (
    <LayoutPage
      kinds={['fieldconfig', 'fieldconfigscheme']}
      title="Конфигурации полей"
      breadcrumb="Конфигурации полей"
      description="Конфигурация полей делает поля обязательными или скрытыми и задаёт подсказки. Схема конфигураций полей выбирает конфигурацию для каждого типа задачи; её назначают пространству в его настройках."
    />
  );
}

/** Space settings block: which schemes this space uses. */
export function SpaceLayoutSettings({ boardId, teamId }) {
  const { t } = useLocalization();
  const { state, error, reload } = useLayoutCatalog(teamId);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const board = state?.boards.find((b) => b.id === boardId);
  const of = (kind) => (state?.objects || []).filter((o) => o.kind === kind);

  const save = async (patch) => {
    setSaving(true);
    setStatus('');
    try {
      await issueLayouts.assign(boardId, {
        fieldConfigurationSchemeId: board?.fieldConfigurationSchemeId ?? null,
        issueTypeScreenSchemeId: board?.issueTypeScreenSchemeId ?? null,
        ...patch,
      });
      setStatus(t('Сохранено'));
      reload();
    } catch (e) {
      setStatus(t(e.message || 'Не удалось сохранить.'));
    } finally {
      setSaving(false);
    }
  };

  if (!teamId) return null;
  return (
    <section className="settings-section" aria-label={t('Поля и экраны')}>
      <h2 className="settings-section-title">{t('Поля и экраны')}</h2>
      <p className="settings-section-desc">{t('Схемы определяют, какие поля видны при создании и просмотре задач этого пространства и какие из них обязательны.')}</p>
      {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
      {state && (
        <>
          <label className="app-field">
            <span>{t('Схема экранов типов задач')}</span>
            <select disabled={saving} value={board?.issueTypeScreenSchemeId ?? ''} onChange={(e) => save({ issueTypeScreenSchemeId: e.target.value || null })}>
              <option value="">{t('Системная (все поля)')}</option>
              {of('typescreenscheme').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="app-field">
            <span>{t('Схема конфигураций полей')}</span>
            <select disabled={saving} value={board?.fieldConfigurationSchemeId ?? ''} onChange={(e) => save({ fieldConfigurationSchemeId: e.target.value || null })}>
              <option value="">{t('Системная (ничего не обязательно)')}</option>
              {of('fieldconfigscheme').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          {status && <p className="settings-save-status" role="status">{status}</p>}
        </>
      )}
    </section>
  );
}
