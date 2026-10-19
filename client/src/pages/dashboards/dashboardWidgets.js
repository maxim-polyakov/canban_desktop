/** Widget catalog, templates and sample data shared by the dashboard pages. Mirrors DashboardService on the server. */

export const MAX_PER_ROW = 3;

export const PALETTE = ['#1868DB', '#6A9A23', '#E06C00', '#AE4787', '#227D9B', '#964AC0', '#FCA700', '#82B536', '#C97CF4', '#8FB8F6', '#D97008', '#4BCE97'];
export const CATEGORY_COLORS = { new: '#8590A2', indeterminate: '#1868DB', done: '#6A9A23', danger: '#C9372C' };
export const GOAL_COLORS = { pending: '#8590A2', on_track: '#6A9A23', at_risk: '#E06C00', off_track: '#C9372C', paused: '#964AC0', done: '#1868DB', cancelled: '#B3B9C4' };
export const PRIORITY_COLORS = { Highest: '#C9372C', High: '#E06C00', Medium: '#FCA700', Low: '#1868DB', Lowest: '#8FB8F6' };

export const GROUP_OPTIONS = [
  ['status', 'Статус'], ['statusCategory', 'Категория статуса'], ['type', 'Тип задачи'],
  ['assignee', 'Исполнитель'], ['priority', 'Приоритет'], ['space', 'Раздел'],
];
export const SPLIT_OPTIONS = [['none', 'Без разбивки'], ['type', 'Тип задачи'], ['statusCategory', 'Категория статуса'], ['priority', 'Приоритет'], ['assignee', 'Исполнитель']];
export const DEV_KINDS = [['commit', 'Коммиты'], ['pull_request', 'Запросы pull'], ['check_run', 'Сборки'], ['branch', 'Ветки']];
export const CHARTS = { donut: 'Кольцевая диаграмма', bar: 'Столбчатая диаграмма', hbar: 'Горизонтальная диаграмма', line: 'Линейный график', stacked: 'Столбцы с накоплением' };

/** Editable settings per widget type: [key, label, options] with options as [value, label] pairs. */
export const WIDGET_CATALOG = [
  {
    type: 'count_by', group: 'Задачи', title: 'Количество задач', description: 'Распределение задач по статусам, типам, исполнителям или приоритетам.',
    config: { groupBy: 'status', measure: 'count', chart: 'donut' },
    fields: [['groupBy', 'Группировать по', GROUP_OPTIONS], ['measure', 'Показатель', [['count', 'Количество задач'], ['storyPoints', 'Story points']]], ['chart', 'Вид', ['donut', 'bar', 'hbar']]],
  },
  {
    type: 'created_trend', group: 'Задачи', title: 'Тенденция создания задач', description: 'Сколько задач создаётся каждую неделю.',
    config: { split: 'type', chart: 'stacked' },
    fields: [['split', 'Разбивка', SPLIT_OPTIONS], ['chart', 'Вид', ['stacked', 'line']]],
  },
  {
    type: 'created_vs_resolved', group: 'Задачи', title: 'Задачи: созданные и выполненные', description: 'Сравнение созданных и выполненных задач по неделям.',
    config: { chart: 'line' }, fields: [['chart', 'Вид', ['line', 'bar']]],
  },
  {
    type: 'completion_trend', group: 'Задачи', title: 'Тенденция выполнения задач', description: 'Сколько задач выполняется каждую неделю.',
    config: { split: 'none', chart: 'bar' }, fields: [['split', 'Разбивка', SPLIT_OPTIONS], ['chart', 'Вид', ['bar', 'line']]],
  },
  {
    type: 'cycle_time', group: 'Задачи', title: 'Время выполнения (по типам задач)', description: 'Среднее время от создания до выполнения задачи, в днях.',
    config: { chart: 'line' }, fields: [['chart', 'Вид', ['line', 'bar']]],
  },
  {
    type: 'status_priority', group: 'Задачи', title: 'Статусы и приоритеты задач', description: 'Задачи в каждом статусе с разбивкой по приоритетам.',
    config: { chart: 'stacked' }, fields: [],
  },
  {
    type: 'issue_table', group: 'Задачи', title: 'Сведения о задачах', description: 'Таблица задач, подходящих под фильтры дашборда.',
    config: { limit: 10, sort: 'created' },
    fields: [['limit', 'Количество строк', [[5, '5'], [10, '10'], [20, '20'], [50, '50']]], ['sort', 'Сортировка', [['created', 'Сначала новые'], ['priority', 'По приоритету'], ['resolved', 'Недавно выполненные']]]],
  },
  {
    type: 'dev_count_by', group: 'DevOps', title: 'Активность разработки', description: 'Коммиты, запросы pull и сборки из GitHub, связанные с задачами.',
    config: { kind: 'commit', groupBy: 'author', chart: 'donut' },
    fields: [['kind', 'Данные', DEV_KINDS], ['groupBy', 'Группировать по', [['author', 'Автор'], ['status', 'Статус']]], ['chart', 'Вид', ['donut', 'bar', 'hbar']]],
  },
  {
    type: 'dev_trend', group: 'DevOps', title: 'Активность разработки с течением времени', description: 'Динамика коммитов, запросов pull или сборок по неделям.',
    config: { kind: 'commit', chart: 'bar' }, fields: [['kind', 'Данные', DEV_KINDS], ['chart', 'Вид', ['bar', 'line']]],
  },
  {
    type: 'goals_by_status', group: 'Цели', title: 'Цели (по статусам)', description: 'Сколько целей идёт по графику, под угрозой или отстаёт.',
    config: { chart: 'donut' }, fields: [['chart', 'Вид', ['donut', 'bar']]],
  },
  {
    type: 'goals_list', group: 'Цели', title: 'Цели', description: 'Ближайшие цели с их статусом и сроком.',
    config: { limit: 10 }, fields: [['limit', 'Количество строк', [[5, '5'], [10, '10'], [20, '20']]]],
  },
];

export const catalogEntry = (type) => WIDGET_CATALOG.find((w) => w.type === type);

export const TEMPLATES = [
  {
    id: 'blank', name: 'Новый дашборд', description: 'Начните с пустого дашборда и добавьте нужные виджеты.', rows: [],
  },
  {
    id: 'space-team', name: 'Обзор раздела и команды', description: 'Оценивайте прогресс команды в достижении целей и контрольных точек раздела.',
    details: 'Количество задач по статусам, типам и исполнителям, динамика создания и выполнения, story points и время выполнения задач за последние 90 дней.',
    rows: [
      [['count_by', 'Количество задач (по статусам)', { groupBy: 'status', measure: 'count', chart: 'donut' }], ['count_by', 'Количество задач (по типам)', { groupBy: 'type', measure: 'count', chart: 'donut' }], ['count_by', 'Количество задач (по исполнителям)', { groupBy: 'assignee', measure: 'count', chart: 'donut' }]],
      [['created_trend', 'Тенденция создания задач', { split: 'type', chart: 'stacked' }], ['created_vs_resolved', 'Задачи: созданные и выполненные', { chart: 'line' }], ['count_by', 'Story points (по статусам)', { groupBy: 'status', measure: 'storyPoints', chart: 'hbar' }]],
      [['cycle_time', 'Время выполнения (по типам задач)', { chart: 'line' }], ['created_trend', 'Тенденция создания задач (по приоритетам)', { split: 'priority', chart: 'stacked' }], ['issue_table', 'Сведения о задачах', { limit: 10 }]],
    ],
  },
  {
    id: 'devops', name: 'Обзор DevOps', description: 'Отслеживание основных показателей развертывания для повышения производительности.',
    details: 'Коммиты по авторам, сборки по результату и запросы pull по статусам из GitHub, динамика сборок и коммитов, а также сведения о связанных задачах.',
    rows: [
      [['dev_count_by', 'Количество коммитов (по авторам)', { kind: 'commit', groupBy: 'author', chart: 'donut' }], ['dev_count_by', 'Сборки (по результату)', { kind: 'check_run', groupBy: 'status', chart: 'donut' }], ['dev_count_by', 'Запросы pull (по статусам)', { kind: 'pull_request', groupBy: 'status', chart: 'donut' }]],
      [['dev_trend', 'Количество сборок с течением времени', { kind: 'check_run', chart: 'line' }], ['dev_trend', 'Количество коммитов с течением времени', { kind: 'commit', chart: 'bar' }, 2]],
      [['issue_table', 'Сведения о задачах', { limit: 10 }, 3]],
    ],
  },
  {
    id: 'my-work', name: 'Мои задачи', description: 'Отслеживание личных задач, прогресса и приоритетов.',
    details: 'Задачи, назначенные на вас: статусы и приоритеты, динамика выполнения, оценка сложности и ваши запросы pull.',
    rows: [
      [['status_priority', 'Статусы и приоритеты задач', { chart: 'stacked' }], ['completion_trend', 'Тенденция выполнения задач', { chart: 'bar' }], ['count_by', 'Количество задач (по статусам)', { groupBy: 'status', measure: 'count', chart: 'donut' }]],
      [['count_by', 'Оценка сложности (по приоритетам)', { groupBy: 'priority', measure: 'storyPoints', chart: 'donut' }], ['dev_trend', 'Запросы pull с течением времени', { kind: 'pull_request', chart: 'bar' }], ['issue_table', 'Сведения о задачах', { limit: 10 }]],
    ],
  },
];

export const CATEGORIES = [
  { id: 'jira', name: 'Задачи', description: 'Статусы, динамика создания и выполнения задач.', icon: 'backlog' },
  { id: 'devops', name: 'DevOps', description: 'Коммиты, запросы pull и сборки из GitHub.', icon: 'code' },
  { id: 'goals', name: 'Цели', description: 'Статусы и сроки целей команды.', icon: 'goals' },
  { id: 'service', name: 'Service Management', description: 'Запросы по приоритетам и исполнителям.', icon: 'inbox' },
];

export function templateLayout(template) {
  return {
    rows: (template?.rows || []).map((row, r) => ({
      id: `r${r}`,
      widgets: row.map(([type, title, config, size = 1], w) => ({ id: `w${r}-${w}`, type, title, size, config })),
    })),
  };
}

export const newId = (prefix) => `${prefix}-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;

export const rowWidth = (row) => (row.widgets || []).reduce((sum, w) => sum + (w.size || 1), 0);

// ---------- sample data for template previews ----------

function seeded(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const SAMPLE_WEEKS = Array.from({ length: 10 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 0, 5 + i * 7));
  return d.toISOString().slice(0, 10);
});

const SAMPLE_GROUPS = {
  status: [['К выполнению', 'new'], ['В работе', 'indeterminate'], ['На проверке', 'indeterminate'], ['Готово', 'done']],
  statusCategory: [['К выполнению', 'new'], ['В работе', 'indeterminate'], ['Готово', 'done']],
  type: [['История'], ['Задача'], ['Ошибка'], ['Эпик']],
  assignee: [['Анна'], ['Илья'], ['Мария'], ['Не назначено']],
  priority: [['Высокий', null, 'High'], ['Средний', null, 'Medium'], ['Низкий', null, 'Low']],
  space: [['My Software Team'], ['Маркетинг']],
  author: [['anna-dev'], ['ilya'], ['maria-ops']],
  devStatus: [['success', 'done'], ['failure', 'danger'], ['in_progress']],
  prStatus: [['merged', 'done'], ['open'], ['closed', 'danger']],
  goals: [['По графику', 'on_track'], ['Под угрозой', 'at_risk'], ['Отстает', 'off_track']],
};

export function sampleData(widget) {
  const rnd = seeded(`${widget.type}:${widget.title}`);
  const int = (min, max) => Math.round(min + rnd() * (max - min));
  const config = widget.config || {};
  const categorical = (groups) => {
    const items = groups.map(([label, category, key]) => ({ key: key || label, label, category, value: int(2, 18) }));
    return { kind: 'categorical', items, total: items.reduce((s, i) => s + i.value, 0) };
  };
  const series = (groups, avg) => ({
    kind: 'series', axis: 'week', x: SAMPLE_WEEKS, total: 1,
    series: groups.map(([label, category, key]) => ({ key: key || label, label, category, values: SAMPLE_WEEKS.map(() => (avg ? int(1, 12) : int(0, 9))) })),
  });
  switch (widget.type) {
    case 'count_by': return categorical(SAMPLE_GROUPS[config.groupBy] || SAMPLE_GROUPS.status);
    case 'created_trend': return series(config.split === 'none' ? [['Задачи']] : SAMPLE_GROUPS[config.split] || SAMPLE_GROUPS.type);
    case 'completion_trend': return series(!config.split || config.split === 'none' ? [['Выполнено', 'done']] : SAMPLE_GROUPS[config.split] || SAMPLE_GROUPS.type);
    case 'created_vs_resolved': return series([['Создано'], ['Выполнено', 'done']]);
    case 'cycle_time': return series(SAMPLE_GROUPS.type.slice(0, 3), true);
    case 'status_priority': {
      const statuses = SAMPLE_GROUPS.status;
      return {
        kind: 'series', axis: 'category', x: statuses.map((s) => s[0]), categories: statuses.map((s) => s[1]), total: 1,
        series: SAMPLE_GROUPS.priority.map(([label, , key]) => ({ key, label, values: statuses.map(() => int(0, 6)) })),
      };
    }
    case 'dev_count_by':
      if (config.groupBy === 'status') return categorical(config.kind === 'pull_request' ? SAMPLE_GROUPS.prStatus : SAMPLE_GROUPS.devStatus);
      return categorical(SAMPLE_GROUPS.author);
    case 'dev_trend': return series([[DEV_KINDS.find((k) => k[0] === config.kind)?.[1] || 'Коммиты']]);
    case 'goals_by_status': return categorical(SAMPLE_GROUPS.goals);
    case 'goals_list':
      return {
        kind: 'goals', total: 3,
        rows: SAMPLE_GROUPS.goals.map(([statusLabel, status], i) => ({ id: `g${i}`, name: ['Запуск мобильного приложения', 'Снизить время ответа', 'Перейти на новый CI'][i], status, statusLabel, targetDate: `2026-0${i + 4}-30` })),
      };
    case 'issue_table':
      return {
        kind: 'table', total: 5,
        rows: ['Настроить вход через SSO', 'Ошибка при экспорте отчёта', 'Новый экран онбординга', 'Обновить зависимости', 'Сократить время сборки']
          .slice(0, Math.min(5, config.limit || 5))
          .map((title, i) => ({ id: `s${i}`, key: `KAN-${12 + i}`, title, type: [1, 3, 1, 2, 2][i], priority: [3, 4, 2, 1, 2][i], status: ['В работе', 'К выполнению', 'Готово', 'В работе', 'К выполнению'][i], statusCategory: ['indeterminate', 'new', 'done', 'indeterminate', 'new'][i], assigneeName: ['Анна', 'Илья', null, 'Мария', 'Анна'][i] })),
      };
    default: return { kind: 'categorical', items: [], total: 0 };
  }
}
