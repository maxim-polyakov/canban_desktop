import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { sharedWorkflows } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { clearBoardIssueConfig } from '../../utils/issueConfig.js';
import WorkflowDesigner from '../workflow/WorkflowDesigner.jsx';
import { TeamPicker, useIssueCatalog, useTeamSelection } from './IssueConfigPages.jsx';
import { LayoutModal, TypeMappingEditor, issueTypeOptions, useFieldChoices } from './IssueLayoutPages.jsx';
import SettingsShell, { ADMIN_NAV } from './SettingsShell.jsx';
import '../../components/CustomFields.css';

const TABS = [['workflow', 'Workflow'], ['workflowscheme', 'Схемы workflow']];

export function useWorkflowCatalog(teamId) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    if (!teamId) return;
    sharedWorkflows.catalog(teamId).then((value) => { setState(value); setError(''); clearBoardIssueConfig(); })
      .catch((e) => setError(e.message || 'Не удалось загрузить workflow.'));
  }, [teamId]);
  useEffect(() => { setState(null); reload(); }, [reload]);
  return { state, error, reload };
}

function usedByText(item, state, t) {
  if (item.usedBy.length === 0) return t('Не используется');
  return item.usedBy.map((u) => (u.kind === 'board' ? state.boards.find((b) => b.id === u.id)?.name : u.name)).filter(Boolean).join(', ');
}

function CreateWorkflowDialog({ teamId, state, onClose }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const item = source.startsWith('board:')
        ? await sharedWorkflows.fromBoard(source.slice(6), name.trim() || null)
        : await sharedWorkflows.create('workflow', {
          teamId, name, data: source ? state.objects.find((o) => o.id === source)?.data : undefined,
        });
      navigate(`/settings/issues/workflows/${item.id}`);
    } catch (e) {
      setError(t(e.message || 'Не удалось создать workflow.'));
      setSaving(false);
    }
  };
  return (
    <LayoutModal title={t('Создать workflow')} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <label className="app-field">
        <span>{t('Название')}{!source.startsWith('board:') && <span className="app-required"> *</span>}</span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required={!source.startsWith('board:')} autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Основа')}</span>
        <select aria-label={t('Основа')} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t('Простой: К выполнению → В работе → Готово')}</option>
          <optgroup label={t('Копия workflow')}>
            {state.objects.filter((o) => o.kind === 'workflow').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </optgroup>
          <optgroup label={t('Статусы и переходы пространства')}>
            {state.boards.map((b) => <option key={b.id} value={`board:${b.id}`}>{b.name}</option>)}
          </optgroup>
        </select>
      </label>
    </LayoutModal>
  );
}

function SchemeDialog({ item, teamId, state, typeOptions, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [data, setData] = useState(item?.data ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { teamId, name, description, data };
      if (item) await sharedWorkflows.update(item.id, payload); else await sharedWorkflows.create('workflowscheme', payload);
      onSaved();
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить.'));
      setSaving(false);
    }
  };
  return (
    <LayoutModal title={t(item ? 'Изменить схему workflow' : 'Создать схему workflow')} onClose={onClose} onSubmit={submit} saving={saving} error={error}>
      <label className="app-field">
        <span>{t('Название')} <span className="app-required">*</span></span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <TypeMappingEditor data={data} onChange={setData} targets={state.objects.filter((o) => o.kind === 'workflow')} typeOptions={typeOptions} required
        defaultLabel="Workflow по умолчанию" defaultEmpty="Выберите workflow" />
    </LayoutModal>
  );
}

export function WorkflowsPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { catalog, error: catalogError } = useIssueCatalog();
  const [teamId, setTeamId] = useTeamSelection(catalog?.teams);
  const { state, error, reload } = useWorkflowCatalog(teamId);
  const [tab, setTab] = useState('workflow');
  const [editing, setEditing] = useState(null);
  const [actionError, setActionError] = useState('');
  const typeOptions = issueTypeOptions(catalog, teamId);
  const items = (state?.objects || []).filter((o) => o.kind === tab);
  const nameOf = (id) => state?.objects.find((o) => o.id === id)?.name ?? '—';
  const remove = async (item) => {
    if (!window.confirm(t('Удалить «{name}»?').replace('{name}', item.name))) return;
    try { await sharedWorkflows.remove(item.id); reload(); } catch (e) { setActionError(t(e.message || 'Не удалось удалить.')); }
  };
  const summary = (item) => {
    if (item.kind === 'workflow') return `${t('статусов')}: ${item.data.statuses?.length ?? 0} · ${t('переходов')}: ${item.data.transitions?.length ?? 0}`;
    return [
      `${t('по умолчанию')}: ${nameOf(item.data.default)}`,
      ...Object.entries(item.data.types || {}).map(([token, id]) => `${t(typeOptions.find((o) => o.value === token)?.label ?? token)}: ${nameOf(id)}`),
    ].join(' · ');
  };

  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Задачи'], ['Workflow']]} title={t('Workflow')}
      description={t('Общие workflow задают статусы и переходы с условиями, валидаторами, экранами и действиями. Схема workflow выбирает workflow для каждого типа задачи; её назначают пространству в настройках его рабочих процессов.')}>
      <div className="settings-toolbar">
        <TeamPicker teams={catalog?.teams} value={teamId} onChange={setTeamId} />
      </div>
      <div className="settings-tabs" role="tablist">
        {TABS.map(([kind, label]) => (
          <button key={kind} type="button" role="tab" aria-selected={tab === kind} className={tab === kind ? 'is-active' : ''} onClick={() => setTab(kind)}>{t(label)}</button>
        ))}
      </div>
      {(catalogError || error || actionError) && <p className="settings-save-status is-error" role="alert">{t(catalogError || error || actionError)}</p>}
      {!state && !error && !catalogError && <p className="settings-empty">{t('Загрузка…')}</p>}
      {state && !state.canManage && <p className="settings-section-desc">{t('Настраивать workflow может только владелец или администратор команды.')}</p>}
      {state && (
        <section className="settings-section">
          <div className="settings-title-row">
            <h2 className="settings-section-title">{t(tab === 'workflow' ? 'Workflow' : 'Схемы workflow')}</h2>
            {state.canManage && (
              <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({ kind: tab })}>
                {t(tab === 'workflow' ? 'Создать workflow' : 'Создать схему workflow')}
              </button>
            )}
          </div>
          {items.length === 0 ? <p className="settings-empty">{t(tab === 'workflow' ? 'Общих workflow пока нет.' : 'Схем workflow пока нет.')}</p> : (
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
                        {item.kind === 'workflow' ? <Link className="settings-table-name" to={`/settings/issues/workflows/${item.id}`}>{item.name}</Link> : <span className="settings-table-name">{item.name}</span>}
                        {item.description && <div className="settings-table-sub">{item.description}</div>}
                      </td>
                      <td className="hide-mobile settings-table-sub">{summary(item)}</td>
                      <td className="hide-mobile">{usedByText(item, state, t)}</td>
                      {state.canManage && (
                        <td className="is-narrow">
                          <span className="settings-row-actions">
                            <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${item.name}`}
                              onClick={() => (item.kind === 'workflow' ? navigate(`/settings/issues/workflows/${item.id}`) : setEditing(item))}>
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
          )}
        </section>
      )}
      {editing?.kind === 'workflow' && !editing.id && <CreateWorkflowDialog teamId={teamId} state={state} onClose={() => setEditing(null)} />}
      {editing?.kind === 'workflowscheme' && (
        <SchemeDialog item={editing.id ? editing : null} teamId={teamId} state={state} typeOptions={typeOptions}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </SettingsShell>
  );
}

export function WorkflowDesignerPage() {
  const { id } = useParams();
  const { t } = useLocalization();
  const { catalog } = useIssueCatalog();
  const [item, setItem] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { state } = useWorkflowCatalog(item?.teamId);
  const fields = useFieldChoices(catalog, item?.teamId);

  useEffect(() => {
    setItem(null);
    sharedWorkflows.get(id).then((value) => { setItem(value); setDraft({ name: value.name, description: value.description ?? '', data: value.data }); })
      .catch((e) => setError(e.message || 'Не удалось загрузить workflow.'));
  }, [id]);

  const dirty = item && draft && (draft.name !== item.name || draft.description !== (item.description ?? '') || JSON.stringify(draft.data) !== JSON.stringify(item.data));
  const save = async () => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const saved = await sharedWorkflows.update(id, { teamId: item.teamId, ...draft });
      setItem(saved);
      setDraft({ name: saved.name, description: saved.description ?? '', data: saved.data });
      setStatus(t('Сохранено'));
      clearBoardIssueConfig();
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить.'));
    } finally {
      setSaving(false);
    }
  };
  const canManage = !!state?.canManage;

  return (
    <SettingsShell nav={ADMIN_NAV} wide breadcrumbs={[['Настройки Канбан', '/admin'], ['Workflow', '/settings/issues/workflows'], [item?.name || '…']]}
      title={item?.name || t('Workflow')}
      actions={canManage && (
        <span className="settings-row-actions">
          {status && !dirty && <span className="settings-save-status" role="status">{status}</span>}
          {dirty && <span className="settings-save-status">{t('Есть несохранённые изменения')}</span>}
          <button type="button" className="app-btn app-btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? '…' : t('Сохранить')}</button>
        </span>
      )}>
      {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
      {draft && (
        <>
          <div className="wf-designer-meta">
            <label className="app-field">
              <span>{t('Название')}</span>
              <input value={draft.name} maxLength={100} disabled={!canManage} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="app-field">
              <span>{t('Описание')}</span>
              <input value={draft.description} maxLength={500} disabled={!canManage} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>
          </div>
          {item.usedBy?.length > 0 && <p className="settings-section-desc">{t('Изменения сразу применяются ко всем пространствам, которые используют этот workflow.')}</p>}
          <WorkflowDesigner value={draft.data} onChange={(data) => setDraft((d) => ({ ...d, data }))} fields={fields}
            screens={state?.screens || []} groups={state?.groups || []} readOnly={!canManage} />
        </>
      )}
    </SettingsShell>
  );
}

function MigrationDialog({ migrations, typeOptions, onCancel, onConfirm }) {
  const { t } = useLocalization();
  const [choices, setChoices] = useState(() => Object.fromEntries(migrations.map((m) => [`${m.issueType}|${m.columnId}`, m.statuses[0]])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onConfirm(migrations.map((m) => ({ issueType: m.issueType, columnId: m.columnId, status: choices[`${m.issueType}|${m.columnId}`] })));
    } catch (e) {
      setError(t(e.message || 'Не удалось сменить схему.'));
      setSaving(false);
    }
  };
  return (
    <LayoutModal title={t('Перенос задач в новый workflow')} onClose={onCancel} onSubmit={submit} saving={saving} error={error} wide>
      <p className="app-modal-hint">{t('В новом workflow нет некоторых текущих статусов. Выберите, в какой статус перенести эти задачи.')}</p>
      <table className="settings-table">
        <thead><tr><th>{t('Тип задачи')}</th><th>{t('Текущий статус')}</th><th className="is-narrow">{t('Задач')}</th><th>{t('Новый статус')}</th></tr></thead>
        <tbody>
          {migrations.map((m) => {
            const key = `${m.issueType}|${m.columnId}`;
            return (
              <tr key={key}>
                <td>{t(typeOptions.find((o) => o.value === m.issueType)?.label ?? m.issueType)}</td>
                <td>{m.columnTitle}</td>
                <td className="is-narrow">{m.count}</td>
                <td>
                  <select aria-label={`${t('Новый статус')}: ${m.columnTitle}`} value={choices[key]} onChange={(e) => setChoices({ ...choices, [key]: e.target.value })}>
                    {m.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </LayoutModal>
  );
}

/** Space workflow settings: which workflow scheme the space uses. */
export function SpaceWorkflowScheme({ boardId, teamId, onSchemeChange }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { catalog } = useIssueCatalog();
  const { state, error, reload } = useWorkflowCatalog(teamId);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [migration, setMigration] = useState(null);
  const board = state?.boards.find((b) => b.id === boardId);
  const schemeId = board?.workflowSchemeId ?? null;
  const scheme = state?.objects.find((o) => o.id === schemeId);
  const typeOptions = issueTypeOptions(catalog, teamId);
  const fields = useFieldChoices(catalog, teamId);

  useEffect(() => { if (state) onSchemeChange?.(schemeId); }, [state, schemeId, onSchemeChange]);

  const assign = async (next, migrations) => {
    await sharedWorkflows.assign(boardId, { workflowSchemeId: next, migrations });
    setMigration(null);
    setStatus(t('Сохранено'));
    clearBoardIssueConfig(boardId);
    reload();
  };
  const choose = async (next) => {
    setBusy(true);
    setStatus('');
    try {
      const preview = next ? await sharedWorkflows.preview(boardId, next) : { migrations: [] };
      if (preview.migrations.length > 0) setMigration({ schemeId: next, migrations: preview.migrations });
      else await assign(next, []);
    } catch (e) {
      setStatus(t(e.message || 'Не удалось сменить схему.'));
    } finally {
      setBusy(false);
    }
  };
  const copyFromSpace = async () => {
    setBusy(true);
    try {
      const item = await sharedWorkflows.fromBoard(boardId, null);
      navigate(`/settings/issues/workflows/${item.id}`);
    } catch (e) {
      setStatus(t(e.message || 'Не удалось создать workflow.'));
      setBusy(false);
    }
  };
  const workflowsInScheme = scheme
    ? [scheme.data.default, ...Object.values(scheme.data.types || {})].filter((v, i, a) => v && a.indexOf(v) === i)
      .map((id) => state.objects.find((o) => o.id === id)).filter(Boolean)
    : [];

  if (!teamId) return null;
  return (
    <section className="wf-section" aria-label={t('Схема workflow')}>
      <h2>{t('Схема workflow')}</h2>
      <p className="wf-muted">{t('С общей схемой статусы и переходы задаются общими workflow по типам задач, как в Jira. Без схемы пространство использует свои переходы ниже.')}</p>
      {error && <p className="jira-error" role="alert">{t(error)}</p>}
      {state && (
        <div className="wf-copy">
          <select aria-label={t('Схема workflow')} value={schemeId ?? ''} disabled={busy} onChange={(e) => choose(e.target.value || null)}>
            <option value="">{t('Своя (переходы пространства)')}</option>
            {state.objects.filter((o) => o.kind === 'workflowscheme').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Link className="app-btn app-btn-subtle" to="/settings/issues/workflows">{t('Управление workflow')}</Link>
          {!schemeId && state.canManage && <button type="button" className="app-btn app-btn-subtle" disabled={busy} onClick={copyFromSpace}>{t('Сделать общий workflow из этого пространства')}</button>}
        </div>
      )}
      {status && <p className="settings-save-status" role="status">{status}</p>}
      {workflowsInScheme.map((w) => {
        const types = [
          ...(scheme.data.default === w.id ? [t('по умолчанию')] : []),
          ...Object.entries(scheme.data.types || {}).filter(([, id]) => id === w.id).map(([token]) => t(typeOptions.find((o) => o.value === token)?.label ?? token)),
        ];
        return (
          <div key={w.id} className="wf-scheme-workflow">
            <h3><Link to={`/settings/issues/workflows/${w.id}`}>{w.name}</Link> <span className="wf-muted">({types.join(', ')})</span></h3>
            <WorkflowDesigner value={w.data} onChange={() => {}} fields={fields} screens={state.screens} groups={state.groups} readOnly />
          </div>
        );
      })}
      {migration && (
        <MigrationDialog migrations={migration.migrations} typeOptions={typeOptions} onCancel={() => setMigration(null)}
          onConfirm={(list) => assign(migration.schemeId, list)} />
      )}
    </section>
  );
}
