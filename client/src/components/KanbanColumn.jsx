import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanQuestItem from './KanbanQuestItem.jsx';
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
  newQuestAssigneeId,
  onNewQuestAssigneeChange,
  onSubmitNewQuest,
  onCancelAdd,
  onAssignQuest,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column', columnId: column.id } });
  const title = column.title || COLUMN_NAMES[column.kind] || 'Колонка';

  return (
    <div
      ref={setNodeRef}
      className={'kanban-column' + (isOver ? ' kanban-column-over' : '')}
    >
      <h3 className="kanban-column-title">{title}</h3>
      <div className="kanban-column-cards">
        {(column.quests || []).map((quest) => (
          <KanbanQuestItem
            key={quest.id}
            quest={quest}
            members={members || []}
            onAssignQuest={onAssignQuest}
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
            onKeyDown={(e) => e.key === 'Enter' && onSubmitNewQuest()}
            autoFocus
          />
          <label className="kanban-add-assignee">
            Исполнитель
            <select
              value={newQuestAssigneeId}
              onChange={(e) => onNewQuestAssigneeChange(e.target.value)}
            >
              <option value="">— не назначен —</option>
              {(members || []).map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName}</option>
              ))}
            </select>
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
