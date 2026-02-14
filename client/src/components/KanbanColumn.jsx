import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanQuestItem from './KanbanQuestItem.jsx';
import AssigneeSelect from './AssigneeSelect.jsx';
import './KanbanColumn.css';

const COLUMN_NAMES = {
  0: 'Бэклог',
  1: 'В работе',
  2: 'Ревью',
  3: 'Готово',
  4: 'Другое',
};

export default function KanbanColumn({
  column,
  members,
  onStartAddQuest,
  isAdding,
  newQuestTitle,
  onNewQuestTitleChange,
  newQuestDescription,
  onNewQuestDescriptionChange,
  newQuestAssigneeId,
  onNewQuestAssigneeChange,
  newQuestXpReward = 10,
  onNewQuestXpRewardChange,
  onSubmitNewQuest,
  onCancelAdd,
  onAssignQuest,
  onUpdateColumn,
  onUpdateColumnKind,
  onRefreshColumn,
  onDeleteColumn,
  onDeleteQuest,
  onQuestClick,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } });
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const title = column.title || COLUMN_NAMES[column.kind] || 'Колонка';
  const questsList = column.quests ?? column.Quests ?? [];
  const isEmpty = !questsList.length;

  const startEditTitle = () => {
    setEditTitle(title);
    setEditingTitle(true);
  };
  const submitEditTitle = (e) => {
    e?.preventDefault();
    if (onUpdateColumn && editTitle.trim()) {
      onUpdateColumn(column.id, editTitle.trim());
      setEditingTitle(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={'kanban-column' + (isOver ? ' kanban-column-over' : '') + (isEmpty ? ' kanban-column-empty' : '')}
    >
      <div className="kanban-column-header">
        {editingTitle ? (
          <form className="kanban-column-title-edit" onSubmit={submitEditTitle}>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onBlur={submitEditTitle} autoFocus />
          </form>
        ) : (
          <h3 className="kanban-column-title" title="Нажмите для изменения" onClick={onUpdateColumn ? startEditTitle : undefined}>{title}</h3>
        )}
        {onUpdateColumn && !editingTitle && (
          <button type="button" className="kanban-column-btn kanban-column-edit" onClick={startEditTitle} title="Изменить название">✎</button>
        )}
        {onRefreshColumn && (
          <button type="button" className="kanban-column-btn kanban-column-refresh" onClick={() => onRefreshColumn(column.id)} title="Обновить колонку">↻</button>
        )}
        {onDeleteColumn && (
          <button type="button" className="kanban-column-btn kanban-column-delete" onClick={() => onDeleteColumn(column.id)} title="Удалить колонку">✕</button>
        )}
      </div>
      {onUpdateColumnKind && (
        <label className="kanban-column-done-toggle">
          <input
            type="checkbox"
            checked={column.kind === 3}
            onChange={(e) => onUpdateColumnKind(column.id, e.target.checked ? 3 : 4)}
          />
          Колонка «Готово» (даёт XP при переносе сюда)
        </label>
      )}
      <div className="kanban-column-cards">
        {(column.quests || []).map((quest) => (
          <KanbanQuestItem
            key={quest.id}
            quest={quest}
            members={members || []}
            onAssignQuest={onAssignQuest}
            onDeleteQuest={onDeleteQuest}
            onQuestClick={onQuestClick}
          />
        ))}
      </div>
      {isAdding ? (
        <div className="kanban-add-form">
          <input
            type="text"
            placeholder="Название квеста"
            value={newQuestTitle}
            onChange={(e) => onNewQuestTitleChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmitNewQuest()}
            autoFocus
          />
          <label className="kanban-add-description">
            Описание
            <textarea
              placeholder="Описание квеста (необязательно)"
              value={newQuestDescription ?? ''}
              onChange={(e) => onNewQuestDescriptionChange(e.target.value)}
              rows={2}
            />
          </label>
          <label className="kanban-add-assignee">
            Исполнитель
            <AssigneeSelect
              value={newQuestAssigneeId || ''}
              options={members || []}
              onChange={(v) => onNewQuestAssigneeChange(v != null ? v : '')}
              placeholder="— не назначен —"
            />
          </label>
          <label className="kanban-add-xp">
            Опыт (XP)
            <input
              type="number"
              min={0}
              max={9999}
              value={newQuestXpReward}
              onChange={(e) => onNewQuestXpRewardChange?.(e.target.value === '' ? 10 : Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0)))}
            />
          </label>
          <div className="kanban-add-actions">
            <button type="button" onClick={onSubmitNewQuest}>Добавить</button>
            <button type="button" onClick={onCancelAdd}>Отмена</button>
          </div>
        </div>
      ) : (
        <button type="button" className="kanban-add-btn" onClick={onStartAddQuest}>+ Квест</button>
      )}
    </div>
  );
}
