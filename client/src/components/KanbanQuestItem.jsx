import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AssigneeSelect from './AssigneeSelect';
import './QuestCard.css';

export default function KanbanQuestItem({ quest, members, onAssignQuest, onDeleteQuest, onQuestClick }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId: quest.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleAssigneeChange = (assigneeIds) => {
    onAssignQuest?.(quest.id, assigneeIds);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`quest-card ${isDragging ? 'quest-card-ghost' : ''}`}
    >
      <div className="quest-card-top">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="quest-card-drag-handle"
          title="Перетащить квест"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <span className="quest-card-title">{quest.title}</span>
        {onQuestClick && (
          <button type="button" className="quest-card-info" onClick={(e) => { e.stopPropagation(); onQuestClick(quest.id); }} onPointerDown={(e) => e.stopPropagation()} title="Подробнее">ℹ</button>
        )}
        {onDeleteQuest && (
          <button type="button" className="quest-card-delete" onClick={(e) => { e.stopPropagation(); onDeleteQuest(quest.id); }} onPointerDown={(e) => e.stopPropagation()} title="Удалить квест">✕</button>
        )}
      </div>
      <div className="quest-card-assignee-row" onPointerDown={(e) => e.stopPropagation()}>
        <span className="quest-card-assignee-label">Исполнители:</span>
        <AssigneeSelect
          value={quest.assigneeIds || []}
          options={members || []}
          onChange={handleAssigneeChange}
          placeholder="— назначить исполнителей —"
        />
      </div>
      {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
    </div>
  );
}
