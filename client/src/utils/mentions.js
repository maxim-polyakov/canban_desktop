const TOKEN = /@\[([^\]\r\n]{1,120})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

export const mentionToken = (member) => `@[${String(member.displayName || member.email || '').replace(/[[\]\r\n]/g, '').trim()}](${member.userId ?? member.id})`;

/** Splits text into plain strings and `{ name, id }` mentions. */
export function splitMentions(text) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) parts.push(source.slice(last, match.index));
    parts.push({ name: match[1], id: match[2] });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}

export const mentionsToPlainText = (text) => String(text ?? '').replace(TOKEN, '@$1');

/** The `@query` being typed right before the caret, or null. */
export function activeMention(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const match = before.match(/(^|[\s(])@([^\s@[\]()]{0,30})$/);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
}

export function mentionCandidates(members, query, limit = 6) {
  const needle = String(query || '').toLowerCase();
  return (members || [])
    .filter((m) => (m.userId ?? m.id) && (!needle
      || String(m.displayName || '').toLowerCase().split(/\s+/).some((word) => word.startsWith(needle))
      || String(m.displayName || '').toLowerCase().startsWith(needle)
      || String(m.email || '').toLowerCase().startsWith(needle)))
    .slice(0, limit);
}

/** Replaces the `@query` at `start` with the member's token; returns the new text and caret. */
export function insertMention(text, start, caret, member) {
  const token = `${mentionToken(member)} `;
  const source = String(text ?? '');
  return { text: source.slice(0, start) + token + source.slice(caret), caret: start + token.length };
}
