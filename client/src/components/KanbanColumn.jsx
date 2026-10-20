import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import KanbanQuestItem from './KanbanQuestItem.jsx';
import QuickCreateIssue from './QuickCreateIssue.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
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
  issueTypes = [],
  onCreateQuest,
  onCancelAdd,
  onUpdateColumn,
  onUpdateColumnKind,
  onRefreshColumn,
  onDeleteColumn,
  onDeleteQuest,
  onQuestClick,
  questFilter,
  selectedQuestIds = [],
  onSelectQuest,
}) {
  const { t } = useLocalization();
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
          <h3 className="kanban-column-title" title={title} onClick={onUpdateColumn ? startEditTitle : undefined}>
            <span className="kanban-column-title-text">{title}</span>
            <span className="kanban-column-count">{questsList.length}</span>
          </h3>
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
            columnId={column.id}
            onDeleteQuest={onDeleteQuest}
            onQuestClick={onQuestClick}
            hidden={questFilter ? !questFilter(quest) : false}
            selected={selectedQuestIds.includes(quest.id)}
            onSelect={onSelectQuest}
          />
        ))}
      </div>
      {isAdding ? (
        <QuickCreateIssue members={members} issueTypes={issueTypes} onCreate={onCreateQuest} onCancel={onCancelAdd} />
      ) : (
        <button type="button" className="kanban-add-btn" onClick={onStartAddQuest}>+ {t('Создать')}</button>
      )}
    </div>
  );
}
