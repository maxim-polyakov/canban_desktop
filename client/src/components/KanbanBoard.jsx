import React, { useState } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanColumn from './KanbanColumn.jsx';
import { quests } from '../api.js';
import './KanbanBoard.css';

export default function KanbanBoard({ columns, members, onMoveQuest, onAssignQuest, onRefresh }) {
  const [activeId, setActiveId] = useState(null);
  const [newQuestColumnId, setNewQuestColumnId] = useState(null);
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestAssigneeId, setNewQuestAssigneeId] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeQuest = activeId
    ? columns.flatMap((c) => c.quests || []).find((q) => q.id === activeId)
    : null;

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const overData = over.data?.current;
    if (overData?.columnId && overData?.type === 'column') {
      const col = columns.find((c) => c.id === overData.columnId);
      const newOrder = col?.quests?.length ?? 0;
      onMoveQuest(active.id, overData.columnId, newOrder);
    }
    if (overData?.type === 'quest' && overData.columnId) {
      const targetCol = columns.find((c) => c.id === overData.columnId);
      const idx = targetCol?.quests?.findIndex((q) => q.id === over.id) ?? 0;
      const newOrder = idx >= 0 ? idx : targetCol?.quests?.length ?? 0;
      onMoveQuest(active.id, overData.columnId, newOrder);
    }
  };

  const handleAddQuest = async (columnId) => {
    if (!newQuestTitle.trim()) return;
    try {
      await quests.create({
        title: newQuestTitle.trim(),
        columnId,
        assigneeId: newQuestAssigneeId || null,
        category: 0,
        xpReward: 10,
        isEpic: false,
      });
      setNewQuestTitle('');
      setNewQuestAssigneeId('');
      setNewQuestColumnId(null);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="kanban-board">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="kanban-columns">
          {columns.map((col) => (
            <SortableContext key={col.id} items={(col.quests || []).map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <KanbanColumn
                column={col}
                members={members || []}
                onStartAddQuest={() => setNewQuestColumnId(col.id)}
                isAdding={newQuestColumnId === col.id}
                newQuestTitle={newQuestTitle}
                onNewQuestTitleChange={setNewQuestTitle}
                newQuestAssigneeId={newQuestAssigneeId}
                onNewQuestAssigneeChange={setNewQuestAssigneeId}
                onSubmitNewQuest={() => handleAddQuest(col.id)}
                onCancelAdd={() => { setNewQuestColumnId(null); setNewQuestTitle(''); setNewQuestAssigneeId(''); }}
                onAssignQuest={onAssignQuest}
              />
            </SortableContext>
          ))}
        </div>

        <DragOverlay>
          {activeQuest ? (
            <div className="quest-card quest-card-dragging">
              <span className="quest-card-title">{activeQuest.title}</span>
              {activeQuest.assigneeName && <span className="quest-card-assignee">Исполнитель: {activeQuest.assigneeName}</span>}
              {activeQuest.xpReward > 0 && <span className="quest-card-xp">+{activeQuest.xpReward} XP</span>}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
