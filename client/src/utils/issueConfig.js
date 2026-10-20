import { useEffect, useState, useSyncExternalStore } from 'react';
import { issueConfig } from '../api.js';

export const FIELD_TYPES = [
  { value: 'text', label: 'Текст (одна строка)' },
  { value: 'paragraph', label: 'Абзац' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'select', label: 'Список (один вариант)' },
  { value: 'multiselect', label: 'Список (несколько вариантов)' },
  { value: 'cascading', label: 'Каскадный список' },
  { value: 'checkbox', label: 'Флажок' },
  { value: 'url', label: 'Ссылка' },
  { value: 'user', label: 'Пользователь' },
  { value: 'labels', label: 'Метки' },
  { value: 'version', label: 'Выбор версии (одна)' },
  { value: 'versions', label: 'Выбор версий (несколько)' },
  { value: 'group', label: 'Выбор группы (одна)' },
  { value: 'groups', label: 'Выбор групп (несколько)' },
];

export const OPTION_FIELD_TYPES = ['select', 'multiselect', 'cascading'];
export const MULTI_FIELD_TYPES = ['multiselect', 'versions', 'groups'];
/** Types whose default value can be set in a context. */
export const DEFAULT_VALUE_FIELD_TYPES = ['text', 'paragraph', 'number', 'date', 'select', 'multiselect', 'cascading', 'checkbox', 'url', 'labels', 'group', 'groups'];

const EMPTY_CONFIG = { types: [], fields: [], versions: [], groups: [] };

export const BASE_TYPES = [
  { value: 0, label: 'Эпик' },
  { value: 1, label: 'История' },
  { value: 2, label: 'Задача' },
  { value: 3, label: 'Ошибка' },
  { value: 4, label: 'Подзадача' },
];

const types = new Map();
const listeners = new Set();
let version = 0;
const boardCache = new Map();

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function rememberIssueTypes(list = []) {
  let changed = false;
  list.forEach((type) => {
    const previous = types.get(type.id);
    if (!previous || previous.name !== type.name || previous.icon !== type.icon || previous.color !== type.color || previous.baseType !== type.baseType) {
      types.set(type.id, type);
      changed = true;
    }
  });
  if (changed) emit();
}

export function forgetIssueType(id) {
  if (types.delete(id)) emit();
}

export function getCustomIssueType(id) {
  return id ? types.get(id) ?? null : null;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIssueTypeRegistry() {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

let catalogPromise = null;

export function loadIssueCatalog(force = false) {
  if (force || !catalogPromise) {
    catalogPromise = Promise.resolve().then(() => issueConfig.catalog()).then((catalog) => {
      rememberIssueTypes(catalog?.types || []);
      return catalog;
    }).catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export function loadBoardIssueConfig(boardId, force = false) {
  if (!boardId) return Promise.resolve(EMPTY_CONFIG);
  if (force || !boardCache.has(boardId)) {
    const promise = Promise.resolve().then(() => issueConfig.forBoard(boardId)).then((config) => {
      rememberIssueTypes(config?.types || []);
      return { types: config?.types || [], fields: config?.fields || [], versions: config?.versions || [], groups: config?.groups || [] };
    }).catch((error) => {
      boardCache.delete(boardId);
      throw error;
    });
    boardCache.set(boardId, promise);
  }
  return boardCache.get(boardId);
}

export function clearBoardIssueConfig() {
  boardCache.clear();
}

export function useBoardIssueConfig(boardId) {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  useEffect(() => {
    let cancelled = false;
    setConfig(EMPTY_CONFIG);
    loadBoardIssueConfig(boardId).then((value) => { if (!cancelled) setConfig(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, [boardId]);
  return config;
}

/** Type choice value: a custom type id or the base type number as a string. */
export function typeChoice(issueType, issueTypeId) {
  return issueTypeId || String(issueType ?? 2);
}

export function fieldApplies(field, issueType, issueTypeId) {
  if (!field.issueTypes?.length) return true;
  return field.issueTypes.includes(typeChoice(issueType, issueTypeId));
}

export function isEmptyValue(value) {
  return value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0);
}

/** Empty input value for a field type. */
export function emptyFieldValue(field) {
  if (MULTI_FIELD_TYPES.includes(field.fieldType) || field.fieldType === 'cascading') return [];
  if (field.fieldType === 'checkbox') return false;
  return '';
}

export function formatFieldValue(field, value, people = [], refs = {}) {
  if (isEmptyValue(value)) return '';
  if (field.fieldType === 'checkbox') return 'Да';
  if (field.fieldType === 'user') return people.find((p) => (p.userId ?? p.id) === value)?.displayName ?? value;
  if (field.fieldType === 'cascading') return [].concat(value).join(' → ');
  if (['version', 'versions', 'group', 'groups'].includes(field.fieldType)) {
    const list = field.fieldType.startsWith('version') ? refs.versions : refs.groups;
    return [].concat(value).map((id) => (list || []).find((x) => x.id === id)?.name ?? id).join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (field.fieldType === 'date') {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU');
  }
  return String(value);
}
