import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from '../i18n/navigation.jsx';
import {
  boards, clone as cloneApi, components as componentsApi, history as historyApi,
  integrations, questHierarchy, questLinks, quests, releases as releasesApi,
  spaceContent, sprints as sprintsApi, votes as votesApi, workflows, worklogs,
} from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon } from './IssueIcons.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import AssigneeSelect from './AssigneeSelect.jsx';
import NotificationRecipientPicker from './NotificationRecipientPicker.jsx';
import IssueVotes from './IssueVotes.jsx';
import IssueAssetsField from './IssueAssetsField.jsx';
import CreateBranchPanel from './CreateBranchPanel.jsx';
import CustomFieldsPanel from './CustomFields.jsx';
import { BASE_TYPES, typeChoice, useBoardIssueConfig } from '../utils/issueConfig.js';
import { fieldRule } from '../utils/issueLayout.js';
import { issueWorkflow, needsTransitionDialog, reachableColumns, transitionsTo } from '../utils/workflow.js';
import { statusTone } from '../utils/boardColumnLayout.js';
import TransitionScreenDialog from './TransitionScreenDialog.jsx';
import { AiDescriptionAssist, AiSummary } from './AiAssist.jsx';
import MentionTextarea, { MentionText } from './MentionTextarea.jsx';
import { parseRichText, richTextToPlainText, serializeRichText } from '../utils/richText.js';
import { rememberIssue } from '../utils/navHistory.js';
import { planIncludes, useBilling } from '../utils/billing.js';
import NavIcon from './NavIcons.jsx';
import './IssueDetailDrawer.css';
import './IssueView.css';

const MAX_ATTACHMENT_SIZE = 1024 * 1024 * 1024;
const LINK_TYPE_LABELS = ['блокирует', 'зависит от', 'дублирует', 'связана с'];
const DEVELOPMENT_ICONS = { pull_request: 'PR', branch: '⑂', commit: '●', check_run: '✓' };
const PRIORITY_OPTIONS = [
  { value: 4, label: 'Высший' },
  { value: 3, label: 'Высокий' },
  { value: 2, label: 'Средний' },
  { value: 1, label: 'Низкий' },
  { value: 0, label: 'Низший' },
];
const COMMENT_STARTERS = ['Кто работает над этим...?', 'Можно ли узнать подробнее...?', 'Обновление статуса...'];
const ACTIVITY_TABS = [['all', 'Все'], ['comments', 'Комментарии'], ['history', 'История'], ['worklog', 'Журнал работ']];
const PROJECT_PLAN_TEMPLATE = `# План проекта

## Обзор
Опишите назначение проекта и ожидаемый результат.

## Цели
- [ ] Цель 1
- [ ] Цель 2

## Объём работ
Опишите, что входит и не входит в проект.

## Этапы
1. Подготовка
2. Реализация
3. Запуск

## Риски
Перечислите основные риски и способы их снижения.

## Участники
Укажите владельца проекта и ответственных.`;

const isTyping = (target) => !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
const xmlEscape = (value) => String(value ?? '').replace(/[<>&'"]/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
}[char]));
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const issueExportContent = (quest, format) => {
  const fields = [
    ['Key', quest.issueKey],
    ['Title', quest.title],
    ['Description', richTextToPlainText(quest.descriptionDocument || quest.description || '')],
    ['Priority', quest.priority],
    ['Labels', quest.labels],
    ['Story points', quest.storyPoints],
  ];
  if (format === 'csv') return `\uFEFF${fields.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`).join('\r\n')}`;
  if (format === 'xml') return `<?xml version="1.0" encoding="UTF-8"?>\n<issue>${fields.map(([key, value]) => `\n  <field name="${xmlEscape(key)}">${xmlEscape(value)}</field>`).join('')}\n</issue>`;
  return `<!doctype html><html><meta charset="utf-8"><body><h1>${xmlEscape(quest.issueKey)} — ${xmlEscape(quest.title)}</h1>${fields.map(([key, value]) => `<p><strong>${xmlEscape(key)}:</strong> ${xmlEscape(value)}</p>`).join('')}</body></html>`;
};

const downloadIssue = (quest, format) => {
  const types = { csv: 'text/csv;charset=utf-8', doc: 'application/msword', xml: 'application/xml;charset=utf-8' };
  const blob = new Blob([issueExportContent(quest, format)], { type: types[format] });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${quest.issueKey || 'issue'}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
};

function RichTextPreview({ value, currentUserId }) {
  const blocks = parseRichText(value);
  const text = (block) => <MentionText text={block.text} currentUserId={currentUserId} />;
  return <div className="issue-drawer-rich-preview">
    {blocks.map((block, index) => block.type === 'heading'
      ? <h4 key={index}>{text(block)}</h4>
      : block.type === 'listItem' ? <div key={index}>• {text(block)}</div> : <p key={index}>{text(block)}</p>)}
  </div>;
}

function formatFileSize(sizeBytes) {
  if (sizeBytes < 1024) return `${sizeBytes} Б`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function Menu({ open, onClose, children, align = 'left', label, className = '' }) {
  if (!open) return null;
  return (
    <>
      <div className="iv-menu-backdrop" onMouseDown={onClose} />
      <div className={`iv-menu iv-menu-${align} ${className}`.trim()} role="menu" aria-label={label}>{children}</div>
    </>
  );
}

function Row({ label, children }) {
  return (
    <div className="iv-row">
      <div className="iv-row-label">{label}</div>
      <div className="iv-row-value">{children}</div>
    </div>
  );
}

/**
 * Jira-like issue view: a large dialog with the summary, description and activity on the left
 * and the status and details on the right; every field saves as soon as it changes.
 */
export default function IssueDetailDrawer({ questId, members = [], columns = [], onClose, onChanged, canDelete = true, variant = 'modal' }) {
  const panel = variant === 'panel';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locale, t } = useLocalization();
  const billing = useBilling();
  const assetsAvailable = planIncludes(billing?.plan || 'free', 'premium');
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
  }, [title, quest]);
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionPreview, setDescriptionPreview] = useState(false);
  const [xpReward, setXpReward] = useState(0);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [issueType, setIssueType] = useState(2);
  const [issueTypeId, setIssueTypeId] = useState(null);
  const [priority, setPriority] = useState(2);
  const [labels, setLabels] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [component, setComponent] = useState('');
  const [fixVersion, setFixVersion] = useState('');
  const [storyPoints, setStoryPoints] = useState('');
  const [originalEstimate, setOriginalEstimate] = useState('');
  const [remainingEstimate, setRemainingEstimate] = useState('');
  const [notificationRecipientIds, setNotificationRecipientIds] = useState([]);
  const [watcherSaving, setWatcherSaving] = useState(false);
  const [watcherError, setWatcherError] = useState('');
  const [movingColumn, setMovingColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitions, setTransitions] = useState([]);
  const [pendingTransition, setPendingTransition] = useState(null);
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
  const [linkQuestId, setLinkQuestId] = useState('');
  const [linkType, setLinkType] = useState(3);
  const [addingLink, setAddingLink] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [editingParent, setEditingParent] = useState(false);
  const [parentKey, setParentKey] = useState('');
  const [auxError, setAuxError] = useState('');
  const [menu, setMenu] = useState(null);
  const [addMenuQuery, setAddMenuQuery] = useState('');
  const [videoRecommendationVisible, setVideoRecommendationVisible] = useState(true);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagComment, setFlagComment] = useState('');
  const [flagSaving, setFlagSaving] = useState(false);
  const [flagError, setFlagError] = useState('');
  const [activityTab, setActivityTab] = useState('comments');
  const [commentFocused, setCommentFocused] = useState(false);
  const commentRef = useRef(null);

  // Backend contract fields are optional during rollout: only show/send them when present on the quest.
  const supportsComponent = !!quest && Object.prototype.hasOwnProperty.call(quest, 'component');
  const supportsFixVersion = !!quest && Object.prototype.hasOwnProperty.call(quest, 'fixVersion');
  const supportsStoryPoints = !!quest && Object.prototype.hasOwnProperty.call(quest, 'storyPoints');

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [projectPlanCreating, setProjectPlanCreating] = useState(false);
  const attachmentInputRef = useRef(null);

  const questIdRef = useRef(questId);
  questIdRef.current = questId;

  const applyQuest = useCallback((q) => {
    setQuest(q);
    setTitle(q?.title ?? '');
    setDescription(richTextToPlainText(q?.descriptionDocument || q?.description || ''));
    setXpReward(typeof q?.xpReward === 'number' ? q.xpReward : 0);
    setAssigneeIds(q?.assigneeIds ?? []);
    setIssueType(q?.issueType ?? 2);
    setIssueTypeId(q?.issueTypeId ?? null);
    setPriority(q?.priority ?? 2);
    setLabels(q?.labels ?? '');
    setDueDate(q?.dueDate ? String(q.dueDate).slice(0, 10) : '');
    setStartDate(q?.startDate ? String(q.startDate).slice(0, 10) : '');
    setSprintId(q?.sprintId ?? '');
    setComponent(q?.componentId ?? q?.component ?? '');
    setFixVersion(q?.fixVersionId ?? q?.fixVersion ?? '');
    setStoryPoints(typeof q?.storyPoints === 'number' ? String(q.storyPoints) : '');
    setOriginalEstimate(q?.originalEstimateMinutes ?? '');
    setRemainingEstimate(q?.remainingEstimateMinutes ?? '');
    setNotificationRecipientIds(q?.notificationRecipientIds ?? []);
  }, []);

  const loadQuest = useCallback(() => {
    if (!questId) return;
    setLoading(true);
    quests.get(questId).then((q) => {
      if (questIdRef.current !== questId) return;
      if (q?.id) rememberIssue({ id: q.id, title: q.title, issueKey: q.issueKey, issueType: q.issueType, boardId: q.boardId });
      applyQuest(q);
      setWatcherError('');
    }).catch(() => setQuest(null)).finally(() => {
      if (questIdRef.current === questId) setLoading(false);
    });
  }, [questId, applyQuest]);

  useEffect(() => { loadQuest(); }, [loadQuest]);

  const loadHierarchy = useCallback(() => {
    if (!questId) return;
    questHierarchy.get(questId).then(setHierarchy).catch(() => {});
  }, [questId]);

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
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !isTyping(e.target) && !pendingTransition) onClose?.();
      if ((e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setActivityTab((tab) => (tab === 'comments' || tab === 'all' ? tab : 'comments'));
        window.setTimeout(() => commentRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, pendingTransition]);

  const issueConfig = useBoardIssueConfig(quest?.boardId);
  const shown = (key) => !fieldRule(issueConfig.layout, typeChoice(issueType, issueTypeId), key).hidden;

  const save = async (patch = {}) => {
    if (!questId || !quest) return;
    const s = {
      title, description, xpReward, assigneeIds, issueType, issueTypeId, priority, labels, sprintId, dueDate, startDate,
      component, fixVersion, storyPoints, originalEstimate, remainingEstimate, ...patch,
    };
    if (!String(s.title).trim()) { setTitle(quest.title ?? ''); return; }
    setSaving(true);
    setAuxError('');
    try {
      const payload = {
        title: String(s.title).trim(),
        description: s.description.trim(),
        descriptionDocument: serializeRichText(s.description.trim()),
        xpReward: Math.max(0, Math.min(9999, Number(s.xpReward) || 0)),
        assigneeIds: s.assigneeIds,
        assigneeIdsSet: true,
        issueType: s.issueType,
        issueTypeId: s.issueTypeId,
        issueTypeIdSet: true,
        priority: s.priority,
        labels: s.labels.trim(),
        sprintId: s.sprintId || null,
        sprintIdSet: true,
        dueDate: s.dueDate ? `${s.dueDate}T00:00:00Z` : null,
        dueDateSet: true,
        startDate: s.startDate ? `${s.startDate}T00:00:00Z` : null,
        startDateSet: true,
        originalEstimateMinutes: s.originalEstimate === '' ? null : Number(s.originalEstimate),
        remainingEstimateMinutes: s.remainingEstimate === '' ? null : Number(s.remainingEstimate),
        componentId: s.component || null,
        fixVersionId: s.fixVersion || null,
      };
      if (supportsComponent) payload.component = String(s.component).trim();
      if (supportsFixVersion) payload.fixVersion = String(s.fixVersion).trim();
      if (supportsStoryPoints) {
        payload.storyPointsSet = true;
        payload.storyPoints = s.storyPoints === '' ? null : Math.max(0, Math.min(100, parseInt(s.storyPoints, 10) || 0));
      }
      if (patch.flagged !== undefined) payload.flagged = patch.flagged;
      if (patch.parentQuestId !== undefined) {
        payload.parentQuestId = patch.parentQuestId;
        payload.parentQuestIdSet = true;
      }
      await quests.update(questId, payload);
      applyQuest(await quests.get(questId));
      if (patch.parentQuestId !== undefined) loadHierarchy();
      historyApi.get(questId).then((value) => setHistoryItems(value?.items || value || [])).catch(() => {});
      onChanged?.();
      return true;
    } catch (e) {
      setAuxError(t(e.message || 'Не удалось сохранить задачу.'));
      loadQuest();
      return false;
    } finally {
      setSaving(false);
    }
  };

  const matchesAddMenu = (label) => label.toLocaleLowerCase().includes(addMenuQuery.trim().toLocaleLowerCase());

  const addWebLink = async () => {
    setMenu(null);
    const rawUrl = window.prompt(t('Введите адрес веб-страницы'));
    if (!rawUrl) return;
    let url;
    try {
      url = new URL(rawUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      setAuxError(t('Введите корректную ссылку, начинающуюся с http:// или https://.'));
      return;
    }
    const linkText = window.prompt(t('Введите текст ссылки'), url.hostname) || url.hostname;
    const trimmedDescription = description.trim();
    const nextDescription = `${trimmedDescription}${trimmedDescription ? '\n\n' : ''}[${linkText}](${url.href})`;
    setDescription(nextDescription);
    await save({ description: nextDescription });
  };

  const chooseIssueType = (value) => {
    const custom = issueConfig.types.find((type) => type.id === value);
    const next = custom ? { issueTypeId: custom.id, issueType: custom.baseType } : { issueTypeId: null, issueType: Number(value) };
    setIssueTypeId(next.issueTypeId);
    setIssueType(next.issueType);
    setMenu(null);
    save(next);
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
    persistWatchers(isWatching ? notificationRecipientIds.filter((id) => id !== user.id) : [...notificationRecipientIds, user.id]);
  };

  const sharedTransitions = issueConfig.workflow && quest
    ? (issueWorkflow(issueConfig.workflow, quest)?.transitions || []).filter((x) => x.to !== quest.columnId && (x.any || x.from.includes(quest.columnId)))
    : null;
  const reachable = quest ? reachableColumns(issueConfig.workflow, quest) : null;

  const handleMoveColumn = async (targetColumnId, choice) => {
    setMenu(null);
    if (!questId || !targetColumnId || targetColumnId === quest?.columnId || movingColumn) return;
    if (!choice && sharedTransitions) {
      const options = transitionsTo(issueConfig.workflow, quest, targetColumnId) || [];
      if (needsTransitionDialog(options)) {
        setPendingTransition({ transitions: options, targetColumnId });
        return;
      }
      choice = { transition: options[0]?.key };
    }
    setMovingColumn(true);
    try {
      const targetColumn = columns.find((c) => c.id === targetColumnId);
      const newOrder = (targetColumn?.quests ?? targetColumn?.Quests ?? []).length;
      await quests.move({ questId, targetColumnId, newOrder, ...choice });
      applyQuest(await quests.get(questId));
      onChanged?.();
    } catch (e) {
      window.alert(t(e.message || 'Не удалось переместить задачу.'));
    } finally {
      setMovingColumn(false);
    }
  };

  const handleTransition = async (transitionId) => {
    setMenu(null);
    if (!transitionId) return;
    try {
      await workflows.transition(questId, transitionId);
      loadQuest();
      onChanged?.();
    } catch (e) { setAuxError(e.message); }
  };

  const handleDelete = async () => {
    setMenu(null);
    if (!questId || !window.confirm(t('Удалить квест?'))) return;
    try {
      const ok = await quests.delete(questId);
      if (ok) { onChanged?.(); onClose?.(); }
    } catch (e) {
      setAuxError(e.message || t('Не удалось удалить задачу.'));
    }
  };

  const handleAddComment = async () => {
    if (!questId || !newComment.trim() || commentSaving) return;
    setCommentSaving(true);
    setCommentError('');
    try {
      const comment = await quests.addComment(questId, newComment.trim(), { isInternal: commentInternal });
      if (comment) setComments((current) => [...current, comment]);
      setNewComment('');
      setCommentInternal(false);
      setCommentFocused(false);
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

  const handleProjectPlanTemplate = async () => {
    if (!quest?.boardId || projectPlanCreating) return;
    setProjectPlanCreating(true);
    setAuxError('');
    try {
      const docs = await spaceContent.listDocs(quest.boardId);
      const existing = (Array.isArray(docs) ? docs : []).find((doc) => doc.title?.trim().toLowerCase() === 'план проекта');
      const doc = existing || await spaceContent.createDoc(quest.boardId, {
        title: 'План проекта',
        content: PROJECT_PLAN_TEMPLATE,
        parentId: null,
      });
      navigate(`/board/${quest.boardId}/docs/${doc.id}${existing ? '' : '?edit=1'}`);
    } catch (e) {
      setAuxError(e.message || 'Не удалось создать план проекта.');
    } finally {
      setProjectPlanCreating(false);
    }
  };

  const handleAddLink = async (event) => {
    event.preventDefault();
    if (!linkQuestId.trim()) return;
    try {
      const created = await questLinks.create(questId, { target: linkQuestId.trim(), type: linkType });
      setLinks((current) => [...current, created]);
      setLinkQuestId('');
      setAddingLink(false);
    } catch (e) { setAuxError(e.message); }
  };

  const handleDeleteLink = async (link) => {
    try {
      await questLinks.delete(questId, link.id);
      setLinks((current) => current.filter((item) => item.id !== link.id));
    } catch (e) { setAuxError(e.message); }
  };

  const childIssueType = issueType === 0 ? 2 : 4;
  const handleAddChild = async (event) => {
    event.preventDefault();
    const summary = childTitle.trim();
    if (!summary || !quest) return;
    try {
      await quests.create({
        title: summary,
        columnId: columns[0]?.id ?? quest.columnId,
        category: 0,
        xpReward: 10,
        isEpic: false,
        issueType: childIssueType,
        parentQuestId: questId,
        ...(quest.sprintId ? { sprintId: quest.sprintId } : {}),
      });
      setChildTitle('');
      loadHierarchy();
      onChanged?.();
    } catch (e) { setAuxError(t(e.message || 'Не удалось создать задачу.')); }
  };

  const handleSetParent = async (event) => {
    event.preventDefault();
    const key = parentKey.trim().toUpperCase();
    if (!key) { setEditingParent(false); return; }
    try {
      const parent = await quests.resolveKey(key);
      if (!parent?.id) throw new Error(t('Задача {key} не найдена').replace('{key}', key));
      setEditingParent(false);
      setParentKey('');
      await save({ parentQuestId: parent.id });
    } catch (e) { setAuxError(t(e.message || 'Не удалось сохранить задачу.')); }
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
    setMenu(null);
    try {
      const cloned = await cloneApi.quest(questId, { includeLinks: false, includeWatchers: true });
      window.alert(t('Задача клонирована: ${issueKey}', { issueKey: cloned.issueKey || cloned.id }));
      onChanged?.();
    } catch (e) { setAuxError(e.message); }
  };

  const handleToggleFlag = async () => {
    setMenu(null);
    if (quest.flagged) {
      await save({ flagged: false });
      return;
    }
    setFlagComment('');
    setFlagError('');
    setFlagDialogOpen(true);
  };

  const handleConfirmFlag = async (event) => {
    event.preventDefault();
    if (flagSaving) return;
    setFlagSaving(true);
    setFlagError('');
    const flagged = await save({ flagged: true });
    if (!flagged) {
      setFlagError(t('Не удалось добавить флажок.'));
      setFlagSaving(false);
      return;
    }
    try {
      if (flagComment.trim()) {
        const comment = await quests.addComment(questId, flagComment.trim());
        if (comment) setComments((current) => [...current, comment]);
      }
      setFlagDialogOpen(false);
      setFlagComment('');
    } catch (e) {
      setFlagError(t(e.message || 'Флажок добавлен, но комментарий сохранить не удалось.'));
    } finally {
      setFlagSaving(false);
    }
  };

  const handleVote = async () => {
    setMenu(null);
    try {
      const state = await votesApi.get(questId);
      if (!state.hasVoted) await votesApi.vote(questId);
      else await votesApi.unvote(questId);
      loadQuest();
    } catch (e) { setAuxError(t(e.message || 'Не удалось сохранить голос.')); }
  };

  const handleChooseParent = async () => {
    setMenu(null);
    const key = window.prompt(t('Введите ключ родительской задачи'), hierarchy?.parent?.issueKey || '');
    if (key === null) return;
    if (!key.trim()) {
      await save({ parentQuestId: null });
      return;
    }
    try {
      const parent = await quests.resolveKey(key.trim().toUpperCase());
      if (!parent?.id) throw new Error(t('Задача не найдена.'));
      await save({ parentQuestId: parent.id });
    } catch (e) { setAuxError(t(e.message || 'Не удалось сохранить задачу.')); }
  };

  const handleArchive = async () => {
    setMenu(null);
    if (!window.confirm(t('Архивировать задачу ${key}?', { key: quest.issueKey }))) return;
    try {
      const board = await boards.getById(quest.boardId);
      const archive = (board?.columns || []).find((column) => column.kind === 5);
      if (!archive) throw new Error(t('В этом пространстве нет архива.'));
      await quests.move({ questId, targetColumnId: archive.id, newOrder: (archive.quests || []).length });
      onChanged?.();
      onClose?.();
    } catch (e) { setAuxError(t(e.message || 'Не удалось архивировать задачу.')); }
  };

  const toggle = (name) => setMenu((current) => (current === name ? null : name));
  const formatDate = (value) => (value ? new Date(value).toLocaleString(locale) : '');
  const currentStatus = quest ? columns.find((c) => c.id === quest.columnId) : null;
  const typeOptions = [
    ...BASE_TYPES.map((x) => ({ value: String(x.value), issueType: x.value, typeId: null, label: t(x.label) })),
    ...issueConfig.types.map((x) => ({ value: x.id, issueType: x.baseType, typeId: x.id, label: x.name })),
  ];
  const currentTypeLabel = typeOptions.find((x) => x.value === typeChoice(issueType, issueTypeId))?.label;
  const statusItems = !quest ? [] : sharedTransitions
    ? sharedTransitions.map((x) => ({
      key: x.key,
      label: x.name,
      target: columns.find((c) => c.id === x.to),
      run: () => { setMenu(null); if (needsTransitionDialog([x])) setPendingTransition({ transitions: [x], targetColumnId: x.to }); else handleMoveColumn(x.to, { transition: x.key }); },
    }))
    : [
      ...columns.filter((c) => c.id !== quest.columnId && (!reachable || reachable.has(c.id))).map((c) => ({ key: c.id, label: c.title, target: c, run: () => handleMoveColumn(c.id) })),
      ...transitions.map((x) => ({ key: `wf-${x.id}`, label: x.name, target: columns.find((c) => c.id === x.targetColumnId), run: () => handleTransition(x.id) })),
    ];
  const children = hierarchy?.children || [];
  const reporter = hierarchy?.reporter;
  const me = members.find((m) => m.userId === user?.id);
  const activity = [
    ...(activityTab === 'all' || activityTab === 'comments' ? comments.map((x) => ({ kind: 'comment', at: x.createdAt, item: x })) : []),
    ...(activityTab === 'all' || activityTab === 'history' ? historyItems.map((x) => ({ kind: 'history', at: x.createdAt, item: x })) : []),
    ...(activityTab === 'all' || activityTab === 'worklog' ? worklogList.map((x) => ({ kind: 'worklog', at: x.startedAt || x.createdAt, item: x })) : []),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const renderActivity = ({ kind, item }, index) => {
    if (kind === 'comment') {
      return (
        <li key={`c-${item.id}`} className="iv-activity-item">
          <AssigneeAvatar userId={item.authorUserId} displayName={item.authorName} avatarUrl={item.authorAvatarUrl} size={32} />
          <div className="iv-activity-body">
            <div className="iv-activity-head"><strong>{item.authorName}</strong><span>{formatDate(item.createdAt)}</span>{item.isInternal ? <span className="iv-lozenge">{t('Внутренний')}</span> : null}</div>
            <p className="iv-comment-text"><MentionText text={item.text} currentUserId={user?.id} /></p>
            {item.authorUserId === user?.id && (
              <button type="button" className="iv-link-btn" onClick={() => handleDeleteComment(item)}>{t('Удалить')}</button>
            )}
          </div>
        </li>
      );
    }
    if (kind === 'history') {
      return (
        <li key={`h-${item.id || index}`} className="iv-activity-item">
          <AssigneeAvatar userId={item.userId} displayName={item.userName || t('Система')} size={32} />
          <div className="iv-activity-body">
            <div className="iv-activity-head"><strong>{item.userName || t('Система')}</strong><span>{formatDate(item.createdAt)}</span></div>
            <p>
              {t('изменил(а)')} <strong>{item.field || item.changeType}</strong>
              {(item.oldValue || item.newValue) && <span className="iv-history-change">{item.oldValue ? `${item.oldValue} → ` : ''}{item.newValue || ''}</span>}
            </p>
          </div>
        </li>
      );
    }
    return (
      <li key={`w-${item.id || index}`} className="iv-activity-item">
        <AssigneeAvatar userId={item.userId} displayName={item.userName || item.authorName || t('Участник')} size={32} />
        <div className="iv-activity-body">
          <div className="iv-activity-head"><strong>{item.userName || item.authorName || t('Участник')}</strong><span>{formatDate(item.startedAt || item.createdAt)}</span></div>
          <p>{t('Затрачено')}: {item.timeSpentMinutes ?? item.minutes} {t('мин.')}</p>
        </div>
      </li>
    );
  };

  return (
    <div className={`iv-overlay ${panel ? 'is-panel' : ''}`} onMouseDown={(e) => { if (!panel && e.target === e.currentTarget) onClose?.(); }}>
      <div className="iv-dialog" role="dialog" aria-modal={panel ? 'false' : 'true'} aria-label={quest?.issueKey || t('Задача')}>
        <header className="iv-header">
          <nav className="iv-breadcrumbs" aria-label={t('Навигация')}>
            {hierarchy?.parent ? (
              <span className="iv-crumb" title={hierarchy.parent.title}>
                <IssueTypeIcon issueType={hierarchy.parent.issueType} size={14} />
                {hierarchy.parent.issueKey}
              </span>
            ) : quest && (
              <button type="button" className="iv-crumb iv-crumb-btn" onClick={() => setEditingParent(true)}>
                <span aria-hidden="true">✎</span> {t('Добавить родителя')}
              </button>
            )}
            {quest && <span className="iv-crumb-sep">/</span>}
            {quest && (
              <span className="iv-anchor">
                <button type="button" className="iv-crumb iv-crumb-btn" aria-label={t('Тип задачи')} title={currentTypeLabel} onClick={() => toggle('type')}>
                  <IssueTypeIcon issueType={issueType} typeId={issueTypeId} size={14} />
                </button>
                <Menu open={menu === 'type'} onClose={() => setMenu(null)} label={t('Тип задачи')}>
                  {typeOptions.map((x) => (
                    <button key={x.value} type="button" role="menuitem" className="iv-menu-item" onClick={() => chooseIssueType(x.value)}>
                      <IssueTypeIcon issueType={x.issueType} typeId={x.typeId} size={16} /> {x.label}
                    </button>
                  ))}
                </Menu>
              </span>
            )}
            {quest?.issueKey && (
              <button type="button" className="iv-crumb iv-crumb-btn" onClick={handleCopyLink} title={linkCopied ? t('Ссылка скопирована') : t('Копировать ссылку')}>
                {quest.issueKey}
              </button>
            )}
          </nav>
          <div className="iv-header-actions">
            {saving && <span className="iv-saving">{t('Сохранение…')}</span>}
            {quest && (
              <span className="iv-anchor">
                <button type="button" className={`iv-icon-btn iv-watch ${isWatching ? 'is-on' : ''}`} aria-label={t('Наблюдатели')} title={t('Наблюдатели')} onClick={() => toggle('watch')}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" /></svg>
                  <span>{notificationRecipientIds.length}</span>
                </button>
                <Menu open={menu === 'watch'} onClose={() => setMenu(null)} align="right" label={t('Наблюдатели')}>
                  <div className="iv-watch-panel">
                    <button type="button" className="iv-menu-item" onClick={toggleWatching} disabled={!user || watcherSaving}>
                      {isWatching ? t('Прекратить наблюдение') : t('Начать наблюдение')}
                    </button>
                    <p className="iv-hint">{t('Наблюдатели получают email-уведомления об изменениях задачи.')}</p>
                    {watcherError && <p className="issue-drawer-error" role="alert">{watcherError}</p>}
                    <NotificationRecipientPicker members={members} selectedIds={notificationRecipientIds} onChange={persistWatchers} disabled={watcherSaving} />
                  </div>
                </Menu>
              </span>
            )}
            {quest?.issueKey && (
              <button type="button" className="iv-icon-btn" onClick={handleCopyLink} aria-label={t('Копировать ссылку')} title={linkCopied ? t('Ссылка скопирована') : t('Копировать ссылку')}>
                {linkCopied ? '✓' : (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z" /></svg>
                )}
              </button>
            )}
            {quest && (
              <span className="iv-anchor">
                <button type="button" className="iv-icon-btn" aria-label={t('Действия')} title={t('Действия')} onClick={() => toggle('more')}>⋯</button>
                <Menu open={menu === 'more'} onClose={() => setMenu(null)} align="right" label={t('Действия')}>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); setActivityTab('worklog'); }}>{t('Записать время')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={handleToggleFlag}>{quest.flagged ? t('Убрать флажок') : t('Добавить флажок')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={handleVote}>{t('Добавить или убрать голос')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={handleChooseParent}>{t('Добавить или изменить родителя')}</button>
                  <div className="iv-menu-divider" role="separator" />
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={handleClone}>{t('Клонировать')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => setMenu('status')}>{t('Переместить')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={handleArchive}>{t('Архивировать')}</button>
                  {canDelete && <button type="button" role="menuitem" className="iv-menu-item is-danger" onClick={handleDelete}>{t('Удалить')}</button>}
                  <div className="iv-menu-divider" role="separator" />
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); window.setTimeout(() => window.print(), 0); }}>{t('Печать')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); downloadIssue(quest, 'csv'); }}>{t('Экспортировать в Excel')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); downloadIssue(quest, 'doc'); }}>{t('Экспорт в Word')}</button>
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); downloadIssue(quest, 'xml'); }}>{t('Экспорт в XML')}</button>
                  <div className="iv-menu-divider" role="separator" />
                  <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); navigate(`/board/${quest.boardId}/settings`); }}>{t('Настроить')}</button>
                </Menu>
              </span>
            )}
            <button type="button" className="iv-icon-btn" onClick={onClose} aria-label={t('Закрыть')} title={t('Закрыть')}>✕</button>
          </div>
        </header>

        {auxError && <p className="issue-drawer-error" role="alert">{auxError}</p>}
        {loading && !quest ? (
          <div className="iv-placeholder">{t('Загрузка…')}</div>
        ) : !quest ? (
          <div className="iv-placeholder">{t('Задача не найдена.')}</div>
        ) : (
          <div className="iv-body">
            <main className="iv-main">
              <textarea
                ref={titleRef}
                className="iv-title"
                rows={1}
                value={title}
                aria-label={t('Название')}
                onChange={(e) => setTitle(e.target.value.replace(/\r?\n/g, ' '))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  if (e.key === 'Escape') { setTitle(quest.title ?? ''); e.currentTarget.blur(); }
                }}
                onBlur={() => { if (title.trim() !== (quest.title ?? '')) save(); }}
              />
              <div className="iv-quick-actions">
                <span className="iv-anchor">
                  <button type="button" className="iv-square-btn" aria-label={t('Приложения')} title={t('Приложения')} onClick={() => toggle('apps')}>⋯</button>
                  <Menu open={menu === 'apps'} onClose={() => setMenu(null)} label={t('Приложения')}>
                    <Link to={`/board/${quest.boardId}/integrations`} role="menuitem" className="iv-menu-item" onClick={() => setMenu(null)}>{t('Добавить приложения')}</Link>
                  </Menu>
                </span>
                <span className="iv-anchor">
                  <button
                    type="button"
                    className="iv-square-btn"
                    aria-label={t('Добавить')}
                    title={t('Добавить')}
                    onClick={() => {
                      setAddMenuQuery('');
                      toggle('add');
                    }}
                  >+</button>
                  <Menu open={menu === 'add'} onClose={() => setMenu(null)} label={t('Добавить')} className="iv-add-menu">
                    <label className="iv-add-menu-search">
                      <NavIcon name="search" size={16} />
                      <input
                        autoFocus
                        value={addMenuQuery}
                        onChange={(event) => setAddMenuQuery(event.target.value)}
                        placeholder={t('Поиск пункта меню')}
                        aria-label={t('Поиск пункта меню')}
                      />
                    </label>
                    {issueType !== 4 && matchesAddMenu(issueType === 0 ? 'Создать дочернюю задачу' : 'Создать подзадачу') && (
                      <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); setAddingChild(true); }}>
                        <NavIcon name="subtask" size={18} />
                        <span>{issueType === 0 ? t('Создать дочернюю задачу') : t('Создать подзадачу')}</span>
                        <kbd>⇧ C</kbd>
                      </button>
                    )}
                    {matchesAddMenu('Связать задачу') && (
                      <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); setAddingLink(true); }}>
                        <NavIcon name="link" size={18} />
                        <span>{t('Связать задачу')}</span>
                        <kbd>⇧ K</kbd>
                      </button>
                    )}
                    {(matchesAddMenu('Добавить вложение') || matchesAddMenu('Добавить ссылку на веб-страницу')) && <div className="iv-menu-divider" role="separator" />}
                    {matchesAddMenu('Добавить вложение') && (
                      <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); attachmentInputRef.current?.click(); }}>
                        <NavIcon name="attachment" size={18} />
                        <span>{t('Добавить вложение')}</span>
                      </button>
                    )}
                    {matchesAddMenu('Добавить ссылку на веб-страницу') && (
                      <button type="button" role="menuitem" className="iv-menu-item" onClick={addWebLink}>
                        <NavIcon name="globe" size={18} />
                        <span>{t('Добавить ссылку на веб-страницу')}</span>
                      </button>
                    )}
                    {videoRecommendationVisible && matchesAddMenu('Рекомендации Видео') && (
                      <>
                        <div className="iv-menu-divider" role="separator" />
                        <div className="iv-add-menu-heading">{t('Рекомендации')}</div>
                        <div className="iv-add-menu-recommendation">
                          <NavIcon name="video" size={18} />
                          <span>{t('Видео')}</span>
                          <button
                            type="button"
                            className="iv-add-menu-install"
                            onClick={() => navigate(`/board/${quest.boardId}/integrations`)}
                          >{t('Добавить')}</button>
                          <button
                            type="button"
                            className="iv-add-menu-dismiss"
                            aria-label={t('Скрыть рекомендацию Видео')}
                            onClick={() => setVideoRecommendationVisible(false)}
                          >×</button>
                        </div>
                      </>
                    )}
                  </Menu>
                </span>
                <input ref={attachmentInputRef} type="file" className="issue-drawer-file-input" onChange={handleUploadAttachment} />
              </div>
              <AiSummary questId={questId} />

              {shown('description') && (
                <section className="iv-section">
                  <h3>{t('Описание')}</h3>
                  {editingDescription ? (
                    <div className="iv-editor">
                      <div className="issue-drawer-editor-toolbar">
                        <button type="button" onClick={() => setDescription((value) => `${value}${value ? '\n\n' : ''}# `)}>H</button>
                        <button type="button" onClick={() => setDescription((value) => `${value}${value ? '\n' : ''}- `)}>•</button>
                        <button type="button" onClick={() => setDescriptionPreview((value) => !value)}>{descriptionPreview ? t('Редактировать') : t('Предпросмотр')}</button>
                      </div>
                      {descriptionPreview
                        ? <RichTextPreview value={serializeRichText(description)} currentUserId={user?.id} />
                        : <MentionTextarea autoFocus value={description} onChange={setDescription} members={members} rows={6} aria-label={t('Описание')} placeholder={t('Введите @, чтобы упомянуть пользователя')} />}
                      <div className="iv-editor-actions">
                        <button type="button" className="app-btn app-btn-primary" onClick={() => { setEditingDescription(false); setDescriptionPreview(false); save(); }}>{t('Сохранить')}</button>
                        <button type="button" className="app-btn app-btn-subtle" onClick={() => { setEditingDescription(false); setDescriptionPreview(false); setDescription(richTextToPlainText(quest.descriptionDocument || quest.description || '')); }}>{t('Отмена')}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="iv-inline-edit" onClick={() => setEditingDescription(true)}>
                      {description.trim() ? <RichTextPreview value={serializeRichText(description)} currentUserId={user?.id} /> : <span className="iv-placeholder-text">{t('Редактировать описание')}</span>}
                    </button>
                  )}
                  <AiDescriptionAssist compact boardId={quest.boardId} title={title} issueType={issueType} issueTypeName={currentTypeLabel}
                    description={description}
                    onAccept={(text) => { setDescription(text); setEditingDescription(false); setDescriptionPreview(false); save({ description: text }); }} />
                </section>
              )}

              {(attachments.length > 0 || attachmentUploading || attachmentError) && (
                <section className="iv-section">
                  <div className="iv-section-head">
                    <h3>{t('Вложения')} <span className="iv-count">{attachments.length}</span></h3>
                    <button type="button" className="iv-square-btn" aria-label={t('Прикрепить файл')} title={t('Прикрепить файл')} onClick={() => attachmentInputRef.current?.click()} disabled={attachmentUploading}>+</button>
                  </div>
                  {attachmentError && <p className="issue-drawer-error" role="alert">{attachmentError}</p>}
                  {attachmentsLoading || attachmentUploading ? <p className="issue-drawer-empty">{t('Загрузка…')}</p> : (
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
                            <button type="button" onClick={() => handleDownloadAttachment(attachment)}>{t('Скачать')}</button>
                            <button type="button" onClick={() => handleDeleteAttachment(attachment)} disabled={deletingAttachmentId === attachment.id}>
                              {deletingAttachmentId === attachment.id ? '…' : t('Удалить')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {issueType !== 4 && (
                <section className="iv-section">
                  <h3>{issueType === 0 ? t('Дочерние задачи') : t('Подзадачи')}</h3>
                  {children.length > 0 && (
                    <ul className="iv-issue-list">
                      {children.map((child) => (
                        <li key={child.id}>
                          <IssueTypeIcon issueType={child.issueType} typeId={child.issueTypeId} size={16} />
                          <span className="iv-issue-key">{child.issueKey}</span>
                          <span className="iv-issue-title">{child.title}</span>
                          {child.status && <span className={`iv-lozenge is-${statusTone(child.statusKind)}`}>{child.status}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {addingChild ? (
                    <form className="iv-inline-form" onSubmit={handleAddChild}>
                      <input autoFocus value={childTitle} maxLength={255} placeholder={t('Что нужно сделать?')} aria-label={t('Что нужно сделать?')}
                        onChange={(e) => setChildTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setAddingChild(false); setChildTitle(''); } }} />
                      <button type="submit" className="app-btn app-btn-primary" disabled={!childTitle.trim()}>{t('Создать')}</button>
                      <button type="button" className="app-btn app-btn-subtle" onClick={() => { setAddingChild(false); setChildTitle(''); }}>{t('Отмена')}</button>
                    </form>
                  ) : (
                    <button type="button" className="iv-inline-edit iv-placeholder-text" onClick={() => setAddingChild(true)}>
                      {issueType === 0 ? t('Добавить дочернюю задачу') : t('Добавить подзадачу')}
                    </button>
                  )}
                </section>
              )}

              <section className="iv-section">
                <h3>{t('Привязанные задачи')}</h3>
                {links.length > 0 && (
                  <ul className="iv-issue-list">
                    {links.map((link) => (
                      <li key={link.id}>
                        <span className="iv-link-type">{t(LINK_TYPE_LABELS[link.type] || 'связана с')}</span>
                        <span className="iv-issue-key">{link.targetKey || link.targetQuestId}</span>
                        <span className="iv-issue-title">{link.targetTitle || ''}</span>
                        <button type="button" className="iv-icon-btn" aria-label={t('Удалить связь')} title={t('Удалить связь')} onClick={() => handleDeleteLink(link)}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
                {addingLink ? (
                  <form className="iv-inline-form" onSubmit={handleAddLink}>
                    <select value={linkType} onChange={(e) => setLinkType(Number(e.target.value))} aria-label={t('Тип связи')}>
                      {LINK_TYPE_LABELS.map((label, index) => <option key={label} value={index}>{t(label)}</option>)}
                    </select>
                    <input autoFocus value={linkQuestId} onChange={(e) => setLinkQuestId(e.target.value)} placeholder={t('Ключ задачи, например KAN-12')} aria-label={t('Ключ задачи')} />
                    <button type="submit" className="app-btn app-btn-primary" disabled={!linkQuestId.trim()}>{t('Привязать')}</button>
                    <button type="button" className="app-btn app-btn-subtle" onClick={() => { setAddingLink(false); setLinkQuestId(''); }}>{t('Отмена')}</button>
                  </form>
                ) : (
                  <button type="button" className="iv-inline-edit iv-placeholder-text" onClick={() => setAddingLink(true)}>{t('Добавить связанную задачу')}</button>
                )}
              </section>

              <section className="iv-section">
                <h3>{t('Активность')}</h3>
                <div className="iv-tabs" role="tablist">
                  {ACTIVITY_TABS.map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={activityTab === key} className={activityTab === key ? 'is-active' : ''} onClick={() => setActivityTab(key)}>{t(label)}</button>
                  ))}
                </div>
                {(activityTab === 'comments' || activityTab === 'all') && (
                  <div className="iv-composer">
                    <AssigneeAvatar userId={user?.id} displayName={user?.displayName || me?.displayName || ''} avatarUrl={user?.avatarUrl || me?.avatarUrl} size={32} />
                    <div className="iv-composer-body">
                      <MentionTextarea
                        ref={commentRef}
                        members={members}
                        value={newComment}
                        rows={commentFocused || newComment ? 3 : 1}
                        placeholder={t('Добавить комментарий…')}
                        aria-label={t('Добавить комментарий…')}
                        onFocus={() => setCommentFocused(true)}
                        onChange={(value) => setNewComment(value.slice(0, 5000))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment();
                          if (e.key === 'Escape') { setNewComment(''); setCommentFocused(false); e.currentTarget.blur(); }
                        }}
                      />
                      {commentFocused || newComment ? (
                        <div className="iv-editor-actions">
                          <label className="iv-check">
                            <input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} />
                            {t('Внутренняя заметка')}
                          </label>
                          <button type="button" className="app-btn app-btn-primary" onClick={handleAddComment} disabled={commentSaving || !newComment.trim()}>{commentSaving ? '…' : t('Сохранить')}</button>
                          <button type="button" className="app-btn app-btn-subtle" onClick={() => { setNewComment(''); setCommentInternal(false); setCommentFocused(false); }}>{t('Отмена')}</button>
                        </div>
                      ) : (
                        <div className="iv-starters">
                          {COMMENT_STARTERS.map((text) => (
                            <button key={text} type="button" onClick={() => { setNewComment(`${t(text).replace(/\.\.\.\??$/, '')} `); commentRef.current?.focus(); }}>{t(text)}</button>
                          ))}
                        </div>
                      )}
                      {commentError && <p className="issue-drawer-error">{commentError}</p>}
                      <p className="iv-hint">{t('Совет: нажмите')} <kbd>M</kbd>{t(', чтобы добавить комментарий')}</p>
                    </div>
                  </div>
                )}
                {activityTab === 'worklog' && (
                  <form className="iv-inline-form" onSubmit={handleLogWork}>
                    <input type="number" min="1" value={worklogMinutes} onChange={(e) => setWorklogMinutes(e.target.value)} placeholder={t('Затрачено минут')} aria-label={t('Затрачено минут')} />
                    <button type="submit" className="app-btn app-btn-primary" disabled={!Number(worklogMinutes)}>{t('Записать')}</button>
                  </form>
                )}
                {activity.length === 0
                  ? <p className="issue-drawer-empty">{activityTab === 'history' ? t('История пока пуста.') : activityTab === 'worklog' ? t('Время ещё не записано.') : activityTab === 'comments' ? t('Комментариев пока нет.') : t('Активности пока нет.')}</p>
                  : <ul className="iv-activity">{activity.map(renderActivity)}</ul>}
              </section>
            </main>

            <aside className="iv-side">
              <div className="iv-status-row">
                <span className="iv-anchor">
                  <button type="button" className={`iv-status-btn is-${statusTone(currentStatus?.kind)}`} onClick={() => toggle('status')} disabled={movingColumn || statusItems.length === 0} aria-label={t('Статус')}>
                    {currentStatus?.title || t('Статус')} <span aria-hidden="true">▾</span>
                  </button>
                  <Menu open={menu === 'status'} onClose={() => setMenu(null)} label={t('Статус')}>
                    {statusItems.map((item) => (
                      <button key={item.key} type="button" role="menuitem" className="iv-menu-item" onClick={item.run}>
                        <span>{item.label}</span>
                        {item.target && item.target.title !== item.label && <span className={`iv-lozenge is-${statusTone(item.target.kind)}`}>{item.target.title}</span>}
                      </button>
                    ))}
                  </Menu>
                </span>
              </div>

              <section className="iv-confluence">
                <div className="iv-confluence-head">
                  <h3>{t('Контент Confluence')} <span title={t('Документы раздела')} aria-label={t('Документы раздела')}>ⓘ</span></h3>
                  <span className="iv-anchor">
                    <button type="button" className="iv-icon-btn" aria-label={t('Действия контента')} title={t('Действия контента')} onClick={() => toggle('content')}>⋯</button>
                    <Menu open={menu === 'content'} onClose={() => setMenu(null)} align="right" label={t('Контент Confluence')}>
                      <Link to={`/board/${quest.boardId}/docs`} role="menuitem" className="iv-menu-item" onClick={() => setMenu(null)}>{t('Открыть документы')}</Link>
                      <button type="button" role="menuitem" className="iv-menu-item" onClick={() => { setMenu(null); handleProjectPlanTemplate(); }}>{t('Создать план проекта')}</button>
                    </Menu>
                  </span>
                </div>
                <div className="iv-confluence-item">
                  <Link to={`/board/${quest.boardId}/docs`}><span aria-hidden="true">▣</span>{t('План проекта')}</Link>
                  <button type="button" onClick={handleProjectPlanTemplate} disabled={projectPlanCreating}>
                    {projectPlanCreating ? '…' : t('Попробовать шаблон')}
                  </button>
                </div>
              </section>

              <details className="iv-panel" open>
                <summary>{t('Сведения')}</summary>
                <div className="iv-panel-body">
                  {shown('assignee') && (
                    <Row label={t('Исполнитель')}>
                      <AssigneeSelect value={assigneeIds} options={members} onChange={(ids) => { setAssigneeIds(ids); save({ assigneeIds: ids }); }} placeholder={t('Не назначено')} />
                      {me && !assigneeIds.includes(me.userId) && (
                        <button type="button" className="iv-link-btn" onClick={() => { const ids = [...assigneeIds, me.userId]; setAssigneeIds(ids); save({ assigneeIds: ids }); }}>{t('Назначить себе')}</button>
                      )}
                    </Row>
                  )}
                  {shown('priority') && (
                    <Row label={t('Приоритет')}>
                      <div className="iv-select">
                        <PriorityIcon priority={priority} size={14} />
                        <select value={priority} aria-label={t('Приоритет')} onChange={(e) => { const value = Number(e.target.value); setPriority(value); save({ priority: value }); }}>
                          {PRIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{t(opt.label)}</option>)}
                        </select>
                      </div>
                    </Row>
                  )}
                  <Row label={t('Родитель')}>
                    {editingParent ? (
                      <form onSubmit={handleSetParent}>
                        <input autoFocus className="iv-input" value={parentKey} placeholder={t('Ключ задачи, например KAN-12')} aria-label={t('Родитель')}
                          onChange={(e) => setParentKey(e.target.value)} onBlur={() => { if (!parentKey.trim()) setEditingParent(false); }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { setEditingParent(false); setParentKey(''); } }} />
                      </form>
                    ) : hierarchy?.parent ? (
                      <span className="iv-parent">
                        <IssueTypeIcon issueType={hierarchy.parent.issueType} size={14} />
                        <span className="iv-issue-key">{hierarchy.parent.issueKey}</span>
                        <span className="iv-issue-title">{hierarchy.parent.title}</span>
                        <button type="button" className="iv-icon-btn" aria-label={t('Убрать родителя')} title={t('Убрать родителя')} onClick={() => save({ parentQuestId: null })}>✕</button>
                      </span>
                    ) : (
                      <button type="button" className="iv-inline-edit iv-placeholder-text" onClick={() => setEditingParent(true)}>{t('Добавьте родительский элемент')}</button>
                    )}
                  </Row>
                  {shown('duedate') && (
                    <Row label={t('Срок исполнения')}>
                      <input type="date" className="iv-input" value={dueDate} aria-label={t('Срок исполнения')} onChange={(e) => { setDueDate(e.target.value); save({ dueDate: e.target.value }); }} />
                    </Row>
                  )}
                  {shown('startdate') && (
                    <Row label={t('Дата начала')}>
                      <input type="date" className="iv-input" value={startDate} aria-label={t('Дата начала')} onChange={(e) => { setStartDate(e.target.value); save({ startDate: e.target.value }); }} />
                    </Row>
                  )}
                  {shown('labels') && (
                    <Row label={t('Метки')}>
                      <input className="iv-input" value={labels} placeholder={t('Добавьте метки')} aria-label={t('Метки')}
                        onChange={(e) => setLabels(e.target.value)} onBlur={() => { if (labels.trim() !== (quest.labels ?? '')) save(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                    </Row>
                  )}
                  {shown('components') && componentOptions.length > 0 && (
                    <Row label={t('Компонент')}>
                      <select className="iv-input" value={component} aria-label={t('Компонент')} onChange={(e) => { setComponent(e.target.value); save({ component: e.target.value }); }}>
                        <option value="">{t('Без компонента')}</option>
                        {componentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Row>
                  )}
                  {shown('fixversions') && releaseOptions.length > 0 && (
                    <Row label={t('Версия исправления')}>
                      <select className="iv-input" value={fixVersion} aria-label={t('Версия исправления')} onChange={(e) => { setFixVersion(e.target.value); save({ fixVersion: e.target.value }); }}>
                        <option value="">{t('Без версии')}</option>
                        {releaseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </Row>
                  )}
                  {shown('sprint') && (
                    <Row label={t('Спринт')}>
                      <select className="iv-input" value={sprintId} aria-label={t('Спринт')} onChange={(e) => { setSprintId(e.target.value); save({ sprintId: e.target.value }); }}>
                        <option value="">{t('Нет')}</option>
                        {boardSprints.filter((s) => s.status !== 2 || s.id === sprintId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </Row>
                  )}
                  {supportsStoryPoints && shown('storypoints') && (
                    <Row label={t('Story point estimate')}>
                      <input type="number" min={0} max={100} className="iv-input" value={storyPoints} placeholder={t('Добавьте оценку')} aria-label={t('Story point estimate')}
                        onChange={(e) => setStoryPoints(e.target.value === '' ? '' : String(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))))}
                        onBlur={() => { if (storyPoints !== (typeof quest.storyPoints === 'number' ? String(quest.storyPoints) : '')) save(); }} />
                    </Row>
                  )}
                  <Row label={t('Первоначальная оценка, мин.')}>
                    <input type="number" min="0" className="iv-input" value={originalEstimate} aria-label={t('Первоначальная оценка, мин.')}
                      onChange={(e) => setOriginalEstimate(e.target.value)} onBlur={() => { if (String(originalEstimate) !== String(quest.originalEstimateMinutes ?? '')) save(); }} />
                  </Row>
                  <Row label={t('Осталось, мин.')}>
                    <input type="number" min="0" className="iv-input" value={remainingEstimate} aria-label={t('Осталось, мин.')}
                      onChange={(e) => setRemainingEstimate(e.target.value)} onBlur={() => { if (String(remainingEstimate) !== String(quest.remainingEstimateMinutes ?? '')) save(); }} />
                  </Row>
                  <Row label={t('Опыт (XP)')}>
                    <input type="number" min={0} max={9999} className="iv-input" value={xpReward} aria-label={t('Опыт (XP)')}
                      onChange={(e) => setXpReward(Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0)))} onBlur={() => { if (xpReward !== quest.xpReward) save(); }} />
                  </Row>
                  <Row label={t('Автор')}>
                    {reporter ? (
                      <span className="iv-person">
                        <AssigneeAvatar userId={reporter.id} displayName={reporter.displayName} avatarUrl={reporter.avatarUrl} size={24} />
                        {reporter.displayName}
                      </span>
                    ) : <span className="iv-placeholder-text">{t('Нет')}</span>}
                  </Row>
                  <CustomFieldsPanel
                    quest={quest}
                    fields={issueConfig.fields}
                    people={members}
                    refs={issueConfig}
                    layout={issueConfig.layout}
                    onSaved={(values) => { setQuest((current) => (current ? { ...current, customFields: values } : current)); onChanged?.(); }}
                  />
                </div>
              </details>

              <details className="iv-panel">
                <summary>{t('Голоса')}</summary>
                <div className="iv-panel-body">
                  <IssueVotes questId={questId} statusKey={`${quest.columnId}:${quest.completedAt ?? ''}`} />
                </div>
              </details>

              <details className="iv-panel">
                <summary>{t('Ресурсы')}</summary>
                <div className="iv-panel-body">
                  {assetsAvailable
                    ? <IssueAssetsField questId={questId} />
                    : <p className="issue-drawer-empty">{t('Активы доступны в Premium.')} <Link to="/admin/billing/plans?required=premium">{t('Посмотреть планы')}</Link></p>}
                </div>
              </details>

              <details className="iv-panel">
                <summary>{t('Разработка')}</summary>
                <div className="iv-panel-body">
                  <div className="iv-section-head">
                    <span className="iv-hint">{t('Ветки, коммиты и pull request из GitHub')}</span>
                    <button type="button" className="app-btn app-btn-subtle" onClick={handleSyncDevelopment} disabled={developmentSyncing}>{developmentSyncing ? '…' : t('Синхронизировать')}</button>
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
                </div>
              </details>

              <p className="iv-meta">
                {t('Создано')} {formatDate(quest.createdAt)}
                {quest.completedAt && <><br />{t('Выполнено')} {formatDate(quest.completedAt)}</>}
              </p>
            </aside>
          </div>
        )}
      </div>
      {flagDialogOpen && (
        <div className="app-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !flagSaving) setFlagDialogOpen(false);
        }}>
          <form className="app-modal iv-flag-modal" role="dialog" aria-modal="true" aria-label={t('Установка флажка')} onSubmit={handleConfirmFlag}>
            <div className="app-modal-header">
              <h2><NavIcon name="flag" size={18} />{t('Установка флажка')}</h2>
              <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={() => setFlagDialogOpen(false)} disabled={flagSaving}>
                <NavIcon name="close" />
              </button>
            </div>
            <div className="app-modal-body">
              <div className="iv-flag-issue">
                <span>{t('Задача')}</span>
                <IssueTypeIcon issueType={issueType} typeId={issueTypeId} size={16} />
                <strong>{quest?.issueKey}</strong>
                <span>{quest?.title}</span>
              </div>
              <label className="app-field">
                <textarea
                  autoFocus
                  rows={5}
                  maxLength={5000}
                  value={flagComment}
                  onChange={(event) => setFlagComment(event.target.value)}
                  placeholder={t('Необязательно: сообщите команде, почему задача отмечена флажком')}
                  aria-label={t('Причина установки флажка')}
                  disabled={flagSaving}
                />
              </label>
              {flagError && <p className="app-modal-error" role="alert">{flagError}</p>}
            </div>
            <div className="app-modal-footer">
              <button type="button" className="app-btn app-btn-subtle" onClick={() => setFlagDialogOpen(false)} disabled={flagSaving}>{t('Отмена')}</button>
              <button type="submit" className="app-btn app-btn-primary" disabled={flagSaving}>{flagSaving ? '…' : t('Подтвердить')}</button>
            </div>
          </form>
        </div>
      )}
      {pendingTransition && quest && (
        <TransitionScreenDialog
          issue={quest}
          transitions={pendingTransition.transitions}
          targetName={columns.find((c) => c.id === pendingTransition.targetColumnId)?.title}
          config={issueConfig}
          people={members}
          onCancel={() => setPendingTransition(null)}
          onSubmit={async (choice) => {
            const target = columns.find((c) => c.id === pendingTransition.targetColumnId);
            await quests.move({ questId, targetColumnId: pendingTransition.targetColumnId, newOrder: (target?.quests ?? []).length, ...choice });
            setPendingTransition(null);
            applyQuest(await quests.get(questId));
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}
