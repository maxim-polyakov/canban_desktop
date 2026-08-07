import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as signalR from '@microsoft/signalr';
import { useAuth } from '../context/AuthContext.jsx';
import { boards, columns, quests, teams } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import AssigneeSelect from '../components/AssigneeSelect.jsx';
import NotificationRecipientPicker from '../components/NotificationRecipientPicker.jsx';
import './BoardPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';
const ARCHIVE_COLUMN_KIND = 5;
const DONE_COLUMN_KIND = 3;
const MAX_ATTACHMENT_SIZE = 1024 * 1024 * 1024;

function formatFileSize(sizeBytes) {
  if (sizeBytes < 1024) return `${sizeBytes} Б`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function BoardPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');
  const [questDetailId, setQuestDetailId] = useState(null);
  const [questDetail, setQuestDetail] = useState(null);
  const [editQuestTitle, setEditQuestTitle] = useState('');
  const [editQuestDescription, setEditQuestDescription] = useState('');
  const [editQuestXpReward, setEditQuestXpReward] = useState(0);
  const [editQuestAssigneeIds, setEditQuestAssigneeIds] = useState([]);
  const [savingQuest, setSavingQuest] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [notificationRecipientIds, setNotificationRecipientIds] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState('');
  const attachmentInputRef = useRef(null);
  const questDetailIdRef = useRef(questDetailId);
  questDetailIdRef.current = questDetailId;

  const loadBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const data = await boards.getById(boardId);
      setBoard(data);
      setEditBoardName(data?.name ?? '');
      setEditBoardDesc(data?.description ?? '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const loadMembers = useCallback(async (teamId) => {
    if (!teamId) return;
    try {
      const list = await teams.getMembers(teamId);
      setMembers(Array.isArray(list) ? list : []);
    } catch {
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Реалтайм: подписка на обновления доски (квест создан/изменён/удалён другим пользователем)
  const loadBoardRef = useRef(loadBoard);
  const loadMembersRef = useRef(loadMembers);
  const teamIdRef = useRef(board?.teamId);
  loadBoardRef.current = loadBoard;
  loadMembersRef.current = loadMembers;
  teamIdRef.current = board?.teamId;
  useEffect(() => {
    if (!boardId || !loadBoardRef.current) return;
    const token = localStorage.getItem('token');
    const hubUrl = API_BASE.replace(/\/$/, '') + '/hubs/board';
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token || '',
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .build();
    connection.on('BoardUpdated', () => {
      loadBoardRef.current?.();
      loadMembersRef.current?.(teamIdRef.current);
    });
    connection.start()
      .then(() => connection.invoke('JoinBoard', boardId))
      .catch((err) => console.warn('Board hub connect:', err));
    return () => {
      connection.invoke('LeaveBoard', boardId).catch(() => {});
      connection.off('BoardUpdated');
      connection.stop().catch(() => {});
    };
  }, [boardId]);

  useEffect(() => {
    if (!board?.teamId) return;
    loadMembers(board.teamId);
  }, [board?.teamId, loadMembers]);

  const handleMoveQuest = async (questId, targetColumnId, newOrder) => {
    const col = board?.columns?.find((c) => c.id === targetColumnId);
    const questIds = (col?.quests ?? []).map((q) => q.id);
    const fromCol = board?.columns?.find((c) => (c.quests ?? []).some((q) => q.id === questId));
    const sameColumn = fromCol?.id === targetColumnId;
    try {
      if (sameColumn) {
        const reordered = [...questIds];
        const idx = reordered.indexOf(questId);
        if (idx !== -1) {
          reordered.splice(idx, 1);
          reordered.splice(Math.min(newOrder, reordered.length), 0, questId);
          await quests.reorder({ columnId: targetColumnId, questIdsInOrder: reordered });
        }
      } else {
        await quests.move({ questId, targetColumnId, newOrder });
      }
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAssignQuest = async (questId, assigneeIds) => {
    try {
      await quests.update(questId, { assigneeIds, assigneeIdsSet: true });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddColumn = async (title, isDoneColumn) => {
    if (!title?.trim() || !boardId) return;
    try {
      const order = (board?.columns?.length ?? 0);
      await columns.create(boardId, {
        title: title.trim(),
        order,
        kind: isDoneColumn ? 3 : 4,
      });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleColumnReorder = async (columnIdsInOrder) => {
    if (!boardId || !columnIdsInOrder?.length) return;
    try {
      await columns.reorder(boardId, columnIdsInOrder);
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateBoard = async (e) => {
    e.preventDefault();
    if (!boardId) return;
    try {
      await boards.update(boardId, { name: editBoardName.trim() || undefined, description: editBoardDesc.trim() || undefined });
      setEditBoardOpen(false);
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBoard = async () => {
    if (!boardId || !window.confirm('Удалить доску? Это действие нельзя отменить.')) return;
    try {
      const result = await boards.delete(boardId);
      if (result === true) navigate('/');
      else if (result?.status === 403) window.alert('Удалить доску может только тот, кто её создал.');
      else console.error('Не удалось удалить доску');
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveCompleted = async () => {
    if (!boardId || archiving) return;
    setArchiving(true);
    try {
      await quests.archiveCompleted(boardId);
      await loadBoard();
    } catch (e) {
      console.error(e);
    } finally {
      setArchiving(false);
    }
  };

  const handleUpdateColumn = async (columnId, title) => {
    if (!title?.trim()) return;
    try {
      await columns.update(columnId, { title: title.trim() });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateColumnKind = async (columnId, kind) => {
    try {
      await columns.update(columnId, { kind });
      await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshColumn = async (columnId) => {
    try {
      const col = await columns.get(columnId);
      if (col && board) setBoard((prev) => ({ ...prev, columns: prev.columns.map((c) => c.id === col.id ? { ...c, ...col, quests: col.quests ?? col.Quests ?? c.quests } : c) }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRefreshColumnQuests = async (columnId) => {
    try {
      const list = await quests.getByColumn(columnId);
      if (board) setBoard((prev) => ({ ...prev, columns: prev.columns.map((c) => c.id === columnId ? { ...c, quests: Array.isArray(list) ? list : c.quests } : c) }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm('Удалить колонку и все квесты в ней?')) return;
    try {
      const ok = await columns.delete(columnId);
      if (ok) await loadBoard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteQuest = async (questId) => {
    if (!window.confirm('Удалить квест?')) return;
    try {
      const ok = await quests.delete(questId);
      if (ok) { setQuestDetailId(null); setQuestDetail(null); await loadBoard(); }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!questDetailId) { setQuestDetail(null); return; }
    let cancelled = false;
    quests.get(questDetailId).then((q) => {
      if (!cancelled) {
        setQuestDetail(q);
        setEditQuestTitle(q?.title ?? '');
        setEditQuestDescription(q?.description ?? '');
        setEditQuestXpReward(typeof q?.xpReward === 'number' ? q.xpReward : 0);
        setEditQuestAssigneeIds(q?.assigneeIds ?? []);
        setNotificationRecipientIds(q?.notificationRecipientIds ?? []);
      }
    }).catch(() => { if (!cancelled) setQuestDetail(null); });
    return () => { cancelled = true; };
  }, [questDetailId]);

  useEffect(() => {
    if (!questDetailId) {
      setComments([]);
      setNewComment('');
      setCommentError('');
      return;
    }
    let cancelled = false;
    quests.getComments(questDetailId).then((list) => {
      if (!cancelled) setComments(Array.isArray(list) ? list : []);
    }).catch((e) => {
      if (!cancelled) setCommentError(e.message || 'Не удалось загрузить комментарии.');
    });
    return () => { cancelled = true; };
  }, [questDetailId]);

  useEffect(() => {
    if (!questDetailId) {
      setAttachments([]);
      setAttachmentError('');
      return;
    }
    let cancelled = false;
    setAttachmentUploading(false);
    setDeletingAttachmentId(null);
    setAttachmentsLoading(true);
    setAttachmentError('');
    quests.getAttachments(questDetailId).then((list) => {
      if (!cancelled) setAttachments(Array.isArray(list) ? list : []);
    }).catch((e) => {
      if (!cancelled) {
        setAttachments([]);
        setAttachmentError(e.message || 'Не удалось загрузить список вложений.');
      }
    }).finally(() => {
      if (!cancelled) setAttachmentsLoading(false);
    });
    return () => { cancelled = true; };
  }, [questDetailId]);

  const handleUploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !questDetailId) return;
    const targetQuestId = questDetailId;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentError('Размер файла не должен превышать 1 ГБ.');
      return;
    }

    setAttachmentUploading(true);
    setAttachmentError('');
    try {
      const uploaded = await quests.uploadAttachment(targetQuestId, file);
      if (uploaded && questDetailIdRef.current === targetQuestId) {
        setAttachments((current) => [uploaded, ...current]);
      }
    } catch (e) {
      if (questDetailIdRef.current === targetQuestId) {
        setAttachmentError(e.message || 'Не удалось загрузить файл.');
      }
    } finally {
      if (questDetailIdRef.current === targetQuestId) setAttachmentUploading(false);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    if (!questDetailId) return;
    const targetQuestId = questDetailId;
    setAttachmentError('');
    try {
      const download = await quests.getAttachmentDownload(targetQuestId, attachment.id);
      if (!download?.url) throw new Error('Ссылка на скачивание не получена.');
      if (questDetailIdRef.current === targetQuestId) window.location.assign(download.url);
    } catch (e) {
      if (questDetailIdRef.current === targetQuestId) {
        setAttachmentError(e.message || 'Не удалось скачать файл.');
      }
    }
  };

  const handleDeleteAttachment = async (attachment) => {
    if (!questDetailId || !window.confirm(`Удалить файл «${attachment.fileName}»?`)) return;
    const targetQuestId = questDetailId;
    setDeletingAttachmentId(attachment.id);
    setAttachmentError('');
    try {
      await quests.deleteAttachment(targetQuestId, attachment.id);
      if (questDetailIdRef.current === targetQuestId) {
        setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      }
    } catch (e) {
      if (questDetailIdRef.current === targetQuestId) {
        setAttachmentError(e.message || 'Не удалось удалить файл.');
      }
    } finally {
      if (questDetailIdRef.current === targetQuestId) setDeletingAttachmentId(null);
    }
  };

  const handleSaveQuest = async () => {
    if (!questDetailId) return;
    setSavingQuest(true);
    try {
      const xp = Math.max(0, Math.min(9999, Number(editQuestXpReward) || 0));
      await quests.update(questDetailId, {
        title: editQuestTitle.trim(),
        description: editQuestDescription.trim(),
        xpReward: xp,
        assigneeIds: editQuestAssigneeIds,
        assigneeIdsSet: true,
        notificationRecipientIds,
      });
      const updated = await quests.get(questDetailId);
      setQuestDetail(updated);
      await loadBoard();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingQuest(false);
    }
  };

  const handleAddComment = async () => {
    if (!questDetailId || !newComment.trim() || commentSaving) return;
    setCommentSaving(true);
    setCommentError('');
    try {
      const comment = await quests.addComment(questDetailId, newComment.trim());
      if (comment) setComments((current) => [...current, comment]);
      setNewComment('');
    } catch (e) {
      setCommentError(e.message || 'Не удалось добавить комментарий.');
    } finally {
      setCommentSaving(false);
    }
  };

  const handleDeleteComment = async (comment) => {
    if (!questDetailId || !window.confirm('Удалить комментарий?')) return;
    try {
      await quests.deleteComment(questDetailId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (e) {
      setCommentError(e.message || 'Не удалось удалить комментарий.');
    }
  };

  if (loading) return <div className="page">Загрузка доски...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;
  if (!board) return <div className="page">Доска не найдена.</div>;

  const copyTeamId = () => {
    if (board.teamId) {
      navigator.clipboard.writeText(board.teamId);
    }
  };
  const boardColumns = (board.columns ?? []).filter((column) => column.kind !== ARCHIVE_COLUMN_KIND);
  const completedQuestCount = boardColumns
    .filter((column) => column.kind === DONE_COLUMN_KIND)
    .reduce((total, column) => total + ((column.quests ?? column.Quests ?? []).length), 0);

  return (
    <div className="page board-page">
      <div className="board-header-row">
        <div>
          <h1 className="board-title">{board.name}</h1>
          {board.description && <p className="board-desc">{board.description}</p>}
        </div>
        <div className="board-actions">
          <Link to={`/board/${boardId}/archive`} className="board-btn board-btn-link">Архив</Link>
          <button
            type="button"
            className="board-btn board-btn-archive"
            onClick={handleArchiveCompleted}
            disabled={archiving || completedQuestCount === 0}
            title={completedQuestCount === 0 ? 'Нет выполненных квестов для архивации' : 'Переместить выполненные квесты в архив'}
          >
            {archiving ? 'Архивация...' : `Архивировать выполненные (${completedQuestCount})`}
          </button>
          <button type="button" className="board-btn board-btn-edit" onClick={() => setEditBoardOpen(true)} title="Изменить доску">✎</button>
          {board.createdByUserId === user?.id && (
            <button type="button" className="board-btn board-btn-delete" onClick={handleDeleteBoard} title="Удалить доску">✕</button>
          )}
        </div>
      </div>
      {editBoardOpen && (
        <form className="board-edit-form" onSubmit={handleUpdateBoard}>
          <label>Название <input value={editBoardName} onChange={(e) => setEditBoardName(e.target.value)} /></label>
          <label>Описание <input value={editBoardDesc} onChange={(e) => setEditBoardDesc(e.target.value)} /></label>
          <div className="board-edit-actions">
            <button type="submit">Сохранить</button>
            <button type="button" onClick={() => setEditBoardOpen(false)}>Отмена</button>
          </div>
        </form>
      )}
      {board.teamId && (
        <p className="board-meta">
          ID команды: <code className="board-id">{board.teamId}</code>
          <button type="button" className="board-copy-id" onClick={copyTeamId} title="Скопировать">Копировать</button>
        </p>
      )}
      <KanbanBoard
        boardId={boardId}
        columns={boardColumns}
        members={members}
        onMoveQuest={handleMoveQuest}
        onAssignQuest={handleAssignQuest}
        onAddColumn={handleAddColumn}
        onColumnReorder={handleColumnReorder}
        onRefresh={loadBoard}
        onUpdateColumn={handleUpdateColumn}
        onUpdateColumnKind={handleUpdateColumnKind}
        onRefreshColumn={handleRefreshColumn}
        onRefreshColumnQuests={handleRefreshColumnQuests}
        onDeleteColumn={handleDeleteColumn}
        onDeleteQuest={handleDeleteQuest}
        onQuestClick={setQuestDetailId}
      />
      {questDetailId && (
        <div className="board-quest-modal-overlay" onClick={() => { setQuestDetailId(null); setQuestDetail(null); }}>
          <div className="board-quest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="board-quest-modal-header">
              <h3>Квест</h3>
              <button type="button" className="board-quest-modal-close" onClick={() => { setQuestDetailId(null); setQuestDetail(null); }}>✕</button>
            </div>
            {questDetail ? (
              <div className="board-quest-modal-body">
                <label className="board-quest-modal-field">
                  Название
                  <input value={editQuestTitle} onChange={(e) => setEditQuestTitle(e.target.value)} />
                </label>
                <label className="board-quest-modal-field">
                  Описание
                  <textarea value={editQuestDescription} onChange={(e) => setEditQuestDescription(e.target.value)} rows={3} placeholder="Описание квеста" />
                </label>
                <label className="board-quest-modal-field">
                  Исполнители
                  <AssigneeSelect
                    value={editQuestAssigneeIds}
                    options={members}
                    onChange={setEditQuestAssigneeIds}
                    placeholder="— не назначены —"
                  />
                </label>
                {questDetail.dueDate && <p>Срок: {new Date(questDetail.dueDate).toLocaleDateString()}</p>}
                <fieldset className="board-quest-notifications">
                  <legend>Email-уведомления получают</legend>
                  <NotificationRecipientPicker
                    members={members}
                    selectedIds={notificationRecipientIds}
                    onChange={setNotificationRecipientIds}
                  />
                </fieldset>
                <section className="board-quest-attachments">
                  <div className="board-quest-attachments-header">
                    <h4>Вложения</h4>
                    <button
                      type="button"
                      className="board-quest-attachment-upload"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={attachmentUploading}
                    >
                      {attachmentUploading ? 'Загрузка…' : '+ Прикрепить файл'}
                    </button>
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      className="board-quest-attachment-input"
                      onChange={handleUploadAttachment}
                    />
                  </div>
                  <p className="board-quest-attachment-hint">Любой формат, до 1 ГБ на файл.</p>
                  {attachmentError && <p className="board-quest-attachment-error" role="alert">{attachmentError}</p>}
                  {attachmentsLoading ? (
                    <p className="board-quest-attachment-empty">Загрузка вложений…</p>
                  ) : attachments.length === 0 ? (
                    <p className="board-quest-attachment-empty">Вложений пока нет.</p>
                  ) : (
                    <ul className="board-quest-attachment-list">
                      {attachments.map((attachment) => (
                        <li key={attachment.id} className="board-quest-attachment-item">
                          <div className="board-quest-attachment-info">
                            <span className="board-quest-attachment-name" title={attachment.fileName}>{attachment.fileName}</span>
                            <span className="board-quest-attachment-meta">
                              {formatFileSize(attachment.sizeBytes)}
                              {attachment.uploadedByName ? ` · ${attachment.uploadedByName}` : ''}
                              {attachment.createdAt ? ` · ${new Date(attachment.createdAt).toLocaleString()}` : ''}
                            </span>
                          </div>
                          <div className="board-quest-attachment-actions">
                            <button type="button" onClick={() => handleDownloadAttachment(attachment)}>Скачать</button>
                            <button
                              type="button"
                              className="board-quest-attachment-delete"
                              onClick={() => handleDeleteAttachment(attachment)}
                              disabled={deletingAttachmentId === attachment.id}
                            >
                              {deletingAttachmentId === attachment.id ? 'Удаление…' : 'Удалить'}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="board-quest-comments">
                  <h4>Комментарии</h4>
                  {comments.length === 0 ? (
                    <p className="board-quest-comment-empty">Комментариев пока нет.</p>
                  ) : (
                    <ul className="board-quest-comment-list">
                      {comments.map((comment) => (
                        <li key={comment.id}>
                          <div className="board-quest-comment-header">
                            <strong>{comment.authorName}</strong>
                            <span>{new Date(comment.createdAt).toLocaleString()}</span>
                            {comment.authorUserId === user?.id && (
                              <button type="button" onClick={() => handleDeleteComment(comment)}>Удалить</button>
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
                    rows={3}
                  />
                  {commentError && <p className="board-quest-comment-error">{commentError}</p>}
                  <button type="button" onClick={handleAddComment} disabled={commentSaving || !newComment.trim()}>
                    {commentSaving ? 'Отправка…' : 'Добавить комментарий'}
                  </button>
                </section>
                <label className="board-quest-modal-field">
                  Опыт (XP)
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={editQuestXpReward}
                    onChange={(e) => setEditQuestXpReward(Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0)))}
                  />
                </label>
                <p className="board-quest-modal-meta">Создан: {questDetail.createdAt ? new Date(questDetail.createdAt).toLocaleString() : ''}</p>
                <div className="board-quest-modal-actions">
                  <button type="button" onClick={handleSaveQuest} disabled={savingQuest || !editQuestTitle.trim()}>{savingQuest ? 'Сохранение…' : 'Сохранить'}</button>
                </div>
              </div>
            ) : (
              <div className="board-quest-modal-body">Загрузка…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
