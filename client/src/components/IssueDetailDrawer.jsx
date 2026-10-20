import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  clone as cloneApi, components as componentsApi, history as historyApi,
  integrations, questHierarchy, questLinks, quests, releases as releasesApi,
  sprints as sprintsApi, workflows, worklogs,
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon, WatcherBadge } from './IssueIcons.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import AssigneeSelect from './AssigneeSelect.jsx';
import NotificationRecipientPicker from './NotificationRecipientPicker.jsx';
import IssueAssetsField from './IssueAssetsField.jsx';
import CreateBranchPanel from './CreateBranchPanel.jsx';
import CustomFieldsPanel from './CustomFields.jsx';
import { typeChoice, useBoardIssueConfig } from '../utils/issueConfig.js';
import { fieldRule } from '../utils/issueLayout.js';
import { parseRichText, richTextToPlainText, serializeRichText } from '../utils/richText.js';
import { rememberIssue } from '../utils/navHistory.js';
import './IssueDetailDrawer.css';

const MAX_ATTACHMENT_SIZE = 1024 * 1024 * 1024;
const LINK_TYPE_LABELS = ['блокирует', 'зависит от', 'дублирует', 'связана с'];
const DEVELOPMENT_ICONS = { pull_request: 'PR', branch: '⑂', commit: '●', check_run: '✓' };
const ISSUE_TYPE_OPTIONS = [
  { value: 0, label: 'Эпик' },
  { value: 1, label: 'История' },
  { value: 2, label: 'Задача' },
  { value: 3, label: 'Ошибка' },
  { value: 4, label: 'Подзадача' },
];
const PRIORITY_OPTIONS = [
  { value: 4, label: 'Высший' },
  { value: 3, label: 'Высокий' },
  { value: 2, label: 'Средний' },
  { value: 1, label: 'Низкий' },
  { value: 0, label: 'Низший' },
];

function RichTextPreview({ value }) {
  const blocks = parseRichText(value);
  return <div className="issue-drawer-rich-preview">
    {blocks.map((block, index) => block.type === 'heading'
      ? <h4 key={index}>{block.text}</h4>
      : block.type === 'listItem' ? <div key={index}>• {block.text}</div> : <p key={index}>{block.text}</p>)}
  </div>;
}

function formatFileSize(sizeBytes) {
  if (sizeBytes < 1024) return `${sizeBytes} Б`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Jira-like issue detail: desktop right-hand drawer, mobile fullscreen sheet.
 * Self-contained data loading/saving so it can be reused from the board and the backlog.
 */
export default function IssueDetailDrawer({ questId, members = [], columns = [], onClose, onChanged, canDelete = true }) {
  const { user } = useAuth();
  const { locale, t } = useLocalization();
  const [quest, setQuest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardSprints, setBoardSprints] = useState([]);

  const [title, setTitle] = useState('');
  const titleRef = useRef(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [title]);
  const [description, setDescription] = useState('');
  const [xpReward, setXpReward] = useState(0);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [issueType, setIssueType] = useState(2);
  const [issueTypeId, setIssueTypeId] = useState(null);
  const [priority, setPriority] = useState(2);
  const [labels, setLabels] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [component, setComponent] = useState('');
  const [fixVersion, setFixVersion] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [notificationRecipientIds, setNotificationRecipientIds] = useState([]);
  const [watcherSaving, setWatcherSaving] = useState(false);
  const [watcherError, setWatcherError] = useState('');
  const [movingColumn, setMovingColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitions, setTransitions] = useState([]);
  const [hierarchy, setHierarchy] = useState(null);
  const [links, setLinks] = useState([]);
  const [worklogList, setWorklogList] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [development, setDevelopment] = useState(null);
  const [developmentSyncing, setDevelopmentSyncing] = useState(false);
  const developmentItems = development
    ? [...(development.pullRequests || []), ...(development.branches || []), ...(development.commits || []), ...(development.checks || [])]
    : [];
  const [componentOptions, setComponentOptions] = useState([]);
  const [releaseOptions, setReleaseOptions] = useState([]);
  const [worklogMinutes, setWorklogMinutes] = useState('');
  const [originalEstimate, setOriginalEstimate] = useState('');
  const [remainingEstimate, setRemainingEstimate] = useState('');
  const [linkQuestId, setLinkQuestId] = useState('');
  const [linkType, setLinkType] = useState(3);
  const [auxError, setAuxError] = useState('');
  const [descriptionPreview, setDescriptionPreview] = useState(false);

  // Backend contract fields are optional during rollout: only show/send them when present on the quest.
  const supportsComponent = !!quest && Object.prototype.hasOwnProperty.call(quest, 'component');
  const supportsFixVersion = !!quest && Object.prototype.hasOwnProperty.call(quest, 'fixVersion');
  const supportsStoryPoints = !!quest && Object.prototype.hasOwnProperty.call(quest, 'storyPoints');

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentInputRef = useRef(null);

  const questIdRef = useRef(questId);
  questIdRef.current = questId;

  const loadQuest = useCallback(() => {
    if (!questId) return;
    setLoading(true);
    quests.get(questId).then((q) => {
      if (questIdRef.current !== questId) return;
      setQuest(q);
      if (q?.id) rememberIssue({ id: q.id, title: q.title, issueKey: q.issueKey, issueType: q.issueType, boardId: q.boardId });
      setTitle(q?.title ?? '');
      setDescription(richTextToPlainText(q?.descriptionDocument || q?.description || ''));
      setXpReward(typeof q?.xpReward === 'number' ? q.xpReward : 0);
      setAssigneeIds(q?.assigneeIds ?? []);
      setIssueType(q?.issueType ?? 2);
      setIssueTypeId(q?.issueTypeId ?? null);
      setPriority(q?.priority ?? 2);
      setLabels(q?.labels ?? '');
      setDueDate(q?.dueDate ? String(q.dueDate).slice(0, 10) : '');
      setSprintId(q?.sprintId ?? '');
      setComponent(q?.componentId ?? q?.component ?? '');
      setFixVersion(q?.fixVersionId ?? q?.fixVersion ?? '');
      setStoryPoints(typeof q?.storyPoints === 'number' ? String(q.storyPoints) : '');
      setOriginalEstimate(q?.originalEstimateMinutes ?? '');
      setRemainingEstimate(q?.remainingEstimateMinutes ?? '');
      setNotificationRecipientIds(q?.notificationRecipientIds ?? []);
      setWatcherError('');
    }).catch(() => setQuest(null)).finally(() => {
      if (questIdRef.current === questId) setLoading(false);
    });
  }, [questId]);

  useEffect(() => { loadQuest(); }, [loadQuest]);

  useEffect(() => {
    if (!questId) return;
    setAuxError('');
    Promise.allSettled([
      workflows.getTransitions(questId), questHierarchy.get(questId), questLinks.get(questId),
      worklogs.get(questId), historyApi.get(questId), integrations.getDevelopment(questId),
    ]).then(([transitionResult, hierarchyResult, linkResult, worklogResult, historyResult, developmentResult]) => {
      if (transitionResult.status === 'fulfilled') setTransitions(transitionResult.value || []);
      if (hierarchyResult.status === 'fulfilled') setHierarchy(hierarchyResult.value);
      if (linkResult.status === 'fulfilled') setLinks(linkResult.value || []);
      if (worklogResult.status === 'fulfilled') setWorklogList(worklogResult.value || []);
      if (historyResult.status === 'fulfilled') setHistoryItems(historyResult.value?.items || historyResult.value || []);
      if (developmentResult.status === 'fulfilled') setDevelopment(developmentResult.value);
    });
  }, [questId]);

  useEffect(() => {
    if (!quest?.boardId) { setBoardSprints([]); return; }
    sprintsApi.getByBoard(quest.boardId).then((list) => setBoardSprints(Array.isArray(list) ? list : [])).catch(() => setBoardSprints([]));
    componentsApi.getByBoard(quest.boardId).then((list) => setComponentOptions(Array.isArray(list) ? list : list?.items || [])).catch(() => setComponentOptions([]));
    releasesApi.getByBoard(quest.boardId).then((list) => setReleaseOptions(Array.isArray(list) ? list : list?.items || [])).catch(() => setReleaseOptions([]));
  }, [quest?.boardId]);

  useEffect(() => {
    if (!questId) return;
    quests.getComments(questId).then((list) => setComments(Array.isArray(list) ? list : [])).catch((e) => setCommentError(e.message || 'Не удалось загрузить комментарии.'));
  }, [questId]);

  useEffect(() => {
    if (!questId) return;
    setAttachmentsLoading(true);
    setAttachmentError('');
    quests.getAttachments(questId).then((list) => setAttachments(Array.isArray(list) ? list : [])).catch((e) => {
      setAttachments([]);
      setAttachmentError(e.message || 'Не удалось загрузить список вложений.');
    }).finally(() => setAttachmentsLoading(false));
  }, [questId]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const issueConfig = useBoardIssueConfig(quest?.boardId);
  const shown = (key) => !fieldRule(issueConfig.layout, typeChoice(issueType, issueTypeId), key).hidden;
  const chooseIssueType = (value) => {
    const custom = issueConfig.types.find((type) => type.id === value);
    if (custom) { setIssueTypeId(custom.id); setIssueType(custom.baseType); }
    else { setIssueTypeId(null); setIssueType(Number(value)); }
  };

  const handleSave = async () => {
    if (!questId) return;
    setSaving(true);
    try {
      const xp = Math.max(0, Math.min(9999, Number(xpReward) || 0));
      const payload = {
        title: title.trim(),
        description: description.trim(),
        descriptionDocument: serializeRichText(description.trim()),
        xpReward: xp,
        assigneeIds,
        assigneeIdsSet: true,
        issueType,
        issueTypeId,
        issueTypeIdSet: true,
        priority,
        labels: labels.trim(),
        sprintId: sprintId || null,
        sprintIdSet: true,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        originalEstimateMinutes: originalEstimate === '' ? null : Number(originalEstimate),
        remainingEstimateMinutes: remainingEstimate === '' ? null : Number(remainingEstimate),
      };
      if (supportsComponent) payload.component = component.trim();
      payload.componentId = component || null;
      if (supportsFixVersion) payload.fixVersion = fixVersion.trim();
      payload.fixVersionId = fixVersion || null;
      if (supportsStoryPoints) {
        payload.storyPointsSet = true;
        payload.storyPoints = storyPoints === '' ? null : Math.max(0, Math.min(100, parseInt(storyPoints, 10) || 0));
      }
      await quests.update(questId, payload);
      const updated = await quests.get(questId);
      setQuest(updated);
      onChanged?.();
    } catch (e) {
      console.error(e);
      window.alert(t(e.message || 'Не удалось сохранить задачу.'));
    } finally {
      setSaving(false);
    }
  };

  const persistWatchers = async (nextIds) => {
    if (!questId) return;
    const previous = notificationRecipientIds;
    setNotificationRecipientIds(nextIds);
    setWatcherSaving(true);
    setWatcherError('');
    try {
      await quests.setNotificationRecipients(questId, nextIds);
      setQuest((current) => (current ? { ...current, notificationRecipientIds: nextIds } : current));
      onChanged?.();
    } catch (e) {
      setNotificationRecipientIds(previous);
      setWatcherError(e.message || 'Не удалось сохранить наблюдателей.');
    } finally {
      setWatcherSaving(false);
    }
  };

  const isWatching = !!user && notificationRecipientIds.includes(user.id);
  const toggleWatching = () => {
    if (!user || watcherSaving) return;
    const next = isWatching
      ? notificationRecipientIds.filter((id) => id !== user.id)
      : [...notificationRecipientIds, user.id];
    persistWatchers(next);
  };

  const handleMoveColumn = async (targetColumnId) => {
    if (!questId || !targetColumnId || targetColumnId === quest?.columnId || movingColumn) return;
    setMovingColumn(true);
    try {
      const targetColumn = columns.find((c) => c.id === targetColumnId);
      const newOrder = (targetColumn?.quests ?? targetColumn?.Quests ?? []).length;
      await quests.move({ questId, targetColumnId, newOrder });
      const updated = await quests.get(questId);
      setQuest(updated);
      onChanged?.();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось переместить задачу.'));
    } finally {
      setMovingColumn(false);
    }
  };

  const handleDelete = async () => {
    if (!questId || !window.confirm(t('Удалить квест?'))) return;
    try {
      const ok = await quests.delete(questId);
      if (ok) { onChanged?.(); onClose?.(); }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async () => {
    if (!questId || !newComment.trim() || commentSaving) return;
    setCommentSaving(true);
    setCommentError('');
    try {
      const comment = await quests.addComment(questId, newComment.trim());
      if (comment) setComments((current) => [...current, comment]);
      setNewComment('');
    } catch (e) {
      setCommentError(e.message || 'Не удалось добавить комментарий.');
    } finally {
      setCommentSaving(false);
    }
  };

  const handleDeleteComment = async (comment) => {
    if (!questId || !window.confirm(t('Удалить комментарий?'))) return;
    try {
      await quests.deleteComment(questId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (e) {
      setCommentError(e.message || 'Не удалось удалить комментарий.');
    }
  };

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !questId) return;
    const targetQuestId = questId;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentError('Размер файла не должен превышать 1 ГБ.');
      return;
    }
    setAttachmentUploading(true);
    setAttachmentError('');
    try {
      const uploaded = await quests.uploadAttachment(targetQuestId, file);
      if (uploaded && questIdRef.current === targetQuestId) setAttachments((current) => [uploaded, ...current]);
    } catch (e) {
      if (questIdRef.current === targetQuestId) setAttachmentError(e.message || 'Не удалось загрузить файл.');
    } finally {
      if (questIdRef.current === targetQuestId) setAttachmentUploading(false);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    if (!questId) return;
    try {
      const download = await quests.getAttachmentDownload(questId, attachment.id);
      if (!download?.url) throw new Error('Ссылка на скачивание не получена.');
      window.location.assign(download.url);
    } catch (e) {
      setAttachmentError(e.message || 'Не удалось скачать файл.');
    }
  };

  const handleDeleteAttachment = async (attachment) => {
    if (!questId || !window.confirm(t('Удалить файл «${attachment.fileName}»?', { 'attachment.fileName': attachment.fileName }))) return;
    setDeletingAttachmentId(attachment.id);
    try {
      await quests.deleteAttachment(questId, attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch (e) {
      setAttachmentError(e.message || 'Не удалось удалить файл.');
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleTransition = async (transitionId) => {
    if (!transitionId) return;
    try {
      await workflows.transition(questId, transitionId);
      loadQuest();
      onChanged?.();
    } catch (e) { setAuxError(e.message); }
  };

  const handleAddLink = async (event) => {
    event.preventDefault();
    if (!linkQuestId.trim()) return;
    try {
      const created = await questLinks.create(questId, { target: linkQuestId.trim(), type: linkType });
      setLinks((current) => [...current, created]);
      setLinkQuestId('');
    } catch (e) { setAuxError(e.message); }
  };

  const handleLogWork = async (event) => {
    event.preventDefault();
    if (!Number(worklogMinutes)) return;
    try {
      const created = await worklogs.create(questId, {
        timeSpentMinutes: Number(worklogMinutes),
        startedAt: new Date().toISOString(),
        note: '',
      });
      setWorklogList((current) => [...current, created]);
      setWorklogMinutes('');
    } catch (e) { setAuxError(e.message); }
  };

  const handleSyncDevelopment = async () => {
    setDevelopmentSyncing(true);
    setAuxError('');
    try {
      setDevelopment(await integrations.syncDevelopment(questId));
    } catch (e) { setAuxError(e.message); } finally { setDevelopmentSyncing(false); }
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = async () => {
    const url = `${window.location.origin}/browse/${quest.issueKey}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      window.prompt(t('Скопируйте вручную'), url);
    }
  };

  const handleClone = async () => {
    try {
      const cloned = await cloneApi.quest(questId, { includeLinks: false, includeWatchers: true });
      window.alert(t('Задача клонирована: ${issueKey}', { issueKey: cloned.issueKey || cloned.id }));
      onChanged?.();
    } catch (e) { setAuxError(e.message); }
  };

  return (
    <div className="issue-drawer-overlay" onClick={onClose}>
      <aside className="issue-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="issue-drawer-header">
          <button type="button" className="issue-drawer-back" onClick={onClose} title="Назад" aria-label="Назад">←</button>
          <span className="issue-drawer-key">{quest?.issueKey || '…'}</span>
          {quest?.issueKey && (
            <button type="button" className="issue-drawer-copy-link" onClick={handleCopyLink}
              title={linkCopied ? t('Ссылка скопирована') : t('Копировать ссылку')} aria-label={t('Копировать ссылку')}>
              {linkCopied ? '✓' : '🔗'}
            </button>
          )}
          <button type="button" className="issue-drawer-close" onClick={onClose} title="Закрыть" aria-label="Закрыть">✕</button>
        </header>

        {loading && !quest ? (
          <div className="issue-drawer-body">Загрузка…</div>
        ) : !quest ? (
          <div className="issue-drawer-body">Задача не найдена.</div>
        ) : (
          <div className="issue-drawer-body">
            <textarea
              ref={titleRef}
              className="issue-drawer-title"
              rows={1}
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\r?\n/g, ' '))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
              placeholder="Название"
            />

            {columns.length > 0 && (
              <label className="issue-drawer-field issue-drawer-field-block">
                <span>Статус{movingColumn ? ' (перемещение…)' : ''}</span>
                <select
                  value={quest.columnId}
                  disabled={movingColumn}
                  onChange={(e) => handleMoveColumn(e.target.value)}
                >
                  {columns.map((c) => <option key={c.id} value={c.id}>{c.title || 'Колонка'}</option>)}
                </select>
              </label>
            )}
            {transitions.length > 0 && (
              <label className="issue-drawer-field issue-drawer-field-block">
                <span>{t('Workflow переход')}</span>
                <select defaultValue="" onChange={(e) => { handleTransition(e.target.value); e.target.value = ''; }}>
                  <option value="" disabled>{t('Выберите переход…')}</option>
                  {transitions.map((transition) => <option key={transition.id} value={transition.id}>{transition.name} → {columns.find((column) => column.id === transition.targetColumnId)?.title || ''}</option>)}
                </select>
              </label>
            )}

            <div className="issue-drawer-row">
              <label className="issue-drawer-field">
                <span>Тип</span>
                <div className="issue-drawer-select-wrap">
                  <IssueTypeIcon issueType={issueType} typeId={issueTypeId} size={16} />
                  <select value={typeChoice(issueType, issueTypeId)} onChange={(e) => chooseIssueType(e.target.value)}>
                    {ISSUE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={String(opt.value)}>{t(opt.label)}</option>)}
                    {issueConfig.types.map((type) => <option key={type.id} value={type.id}>{type.icon} {type.name}</option>)}
                  </select>
                </div>
              </label>
              {shown('priority') && <label className="issue-drawer-field">
                <span>Приоритет</span>
                <div className="issue-drawer-select-wrap">
                  <PriorityIcon priority={priority} size={14} />
                  <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                    {PRIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </label>}
            </div>

            {shown('description') && <label className="issue-drawer-field issue-drawer-field-block">
              <span>{t('Описание')}</span>
              <div className="issue-drawer-editor-toolbar">
                <button type="button" onClick={() => setDescription((value) => `${value}${value ? '\n\n' : ''}# `)}>H</button>
                <button type="button" onClick={() => setDescription((value) => `${value}${value ? '\n' : ''}- `)}>•</button>
                <button type="button" onClick={() => setDescriptionPreview((value) => !value)}>{descriptionPreview ? t('Редактировать') : t('Предпросмотр')}</button>
              </div>
              {descriptionPreview ? <RichTextPreview value={serializeRichText(description)} /> : <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} placeholder={t('Описание задачи')} />}
              {description.includes('@') && <div className="issue-drawer-mentions" aria-label={t('Упоминания')}>
                {members.slice(0, 6).map((member) => <button key={member.userId} type="button" onClick={() => setDescription((value) => `${value}@${member.displayName} `)}>@{member.displayName}</button>)}
              </div>}
            </label>}

            {shown('labels') && <label className="issue-drawer-field issue-drawer-field-block">
              <span>Метки</span>
              <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="метка1, метка2" />
            </label>}

            <CustomFieldsPanel
              quest={quest}
              fields={issueConfig.fields}
              people={members}
              refs={issueConfig}
              layout={issueConfig.layout}
              onSaved={(values) => { setQuest((current) => (current ? { ...current, customFields: values } : current)); onChanged?.(); }}
            />

            <div className="issue-drawer-row">
                  {shown('components') && <label className="issue-drawer-field">
                    <span>Компонент</span>
                    <select value={component} onChange={(e) => setComponent(e.target.value)}>
                      <option value="">{t('Без компонента')}</option>
                      {componentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>}
                  {shown('fixversions') && <label className="issue-drawer-field">
                    <span>Версия исправления</span>
                    <select value={fixVersion} onChange={(e) => setFixVersion(e.target.value)}>
                      <option value="">{t('Без версии')}</option>
                      {releaseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>}
            </div>

            {supportsStoryPoints && shown('storypoints') && (
              <label className="issue-drawer-field issue-drawer-field-block">
                <span>Story Points</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={storyPoints}
                  onChange={(e) => setStoryPoints(e.target.value === '' ? '' : String(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))))}
                  placeholder="Оценка в story points"
                />
              </label>
            )}

            <div className="issue-drawer-row">
              {shown('duedate') && <label className="issue-drawer-field">
                <span>Срок</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>}
              {shown('sprint') && <label className="issue-drawer-field">
                <span>Спринт</span>
                <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                  <option value="">— Бэклог —</option>
                  {boardSprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.status === 1 ? ' (активный)' : ''}</option>
                  ))}
                </select>
              </label>}
            </div>

            {shown('assignee') && <label className="issue-drawer-field issue-drawer-field-block">
              <span>Исполнители</span>
              <AssigneeSelect value={assigneeIds} options={members} onChange={setAssigneeIds} placeholder="— не назначены —" />
            </label>}

            {assigneeIds.length > 0 && (
              <div className="issue-drawer-assignee-avatars">
                {assigneeIds.map((id) => {
                  const member = members.find((m) => m.userId === id);
                  if (!member) return null;
                  return (
                    <span key={id} className="issue-drawer-assignee-chip">
                      <AssigneeAvatar userId={member.userId} displayName={member.displayName} avatarUrl={member.avatarUrl} size={20} />
                      <span>{member.displayName}</span>
                    </span>
                  );
                })}
              </div>
            )}

            <label className="issue-drawer-field issue-drawer-field-block">
              <span>Опыт (XP)</span>
              <input
                type="number"
                min={0}
                max={9999}
                value={xpReward}
                onChange={(e) => setXpReward(Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0)))}
              />
            </label>

            <fieldset className="issue-drawer-notifications">
              <legend>
                Наблюдатели <WatcherBadge count={notificationRecipientIds.length} />
              </legend>
              <button
                type="button"
                className={`issue-drawer-watch-toggle ${isWatching ? 'is-watching' : ''}`}
                onClick={toggleWatching}
                disabled={!user || watcherSaving}
              >
                {isWatching ? '✓ Вы наблюдаете' : '+ Наблюдать'}
              </button>
              <p className="issue-drawer-notifications-hint">Наблюдатели получают email-уведомления об изменениях задачи.</p>
              {watcherError && <p className="issue-drawer-error" role="alert">{watcherError}</p>}
              <NotificationRecipientPicker
                members={members}
                selectedIds={notificationRecipientIds}
                onChange={persistWatchers}
                disabled={watcherSaving}
              />
            </fieldset>

            <section className="issue-drawer-section">
              <h4>{t('Иерархия')}</h4>
              {hierarchy?.parent ? <p>{t('Родитель')}: <strong>{hierarchy.parent.issueKey}</strong> {hierarchy.parent.title}</p> : <p className="issue-drawer-empty">{t('Родительская задача не задана.')}</p>}
              {(hierarchy?.children || []).length > 0 && <ul className="issue-drawer-compact-list">{hierarchy.children.map((child) => <li key={child.id}><strong>{child.issueKey}</strong> {child.title}</li>)}</ul>}
            </section>

            <section className="issue-drawer-section">
              <h4>{t('Оценка и учёт времени')}</h4>
              <div className="issue-drawer-row">
                <label className="issue-drawer-field"><span>{t('Первоначальная оценка, мин.')}</span><input type="number" min="0" value={originalEstimate} onChange={(e) => setOriginalEstimate(e.target.value)} /></label>
                <label className="issue-drawer-field"><span>{t('Осталось, мин.')}</span><input type="number" min="0" value={remainingEstimate} onChange={(e) => setRemainingEstimate(e.target.value)} /></label>
              </div>
              <form className="issue-drawer-inline-form" onSubmit={handleLogWork}>
                <input aria-label={t('Затрачено минут')} type="number" min="1" value={worklogMinutes} onChange={(e) => setWorklogMinutes(e.target.value)} placeholder={t('Затрачено минут')} />
                <button type="submit" disabled={!Number(worklogMinutes)}>{t('Записать')}</button>
              </form>
              <ul className="issue-drawer-compact-list">{worklogList.map((item) => <li key={item.id}>{item.userName || item.authorName || t('Участник')} · {item.timeSpentMinutes ?? item.minutes} {t('мин.')}</li>)}</ul>
            </section>

            <section className="issue-drawer-section">
              <h4>{t('Связи задач')}</h4>
              <form className="issue-drawer-inline-form" onSubmit={handleAddLink}>
                <select value={linkType} onChange={(e) => setLinkType(Number(e.target.value))}>{LINK_TYPE_LABELS.map((label, index) => <option key={label} value={index}>{t(label)}</option>)}</select>
                <input value={linkQuestId} onChange={(e) => setLinkQuestId(e.target.value)} placeholder={t('Ключ задачи, например KAN-12')} />
                <button type="submit">{t('Добавить')}</button>
              </form>
              <ul className="issue-drawer-compact-list">{links.map((link) => <li key={link.id}>⛓ {t(LINK_TYPE_LABELS[link.type] || 'связана с')} · <strong>{link.targetKey || link.targetQuestId}</strong> {link.targetTitle || ''}</li>)}</ul>
            </section>

            <IssueAssetsField questId={questId} />

            <section className="issue-drawer-section">
              <div className="issue-drawer-section-header">
                <h4>{t('Разработка GitHub')}</h4>
                <button type="button" onClick={handleSyncDevelopment} disabled={developmentSyncing}>{developmentSyncing ? '…' : t('Синхронизировать')}</button>
              </div>
              {quest.issueKey && <CreateBranchPanel questId={questId} issueKey={quest.issueKey} title={quest.title} onCreated={setDevelopment} />}
              {developmentItems.length === 0 ? <p className="issue-drawer-empty">{t('Связанные ветки, коммиты и pull request не найдены.')}</p> : (
                <ul className="issue-drawer-compact-list">
                  {developmentItems.map((item) => <li key={item.id}>
                    {DEVELOPMENT_ICONS[item.kind] || '•'} {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
                    {item.status ? ` · ${item.status}` : ''}
                  </li>)}
                </ul>
              )}
            </section>

            {auxError && <p className="issue-drawer-error" role="alert">{auxError}</p>}

            <div className="issue-drawer-actions">
              <button type="button" className="issue-drawer-save" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              {canDelete && (
                <button type="button" className="issue-drawer-delete" onClick={handleDelete}>Удалить</button>
              )}
              <button type="button" className="issue-drawer-delete" onClick={handleClone}>{t('Клонировать')}</button>
            </div>

            <p className="issue-drawer-meta">
              Создан: {quest.createdAt ? new Date(quest.createdAt).toLocaleString(locale) : ''}
              {quest.completedAt && <> · Выполнен: {new Date(quest.completedAt).toLocaleString(locale)}</>}
            </p>

            <section className="issue-drawer-section">
              <h4>{t('История изменений')}</h4>
              {historyItems.length === 0 ? <p className="issue-drawer-empty">{t('История пока пуста.')}</p> : <ul className="issue-drawer-compact-list">{historyItems.map((item, index) => <li key={item.id || index}><strong>{item.userName || t('Система')}</strong> {item.field || item.changeType}: {item.oldValue ? `${item.oldValue} → ` : ''}{item.newValue || ''}</li>)}</ul>}
            </section>

            <section className="issue-drawer-section">
              <div className="issue-drawer-section-header">
                <h4>Вложения</h4>
                <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={attachmentUploading}>
                  {attachmentUploading ? 'Загрузка…' : '+ Прикрепить файл'}
                </button>
                <input ref={attachmentInputRef} type="file" className="issue-drawer-file-input" onChange={handleUploadAttachment} />
              </div>
              {attachmentError && <p className="issue-drawer-error" role="alert">{attachmentError}</p>}
              {attachmentsLoading ? (
                <p className="issue-drawer-empty">Загрузка вложений…</p>
              ) : attachments.length === 0 ? (
                <p className="issue-drawer-empty">Вложений пока нет.</p>
              ) : (
                <ul className="issue-drawer-attachment-list">
                  {attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <div>
                        <span className="issue-drawer-attachment-name" title={attachment.fileName}>{attachment.fileName}</span>
                        <span className="issue-drawer-attachment-meta">
                          {formatFileSize(attachment.sizeBytes)}
                          {attachment.uploadedByName ? ` · ${attachment.uploadedByName}` : ''}
                        </span>
                      </div>
                      <div className="issue-drawer-attachment-actions">
                        <button type="button" onClick={() => handleDownloadAttachment(attachment)}>Скачать</button>
                        <button type="button" onClick={() => handleDeleteAttachment(attachment)} disabled={deletingAttachmentId === attachment.id}>
                          {deletingAttachmentId === attachment.id ? '…' : 'Удалить'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="issue-drawer-section">
              <h4>Комментарии</h4>
              {comments.length === 0 ? (
                <p className="issue-drawer-empty">Комментариев пока нет.</p>
              ) : (
                <ul className="issue-drawer-comment-list">
                  {comments.map((comment) => (
                    <li key={comment.id}>
                      <div className="issue-drawer-comment-header">
                        <strong>{comment.authorName}</strong>
                        <span>{new Date(comment.createdAt).toLocaleString(locale)}</span>
                        {comment.authorUserId === user?.id && (
                          <button type="button" onClick={() => handleDeleteComment(comment)} title="Удалить комментарий">✕</button>
                        )}
                      </div>
                      <p>{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value.slice(0, 5000))}
                placeholder="Написать комментарий"
                rows={2}
              />
              {newComment.includes('@') && <div className="issue-drawer-mentions">
                {members.slice(0, 6).map((member) => <button key={member.userId} type="button" onClick={() => setNewComment((value) => `${value}@${member.displayName} `)}>@{member.displayName}</button>)}
              </div>}
              {commentError && <p className="issue-drawer-error">{commentError}</p>}
              <button type="button" className="issue-drawer-comment-submit" onClick={handleAddComment} disabled={commentSaving || !newComment.trim()}>
                {commentSaving ? 'Отправка…' : 'Добавить комментарий'}
              </button>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
