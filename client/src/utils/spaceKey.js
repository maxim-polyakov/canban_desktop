const TRANSLIT = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y', к: 'K', л: 'L', м: 'M',
  н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SH',
  ъ: '', ы: 'Y', ь: '', э: 'E', ю: 'YU', я: 'YA',
};

const latin = (word) => [...word.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch.toUpperCase()).join('').replace(/[^A-Z0-9]/g, '');

/** Jira-style key suggestion: initials for multi-word names, first letters for a single word. */
export function suggestSpaceKey(name) {
  const words = String(name || '').trim().split(/[\s\-_.]+/).map(latin).filter(Boolean);
  if (words.length === 0) return '';
  const key = words.length === 1 ? words[0].slice(0, 4) : words.map((w) => w[0]).join('').slice(0, 10);
  const safe = /^[A-Z]/.test(key) ? key : `K${key}`;
  return safe.length >= 2 ? safe : `${safe}${words[0].slice(1, 3)}`.slice(0, 10) || 'KAN';
}

export function isValidSpaceKey(key) {
  return /^[A-Z][A-Z0-9]{1,9}$/.test(key);
}
