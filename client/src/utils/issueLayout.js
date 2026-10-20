/** Built-in fields that screens and field configurations arrange; custom fields are `cf:{id}`. */
export const SYSTEM_FIELDS = [
  ['summary', 'Сводка'],
  ['description', 'Описание'],
  ['assignee', 'Исполнитель'],
  ['priority', 'Приоритет'],
  ['duedate', 'Срок'],
  ['startdate', 'Дата начала'],
  ['labels', 'Метки'],
  ['components', 'Компоненты'],
  ['fixversions', 'Исправить в версиях'],
  ['storypoints', 'Story points'],
  ['originalestimate', 'Первоначальная оценка'],
  ['sprint', 'Спринт'],
];

/** Fields the create dialog shows when the space has no screens. */
export const DEFAULT_CREATE_FIELDS = ['summary', 'description', 'priority', 'assignee'];

export const fieldKey = (id) => `cf:${id}`;

export function typeToken(issueType, issueTypeId) {
  return issueTypeId || String(issueType ?? 2);
}

export function fieldRule(layout, token, key) {
  const configs = layout?.fieldConfigs || {};
  const items = configs[token] ?? configs.default;
  return items?.[key] ?? { required: false, hidden: false, description: null };
}

/** Tabs of the screen for an operation, or null when the space has no screens. */
export function screenTabs(layout, token, operation) {
  const screens = layout?.screens || {};
  const own = screens[token] ?? screens.default;
  return own ? own[operation] ?? [] : null;
}

export function onScreen(layout, token, operation, key) {
  const tabs = screenTabs(layout, token, operation);
  return !tabs || tabs.some((tab) => tab.fields.includes(key));
}

/**
 * Custom fields grouped by the tabs of a screen, in screen order; hidden fields are dropped.
 * Without screens every field goes into a single unnamed group.
 */
export function arrangeFields(layout, token, operation, fields) {
  const visible = fields.filter((field) => !fieldRule(layout, token, fieldKey(field.id)).hidden);
  const tabs = screenTabs(layout, token, operation);
  if (!tabs) return [{ name: null, fields: visible }];
  return tabs
    .map((tab) => ({
      name: tabs.length > 1 ? tab.name : null,
      fields: tab.fields.map((key) => visible.find((field) => fieldKey(field.id) === key)).filter(Boolean),
      keys: tab.fields,
    }))
    .filter((group) => group.fields.length > 0 || group.keys.some((key) => !key.startsWith('cf:')));
}
