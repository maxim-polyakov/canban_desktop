import React, { useEffect, useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon, PriorityIcon } from './IssueIcons.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import './IssueActionsMenu.css';

export const PRIORITIES = [
  [4, 'Высший'],
  [3, 'Высокий'],
  [2, 'Средний'],
  [1, 'Низкий'],
  [0, 'Низший'],
];
export const STORY_POINTS = [1, 2, 3, 5, 8, 13, 21];

export const issueLink = (boardId, questId, origin = window.location.origin) => `${origin}/board/${boardId}/issue/${questId}`;

const ISSUE_TYPE_NAMES = ['Эпик', 'История', 'Задача', 'Баг', 'Подзадача'];
export const issueTypeName = (quest) => quest.issueTypeName || ISSUE_TYPE_NAMES[quest.issueType] || 'Задача';

const Chevron = () => (
  <svg className="iam-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Check = ({ on }) => <span className="iam-check" aria-hidden="true">{on ? '✓' : ''}</span>;

/**
 * Jira's issue "⋯" menu from the backlog: move, copy link/key, flag, assignee, priority,
 * parent, story points, split and delete. Submenus fly out on hover and open on click.
 */
export default function IssueActionsMenu({ quest, boardId, sprints = [], members = [], loadEpics, onMove, onUpdate, onSplit, onDelete, onNotify }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(null);
  const [epics, setEpics] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => {
    if (sub !== 'parent' || epics !== null || !loadEpics) return;
    loadEpics().then((list) => setEpics(Array.isArray(list) ? list : [])).catch(() => setEpics([]));
  }, [sub, epics, loadEpics]);

  const toggle = () => { setOpen((v) => !v); setSub(null); };
  const run = async (action) => {
    setOpen(false);
    setSub(null);
    try { await action(); } catch (e) { onNotify?.(t(e?.message || 'Не удалось сохранить задачу.')); }
  };
  const copy = (text, message) => run(async () => {
    await navigator.clipboard.writeText(text);
    onNotify?.(t(message));
  });

  const assigneeIds = (quest.assigneeIds ?? (quest.assignees ?? []).map((a) => a.userId)).map(String);
  const parentId = quest.parentQuestId ?? quest.parentEpicId ?? null;
  const moveTargets = [
    ...sprints.filter((s) => s.id !== quest.sprintId).map((s) => ({ key: s.id, label: s.name, run: () => onMove(s.id) })),
    ...(quest.sprintId ? [{ key: 'backlog', label: t('Бэклог'), run: () => onMove(null) }] : []),
  ];
  const isEpic = quest.issueType === 0 || quest.isEpic;

  const submenus = {
    move: moveTargets.map((item) => (
      <button key={item.key} type="button" role="menuitem" onClick={() => run(item.run)}>{item.label}</button>
    )),
    assignee: [
      <button key="none" type="button" role="menuitemradio" aria-checked={assigneeIds.length === 0} onClick={() => run(() => onUpdate({ assigneeIds: [], assigneeIdsSet: true }))}>
        <Check on={assigneeIds.length === 0} /><span className="iam-avatar-none" aria-hidden="true" />{t('Не назначено')}
      </button>,
      ...members.filter((m) => m.userId).map((m) => {
        const on = assigneeIds.length === 1 && assigneeIds[0] === String(m.userId);
        return (
          <button key={m.userId} type="button" role="menuitemradio" aria-checked={on} onClick={() => run(() => onUpdate({ assigneeIds: [m.userId], assigneeIdsSet: true }))}>
            <Check on={on} /><AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={20} />{m.displayName}
          </button>
        );
      }),
    ],
    priority: PRIORITIES.map(([value, label]) => (
      <button key={value} type="button" role="menuitemradio" aria-checked={quest.priority === value} onClick={() => run(() => onUpdate({ priority: value }))}>
        <Check on={quest.priority === value} /><PriorityIcon priority={value} size={14} />{t(label)}
      </button>
    )),
    parent: epics === null ? [<span key="loading" className="iam-muted">{t('Загрузка...')}</span>] : [
      ...(parentId ? [<button key="none" type="button" role="menuitem" onClick={() => run(() => onUpdate({ parentQuestId: null, parentQuestIdSet: true }))}>{t('Убрать родителя')}</button>] : []),
      ...epics.filter((e) => e.id !== quest.id).map((e) => (
        <button key={e.id} type="button" role="menuitemradio" aria-checked={parentId === e.id} onClick={() => run(() => onUpdate({ parentQuestId: e.id, parentQuestIdSet: true }))}>
          <Check on={parentId === e.id} /><IssueTypeIcon issueType={0} size={14} /><span className="iam-key">{e.issueKey}</span><span className="iam-ellipsis">{e.title}</span>
        </button>
      )),
      ...(epics.length === 0 ? [<span key="empty" className="iam-muted">{t('В этом пространстве нет эпиков.')}</span>] : []),
    ],
    estimate: [
      <button key="none" type="button" role="menuitemradio" aria-checked={quest.storyPoints == null} onClick={() => run(() => onUpdate({ storyPoints: null, storyPointsSet: true }))}>
        <Check on={quest.storyPoints == null} />{t('Без оценки')}
      </button>,
      ...STORY_POINTS.map((value) => (
        <button key={value} type="button" role="menuitemradio" aria-checked={quest.storyPoints === value} onClick={() => run(() => onUpdate({ storyPoints: value, storyPointsSet: true }))}>
          <Check on={quest.storyPoints === value} />{value}
        </button>
      )),
    ],
  };

  const parentItem = (key, label, disabled = false) => (
    <div key={key} className={`iam-parent ${sub === key ? 'is-open' : ''}`} onMouseEnter={() => !disabled && setSub(key)}>
      <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub === key} disabled={disabled} onClick={() => setSub(sub === key ? null : key)}>
        <span className="iam-label">{label}</span><Chevron />
      </button>
      {sub === key && <div className="iam-menu iam-submenu" role="menu" aria-label={label}>{submenus[key]}</div>}
    </div>
  );
  const plain = (key, label, action, className = '') => (
    <button key={key} type="button" role="menuitem" className={className} onMouseEnter={() => setSub(null)} onClick={() => run(action)}>{label}</button>
  );

  return (
    <span className="iam-root" ref={rootRef} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className={`iam-trigger ${open ? 'is-open' : ''}`} aria-label={t('Действия с задачей ${key}', { key: quest.issueKey })} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>⋯</button>
      {open && (
        <div className="iam-menu" role="menu" aria-label={t('Действия с задачей ${key}', { key: quest.issueKey })}>
          {parentItem('move', t('Переместить задачу'), moveTargets.length === 0)}
          <div className="iam-sep" role="separator" />
          {plain('link', t('Копировать ссылку'), () => copy(issueLink(boardId, quest.id), 'Ссылка скопирована'))}
          {plain('key', t('Копировать ключ'), () => copy(quest.issueKey, 'Ключ скопирован'))}
          <div className="iam-sep" role="separator" />
          {plain('flag', quest.flagged ? t('Убрать флажок') : t('Добавить флажок'), () => onUpdate({ flagged: !quest.flagged }))}
          {parentItem('assignee', t('Исполнитель'))}
          {parentItem('priority', t('Приоритет'))}
          {!isEpic && parentItem('parent', t('Родительский элемент'))}
          {parentItem('estimate', t('Примерная оценка сложности'))}
          {onSplit && plain('split', t('Разделить задачу типа «${type}»', { type: t(issueTypeName(quest)) }), onSplit)}
          <div className="iam-sep" role="separator" />
          {plain('delete', t('Удалить'), onDelete)}
        </div>
      )}
    </span>
  );
}
