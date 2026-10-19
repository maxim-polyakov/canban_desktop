const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(value, locale, now = Date.now()) {
  const time = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale || 'ru', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

/** Jira-style buckets for activity lists. */
export function dayBucket(value, now = new Date()) {
  const date = new Date(value);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return 'Сегодня';
  if (time >= startOfToday - 24 * 3600 * 1000) return 'Вчера';
  if (time >= startOfToday - 7 * 24 * 3600 * 1000) return 'На этой неделе';
  if (time >= startOfToday - 30 * 24 * 3600 * 1000) return 'В этом месяце';
  return 'Ранее';
}

export function groupByDay(items, getDate, now = new Date()) {
  const groups = [];
  for (const item of items) {
    const label = dayBucket(getDate(item), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
