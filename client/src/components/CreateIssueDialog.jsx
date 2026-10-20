import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { boards as boardsApi, people as peopleApi, quests } from '../api.js';
import { IssueTypeIcon, PriorityIcon, getIssueTypeMeta, getPriorityMeta } from './IssueIcons.jsx';
import NavIcon from './NavIcons.jsx';
import { CustomFieldInput } from './CustomFields.jsx';
import { fieldApplies, isEmptyValue, useBoardIssueConfig } from '../utils/issueConfig.js';

// Subtasks need a parent, so they are created from the parent issue instead.
const ISSUE_TYPES = [2, 1, 3, 0];
const PRIORITIES = [4, 3, 2, 1, 0];
const BACKLOG_KIND = 0;
const ARCHIVE_KIND = 5;

export function pickCreateColumn(columns = []) {
  const usable = columns.filter((c) => c.kind !== ARCHIVE_KIND).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return usable.find((c) => c.kind === BACKLOG_KIND) ?? usable[0] ?? null;
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
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [open, defaultBoardId, boards]);

  const issueConfig = useBoardIssueConfig(open ? boardId : null);
  const customFields = issueConfig.fields.filter((field) => fieldApplies(field, issueType, issueTypeId));
  const needsPeople = customFields.some((field) => field.fieldType === 'user');
  const [people, setPeople] = useState([]);
  useEffect(() => {
    if (!needsPeople) return;
    peopleApi.workWith().then((list) => setPeople([...(user?.id ? [{ id: user.id, displayName: user.displayName || user.email }] : []), ...(Array.isArray(list) ? list : [])])).catch(() => {});
  }, [needsPeople, user]);
  const missingRequired = customFields.some((field) => field.required && isEmptyValue(fieldValues[field.id]));
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
      const quest = await quests.create({
        title: title.trim(),
        description: description.trim() || null,
        columnId: column.id,
        category: 0,
        xpReward: 10,
        isEpic: issueType === 0,
        issueType,
        issueTypeId,
        customFields: Object.fromEntries(customFields.filter((field) => !isEmptyValue(fieldValues[field.id])).map((field) => [field.id, fieldValues[field.id]])),
        priority,
        assigneeIds: assignToMe && user?.id ? [user.id] : [],
        notificationRecipientIds: user?.id ? [user.id] : [],
      });
      setTitle('');
      setDescription('');
      setFieldValues({});
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
            <select value={boardId} onChange={(e) => { setBoardId(e.target.value); setIssueTypeId(null); setFieldValues({}); }} required>
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
          <label className="app-field">
            <span>{t('Описание')}</span>
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="app-field">
            <span>{t('Приоритет')}</span>
            <span className="app-select-with-icon">
              <PriorityIcon priority={priority} size={16} />
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(getPriorityMeta(p).label)}</option>)}
              </select>
            </span>
          </label>
          {customFields.map((field) => (
            <div key={field.id} className="app-field create-issue-custom">
              <span>{field.name}{field.required && <span className="app-required"> *</span>}</span>
              <CustomFieldInput
                field={field}
                value={fieldValues[field.id] ?? (field.fieldType === 'multiselect' ? [] : field.fieldType === 'checkbox' ? false : '')}
                onChange={(value) => setFieldValues((current) => ({ ...current, [field.id]: value }))}
                people={people}
              />
              {field.description && <small className="app-modal-hint">{field.description}</small>}
            </div>
          ))}
          <label className="app-check">
            <input type="checkbox" checked={assignToMe} onChange={(e) => setAssignToMe(e.target.checked)} />
            {t('Назначить меня')}
          </label>
          {created && <p className="app-modal-success">{t('Задача создана')}: {created.issueKey || created.title}</p>}
          {error && <p className="app-modal-error" role="alert">{error}</p>}
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
