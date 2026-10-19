import React, { useEffect, useRef, useState, useCallback } from 'react';
import { quests, sprints as sprintsApi } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon } from './IssueIcons.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import AssigneeSelect from './AssigneeSelect.jsx';
import NotificationRecipientPicker from './NotificationRecipientPicker.jsx';
import './IssueDetailDrawer.css';

const MAX_ATTACHMENT_SIZE = 1024 * 1024 * 1024;
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

function formatFileSize(sizeBytes) {
  if (sizeBytes < 1024) return `${sizeBytes} Б`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Jira-like issue detail: desktop right-hand drawer, mobile fullscreen sheet.
 * Self-contained data loading/saving so it can be reused from the board and the backlog.
 */
export default function IssueDetailDrawer({ questId, members = [], onClose, onChanged, canDelete = true }) {
  const { user } = useAuth();
  const { locale, t } = useLocalization();
  const [quest, setQuest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardSprints, setBoardSprints] = useState([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [xpReward, setXpReward] = useState(0);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [issueType, setIssueType] = useState(2);
  const [priority, setPriority] = useState(2);
  const [labels, setLabels] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sprintId, setSprintId] = useState('');
  const [notificationRecipientIds, setNotificationRecipientIds] = useState([]);
  const [saving, setSaving] = useState(false);

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
      setTitle(q?.title ?? '');
      setDescription(q?.description ?? '');
      setXpReward(typeof q?.xpReward === 'number' ? q.xpReward : 0);
      setAssigneeIds(q?.assigneeIds ?? []);
      setIssueType(q?.issueType ?? 2);
      setPriority(q?.priority ?? 2);
      setLabels(q?.labels ?? '');
      setDueDate(q?.dueDate ? String(q.dueDate).slice(0, 10) : '');
      setSprintId(q?.sprintId ?? '');
      setNotificationRecipientIds(q?.notificationRecipientIds ?? []);
    }).catch(() => setQuest(null)).finally(() => {
      if (questIdRef.current === questId) setLoading(false);
    });
  }, [questId]);

  useEffect(() => { loadQuest(); }, [loadQuest]);

  useEffect(() => {
    if (!quest?.boardId) { setBoardSprints([]); return; }
    sprintsApi.getByBoard(quest.boardId).then((list) => setBoardSprints(Array.isArray(list) ? list : [])).catch(() => setBoardSprints([]));
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

  const handleSave = async () => {
    if (!questId) return;
    setSaving(true);
    try {
      const xp = Math.max(0, Math.min(9999, Number(xpReward) || 0));
      await quests.update(questId, {
        title: title.trim(),
        description: description.trim(),
        xpReward: xp,
        assigneeIds,
        assigneeIdsSet: true,
        issueType,
        priority,
        labels: labels.trim(),
        sprintId: sprintId || null,
        sprintIdSet: true,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        notificationRecipientIds,
      });
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

  return (
    <div className="issue-drawer-overlay" onClick={onClose}>
      <aside className="issue-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="issue-drawer-header">
          <button type="button" className="issue-drawer-back" onClick={onClose} title="Назад" aria-label="Назад">←</button>
          <span className="issue-drawer-key">{quest?.issueKey || '…'}</span>
          <button type="button" className="issue-drawer-close" onClick={onClose} title="Закрыть" aria-label="Закрыть">✕</button>
        </header>

        {loading && !quest ? (
          <div className="issue-drawer-body">Загрузка…</div>
        ) : !quest ? (
          <div className="issue-drawer-body">Задача не найдена.</div>
        ) : (
          <div className="issue-drawer-body">
            <input
              className="issue-drawer-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название"
            />

            <div className="issue-drawer-row">
              <label className="issue-drawer-field">
                <span>Тип</span>
                <div className="issue-drawer-select-wrap">
                  <IssueTypeIcon issueType={issueType} size={16} />
                  <select value={issueType} onChange={(e) => setIssueType(Number(e.target.value))}>
                    {ISSUE_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </label>
              <label className="issue-drawer-field">
                <span>Приоритет</span>
                <div className="issue-drawer-select-wrap">
                  <PriorityIcon priority={priority} size={14} />
                  <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                    {PRIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </label>
            </div>

            <label className="issue-drawer-field issue-drawer-field-block">
              <span>Описание</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Описание задачи" />
            </label>

            <label className="issue-drawer-field issue-drawer-field-block">
              <span>Метки</span>
              <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="метка1, метка2" />
            </label>

            <div className="issue-drawer-row">
              <label className="issue-drawer-field">
                <span>Срок</span>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="issue-drawer-field">
                <span>Спринт</span>
                <select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                  <option value="">— Бэклог —</option>
                  {boardSprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.status === 1 ? ' (активный)' : ''}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="issue-drawer-field issue-drawer-field-block">
              <span>Исполнители</span>
              <AssigneeSelect value={assigneeIds} options={members} onChange={setAssigneeIds} placeholder="— не назначены —" />
            </label>

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
              <legend>Email-уведомления получают</legend>
              <NotificationRecipientPicker members={members} selectedIds={notificationRecipientIds} onChange={setNotificationRecipientIds} />
            </fieldset>

            <div className="issue-drawer-actions">
              <button type="button" className="issue-drawer-save" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
              {canDelete && (
                <button type="button" className="issue-drawer-delete" onClick={handleDelete}>Удалить</button>
              )}
            </div>

            <p className="issue-drawer-meta">
              Создан: {quest.createdAt ? new Date(quest.createdAt).toLocaleString(locale) : ''}
              {quest.completedAt && <> · Выполнен: {new Date(quest.completedAt).toLocaleString(locale)}</>}
            </p>

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
