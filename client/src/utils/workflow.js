import { typeToken } from './issueLayout.js';

/** Status categories (column kinds); 5 is the space's archive and is not a workflow status. */
export const STATUS_KINDS = [
  { value: 0, label: 'К выполнению', category: 'todo' },
  { value: 1, label: 'В работе', category: 'progress' },
  { value: 2, label: 'На проверке', category: 'progress' },
  { value: 3, label: 'Готово', category: 'done' },
  { value: 4, label: 'Другое', category: 'todo' },
  { value: 5, label: 'Архив', category: 'done' },
];

/** Fields a transition screen can change; other screen fields are shown on the issue only. */
export const TRANSITION_SCREEN_FIELDS = ['summary', 'description', 'assignee', 'priority', 'duedate', 'startdate', 'labels', 'storypoints', 'originalestimate'];

/** The space's workflow for an issue, or null when the space keeps its own transitions. */
export function issueWorkflow(workflow, issue) {
  if (!workflow?.types || !issue) return null;
  const token = typeToken(issue.issueType, issue.issueTypeId);
  return workflow.types[token] ?? workflow.types.default ?? null;
}

/** Transitions from the issue's current status to the target column. */
export function transitionsTo(workflow, issue, targetColumnId) {
  const own = issueWorkflow(workflow, issue);
  if (!own) return null;
  return own.transitions.filter((t) => t.to === targetColumnId && (t.any || t.from.includes(issue.columnId)));
}

/** Columns the issue can move to under its workflow; null when any move is allowed. */
export function reachableColumns(workflow, issue) {
  const own = issueWorkflow(workflow, issue);
  if (!own) return null;
  const targets = new Set(own.transitions.filter((t) => t.any || t.from.includes(issue.columnId)).map((t) => t.to));
  if (!own.statuses.includes(issue.columnId) && own.initial) targets.add(own.initial);
  targets.delete(issue.columnId);
  return targets;
}

/** Whether the move needs a dialog: a transition screen or a choice between transitions. */
export function needsTransitionDialog(transitions) {
  return !!transitions && (transitions.length > 1 || transitions.some((t) => t.screen?.some((tab) => tab.fields.length > 0)));
}

export function newKey(prefix, existing) {
  let n = existing.length + 1;
  const used = new Set(existing);
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}
