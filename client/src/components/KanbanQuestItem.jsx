import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import { IssueTypeIcon, PriorityIcon, WatcherBadge } from './IssueIcons.jsx';
import './QuestCard.css';

function labelList(labels) {
  if (!labels) return [];
  return String(labels).split(',').map((label) => label.trim()).filter(Boolean);
}

export default function KanbanQuestItem({ quest, onDeleteQuest, onQuestClick, hidden = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId: quest.columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const openDetail = (e) => {
    e?.stopPropagation();
    onQuestClick?.(quest.id);
  };

  const assignees = quest.assignees ?? [];
  const labels = labelList(quest.labels);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`quest-card ${isDragging ? 'quest-card-ghost' : ''} ${hidden ? 'quest-card-filtered-out' : ''}`}
      {...attributes}
      {...listeners}
      onClick={openDetail}
    >
      <div className="quest-card-top">
        <IssueTypeIcon issueType={quest.issueType} size={16} />
        <span className="quest-card-title" title={quest.title}>{quest.title}</span>
        {onDeleteQuest && (
          <button
            type="button"
            className="quest-card-delete"
            onClick={(e) => { e.stopPropagation(); onDeleteQuest(quest.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Удалить квест"
          >
            ✕
          </button>
        )}
      </div>

      {labels.length > 0 && (
        <div className="quest-card-labels">
          {labels.slice(0, 4).map((label) => (
            <span key={label} className="quest-card-label-chip">{label}</span>
          ))}
        </div>
      )}

      <div className="quest-card-bottom">
        <span className="quest-card-key">{quest.issueKey || '—'}</span>
        <span className="quest-card-bottom-spacer" />
        {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
        <WatcherBadge count={(quest.notificationRecipientIds ?? []).length} />
        <PriorityIcon priority={quest.priority} size={14} />
        <span
          className="quest-card-assignees"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {assignees.length === 0 ? (
            <span className="quest-card-unassigned" title="Не назначено">—</span>
          ) : (
            assignees.slice(0, 3).map((assignee) => (
              <AssigneeAvatar
                key={assignee.userId}
                userId={assignee.userId}
                displayName={assignee.displayName}
                avatarUrl={assignee.avatarUrl}
                size={22}
              />
            ))
          )}
        </span>
      </div>
    </div>
  );
}
