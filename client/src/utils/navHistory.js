import { useEffect, useState } from 'react';

const KEYS = {
  recentBoards: 'canban.nav.recentBoards',
  starredBoards: 'canban.nav.starredBoards',
  viewedIssues: 'canban.nav.viewedIssues',
};
const LIMITS = { recentBoards: 10, starredBoards: 50, viewedIssues: 50 };
const EVENT = 'canban-nav-history';

function read(kind) {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEYS[kind]) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(kind, list) {
  try {
    window.localStorage.setItem(KEYS[kind], JSON.stringify(list.slice(0, LIMITS[kind])));
  } catch {
    // Storage may be full or disabled (private mode); history is best-effort.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
}

function pushFront(kind, item) {
  if (!item?.id) return;
  write(kind, [{ ...item, at: Date.now() }, ...read(kind).filter((x) => x.id !== item.id)]);
}

export const getRecentBoards = () => read('recentBoards');
export const getStarredBoards = () => read('starredBoards');
export const getViewedIssues = () => read('viewedIssues');

export const rememberBoard = (board) => pushFront('recentBoards', board);
export const rememberIssue = (issue) => pushFront('viewedIssues', issue);

export function isBoardStarred(boardId) {
  return read('starredBoards').some((x) => x.id === boardId);
}

export function toggleStarredBoard(board) {
  const list = read('starredBoards');
  if (list.some((x) => x.id === board.id)) write('starredBoards', list.filter((x) => x.id !== board.id));
  else write('starredBoards', [{ ...board, at: Date.now() }, ...list]);
}

/** Re-renders on any history change (this tab or another one). */
export function useNavHistory() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onStorage = (e) => { if (Object.values(KEYS).includes(e.key)) bump(); };
    window.addEventListener(EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return { recentBoards: getRecentBoards(), starredBoards: getStarredBoards(), viewedIssues: getViewedIssues() };
}
