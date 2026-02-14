import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AssigneeSelect from './AssigneeSelect';
import './QuestCard.css';

export default function KanbanQuestItem({ quest, members, onAssignQuest, onDeleteQuest, onQuestClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId: quest.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleAssigneeChange = (userId) => {
    onAssignQuest?.(quest.id, userId);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`quest-card ${isDragging ? 'quest-card-ghost' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="quest-card-top">
        <span className="quest-card-title">{quest.title}</span>
        {onQuestClick && (
          <button type="button" className="quest-card-info" onClick={(e) => { e.stopPropagation(); onQuestClick(quest.id); }} onPointerDown={(e) => e.stopPropagation()} title="Подробнее">ℹ</button>
        )}
        {onDeleteQuest && (
          <button type="button" className="quest-card-delete" onClick={(e) => { e.stopPropagation(); onDeleteQuest(quest.id); }} onPointerDown={(e) => e.stopPropagation()} title="Удалить квест">✕</button>
        )}
      </div>
      <div className="quest-card-assignee-row" onPointerDown={(e) => e.stopPropagation()}>
        <span className="quest-card-assignee-label">Исполнитель:</span>
        <AssigneeSelect
          value={quest.assigneeId || ''}
          options={members || []}
          onChange={handleAssigneeChange}
          placeholder="— назначить —"
        />
      </div>
      {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
    </div>
  );
}
