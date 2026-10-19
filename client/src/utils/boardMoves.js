export function moveQuestInColumns(columns, questId, targetColumnId, newOrder) {
  if (!Array.isArray(columns)) return columns;
  const source = columns.find((c) => (c.quests ?? []).some((q) => q.id === questId));
  const target = columns.find((c) => c.id === targetColumnId);
  if (!source || !target) return columns;
  const quest = source.quests.find((q) => q.id === questId);
  return columns.map((column) => {
    if (column.id !== source.id && column.id !== target.id) return column;
    const remaining = (column.quests ?? []).filter((q) => q.id !== questId);
    if (column.id !== target.id) return { ...column, quests: remaining };
    const index = Math.max(0, Math.min(newOrder ?? remaining.length, remaining.length));
    remaining.splice(index, 0, { ...quest, columnId: targetColumnId });
    return { ...column, quests: remaining };
  });
}
