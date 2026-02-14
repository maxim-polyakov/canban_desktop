import React, { useState } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import KanbanColumn from './KanbanColumn.jsx';
import { quests } from '../api.js';
import './KanbanBoard.css';

const COLUMN_PREFIX = 'col-';

function SortableColumn({ column, onColumnReorder, children }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: COLUMN_PREFIX + column.id,
    data: { type: 'sortable-column', columnId: column.id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={'kanban-column-sortable' + (isDragging ? ' kanban-column-sortable-dragging' : '')}>
      {onColumnReorder && (
        <div className="kanban-column-grip" {...listeners} title="Перетащите для изменения порядка колонок">
          ⋮⋮
        </div>
      )}
      {children}
    </div>
  );
}

export default function KanbanBoard({ boardId, columns, members, onMoveQuest, onAssignQuest, onAddColumn, onColumnReorder, onRefresh, onUpdateColumn, onUpdateColumnKind, onRefreshColumn, onRefreshColumnQuests, onDeleteColumn, onDeleteQuest, onQuestClick }) {
  const [activeId, setActiveId] = useState(null);
  const [newQuestColumnId, setNewQuestColumnId] = useState(null);
  const [newQuestTitle, setNewQuestTitle] = useState('');
  const [newQuestDescription, setNewQuestDescription] = useState('');
  const [newQuestAssigneeId, setNewQuestAssigneeId] = useState('');
  const [newQuestXpReward, setNewQuestXpReward] = useState(10);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnIsDone, setNewColumnIsDone] = useState(false);

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
    const activeIdStr = String(active.id);
    if (activeIdStr.startsWith(COLUMN_PREFIX) && onColumnReorder) {
      const overIdStr = String(over.id);
      if (overIdStr.startsWith(COLUMN_PREFIX)) {
        const oldIndex = columns.findIndex((c) => COLUMN_PREFIX + c.id === activeIdStr);
        const newIndex = columns.findIndex((c) => COLUMN_PREFIX + c.id === overIdStr);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(columns, oldIndex, newIndex);
          onColumnReorder(reordered.map((c) => c.id));
        }
      }
      return;
    }
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
      const xp = Math.max(0, Math.min(9999, Number(newQuestXpReward) || 0));
      await quests.create({
        title: newQuestTitle.trim(),
        description: newQuestDescription.trim() || null,
        columnId,
        assigneeId: newQuestAssigneeId || null,
        category: 0,
        xpReward: xp,
        isEpic: false,
      });
      setNewQuestTitle('');
      setNewQuestDescription('');
      setNewQuestAssigneeId('');
      setNewQuestXpReward(10);
      setNewQuestColumnId(null);
      if (onRefreshColumnQuests) onRefreshColumnQuests(columnId);
      else onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitNewColumn = () => {
    if (!newColumnTitle.trim() || !onAddColumn) return;
    onAddColumn(newColumnTitle.trim(), newColumnIsDone);
    setNewColumnTitle('');
    setNewColumnIsDone(false);
    setShowAddColumn(false);
  };

  return (
    <div className="kanban-board">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={columns.map((c) => COLUMN_PREFIX + c.id)} strategy={horizontalListSortingStrategy}>
          <div className="kanban-columns">
            {columns.map((col) => (
              <SortableColumn key={col.id} column={col} onColumnReorder={onColumnReorder}>
                <SortableContext items={(col.quests || []).map((q) => q.id)} strategy={verticalListSortingStrategy}>
                  <KanbanColumn
                    column={col}
                    members={members || []}
                    onStartAddQuest={() => setNewQuestColumnId(col.id)}
                    isAdding={newQuestColumnId === col.id}
                    newQuestTitle={newQuestTitle}
                    onNewQuestTitleChange={setNewQuestTitle}
                    newQuestDescription={newQuestDescription}
                    onNewQuestDescriptionChange={setNewQuestDescription}
                    newQuestAssigneeId={newQuestAssigneeId}
                    onNewQuestAssigneeChange={setNewQuestAssigneeId}
                    newQuestXpReward={newQuestXpReward}
                    onNewQuestXpRewardChange={setNewQuestXpReward}
                    onSubmitNewQuest={() => handleAddQuest(col.id)}
                    onCancelAdd={() => { setNewQuestColumnId(null); setNewQuestTitle(''); setNewQuestDescription(''); setNewQuestAssigneeId(''); setNewQuestXpReward(10); }}
                    onAssignQuest={onAssignQuest}
                    onUpdateColumn={onUpdateColumn}
                    onUpdateColumnKind={onUpdateColumnKind}
                    onRefreshColumn={onRefreshColumn}
                    onDeleteColumn={onDeleteColumn}
                    onDeleteQuest={onDeleteQuest}
                    onQuestClick={onQuestClick}
                  />
                </SortableContext>
              </SortableColumn>
            ))}
            {onAddColumn && (
            <div className="kanban-column kanban-column-add">
              {!showAddColumn ? (
                <button type="button" className="kanban-add-column-btn" onClick={() => setShowAddColumn(true)}>
                  + Добавить колонку
                </button>
              ) : (
                <div className="kanban-add-column-form">
                  <input
                    type="text"
                    className="kanban-add-column-input"
                    placeholder="Название колонки"
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    autoFocus
                  />
                  <label className="kanban-add-column-done">
                    <input
                      type="checkbox"
                      checked={newColumnIsDone}
                      onChange={(e) => setNewColumnIsDone(e.target.checked)}
                    />
                    Колонка «Готово» (даёт XP при переносе сюда)
                  </label>
                  <div className="kanban-add-column-actions">
                    <button type="button" className="kanban-add-column-submit" onClick={handleSubmitNewColumn} disabled={!newColumnTitle.trim()}>
                      Создать
                    </button>
                    <button type="button" className="kanban-add-column-cancel" onClick={() => { setShowAddColumn(false); setNewColumnTitle(''); setNewColumnIsDone(false); }}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeQuest ? (
            <div className="quest-card quest-card-dragging">
              <span className="quest-card-title">{activeQuest.title}</span>
              {activeQuest.assigneeName && <span className="quest-card-assignee">{activeQuest.assigneeName}</span>}
              {activeQuest.xpReward > 0 && <span className="quest-card-xp">+{activeQuest.xpReward} XP</span>}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
