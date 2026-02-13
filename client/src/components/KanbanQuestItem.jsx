import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './QuestCard.css';

export default function KanbanQuestItem({ quest, members, onAssignQuest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId: quest.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleAssigneeChange = (e) => {
    e.stopPropagation();
    const value = e.target.value;
    onAssignQuest?.(quest.id, value || null);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`quest-card ${isDragging ? 'quest-card-ghost' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className="quest-card-title">{quest.title}</span>
      <div className="quest-card-assignee-row" onPointerDown={(e) => e.stopPropagation()}>
        <span className="quest-card-assignee-label">Исполнитель:</span>
        <select
          className="quest-card-assignee-select"
          value={quest.assigneeId || ''}
          onChange={handleAssigneeChange}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <option value="">— назначить —</option>
          {(members || []).map((m) => (
            <option key={m.userId} value={m.userId}>{m.displayName}</option>
          ))}
        </select>
      </div>
      {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
    </div>
  );
}
