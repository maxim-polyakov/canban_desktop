import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boards, columns as columnsApi, teams as teamsApi, workflows } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon, getPriorityMeta } from '../../components/IssueIcons.jsx';
import { BASE_TYPES, useBoardIssueConfig } from '../../utils/issueConfig.js';
import { STATUS_KINDS } from '../../utils/workflow.js';
import { SpaceWorkflowScheme } from '../settings/WorkflowPages.jsx';
import './WorkflowEditor.css';

export { STATUS_KINDS };
const ROLES = [
  { value: '', label: 'Любой участник с правом работы' },
  { value: 'Manage', label: 'Руководитель проекта и выше' },
  { value: 'Admin', label: 'Только администратор' },
];
const SYSTEM_FIELDS = [
  { value: 'description', label: 'Описание' },
  { value: 'duedate', label: 'Срок' },
  { value: 'storypoints', label: 'Story Points' },
  { value: 'remainingestimate', label: 'Оставшееся время' },
  { value: 'fixversion', label: 'Версия исправления' },
  { value: 'component', label: 'Компонент' },
];
const ASSIGNEE_ACTIONS = [
  { value: '', label: 'Не менять исполнителя' },
  { value: 'currentUser', label: 'Назначить на того, кто выполняет переход' },
  { value: 'unassigned', label: 'Снять исполнителя' },
];

const categoryOf = (kind) => STATUS_KINDS.find((x) => x.value === kind)?.category ?? 'todo';
const parseJson = (text) => { try { return text ? JSON.parse(text) : {}; } catch { return {}; } };
const splitList = (text) => String(text || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Form state for a transition from its API shape. */
export function transitionToForm(item, firstColumnId = '') {
  const conditions = parseJson(item?.conditionsJson);
  const post = parseJson(item?.postFunctionsJson);
  return {
    name: item?.name ?? '',
    fromAnyStatus: !!item?.fromAnyStatus,
    sourceColumnId: item?.sourceColumnId ?? firstColumnId,
    targetColumnId: item?.targetColumnId ?? '',
    issueTypes: splitList(item?.allowedIssueTypes),
    role: splitList(item?.allowedRoles)[0] ?? '',
    requireAssignee: !!conditions.requireAssignee,
    onlyAssignee: !!conditions.onlyAssignee,
    requireEstimate: !!conditions.requireEstimate,
    requiredFields: Array.isArray(conditions.requiredFields) ? conditions.requiredFields : [],
    assignee: post.assignee ?? '',
    priority: Number.isInteger(post.priority) ? String(post.priority) : '',
    enabled: item?.enabled ?? true,
  };
}

/** API payload for a transition form. */
export function formToTransition(form) {
  const conditions = {};
  if (form.requireAssignee) conditions.requireAssignee = true;
  if (form.onlyAssignee) conditions.onlyAssignee = true;
  if (form.requireEstimate) conditions.requireEstimate = true;
  if (form.requiredFields.length) conditions.requiredFields = form.requiredFields;
  const post = {};
  if (form.assignee) post.assignee = form.assignee;
  if (form.priority !== '') post.priority = Number(form.priority);
  return {
    name: form.name.trim(),
    sourceColumnId: form.fromAnyStatus ? form.targetColumnId : form.sourceColumnId,
    targetColumnId: form.targetColumnId,
    fromAnyStatus: form.fromAnyStatus,
    allowedIssueTypes: form.issueTypes.join(','),
    allowedRoles: form.role,
    conditionsJson: Object.keys(conditions).length ? JSON.stringify(conditions) : null,
    postFunctionsJson: Object.keys(post).length ? JSON.stringify(post) : null,
    enabled: form.enabled,
  };
}

export function WorkflowDiagram({ statuses, transitions }) {
  const { t } = useLocalization();
  const width = 150;
  const gap = 70;
  const boxH = 36;
  const top = 90;
  const pos = new Map(statuses.map((s, i) => [s.id, i]));
  const centre = (i) => 20 + i * (width + gap) + width / 2;
  const total = Math.max(1, statuses.length) * (width + gap) - gap + 40;
  const visible = transitions.filter((x) => pos.has(x.targetColumnId) && (x.fromAnyStatus || pos.has(x.sourceColumnId)));
  return (
    <div className="wf-diagram" role="img" aria-label={t('Схема workflow')}>
      <svg viewBox={`0 0 ${total} 220`} width={total} height={220}>
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" fill="currentColor" />
          </marker>
        </defs>
        {visible.map((x, index) => {
          const to = pos.get(x.targetColumnId);
          const cls = `wf-edge${x.enabled ? '' : ' is-disabled'}`;
          if (x.fromAnyStatus) {
            const cx = centre(to);
            return (
              <g key={x.id} className={cls}>
                <path d={`M${cx} ${top - 46} L${cx} ${top - 2}`} markerEnd="url(#wf-arrow)" />
                <text x={cx} y={top - 52} textAnchor="middle">{t('Любой')} · {x.name}</text>
              </g>
            );
          }
          const from = pos.get(x.sourceColumnId);
          const forward = to > from;
          const span = Math.abs(to - from);
          const x1 = centre(from) + (forward ? 12 : -12);
          const x2 = centre(to) + (forward ? -12 : 12);
          const y = forward ? top : top + boxH;
          const bend = (forward ? -1 : 1) * (26 + span * 14 + (index % 3) * 6);
          const mid = (x1 + x2) / 2;
          return (
            <g key={x.id} className={cls}>
              <path d={`M${x1} ${y} Q${mid} ${y + bend * 2} ${x2} ${y}`} markerEnd="url(#wf-arrow)" />
              <text x={mid} y={y + bend + (forward ? -4 : 12)} textAnchor="middle">{x.name}</text>
            </g>
          );
        })}
        {statuses.map((s, i) => (
          <g key={s.id} className={`wf-status is-${categoryOf(s.kind)}`}>
            <rect x={centre(i) - width / 2} y={top} width={width} height={boxH} rx="4" />
            <text x={centre(i)} y={top + boxH / 2 + 4} textAnchor="middle">{(s.title || '').toUpperCase().slice(0, 18)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Checklist({ options, value, onChange, allLabel }) {
  const { t } = useLocalization();
  return (
    <div className="wf-checklist">
      {allLabel && <span className="wf-muted">{value.length === 0 ? t(allLabel) : ''}</span>}
      {options.map((option) => (
        <label key={option.value} className="wf-check">
          <input
            type="checkbox"
            checked={value.includes(option.value)}
            onChange={(e) => onChange(e.target.checked ? [...value, option.value] : value.filter((x) => x !== option.value))}
          />
          {option.icon}{t(option.label)}
        </label>
      ))}
    </div>
  );
}

function TransitionDialog({ boardId, statuses, item, config, onClose, onSaved }) {
  const { t } = useLocalization();
  const [form, setForm] = useState(() => transitionToForm(item, statuses[0]?.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const typeOptions = [
    ...BASE_TYPES.map((x) => ({ value: String(x.value), label: x.label, icon: <IssueTypeIcon issueType={x.value} size={14} /> })),
    ...config.types.map((x) => ({ value: x.id, label: x.name, icon: <IssueTypeIcon issueType={x.baseType} typeId={x.id} size={14} /> })),
  ];
  const fieldOptions = [...SYSTEM_FIELDS, ...config.fields.map((f) => ({ value: `cf:${f.id}`, label: f.name }))];
  const valid = form.name.trim() && form.targetColumnId && (form.fromAnyStatus || (form.sourceColumnId && form.sourceColumnId !== form.targetColumnId));

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      const payload = formToTransition(form);
      if (item?.id) await workflows.update(boardId, item.id, payload);
      else await workflows.save(boardId, payload);
      onSaved();
    } catch (err) {
      setError(t(err.message || 'Не удалось сохранить переход.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal wf-dialog" role="dialog" aria-modal="true" aria-label={t(item?.id ? 'Изменить переход' : 'Добавить переход')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t(item?.id ? 'Изменить переход' : 'Добавить переход')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <label className="app-field">
            <span>{t('Название перехода')} <span className="app-required">*</span></span>
            <input value={form.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} placeholder={t('Например: Начать работу')} required autoFocus />
          </label>
          <label className="app-check">
            <input type="checkbox" checked={form.fromAnyStatus} onChange={(e) => set({ fromAnyStatus: e.target.checked })} />
            {t('Из любого статуса (глобальный переход)')}
          </label>
          <div className="wf-row">
            {!form.fromAnyStatus && (
              <label className="app-field">
                <span>{t('Из статуса')}</span>
                <select aria-label={t('Из статуса')} value={form.sourceColumnId} onChange={(e) => set({ sourceColumnId: e.target.value })}>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </label>
            )}
            <label className="app-field">
              <span>{t('В статус')} <span className="app-required">*</span></span>
              <select aria-label={t('В статус')} value={form.targetColumnId} onChange={(e) => set({ targetColumnId: e.target.value })} required>
                <option value="">{t('Выберите статус')}</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          </div>

          <h3 className="wf-dialog-section">{t('Условия')}</h3>
          <div className="app-field">
            <span>{t('Типы задач')}</span>
            <Checklist options={typeOptions} value={form.issueTypes} onChange={(issueTypes) => set({ issueTypes })} allLabel="Все типы задач, если ничего не выбрано" />
          </div>
          <label className="app-field">
            <span>{t('Кто может выполнять')}</span>
            <select value={form.role} onChange={(e) => set({ role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{t(r.label)}</option>)}
            </select>
          </label>
          <label className="app-check"><input type="checkbox" checked={form.onlyAssignee} onChange={(e) => set({ onlyAssignee: e.target.checked })} />{t('Только исполнитель задачи')}</label>
          <label className="app-check"><input type="checkbox" checked={form.requireAssignee} onChange={(e) => set({ requireAssignee: e.target.checked })} />{t('У задачи должен быть исполнитель')}</label>
          <label className="app-check"><input type="checkbox" checked={form.requireEstimate} onChange={(e) => set({ requireEstimate: e.target.checked })} />{t('У задачи должна быть оценка')}</label>
          <div className="app-field">
            <span>{t('Обязательные поля')}</span>
            <Checklist options={fieldOptions} value={form.requiredFields} onChange={(requiredFields) => set({ requiredFields })} />
          </div>

          <h3 className="wf-dialog-section">{t('Действия после перехода')}</h3>
          <label className="app-field">
            <span>{t('Исполнитель')}</span>
            <select value={form.assignee} onChange={(e) => set({ assignee: e.target.value })}>
              {ASSIGNEE_ACTIONS.map((a) => <option key={a.value} value={a.value}>{t(a.label)}</option>)}
            </select>
          </label>
          <label className="app-field">
            <span>{t('Приоритет')}</span>
            <select value={form.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">{t('Не менять приоритет')}</option>
              {[4, 3, 2, 1, 0].map((p) => <option key={p} value={String(p)}>{t(getPriorityMeta(p).label)}</option>)}
            </select>
          </label>
          <label className="app-check"><input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />{t('Переход включён')}</label>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving || !valid}>{saving ? '…' : t(item?.id ? 'Сохранить' : 'Добавить')}</button>
        </div>
      </form>
    </div>
  );
}

export function describeTransition(item, { config, t }) {
  const conditions = parseJson(item.conditionsJson);
  const post = parseJson(item.postFunctionsJson);
  const parts = [];
  const types = splitList(item.allowedIssueTypes);
  if (types.length) {
    parts.push(`${t('Типы')}: ${types.map((x) => config.types.find((c) => c.id === x)?.name
      ?? t(BASE_TYPES.find((b) => String(b.value) === x || ['Epic', 'Story', 'Task', 'Bug', 'Subtask'][b.value] === x)?.label ?? x)).join(', ')}`);
  }
  const role = splitList(item.allowedRoles)[0];
  if (role) parts.push(t(ROLES.find((r) => r.value === role)?.label ?? role));
  if (conditions.onlyAssignee) parts.push(t('Только исполнитель задачи'));
  if (conditions.requireAssignee) parts.push(t('Нужен исполнитель'));
  if (conditions.requireEstimate) parts.push(t('Нужна оценка'));
  if (conditions.requiredFields?.length) {
    parts.push(`${t('Поля')}: ${conditions.requiredFields.map((f) => (f.startsWith('cf:')
      ? config.fields.find((x) => `cf:${x.id}` === f)?.name ?? t('удалённое поле')
      : t(SYSTEM_FIELDS.find((x) => x.value === f)?.label ?? f))).join(', ')}`);
  }
  const actions = [];
  if (post.assignee) actions.push(t(ASSIGNEE_ACTIONS.find((a) => a.value === post.assignee)?.label ?? post.assignee));
  if (Number.isInteger(post.priority)) actions.push(`${t('Приоритет')}: ${t(getPriorityMeta(post.priority).label)}`);
  return { conditions: parts, actions };
}

export default function WorkflowEditor({ boardId }) {
  const { t } = useLocalization();
  const [statuses, setStatuses] = useState([]);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [spaces, setSpaces] = useState([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [teamId, setTeamId] = useState(null);
  const [schemeId, setSchemeId] = useState(undefined);
  const config = useBoardIssueConfig(boardId);

  const load = useCallback(async () => {
    try {
      const [board, list] = await Promise.all([boards.getById(boardId), workflows.getByBoard(boardId)]);
      setTeamId(board?.teamId ?? null);
      setStatuses([...(board?.columns || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setItems(Array.isArray(list) ? list : []);
    } catch (e) { setError(e.message); }
  }, [boardId]);
  useEffect(() => { load(); }, [load]);
  const previousScheme = useRef(undefined);
  useEffect(() => {
    if (previousScheme.current !== undefined && previousScheme.current !== schemeId) load();
    previousScheme.current = schemeId;
  }, [schemeId, load]);
  useEffect(() => {
    teamsApi.getMyTeamsWithBoards().then((list) => {
      const all = (Array.isArray(list) ? list : []).flatMap((entry) => (entry.boards ?? []).map((b) => ({ id: b.id, name: b.name, team: entry.team?.name ?? '' })));
      setSpaces(all.filter((b) => b.id !== boardId));
    }).catch(() => setSpaces([]));
  }, [boardId]);

  const title = (id) => statuses.find((s) => s.id === id)?.title || '?';
  const act = async (fn) => {
    setError('');
    try { await fn(); await load(); } catch (e) { setError(t(e.message || 'Не удалось сохранить workflow.')); }
  };
  const changeKind = (status, kind) => act(() => columnsApi.update(status.id, { kind }));
  const toggle = (item) => act(() => workflows.update(boardId, item.id, { ...item, enabled: !item.enabled }));
  const remove = (item) => { if (window.confirm(t('Удалить переход «{name}»?').replace('{name}', item.name))) act(() => workflows.remove(boardId, item.id)); };
  const copy = () => {
    if (!copyFrom) return;
    if (!window.confirm(t('Текущие переходы этого пространства будут заменены. Продолжить?'))) return;
    act(() => workflows.copy(boardId, copyFrom));
  };
  const sortedItems = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const diagramStatuses = statuses.filter((s) => s.kind !== 5);

  return (
    <div className="wf-editor">
      <div className="jira-header wf-header">
        <h1>{t('Редактор workflow')}</h1>
        {!schemeId && <button type="button" className="app-btn app-btn-primary" onClick={() => setEditing({})} disabled={statuses.length < 1}>{t('Добавить переход')}</button>}
      </div>
      <p className="wf-muted">{t('Workflow определяет, между какими статусами можно перемещать задачи, кто это может делать и что происходит после перехода. Если переходов нет, задачи можно перемещать между любыми статусами.')}</p>
      {error && <p className="jira-error" role="alert">{error}</p>}

      <SpaceWorkflowScheme boardId={boardId} teamId={teamId} onSchemeChange={setSchemeId} />

      {!schemeId && <>
      <section className="wf-section">
        <h2>{t('Статусы')}</h2>
        <p className="wf-muted">{t('Категория статуса определяет цвет на досках и то, считается ли задача решённой.')}</p>
        <div className="wf-statuses">
          {statuses.map((s) => (
            <label key={s.id} className={`wf-status-card is-${categoryOf(s.kind)}`}>
              <span className="wf-status-name">{s.title}</span>
              <select aria-label={`${t('Категория')} ${s.title}`} value={s.kind ?? 0} onChange={(e) => changeKind(s, Number(e.target.value))}>
                {STATUS_KINDS.map((k) => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      {diagramStatuses.length > 0 && (
        <section className="wf-section">
          <h2>{t('Схема')}</h2>
          <WorkflowDiagram statuses={diagramStatuses} transitions={items} />
        </section>
      )}

      <section className="wf-section">
        <h2>{t('Переходы')}</h2>
        {sortedItems.length === 0 ? (
          <p className="wf-empty">{t('Переходов пока нет — задачи можно перемещать между любыми статусами.')}</p>
        ) : (
          <div className="wf-table-wrap">
            <table className="wf-table">
              <thead>
                <tr>
                  <th>{t('Переход')}</th>
                  <th>{t('Из')}</th>
                  <th>{t('В')}</th>
                  <th>{t('Условия')}</th>
                  <th>{t('Действия после перехода')}</th>
                  <th className="wf-narrow"><span className="wf-sr">{t('Управление')}</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const info = describeTransition(item, { config, t });
                  return (
                    <tr key={item.id} className={item.enabled ? '' : 'is-disabled'}>
                      <td><strong>{item.name}</strong>{!item.enabled && <span className="wf-lozenge">{t('Выключен')}</span>}</td>
                      <td>{item.fromAnyStatus ? <span className="wf-lozenge is-any">{t('Любой статус')}</span> : title(item.sourceColumnId)}</td>
                      <td>{title(item.targetColumnId)}</td>
                      <td>{info.conditions.length ? info.conditions.join('; ') : <span className="wf-muted">{t('Нет')}</span>}</td>
                      <td>{info.actions.length ? info.actions.join('; ') : <span className="wf-muted">{t('Нет')}</span>}</td>
                      <td className="wf-narrow">
                        <span className="wf-row-actions">
                          <button type="button" className="app-btn app-btn-subtle" onClick={() => toggle(item)}>{t(item.enabled ? 'Выключить' : 'Включить')}</button>
                          <button type="button" className="app-icon-btn" aria-label={`${t('Изменить')} ${item.name}`} onClick={() => setEditing(item)}><NavIcon name="edit" size={14} /></button>
                          <button type="button" className="app-icon-btn" aria-label={`${t('Удалить')} ${item.name}`} onClick={() => remove(item)}><NavIcon name="trash" size={14} /></button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {spaces.length > 0 && (
        <section className="wf-section">
          <h2>{t('Использовать workflow другого пространства')}</h2>
          <p className="wf-muted">{t('Переходы копируются вместе с условиями и действиями; статусы сопоставляются по названию.')}</p>
          <div className="wf-copy">
            <select aria-label={t('Пространство-источник')} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">{t('Выберите пространство')}</option>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}{s.team ? ` (${s.team})` : ''}</option>)}
            </select>
            <button type="button" className="app-btn app-btn-subtle" onClick={copy} disabled={!copyFrom}>{t('Скопировать workflow')}</button>
          </div>
        </section>
      )}
      </>}

      {editing && (
        <TransitionDialog
          boardId={boardId}
          statuses={statuses}
          item={editing.id ? editing : null}
          config={config}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
