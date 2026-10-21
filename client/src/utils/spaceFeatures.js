import { useEffect, useState } from 'react';
import { boards as boardsApi } from '../api.js';

// [feature, tab key, route suffix, icon, label]
export const FEATURE_TABS = [
  ['summary', 'summary', '/summary', 'summary', 'Сводка'],
  ['backlog', 'backlog', '/backlog', 'backlog', 'Бэклог'],
  ['board', 'board', '', 'board', 'Доска'],
  ['list', 'list', '/list', 'list', 'Список'],
  ['timeline', 'roadmap', '/roadmap', 'timeline', 'Хронология'],
  ['calendar', 'calendar', '/calendar', 'calendar', 'Календарь'],
  ['docs', 'docs', '/docs', 'docs', 'Документы'],
  ['forms', 'forms', '/forms', 'forms', 'Формы'],
  ['development', 'development', '/development', 'code', 'Среда разработки'],
  ['reports', 'reports', '/reports', 'reports', 'Отчёты'],
  ['releases', 'releases', '/releases', 'releases', 'Релизы'],
];

export const FEATURE_DESCRIPTIONS = {
  summary: 'Обзор статусов, приоритетов, типов работ и недавней активности',
  list: 'Все задачи раздела в виде таблицы с сортировкой и фильтром',
  board: 'Канбан-доска с колонками workflow',
  backlog: 'Бэклог и планирование спринтов',
  timeline: 'Эпики и задачи на временной шкале',
  calendar: 'Задачи по срокам на календаре месяца',
  docs: 'Страницы с заметками, требованиями и инструкциями раздела',
  forms: 'Формы для заявок: каждый ответ становится задачей',
  development: 'Метрики разработки, репозитории, ветки и pull request',
  reports: 'Диаграммы и отчёты по работе команды',
  releases: 'Версии и релизы',
};

export const BOARD_CHANGED_EVENT = 'canban:board-changed';
export const notifyBoardChanged = (board) => window.dispatchEvent(new CustomEvent(BOARD_CHANGED_EVENT, { detail: { board } }));

const LEGACY = ['summary', 'board', 'backlog', 'timeline', 'docs', 'forms', 'development', 'releases', 'reports'];

export function spaceFeatures(board) {
  const raw = board?.features ?? board?.Features ?? '';
  const list = String(raw).split(',').map((x) => x.trim()).filter(Boolean);
  return list.length ? list : LEGACY;
}

export function spaceTabs(board) {
  const enabled = new Set(spaceFeatures(board));
  return FEATURE_TABS.filter(([feature]) => enabled.has(feature));
}

export const ALL_TAB_KEYS = FEATURE_TABS.map((x) => x[1]);

export function firstSpacePath(boardId, features) {
  const tab = FEATURE_TABS.find(([feature]) => features.includes(feature)) || FEATURE_TABS[2];
  return `/board/${boardId}${tab[2]}`;
}

export const ACCESS_LEVELS = [
  ['open', 'Открытый', 'Любой пользователь Канбана может просматривать раздел и работать с задачами'],
  ['limited', 'Ограниченный', 'Любой пользователь может просматривать раздел и задачи; работать могут только участники команды'],
  ['private', 'Частный', 'Раздел видят и используют только участники команды'],
];

export const MANAGEMENT_TYPES = [
  ['team', 'Управляется командой', 'Простая настройка, которой управляет сама команда: свой workflow, поля и типы работ для этого раздела. Изменения не влияют на другие разделы.'],
  ['company', 'Управляется компанией', 'Стандартизованная настройка, которой управляют администраторы: общие схемы, workflow и поля могут использоваться в нескольких разделах.'],
];

let templatesPromise = null;

export function loadSpaceTemplates() {
  if (!templatesPromise) {
    templatesPromise = boardsApi.getTemplates().catch((error) => {
      templatesPromise = null;
      throw error;
    });
  }
  return templatesPromise;
}

export function useSpaceTemplates() {
  const [state, setState] = useState({ categories: [], templates: [], loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    loadSpaceTemplates()
      .then((data) => { if (alive) setState({ categories: data?.categories || [], templates: data?.templates || [], loading: false, error: '' }); })
      .catch((e) => { if (alive) setState({ categories: [], templates: [], loading: false, error: e.message || 'error' }); });
    return () => { alive = false; };
  }, []);
  return state;
}

const ONBOARDING_KEY = (boardId) => `canban.onboarding.${boardId}`;
export const ONBOARDING_EVENT = 'canban:onboarding-changed';

export function readOnboarding(boardId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(ONBOARDING_KEY(boardId)) || 'null');
    return value && typeof value === 'object' ? { done: [], dismissed: false, ...value } : null;
  } catch {
    return null;
  }
}

export function writeOnboarding(boardId, value) {
  window.localStorage.setItem(ONBOARDING_KEY(boardId), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(ONBOARDING_EVENT, { detail: { boardId } }));
}

export function startOnboarding(boardId, template) {
  writeOnboarding(boardId, { template, done: [], dismissed: false, open: true });
}

export function markOnboardingStep(boardId, step) {
  const current = readOnboarding(boardId);
  if (!current || current.done.includes(step)) return;
  writeOnboarding(boardId, { ...current, done: [...current.done, step] });
}

export function onboardingSteps(features, template) {
  const steps = [
    ['issue', 'Создайте первую задачу', 'Задачи — это работа, которую команда отслеживает в разделе.', null],
    ['team', 'Пригласите команду', 'Добавьте коллег, чтобы работать над задачами вместе.', '/teams'],
    ['workflow', 'Настройте workflow', 'Измените статусы и переходы под процесс вашей команды.', '/workflow'],
  ];
  if (features.includes('backlog') && template === 'scrum') steps.push(['sprint', 'Запустите спринт', 'Перенесите задачи из бэклога в спринт и начните работу.', '/backlog']);
  if (features.includes('list')) steps.push(['list', 'Откройте список', 'Все задачи раздела в одной таблице.', '/list']);
  if (features.includes('calendar')) steps.push(['calendar', 'Посмотрите календарь', 'Задачи со сроками появятся на календаре.', '/calendar']);
  if (features.includes('timeline')) steps.push(['timeline', 'Спланируйте на таймлайне', 'Создайте эпики и расставьте их по времени.', '/roadmap']);
  steps.push(['features', 'Выберите функции раздела', 'Включите или отключите представления, которые нужны команде.', '/features']);
  return steps;
}
