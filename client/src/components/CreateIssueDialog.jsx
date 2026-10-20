import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { boards as boardsApi, components as componentsApi, people as peopleApi, quests } from '../api.js';
import { IssueTypeIcon, PriorityIcon, getIssueTypeMeta, getPriorityMeta } from './IssueIcons.jsx';
import NavIcon from './NavIcons.jsx';
import { CustomFieldInput, configuredField } from './CustomFields.jsx';
import { emptyFieldValue, fieldApplies, isEmptyValue, useBoardIssueConfig } from '../utils/issueConfig.js';
import { DEFAULT_CREATE_FIELDS, arrangeFields, fieldRule, onScreen, screenTabs, typeToken } from '../utils/issueLayout.js';

// Subtasks need a parent, so they are created from the parent issue instead.
const ISSUE_TYPES = [2, 1, 3, 0];
const PRIORITIES = [4, 3, 2, 1, 0];
const BACKLOG_KIND = 0;
const ARCHIVE_KIND = 5;
const EMPTY_SYSTEM = { dueDate: '', startDate: '', labels: '', storyPoints: '', estimateHours: '', componentId: '', releaseId: '' };

export function pickCreateColumn(columns = []) {
  const usable = columns.filter((c) => c.kind !== ARCHIVE_KIND).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return usable.find((c) => c.kind === BACKLOG_KIND) ?? usable[0] ?? null;
}

function Required({ when }) {
  return when ? <span className="app-required"> *</span> : null;
}

export default function CreateIssueDialog({ open, onClose, boards, defaultBoardId }) {
  const { t } = useLocalization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const titleRef = useRef(null);
  const [boardId, setBoardId] = useState('');
  const [issueType, setIssueType] = useState(2);
  const [issueTypeId, setIssueTypeId] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(2);
  const [assignToMe, setAssignToMe] = useState(false);
  const [system, setSystem] = useState(EMPTY_SYSTEM);
  const [componentOptions, setComponentOptions] = useState([]);
  const [createAnother, setCreateAnother] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!open) return;
    setBoardId(defaultBoardId || boards[0]?.id || '');
    setError('');
    setCreated(null);
    setFieldValues({});
    setSystem(EMPTY_SYSTEM);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [open, defaultBoardId, boards]);

  const issueConfig = useBoardIssueConfig(open ? boardId : null);
  const { layout } = issueConfig;
  const token = typeToken(issueType, issueTypeId);
  const hasScreens = screenTabs(layout, token, 'create') !== null;
  const rule = (key) => fieldRule(layout, token, key);
  const shows = (key) => !rule(key).hidden && (hasScreens ? onScreen(layout, token, 'create', key) : DEFAULT_CREATE_FIELDS.includes(key) || rule(key).required);
  const requires = (key) => shows(key) && rule(key).required;
  const showComponents = open && shows('components');

  const applicable = issueConfig.fields.filter((field) => fieldApplies(field, issueType, issueTypeId));
  const groups = arrangeFields(layout, token, 'create', applicable).map((group) => ({
    ...group,
    fields: group.fields.map((field) => configuredField(layout, token, field)),
  }));
  const customFields = groups.flatMap((group) => group.fields);
  const needsPeople = customFields.some((field) => field.fieldType === 'user');
  const [people, setPeople] = useState([]);
  useEffect(() => {
    if (!needsPeople) return;
    peopleApi.workWith().then((list) => setPeople([...(user?.id ? [{ id: user.id, displayName: user.displayName || user.email }] : []), ...(Array.isArray(list) ? list : [])])).catch(() => {});
  }, [needsPeople, user]);
  useEffect(() => {
    if (!showComponents || !boardId) return;
    componentsApi.getByBoard(boardId).then((list) => setComponentOptions(Array.isArray(list) ? list : list?.items || [])).catch(() => setComponentOptions([]));
  }, [showComponents, boardId]);

  const valueOf = (field) => (field.id in fieldValues ? fieldValues[field.id] : field.defaultValue ?? emptyFieldValue(field));
  const systemMissing = (requires('description') && !description.trim())
    || (requires('assignee') && !assignToMe)
    || (requires('duedate') && !system.dueDate)
    || (requires('startdate') && !system.startDate)
    || (requires('labels') && !system.labels.trim())
    || (requires('storypoints') && system.storyPoints === '')
    || (requires('originalestimate') && system.estimateHours === '')
    || (requires('components') && !system.componentId)
    || (requires('fixversions') && !system.releaseId);
  const missingRequired = systemMissing || customFields.some((field) => field.required && isEmptyValue(valueOf(field)));
  const setSys = (patch) => setSystem((current) => ({ ...current, ...patch }));
  const chooseType = (value) => {
    const custom = issueConfig.types.find((type) => type.id === value);
    if (custom) { setIssueTypeId(custom.id); setIssueType(custom.baseType); }
    else { setIssueTypeId(null); setIssueType(Number(value)); }
  };

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!boardId || !title.trim() || saving || missingRequired) return;
    setSaving(true);
    setError('');
    try {
      const board = await boardsApi.getById(boardId);
      const column = pickCreateColumn(board?.columns);
      if (!column) throw new Error(t('На доске нет колонок для новой задачи.'));
      const hours = parseFloat(String(system.estimateHours).replace(',', '.'));
      const quest = await quests.create({
        title: title.trim(),
        description: shows('description') ? description.trim() || null : null,
        columnId: column.id,
        category: 0,
        xpReward: 10,
        isEpic: issueType === 0,
        issueType,
        issueTypeId,
        customFields: Object.fromEntries(customFields
          .filter((field) => !isEmptyValue(valueOf(field)) || field.defaultValue != null)
          .map((field) => [field.id, isEmptyValue(valueOf(field)) ? null : valueOf(field)])),
        priority,
        assigneeIds: assignToMe && user?.id && shows('assignee') ? [user.id] : [],
        notificationRecipientIds: user?.id ? [user.id] : [],
        ...(shows('duedate') && system.dueDate ? { dueDate: `${system.dueDate}T00:00:00Z` } : {}),
        ...(shows('startdate') && system.startDate ? { startDate: `${system.startDate}T00:00:00Z` } : {}),
        ...(shows('labels') && system.labels.trim() ? { labels: system.labels.trim() } : {}),
        ...(shows('storypoints') && system.storyPoints !== '' ? { storyPoints: Number(system.storyPoints) } : {}),
        ...(shows('originalestimate') && Number.isFinite(hours) ? { originalEstimateMinutes: Math.round(hours * 60) } : {}),
        ...(shows('components') && system.componentId ? { componentIds: [system.componentId] } : {}),
        ...(shows('fixversions') && system.releaseId ? { releaseIds: [system.releaseId] } : {}),
      });
      setTitle('');
      setDescription('');
      setFieldValues({});
      setSystem(EMPTY_SYSTEM);
      if (createAnother) {
        setCreated(quest);
        titleRef.current?.focus();
      } else {
        onClose();
        navigate(`/board/${boardId}/issue/${quest.id}`);
      }
    } catch (e) {
      setError(e.message || t('Не удалось создать задачу.'));
    } finally {
      setSaving(false);
    }
  };

  const hint = (key) => rule(key).description && <small className="app-modal-hint">{rule(key).description}</small>;

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={t('Создать задачу')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t('Создать задачу')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <p className="app-modal-hint">{t('Обязательные поля отмечены звёздочкой')} <span className="app-required">*</span></p>
          <label className="app-field">
            <span>{t('Раздел')} <span className="app-required">*</span></span>
            <select value={boardId} onChange={(e) => { setBoardId(e.target.value); setIssueTypeId(null); setFieldValues({}); setSystem(EMPTY_SYSTEM); }} required>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}{b.teamName ? ` (${b.teamName})` : ''}</option>)}
            </select>
          </label>
          <label className="app-field">
            <span>{t('Тип задачи')} <span className="app-required">*</span></span>
            <span className="app-select-with-icon">
              <IssueTypeIcon issueType={issueType} typeId={issueTypeId} size={16} />
              <select aria-label={t('Тип задачи')} value={issueTypeId || String(issueType)} onChange={(e) => chooseType(e.target.value)}>
                {ISSUE_TYPES.map((type) => <option key={type} value={String(type)}>{t(getIssueTypeMeta(type).label)}</option>)}
                {issueConfig.types.filter((type) => type.baseType !== 4).map((type) => <option key={type.id} value={type.id}>{type.icon} {type.name}</option>)}
              </select>
            </span>
          </label>
          <div className="app-modal-divider" />
          <label className="app-field">
            <span>{t('Сводка')} <span className="app-required">*</span></span>
            <input ref={titleRef} value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          {shows('description') && (
            <label className="app-field">
              <span>{t('Описание')}<Required when={requires('description')} /></span>
              <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
              {hint('description')}
            </label>
          )}
          {shows('priority') && (
            <label className="app-field">
              <span>{t('Приоритет')}</span>
              <span className="app-select-with-icon">
                <PriorityIcon priority={priority} size={16} />
                <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{t(getPriorityMeta(p).label)}</option>)}
                </select>
              </span>
            </label>
          )}
          {shows('duedate') && (
            <label className="app-field">
              <span>{t('Срок')}<Required when={requires('duedate')} /></span>
              <input type="date" aria-label={t('Срок')} value={system.dueDate} onChange={(e) => setSys({ dueDate: e.target.value })} />
              {hint('duedate')}
            </label>
          )}
          {shows('startdate') && (
            <label className="app-field">
              <span>{t('Дата начала')}<Required when={requires('startdate')} /></span>
              <input type="date" aria-label={t('Дата начала')} value={system.startDate} onChange={(e) => setSys({ startDate: e.target.value })} />
              {hint('startdate')}
            </label>
          )}
          {shows('labels') && (
            <label className="app-field">
              <span>{t('Метки')}<Required when={requires('labels')} /></span>
              <input aria-label={t('Метки')} value={system.labels} placeholder={t('метка1, метка2')} onChange={(e) => setSys({ labels: e.target.value })} />
              {hint('labels')}
            </label>
          )}
          {shows('components') && (
            <label className="app-field">
              <span>{t('Компоненты')}<Required when={requires('components')} /></span>
              <select aria-label={t('Компоненты')} value={system.componentId} onChange={(e) => setSys({ componentId: e.target.value })}>
                <option value="">{t('Нет')}</option>
                {componentOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {shows('fixversions') && (
            <label className="app-field">
              <span>{t('Исправить в версиях')}<Required when={requires('fixversions')} /></span>
              <select aria-label={t('Исправить в версиях')} value={system.releaseId} onChange={(e) => setSys({ releaseId: e.target.value })}>
                <option value="">{t('Нет')}</option>
                {issueConfig.versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}
          {shows('storypoints') && (
            <label className="app-field">
              <span>{t('Story points')}<Required when={requires('storypoints')} /></span>
              <input type="number" min={0} max={100} aria-label={t('Story points')} value={system.storyPoints} onChange={(e) => setSys({ storyPoints: e.target.value })} />
            </label>
          )}
          {shows('originalestimate') && (
            <label className="app-field">
              <span>{t('Первоначальная оценка (ч)')}<Required when={requires('originalestimate')} /></span>
              <input type="number" min={0} step="0.25" aria-label={t('Первоначальная оценка (ч)')} value={system.estimateHours} onChange={(e) => setSys({ estimateHours: e.target.value })} />
            </label>
          )}
          {groups.map((group, index) => (
            <React.Fragment key={group.name ?? index}>
              {group.name && group.fields.length > 0 && <h3 className="create-issue-tab">{group.name}</h3>}
              {group.fields.map((field) => (
                <div key={field.id} className="app-field create-issue-custom">
                  <span>{field.name}<Required when={field.required} /></span>
                  <CustomFieldInput
                    field={field}
                    value={valueOf(field)}
                    onChange={(value) => setFieldValues((current) => ({ ...current, [field.id]: value }))}
                    people={people}
                    refs={issueConfig}
                  />
                  {field.description && <small className="app-modal-hint">{field.description}</small>}
                </div>
              ))}
            </React.Fragment>
          ))}
          {shows('assignee') && (
            <label className="app-check">
              <input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
              {t('Назначить меня')}<Required when={requires('assignee')} />
            </label>
          )}
          {created && <p className="app-modal-success">{t('Задача создана')}: {created.issueKey || created.title}</p>}
          {error && <p className="app-modal-error" role="alert">{t(error)}</p>}
        </div>
        <div className="app-modal-footer">
          <label className="app-check">
            <input type="checkbox" checked={createAnother} onChange={(e) => setCreateAnother(e.target.checked)} />
            {t('Создать ещё одну')}
          </label>
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving || !title.trim() || !boardId || missingRequired}>{saving ? '…' : t('Создать')}</button>
        </div>
      </form>
    </div>
  );
}
