import { useEffect, useState } from 'react';

const KEYS = {
  recentBoards: 'canban.nav.recentBoards',
  starredBoards: 'canban.nav.starredBoards',
  viewedIssues: 'canban.nav.viewedIssues',
  starredFilters: 'canban.nav.starredFilters',
  recentDashboards: 'canban.nav.recentDashboards',
};
const LIMITS = { recentBoards: 10, starredBoards: 50, viewedIssues: 50, starredFilters: 50, recentDashboards: 10 };
const EVENT = 'canban-nav-history';

function currentUserId() {
  try {
    const user = JSON.parse(window.localStorage.getItem('user') || 'null');
    return user?.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

function storageKey(kind) {
  const userId = currentUserId();
  if (!userId) return null;
  const key = `${KEYS[kind]}.${userId}`;

  // Assign pre-upgrade browser history to the account that is active during
  // the upgrade. Removing the shared key prevents it leaking to another user.
  if (window.localStorage.getItem(key) === null) {
    const legacy = window.localStorage.getItem(KEYS[kind]);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(KEYS[kind]);
    }
  }
  return key;
}

function read(kind) {
  try {
    const key = storageKey(kind);
    if (!key) return [];
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(kind, list) {
  try {
    const key = storageKey(kind);
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, LIMITS[kind])));
  } catch {
    // Storage may be full or disabled (private mode); history is best-effort.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
}

function pushFront(kind, item) {
  if (!item?.id) return;
  write(kind, [{ ...item, at: Date.now() }, ...read(kind).filter((x) => x.id !== item.id)]);
}

function toggle(kind, item) {
  const list = read(kind);
  if (list.some((x) => x.id === item.id)) write(kind, list.filter((x) => x.id !== item.id));
  else write(kind, [{ ...item, at: Date.now() }, ...list]);
}

export const getRecentBoards = () => read('recentBoards');
export const getStarredBoards = () => read('starredBoards');
export const getCachedBoard = (boardId) => (
  getRecentBoards().find((board) => board.id === boardId)
  || getStarredBoards().find((board) => board.id === boardId)
  || null
);
export const getViewedIssues = () => read('viewedIssues');
export const getStarredFilters = () => read('starredFilters');
export const getRecentDashboards = () => read('recentDashboards');

export const rememberBoard = (board) => pushFront('recentBoards', board);
export const rememberIssue = (issue) => pushFront('viewedIssues', issue);
export const rememberDashboard = (dashboard) => pushFront('recentDashboards', dashboard);
export const forgetDashboard = (id) => write('recentDashboards', read('recentDashboards').filter((x) => x.id !== id));

export function resolveBoardHistory(history, availableBoards) {
  const byId = availableBoards instanceof Map
    ? availableBoards
    : new Map((availableBoards || []).map((board) => [board.id, board]));
  return (history || [])
    .filter((board) => board?.id)
    .map((board) => {
      const available = byId.get(board.id);
      if (available) return { ...board, ...available };
      return board.access === 'open' || board.access === 'limited' ? board : null;
    })
    .filter(Boolean);
}

export function isBoardStarred(boardId) {
  return read('starredBoards').some((x) => x.id === boardId);
}

export const toggleStarredBoard = (board) => toggle('starredBoards', board);
export const isFilterStarred = (filterId) => read('starredFilters').some((x) => x.id === filterId);
export const toggleStarredFilter = (filter) => toggle('starredFilters', filter);

/** Re-renders on any history change (this tab or another one). */
export function useNavHistory() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e) => {
      if (
        e.key === 'user'
        || Object.values(KEYS).some((key) => e.key === key || e.key?.startsWith(`${key}.`))
      ) bump();
    };
    window.addEventListener(EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return {
    recentBoards: getRecentBoards(),
    starredBoards: getStarredBoards(),
    viewedIssues: getViewedIssues(),
    starredFilters: getStarredFilters(),
    recentDashboards: getRecentDashboards(),
  };
}
